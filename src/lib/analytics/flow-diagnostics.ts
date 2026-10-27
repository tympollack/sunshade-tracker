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

export const CANONICAL_COMPLETE_ALIASES = new Set([
  'complete',
  'done',
  'completed',
  'resolved',
  'closed',
  'shipped',
  'published',
  'syndicated',
  'released',
  'archived',
  'approved',
  'delivered',
  'finished',
  'live',
]);

export const CANONICAL_REVIEW_ALIASES = new Set([
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
  'staged',
  'staging',
  'preview',
  'ready_for_staging',
  'ready_for_release',
  'verification',
  'verify',
  'inspection',
  'inspect',
  'pre_release',
  'approval',
  'gate',
]);

export const CANONICAL_IN_PROGRESS_ALIASES = new Set([
  'in_progress',
  'started',
  'doing',
  'wip',
  'active',
  'outlining',
  'drafting',
  'writing',
  'development',
  'dev',
  'implementing',
  'building',
  'coding',
  'working',
  'execution',
  'in_dev',
  'in_development',
  'research',
  'researching',
  'design',
  'designing',
  'spec',
  'producing',
  'production',
]);

export const CANONICAL_UNSTARTED_ALIASES = new Set([
  'not_started',
  'unstarted',
  'todo',
  'to_do',
  'backlog',
  'open',
  'planned',
  'pitch_backlog',
  'pitch',
  'concept',
  'concepts',
  'ideas',
  'icebox',
  'triage',
  'new',
  'proposed',
  'inbox',
  'queue',
  'queued',
]);

export const isUnstartedAlias = (s: string, norm: string, label?: string): boolean => {
  return (
    CANONICAL_UNSTARTED_ALIASES.has(s) ||
    CANONICAL_UNSTARTED_ALIASES.has(norm) ||
    norm.includes('backlog') ||
    norm.startsWith('not_started') ||
    norm.startsWith('unstarted') ||
    norm.startsWith('todo') ||
    norm.startsWith('pitch') ||
    norm.startsWith('concept') ||
    norm.startsWith('queue') ||
    (Boolean(label) && /backlog|not started|unstarted|todo|to do|pitch|concept|queue|queued|ideas|icebox|inbox/i.test(label || ''))
  );
};

export const isReviewAlias = (s: string, norm: string, label?: string): boolean => {
  return (
    CANONICAL_REVIEW_ALIASES.has(s) ||
    CANONICAL_REVIEW_ALIASES.has(norm) ||
    norm.includes('review') ||
    norm.includes('audit') ||
    norm.includes('qa') ||
    norm.includes('testing') ||
    norm.includes('staged') ||
    norm.includes('staging') ||
    norm.includes('verification') ||
    norm.includes('inspect') ||
    (Boolean(label) && /\b(review|under review|in review|code review|audit|staging|staged|preview|verification|inspection|sign off)\b/i.test(label || ''))
  );
};

export const isCompleteAlias = (s: string, norm: string, label?: string): boolean => {
  // Guard against negated forms: incomplete, uncompleted, unpublished, not_completed, not_done, unresolved, etc.
  if (
    /^(in|un|non)[_-]?(complete|completed|published|done|resolved|released|archived|shipped|finished)/i.test(norm) ||
    /^(not|un|in|non)[_-]/i.test(norm) ||
    norm.includes('not_complete') ||
    norm.includes('not_done') ||
    norm.includes('not_published') ||
    (Boolean(label) &&
      /\b(not|in|un|non)[-\s]?(complete|completed|done|published|syndicated|archived|shipped|released|finished|resolved)\b/i.test(
        label || ''
      ))
  ) {
    return false;
  }

  if (CANONICAL_COMPLETE_ALIASES.has(s) || CANONICAL_COMPLETE_ALIASES.has(norm)) {
    return true;
  }

  const tokens = norm.split(/[\s\-_]+/).filter(Boolean);
  if (tokens.some((t) => CANONICAL_COMPLETE_ALIASES.has(t))) {
    const hasNegation = tokens.some((t) => ['not', 'un', 'in', 'non'].includes(t));
    if (hasNegation) return false;
    return true;
  }

  if (label) {
    const labelLower = label.toLowerCase().trim();
    if (
      /\b(complete|completed|done|published|syndicated|archived|shipped|delivered|released|finished|resolved|live)\b/i.test(
        labelLower
      )
    ) {
      return true;
    }
  }

  return false;
};

