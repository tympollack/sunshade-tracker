import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  const { searchParams } = new URL(req.url);
  const tenantSlugFilter = searchParams.get('tenant_slug');

  const { data: projects, error } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('tenant_id', authCtx.tenant.id)
    .is('deleted_at', null) // exclude soft-deleted projects
    .order('created_at', { ascending: true });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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

    const newProject = {
      tenant_id: authCtx.tenant.id,
      name,
      slug: slug.toLowerCase().replace(/[^a-z0-9-_]/g, '-'),
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
 * Body: { id: string }
 *
 * Soft-deletes a project. Sets deleted_at timestamp — the project and its items
 * will be filtered from all queries but remain recoverable in the database.
 * Note: items are NOT cascaded here; they remain until explicitly deleted.
 */
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

    const now = new Date().toISOString();

    // Soft-delete the project
    const { data: softDeleted, error: projectErr } = await supabaseAdmin
      .from('projects')
      .update({ deleted_at: now, updated_at: now })
      .eq('id', id)
      .eq('tenant_id', authCtx.tenant.id)
      .is('deleted_at', null) // guard against double-delete
      .select('id, slug, name, deleted_at')
      .single();

    if (projectErr) {
      return NextResponse.json({ error: projectErr.message }, { status: 400 });
    }

    if (!softDeleted) {
      return NextResponse.json(
        { error: 'Project not found or already deleted' },
        { status: 404 }
      );
    }

    // Cascade soft-delete to all work items in this project
    const { error: cascadeErr } = await supabaseAdmin
      .from('work_items')
      .update({ deleted_at: now, updated_at: now })
      .eq('project_id', id)
      .eq('tenant_id', authCtx.tenant.id)
      .is('deleted_at', null);

    if (cascadeErr) {
      // Restore the project so we don't leave it in a partially-deleted state
      await supabaseAdmin
        .from('projects')
        .update({ deleted_at: null, updated_at: now })
        .eq('id', id);
      return NextResponse.json(
        { error: `Project restored: failed to cascade-delete items — ${cascadeErr.message}` },
        { status: 500 }
      );
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
