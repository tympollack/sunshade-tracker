import { supabaseAdmin } from '@/lib/db';

export interface CalibratedWorkItem {
  id: string;
  externalRefId: string;
  title: string;
  itemType: string;
  status: string;
  storyPoints: number;
  isLeaf: boolean;
  plannedHours: number;
  actualHours: number;
  loggedHours: number;
  cycleTimeHours: number;
  timeSource: 'logged' | 'cycle_time' | 'none';
  varianceHours: number;
  varianceStatus: 'under' | 'within' | 'over';
  classification: 'planned_scope' | 'unplanned_churn';
  isChurn: boolean;
  churnReason?: string;
  completedAt: string | null;
  createdAt: string;
}

export interface ProjectCalibrationGroup {
  projectId: string;
  projectSlug: string;
  projectName: string;
  configuredRatio: number;
  isCustomRatio: boolean;
  totalItems: number;
  totalPoints: number;
  plannedHours: number;
  actualHours: number;
  varianceHours: number;
  empiricalRatio: number;
  predictabilityIndex: number;
  focusPercentage: number;
  plannedScopePoints: number;
  churnPoints: number;
  items: CalibratedWorkItem[];
}

export interface EstimationCalibrationPayload {
  tenant: {
    id: string;
    slug: string;
    name: string;
  };
  dateRange: {
    startDate: string;
    endDate: string;
    periodLabel?: string;
  };
  defaultVelocityRatio: number;
  simulatedVelocityRatio?: number;
  totalItems: number;
  totalPoints: number;
  totalPlannedHours: number;
  totalActualHours: number;
  totalVarianceHours: number;
  overallEmpiricalRatio: number;
  overallPredictabilityIndex: number;
  projects: ProjectCalibrationGroup[];
  generatedAt: string;
}

export interface CalibrationTelemetryOptions {
  startDate?: string;
  endDate?: string;
  periodLabel?: string;
  simulatedRatio?: number;
}

const DEFAULT_COMPLETION_STATUSES = new Set([
  'complete',
  'completed',
  'done',
  'closed',
  'resolved',
  'shipped',
  'approved',
  'published',
]);

/**
 * Core backend aggregation service calculating telemetric estimation calibration.
 * Compares planned envelopes (points * velocity ratio) against actual effort (time logs & cycle times).
 */
