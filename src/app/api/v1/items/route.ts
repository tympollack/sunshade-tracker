import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';
import { calculateOrderIndex, validateHierarchyNesting } from '@/lib/fractional-index';
import { WorkItem, WorkItemWithChildren } from '@/types/tracker';
import { mergeProjectStatuses } from '@/lib/portfolio-merge';
import {
  handleBulkGetItems,
  handleBulkCreateItems,
  handleBulkUpdateItems,
  handleBulkDeleteItems,
} from '@/lib/bulk-items';
import { recordAuditLog, computeChangedFields } from '@/lib/audit-log';
import { dispatchItemNotifications, resolveRecipient } from '@/lib/notifications';
import { deriveProjectPrefix, generateNextSequentialRef } from '@/lib/ref-generator';
import {
  isItemImmutableDueToCompletedSprint,
  getCompletedStatusSet,
  isItemCompleted,
} from '@/lib/sprint-utils';
import { getDescendantIds } from '@/lib/tree';

/**
 * Automatically pages through Supabase PostgREST queries in 1000-row chunks
 * to bypass the default 1000-row ceiling. Falls back to direct awaiting if .range()
 * is not supported (e.g. in unit test mock environments).
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
  let allData: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const chunkQuery = queryBuilder.range(from, from + CHUNK_SIZE - 1);
    const { data, error } = await chunkQuery;
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
 * Resolves a sprint target string (either UUID or name) to a Set of matching
 * identifiers across relational tracker.sprints and project settings.
 */
async function resolveSprintIdentifiers(
  tenantId: string,
  targetSprint: string,
  projectId?: string,
  projectSettings?: any
): Promise<Set<string>> {
  const ids = new Set<string>([targetSprint]);
  try {
    const sprintTable = supabaseAdmin.from('sprints');
    if (sprintTable && typeof sprintTable.select === 'function') {
      let query: any = sprintTable.select('id, name').eq('tenant_id', tenantId);
      if (projectId && typeof query.eq === 'function') {
        query = query.eq('project_id', projectId);
      }
      if (typeof query.or === 'function') {
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetSprint);
        if (isUuid) {
          query = query.or(`id.eq.${targetSprint},name.eq."${targetSprint.replace(/"/g, '\\"')}"`);
        } else {
          // Double-quote PostgREST string literal to allow punctuated names (e.g. "Sprint (Q4)") while escaping internal quotes
          const escaped = targetSprint.replace(/"/g, '\\"');
          query = query.or(`id.eq."${escaped}",name.eq."${escaped}"`);
        }
      }
      const res = await query;
      if (Array.isArray(res?.data)) {
        res.data.forEach((r: any) => {
          if (r.id) ids.add(String(r.id));
          if (r.name) ids.add(String(r.name));
        });
      }
    }
  } catch {
    // Non-fatal, check project settings sprints
  }

  // Check project settings sprint definitions
  const settingsSprints = projectSettings?.sprint_settings?.sprints;
  if (Array.isArray(settingsSprints)) {
    settingsSprints.forEach((s: any) => {
      if (s.id === targetSprint || s.name === targetSprint) {
        if (s.id) ids.add(String(s.id));
        if (s.name) ids.add(String(s.name));
      }
    });
  }

  return ids;
}

