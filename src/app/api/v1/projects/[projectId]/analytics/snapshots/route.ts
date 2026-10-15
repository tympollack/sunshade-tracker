import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';
import { BurndownDataPoint } from '@/components/analytics/BurndownChart';
import { calculateSprintLeafPoints, getCompletedStatusSet, isItemCompleted } from '@/lib/sprint-utils';

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

    // If snapshots are empty, compute live trajectory from sprint items so the chart renders immediately
    if (burndownData.length === 0 && sprintId) {
      try {
        const { data: projDetail } = await supabaseAdmin
          .from('projects')
          .select('settings')
          .eq('id', project.id)
          .maybeSingle();

        const { data: dbSprint } = await supabaseAdmin
          .from('sprints')
          .select('*')
          .eq('tenant_id', authCtx.tenant.id)
          .eq('project_id', project.id)
          .or(`id.eq.${sprintId},name.eq.${sprintId}`)
          .maybeSingle();

        const settingsSprint = projDetail?.settings?.sprint_settings?.sprints?.find(
          (s: any) => s.id === sprintId || s.name === sprintId
        );

        const sprintRecord = dbSprint || settingsSprint;
        const now = new Date();
        const startStr = sprintRecord?.started_at || sprintRecord?.start_date || new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString();
        const endStr = sprintRecord?.ends_at || sprintRecord?.end_date || now.toISOString();
        const startDate = new Date(startStr);
        const endDate = new Date(endStr);

        const { data: rawItems } = await supabaseAdmin
          .from('work_items')
          .select('id, parent_id, status, metadata, updated_at, created_at, assignee')
          .eq('tenant_id', authCtx.tenant.id)
          .eq('project_id', project.id)
          .is('deleted_at', null);

        const sprintItems = (rawItems || []).filter(
          (it: any) =>
            it.metadata?.sprint === sprintId ||
            it.metadata?.sprint === sprintRecord?.name ||
            it.metadata?.sprint_id === sprintId
        );

        if (sprintItems.length > 0) {
          const totalPoints = calculateSprintLeafPoints(sprintItems as any, projDetail?.settings);
          const completionSet = getCompletedStatusSet(projDetail?.settings?.statuses);

          const startDay = new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate());
          const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          const totalDays = Math.max(1, Math.round((endDate.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000)));
          const daysCount = Math.max(1, Math.min(90, Math.round((today.getTime() - startDay.getTime()) / (24 * 60 * 60 * 1000)) + 1));
          let prevActual: number | null = null;

          for (let d = 0; d < daysCount; d++) {
            const currentDay = new Date(startDay.getTime() + d * 24 * 60 * 60 * 1000);
            const currentDayEnd = new Date(currentDay.getTime() + 24 * 60 * 60 * 1000 - 1);
            const dateStr = currentDay.toISOString().split('T')[0];

            const completedSoFar = sprintItems.filter((it: any) => {
              if (!isItemCompleted(it.status, completionSet)) return false;
              const completedTime = it.updated_at ? new Date(it.updated_at).getTime() : 0;
              return completedTime <= currentDayEnd.getTime();
            });

            const completedPts = calculateSprintLeafPoints(completedSoFar as any, projDetail?.settings);
            const actualRemaining = Math.max(0, totalPoints - completedPts);
            const idealRemaining = Math.max(0, Math.round(totalPoints * (1 - d / totalDays)));
            const dailyVelocity = prevActual !== null ? Math.max(0, prevActual - actualRemaining) : undefined;
            prevActual = actualRemaining;

            burndownData.push({
              date: dateStr,
              idealRemaining,
              actualRemaining,
              dailyVelocity,
              hasScopeCreep: actualRemaining > totalPoints,
            });
          }
        }
      } catch {
        // Fallback gracefully to empty array
      }
    }

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
