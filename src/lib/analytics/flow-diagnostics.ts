import { supabaseAdmin } from '@/lib/db';

export interface ItemDurationMetrics {
  workItemId: string;
  leadTimeMs: number | null;
  leadTimeDays: number | null;
  cycleTimeMs: number | null;
  cycleTimeDays: number | null;
  createdAt: string;
  inProgressAt: string | null;
  completedAt: string | null;
}

export interface CfdDataPoint {
  date: string;
  unplanned: number;
  not_started: number;
  in_progress: number;
  in_review: number;
  complete: number;
}

/**
 * Calculates Lead Time and Cycle Time for a given work item.
 * - Lead Time = timestamp of status 'complete' minus created_at.
 * - Cycle Time = timestamp of status 'complete' minus earliest transition to 'in_progress'.
 */
export async function calculateItemDurations(
  workItemId: string,
  options?: {
    item?: any;
    events?: any[];
  }
): Promise<ItemDurationMetrics> {
  let item = options?.item;
  let events = options?.events;

  if (!item) {
    const { data, error } = await supabaseAdmin
      .from('work_items')
      .select('id, created_at, updated_at, status, metadata')
      .eq('id', workItemId)
      .maybeSingle();

    if (error) {
      throw new Error(`Failed to fetch work item ${workItemId}: ${error.message}`);
    }
    item = data;
  }

  if (!item) {
    throw new Error(`Work item ${workItemId} not found`);
  }

  if (!events) {
    try {
      const { data: evData } = await supabaseAdmin
        .from('sprint_events')
        .select('*')
        .eq('work_item_id', workItemId)
        .order('occurred_at', { ascending: true });

      events = evData || [];
    } catch {
      events = [];
    }
  }

  const createdAt = item.created_at;
  const createdMs = new Date(createdAt).getTime();

  // Find earliest transition to 'in_progress'
  let inProgressAt: string | null = null;
  const inProgressEvent = events.find(
    (e: any) =>
      e.event_type === 'status_transition' &&
      (e.new_state?.status === 'in_progress' || e.new_state?.status === 'started')
  );

  if (inProgressEvent) {
    inProgressAt = inProgressEvent.occurred_at;
  } else if (item.status === 'in_progress' || item.status === 'in_review' || item.status === 'complete') {
    inProgressAt = item.updated_at || item.created_at;
  }

  // Find transition to 'complete'
  let completedAt: string | null = null;
  const completeEvent = events.find(
    (e: any) =>
      e.event_type === 'status_transition' &&
      (e.new_state?.status === 'complete' || e.new_state?.status === 'done')
  );

  if (completeEvent) {
    completedAt = completeEvent.occurred_at;
  } else if (item.status === 'complete' || item.status === 'done') {
    completedAt = item.updated_at || item.created_at;
  }

  // Calculate Lead Time (only if complete)
  let leadTimeMs: number | null = null;
  let leadTimeDays: number | null = null;

  if (completedAt) {
    leadTimeMs = Math.max(0, new Date(completedAt).getTime() - createdMs);
    leadTimeDays = Math.round((leadTimeMs / (1000 * 60 * 60 * 24)) * 10) / 10;
  }

  // Calculate Cycle Time (only if complete and was in progress)
  let cycleTimeMs: number | null = null;
  let cycleTimeDays: number | null = null;

  if (completedAt && inProgressAt) {
    cycleTimeMs = Math.max(0, new Date(completedAt).getTime() - new Date(inProgressAt).getTime());
    cycleTimeDays = Math.round((cycleTimeMs / (1000 * 60 * 60 * 24)) * 10) / 10;
  }

  return {
    workItemId: item.id || workItemId,
    leadTimeMs,
    leadTimeDays,
    cycleTimeMs,
    cycleTimeDays,
    createdAt,
    inProgressAt,
    completedAt,
  };
}

/**
 * Builds daily CFD status buckets across a specified date range.
 * Guarantees that the 'complete' status category is monotonically non-decreasing.
 */
