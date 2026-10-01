import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';
import { BurndownDataPoint } from '@/components/analytics/BurndownChart';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  try {
    // 1. Authenticate caller (session or API key)
    const auth = await authenticate(req);
    if (auth.errorResponse) return auth.errorResponse;
    const authCtx = auth.context;

    const { projectId } = await params;
    if (!projectId || typeof projectId !== 'string') {
      return NextResponse.json({ error: 'Project identifier is required' }, { status: 400 });
    }

    // 2. Validate project ownership and workspace isolation
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

    // 3. Query sprint snapshots for selected sprint
    const { searchParams } = new URL(req.url);
    const sprintId =
      searchParams.get('sprint_id') ||
      searchParams.get('sprint_name') ||
      searchParams.get('sprint');

    const snapshotType = searchParams.get('snapshot_type') || 'daily_rollup';

    let snapshotQuery = supabaseAdmin
      .from('sprint_snapshots')
      .select('*')
      .eq('tenant_id', authCtx.tenant.id)
      .eq('project_id', project.id);

    if (snapshotType !== 'all') {
      snapshotQuery = snapshotQuery.eq('snapshot_type', snapshotType);
    }

    if (sprintId) {
      snapshotQuery = snapshotQuery.eq('sprint_id', sprintId);
    }

    const { data: snapshotsData, error: snapErr } = await snapshotQuery.order('captured_at', {
      ascending: true,
    });

    if (snapErr) {
      return NextResponse.json(
        { error: `Failed to fetch sprint snapshots: ${snapErr.message}` },
        { status: 500 }
      );
    }

    const snapshots = snapshotsData || [];

    // 4. Transform snapshots into BurndownDataPoint format for BurndownChart (daily rollups only)
    const dailyRollups = snapshots.filter((s: any) => s.snapshot_type !== 'commitment_baseline');
    let previousRemaining: number | null = null;
    const burndownData: BurndownDataPoint[] = dailyRollups.map((s: any) => {
      const breakdown = s.assignee_breakdown || {};
      const dateStr = s.captured_at ? new Date(s.captured_at).toISOString().split('T')[0] : '';
      const committed = Number(s.committed_points) || 0;
      const remaining = Number(s.remaining_points) || 0;
      const ideal =
        typeof breakdown.ideal_burn === 'number'
          ? breakdown.ideal_burn
          : committed;

      const dailyVelocity =
        previousRemaining !== null
          ? Math.max(0, previousRemaining - remaining)
          : undefined;
      previousRemaining = remaining;

      return {
        date: dateStr,
        idealRemaining: Math.max(0, ideal),
        actualRemaining: Math.max(0, remaining),
        dailyVelocity,
        contributorBreakdown: breakdown.actors || undefined,
        hasScopeCreep: remaining > committed,
      };
    });

    return NextResponse.json({
      project_id: project.id,
      project_slug: project.slug,
      sprint_id: sprintId || null,
      snapshots,
      burndownData,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal error retrieving burndown snapshots' },
      { status: 500 }
    );
  }
}
