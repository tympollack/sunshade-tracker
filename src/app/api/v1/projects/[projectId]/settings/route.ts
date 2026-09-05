import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';
import { ProjectSettings } from '@/types/tracker';

interface RouteContext {
  params: Promise<{ projectId: string }>;
}

/**
 * GET /api/v1/projects/[projectId]/settings
 *
 * Returns the JSONB settings (hierarchy, statuses, custom_fields) for a project.
 * Accepts both session-based and API key auth so the dashboard and headless clients
 * can both retrieve schema config.
 */
export async function GET(req: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);

  let query: any = supabaseAdmin
    .from('projects')
    .select('id, slug, name, settings')
    .eq('tenant_id', authCtx.tenant.id);

  if (typeof query.is === 'function') {
    query = query.is('deleted_at', null);
  }

  if (isUuid) {
    query = query.eq('id', projectId);
  } else {
    query = query.eq('slug', projectId);
  }

  const { data: project, error: projErr } = await query.single();

  if (projErr || !project) {
    return NextResponse.json({ error: `Project '${projectId}' not found` }, { status: 404 });
  }

  return NextResponse.json({
    project_id: project.id,
    project_slug: project.slug,
    project_name: project.name,
    settings: project.settings,
  });
}

/**
 * PUT /api/v1/projects/[projectId]/settings
 *
 * Replaces the project settings JSONB. Accepts both session and API key auth.
 */
export async function PUT(req: NextRequest, context: RouteContext) {
  const { projectId } = await context.params;
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  const body = await req.json();
  const settings = body.settings as ProjectSettings;

  if (!settings || !Array.isArray(settings.hierarchy) || !Array.isArray(settings.statuses)) {
    return NextResponse.json(
      { error: 'Invalid settings payload. Must contain "hierarchy" and "statuses" arrays.' },
      { status: 400 }
    );
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(projectId);

  let query: any = supabaseAdmin
    .from('projects')
    .update({ settings, updated_at: new Date().toISOString() })
    .eq('tenant_id', authCtx.tenant.id);

  if (typeof query.is === 'function') {
    query = query.is('deleted_at', null);
  }

  if (isUuid) {
    query = query.eq('id', projectId);
  } else {
    query = query.eq('slug', projectId);
  }

  const { data: updated, error: updateErr } = await query.select().single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    project: updated,
  });
}
