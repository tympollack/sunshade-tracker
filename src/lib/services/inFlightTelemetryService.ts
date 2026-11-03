import { supabaseAdmin } from '@/lib/db';
import {
  ProjectSettings,
  WorkItem,
  resolveLiveDashboardSettings,
} from '@/types/tracker';
import { normalizeProjectSettings } from '@/lib/project-settings-utils';
import { resolveItemLifecycle } from './lifecycleNormalizer';
import {
  computeInFlightTelemetry,
  InFlightTelemetryPayload,
  ROLLING_THROUGHPUT_WINDOW_MS,
} from './inFlightTelemetryCore';

export * from './inFlightTelemetryCore';

/**
 * Pages through Supabase PostgREST queries in 1000-row chunks to avoid the default
 * 1000-row server cap on large workspaces. Falls back to direct await when `.range()`
 * is not implemented on test doubles.
 */
async function fetchAllRows<T = any>(queryBuilder: any): Promise<{ data: T[]; error: any }> {
  if (!queryBuilder) {
    return { data: [], error: null };
  }

  if (typeof queryBuilder.range !== 'function') {
    const res = await queryBuilder;
    if (res?.error) return { data: [], error: res.error };
    return { data: (res?.data || []) as T[], error: null };
  }

  const CHUNK_SIZE = 1000;
  const allData: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await queryBuilder.range(from, from + CHUNK_SIZE - 1);
    if (error) {
      return { data: allData, error };
    }
    if (!data || data.length === 0) {
      break;
    }
    allData.push(...data);
    if (data.length < CHUNK_SIZE) {
      hasMore = false;
    } else {
      from += CHUNK_SIZE;
    }
  }

  return { data: allData, error: null };
}

/**
 * Server-side service querying active in-flight items across all tenant projects
 * and computing blameless systemic flow telemetry.
 */
export async function getInFlightTelemetry(
  tenantSlug: string,
  options?: { nowMs?: number }
): Promise<InFlightTelemetryPayload> {
  const cleanSlug = tenantSlug.replace(/^@/, '').trim();

  // 1. Resolve tenant and workspace live dashboard settings
  const { data: tenant, error: tenantErr } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, name, settings, metadata')
    .eq('slug', cleanSlug)
    .is('deleted_at', null)
    .maybeSingle();

  if (tenantErr) {
    throw new Error(`Database error fetching tenant "@${cleanSlug}": ${tenantErr.message}`);
  }
  if (!tenant) {
    throw new Error(`Workspace "@${cleanSlug}" not found.`);
  }

  // 2. Fetch active projects and paginated work items in parallel
  const [projectsRes, itemsRes] = await Promise.all([
    supabaseAdmin
      .from('projects')
      .select('id, slug, name, settings, order_index')
      .eq('tenant_id', tenant.id)
      .is('deleted_at', null)
      .order('order_index', { ascending: true }),
    fetchAllRows<WorkItem>(
      supabaseAdmin
        .from('work_items')
        .select('*')
        .eq('tenant_id', tenant.id)
        .is('deleted_at', null)
        .order('order_index', { ascending: true })
    ),
  ]);

  if (projectsRes.error) {
    throw new Error(`Failed to fetch workspace projects: ${projectsRes.error.message}`);
  }
  if (itemsRes.error) {
    throw new Error(`Failed to fetch workspace work items: ${itemsRes.error.message}`);
  }

  const projects = projectsRes.data || [];
  const allItems = (itemsRes.data || []) as WorkItem[];

  // Build project map to classify item lifecycles before querying audit logs
  const projectMap = new Map<string, ProjectSettings>();
  for (const p of projects) {
    projectMap.set(p.id, normalizeProjectSettings(p.settings));
  }

  const nowMs = options?.nowMs ?? Date.now();

  // Include active in-flight items as well as terminal items edited within the last 24h
  // so audit transition timestamps accurately distinguish true completions from later title/metadata edits.
  const auditCandidateItems = allItems.filter((it) => {
    if (!it || it.deleted_at) return false;
    const stage = resolveItemLifecycle(it, projectMap.get(it.project_id));
    if (stage === 'execution' || stage === 'verification' || stage === 'staging') {
      return true;
    }
    if (stage === 'terminal') {
      const updatedMs = it.updated_at ? Date.parse(it.updated_at) : NaN;
      return !Number.isNaN(updatedMs) && nowMs - updatedMs <= ROLLING_THROUGHPUT_WINDOW_MS;
    }
    return false;
  });

  // 3. Query audit_logs for stage transition timestamps on active & recently-touched terminal items
  const stageEntryTimestamps = new Map<string, number>();
  if (auditCandidateItems.length > 0) {
    try {
      const candidateStatusById = new Map<string, string>(
        auditCandidateItems.map((it) => [it.id, String(it.status || '').trim().toLowerCase()])
      );
      const candidateIds = auditCandidateItems.map((it) => it.id);
      const { data: auditRows, error: auditErr } = await supabaseAdmin
        .from('audit_logs')
        .select('item_id, changed_fields, created_at')
        .eq('tenant_id', tenant.id)
        .in('item_id', candidateIds)
        .order('created_at', { ascending: false });

      if (!auditErr && Array.isArray(auditRows)) {
        for (const row of auditRows) {
          const afterStatus = String(row?.changed_fields?.status?.after || '')
            .trim()
            .toLowerCase();
          const currentStatus = row?.item_id ? candidateStatusById.get(row.item_id) : undefined;
          if (
            row.item_id &&
            !stageEntryTimestamps.has(row.item_id) &&
            afterStatus &&
            (!currentStatus || afterStatus === currentStatus) &&
            row.created_at
          ) {
            const ts = Date.parse(row.created_at);
            if (!Number.isNaN(ts)) {
              stageEntryTimestamps.set(row.item_id, ts);
            }
          }
        }
      }
    } catch {
      // Fallback to item.updated_at if audit_logs query is unavailable
    }
  }

  const mergedTenantSettings = resolveLiveDashboardSettings({
    ...(tenant.metadata || {}),
    ...(tenant.settings || {}),
  });

  return computeInFlightTelemetry({
    items: allItems,
    projects,
    stageEntryTimestamps,
    liveDashboardSettings: mergedTenantSettings,
    nowMs,
  });
}