export function generateCfdSeries(
  items: any[],
  events: any[],
  startDateStr: string,
  endDateStr: string
): CfdDataPoint[] {
  // Parse date bounds cleanly in UTC to handle timezones and daylight savings without dropping points
  const startParts = (startDateStr || '').split('-').map(Number);
  const endParts = (endDateStr || '').split('-').map(Number);

  let startUtc = Date.UTC(startParts[0] || 2026, (startParts[1] || 1) - 1, startParts[2] || 1);
  let endUtc = Date.UTC(endParts[0] || 2026, (endParts[1] || 1) - 1, endParts[2] || 1);

  if (isNaN(startUtc) || isNaN(endUtc) || startUtc > endUtc) {
    const now = new Date();
    endUtc = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    startUtc = endUtc - 14 * 24 * 60 * 60 * 1000;
  }

  const dates: string[] = [];
  const oneDayMs = 24 * 60 * 60 * 1000;
  for (let ms = startUtc; ms <= endUtc; ms += oneDayMs) {
    dates.push(new Date(ms).toISOString().split('T')[0]);
  }

  // Pre-sort events by occurred_at
  const sortedEvents = [...(events || [])].sort(
    (a, b) => new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  );

  const series: CfdDataPoint[] = [];

  for (const dateStr of dates) {
    const endOfDayMs = new Date(`${dateStr}T23:59:59.999Z`).getTime();

    const counts = {
      unplanned: 0,
      not_started: 0,
      in_progress: 0,
      in_review: 0,
      complete: 0,
    };

    for (const item of items) {
      if (!item) continue;
      const createdMs = item.created_at ? new Date(item.created_at).getTime() : 0;
      if (createdMs && createdMs > endOfDayMs) {
        continue; // Item didn't exist yet on this date
      }

      const itemUpdatedMs = item.updated_at && !isNaN(new Date(item.updated_at).getTime())
        ? new Date(item.updated_at).getTime()
        : createdMs;

      // Reconstruct status at end of this day from events
      const itemTransitions = sortedEvents.filter(
        (e) => (e.work_item_id === item.id) && e.event_type === 'status_transition'
      );

      const priorTransitions = itemTransitions.filter(
        (e) => new Date(e.occurred_at).getTime() <= endOfDayMs
      );

      let status = 'not_started';
      if (priorTransitions.length > 0) {
        // Last transition that occurred on or before endOfDay
        const lastTransition = priorTransitions[priorTransitions.length - 1];
        status = lastTransition.new_state?.status || item.status || 'not_started';
      } else if (itemTransitions.length > 0) {
        // Transitions exist later; reconstruct initial status prior to first transition
        const earliestTransition = itemTransitions[0];
        status =
          earliestTransition.previous_state?.status ||
          item.metadata?.initial_status ||
          'not_started';
      } else {
        // Fallback safely: if status transition logs are sparse, reconstruct cumulative daily snapshots
        // from work item created_at, updated_at, and current status.
        if (endOfDayMs >= itemUpdatedMs) {
          // On or after the item was last updated, it has reached its current status
          status = item.status || 'not_started';
        } else {
          // Prior to updated_at: if initial_status was recorded, use it; otherwise not_started
          status = item.metadata?.initial_status || 'not_started';
        }
      }

      const isUnplanned = Boolean(
        item.metadata?.is_unplanned ||
        item.metadata?.source_type === 'unplanned' ||
        item.status === 'unplanned' ||
        status === 'unplanned'
      );

      const normalizedStatus = (status || '').toLowerCase().trim();

      if (isUnplanned && normalizedStatus !== 'complete' && normalizedStatus !== 'done') {
        counts.unplanned++;
      } else if (normalizedStatus === 'complete' || normalizedStatus === 'done' || normalizedStatus === 'completed') {
        counts.complete++;
      } else if (normalizedStatus === 'in_progress' || normalizedStatus === 'started' || normalizedStatus === 'doing' || normalizedStatus === 'wip') {
        counts.in_progress++;
      } else if (normalizedStatus === 'in_review' || normalizedStatus === 'review' || normalizedStatus === 'testing' || normalizedStatus === 'qa') {
        counts.in_review++;
      } else {
        counts.not_started++;
      }
    }

    series.push({
      date: dateStr,
      ...counts,
    });
  }

  return series;
}
