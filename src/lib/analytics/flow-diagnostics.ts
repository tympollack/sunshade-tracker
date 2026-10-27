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
  endDateStr: string,
  projectSettings?: any
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

  // Extract project status mappings if configured
  const configuredCompleted = new Set<string>();
  const explicitlyExcludedFromComplete = new Set<string>();
  const configuredInProgress = new Set<string>();
  const configuredInReview = new Set<string>();
  const configuredUnstarted = new Set<string>();
  const explicitSchemaCategories = new Map<string, 'complete' | 'in_review' | 'in_progress' | 'not_started'>();

  const canonicalReviewAliases = new Set([
    'in_review',
    'review',
    'under_review',
    'code_review',
    'pr_review',
    'peer_review',
    'reviewing',
    'ready_for_review',
    'testing',
    'test',
    'in_testing',
    'qa',
    'qa_review',
    'in_qa',
    'sign_off',
    'audit',
  ]);

  if (Array.isArray(projectSettings?.statuses)) {
    for (const s of projectSettings.statuses) {
      const id = String(s.id || '').toLowerCase().trim();
      if (!id) continue;
      if (s.is_completed === true) {
        configuredCompleted.add(id);
      } else if (s.is_completed === false) {
        explicitlyExcludedFromComplete.add(id);
      }

      const cat = String(s.category || '').toLowerCase().trim();
      const normId = id.replace(/[\s\-_]+/g, '_');
      if (cat === 'in_review' || cat === 'review') {
        configuredInReview.add(id);
        explicitSchemaCategories.set(id, 'in_review');
        explicitSchemaCategories.set(normId, 'in_review');
      } else if (cat === 'in_progress') {
        configuredInProgress.add(id);
        explicitSchemaCategories.set(id, 'in_progress');
        explicitSchemaCategories.set(normId, 'in_progress');
      } else if (cat === 'not_started' || cat === 'unstarted') {
        configuredUnstarted.add(id);
        explicitSchemaCategories.set(id, 'not_started');
        explicitSchemaCategories.set(normId, 'not_started');
      } else if (cat === 'complete' || cat === 'completed') {
        configuredCompleted.add(id);
        explicitSchemaCategories.set(id, 'complete');
        explicitSchemaCategories.set(normId, 'complete');
      }
    }
  }

  // Resolve metric rules across all supported settings locations (top-level, nested sprint_settings, metadata)
  const metricRules =
    projectSettings?.sprint_metrics ||
    projectSettings?.metric_rules ||
    projectSettings?.sprint_settings?.metric_rules ||
    projectSettings?.sprint_settings?.metrics ||
    projectSettings?.sprint_settings?.sprint_metrics ||
    projectSettings?.metadata?.metric_rules ||
    projectSettings?.metadata?.sprint_metrics;

  if (Array.isArray(metricRules?.completed_statuses)) {
    metricRules.completed_statuses.forEach((st: string) => {
      const id = String(st).toLowerCase().trim();
      configuredCompleted.add(id);
      explicitlyExcludedFromComplete.delete(id);
    });
  }
  const inReviewList = metricRules?.in_review_statuses || metricRules?.review_statuses;
  const explicitMetricReviewStatuses = new Set<string>();
  if (Array.isArray(inReviewList)) {
    inReviewList.forEach((st: string) => {
      const id = String(st).toLowerCase().trim();
      const normId = id.replace(/[\s\-_]+/g, '_');
      configuredInReview.add(id);
      explicitMetricReviewStatuses.add(id);
      explicitMetricReviewStatuses.add(normId);
      configuredInProgress.delete(id);
      configuredInProgress.delete(normId);
    });
  }
  if (Array.isArray(metricRules?.in_progress_statuses)) {
    const defaultWipAliases = new Set(['in_progress', 'doing', 'review', 'in_review', 'qa', 'testing']);
    const isGenericDefaultList =
      metricRules.in_progress_statuses.length === defaultWipAliases.size &&
      metricRules.in_progress_statuses.every((st: string) => defaultWipAliases.has(String(st).toLowerCase().trim()));

    metricRules.in_progress_statuses.forEach((st: string) => {
      const id = String(st).toLowerCase().trim();
      const normId = id.replace(/[\s\-_]+/g, '_');

      // 1. Explicit schema assignment takes highest priority
      const explicitCat = explicitSchemaCategories.get(id) || explicitSchemaCategories.get(normId);
      if (explicitCat === 'in_progress') {
        configuredInProgress.add(id);
        configuredInReview.delete(id);
        configuredInReview.delete(normId);
        return;
      } else if (explicitCat === 'in_review') {
        configuredInReview.add(id);
        configuredInProgress.delete(id);
        configuredInProgress.delete(normId);
        return;
      }

      // 2. If review list was explicitly defined by metricRules.in_review_statuses, keep it authoritative
      if (explicitMetricReviewStatuses.has(id) || explicitMetricReviewStatuses.has(normId)) {
        return;
      }

      // 3. If from generic default WIP list and matches canonical review aliases, route to review
      if (isGenericDefaultList && (canonicalReviewAliases.has(normId) || canonicalReviewAliases.has(id))) {
        configuredInReview.add(id);
      } else {
        configuredInProgress.add(id);
      }
    });
  }
  if (Array.isArray(metricRules?.unstarted_statuses)) {
    metricRules.unstarted_statuses.forEach((st: string) =>
      configuredUnstarted.add(String(st).toLowerCase().trim())
    );
  }

  function getCfdCategory(statusName: string): 'complete' | 'in_review' | 'in_progress' | 'not_started' {
    const s = String(statusName || '').toLowerCase().trim();
    if (!s) return 'not_started';
    const norm = s.replace(/[\s\-_]+/g, '_');

    // 1. Explicit schema assignment takes highest priority
    const explicitCat = explicitSchemaCategories.get(s) || explicitSchemaCategories.get(norm);
    if (explicitCat) return explicitCat;

    // 2. Project-configured definitions take high priority
    if (configuredCompleted.has(s) || configuredCompleted.has(norm)) return 'complete';
    if (configuredInReview.has(s) || configuredInReview.has(norm)) return 'in_review';
    if (configuredInProgress.has(s) || configuredInProgress.has(norm)) return 'in_progress';
    if (configuredUnstarted.has(s) || configuredUnstarted.has(norm)) return 'not_started';

    // 3. Canonical completed aliases (only if not explicitly excluded from complete by schema)
    if (!explicitlyExcludedFromComplete.has(s) && !explicitlyExcludedFromComplete.has(norm)) {
      if (['complete', 'done', 'completed', 'resolved', 'closed', 'shipped'].includes(s) ||
          ['complete', 'done', 'completed', 'resolved', 'closed', 'shipped'].includes(norm)) {
        return 'complete';
      }
    }

    // 4. Canonical in_review aliases & review fallbacks
    if (canonicalReviewAliases.has(s) || canonicalReviewAliases.has(norm)) {
      return 'in_review';
    }

    // 5. Canonical in_progress aliases
    if (['in_progress', 'started', 'doing', 'wip', 'active'].includes(s) ||
        ['in_progress', 'started', 'doing', 'wip', 'active'].includes(norm)) {
      return 'in_progress';
    }

    // 6. Canonical unstarted aliases
    if (['not_started', 'unstarted', 'todo', 'to_do', 'backlog', 'open', 'planned'].includes(s) ||
        ['not_started', 'unstarted', 'todo', 'to_do', 'backlog', 'open', 'planned'].includes(norm)) {
      return 'not_started';
    }

    // 7. Explicitly excluded from complete fallback (e.g. project defines 'done' as is_completed: false)
    if (explicitlyExcludedFromComplete.has(s) || explicitlyExcludedFromComplete.has(norm)) {
      return 'in_progress';
    }

    return 'not_started';
  }

  function isCompleteCategory(statusName: string): boolean {
    return getCfdCategory(statusName) === 'complete';
  }

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
        const extracted =
          (typeof lastTransition.new_state === 'string' ? lastTransition.new_state : null) ||
          lastTransition.new_state?.status ||
          lastTransition.to_status ||
          lastTransition.new_status ||
          lastTransition.details?.status ||
          lastTransition.metadata?.status ||
          lastTransition.metadata?.to_status;
        status = extracted || item.status || 'not_started';
      } else if (itemTransitions.length > 0) {
        // Transitions exist later; reconstruct initial status prior to first transition
        const earliestTransition = itemTransitions[0];
        const prevExtracted =
          (typeof earliestTransition.previous_state === 'string' ? earliestTransition.previous_state : null) ||
          earliestTransition.previous_state?.status ||
          earliestTransition.old_state?.status ||
          earliestTransition.from_status ||
          earliestTransition.old_status ||
          earliestTransition.details?.from_status ||
          earliestTransition.metadata?.from_status;
        status =
          prevExtracted ||
          item.metadata?.initial_status ||
          'not_started';
      } else {
        // Fallback safely when transition audit logs are sparse:
        const completedAtRaw =
          item.metadata?.completed_at ||
          item.completed_at ||
          item.metadata?.closed_at ||
          item.closed_at;
        const completedAtMs = completedAtRaw ? new Date(completedAtRaw).getTime() : NaN;

        const reviewedAtRaw =
          item.metadata?.in_review_at ||
          item.metadata?.reviewed_at ||
          item.metadata?.review_at ||
          item.in_review_at;
        const reviewedAtMs = reviewedAtRaw ? new Date(reviewedAtRaw).getTime() : NaN;

        const statusUpdatedAtRaw =
          item.metadata?.status_updated_at ||
          item.metadata?.status_changed_at;
        const statusUpdatedAtMs = statusUpdatedAtRaw ? new Date(statusUpdatedAtRaw).getTime() : NaN;

        const startedAtRaw = item.metadata?.started_at || item.started_at;
        const startedAtMs = startedAtRaw ? new Date(startedAtRaw).getTime() : NaN;

        const currentCategory = getCfdCategory(item.status);

        if (currentCategory === 'complete') {
          if (!isNaN(completedAtMs)) {
            if (endOfDayMs >= completedAtMs) {
              status = item.status;
            } else if (!isNaN(reviewedAtMs) && endOfDayMs >= reviewedAtMs) {
              status = 'in_review';
            } else if (!isNaN(startedAtMs) && endOfDayMs >= startedAtMs) {
              status = 'in_progress';
            } else {
              status = item.metadata?.initial_status || 'not_started';
            }
          } else if (!isNaN(statusUpdatedAtMs)) {
            if (endOfDayMs >= statusUpdatedAtMs) {
              status = item.status;
            } else {
              status = item.metadata?.initial_status || 'not_started';
            }
          } else {
            status = item.status || 'not_started';
          }
        } else if (currentCategory === 'in_review') {
          const transMs = !isNaN(reviewedAtMs) ? reviewedAtMs : (!isNaN(statusUpdatedAtMs) ? statusUpdatedAtMs : startedAtMs);
          if (!isNaN(transMs)) {
            if (endOfDayMs >= transMs) {
              status = item.status;
            } else if (!isNaN(startedAtMs) && endOfDayMs >= startedAtMs) {
              status = 'in_progress';
            } else {
              status = item.metadata?.initial_status || 'not_started';
            }
          } else {
            status = item.status || 'not_started';
          }
        } else if (currentCategory === 'in_progress') {
          const transMs = !isNaN(statusUpdatedAtMs) ? statusUpdatedAtMs : startedAtMs;
          if (!isNaN(transMs)) {
            if (endOfDayMs >= transMs) {
              status = item.status;
            } else {
              status = item.metadata?.initial_status || 'not_started';
            }
          } else {
            status = item.status || 'not_started';
          }
        } else {
          status = item.status || 'not_started';
        }
      }

      const isUnplanned = Boolean(
        item.metadata?.is_unplanned ||
        item.metadata?.source_type === 'unplanned' ||
        item.status === 'unplanned' ||
        status === 'unplanned'
      );

      const category = getCfdCategory(status);

      if (isUnplanned && category !== 'complete') {
        counts.unplanned++;
      } else if (category === 'complete') {
        counts.complete++;
      } else if (category === 'in_review') {
        counts.in_review++;
      } else if (category === 'in_progress') {
        counts.in_progress++;
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
