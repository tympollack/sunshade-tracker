import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';
import { generateCfdSeries } from '@/lib/analytics/flow-diagnostics';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    // 1. Authenticate caller
    const auth = await authenticate(req);
    if (auth.errorResponse) return auth.errorResponse;
    const authCtx = auth.context;

    const { projectId } = await params;
    if (!projectId) {
      return NextResponse.json({ error: 'Project identifier is required' }, { status: 400 });
    }

    // 2. Validate project ownership and permissions
    const { data: project, error: projErr } = await supabaseAdmin
      .from('projects')
      .select('id, name, slug, tenant_id')
      .eq('tenant_id', authCtx.tenant.id)
      .or(`id.eq.${projectId},slug.eq.${projectId}`)
      .is('deleted_at', null)
      .maybeSingle();

    if (projErr) {
      return NextResponse.json(
        { error: `Database error validating project: ${projErr.message}` },
        { status: 500 }
      );
    }

    if (!project) {
      return NextResponse.json(
        { error: `Project '${projectId}' not found in workspace '${authCtx.tenant.slug}'` },
        { status: 404 }
      );
    }

    // 3. Resolve date range
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const defaultStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const defaultEnd = now.toISOString().split('T')[0];

    const startDate = searchParams.get('startDate') || defaultStart;
    const endDate = searchParams.get('endDate') || defaultEnd;

    // 4. Fetch project items and scope events
    const { data: items, error: itemsErr } = await supabaseAdmin
      .from('work_items')
      .select('id, title, status, item_type, metadata, created_at, updated_at')
      .eq('project_id', project.id)
      .is('deleted_at', null);

    if (itemsErr) {
      return NextResponse.json(
        { error: `Failed to fetch project work items: ${itemsErr.message}` },
        { status: 500 }
      );
    }

    let events: any[] = [];
    try {
      const { data: evData } = await supabaseAdmin
        .from('sprint_events')
        .select('*')
        .eq('project_id', project.id)
        .order('occurred_at', { ascending: true });

      if (evData) {
        events = evData;
      }
    } catch {
      // sprint_events table fallback
    }

    // 5. Generate daily CFD series
    const cfdSeries = generateCfdSeries(items || [], events, startDate, endDate);

    return NextResponse.json({
      project_id: project.id,
      project_slug: project.slug,
      start_date: startDate,
      end_date: endDate,
      series: cfdSeries,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal error calculating CFD telemetry' },
      { status: 500 }
    );
  }
}
