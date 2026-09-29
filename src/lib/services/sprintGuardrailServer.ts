import { supabaseAdmin } from '@/lib/db';
import { WorkItem, SprintDefinition } from '@/types/tracker';
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
    const { data: dbSprint } = await service
      .from('sprints')
      .select('*')
      .eq('tenant_id', tenant.id)
      .or(`name.eq.${sprintIdOrName},id.eq.${sprintIdOrName}`)
      .maybeSingle();

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

  if (typeof itemsQuery.is === 'function') {
    itemsQuery = itemsQuery.is('deleted_at', null);
  }

  const { data: allItems } = await itemsQuery;
  const currentSprintItems = (allItems || []).filter(
    (it: any) =>
      it.metadata?.sprint === sprintData?.name ||
      it.metadata?.sprint_id === sprintData?.id ||
      it.metadata?.sprint === sprintIdOrName
  );

  return validateSprintIntakePure({
    sprint: sprintData,
    currentSprintItems,
    incomingItem,
    options,
  });
}