export const isInProgressAlias = (s: string, norm: string, label?: string): boolean => {
  return (
    CANONICAL_IN_PROGRESS_ALIASES.has(s) ||
    CANONICAL_IN_PROGRESS_ALIASES.has(norm) ||
    norm.includes('outline') ||
    norm.includes('draft') ||
    norm.includes('writing') ||
    norm.includes('implement') ||
    norm.includes('develop') ||
    norm.includes('progress') ||
    (Boolean(label) && /in progress|draft|outline|writing|development|working/i.test(label || ''))
  );
};

/**
 * Builds an authoritative status classification function for a given project configuration.
 * Accurately maps standard and custom domain workflow stages into canonical CFD layers:
 * complete | in_review | in_progress | not_started.
 */
export function createStatusClassifier(
  projectSettings?: any
): (statusName: string) => 'complete' | 'in_review' | 'in_progress' | 'not_started' {
  const configuredCompleted = new Set<string>();
  const explicitlyExcludedFromComplete = new Set<string>();
  const configuredInProgress = new Set<string>();
  const configuredInReview = new Set<string>();
  const configuredUnstarted = new Set<string>();
  const explicitSchemaCategories = new Map<string, 'complete' | 'in_review' | 'in_progress' | 'not_started'>();

  const statusEntries: Array<{ id: string; normId: string; label: string; normLabel: string; order: number; def: any }> = [];

  if (Array.isArray(projectSettings?.statuses) && projectSettings.statuses.length > 0) {
    projectSettings.statuses.forEach((s: any, idx: number) => {
      const id = String(s.id || '').toLowerCase().trim();
      if (!id) return;
      const normId = id.replace(/[\s\-_]+/g, '_');
      const label = String(s.label || '').toLowerCase().trim();
      const normLabel = label.replace(/[\s\-_]+/g, '_');
      const order = typeof s.order === 'number' && !isNaN(s.order) ? s.order : idx + 1;
      statusEntries.push({ id, normId, label, normLabel, order, def: s });
    });

    // 1. Explicit schema categories & explicit boolean completion markers
    statusEntries.forEach(({ id, normId, def }) => {
      if (def.is_completed === true) {
        configuredCompleted.add(id);
        configuredCompleted.add(normId);
        explicitSchemaCategories.set(id, 'complete');
        explicitSchemaCategories.set(normId, 'complete');
      } else if (def.is_completed === false) {
        explicitlyExcludedFromComplete.add(id);
        explicitlyExcludedFromComplete.add(normId);
      }

      const cat = String(def.category || '').toLowerCase().trim();
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
    });
  }

  // 2. Resolve metric rules across all supported settings locations (top-level, nested sprint_settings, metadata)
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
      const normId = id.replace(/[\s\-_]+/g, '_');
      configuredCompleted.add(id);
      configuredCompleted.add(normId);
      explicitlyExcludedFromComplete.delete(id);
      explicitlyExcludedFromComplete.delete(normId);
    });
  }

  const inReviewList = metricRules?.in_review_statuses || metricRules?.review_statuses;
  const explicitMetricReviewStatuses = new Set<string>();
  if (Array.isArray(inReviewList)) {
    inReviewList.forEach((st: string) => {
      const id = String(st).toLowerCase().trim();
      const normId = id.replace(/[\s\-_]+/g, '_');
      configuredInReview.add(id);
      configuredInReview.add(normId);
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

      // Explicit schema assignment takes highest priority
      const explicitCat = explicitSchemaCategories.get(id) || explicitSchemaCategories.get(normId);
      if (explicitCat === 'in_progress') {
        configuredInProgress.add(id);
        configuredInProgress.add(normId);
        configuredInReview.delete(id);
        configuredInReview.delete(normId);
        return;
      } else if (explicitCat === 'in_review') {
        configuredInReview.add(id);
        configuredInReview.add(normId);
        configuredInProgress.delete(id);
        configuredInProgress.delete(normId);
        return;
      }

      // If review list was explicitly defined by metricRules.in_review_statuses, keep it authoritative
      if (explicitMetricReviewStatuses.has(id) || explicitMetricReviewStatuses.has(normId)) {
        return;
      }

      // If from generic default WIP list and matches canonical review aliases, route to review
      if (isGenericDefaultList && (CANONICAL_REVIEW_ALIASES.has(normId) || CANONICAL_REVIEW_ALIASES.has(id))) {
        configuredInReview.add(id);
        configuredInReview.add(normId);
      } else {
        configuredInProgress.add(id);
        configuredInProgress.add(normId);
      }
    });
  }

  if (Array.isArray(metricRules?.unstarted_statuses)) {
    metricRules.unstarted_statuses.forEach((st: string) => {
      const id = String(st).toLowerCase().trim();
      const normId = id.replace(/[\s\-_]+/g, '_');
      configuredUnstarted.add(id);
      configuredUnstarted.add(normId);
    });
  }

  // 3. Semantic matching for project schema statuses that are not yet categorized
  if (statusEntries.length > 0) {
    statusEntries.forEach(({ id, normId, label, normLabel }) => {
      if (
        explicitSchemaCategories.has(id) ||
        explicitSchemaCategories.has(normId) ||
        configuredCompleted.has(id) ||
        configuredInReview.has(id) ||
        configuredInProgress.has(id) ||
        configuredUnstarted.has(id)
      ) {
        return;
      }

      const isExcludedFromComplete =
        explicitlyExcludedFromComplete.has(id) || explicitlyExcludedFromComplete.has(normId);

      // Check complete aliases (only if not explicitly excluded from completion by schema)
      if (!isExcludedFromComplete && isCompleteAlias(id, normId, label)) {
        configuredCompleted.add(id);
        configuredCompleted.add(normId);
        return;
      }

      // Check review aliases (takes precedence over unstarted/in_progress)
      if (isReviewAlias(id, normId, label)) {
        configuredInReview.add(id);
        configuredInReview.add(normId);
        return;
      }

      // Check unstarted aliases
      if (isUnstartedAlias(id, normId, label)) {
        configuredUnstarted.add(id);
        configuredUnstarted.add(normId);
        return;
      }

      // Check in_progress aliases
      if (isInProgressAlias(id, normId, label)) {
        configuredInProgress.add(id);
        configuredInProgress.add(normId);
        return;
      }

      // If this status had a canonically complete name but was explicitly marked is_completed: false,
      // it is active in-flight work (e.g. 'done' marked is_completed: false)
      if (isExcludedFromComplete && isCompleteAlias(id, normId, label)) {
        configuredInProgress.add(id);
        configuredInProgress.add(normId);
        return;
      }
    });

    // 4. Workflow position fallback: any intermediate status in the project workflow
    // that is neither completed nor unstarted is an active in-flight stage (in_progress).
    // If none of the actual project schema statuses was mapped to not_started, the initial
    // workflow stage (order 1 / index 0) defaults to not_started as the backlog entry state.
    const sortedEntries = [...statusEntries].sort((a, b) => a.order - b.order);
    const schemaHasUnstarted = sortedEntries.some(
      (entry) =>
        configuredUnstarted.has(entry.id) ||
        configuredUnstarted.has(entry.normId) ||
        explicitSchemaCategories.get(entry.id) === 'not_started' ||
        explicitSchemaCategories.get(entry.normId) === 'not_started'
    );

    let firstStatusHandled = schemaHasUnstarted;

    sortedEntries.forEach((entry, idx) => {
      const { id, normId } = entry;
      if (
        explicitSchemaCategories.has(id) ||
        explicitSchemaCategories.has(normId) ||
        configuredCompleted.has(id) ||
        configuredInReview.has(id) ||
        configuredInProgress.has(id) ||
        configuredUnstarted.has(id)
      ) {
        return;
      }

      // If no schema status is unstarted yet, the first workflow status is the backlog entry state
      if (!firstStatusHandled && idx === 0) {
        configuredUnstarted.add(id);
        configuredUnstarted.add(normId);
        firstStatusHandled = true;
        return;
      }

      // Any remaining intermediate workflow status is active work in progress (WIP)
      configuredInProgress.add(id);
      configuredInProgress.add(normId);
    });
  }

  return function getCfdCategory(statusName: string): 'complete' | 'in_review' | 'in_progress' | 'not_started' {
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

    // 3. Canonical completed aliases & patterns (only if not explicitly excluded from complete by schema)
    if (!explicitlyExcludedFromComplete.has(s) && !explicitlyExcludedFromComplete.has(norm)) {
      if (isCompleteAlias(s, norm)) {
        return 'complete';
      }
    }

    // 4. Canonical in_review aliases & patterns
    if (isReviewAlias(s, norm)) {
      return 'in_review';
    }

    // 5. Canonical unstarted aliases & patterns (check unstarted before in_progress to avoid started substrings)
    if (isUnstartedAlias(s, norm)) {
      return 'not_started';
    }

    // 6. Canonical in_progress aliases & patterns
    if (isInProgressAlias(s, norm)) {
      return 'in_progress';
    }

    // 7. Explicitly excluded from complete fallback (e.g. project defines 'done' as is_completed: false)
    if (explicitlyExcludedFromComplete.has(s) || explicitlyExcludedFromComplete.has(norm)) {
      return 'in_progress';
    }

    return 'not_started';
  };
}

