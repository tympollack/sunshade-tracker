import { supabaseAdmin } from '@/lib/db';
import {
  computeSprintAnalytics,
  SprintHealthReport,
  HistoricalSprint,
  COMPLETED_STATUSES,
} from './sprintAnalyticsService';
import { SprintDefinition, WorkItem } from '@/types/tracker';
import { calculateSprintLeafPoints } from '@/lib/sprint-utils';

/**
 * Server-only service querying Supabase to build enterprise sprint velocity and KPI telemetry.
 */
export async function getSprintHealthReport(
  tenantSlug: string,
  sprintIdOrName: string,
  now?: Date | string | number
): Promise<SprintHealthReport> {
  const service = supabaseAdmin;

  // 1. Fetch tenant context
  let tenantQuery: any = service
    .from('tenants')
    .select('id, name, slug, tier')
    .eq('slug', tenantSlug);

  if (typeof tenantQuery.is === 'function') {
    tenantQuery = tenantQuery.is('deleted_at', null);
  }

  const { data: tenant, error: tenantErr } = await tenantQuery.maybeSingle();

  if (tenantErr || !tenant) {
    throw new Error(`Workspace "@${tenantSlug}" not found: ${tenantErr?.message || 'tenant null'}`);
  }

  // 2. Resolve Target Sprint from tracker.sprints table or projects.settings
  let targetSprint: any = null;
  let targetProjectId: string | null = null;

  // Check tracker.sprints table first
  try {
    const { data: dbSprint } = await service
      .from('sprints')
      .select('*')
      .eq('tenant_id', tenant.id)
      .or(`id.eq.${sprintIdOrName},name.eq.${sprintIdOrName}`)
      .maybeSingle();

    if (dbSprint) {
      targetSprint = dbSprint;
      targetProjectId = dbSprint.project_id;
    }
  } catch {
    // Sprints table may not exist in all test environments
  }

  // Query projects for sprint settings and fallback lookup
  let projQuery: any = service
    .from('projects')
    .select('id, name, slug, settings')
    .eq('tenant_id', tenant.id);

  if (typeof projQuery.is === 'function') {
    projQuery = projQuery.is('deleted_at', null);
  }

  const { data: projects } = await projQuery;
  const projectList: any[] = projects || [];

  if (!targetSprint) {
    for (const p of projectList) {
      const sprints: SprintDefinition[] = p.settings?.sprint_settings?.sprints || [];
      const found = sprints.find((s) => s.id === sprintIdOrName || s.name === sprintIdOrName);
      if (found) {
        targetSprint = {
          id: found.id,
          name: found.name,
          status: found.status,
          is_active: found.status === 'active' || found.is_current,
          started_at: (found as any).started_at || found.start_date,
          ends_at: (found as any).ends_at || found.end_date,
          committed_points: (found as any).committed_points,
          metadata: (found as any).metadata || {},
        };
        targetProjectId = p.id;
        break;
      }
    }
  }

  // If sprint is still not found, construct a fallback
  if (!targetSprint) {
    targetSprint = {
      id: sprintIdOrName,
      name: sprintIdOrName,
      status: 'active',
      is_active: true,
      committed_points: 0,
    };
  }

  // 3. Query closed historical sprints ordered by ends_at DESC LIMIT 3
  const historicalSprints: HistoricalSprint[] = [];

  // Attempt tracker.sprints table query
  try {
    let closedQuery: any = service
      .from('sprints')
      .select('id, name, status, ends_at, committed_points, project_id')
      .eq('tenant_id', tenant.id)
      .in('status', ['completed', 'closed', 'finished'])
      .neq('id', targetSprint.id)
      .neq('name', targetSprint.name)
      .order('ends_at', { ascending: false })
      .limit(3);

    if (targetProjectId) {
      closedQuery = closedQuery.eq('project_id', targetProjectId);
    }

    const { data: dbClosed } = await closedQuery;
    if (dbClosed && dbClosed.length > 0) {
      for (const s of dbClosed) {
        historicalSprints.push({
          id: s.id,
          name: s.name,
          completed_points: (s as any).completed_points ? Number((s as any).completed_points) : 0,
          committed_points: Number(s.committed_points) || 0,
          ends_at: s.ends_at,
        });
      }
    }
  } catch {
    // Sprints table query fallback
  }

  // Supplement from project settings if fewer than 3 found
  if (historicalSprints.length < 3) {
    const candidateSettingsSprints: SprintDefinition[] = [];
    const relevantProjects = targetProjectId
      ? projectList.filter((p: any) => p.id === targetProjectId)
      : projectList;

    for (const p of relevantProjects) {
      const sprints: SprintDefinition[] = p.settings?.sprint_settings?.sprints || [];
      for (const s of sprints) {
        if (
          s.status === 'completed' &&
          s.id !== targetSprint.id &&
          s.name !== targetSprint.name &&
          !historicalSprints.some((h) => h.id === s.id || h.name === s.name)
        ) {
          candidateSettingsSprints.push(s);
        }
      }
    }

    // Sort by end_date DESC
    candidateSettingsSprints.sort((a, b) => {
      const tA = new Date((a as any).ends_at || a.end_date || 0).getTime();
      const tB = new Date((b as any).ends_at || b.end_date || 0).getTime();
      return tB - tA;
    });

    for (const s of candidateSettingsSprints) {
      if (historicalSprints.length >= 3) break;
      historicalSprints.push({
        id: s.id,
        name: s.name,
        completed_points: (s as any).completed_points ?? 0,
        committed_points: (s as any).committed_points ?? 0,
        ends_at: (s as any).ends_at || s.end_date,
      });
    }
  }

  // 4. Fetch work items to populate completed_points for historical sprints missing point aggregates
  let itemsQuery: any = service
    .from('work_items')
    .select('id, project_id, status, title, item_type, metadata, created_at, updated_at')
    .eq('tenant_id', tenant.id);

  if (targetProjectId) {
    itemsQuery = itemsQuery.eq('project_id', targetProjectId);
  }

  if (typeof itemsQuery.is === 'function') {
    itemsQuery = itemsQuery.is('deleted_at', null);
  }

  const { data: allItems } = await itemsQuery;
  const itemList: WorkItem[] = allItems || [];

  // Compute completed points for historical sprints if completed_points was 0
  for (const h of historicalSprints) {
    if (h.completed_points === 0) {
      const sprintItems = itemList.filter(
        (it) =>
          (!targetProjectId || !it.project_id || it.project_id === targetProjectId) &&
          (it.metadata?.sprint === h.name || it.metadata?.sprint_id === h.id)
      );
      const completedItems = sprintItems.filter((it) => {
        const st = String(it.status || '').toLowerCase().trim();
        return COMPLETED_STATUSES.has(st);
      });
      h.completed_points = calculateSprintLeafPoints(completedItems);
    }
  }

  // 5. Filter items for current target sprint
  const targetSprintItems = itemList.filter(
    (it) =>
      (!targetProjectId || !it.project_id || it.project_id === targetProjectId) &&
      (it.metadata?.sprint === targetSprint.name ||
        it.metadata?.sprint_id === targetSprint.id ||
        it.metadata?.sprint === sprintIdOrName)
  );

  // 6. Run pure telemetry aggregation
  return computeSprintAnalytics({
    sprint: targetSprint,
    historicalSprints,
    items: targetSprintItems,
    now,
  });
}
