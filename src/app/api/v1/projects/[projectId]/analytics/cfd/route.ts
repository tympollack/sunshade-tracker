import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';
import { generateCfdSeries } from '@/lib/analytics/flow-diagnostics';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CFD_DAYS = 90;

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
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'Project identifier is required' }, { status: 400 });
    }

    // 2. Validate project ownership and permissions safely without SQL/PostgREST injection
    const isUuid = UUID_REGEX.test(projectId.trim());
    let projectQuery = supabaseAdmin
      .from('projects')
      .select('id, name, slug, tenant_id')
      .eq('tenant_id', authCtx.tenant.id)
      .is('deleted_at', null);

    if (isUuid) {
      projectQuery = projectQuery.eq('id', projectId.trim());
    } else {
      projectQuery = projectQuery.eq('slug', projectId.trim());
    }

    const { data: project, error: projErr } = await projectQuery.maybeSingle();

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

    // 3. Resolve and validate bounded date range
    const { searchParams } = new URL(req.url);
    const now = new Date();
    const defaultStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const defaultEnd = now.toISOString().split('T')[0];

    const startDate = searchParams.get('startDate') || defaultStart;
    const endDate = searchParams.get('endDate') || defaultEnd;

    const startMs = new Date(`${startDate}T00:00:00.000Z`).getTime();
    const endMs = new Date(`${endDate}T23:59:59.999Z`).getTime();

    if (isNaN(startMs) || isNaN(endMs) || startMs > endMs) {
      return NextResponse.json(
        { error: 'Invalid startDate or endDate query parameter format' },
        { status: 400 }
      );
    }

    const requestedDays = Math.ceil((endMs - startMs) / (1000 * 60 * 60 * 24));
    if (requestedDays > MAX_CFD_DAYS) {
      return NextResponse.json(
        {
          error: `Requested date range (${requestedDays} days) exceeds maximum allowed window of ${MAX_CFD_DAYS} days`,
        },
        { status: 400 }
      );
    }

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
      const { data: evData, error: evErr } = await supabaseAdmin
        .from('sprint_events')
        .select('*')
        .eq('project_id', project.id)
        .order('occurred_at', { ascending: true });

      if (evErr) {
        return NextResponse.json(
          { error: `Failed to fetch project events: ${evErr.message}` },
          { status: 500 }
        );
      }
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