export function resolveStatusCategory(
  statusName: string,
  projectSettings?: any
): 'complete' | 'in_review' | 'in_progress' | 'not_started' {
  return createStatusClassifier(projectSettings)(statusName);
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
    projectSettings?: any;
  }
): Promise<ItemDurationMetrics> {
  let item = options?.item;
  let events = options?.events;
  const getCat = createStatusClassifier(options?.projectSettings);

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

  // Find earliest transition to 'in_progress' or active WIP
  let inProgressAt: string | null = null;
  const inProgressEvent = events.find((e: any) => {
    if (e.event_type !== 'status_transition') return false;
    const st =
      (typeof e.new_state === 'string' ? e.new_state : null) ||
      e.new_state?.status ||
      e.to_status ||
      e.new_status ||
      e.details?.status ||
      e.metadata?.status;
    const cat = getCat(st);
    return cat === 'in_progress' || cat === 'in_review';
  });

  if (inProgressEvent) {
    inProgressAt = inProgressEvent.occurred_at;
  } else {
    const itemCat = getCat(item.status);
    if (itemCat === 'in_progress' || itemCat === 'in_review' || itemCat === 'complete') {
      inProgressAt = item.metadata?.started_at || item.started_at || item.updated_at || item.created_at;
    }
  }

  // Find transition to 'complete'
  let completedAt: string | null = null;
  const completeEvent = events.find((e: any) => {
    if (e.event_type !== 'status_transition') return false;
    const st =
      (typeof e.new_state === 'string' ? e.new_state : null) ||
      e.new_state?.status ||
      e.to_status ||
      e.new_status ||
      e.details?.status ||
      e.metadata?.status;
    return getCat(st) === 'complete';
  });

  if (completeEvent) {
    completedAt = completeEvent.occurred_at;
  } else if (getCat(item.status) === 'complete') {
    completedAt = item.metadata?.completed_at || item.completed_at || item.updated_at || item.created_at;
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

  // Resolve status classification engine with custom schema & metric rules
  const getCfdCategory = createStatusClassifier(projectSettings);
  const defaultInitialStatus =
    Array.isArray(projectSettings?.statuses) && projectSettings.statuses.length > 0
      ? projectSettings.statuses[0]?.id || 'not_started'
      : 'not_started';

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

      let status = defaultInitialStatus;
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
        status = extracted || item.status || defaultInitialStatus;
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
          defaultInitialStatus;
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
              status = item.metadata?.initial_status || defaultInitialStatus;
            }
          } else if (!isNaN(statusUpdatedAtMs)) {
            if (endOfDayMs >= statusUpdatedAtMs) {
              status = item.status;
            } else {
              status = item.metadata?.initial_status || defaultInitialStatus;
            }
          } else {
            status = item.status || defaultInitialStatus;
          }
        } else if (currentCategory === 'in_review') {
          const transMs = !isNaN(reviewedAtMs) ? reviewedAtMs : (!isNaN(statusUpdatedAtMs) ? statusUpdatedAtMs : startedAtMs);
          if (!isNaN(transMs)) {
            if (endOfDayMs >= transMs) {
              status = item.status;
            } else if (!isNaN(startedAtMs) && endOfDayMs >= startedAtMs) {
              status = 'in_progress';
            } else {
              status = item.metadata?.initial_status || defaultInitialStatus;
            }
          } else {
            status = item.status || defaultInitialStatus;
          }
        } else if (currentCategory === 'in_progress') {
          const transMs = !isNaN(statusUpdatedAtMs) ? statusUpdatedAtMs : startedAtMs;
          if (!isNaN(transMs)) {
            if (endOfDayMs >= transMs) {
              status = item.status;
            } else {
              status = item.metadata?.initial_status || defaultInitialStatus;
            }
          } else {
            status = item.status || defaultInitialStatus;
          }
        } else {
          status = item.status || defaultInitialStatus;
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
