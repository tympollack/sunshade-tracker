import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';

/**
 * POST /api/v1/projects/restore
 * Body: { id?: string, slug?: string }
 *
 * Restores a soft-deleted project and all its cascaded work items.
 * Viewers are forbidden from restoring projects.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  if (authCtx.role === 'viewer') {
    return NextResponse.json({ error: 'Viewers cannot restore projects' }, { status: 403 });
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
        .not('deleted_at', 'is', null)
        .maybeSingle();

      if (projBySlug) {
        id = projBySlug.id;
      }
    }

    if (!id) {
      return NextResponse.json({ error: '"id" or "slug" is required' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // Check project exists and is archived
    const { data: archivedProject, error: fetchErr } = await supabaseAdmin
      .from('projects')
      .select('id, slug, name, deleted_at')
      .eq('id', id)
      .eq('tenant_id', authCtx.tenant.id)
      .not('deleted_at', 'is', null)
      .maybeSingle();

    if (fetchErr) {
      return NextResponse.json({ error: fetchErr.message }, { status: 500 });
    }

    if (!archivedProject) {
      return NextResponse.json(
        { error: 'Archived project not found or already active' },
        { status: 404 }
      );
    }

    // Restore the project
    const { data: restoredProject, error: updateErr } = await supabaseAdmin
      .from('projects')
      .update({ deleted_at: null, updated_at: now })
      .eq('id', id)
      .eq('tenant_id', authCtx.tenant.id)
      .select('id, slug, name, deleted_at')
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    // Restore cascaded work items
    await supabaseAdmin
      .from('work_items')
      .update({ deleted_at: null, updated_at: now })
      .eq('project_id', id)
      .eq('tenant_id', authCtx.tenant.id)
      .not('deleted_at', 'is', null);

    return NextResponse.json({
      success: true,
      restored_project: restoredProject,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
