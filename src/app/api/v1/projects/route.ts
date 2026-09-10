import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  const { searchParams } = new URL(req.url);
  const isArchived = searchParams.get('archived') === 'true';

  if (isArchived) {
    if (authCtx.role !== 'owner' && authCtx.role !== 'admin') {
      return NextResponse.json(
        { error: 'Only workspace owners and admins can view archived projects' },
        { status: 403 }
      );
    }
  }

  let query: any = supabaseAdmin
    .from('projects')
    .select('*')
    .eq('tenant_id', authCtx.tenant.id)
    .order('created_at', { ascending: true });

  if (isArchived) {
    query = query.not('deleted_at', 'is', null);
  } else {
    query = query.is('deleted_at', null);
  }

  const { data: projects, error } = await query;

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (isArchived) {
    const projectList = projects || [];
    const projectIds = projectList.map((p: any) => p.id);
    const itemCounts: Record<string, number> = {};

    if (projectIds.length > 0) {
      const { data: items } = await supabaseAdmin
        .from('work_items')
        .select('id, project_id')
        .in('project_id', projectIds);

      if (items) {
        for (const item of items) {
          itemCounts[item.project_id] = (itemCounts[item.project_id] || 0) + 1;
        }
      }
    }

    const enrichedProjects = projectList.map((p: any) => ({
      ...p,
      item_count: itemCounts[p.id] || 0,
    }));

    return NextResponse.json({
      tenant: { id: authCtx.tenant.id, slug: authCtx.tenant.slug, name: authCtx.tenant.name },
      projects: enrichedProjects,
    });
  }

  return NextResponse.json({
    tenant: { id: authCtx.tenant.id, slug: authCtx.tenant.slug, name: authCtx.tenant.name },
    projects: projects || [],
  });
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  try {
    const body = await req.json();
    const { name, slug, description, app_id, settings } = body;

    if (!name || !slug) {
      return NextResponse.json({ error: '"name" and "slug" are required' }, { status: 400 });
    }

    const sanitizedSlug = slug.toLowerCase().replace(/[^a-z0-9-_]/g, '-');
    if (sanitizedSlug === 'all' || sanitizedSlug === 'portfolio') {
      return NextResponse.json(
        { error: `The project slug "${sanitizedSlug}" is reserved for workspace overview.` },
        { status: 400 }
      );
    }

    const newProject = {
      tenant_id: authCtx.tenant.id,
      name,
      slug: sanitizedSlug,
      description: description || null,
      app_id: app_id || 'core',
      ...(settings ? { settings } : {}),
    };

    const { data: created, error } = await supabaseAdmin
      .from('projects')
      .insert(newProject)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true, project: created }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * DELETE /api/v1/projects
 * Body: { id?: string, slug?: string }
 *
 * Soft-deletes a project. Sets deleted_at timestamp — the project and its active
 * work items are soft-deleted and preserved.
 * Captures active item snapshot in project.settings.archival_snapshot to avoid
 * restoring items that were deleted prior to project archival.
 */
export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  if (authCtx.role !== 'owner' && authCtx.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only workspace owners and admins can archive projects' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    let { id, slug } = body;

    if (!id && slug) {
      const { data: projBySlug } = await supabaseAdmin
        .from('projects')
        .select('id')
        .eq('tenant_id', authCtx.tenant.id)
        .eq('slug', slug)
        .is('deleted_at', null)
        .maybeSingle();

      if (projBySlug) {
        id = projBySlug.id;
      }
    }

    if (!id) {
      return NextResponse.json({ error: '"id" or "slug" is required' }, { status: 400 });
    }

    // Fetch existing project to snapshot settings
    const { data: existingProject, error: fetchErr } = await supabaseAdmin
      .from('projects')
      .select('id, slug, name, settings')
      .eq('id', id)
      .eq('tenant_id', authCtx.tenant.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!existingProject) {
      return NextResponse.json(
        { error: 'Project not found or already deleted' },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();

    // Snapshot currently active work item IDs before soft-deleting
    const { data: activeItems, error: itemsErr } = await supabaseAdmin
      .from('work_items')
      .select('id')
      .eq('project_id', id)
      .eq('tenant_id', authCtx.tenant.id)
      .is('deleted_at', null);

    if (itemsErr) {
      return NextResponse.json({ error: itemsErr.message }, { status: 500 });
    }

    const activeItemIds = (activeItems || []).map((it: any) => it.id);

    const prevSettings = existingProject.settings || {};
    const updatedSettings = {
      ...prevSettings,
      archival_snapshot: {
        archived_at: now,
        cascaded_item_ids: activeItemIds,
      },
    };

    // Soft-delete the project and save archival snapshot in settings
    const { data: softDeleted, error: projectErr } = await supabaseAdmin
      .from('projects')
      .update({ deleted_at: now, updated_at: now, settings: updatedSettings })
      .eq('id', id)
      .eq('tenant_id', authCtx.tenant.id)
      .is('deleted_at', null)
      .select('id, slug, name, deleted_at')
      .single();

    if (projectErr) {
      return NextResponse.json({ error: projectErr.message }, { status: 400 });
    }

    // Cascade soft-delete ONLY to the active work items captured in the snapshot
    if (activeItemIds.length > 0) {
      const { error: cascadeErr } = await supabaseAdmin
        .from('work_items')
        .update({ deleted_at: now, updated_at: now })
        .in('id', activeItemIds);

      if (cascadeErr) {
        // Rollback project update so we don't leave it in a partially-deleted state
        await supabaseAdmin
          .from('projects')
          .update({ deleted_at: null, updated_at: now, settings: prevSettings })
          .eq('id', id);
        return NextResponse.json(
          { error: `Project restored: failed to cascade-delete items — ${cascadeErr.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({
      success: true,
      soft_deleted_project: {
        id: softDeleted.id,
        slug: softDeleted.slug,
        name: softDeleted.name,
        deleted_at: softDeleted.deleted_at,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