function isItemInTargetSprint(it: WorkItem, targetSet: Set<string>): boolean {
  const sprintName = it.metadata?.sprint;
  const sprintId = it.metadata?.sprint_id;
  return Boolean(
    (sprintName && targetSet.has(sprintName)) ||
    (sprintId && targetSet.has(sprintId))
  );
}

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  const { searchParams } = new URL(req.url);
  const itemIdParam = searchParams.get('id');
  const idsParam = searchParams.get('ids');
  const projectSlug = searchParams.get('project_slug');
  const projectIdParam = searchParams.get('project_id');
  const allProjectsParam = searchParams.get('all_projects') === 'true';
  const format = searchParams.get('format') || 'flat'; // 'flat' | 'tree' | 'board'
  const statusFilter = searchParams.get('status');
  const typeFilter = searchParams.get('item_type');
  const updatedSince = searchParams.get('updated_since');
  const includeColdArchive = searchParams.get('include_cold_archive') === 'true';
  const sprintIdParam = searchParams.get('sprint_id');
  const sprintParam = searchParams.get('sprint');
  const targetSprint = sprintIdParam || sprintParam;
  const ifModifiedSince = req.headers.get('if-modified-since');

  // 1a. Bulk Items by IDs lookup
  if (idsParam) {
    const ids = idsParam.split(',').map((s) => s.trim()).filter(Boolean);
    const bulkRes = await handleBulkGetItems(authCtx.tenant.id, { ids });
    if (!bulkRes.success) {
      return NextResponse.json({ error: bulkRes.error }, { status: bulkRes.status || 400 });
    }
    return NextResponse.json({
      workspace: { id: authCtx.tenant.id, slug: authCtx.tenant.slug, name: authCtx.tenant.name },
      count: bulkRes.count,
      items: bulkRes.items,
    });
  }

  // 1b. Single Item by ID lookup
  if (itemIdParam) {
    let itemQuery: any = supabaseAdmin
      .from('work_items')
      .select('*')
      .eq('tenant_id', authCtx.tenant.id)
      .eq('id', itemIdParam);

    if (typeof itemQuery.is === 'function') {
      itemQuery = itemQuery.is('deleted_at', null);
    }

    const { data: item, error: itemErr } = await itemQuery.single();
    if (itemErr || !item) {
      return NextResponse.json({ error: 'Work item not found' }, { status: 404 });
    }
    return NextResponse.json({ item });
  }

  // 2. All projects / Workspace-wide portfolio querying
  let isPortfolio = allProjectsParam;
  if (!isPortfolio && (projectSlug === 'all' || projectSlug === 'portfolio')) {
    const checkSlug = projectSlug;
    let checkQuery: any = supabaseAdmin
      .from('projects')
      .select('id')
      .eq('tenant_id', authCtx.tenant.id)
      .eq('slug', checkSlug);

    if (typeof checkQuery.is === 'function') {
      checkQuery = checkQuery.is('deleted_at', null);
    }

    const { data: projectNamedSentinel } =
      typeof checkQuery.maybeSingle === 'function'
        ? await checkQuery.maybeSingle()
        : typeof checkQuery.single === 'function'
        ? await checkQuery.single().catch(() => ({ data: null }))
        : { data: null };

    if (!projectNamedSentinel) {
      isPortfolio = true;
    }
  }

  if (isPortfolio) {
    // Fast HTTP 304 Evaluation & Latest Touch query for portfolio
    let touchQuery: any = supabaseAdmin
      .from('work_items')
      .select('updated_at')
      .eq('tenant_id', authCtx.tenant.id);

    if (typeof touchQuery.order === 'function') {
      touchQuery = touchQuery.order('updated_at', { ascending: false });
    }
    if (typeof touchQuery.limit === 'function') {
      touchQuery = touchQuery.limit(1);
    }

    let touchData: any = null;
    if (typeof touchQuery.maybeSingle === 'function') {
      const res = await touchQuery.maybeSingle();
      touchData = res?.data;
    } else if (typeof touchQuery.single === 'function') {
      const res = await touchQuery.single().catch(() => ({ data: null }));
      touchData = res?.data;
    } else if (typeof touchQuery.then === 'function') {
      const res = await touchQuery.catch(() => ({ data: null }));
      touchData = Array.isArray(res?.data) ? res.data[0] : res?.data;
    }

    // Check projects updated_at as well for schema/status changes
    let projTouchQuery: any = supabaseAdmin
      .from('projects')
      .select('updated_at')
      .eq('tenant_id', authCtx.tenant.id);
    if (typeof projTouchQuery.order === 'function') projTouchQuery = projTouchQuery.order('updated_at', { ascending: false });
    if (typeof projTouchQuery.limit === 'function') projTouchQuery = projTouchQuery.limit(1);
    const { data: projTouchData } = typeof projTouchQuery.maybeSingle === 'function'
      ? await projTouchQuery.maybeSingle()
      : typeof projTouchQuery.single === 'function'
      ? await projTouchQuery.single().catch(() => ({ data: null }))
      : { data: null };

    const projMs = projTouchData?.updated_at ? new Date(projTouchData.updated_at).getTime() : 0;
    const itemMs = touchData?.updated_at ? new Date(touchData.updated_at).getTime() : 0;
    const maxPortfolioTouchMs = Math.max(projMs, itemMs);
    const latestTouch = maxPortfolioTouchMs > 0 ? new Date(maxPortfolioTouchMs) : new Date();
    const latestPortfolioItemAt = itemMs > 0 ? new Date(itemMs).toISOString() : new Date().toISOString();

    const responseHeaders: Record<string, string> = {
      'Last-Modified': latestTouch.toUTCString(),
      'Cache-Control': 'private, no-cache',
    };

    // Build project completion sets for workspace projects to support custom completion statuses
    const projectCompletionMap = new Map<string, Set<string>>();
    const activeSprintsByProject = new Map<string, Set<string>>();
    let earliestActiveSprintStartMs: number | null = null;

    try {
      const projTable = supabaseAdmin.from('projects');
      if (projTable && typeof projTable.select === 'function') {
        let projsQuery: any = projTable.select('id, settings').eq('tenant_id', authCtx.tenant.id);
        if (typeof projsQuery.is === 'function') {
          projsQuery = projsQuery.is('deleted_at', null);
        }
        const { data: tenantProjects } = await projsQuery;
        if (Array.isArray(tenantProjects)) {
          tenantProjects.forEach((p: any) => {
            projectCompletionMap.set(p.id, getCompletedStatusSet(p.settings?.statuses));
            const settingsSprints = p.settings?.sprint_settings?.sprints;
            if (Array.isArray(settingsSprints)) {
              const projSet = activeSprintsByProject.get(p.id) || new Set<string>();
              settingsSprints.forEach((s: any) => {
                if (s.status === 'active' || s.is_active || s.is_current) {
                  if (s.id) projSet.add(String(s.id));
                  if (s.name) projSet.add(String(s.name));
                }
              });
              activeSprintsByProject.set(p.id, projSet);
            }
          });
        }
      }
    } catch {
      // Non-fatal, fallback to default completed statuses
    }

    try {
      const sprintTable = supabaseAdmin.from('sprints');
      if (sprintTable && typeof sprintTable.select === 'function') {
        let sprintQuery: any = sprintTable
          .select('id, name, project_id, started_at, created_at, status, is_active')
          .eq('tenant_id', authCtx.tenant.id);

        if (typeof sprintQuery.or === 'function') {
          sprintQuery = sprintQuery.or('status.eq.active,is_active.eq.true');
        }

        const { data: activeSprintRows } = await sprintQuery;
        if (activeSprintRows && Array.isArray(activeSprintRows)) {
          activeSprintRows.forEach((s: any) => {
            if (s.project_id) {
              const projSet = activeSprintsByProject.get(s.project_id) || new Set<string>();
              if (s.id) projSet.add(String(s.id));
              if (s.name) projSet.add(String(s.name));
              activeSprintsByProject.set(s.project_id, projSet);
            }
            const sTime = s.started_at ? new Date(s.started_at).getTime() : new Date(s.created_at).getTime();
            if (!isNaN(sTime)) {
              if (earliestActiveSprintStartMs === null || sTime < earliestActiveSprintStartMs) {
                earliestActiveSprintStartMs = sTime;
              }
            }
          });
        }
      }
    } catch {
      // Non-fatal, fallback to default cadence
    }

    const defaultNonSprintPortfolioCutoffMs = Date.now() - 14 * 24 * 60 * 60 * 1000;
    const DEFAULT_PORTFOLIO_CADENCE_MS = 90 * 24 * 60 * 60 * 1000;
    let totalActiveSprintsCount = 0;
    activeSprintsByProject.forEach((set) => {
      totalActiveSprintsCount += set.size;
    });
    const portfolioCadenceCutoffMs = earliestActiveSprintStartMs !== null
      ? earliestActiveSprintStartMs
      : totalActiveSprintsCount > 0
      ? Date.now() - DEFAULT_PORTFOLIO_CADENCE_MS
      : defaultNonSprintPortfolioCutoffMs;

    const isPortfolioItemCold = (it: WorkItem): boolean => {
      const completionSet = it.project_id ? projectCompletionMap.get(it.project_id) : undefined;
      if (!isItemCompleted(it.status, completionSet)) return false;

      const sprintName = it.metadata?.sprint;
      const sprintId = it.metadata?.sprint_id;
      if (sprintName || sprintId) {
        const activeSet = it.project_id ? activeSprintsByProject.get(it.project_id) : undefined;
        const isActive = Boolean(
          activeSet && (
            (sprintName && activeSet.has(sprintName)) ||
            (sprintId && activeSet.has(sprintId))
          )
        );
        return !isActive;
      }

      const updatedMs = new Date(it.updated_at).getTime();
      return isNaN(updatedMs) || updatedMs < portfolioCadenceCutoffMs;
    };

    const clientTimestamp = updatedSince || ifModifiedSince;
    if (clientTimestamp) {
      const clientTime = new Date(clientTimestamp).getTime();
      const compareTime = updatedSince ? itemMs : maxPortfolioTouchMs;
      if (!isNaN(clientTime) && compareTime <= clientTime && compareTime > 0) {
        return new Response(null, {
          status: 304,
          headers: responseHeaders,
        });
      }
    }

    if (updatedSince) {
      let deltaQuery: any = supabaseAdmin
        .from('work_items')
        .select('*')
        .eq('tenant_id', authCtx.tenant.id);

      if (typeof deltaQuery.gt === 'function') {
        deltaQuery = deltaQuery.gt('updated_at', updatedSince);
      }
      if (statusFilter && typeof deltaQuery.eq === 'function') {
        deltaQuery = deltaQuery.eq('status', statusFilter);
      }
      if (typeFilter && typeof deltaQuery.eq === 'function') {
        deltaQuery = deltaQuery.eq('item_type', typeFilter);
      }
      if (typeof deltaQuery.order === 'function') {
        deltaQuery = deltaQuery.order('order_index', { ascending: true });
      }

      const { data: rawDeltaRows, error: deltaErr } = await fetchAllRows<WorkItem>(deltaQuery);
      if (deltaErr) {
        return NextResponse.json({ error: deltaErr.message }, { status: 500 });
      }

      const allRows = (rawDeltaRows || []) as WorkItem[];
      const deleted_ids = allRows.filter((r) => r.deleted_at).map((r) => r.id);
      let items: WorkItem[] = [];

      if (!includeColdArchive) {
        allRows.forEach((r) => {
          if (r.deleted_at) return;
          if (isPortfolioItemCold(r)) {
            deleted_ids.push(r.id);
          } else {
            items.push(r);
          }
        });
      } else {
        items = allRows.filter((r) => !r.deleted_at);
      }

      const latestDeltaMs = Math.max(
        itemMs,
        allRows.length > 0
          ? Math.max(...allRows.map((r) => new Date(r.updated_at).getTime()).filter((t) => !isNaN(t)))
          : 0
      );
      const deltaCursor = latestDeltaMs > 0 ? new Date(latestDeltaMs).toISOString() : updatedSince || latestPortfolioItemAt;

      return NextResponse.json(
        {
          workspace: { id: authCtx.tenant.id, slug: authCtx.tenant.slug, name: authCtx.tenant.name },
          all_projects: true,
          items,
          deleted_ids,
          latest_at: deltaCursor,
          is_delta: true,
          count: items.length,
        },
        { headers: responseHeaders }
      );
    }

    let itemsQuery: any = supabaseAdmin
      .from('work_items')
      .select('*')
      .eq('tenant_id', authCtx.tenant.id);

    if (typeof itemsQuery.is === 'function') {
      itemsQuery = itemsQuery.is('deleted_at', null);
    }
    itemsQuery = itemsQuery.order('order_index', { ascending: true });
    if (statusFilter) itemsQuery = itemsQuery.eq('status', statusFilter);
    if (typeFilter) itemsQuery = itemsQuery.eq('item_type', typeFilter);

    const { data: rawItems, error: itemsErr } = await fetchAllRows<WorkItem>(itemsQuery);
    if (itemsErr) {
      return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }

    let allPortfolioItems = (rawItems || []) as WorkItem[];

    // If a specific sprint is requested (e.g. for on-demand lazy loading in portfolio view), resolve and filter directly
    const isTargetingSprint = Boolean(targetSprint);
    let targetSprintSet = new Set<string>();
    if (isTargetingSprint) {
      targetSprintSet = await resolveSprintIdentifiers(authCtx.tenant.id, targetSprint!);
      allPortfolioItems = allPortfolioItems.filter((it) => isItemInTargetSprint(it, targetSprintSet));
    }

    let items = allPortfolioItems;
    let coldCount = 0;
    if (!includeColdArchive && !isTargetingSprint) {
      items = allPortfolioItems.filter((it) => !isPortfolioItemCold(it));
      coldCount = allPortfolioItems.length - items.length;
    }

    if (format === 'tree') {
      const itemMap = new Map<string, WorkItemWithChildren>();
      const roots: WorkItemWithChildren[] = [];

      items.forEach((item) => {
        itemMap.set(item.id, { ...item, children: [] });
      });

      items.forEach((item) => {
        const node = itemMap.get(item.id)!;
        if (item.parent_id && itemMap.has(item.parent_id)) {
          itemMap.get(item.parent_id)!.children!.push(node);
        } else {
          roots.push(node);
        }
      });

      return NextResponse.json(
        {
          workspace: { id: authCtx.tenant.id, slug: authCtx.tenant.slug, name: authCtx.tenant.name },
          all_projects: true,
          format: 'tree',
          count: items.length,
          tree: roots,
          deleted_ids: [],
          latest_at: latestPortfolioItemAt,
          is_delta: false,
          cold_count: coldCount,
        },
        { headers: responseHeaders }
      );
    }

    if (format === 'board') {
      let projsQuery: any = supabaseAdmin
        .from('projects')
        .select('id, slug, name, settings')
        .eq('tenant_id', authCtx.tenant.id);

      if (typeof projsQuery.is === 'function') {
        projsQuery = projsQuery.is('deleted_at', null);
      }
      if (typeof projsQuery.order === 'function') {
        projsQuery = projsQuery.order('slug', { ascending: true });
      }

      const { data: projs } = await projsQuery;
      const sortedStatuses = mergeProjectStatuses(projs || []);

      const columns = sortedStatuses.map((st) => ({
        status: st,
        items: items.filter((i) => i.status === st.id),
      }));

      return NextResponse.json(
        {
          workspace: { id: authCtx.tenant.id, slug: authCtx.tenant.slug, name: authCtx.tenant.name },
          all_projects: true,
          format: 'board',
          columns,
          deleted_ids: [],
          latest_at: latestPortfolioItemAt,
          is_delta: false,
          cold_count: coldCount,
        },
        { headers: responseHeaders }
      );
    }

    return NextResponse.json(
      {
        workspace: { id: authCtx.tenant.id, slug: authCtx.tenant.slug, name: authCtx.tenant.name },
        all_projects: true,
        format: 'flat',
        count: items.length,
        items,
        deleted_ids: [],
        latest_at: latestPortfolioItemAt,
        is_delta: false,
        cold_count: coldCount,
      },
      { headers: responseHeaders }
    );
  }

  if (!projectSlug && !projectIdParam) {
    return NextResponse.json(
      { error: 'Specify "id", "project_slug", "project_id", or "all_projects=true" in query params' },
      { status: 400 }
    );
  }

  // Resolve project (active only — not soft-deleted)
  let projectQuery: any = supabaseAdmin
    .from('projects')
    .select('id, slug, name, settings, updated_at')
    .eq('tenant_id', authCtx.tenant.id);

  if (typeof projectQuery.is === 'function') {
    projectQuery = projectQuery.is('deleted_at', null);
  }

  if (projectIdParam) {
    projectQuery = projectQuery.eq('id', projectIdParam);
  } else if (projectSlug) {
    projectQuery = projectQuery.eq('slug', projectSlug);
  }

  const { data: project, error: projErr } = await projectQuery.single();

  if (projErr || !project) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 });
  }

  // Fast HTTP 304 Evaluation & Latest Touch query
  let touchQuery: any = supabaseAdmin
    .from('work_items')
    .select('updated_at')
    .eq('tenant_id', authCtx.tenant.id)
    .eq('project_id', project.id);

  if (typeof touchQuery.order === 'function') {
    touchQuery = touchQuery.order('updated_at', { ascending: false });
  }
  if (typeof touchQuery.limit === 'function') {
    touchQuery = touchQuery.limit(1);
  }

  let touchData: any = null;
  if (typeof touchQuery.maybeSingle === 'function') {
    const res = await touchQuery.maybeSingle();
    touchData = res?.data;
  } else if (typeof touchQuery.single === 'function') {
    const res = await touchQuery.single().catch(() => ({ data: null }));
    touchData = res?.data;
  } else if (typeof touchQuery.then === 'function') {
    const res = await touchQuery.catch(() => ({ data: null }));
    touchData = Array.isArray(res?.data) ? res.data[0] : res?.data;
  }

  const projectUpdatedAt = project.updated_at ? new Date(project.updated_at).getTime() : 0;
  const itemUpdatedAt = touchData?.updated_at ? new Date(touchData.updated_at).getTime() : 0;
  const maxTouchMs = Math.max(projectUpdatedAt, itemUpdatedAt);
  const latestTouch = maxTouchMs > 0 ? new Date(maxTouchMs) : new Date();
  const latestItemAt = itemUpdatedAt > 0 ? new Date(itemUpdatedAt).toISOString() : new Date().toISOString();

  const responseHeaders: Record<string, string> = {
    'Last-Modified': latestTouch.toUTCString(),
    'Cache-Control': 'private, no-cache',
  };

  // Sprint lifecycle-aware cold partitioning:
  // Active sprint tasks are never cold. Tasks completed within the active sprint lifecycle
  // or project cadence are retained; older completed items from closed sprints are cold-partitioned.
  const activeSprints = new Set<string>();
  let earliestActiveSprintStartMs: number | null = null;

  try {
    const sprintTable = supabaseAdmin.from('sprints');
    if (sprintTable && typeof sprintTable.select === 'function') {
      let sprintQuery: any = sprintTable
        .select('id, name, started_at, created_at, status, is_active')
        .eq('tenant_id', authCtx.tenant.id)
        .eq('project_id', project.id);

      if (typeof sprintQuery.or === 'function') {
        sprintQuery = sprintQuery.or('status.eq.active,is_active.eq.true');
      }

      const { data: relationalSprints } = await sprintQuery;
      if (relationalSprints && Array.isArray(relationalSprints)) {
        relationalSprints.forEach((s: any) => {
          if (s.status === 'active' || s.is_active) {
            if (s.id) activeSprints.add(s.id);
            if (s.name) activeSprints.add(s.name);
            const sTime = s.started_at ? new Date(s.started_at).getTime() : new Date(s.created_at).getTime();
            if (!isNaN(sTime)) {
              if (earliestActiveSprintStartMs === null || sTime < earliestActiveSprintStartMs) {
                earliestActiveSprintStartMs = sTime;
              }
            }
          }
        });
      }
    }
  } catch {
    // Non-fatal, fallback to project settings
  }

  // Fallback to project settings sprint definitions
  (project?.settings?.sprint_settings?.sprints || []).forEach((s: any) => {
    if (s.status === 'active' || s.is_active || s.is_current) {
      if (s.id) activeSprints.add(s.id);
      if (s.name) activeSprints.add(s.name);
      const sDate = s.started_at || s.start_date;
      if (sDate) {
        const sTime = new Date(sDate).getTime();
        if (!isNaN(sTime)) {
          if (earliestActiveSprintStartMs === null || sTime < earliestActiveSprintStartMs) {
            earliestActiveSprintStartMs = sTime;
          }
        }
      }
    }
  });

  // Default cadence: 90 days (quarterly sprint lifecycle) or configured sprint cadence
  const defaultNonSprintProjectCutoffMs = Date.now() - 14 * 24 * 60 * 60 * 1000;
  const projectCadenceDays = Number(project?.settings?.sprint_settings?.cadence_days) || 90;
  const projectCadenceCutoffMs = earliestActiveSprintStartMs !== null
    ? earliestActiveSprintStartMs
    : activeSprints.size > 0
    ? Date.now() - projectCadenceDays * 24 * 60 * 60 * 1000
    : defaultNonSprintProjectCutoffMs;

  const projectCompletedStatuses = getCompletedStatusSet(project?.settings?.statuses);

  const isProjectItemCold = (it: WorkItem): boolean => {
    if (!isItemCompleted(it.status, projectCompletedStatuses)) return false;
    const sprintName = it.metadata?.sprint;
    const sprintId = it.metadata?.sprint_id;
    if (sprintName || sprintId) {
      const isActive = Boolean(
        (sprintName && activeSprints.has(sprintName)) ||
        (sprintId && activeSprints.has(sprintId))
      );
      return !isActive;
    }
    const updatedMs = new Date(it.updated_at).getTime();
    return isNaN(updatedMs) || updatedMs < projectCadenceCutoffMs;
  };

  const clientTimestamp = updatedSince || ifModifiedSince;
  if (clientTimestamp) {
    const clientTime = new Date(clientTimestamp).getTime();
    const compareTime = updatedSince ? itemUpdatedAt : maxTouchMs;
    if (!isNaN(clientTime) && compareTime <= clientTime && compareTime > 0) {
      return new Response(null, {
        status: 304,
        headers: responseHeaders,
      });
    }
  }

  // Incremental Delta Logic
  if (updatedSince) {
    let deltaQuery: any = supabaseAdmin
      .from('work_items')
      .select('*')
      .eq('tenant_id', authCtx.tenant.id)
      .eq('project_id', project.id);

    if (typeof deltaQuery.gt === 'function') {
      deltaQuery = deltaQuery.gt('updated_at', updatedSince);
    }
    if (statusFilter && typeof deltaQuery.eq === 'function') {
      deltaQuery = deltaQuery.eq('status', statusFilter);
    }
    if (typeFilter && typeof deltaQuery.eq === 'function') {
      deltaQuery = deltaQuery.eq('item_type', typeFilter);
    }
    if (typeof deltaQuery.order === 'function') {
      deltaQuery = deltaQuery.order('order_index', { ascending: true });
    }

    const { data: rawDeltaRows, error: deltaErr } = await fetchAllRows<WorkItem>(deltaQuery);
    if (deltaErr) {
      return NextResponse.json({ error: deltaErr.message }, { status: 500 });
    }

    const allRows = (rawDeltaRows || []) as WorkItem[];
    const deleted_ids = allRows.filter((r) => r.deleted_at).map((r) => r.id);
    let items: WorkItem[] = [];

    if (!includeColdArchive) {
      allRows.forEach((r) => {
        if (r.deleted_at) return;
        if (isProjectItemCold(r)) {
          deleted_ids.push(r.id);
        } else {
          items.push(r);
        }
      });
    } else {
      items = allRows.filter((r) => !r.deleted_at);
    }

    const latestDeltaMs = Math.max(
      itemUpdatedAt,
      allRows.length > 0
        ? Math.max(...allRows.map((r) => new Date(r.updated_at).getTime()).filter((t) => !isNaN(t)))
        : 0
    );
    const deltaCursor = latestDeltaMs > 0 ? new Date(latestDeltaMs).toISOString() : updatedSince || latestItemAt;

    return NextResponse.json(
      {
        project: { id: project.id, slug: project.slug, name: project.name },
        items,
        deleted_ids,
        latest_at: deltaCursor,
        is_delta: true,
        count: items.length,
      },
      { headers: responseHeaders }
    );
  }

  // Query active work items (exclude soft-deleted)
  let itemsQuery: any = supabaseAdmin
    .from('work_items')
    .select('*')
    .eq('tenant_id', authCtx.tenant.id)
    .eq('project_id', project.id);

  if (typeof itemsQuery.is === 'function') {
    itemsQuery = itemsQuery.is('deleted_at', null);
  }

  itemsQuery = itemsQuery.order('order_index', { ascending: true });

  if (statusFilter) itemsQuery = itemsQuery.eq('status', statusFilter);
  if (typeFilter) itemsQuery = itemsQuery.eq('item_type', typeFilter);

  const { data: rawItems, error: itemsErr } = await fetchAllRows<WorkItem>(itemsQuery);

  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  let allItems = (rawItems || []) as WorkItem[];

  // If a specific sprint is requested (e.g. for on-demand lazy loading), filter directly
  const isTargetingSprint = Boolean(targetSprint);
  let targetSprintSet = new Set<string>();
  if (isTargetingSprint) {
    targetSprintSet = await resolveSprintIdentifiers(authCtx.tenant.id, targetSprint!, project.id, project.settings);
    allItems = allItems.filter((it) => isItemInTargetSprint(it, targetSprintSet));
  }

  let items = allItems;
  let coldCount = 0;
  if (!includeColdArchive && !isTargetingSprint) {
    items = allItems.filter((it) => !isProjectItemCold(it));
    coldCount = allItems.length - items.length;
  }

  if (format === 'tree') {
    // Build nested tree
    const itemMap = new Map<string, WorkItemWithChildren>();
    const roots: WorkItemWithChildren[] = [];

    items.forEach(item => {
      itemMap.set(item.id, { ...item, children: [] });
    });

    items.forEach(item => {
      const node = itemMap.get(item.id)!;
      if (item.parent_id && itemMap.has(item.parent_id)) {
        itemMap.get(item.parent_id)!.children!.push(node);
      } else {
        roots.push(node);
      }
    });

    return NextResponse.json(
      {
        project: { id: project.id, slug: project.slug, name: project.name },
        format: 'tree',
        count: items.length,
        tree: roots,
        deleted_ids: [],
        latest_at: latestItemAt,
        is_delta: false,
        cold_count: coldCount,
      },
      { headers: responseHeaders }
    );
  }

  if (format === 'board') {
    const statuses = project.settings?.statuses || [];
    const board = statuses.map((st: any) => ({
      status: st,
      items: items.filter(i => i.status === st.id),
    }));

    return NextResponse.json(
      {
        project: { id: project.id, slug: project.slug, name: project.name },
        format: 'board',
        columns: board,
        deleted_ids: [],
        latest_at: latestItemAt,
        is_delta: false,
        cold_count: coldCount,
      },
      { headers: responseHeaders }
    );
  }

  return NextResponse.json(
    {
      project: { id: project.id, slug: project.slug, name: project.name },
      format: 'flat',
      count: items.length,
      items,
      deleted_ids: [],
      latest_at: latestItemAt,
      is_delta: false,
      cold_count: coldCount,
    },
    { headers: responseHeaders }
  );
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  try {
    const body = await req.json();

    // Dual-compatibility: handle bulk create if array or payload with items array
    if (Array.isArray(body) || (Array.isArray(body.items) && body.items.length > 0)) {
      const payload = Array.isArray(body) ? { items: body } : body;
      const bulkRes = await handleBulkCreateItems(authCtx.tenant.id, payload, {
        tenantSlug: authCtx.tenant.slug,
        actorId: authCtx.userId || null,
        actorName: authCtx.userName || (authCtx.userId ? 'User' : 'API'),
      });
      if (!bulkRes.success) {
        return NextResponse.json({ error: bulkRes.error }, { status: bulkRes.status || 400 });
      }
      return NextResponse.json(
        { success: true, count: bulkRes.count, items: bulkRes.items },
        { status: 201 }
      );
    }

    const { project_id, project_slug, parent_id, external_ref_id, item_type, status, title, description, assignee, metadata, order_index, prev_order, next_order } = body;

    if (!title) {
      return NextResponse.json({ error: '"title" is required' }, { status: 400 });
    }

    // Resolve project
    let projId = project_id;
    let projectSettings: any = null;
    let resolvedProject: any = null;

    if (!projId && project_slug) {
      const { data: p } = await supabaseAdmin
        .from('projects')
        .select('id, slug, name, settings')
        .eq('tenant_id', authCtx.tenant.id)
        .eq('slug', project_slug)
        .single();
      if (p) {
        resolvedProject = p;
        projId = p.id;
        projectSettings = p.settings;
      }
    } else if (projId) {
      const { data: p } = await supabaseAdmin
        .from('projects')
        .select('id, slug, name, settings')
        .eq('tenant_id', authCtx.tenant.id)
        .eq('id', projId)
        .single();
      if (p) {
        resolvedProject = p;
        projectSettings = p.settings;
      }
    }

    if (!projId) {
      return NextResponse.json({ error: 'Valid project_id or project_slug required' }, { status: 400 });
    }

    const defaultStatus = projectSettings?.statuses?.[0]?.id || 'not_started';
    const defaultType = projectSettings?.hierarchy?.[projectSettings.hierarchy.length - 1]?.type || 'task';
    const resolvedType = item_type || defaultType;
    const resolvedStatus = status || defaultStatus;

    // Validate against allowed_story_types if configured
    if (
      Array.isArray(projectSettings?.allowed_story_types) &&
      projectSettings.allowed_story_types.length > 0 &&
      !projectSettings.allowed_story_types.map((t: string) => t.toLowerCase().trim()).includes(resolvedType.toLowerCase().trim())
    ) {
      return NextResponse.json(
        {
          error: `Item type '${resolvedType}' is not allowed for creation. Allowed types: [${projectSettings.allowed_story_types.join(', ')}]`,
        },
        { status: 422 }
      );
    }

    // Validate hierarchy nesting if parent_id is given
    if (parent_id && projectSettings?.hierarchy) {
      const { data: parentItem } = await supabaseAdmin
        .from('work_items')
        .select('item_type')
        .eq('id', parent_id)
        .eq('project_id', projId)
        .single();

      if (parentItem) {
        const nestCheck = validateHierarchyNesting(parentItem.item_type, resolvedType, projectSettings.hierarchy);
        if (!nestCheck.valid) {
          return NextResponse.json({ error: nestCheck.message }, { status: 422 });
        }
      }
    }

    // Calculate order index
    let calculatedOrder = calculateOrderIndex(prev_order, next_order);
    if (typeof order_index === 'number' && !isNaN(order_index)) {
      calculatedOrder = order_index;
    } else if (!prev_order && !next_order) {
      const { data: lastItem } = await supabaseAdmin
        .from('work_items')
        .select('order_index')
        .eq('project_id', projId)
        .order('order_index', { ascending: false })
        .limit(1)
        .single();
      calculatedOrder = lastItem?.order_index ? lastItem.order_index + 1000.0 : 1000.0;
    }

    let resolvedExternalRefId = external_ref_id?.trim() || null;
    if (!resolvedExternalRefId) {
      const prefix = deriveProjectPrefix({
        slug: resolvedProject?.slug || project_slug,
        name: resolvedProject?.name,
        settings: projectSettings,
      });
      resolvedExternalRefId = await generateNextSequentialRef(projId, prefix);
    }

    const payload = {
      tenant_id: authCtx.tenant.id,
      project_id: projId,
      parent_id: parent_id || null,
      external_ref_id: resolvedExternalRefId,
      item_type: resolvedType,
      status: resolvedStatus,
      title,
      description: description || null,
      assignee: assignee || null,
      order_index: calculatedOrder,
      metadata: metadata || {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const { data: created, error } = await supabaseAdmin
      .from('work_items')
      .insert(payload)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Record audit log for item creation
    await recordAuditLog({
      tenant_id: authCtx.tenant.id,
      project_id: projId,
      item_id: created.id,
      actor_id: authCtx.userId || null,
      actor_name: authCtx.userName || (authCtx.userId ? 'User' : 'API Client'),
      action: 'create',
      changed_fields: {
        created: { before: null, after: created },
      },
    }).catch(() => {});

    // Dispatch notifications if assigned
    if (created.assignee) {
      resolveRecipient(authCtx.tenant.id, created.assignee)
        .then((recipientUser) => {
          if (recipientUser) {
            return dispatchItemNotifications({
              tenantId: authCtx.tenant.id,
              tenantSlug: authCtx.tenant.slug,
              projectId: projId,
              projectSlug: resolvedProject?.slug || project_slug,
              item: created,
              beforeItem: null,
              actorId: authCtx.userId || null,
              actorName: authCtx.userName || (authCtx.userId ? 'User' : 'API Client'),
              recipientUser,
            });
          }
        })
        .catch(() => {});
    }

    return NextResponse.json({ success: true, item: created }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  try {
    const body = await req.json();

    // Dual-compatibility: handle bulk update if body is an array, or has ids/items array
    if (
      Array.isArray(body) ||
      (Array.isArray(body.ids) && body.ids.length > 0) ||
      (Array.isArray(body.items) && body.items.length > 0)
    ) {
      const isCallerAdmin =
        authCtx.role === 'owner' ||
        authCtx.role === 'admin' ||
        (!authCtx.userId && authCtx.role === null);

      const hasItemGovernanceBypass =
        (Array.isArray(body.items) && body.items.some((it: any) => it?.governance_bypass || it?.metadata?.governance_bypass)) ||
        (Array.isArray(body) && body.some((it: any) => it?.governance_bypass || it?.metadata?.governance_bypass));

      const requestedBulkGovernanceBypass = Boolean(
        body?.governance_bypass ||
        body?.updates?.governance_bypass ||
        body?.updates?.metadata?.governance_bypass ||
        hasItemGovernanceBypass ||
        req.headers.get('x-governance-bypass') === 'true'
      );

      if (requestedBulkGovernanceBypass && !isCallerAdmin) {
        return NextResponse.json(
          { error: 'Forbidden: Sprint governance bypass requires admin role' },
          { status: 403 }
        );
      }

      const bulkRes = await handleBulkUpdateItems(authCtx.tenant.id, body, {
        tenantSlug: authCtx.tenant.slug,
        actorId: authCtx.userId || null,
        actorName: authCtx.userName || (authCtx.userId ? 'User' : 'API'),
        governance_bypass: isCallerAdmin && requestedBulkGovernanceBypass,
      });
      if (!bulkRes.success) {
        return NextResponse.json({ error: bulkRes.error }, { status: bulkRes.status || 400 });
      }
      return NextResponse.json({
        success: true,
        updated_count: bulkRes.updated_count,
        items: bulkRes.items,
      });
    }

    const {
      id,
      title,
      description,
      status,
      item_type,
      assignee,
      metadata,
      order_index,
      prev_order,
      next_order,
      parent_id,
      external_ref_id,
      project_id,
    } = body;

    if (!id) {
      return NextResponse.json({ error: '"id" is required' }, { status: 400 });
    }

    // Fetch existing item to check project and current state
    const { data: existingItem, error: fetchErr } = await supabaseAdmin
      .from('work_items')
      .select('*')
      .eq('id', id)
      .eq('tenant_id', authCtx.tenant.id)
      .single();

    if (fetchErr || !existingItem) {
      return NextResponse.json({ error: 'Work item not found' }, { status: 404 });
    }

    // Fetch project settings for schema and hierarchy validation
    const { data: project } = await supabaseAdmin
      .from('projects')
      .select('id, settings')
      .eq('id', existingItem.project_id)
      .single();

    const projectSettings = project?.settings;

    if (isItemImmutableDueToCompletedSprint(existingItem, projectSettings)) {
      return NextResponse.json(
        { error: `Item "${existingItem.title || existingItem.id}" was completed in closed sprint "${existingItem.metadata?.sprint}" and is immutable.` },
        { status: 403 }
      );
    }

    const updateFields: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    let isProjectReassignment = false;
    let targetProjectId = existingItem.project_id;
    let effectiveProjectSettings = projectSettings;

    if (project_id !== undefined && project_id !== existingItem.project_id) {
      const { data: targetProj } = await supabaseAdmin
        .from('projects')
        .select('id, slug, name, settings')
        .eq('tenant_id', authCtx.tenant.id)
        .eq('id', project_id)
        .single();

      if (!targetProj) {
        return NextResponse.json({ error: `Destination project '${project_id}' not found` }, { status: 404 });
      }
      isProjectReassignment = true;
      targetProjectId = project_id;
      effectiveProjectSettings = targetProj.settings;
      updateFields.project_id = project_id;
      // In project reassignment, clear parent_id if moving across projects and no new parent specified
      if (parent_id === undefined && existingItem.parent_id) {
        updateFields.parent_id = null;
      }
    }

    if (title !== undefined) updateFields.title = title;
    if (description !== undefined) updateFields.description = description;
    if (assignee !== undefined) updateFields.assignee = assignee;

    const requestedGovernanceBypass = Boolean(
      body?.governance_bypass ||
      (metadata && typeof metadata === 'object' && metadata?.governance_bypass) ||
      req.headers.get('x-governance-bypass') === 'true'
    );

    const isCallerAdmin =
      authCtx.role === 'owner' ||
      authCtx.role === 'admin' ||
      (!authCtx.userId && authCtx.role === null);

    if (requestedGovernanceBypass && !isCallerAdmin) {
      return NextResponse.json(
        { error: 'Forbidden: Only workspace admins and owners can bypass sprint governance' },
        { status: 403 }
      );
    }

    const isGovernanceBypassed = isCallerAdmin && requestedGovernanceBypass;
    let resolvedMetadata: any = undefined;

    if (metadata !== undefined) {
      if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
        return NextResponse.json({ error: '"metadata" must be an object' }, { status: 400 });
      }

      const { reconcileSprintMetadata, isMovingIntoActiveSprint } = await import('@/lib/bulk-items');
      resolvedMetadata = reconcileSprintMetadata(
        existingItem.metadata || {},
        metadata,
        effectiveProjectSettings,
        { fullReplacement: true, governanceBypass: isGovernanceBypassed }
      );

      if (isGovernanceBypassed) {
        resolvedMetadata.governance_bypass = true;
        resolvedMetadata.added_mid_sprint = true;
      }

      // Guardrail 3: Immutable Estimates on active sprint items
      try {
        const itemSprint = existingItem.metadata?.sprint || existingItem.metadata?.sprint_id;
        if (itemSprint && !isGovernanceBypassed) {
          const sprints = effectiveProjectSettings?.sprint_settings?.sprints || [];
          const activeSprintDef = sprints.find(
            (s: any) =>
              (s.id === itemSprint || s.name === itemSprint) &&
              (s.status === 'active' || s.is_active || s.is_current)
          );
          if (activeSprintDef) {
            const { validateEstimateImmutability } = await import(
              '@/lib/services/sprintGuardrailService'
            );
            validateEstimateImmutability(
              existingItem,
              resolvedMetadata,
              activeSprintDef,
              effectiveProjectSettings?.sprint_metrics || effectiveProjectSettings?.metric_rules
            );
          }
        }

        // Active sprint intake guard: reject assigning estimated items to active sprint without mid-sprint flag
        const sprints = effectiveProjectSettings?.sprint_settings?.sprints || [];
        const { isIntake, activeSprint } = isMovingIntoActiveSprint(
          existingItem.metadata || {},
          resolvedMetadata,
          sprints
        );

        if (isIntake && activeSprint && !isGovernanceBypassed) {
          const hasPoints =
            (existingItem.metadata?.story_points !== undefined && existingItem.metadata?.story_points !== null && Number(existingItem.metadata.story_points) > 0) ||
            (existingItem.metadata?.points !== undefined && existingItem.metadata?.points !== null && Number(existingItem.metadata.points) > 0) ||
            (resolvedMetadata?.story_points !== undefined && resolvedMetadata?.story_points !== null && Number(resolvedMetadata.story_points) > 0);
          const isAddedMidSprint = Boolean(
            resolvedMetadata?.added_mid_sprint || existingItem.metadata?.added_mid_sprint
          );
          if (hasPoints && !isAddedMidSprint) {
            return NextResponse.json(
              {
                error: `Cannot assign item "${existingItem.title || existingItem.id}" with estimated points to active sprint "${activeSprint.name}". Active sprint scope is locked.`,
                code: 'ESTIMATE_LOCKED',
              },
              { status: 409 }
            );
          }
        }
      } catch (err: any) {
        return NextResponse.json(
          { error: err.message, code: err.code || 'ESTIMATE_LOCKED' },
          { status: err.status || 409 }
        );
      }

      updateFields.metadata = resolvedMetadata;
    }

    // Validate item_type against effective project schema
    const effectiveType = item_type !== undefined ? item_type : existingItem.item_type;
    if (item_type !== undefined || isProjectReassignment) {
      if (effectiveProjectSettings?.hierarchy?.length) {
        const typeValid = effectiveProjectSettings.hierarchy.some((h: any) => h.type === effectiveType);
        if (!typeValid) {
          return NextResponse.json(
            {
              error: `Invalid item_type '${effectiveType}'. Allowed types in ${isProjectReassignment ? 'destination project' : 'project'}: [${effectiveProjectSettings.hierarchy
                .map((h: any) => h.type)
                .join(', ')}]`,
            },
            { status: 422 }
          );
        }
      }
      if (item_type !== undefined) {
        updateFields.item_type = item_type;
      }
    }

    // Validate status against effective project schema
    const effectiveStatus = status !== undefined ? status : existingItem.status;
    if (status !== undefined || isProjectReassignment) {
      if (effectiveProjectSettings?.statuses?.length) {
        const statusValid = effectiveProjectSettings.statuses.some((s: any) => s.id === effectiveStatus);
        if (!statusValid) {
          return NextResponse.json(
            {
              error: `Invalid status '${effectiveStatus}'. Allowed statuses in ${isProjectReassignment ? 'destination project' : 'project'}: [${effectiveProjectSettings.statuses
                .map((s: any) => s.id)
                .join(', ')}]`,
            },
            { status: 422 }
          );
        }
      }
      if (status !== undefined) {
        updateFields.status = status;
      }
    }

    // Validate and persist external_ref_id
    if (external_ref_id !== undefined) {
      if (external_ref_id !== null && typeof external_ref_id === 'string' && external_ref_id.trim() !== '') {
        const trimmedRef = external_ref_id.trim();
        const { data: conflict } = await supabaseAdmin
          .from('work_items')
          .select('id')
          .eq('tenant_id', authCtx.tenant.id)
          .eq('project_id', targetProjectId)
          .eq('external_ref_id', trimmedRef)
          .neq('id', id)
          .maybeSingle();

        if (conflict) {
          return NextResponse.json(
            { error: `external_ref_id '${trimmedRef}' already exists in this project` },
            { status: 409 }
          );
        }
        updateFields.external_ref_id = trimmedRef;
      } else {
        updateFields.external_ref_id = null;
      }
    }

    // Validate parent_id and hierarchy nesting
    const effectiveParentId = parent_id !== undefined ? parent_id : existingItem.parent_id;

    if (effectiveParentId) {
      if (effectiveParentId === id) {
        return NextResponse.json({ error: 'Item cannot be its own parent' }, { status: 400 });
      }

      const { data: parentItem } = await supabaseAdmin
        .from('work_items')
        .select('id, item_type, project_id')
        .eq('id', effectiveParentId)
        .eq('tenant_id', authCtx.tenant.id)
        .single();

      if (!parentItem) {
        return NextResponse.json({ error: `Parent item '${effectiveParentId}' not found` }, { status: 404 });
      }

      if (parentItem.project_id !== targetProjectId) {
        if (isProjectReassignment) {
          // Gracefully detach parent if reassigning project across boundaries
          updateFields.parent_id = null;
        } else {
          return NextResponse.json({ error: 'Parent item must belong to the same project' }, { status: 400 });
        }
      } else if (effectiveProjectSettings?.hierarchy?.length) {
        const nestCheck = validateHierarchyNesting(parentItem.item_type, effectiveType, effectiveProjectSettings.hierarchy);
        if (!nestCheck.valid) {
          if (parent_id !== undefined) {
            return NextResponse.json({ error: nestCheck.message }, { status: 422 });
          }
          // If caller changed item_type without specifying parent_id, auto-clear incompatible parent
          updateFields.parent_id = null;
        } else if (parent_id !== undefined) {
          updateFields.parent_id = parent_id;
        }
      } else if (parent_id !== undefined) {
        updateFields.parent_id = parent_id;
      }
    } else if (parent_id !== undefined) {
      updateFields.parent_id = null;
    }

    if (typeof order_index === 'number' && !isNaN(order_index)) {
      updateFields.order_index = order_index;
    } else if (prev_order !== undefined || next_order !== undefined) {
      updateFields.order_index = calculateOrderIndex(prev_order, next_order);
    }

    // Dual-column sprint_id synchronization
    if (resolvedMetadata?.sprint_id !== undefined) {
      updateFields.sprint_id = resolvedMetadata.sprint_id;
    } else if (body.sprint_id !== undefined) {
      updateFields.sprint_id = body.sprint_id;
    } else if (metadata !== undefined && ('sprint' in metadata || 'sprint_id' in metadata)) {
      if (!resolvedMetadata?.sprint) {
        updateFields.sprint_id = null;
      }
    }

    // Guardrail: Validate sprint intake if moving item to an active sprint
    if (
      !isGovernanceBypassed &&
      metadata !== undefined &&
      metadata?.sprint !== undefined &&
      metadata.sprint !== existingItem.metadata?.sprint &&
      metadata.sprint !== '__none__' &&
      metadata.sprint !== ''
    ) {
      const targetSprint = metadata.sprint;
      const { data: tenantItems } = await supabaseAdmin
        .from('work_items')
        .select('*')
        .eq('tenant_id', authCtx.tenant.id);

      const descendantIds = getDescendantIds(tenantItems || [], id);
      const allEnteringItems = [
        { ...existingItem, metadata: { ...existingItem.metadata, ...metadata } },
        ...(tenantItems || []).filter((it: any) => descendantIds.includes(it.id)),
      ];

      const { validateSprintIntake, SprintGuardrailError } = await import(
        '@/lib/services/sprintGuardrailServer'
      );

      try {
        const { calculateSprintLeafPoints } = await import('@/lib/sprint-utils');
        const enteringPoints = calculateSprintLeafPoints(allEnteringItems as any[]);
        await validateSprintIntake(authCtx.tenant.slug, targetSprint, {
          ...existingItem,
          metadata: {
            ...existingItem.metadata,
            ...metadata,
            story_points: enteringPoints,
          },
        });
      } catch (err: any) {
        if (err instanceof SprintGuardrailError) {
          return NextResponse.json(
            {
              error: err.message,
              code: err.code,
              required_ejection_points: err.required_ejection_points,
            },
            { status: err.status || 409 }
          );
        }
        return NextResponse.json({ error: err.message || 'Sprint intake rejected' }, { status: 400 });
      }
    }

    const { data: updated, error } = await supabaseAdmin
      .from('work_items')
      .update(updateFields)
      .eq('id', id)
      .eq('tenant_id', authCtx.tenant.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Cascade project migration to all descendants
    if (isProjectReassignment && project_id) {
      const { data: tenantItems } = await supabaseAdmin
        .from('work_items')
        .select('id, parent_id')
        .eq('tenant_id', authCtx.tenant.id);
      const descendantIds = getDescendantIds(tenantItems || [], id);
      if (descendantIds.length > 0) {
        const { error: descErr } = await supabaseAdmin
          .from('work_items')
          .update({
            project_id: project_id,
            updated_at: new Date().toISOString(),
          })
          .in('id', descendantIds)
          .eq('tenant_id', authCtx.tenant.id);

        if (descErr) {
          // Rollback the root item update to avoid partial migration
          await supabaseAdmin
            .from('work_items')
            .update({
              project_id: existingItem.project_id,
              parent_id: existingItem.parent_id,
              updated_at: new Date().toISOString(),
            })
            .eq('id', id)
            .eq('tenant_id', authCtx.tenant.id);

          return NextResponse.json(
            {
              error: `Failed to cascade project reassignment to child items: ${descErr.message}. The reassignment was rolled back.`,
            },
            { status: 500 }
          );
        }
      }

      // Synchronize audit_logs project_id for migrated items
      const allAffectedIds = [id, ...(descendantIds || [])];
      await supabaseAdmin
        .from('audit_logs')
        .update({ project_id: project_id })
        .in('item_id', allAffectedIds)
        .eq('tenant_id', authCtx.tenant.id);
    }

    // Cascade sprint change to all descendants
    const prevSprintName = existingItem.metadata?.sprint || null;
    const prevSprintId = existingItem.metadata?.sprint_id || null;
    const nextSprintName = updated.metadata?.sprint || null;
    const nextSprintId = updated.metadata?.sprint_id || null;
    const sprintChanged =
      metadata !== undefined &&
      (prevSprintName !== nextSprintName || prevSprintId !== nextSprintId);

    if (sprintChanged) {
      const { data: tenantItems, error: fetchDescendantsErr } = await supabaseAdmin
        .from('work_items')
        .select('id, parent_id, metadata')
        .eq('tenant_id', authCtx.tenant.id);

      if (fetchDescendantsErr) {
        console.error('Failed to query items for descendant cascade:', fetchDescendantsErr);
        return NextResponse.json(
          { error: `Failed to query descendant items: ${fetchDescendantsErr.message}` },
          { status: 500 }
        );
      }

      const descendantIds = getDescendantIds(tenantItems || [], id);
      if (descendantIds.length > 0) {
        const { reconcileSprintMetadata } = await import('@/lib/bulk-items');
        const descendantsToUpdate = (tenantItems || []).filter((it) => descendantIds.includes(it.id));
        const descendantUpdates = await Promise.all(
          descendantsToUpdate.map((it) => {
            const nextMeta = reconcileSprintMetadata(
              it.metadata || {},
              {
                sprint: nextSprintName,
                sprint_id: nextSprintId,
                governance_bypass: isGovernanceBypassed,
              },
              effectiveProjectSettings,
              { fullReplacement: false, governanceBypass: isGovernanceBypassed }
            );
            return supabaseAdmin
              .from('work_items')
              .update({
                sprint_id: nextSprintId,
                metadata: nextMeta,
                updated_at: new Date().toISOString(),
              })
              .eq('id', it.id)
              .eq('tenant_id', authCtx.tenant.id);
          })
        );

        const failedUpdate = descendantUpdates.find((res) => res.error);
        if (failedUpdate?.error) {
          console.error('Failed to cascade sprint update to descendant:', failedUpdate.error);
          return NextResponse.json(
            { error: `Failed to cascade sprint assignment to descendant items: ${failedUpdate.error.message}` },
            { status: 500 }
          );
        }
      }
    }

    // Record audit diff if fields changed
    const diff = computeChangedFields(existingItem, updated);
    if (Object.keys(diff).length > 0) {
      await recordAuditLog({
        tenant_id: authCtx.tenant.id,
        project_id: updated.project_id || existingItem.project_id,
        item_id: id,
        actor_id: authCtx.userId || null,
        actor_name: authCtx.userName || (authCtx.userId ? 'User' : 'API Client'),
        action: 'update',
        changed_fields: diff,
      }).catch(() => {});

      const targetAssignee = updated.assignee || existingItem.assignee;
      if (targetAssignee) {
        resolveRecipient(authCtx.tenant.id, targetAssignee)
          .then((recipientUser) => {
            if (recipientUser) {
              return dispatchItemNotifications({
                tenantId: authCtx.tenant.id,
                tenantSlug: authCtx.tenant.slug,
                projectId: updated.project_id || existingItem.project_id,
                item: updated,
                beforeItem: existingItem,
                actorId: authCtx.userId || null,
                actorName: authCtx.userName || (authCtx.userId ? 'User' : 'API Client'),
                recipientUser,
              });
            }
          })
          .catch(() => {});
      }
    }

    return NextResponse.json({ success: true, item: updated });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  try {
    const body = await req.json();

    // Dual-compatibility: handle bulk delete if body is array or body.ids is array
    if (Array.isArray(body) || (Array.isArray(body.ids) && body.ids.length > 0)) {
      const payload = Array.isArray(body) ? { ids: body } : body;
      const bulkRes = await handleBulkDeleteItems(authCtx.tenant.id, payload);
      if (!bulkRes.success) {
        return NextResponse.json({ error: bulkRes.error }, { status: bulkRes.status || 400 });
      }
      return NextResponse.json({
        success: true,
        deleted_count: bulkRes.deleted_count,
        deleted_ids: bulkRes.deleted_ids,
      });
    }

    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: '"id" is required' }, { status: 400 });
    }

    // Check immutability if item was completed in a closed sprint
    const { data: existingItem } = await supabaseAdmin
      .from('work_items')
      .select('id, project_id, title, status, metadata')
      .eq('id', id)
      .eq('tenant_id', authCtx.tenant.id)
      .single();

    if (existingItem) {
      const { data: proj } = await supabaseAdmin
        .from('projects')
        .select('id, settings')
        .eq('id', existingItem.project_id)
        .single();
      if (isItemImmutableDueToCompletedSprint(existingItem as any, proj?.settings)) {
        return NextResponse.json(
          { error: `Item "${existingItem.title || existingItem.id}" was completed in closed sprint "${existingItem.metadata?.sprint}" and is immutable.` },
          { status: 403 }
        );
      }
    }

    // Soft-delete: set deleted_at timestamp, do NOT destroy the row
    let deleteQuery: any = supabaseAdmin
      .from('work_items')
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', authCtx.tenant.id); // Enforce tenant isolation

    if (typeof deleteQuery.is === 'function') {
      deleteQuery = deleteQuery.is('deleted_at', null); // Only delete active items
    }

    const { data: softDeleted, error } = await deleteQuery
      .select('id, project_id, title, deleted_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    if (!softDeleted) {
      return NextResponse.json(
        { error: 'Item not found or already deleted' },
        { status: 404 }
      );
    }

    // Record audit log for soft-delete
    await recordAuditLog({
      tenant_id: authCtx.tenant.id,
      project_id: softDeleted.project_id,
      item_id: id,
      actor_id: authCtx.userId || null,
      actor_name: authCtx.userName || (authCtx.userId ? 'User' : 'API Client'),
      action: 'delete',
      changed_fields: {
        deleted_at: { before: null, after: softDeleted.deleted_at },
      },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      soft_deleted_id: id,
      deleted_at: softDeleted.deleted_at,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

