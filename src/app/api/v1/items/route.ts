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

    const { data: rawItems, error: itemsErr } = await itemsQuery;
    if (itemsErr) {
      return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }

    const items = (rawItems || []) as WorkItem[];

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

      return NextResponse.json({
        workspace: { id: authCtx.tenant.id, slug: authCtx.tenant.slug, name: authCtx.tenant.name },
        all_projects: true,
        format: 'tree',
        count: items.length,
        tree: roots,
      });
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

      return NextResponse.json({
        workspace: { id: authCtx.tenant.id, slug: authCtx.tenant.slug, name: authCtx.tenant.name },
        all_projects: true,
        format: 'board',
        columns,
      });
    }

    return NextResponse.json({
      workspace: { id: authCtx.tenant.id, slug: authCtx.tenant.slug, name: authCtx.tenant.name },
      all_projects: true,
      format: 'flat',
      count: items.length,
      items,
    });
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
    .select('id, slug, name, settings')
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

  const { data: rawItems, error: itemsErr } = await itemsQuery;

  if (itemsErr) {
    return NextResponse.json({ error: itemsErr.message }, { status: 500 });
  }

  const items = (rawItems || []) as WorkItem[];

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

    return NextResponse.json({
      project: { id: project.id, slug: project.slug, name: project.name },
      format: 'tree',
      count: items.length,
      tree: roots,
    });
  }

  if (format === 'board') {
    const statuses = project.settings?.statuses || [];
    const board = statuses.map((st: any) => ({
      status: st,
      items: items.filter(i => i.status === st.id),
    }));

    return NextResponse.json({
      project: { id: project.id, slug: project.slug, name: project.name },
      format: 'board',
      columns: board,
    });
  }

  return NextResponse.json({
    project: { id: project.id, slug: project.slug, name: project.name },
    format: 'flat',
    count: items.length,
    items,
  });
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
        actorName: authCtx.userId ? 'User' : 'API',
      });
      if (!bulkRes.success) {
        return NextResponse.json({ error: bulkRes.error }, { status: bulkRes.status || 400 });
      }
      return NextResponse.json(
        { success: true, count: bulkRes.count, items: bulkRes.items },
        { status: 201 }
      );
    }

    const { project_id, project_slug, parent_id, external_ref_id, item_type, status, title, description, assignee, metadata, prev_order, next_order } = body;

    if (!title) {
      return NextResponse.json({ error: '"title" is required' }, { status: 400 });
    }

    // Resolve project
    let projId = project_id;
    let projectSettings: any = null;

    if (!projId && project_slug) {
      const { data: p } = await supabaseAdmin
        .from('projects')
        .select('id, settings')
        .eq('tenant_id', authCtx.tenant.id)
        .eq('slug', project_slug)
        .single();
      if (p) {
        projId = p.id;
        projectSettings = p.settings;
      }
    } else if (projId) {
      const { data: p } = await supabaseAdmin
        .from('projects')
        .select('id, settings')
        .eq('tenant_id', authCtx.tenant.id)
        .eq('id', projId)
        .single();
      if (p) projectSettings = p.settings;
    }

    if (!projId) {
      return NextResponse.json({ error: 'Valid project_id or project_slug required' }, { status: 400 });
    }

    const defaultStatus = projectSettings?.statuses?.[0]?.id || 'not_started';
    const defaultType = projectSettings?.hierarchy?.[projectSettings.hierarchy.length - 1]?.type || 'task';
    const resolvedType = item_type || defaultType;
    const resolvedStatus = status || defaultStatus;

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
    if (!prev_order && !next_order) {
      const { data: lastItem } = await supabaseAdmin
        .from('work_items')
        .select('order_index')
        .eq('project_id', projId)
        .order('order_index', { ascending: false })
        .limit(1)
        .single();
      calculatedOrder = lastItem?.order_index ? lastItem.order_index + 1000.0 : 1000.0;
    }

    const payload = {
      tenant_id: authCtx.tenant.id,
      project_id: projId,
      parent_id: parent_id || null,
      external_ref_id: external_ref_id || null,
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
    recordAuditLog({
      tenant_id: authCtx.tenant.id,
      project_id: projId,
      item_id: created.id,
      actor_id: authCtx.userId || null,
      actor_name: authCtx.userId ? 'User' : 'API Client',
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
              projectSlug: project_slug,
              item: created,
              beforeItem: null,
              actorId: authCtx.userId || null,
              actorName: authCtx.userId ? 'User' : 'API Client',
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
      const bulkRes = await handleBulkUpdateItems(authCtx.tenant.id, body, {
        tenantSlug: authCtx.tenant.slug,
        actorId: authCtx.userId || null,
        actorName: authCtx.userId ? 'User' : 'API',
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
      prev_order,
      next_order,
      parent_id,
      external_ref_id,
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

    const updateFields: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (title !== undefined) updateFields.title = title;
    if (description !== undefined) updateFields.description = description;
    if (assignee !== undefined) updateFields.assignee = assignee;

    if (metadata !== undefined) {
      if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) {
        return NextResponse.json({ error: '"metadata" must be an object' }, { status: 400 });
      }
      updateFields.metadata = metadata;
    }

    // Validate item_type
    if (item_type !== undefined) {
      if (projectSettings?.hierarchy?.length) {
        const typeValid = projectSettings.hierarchy.some((h: any) => h.type === item_type);
        if (!typeValid) {
          return NextResponse.json(
            {
              error: `Invalid item_type '${item_type}'. Allowed types: [${projectSettings.hierarchy
                .map((h: any) => h.type)
                .join(', ')}]`,
            },
            { status: 422 }
          );
        }
      }
      updateFields.item_type = item_type;
    }

    // Validate status
    if (status !== undefined) {
      if (projectSettings?.statuses?.length) {
        const statusValid = projectSettings.statuses.some((s: any) => s.id === status);
        if (!statusValid) {
          return NextResponse.json(
            {
              error: `Invalid status '${status}'. Allowed statuses: [${projectSettings.statuses
                .map((s: any) => s.id)
                .join(', ')}]`,
            },
            { status: 422 }
          );
        }
      }
      updateFields.status = status;
    }

    // Validate and persist external_ref_id
    if (external_ref_id !== undefined) {
      if (external_ref_id !== null && typeof external_ref_id === 'string' && external_ref_id.trim() !== '') {
        const trimmedRef = external_ref_id.trim();
        const { data: conflict } = await supabaseAdmin
          .from('work_items')
          .select('id')
          .eq('tenant_id', authCtx.tenant.id)
          .eq('project_id', existingItem.project_id)
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
    const effectiveType = item_type !== undefined ? item_type : existingItem.item_type;
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

      if (parentItem.project_id !== existingItem.project_id) {
        return NextResponse.json({ error: 'Parent item must belong to the same project' }, { status: 400 });
      }

      if (projectSettings?.hierarchy?.length) {
        const nestCheck = validateHierarchyNesting(parentItem.item_type, effectiveType, projectSettings.hierarchy);
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

    if (prev_order !== undefined || next_order !== undefined) {
      updateFields.order_index = calculateOrderIndex(prev_order, next_order);
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

    // Record audit diff if fields changed
    const diff = computeChangedFields(existingItem, updated);
    if (Object.keys(diff).length > 0) {
      recordAuditLog({
        tenant_id: authCtx.tenant.id,
        project_id: existingItem.project_id,
        item_id: id,
        actor_id: authCtx.userId || null,
        actor_name: authCtx.userId ? 'User' : 'API Client',
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
                projectId: existingItem.project_id,
                item: updated,
                beforeItem: existingItem,
                actorId: authCtx.userId || null,
                actorName: authCtx.userId ? 'User' : 'API Client',
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
    recordAuditLog({
      tenant_id: authCtx.tenant.id,
      project_id: softDeleted.project_id,
      item_id: id,
      actor_id: authCtx.userId || null,
      actor_name: authCtx.userId ? 'User' : 'API Client',
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

