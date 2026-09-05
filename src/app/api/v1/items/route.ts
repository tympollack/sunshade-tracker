import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';
import { calculateOrderIndex, validateHierarchyNesting } from '@/lib/fractional-index';
import { WorkItem, WorkItemWithChildren } from '@/types/tracker';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  const { searchParams } = new URL(req.url);
  const projectSlug = searchParams.get('project_slug');
  const projectIdParam = searchParams.get('project_id');
  const format = searchParams.get('format') || 'flat'; // 'flat' | 'tree' | 'board'
  const statusFilter = searchParams.get('status');
  const typeFilter = searchParams.get('item_type');

  if (!projectSlug && !projectIdParam) {
    return NextResponse.json(
      { error: 'Specify "project_slug" or "project_id" in query params' },
      { status: 400 }
    );
  }

  // Resolve project (active only — not soft-deleted)
  let projectQuery = supabaseAdmin
    .from('projects')
    .select('id, slug, name, settings')
    .eq('tenant_id', authCtx.tenant.id)
    .is('deleted_at', null);

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
  let itemsQuery = supabaseAdmin
    .from('work_items')
    .select('*')
    .eq('tenant_id', authCtx.tenant.id)
    .eq('project_id', project.id)
    .is('deleted_at', null)
    .order('order_index', { ascending: true });

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
    const { id, title, description, status, item_type, assignee, metadata, prev_order, next_order, parent_id } = body;

    if (!id) {
      return NextResponse.json({ error: '"id" is required' }, { status: 400 });
    }

    const updateFields: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (title !== undefined) updateFields.title = title;
    if (description !== undefined) updateFields.description = description;
    if (status !== undefined) updateFields.status = status;
    if (item_type !== undefined) updateFields.item_type = item_type;
    if (assignee !== undefined) updateFields.assignee = assignee;
    if (metadata !== undefined) updateFields.metadata = metadata;
    if (parent_id !== undefined) updateFields.parent_id = parent_id;

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
    const { id } = body;

    if (!id) {
      return NextResponse.json({ error: '"id" is required' }, { status: 400 });
    }

    // Soft-delete: set deleted_at timestamp, do NOT destroy the row
    const { data: softDeleted, error } = await supabaseAdmin
      .from('work_items')
      .update({
        deleted_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', authCtx.tenant.id) // Enforce tenant isolation
      .is('deleted_at', null)             // Only delete active items
      .select('id, deleted_at')
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

    return NextResponse.json({
      success: true,
      soft_deleted_id: id,
      deleted_at: softDeleted.deleted_at,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
