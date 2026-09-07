import { supabaseAdmin } from '@/lib/db';
import {
  computeEfficiencyMetrics,
  EfficiencyMetricsPayload,
} from './valueLedgerService';

export interface GetEfficiencyOptions {
  startDate?: string;
  endDate?: string;
  period?: 'monthly' | 'all-time';
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

  // 2. Fetch projects with settings to resolve dynamic completion status mappings
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
    startDate = options?.startDate || tenant.created_at || now.toISOString();
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
    .select('id, project_id, status, created_at, updated_at')
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

  // Evaluate completed items within the reporting period
  const completedCount = itemList.filter((item: any) => {
    const rawStatus = String(item.status || '').toLowerCase().trim();
    const allowedStatuses =
      (item.project_id && projectCompletionMap.get(item.project_id)) ||
      DEFAULT_COMPLETION_STATUSES;

    const isComplete = allowedStatuses.has(rawStatus);
    if (!isComplete) return false;

    // In monthly mode, filter completions by timestamp within the window
    if (!isAllTime) {
      const completionTime = item.updated_at
        ? new Date(item.updated_at).getTime()
        : item.created_at
        ? new Date(item.created_at).getTime()
        : null;

      if (completionTime !== null) {
        return completionTime >= startMs && completionTime <= endMs;
      }
    }

    return true;
  }).length;

  const totalItemsCount = itemList.length;

  // Active projects: only projects that have active work items
  const activeProjectIdsWithItems = new Set(
    itemList.map((i: any) => i.project_id).filter(Boolean)
  );
  const activeProjectsCount = activeProjectIdsWithItems.size;

  return computeEfficiencyMetrics({
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    tier: tenant.tier,
    completedItemsCount: completedCount,
    activeProjectsCount,
    totalItemsCount,
    startDate,
    endDate,
  });
}
