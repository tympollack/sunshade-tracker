import { supabaseAdmin } from '@/lib/db';
import {
  computeEfficiencyMetrics,
  EfficiencyMetricsPayload,
} from './valueLedgerService';

/**
 * Service function to load workspace metrics from the database and compute efficiency statement.
 * This is server-only and queries supabaseAdmin directly.
 */
export async function getTenantEfficiencyMetrics(
  tenantSlug: string
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

  if (tenantErr || !tenant) {
    throw new Error(tenantErr?.message || `Workspace "@${tenantSlug}" not found.`);
  }

  // 2. Fetch projects for this tenant
  let projectQuery: any = service
    .from('projects')
    .select('id, slug, name')
    .eq('tenant_id', tenant.id);

  if (typeof projectQuery.is === 'function') {
    projectQuery = projectQuery.is('deleted_at', null);
  }

  const { data: projects } = await projectQuery;
  const projectList = projects || [];

  // 3. Fetch items for this tenant
  let itemsQuery: any = service
    .from('work_items')
    .select('id, project_id, status')
    .eq('tenant_id', tenant.id);

  if (typeof itemsQuery.is === 'function') {
    itemsQuery = itemsQuery.is('deleted_at', null);
  }

  const { data: items } = await itemsQuery;
  const itemList = items || [];

  const completedCount = itemList.filter(
    (i: any) => String(i.status || '').toLowerCase() === 'complete'
  ).length;
  const totalItemsCount = itemList.length;

  // Active projects: projects with >= 1 item, or total projects if items are tracked across them
  const activeProjectIdsWithItems = new Set(
    itemList.map((i: any) => i.project_id).filter(Boolean)
  );
  const activeProjectsCount =
    activeProjectIdsWithItems.size > 0
      ? activeProjectIdsWithItems.size
      : projectList.length;

  return computeEfficiencyMetrics({
    tenantSlug: tenant.slug,
    tenantName: tenant.name,
    tier: tenant.tier,
    completedItemsCount: completedCount,
    activeProjectsCount,
    totalItemsCount,
    startDate: tenant.created_at || undefined,
  });
}
