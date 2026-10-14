import { supabaseAdmin } from '@/lib/db';
import { WorkItem, SprintDefinition } from '@/types/tracker';
import { calculateSprintLeafPoints } from '@/lib/sprint-utils';
import {
  SprintScopeData,
  IntakeValidationOptions,
  IntakeValidationResult,
  validateSprintIntakePure,
  SprintGuardrailError,
} from './sprintGuardrailService';

export { SprintGuardrailError };
export type { SprintScopeData, IntakeValidationOptions, IntakeValidationResult };

/**
 * Server-side entry point for validateSprintIntake. Queries Supabase for tenant,
 * sprint definition, and current sprint work items, then evaluates sprint invariants.
 */
export async function validateSprintIntake(
  tenantSlug: string,
  sprintIdOrName: string,
  incomingItem: Partial<WorkItem> | any,
  options?: IntakeValidationOptions
): Promise<IntakeValidationResult> {
  const service = supabaseAdmin;

  // 1. Fetch tenant
  let tenantQuery: any = service
    .from('tenants')
    .select('id, slug, name')
    .eq('slug', tenantSlug);

  if (typeof tenantQuery.is === 'function') {
    tenantQuery = tenantQuery.is('deleted_at', null);
  }

  const { data: tenant, error: tenantErr } = await tenantQuery.maybeSingle();
  if (tenantErr || !tenant) {
    throw new Error(`Workspace "@${tenantSlug}" not found: ${tenantErr?.message || 'tenant null'}`);
  }

  // 2. Fetch sprint from tracker.sprints or tracker.projects.settings
  let sprintData: Partial<SprintScopeData> | null = null;

  // Attempt tracker.sprints table first
  try {
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sprintIdOrName);
    let sprintQuery: any = service
      .from('sprints')
      .select('*')
      .eq('tenant_id', tenant.id);

    if (isUuid) {
      sprintQuery = sprintQuery.eq('id', sprintIdOrName);
    } else {
      sprintQuery = sprintQuery.eq('name', sprintIdOrName);
    }

    const { data: dbSprint } = await sprintQuery.maybeSingle();

    if (dbSprint) {
      sprintData = {
        ...dbSprint,
        is_active: dbSprint.is_active ?? (dbSprint.status === 'active' || dbSprint.status === 'in_progress'),
      };
    }
  } catch {
    // tracker.sprints table may not exist yet in tests or legacy environments
  }

  // Fallback to project settings sprint_settings
  if (!sprintData) {
    let projQuery: any = service
      .from('projects')
      .select('id, name, slug, settings')
      .eq('tenant_id', tenant.id);

    if (typeof projQuery.is === 'function') {
      projQuery = projQuery.is('deleted_at', null);
    }

    const { data: projects } = await projQuery;
    for (const p of projects || []) {
      const sprints: SprintDefinition[] = p.settings?.sprint_settings?.sprints || [];
      const matched = sprints.find((s) => s.name === sprintIdOrName || s.id === sprintIdOrName);
      if (matched) {
        sprintData = {
          ...matched,
          project_id: p.id,
          is_active: matched.is_current || matched.status === 'active',
          started_at: (matched as any).started_at || matched.start_date,
          ends_at: (matched as any).ends_at || matched.end_date,
          committed_points: (matched as any).committed_points,
        };
        break;
      }
    }
  }

  // If sprint could not be found, default to non-active sprint object
  if (!sprintData) {
    sprintData = {
      id: sprintIdOrName,
      name: sprintIdOrName,
      status: 'planned',
      is_active: false,
    };
  }

  // 3. Fetch current work items in the sprint
  let itemsQuery: any = service
    .from('work_items')
    .select('*')
    .eq('tenant_id', tenant.id);

  if (sprintData?.project_id) {
    itemsQuery = itemsQuery.eq('project_id', sprintData.project_id);
  }

  if (typeof itemsQuery.is === 'function') {
    itemsQuery = itemsQuery.is('deleted_at', null);
  }

  const { data: allItems } = await itemsQuery;
  const currentSprintItems = (allItems || []).filter(
    (it: any) =>
      (!sprintData?.project_id || !it.project_id || it.project_id === sprintData.project_id) &&
      (it.metadata?.sprint === sprintData?.name ||
        it.metadata?.sprint_id === sprintData?.id ||
        it.metadata?.sprint === sprintIdOrName)
  );

  // 4. Resolve project settings to pass configured metric rules
  let projectSettings: any = null;
  if (sprintData?.project_id) {
    try {
      const { data: proj } = await service
        .from('projects')
        .select('settings')
        .eq('id', sprintData.project_id)
        .maybeSingle();
      projectSettings = proj?.settings;
    } catch {
      // Non-critical fallback
    }
  }

  const effectiveRules =
    projectSettings?.sprint_metrics ||
    projectSettings?.metric_rules ||
    projectSettings?.sprint_settings?.metric_rules ||
    projectSettings?.sprint_settings?.metrics ||
    options?.rules;

  const metricKey =
    projectSettings?.work_metric_config?.field_key ||
    projectSettings?.work_unit_field ||
    options?.metricKey;

  // 5. Calculate entering subtree leaf metric if incomingItem has active descendants
  let validatedIncomingItem = incomingItem;
  if (incomingItem?.id) {
    const isItemInTargetSprint = (it: any) => {
      if (!it) return false;
      const sprintIdentifier = sprintData?.id || sprintData?.name;
      const itSprint = it.metadata?.sprint || it.sprint_id || it.sprint;
      if (sprintIdentifier && (itSprint === sprintData?.id || itSprint === sprintData?.name)) {
        return true;
      }
      return (currentSprintItems || []).some(
        (cs: any) =>
          cs.id === it.id ||
          Boolean(it.external_ref_id && cs.external_ref_id === it.external_ref_id)
      );
    };

    const collectedDescendantIds = new Set<string>();
    const allDescendants: any[] = [];

    const collectDescendants = (parent: any) => {
      const parentId = parent.id;
      const parentExt = parent.external_ref_id;

      for (const it of allItems || []) {
        if (!it.id || collectedDescendantIds.has(it.id)) continue;
        if (
          it.id === incomingItem.id ||
          Boolean(incomingItem.external_ref_id && it.external_ref_id === incomingItem.external_ref_id)
        ) {
          continue;
        }

        const matchesParent =
          (parentId && it.parent_id === parentId) ||
          Boolean(parentExt && it.parent_id === parentExt);

        if (matchesParent) {
          collectedDescendantIds.add(it.id);
          allDescendants.push(it);
          collectDescendants(it);
        }
      }
    };

    collectDescendants(incomingItem);

    if (allDescendants.length > 0) {
      // Exclude descendants already in the target sprint so capacity is not double-counted
      const enteringDescendants = allDescendants.filter((d) => !isItemInTargetSprint(d));

      let subtreeLeafPoints = 0;
      if (enteringDescendants.length > 0) {
        const enteringSubtree = [incomingItem, ...enteringDescendants];
        subtreeLeafPoints = calculateSprintLeafPoints(enteringSubtree, metricKey || projectSettings);
      } else {
        // All child descendants already belong to the sprint; parent move adds 0 net points
        subtreeLeafPoints = 0;
      }

      const effectiveKey = metricKey || 'story_points';
      validatedIncomingItem = {
        ...incomingItem,
        metadata: {
          ...(incomingItem.metadata || {}),
          story_points: subtreeLeafPoints,
          [effectiveKey]: subtreeLeafPoints,
        },
      };
    }
  }

  return validateSprintIntakePure({
    sprint: sprintData,
    currentSprintItems,
    incomingItem: validatedIncomingItem,
    options: {
      ...options,
      metricKey,
    },
    rules: effectiveRules,
  });
}
