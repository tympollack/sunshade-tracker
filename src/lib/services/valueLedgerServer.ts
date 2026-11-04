import { supabaseAdmin } from '@/lib/db';
import {
  computeEfficiencyMetrics,
  EfficiencyMetricsPayload,
  hasVerifiableArtifactProof,
} from './valueLedgerService';

export interface GetEfficiencyOptions {
  startDate?: string;
  endDate?: string;
  period?: 'monthly' | 'all-time' | 'month' | 'quarter' | 'year' | 'week' | 'weekly' | 'custom';
  periodMultiplier?: number;
}

const DEFAULT_COMPLETION_STATUSES = new Set(['complete', 'completed', 'done', 'closed', 'resolved']);

/**
 * Service function to load workspace metrics from the database and compute efficiency statement.
 * This is server-only and queries supabaseAdmin directly.
 */
export async function getTenantEfficiencyMetrics(
  tenantSlug: string,
  options?: GetEfficiencyOptions
): Promise<EfficiencyMetricsPayload> {
  const service = supabaseAdmin;

  // 1. Fetch tenant
  let tenantQuery: any = service
    .from('tenants')
    .select('id, name, slug, tier, created_at')
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

  // 2. Fetch projects with settings to resolve dynamic completion status mappings and ledger mode
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

  // Build project-specific completion status lookup map
  const projectCompletionMap = new Map<string, Set<string>>();
  for (const proj of projectList) {
    const completionSet = new Set<string>(DEFAULT_COMPLETION_STATUSES);
    const statuses: Array<{ id?: string; label?: string }> = proj.settings?.statuses || [];
    for (const s of statuses) {
      const id = String(s.id || '').toLowerCase();
      const label = String(s.label || '').toLowerCase();
      if (
        DEFAULT_COMPLETION_STATUSES.has(id) ||
        DEFAULT_COMPLETION_STATUSES.has(label)
      ) {
        completionSet.add(id);
      }
    }
    // Also include the last status if it's the final column on the board
    if (statuses.length > 0) {
      const last = statuses[statuses.length - 1];
      if (last?.id) completionSet.add(String(last.id).toLowerCase());
    }
    projectCompletionMap.set(proj.id, completionSet);
  }

  // 3. Resolve reporting period window
  const now = new Date();
  const isAllTime = options?.period === 'all-time';

  let startDate: string;
  let endDate: string;

  if (isAllTime) {
    startDate = options?.startDate || tenant.created_at || new Date(0).toISOString();
    endDate = options?.endDate || now.toISOString();
  } else {
    // Current calendar month reporting window
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    startDate = options?.startDate || firstOfMonth.toISOString();
    endDate = options?.endDate || lastOfMonth.toISOString();
  }

  // 4. Fetch work items for this tenant
  let itemsQuery: any = service
    .from('work_items')
    .select('id, project_id, status, created_at, updated_at, metadata')
    .eq('tenant_id', tenant.id);

  if (typeof itemsQuery.is === 'function') {
    itemsQuery = itemsQuery.is('deleted_at', null);
  }

  const { data: items, error: itemsErr } = await itemsQuery;

  if (itemsErr) {
    throw new Error(`Failed to load work items for workspace: ${itemsErr.message}`);
  }

  const itemList = items || [];
  const startMs = new Date(startDate).getTime();
  const endMs = new Date(endDate).getTime();

  // Find candidate completed items by project status configuration
  const completedCandidates = itemList.filter((item: any) => {
    const rawStatus = String(item.status || '').toLowerCase().trim();
    const allowedStatuses =
      (item.project_id && projectCompletionMap.get(item.project_id)) ||
      DEFAULT_COMPLETION_STATUSES;
    return allowedStatuses.has(rawStatus);
  });

  // Query audit logs to resolve the actual timestamp of status transition into completion
  const auditTransitionMap = new Map<string, number>();
  if (completedCandidates.length > 0) {
    try {
      const candidateIds = completedCandidates.map((c: any) => c.id);
      let auditQuery: any = service
        .from('audit_logs')
        .select('item_id, changed_fields, created_at')
        .eq('tenant_id', tenant.id)
        .in('item_id', candidateIds)
        .order('created_at', { ascending: false });

      const { data: logs } = await auditQuery;
      if (Array.isArray(logs)) {
        for (const log of logs) {
          if (!auditTransitionMap.has(log.item_id) && log.changed_fields?.status?.after) {
            const afterStatus = String(log.changed_fields.status.after).toLowerCase().trim();
            const item = completedCandidates.find((c: any) => c.id === log.item_id);
            const allowed =
              (item?.project_id && projectCompletionMap.get(item.project_id)) ||
              DEFAULT_COMPLETION_STATUSES;
            if (allowed.has(afterStatus) && log.created_at) {
              auditTransitionMap.set(log.item_id, new Date(log.created_at).getTime());
            }
          }
        }
      }
    } catch {
      // Fall through to metadata / creation timestamps if audit logs query fails or is not mocked
    }
  }

  function getCompletionTimestamp(item: any): number | null {
    // 1. Dedicated completed_at in metadata
    if (item.metadata?.completed_at) {
      const ms = new Date(item.metadata.completed_at).getTime();
      if (!isNaN(ms)) return ms;
    }

    // 2. Transition into completion status from audit trail
    if (auditTransitionMap.has(item.id)) {
      return auditTransitionMap.get(item.id)!;
    }

    // 3. Fallback: item created directly in completion status or legacy record
    // We intentionally do not use general updated_at because unrelated edits shift completed items
    if (item.created_at) {
      const ms = new Date(item.created_at).getTime();
      if (!isNaN(ms)) return ms;
    }

    return null;
  }

  // Filter completed items strictly within [startMs, endMs]
  const completedCount = completedCandidates.filter((item: any) => {
    const completionTime = getCompletionTimestamp(item);
    if (completionTime !== null) {
      return completionTime >= startMs && completionTime <= endMs;
    }
    return false;
  }).length;

  const totalItemsCount = itemList.length;

  // Build project-specific ledger mode lookup map
  const projectLedgerModeMap = new Map<string, any>();
  for (const proj of projectList) {
    const mode = proj.settings?.ledger_mode || (proj as any).ledger_mode || 'standard_workspace';
    projectLedgerModeMap.set(proj.id, mode);
  }

  // Map candidate items completed within the period window with resolved ledger modes
  const periodItems = itemList
    .filter((item: any) => {
      const allowed =
        (item.project_id && projectCompletionMap.get(item.project_id)) ||
        DEFAULT_COMPLETION_STATUSES;
      const rawStatus = String(item.status || '').toLowerCase().trim();
      const isCandidate = allowed.has(rawStatus);
      const completionTime = isCandidate ? getCompletionTimestamp(item) : null;
      return completionTime !== null && completionTime >= startMs && completionTime <= endMs;
    })
    .map((item: any) => ({
      id: item.id,
      project_id: item.project_id,
      project_ledger_mode: projectLedgerModeMap.get(item.project_id) || 'standard_workspace',
      status: 'complete',
      is_completed: true,
      metadata: item.metadata || {},
      created_at: item.created_at,
      updated_at: item.updated_at,
      assignee: item.assignee,
      assignee_id: item.assignee_id,
    }));

  // Count verified completed items per project in the reporting period
  const projectVerifiedMap = new Map<string, number>();
  for (const item of periodItems) {
    if (item.project_ledger_mode === 'personal_organizer') continue;
    const proof = hasVerifiableArtifactProof(item);
    if (proof.hasArtifactProof) {
      projectVerifiedMap.set(item.project_id, (projectVerifiedMap.get(item.project_id) || 0) + 1);
    }
  }

  // Projects qualifying for hierarchical status rollup: non-personal and >= 3 verified completed items
  const qualifyingProjectIds = new Set<string>();
  for (const [projId, count] of projectVerifiedMap.entries()) {
    if (count >= 3) {
      qualifyingProjectIds.add(projId);
    }
  }

  // Active projects and active project-months tracking (BUG-TRK-PROJECT-MONTH-SCALING)
  // Track distinct calendar months (YYYY-MM) in which projects had activity within the window.
  const allActiveProjectsMap = new Map<string, Set<string>>();
  const qualifyingProjectActiveMonthsMap = new Map<string, Set<string>>();

  for (const item of itemList) {
    const projId = item.project_id;
    if (!projId) continue;
    const ledgerMode = projectLedgerModeMap.get(projId);
    if (ledgerMode === 'personal_organizer') continue;

    const createdMs = item.created_at ? new Date(item.created_at).getTime() : 0;
    const updatedMs = item.updated_at ? new Date(item.updated_at).getTime() : 0;
    const completedMs = getCompletionTimestamp(item) || 0;

    const timestamps = [createdMs, updatedMs, completedMs].filter(
      (ts) => ts > 0 && ts >= startMs && ts <= endMs
    );

    if (timestamps.length > 0) {
      if (!allActiveProjectsMap.has(projId)) {
        allActiveProjectsMap.set(projId, new Set<string>());
      }
      const allMonths = allActiveProjectsMap.get(projId)!;
      for (const ts of timestamps) {
        allMonths.add(new Date(ts).toISOString().slice(0, 7));
      }

      if (qualifyingProjectIds.has(projId)) {
        if (!qualifyingProjectActiveMonthsMap.has(projId)) {
          qualifyingProjectActiveMonthsMap.set(projId, new Set<string>());
        }
        const qMonths = qualifyingProjectActiveMonthsMap.get(projId)!;
        for (const ts of timestamps) {
          qMonths.add(new Date(ts).toISOString().slice(0, 7));
        }
      }
    }
  }

  const activeProjectsCount = allActiveProjectsMap.size;
  const qualifyingProjectsCount = qualifyingProjectActiveMonthsMap.size;

  let totalQualifyingProjectMonths = 0;
  for (const monthsSet of qualifyingProjectActiveMonthsMap.values()) {
    totalQualifyingProjectMonths += monthsSet.size;
  }

  // Determine multiplier for period if specified or custom
  let periodMultiplier = options?.periodMultiplier;
  if (!periodMultiplier) {
    if (options?.period === 'quarter') periodMultiplier = 3;
    else if (options?.period === 'year') periodMultiplier = 12;
    else if (options?.period === 'monthly' || options?.period === 'month') periodMultiplier = 1;
    else if (options?.period === 'week' || options?.period === 'weekly') periodMultiplier = 0.25;
  }

  // Scale projectMonths strictly for qualifying commercial projects (>= 3 verified items)
  const effectiveProjectMonths =
    qualifyingProjectsCount === 0
      ? 0
      : periodMultiplier !== undefined && periodMultiplier < 1
      ? Number((qualifyingProjectsCount * periodMultiplier).toFixed(2))
      : totalQualifyingProjectMonths;

  return computeEfficiencyMetrics({
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    tier: tenant.tier,
    completedItemsCount: completedCount,
    activeProjectsCount,
    totalItemsCount,
    items: periodItems,
    startDate,
    endDate,
    periodMultiplier,
    projectMonths: effectiveProjectMonths,
  });
}
