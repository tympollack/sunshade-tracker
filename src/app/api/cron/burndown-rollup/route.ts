import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import {
  isItemCompleted,
  getCompletedStatusSet,
  calculateSprintLeafPoints,
} from '@/lib/sprint-utils';

interface RollupResult {
  sprint_id: string;
  project_id: string;
  tenant_id: string;
  committed_points: number;
  remaining_points: number;
  ideal_burn: number;
  current_day_index: number;
  total_sprint_days: number;
  actor_attribution: Record<string, number>;
  snapshot_id?: string;
}

export async function POST(req: NextRequest) {
  try {
    // 1. Validate Authorization header
    const authHeader = req.headers.get('authorization') || '';
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid or missing bearer cron secret' },
        { status: 401 }
      );
    }

    // 2. Query all active, non-archived projects
    let projQuery: any = supabaseAdmin
      .from('projects')
      .select('id, tenant_id, name, slug, settings');

    if (typeof projQuery.is === 'function') {
      projQuery = projQuery.is('deleted_at', null);
      if (typeof projQuery.is === 'function') {
        projQuery = projQuery.is('archived_at', null);
      }
    }

    const { data: projects, error: projErr } = await projQuery;

    if (projErr) {
      return NextResponse.json(
        { error: `Failed to fetch projects: ${projErr.message}` },
        { status: 500 }
      );
    }

    const results: RollupResult[] = [];
    const now = new Date();
    const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();

    for (const project of projects || []) {
      // Filter out archived projects configured in project settings or columns
      if (
        (project as any).archived_at ||
        (project as any).deleted_at ||
        project.settings?.archived === true ||
        project.settings?.archived === 'true' ||
        project.settings?.is_archived === true
      ) {
        continue;
      }

      const activeSprints: any[] = [];

      // Check tracker.sprints table
      try {
        const { data: dbSprints } = await supabaseAdmin
          .from('sprints')
          .select('*')
          .eq('project_id', project.id)
          .or('is_active.eq.true,status.eq.active,status.eq.in_progress');

        if (dbSprints && dbSprints.length > 0) {
          activeSprints.push(...dbSprints);
        }
      } catch {
        // Table might not exist in all environments
      }

      // Check project settings
      const settingsSprints = project.settings?.sprint_settings?.sprints || [];
      for (const s of settingsSprints) {
        const isActive = s.is_active === true || s.status === 'active' || s.status === 'in_progress' || s.is_current === true;
        if (isActive && !activeSprints.some((ex) => ex.id === s.id || ex.name === s.name)) {
          activeSprints.push(s);
        }
      }

      const completedStatusSet = getCompletedStatusSet(project.settings?.statuses);

      // Process each active sprint
      for (const sprint of activeSprints) {
        const sprintIdentifier = sprint.id || sprint.name;
        const sprintName = sprint.name || sprint.id;

        // Query work items for this project
        let itemQuery: any = supabaseAdmin
          .from('work_items')
          .select('id, parent_id, external_ref_id, metadata, status, assignee')
          .eq('project_id', project.id);

        if (typeof itemQuery.is === 'function') {
          itemQuery = itemQuery.is('deleted_at', null);
        }

        const { data: items, error: itemsErr } = await itemQuery;

        if (itemsErr) {
          continue;
        }

        const sprintItems = (items || []).filter((item: any) => {
          const itemSprint = item.metadata?.sprint || item.metadata?.sprint_id;
          return itemSprint === sprintIdentifier || itemSprint === sprintName;
        });

        // Filter out completed items using comprehensive completion set
        const uncompletedSprintItems = sprintItems.filter(
          (item: any) => !isItemCompleted(item.status, completedStatusSet)
        );

        // Aggregate remaining points exclusively across leaf items to prevent parent-child double-counting
        const remainingPoints = calculateSprintLeafPoints(uncompletedSprintItems as any);

        // Aggregate completed items in the last 24h from sprint_events
        const actorAttribution: Record<string, number> = {};
        try {
          const { data: recentEvents } = await supabaseAdmin
            .from('sprint_events')
            .select('actor_id, points_delta, event_type, occurred_at')
            .eq('project_id', project.id)
            .eq('sprint_id', sprintIdentifier)
            .gte('occurred_at', twentyFourHoursAgo);

          if (recentEvents) {
            for (const ev of recentEvents) {
              const actorKey = ev.actor_id || 'unassigned';
              const delta = Math.abs(Number(ev.points_delta) || 0);
              actorAttribution[actorKey] = (actorAttribution[actorKey] || 0) + delta;
            }
          }
        } catch {
          // sprint_events fallback
        }

        // Query initial baseline committed points (explicit presence check preserving 0)
        let baselinePoints: number | null = null;
        let committedItemIds: string[] = [];

        try {
          const { data: baselineSnapshot } = await supabaseAdmin
            .from('sprint_snapshots')
            .select('committed_points, committed_item_ids')
            .eq('project_id', project.id)
            .eq('sprint_id', sprintIdentifier)
            .eq('snapshot_type', 'commitment_baseline')
            .maybeSingle();

          if (baselineSnapshot && typeof baselineSnapshot.committed_points === 'number') {
            baselinePoints = Number(baselineSnapshot.committed_points);
            committedItemIds = baselineSnapshot.committed_item_ids || [];
          }
        } catch {
          // sprint_snapshots fallback
        }

        if (baselinePoints === null) {
          const sprintCommit = sprint.committed_points ?? sprint.metadata?.committed_points;
          if (typeof sprintCommit === 'number') {
            baselinePoints = Number(sprintCommit);
          } else {
            baselinePoints = remainingPoints;
          }
        }

        // Calculate schedule and ideal burn
        const startDateStr = sprint.started_at || sprint.start_date || sprint.metadata?.start_date;
        const endDateStr = sprint.ends_at || sprint.end_date || sprint.metadata?.end_date;

        let totalSprintDays = 14;
        let currentDayIndex = 1;

        if (startDateStr && endDateStr) {
          const start = new Date(startDateStr).getTime();
          const end = new Date(endDateStr).getTime();
          totalSprintDays = Math.max(1, Math.round((end - start) / (1000 * 60 * 60 * 24)));
          currentDayIndex = Math.min(
            totalSprintDays,
            Math.max(1, Math.floor((now.getTime() - start) / (1000 * 60 * 60 * 24)) + 1)
          );
        }

        const idealBurn = Math.max(
          0,
          Math.round((baselinePoints - (baselinePoints / totalSprintDays) * currentDayIndex) * 10) / 10
        );

        const breakdownPayload = {
          actors: actorAttribution,
          ideal_burn: idealBurn,
          day_index: currentDayIndex,
          total_days: totalSprintDays,
        };

        // Check if a daily_rollup already exists for today
        let existingId: string | null = null;
        try {
          const { data: existingSnapshot } = await supabaseAdmin
            .from('sprint_snapshots')
            .select('id')
            .eq('project_id', project.id)
            .eq('sprint_id', sprintIdentifier)
            .eq('snapshot_type', 'daily_rollup')
            .gte('captured_at', startOfToday)
            .maybeSingle();

          if (existingSnapshot) {
            existingId = existingSnapshot.id;
          }
        } catch {
          // ignore
        }

        let snapshotId: string | undefined;
        let mutationError: string | undefined;

        if (existingId) {
          const { error: updateErr } = await supabaseAdmin
            .from('sprint_snapshots')
            .update({
              committed_points: baselinePoints,
              remaining_points: remainingPoints,
              assignee_breakdown: breakdownPayload,
              captured_at: now.toISOString(),
            })
            .eq('id', existingId);

          if (updateErr) {
            console.error(`[burndown-rollup] Update error: ${updateErr.message}`);
            mutationError = updateErr.message;
          } else {
            snapshotId = existingId;
          }
        } else {
          const { data: inserted, error: insertErr } = await supabaseAdmin
            .from('sprint_snapshots')
            .insert({
              tenant_id: project.tenant_id,
              project_id: project.id,
              sprint_id: sprintIdentifier,
              snapshot_type: 'daily_rollup',
              committed_points: baselinePoints,
              remaining_points: remainingPoints,
              committed_item_ids: committedItemIds,
              assignee_breakdown: breakdownPayload,
              captured_at: now.toISOString(),
            })
            .select('id')
            .maybeSingle();

          if (insertErr) {
            console.error(`[burndown-rollup] Insert error: ${insertErr.message}`);
            mutationError = insertErr.message;
          } else if (inserted) {
            snapshotId = inserted.id;
          }
        }

        results.push({
          sprint_id: sprintIdentifier,
          project_id: project.id,
          tenant_id: project.tenant_id,
          committed_points: baselinePoints,
          remaining_points: remainingPoints,
          ideal_burn: idealBurn,
          current_day_index: currentDayIndex,
          total_sprint_days: totalSprintDays,
          actor_attribution: actorAttribution,
          snapshot_id: snapshotId,
          ...(mutationError ? { error: mutationError } : {}),
        });
      }
    }

    const successfulRollups = results.filter((r: any) => !r.error);

    return NextResponse.json({
      success: results.every((r: any) => !r.error),
      timestamp: now.toISOString(),
      rollups_processed: successfulRollups.length,
      rollups_total: results.length,
      rollups: results,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal error processing burndown rollup' },
      { status: 500 }
    );
  }
}
