import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { authenticateApiKey } from '@/lib/auth-guard';

export async function GET(req: NextRequest) {
  const auth = await authenticateApiKey(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  const { data: projects, error } = await supabaseAdmin
    .from('projects')
    .select('*')
    .eq('tenant_id', authCtx.tenant.id)
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
  const auth = await authenticateApiKey(req);
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