export async function getEstimationCalibrationTelemetry(
  tenantSlug: string,
  options?: CalibrationTelemetryOptions
): Promise<EstimationCalibrationPayload> {
  const service = supabaseAdmin;

  // 1. Fetch tenant with settings to resolve default velocity ratio
  let tenantQuery: any = service
    .from('tenants')
    .select('id, name, slug, settings, created_at')
    .eq('slug', tenantSlug);

  if (typeof tenantQuery.is === 'function') {
    tenantQuery = tenantQuery.is('deleted_at', null);
  }

  const { data: tenant, error: tenantErr } = await tenantQuery.maybeSingle();

  if (tenantErr) {
    throw new Error(`Database error fetching workspace "@${tenantSlug}": ${tenantErr.message}`);
  }

  if (!tenant) {
    throw new Error(`Workspace "@${tenantSlug}" not found.`);
  }

  // Velocity ratio resolution from tenant settings
  const defaultTenantRatio =
    typeof options?.simulatedRatio === 'number' && !isNaN(options.simulatedRatio) && options.simulatedRatio > 0
      ? options.simulatedRatio
      : Number(tenant.settings?.velocity_conversion?.default_hours_per_point) || 2.0;

  // 2. Fetch projects for this tenant
  let projectQuery: any = service
    .from('projects')
    .select('id, slug, name, settings')
    .eq('tenant_id', tenant.id);

  if (typeof projectQuery.is === 'function') {
    projectQuery = projectQuery.is('deleted_at', null);
  }

  const { data: projects, error: projErr } = await projectQuery;
  if (projErr) {
    throw new Error(`Failed to load projects for workspace: ${projErr.message}`);
  }

  const projectList = projects || [];
  const projectMap = new Map<string, any>();
  const projectCompletionMap = new Map<string, Set<string>>();

  for (const proj of projectList) {
    projectMap.set(proj.id, proj);
    const completionSet = new Set<string>(DEFAULT_COMPLETION_STATUSES);
    const statuses: Array<{ id?: string; label?: string }> = proj.settings?.statuses || [];
    for (const s of statuses) {
      const id = String(s.id || '').toLowerCase();
      const label = String(s.label || '').toLowerCase();
      if (DEFAULT_COMPLETION_STATUSES.has(id) || DEFAULT_COMPLETION_STATUSES.has(label)) {
        completionSet.add(id);
      }
    }
    if (statuses.length > 0) {
      const last = statuses[statuses.length - 1];
      if (last?.id) completionSet.add(String(last.id).toLowerCase());
    }
    projectCompletionMap.set(proj.id, completionSet);
  }

  // 3. Resolve reporting window
  const now = new Date();
  const startDate = options?.startDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const endDate = options?.endDate || new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();

  // 4. Fetch all work items for this tenant with pagination
  const allItems: any[] = [];
  const PAGE_SIZE = 1000;
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    let itemsQuery: any = service
      .from('work_items')
      .select('id, project_id, parent_id, external_ref_id, item_type, status, title, metadata, created_at, updated_at')
      .eq('tenant_id', tenant.id);

    if (typeof itemsQuery.is === 'function') {
      itemsQuery = itemsQuery.is('deleted_at', null);
    }

    if (typeof itemsQuery.range === 'function') {
      itemsQuery = itemsQuery.range(offset, offset + PAGE_SIZE - 1);
    }

    const { data: pageData, error: itemsErr } = await itemsQuery;
    if (itemsErr) {
      throw new Error(`Failed to load work items for workspace: ${itemsErr.message}`);
    }

    if (pageData && pageData.length > 0) {
      allItems.push(...pageData);
      if (pageData.length < PAGE_SIZE || typeof itemsQuery.range !== 'function') {
        hasMore = false;
      } else {
        offset += PAGE_SIZE;
      }
    } else {
      hasMore = false;
    }
  }

  // Identify parent IDs to determine leaf nodes
  const parentIdSet = new Set<string>();
  for (const itm of allItems) {
    if (itm.parent_id) {
      parentIdSet.add(itm.parent_id);
    }
  }

  // Find completed items candidates
  const completedCandidates = allItems.filter((item: any) => {
    const rawStatus = String(item.status || '').toLowerCase().trim();
    const allowed = (item.project_id && projectCompletionMap.get(item.project_id)) || DEFAULT_COMPLETION_STATUSES;
    return allowed.has(rawStatus);
  });

  // Query audit logs for status transition timestamps (in_progress & complete)
  const candidateIds = completedCandidates.map((c: any) => c.id);
  const auditCompletionMap = new Map<string, number>();
  const auditInProgressMap = new Map<string, number>();

  if (candidateIds.length > 0) {
    try {
      let auditQuery: any = service
        .from('audit_logs')
        .select('item_id, changed_fields, created_at')
        .eq('tenant_id', tenant.id)
        .in('item_id', candidateIds)
        .order('created_at', { ascending: false });

      const { data: logs } = await auditQuery;
      if (Array.isArray(logs)) {
        for (const log of logs) {
          const afterStatus = String(log.changed_fields?.status?.after || '').toLowerCase().trim();
          const item = completedCandidates.find((c: any) => c.id === log.item_id);
          const allowed = (item?.project_id && projectCompletionMap.get(item.project_id)) || DEFAULT_COMPLETION_STATUSES;
          const logTime = log.created_at ? new Date(log.created_at).getTime() : 0;

          if (allowed.has(afterStatus) && !auditCompletionMap.has(log.item_id) && logTime > 0) {
            auditCompletionMap.set(log.item_id, logTime);
          }

          if (
            (afterStatus === 'in_progress' || afterStatus === 'doing' || afterStatus === 'active') &&
            !auditInProgressMap.has(log.item_id) &&
            logTime > 0
          ) {
            auditInProgressMap.set(log.item_id, logTime);
          }
        }
      }
    } catch {
      // Fall through if audit_logs table is unavailable in mock
    }
  }

  function resolveItemCompletionTimestamp(item: any): number | null {
    if (item.metadata?.completed_at) {
      const ms = new Date(item.metadata.completed_at).getTime();
      if (!isNaN(ms)) return ms;
    }
    if (auditCompletionMap.has(item.id)) {
      return auditCompletionMap.get(item.id)!;
    }
    if (item.created_at) {
      const ms = new Date(item.created_at).getTime();
      if (!isNaN(ms)) return ms;
    }
    return null;
  }

  // Filter completed items strictly within reporting window [startMs, endMs]
  const completedInWindow = completedCandidates.filter((item: any) => {
    const compTime = resolveItemCompletionTimestamp(item);
    return compTime !== null && compTime >= startMs && compTime <= endMs;
  });

  const completedItemIds = completedInWindow.map((c: any) => c.id);

  // 5. Query logged time from tracker.work_item_time_logs
  const timeLogsMap = new Map<string, number>();
  if (completedItemIds.length > 0) {
    let timeLogQuery: any = service
      .from('work_item_time_logs')
      .select('work_item_id, duration_seconds')
      .eq('tenant_id', tenant.id)
      .in('work_item_id', completedItemIds);

    const { data: logs, error: logsErr } = await timeLogQuery;
    if (logsErr) {
      if (logsErr.code !== '42P01' && !logsErr.message?.includes('does not exist')) {
        throw new Error(`Failed to query work item time logs: ${logsErr.message}`);
      }
    }
    if (Array.isArray(logs)) {
      for (const log of logs) {
        const hours = (log.duration_seconds || 0) / 3600.0;
        timeLogsMap.set(log.work_item_id, (timeLogsMap.get(log.work_item_id) || 0) + hours);
      }
    }
  }

  // 6. Aggregate items per project
  const projectItemsMap = new Map<string, CalibratedWorkItem[]>();

  for (const item of completedInWindow) {
    const projId = item.project_id || 'unassigned';
    if (!projectItemsMap.has(projId)) {
      projectItemsMap.set(projId, []);
    }

    const isLeaf = !parentIdSet.has(item.id);
    const storyPoints = Number(
      item.metadata?.story_points ?? item.metadata?.points ?? item.metadata?.complexity ?? 0
    ) || 0;

    // Resolve project velocity ratio override
    const projRecord = projectMap.get(projId);
    const configuredRatio =
      typeof options?.simulatedRatio === 'number' && !isNaN(options.simulatedRatio) && options.simulatedRatio > 0
        ? options.simulatedRatio
        : Number(projRecord?.settings?.velocity_ratio) || defaultTenantRatio;

    // Planned hours: intrinsic points if leaf item, 0 if container to prevent double counting
    const plannedHours = isLeaf ? Math.round(storyPoints * configuredRatio * 100) / 100 : 0;

    // Actual hours: sum of manual time logs or fallback to cycle time
    const loggedHours = Math.round((timeLogsMap.get(item.id) || 0) * 100) / 100;

    // Cycle time fallback (only for leaf work items to avoid inflating container milestones)
    const compMs = resolveItemCompletionTimestamp(item) || Date.now();
    let inProgMs = auditInProgressMap.get(item.id);
    if (!inProgMs && item.metadata?.in_progress_at) {
      inProgMs = new Date(item.metadata.in_progress_at).getTime();
    }
    if (!inProgMs && item.created_at) {
      inProgMs = new Date(item.created_at).getTime();
    }
    const cycleTimeHours =
      isLeaf && inProgMs && compMs > inProgMs
        ? Math.round(((compMs - inProgMs) / (3600 * 1000)) * 100) / 100
        : 0;

    let actualHours = loggedHours;
    let timeSource: 'logged' | 'cycle_time' | 'none' = 'logged';

    if (actualHours <= 0) {
      if (cycleTimeHours > 0) {
        actualHours = cycleTimeHours;
        timeSource = 'cycle_time';
      } else {
        actualHours = 0;
        timeSource = 'none';
      }
    }

    // Variance calculations
    const varianceHours = Math.round((actualHours - plannedHours) * 100) / 100;
    let varianceStatus: 'under' | 'within' | 'over' = 'within';

    if (plannedHours > 0) {
      const diffPct = ((actualHours - plannedHours) / plannedHours) * 100;
      if (diffPct > 15) {
        varianceStatus = 'over';
      } else if (diffPct < -15) {
        varianceStatus = 'under';
      } else {
        varianceStatus = 'within';
      }
    } else if (actualHours > 0) {
      varianceStatus = 'over';
    }

    // Work Classification: planned_scope vs unplanned_churn
    const itemType = String(item.item_type || '').toLowerCase();
    const title = String(item.title || '').toLowerCase();
    const isBug =
      itemType === 'bug' ||
      title.includes('hotfix') ||
      title.includes('bug') ||
      title.includes('triage') ||
      item.metadata?.source_type === 'hotfix';

    const isExplicitUnplanned =
      Boolean(item.metadata?.unplanned) ||
      Boolean(item.metadata?.added_mid_sprint) ||
      Boolean(item.metadata?.churn) ||
      Boolean(item.metadata?.scope_churn) ||
      Boolean(item.metadata?.unplanned_churn);

    const isChurn = isExplicitUnplanned || isBug;

    const classification: 'planned_scope' | 'unplanned_churn' = isChurn ? 'unplanned_churn' : 'planned_scope';
    const churnReason = isBug
      ? 'bug_hotfix'
      : item.metadata?.added_mid_sprint
      ? 'added_mid_sprint'
      : item.metadata?.unplanned
      ? 'unplanned_triage'
      : isExplicitUnplanned
      ? 'scope_churn'
      : undefined;

    const completedAtStr = compMs ? new Date(compMs).toISOString() : null;

    projectItemsMap.get(projId)!.push({
      id: item.id,
      externalRefId: item.external_ref_id || item.id.slice(0, 8),
      title: item.title,
      itemType: item.item_type,
      status: item.status,
      storyPoints,
      isLeaf,
      plannedHours,
      actualHours,
      loggedHours,
      cycleTimeHours,
      timeSource,
      varianceHours,
      varianceStatus,
      classification,
      isChurn,
      churnReason,
      completedAt: completedAtStr,
      createdAt: item.created_at,
    });
  }

  // Calculate totals and group per project
  let totalWorkspaceActualHours = 0;
  for (const items of projectItemsMap.values()) {
    for (const itm of items) {
      totalWorkspaceActualHours += itm.actualHours;
    }
  }

  const projectGroups: ProjectCalibrationGroup[] = [];
  let totalWorkspacePoints = 0;
  let totalWorkspacePlannedHours = 0;
  let totalWorkspaceItems = 0;

  // Process all active projects that have items or exist in workspace
  const targetProjectIds = new Set<string>([...projectList.map((p: any) => p.id), ...projectItemsMap.keys()]);

  for (const projId of targetProjectIds) {
    const projRecord = projectMap.get(projId);
    const projItems = projectItemsMap.get(projId) || [];

    const isCustomRatio =
      projRecord?.settings?.velocity_ratio !== undefined &&
      projRecord?.settings?.velocity_ratio !== null;

    const configuredRatio =
      typeof options?.simulatedRatio === 'number' && !isNaN(options.simulatedRatio) && options.simulatedRatio > 0
        ? options.simulatedRatio
        : Number(projRecord?.settings?.velocity_ratio) || defaultTenantRatio;

    let projPoints = 0;
    let projPlannedHours = 0;
    let projActualHours = 0;
    let plannedScopePoints = 0;
    let churnPoints = 0;

    for (const itm of projItems) {
      if (itm.isLeaf) {
        projPoints += itm.storyPoints;
        if (itm.isChurn) {
          churnPoints += itm.storyPoints;
        } else {
          plannedScopePoints += itm.storyPoints;
        }
      }
      projPlannedHours += itm.plannedHours;
      projActualHours += itm.actualHours;
    }

    projPoints = Math.round(projPoints * 10) / 10;
    projPlannedHours = Math.round(projPlannedHours * 100) / 100;
    projActualHours = Math.round(projActualHours * 100) / 100;
    const varianceHours = Math.round((projActualHours - projPlannedHours) * 100) / 100;

    // Empirical calibration factor: k = actual_hours / delivered_points
    const empiricalRatio = projPoints > 0 ? Math.round((projActualHours / projPoints) * 100) / 100 : 0;

    // Predictability index: (actual / planned) * 100
    const predictabilityIndex =
      projPlannedHours > 0
        ? Math.round((projActualHours / projPlannedHours) * 100)
        : projActualHours === 0
        ? 100
        : Math.round(projActualHours * 100);

    const focusPercentage =
      totalWorkspaceActualHours > 0
        ? Math.round((projActualHours / totalWorkspaceActualHours) * 1000) / 10
        : 0;

    totalWorkspacePoints += projPoints;
    totalWorkspacePlannedHours += projPlannedHours;
    totalWorkspaceItems += projItems.length;

    projectGroups.push({
      projectId: projId,
      projectSlug: projRecord?.slug || 'default',
      projectName: projRecord?.name || 'Unassigned Project',
      configuredRatio,
      isCustomRatio,
      totalItems: projItems.length,
      totalPoints: projPoints,
      plannedHours: projPlannedHours,
      actualHours: projActualHours,
      varianceHours,
      empiricalRatio,
      predictabilityIndex,
      focusPercentage,
      plannedScopePoints,
      churnPoints,
      items: projItems,
    });
  }

  // Sort project groups by actual hours descending
  projectGroups.sort((a, b) => b.actualHours - a.actualHours || b.totalPoints - a.totalPoints);

  totalWorkspacePoints = Math.round(totalWorkspacePoints * 10) / 10;
  totalWorkspacePlannedHours = Math.round(totalWorkspacePlannedHours * 100) / 100;
  totalWorkspaceActualHours = Math.round(totalWorkspaceActualHours * 100) / 100;
  const totalVarianceHours = Math.round((totalWorkspaceActualHours - totalWorkspacePlannedHours) * 100) / 100;

  const overallEmpiricalRatio =
    totalWorkspacePoints > 0
      ? Math.round((totalWorkspaceActualHours / totalWorkspacePoints) * 100) / 100
      : 0;

  const overallPredictabilityIndex =
    totalWorkspacePlannedHours > 0
      ? Math.round((totalWorkspaceActualHours / totalWorkspacePlannedHours) * 100)
      : totalWorkspaceActualHours === 0
      ? 100
      : Math.round(totalWorkspaceActualHours * 100);

  return {
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
    },
    dateRange: {
      startDate,
      endDate,
      periodLabel: options?.periodLabel,
    },
    defaultVelocityRatio: defaultTenantRatio,
    simulatedVelocityRatio: options?.simulatedRatio,
    totalItems: totalWorkspaceItems,
    totalPoints: totalWorkspacePoints,
    totalPlannedHours: totalWorkspacePlannedHours,
    totalActualHours: totalWorkspaceActualHours,
    totalVarianceHours,
    overallEmpiricalRatio,
    overallPredictabilityIndex,
    projects: projectGroups,
    generatedAt: new Date().toISOString(),
  };
}
