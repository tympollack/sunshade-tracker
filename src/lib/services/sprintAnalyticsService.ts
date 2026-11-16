/**
 * Pure Calculation Engine for Sprint Velocity Telemetry & Enterprise KPIs
 * File: src/lib/services/sprintAnalyticsService.ts
 *
 * Requirements:
 * - 0 external dependencies for universal edge execution.
 * - Rolling 3-Sprint Velocity: 1/k * sum_{i=1}^k CompletedPoints(Sprint_{n-i})
 *   (gracefully handles 0, 1, or 2 historical sprints).
 * - Scope Creep / Churn Rate: (Points Added Mid-Sprint / Committed Points at Start) * 100
 *   (handles zero-commit and negative churn edge cases).
 * - Commitment Reliability Ratio (Say/Do Ratio): (Completed Points at Close / Committed Points at Start) * 100
 * - Cycle Time & WIP Age across closed and in-progress items.
 */

import { MetricRules } from '@/types/tracker';

export interface HistoricalSprint {
  id: string;
  name: string;
  completed_points: number;
  committed_points?: number;
  ends_at?: string | null;
  end_date?: string | null;
  status?: string;
  project_id?: string | null;
}

export interface WorkItemLifecycleData {
  id: string;
  status: string;
  created_at: string;
  updated_at?: string;
  started_at?: string | null;
  completed_at?: string | null;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface SprintEventData {
  id?: string;
  event_type: string;
  points_delta?: number | null;
  delta_points?: number | null;
  points?: number | null;
  created_at?: string | null;
  occurred_at?: string | null;
  timestamp?: string | null;
  work_item_id?: string | null;
  new_state?: any;
  old_state?: any;
  previous_state?: any;
  to_status?: string | null;
  from_status?: string | null;
  new_status?: string | null;
  old_status?: string | null;
  details?: Record<string, any>;
  metadata?: Record<string, any>;
}

export interface PeriodScopedTelemetry {
  isSubWindow: boolean;
  windowStartDate: string;
  windowEndDate: string;
  period_starting_scope: number;
  period_added_points: number;
  period_dropped_points: number;
  period_delivered_points: number;
  period_volatility_pct: number;
  period_daily_velocity: number;
  periodStartingScope: number;
  periodAddedPoints: number;
  periodDroppedPoints: number;
  periodDeliveredPoints: number;
  periodVolatilityPct: number;
  periodDailyVelocity: number;
}

/**
 * Canonical task specification defaults for sprint governance & metric rules.
 */
export const DEFAULT_METRIC_RULES: Required<MetricRules> = {
  velocity_window: 3,
  velocity_trend_threshold: 0.10,
  reliability_healthy_threshold: 85,
  reliability_warning_threshold: 70,
  late_runway_threshold: 0.60,
  late_runway_max_points: 2,
  late_inflow_cap: 2,
  runway_cutoff: 0.60,
  enforce_late_inflow_caps: true,
  feature_story_types: ['story', 'feature'],
  allowed_late_types: ['chore', 'task', 'debt', 'documentation', 'doc', 'test', 'bug'],
  enforce_zero_sum: true,
  unstarted_statuses: ['not_started', 'todo', 'unplanned', 'backlog', 'open', 'planned', 'pitch_backlog'],
  in_progress_statuses: ['in_progress', 'doing', 'review', 'in_review', 'qa', 'testing'],
  completed_statuses: ['complete', 'completed', 'done', 'resolved', 'closed', 'shipped', 'published', 'syndicated', 'archived', 'released'],
  emergency_priorities: ['P0', 'CRITICAL', 'EMERGENCY'],
  lock_estimates_in_active_sprint: true,
  scope_creep_warning_threshold: 15,
  scope_creep_danger_threshold: 30,
};

/**
/**
 * Extracts raw metric rules from various supported project settings or metadata locations.
 */
export function extractRawMetricRules(settingsOrObject?: any): any {
  if (!settingsOrObject || typeof settingsOrObject !== 'object') {
    return settingsOrObject;
  }
  return (
    settingsOrObject.sprint_metrics ||
    settingsOrObject.metric_rules ||
    settingsOrObject.sprint_settings?.metric_rules ||
    settingsOrObject.sprint_settings?.metrics ||
    settingsOrObject.sprint_settings?.sprint_metrics ||
    settingsOrObject.metadata?.metric_rules ||
    settingsOrObject.metadata?.sprint_metrics ||
    settingsOrObject
  );
}

/**
 * Resolves effective metric rules by merging provided or stored JSON settings
 * with canonical task specification defaults.
 */
export function resolveMetricRules(settingsOrObject?: any): Required<MetricRules> {
  if (!settingsOrObject || typeof settingsOrObject !== 'object') {
    return { ...DEFAULT_METRIC_RULES };
  }

  // Look for metric_rules or sprint_metrics across all supported locations
  const rawRules: any = extractRawMetricRules(settingsOrObject);

  const resolved: Required<MetricRules> = { ...DEFAULT_METRIC_RULES };

  if (typeof rawRules === 'object' && rawRules !== null) {
    if (typeof rawRules.velocity_window === 'number' && rawRules.velocity_window > 0) {
      resolved.velocity_window = Math.max(1, Math.round(rawRules.velocity_window));
    }
    if (typeof rawRules.velocity_trend_threshold === 'number' && rawRules.velocity_trend_threshold >= 0) {
      resolved.velocity_trend_threshold = rawRules.velocity_trend_threshold;
    }
    if (typeof rawRules.reliability_healthy_threshold === 'number') {
      resolved.reliability_healthy_threshold = rawRules.reliability_healthy_threshold;
    }
    if (typeof rawRules.reliability_warning_threshold === 'number') {
      resolved.reliability_warning_threshold = rawRules.reliability_warning_threshold;
    }
    if (rawRules.late_runway_threshold === null || rawRules.runway_cutoff === null) {
      resolved.late_runway_threshold = null;
      resolved.runway_cutoff = null;
    } else if (
      typeof rawRules.runway_cutoff === 'number' &&
      rawRules.runway_cutoff >= 0 &&
      rawRules.runway_cutoff <= 1
    ) {
      resolved.late_runway_threshold = rawRules.runway_cutoff;
      resolved.runway_cutoff = rawRules.runway_cutoff;
    } else if (
      typeof rawRules.late_runway_threshold === 'number' &&
      rawRules.late_runway_threshold >= 0 &&
      rawRules.late_runway_threshold <= 1
    ) {
      resolved.late_runway_threshold = rawRules.late_runway_threshold;
      resolved.runway_cutoff = rawRules.late_runway_threshold;
    }

    if (rawRules.late_runway_max_points === null || rawRules.late_inflow_cap === null) {
      resolved.late_runway_max_points = null;
      resolved.late_inflow_cap = null;
    } else if (typeof rawRules.late_inflow_cap === 'number' && rawRules.late_inflow_cap >= 0) {
      resolved.late_runway_max_points = rawRules.late_inflow_cap;
      resolved.late_inflow_cap = rawRules.late_inflow_cap;
    } else if (typeof rawRules.late_runway_max_points === 'number' && rawRules.late_runway_max_points >= 0) {
      resolved.late_runway_max_points = rawRules.late_runway_max_points;
      resolved.late_inflow_cap = rawRules.late_runway_max_points;
    }

    if (typeof rawRules.enforce_late_inflow_caps === 'boolean') {
      resolved.enforce_late_inflow_caps = rawRules.enforce_late_inflow_caps;
    }
    if (Array.isArray(rawRules.feature_story_types)) {
      resolved.feature_story_types = rawRules.feature_story_types.map((s: any) => String(s).toLowerCase().trim());
    }
    if (Array.isArray(rawRules.allowed_late_types)) {
      resolved.allowed_late_types = rawRules.allowed_late_types.map((s: any) => String(s).toLowerCase().trim());
    }
    if (typeof rawRules.enforce_zero_sum === 'boolean') {
      resolved.enforce_zero_sum = rawRules.enforce_zero_sum;
    }
    if (Array.isArray(rawRules.unstarted_statuses)) {
      resolved.unstarted_statuses = rawRules.unstarted_statuses.map((s: any) => String(s).toLowerCase().trim());
    }
    if (Array.isArray(rawRules.in_progress_statuses)) {
      resolved.in_progress_statuses = rawRules.in_progress_statuses.map((s: any) => String(s).toLowerCase().trim());
    }
    if (Array.isArray(rawRules.completed_statuses)) {
      resolved.completed_statuses = rawRules.completed_statuses.map((s: any) => String(s).toLowerCase().trim());
    }
    if (Array.isArray(rawRules.emergency_priorities) && rawRules.emergency_priorities.length > 0) {
      resolved.emergency_priorities = rawRules.emergency_priorities.map((s: any) => String(s).toUpperCase().trim());
    }
    if (typeof rawRules.lock_estimates_in_active_sprint === 'boolean') {
      resolved.lock_estimates_in_active_sprint = rawRules.lock_estimates_in_active_sprint;
    }
    if (typeof rawRules.scope_creep_warning_threshold === 'number') {
      resolved.scope_creep_warning_threshold = rawRules.scope_creep_warning_threshold;
    }
    if (typeof rawRules.scope_creep_danger_threshold === 'number') {
      resolved.scope_creep_danger_threshold = rawRules.scope_creep_danger_threshold;
    }
  }

  return resolved;
}

export interface SprintAnalyticsInput {
  sprint: {
    id: string;
    name: string;
    status: string;
    is_active?: boolean;
    started_at?: string | null;
    ends_at?: string | null;
    start_date?: string | null;
    end_date?: string | null;
    committed_points?: number;
    metadata?: Record<string, any>;
  };
  historicalSprints?: HistoricalSprint[];
  items?: WorkItemLifecycleData[];
  events?: SprintEventData[];
  startDate?: string | null;
  endDate?: string | null;
  rules?: MetricRules;
  now?: Date | string | number;
  metricKey?: string;
}

export interface SprintHealthReport {
  sprintId: string;
  sprintName: string;
  status: string;
  isActive: boolean;
  rollingVelocity3Sprint: number;
  rollingVelocity: number;
  velocityWindow: number;
  historicalSprintsEvaluated: number;
  historicalSprints?: HistoricalSprint[];
  committedPoints: number;
  currentSprintPoints: number;
  completedPoints: number;
  remainingPoints: number;
  inProgressPoints: number;
  pointsAddedMidSprint: number;
  pointsDroppedMidSprint: number;
  scopeCreepPercent: number;
  commitmentReliabilityPercent: number;
  reliabilityStatus: 'green' | 'amber' | 'red';
  cycleTimeDays: number;
  wipAgeDays: number;
  runwayElapsedRatio: number;
  runwayLocked: boolean;
  runwayCutoffRatio: number | null;
  runwayMaxPoints: number | null;
  capacityRemaining: number;
  velocityTrend: 'increasing' | 'stable' | 'decreasing';
  rules: Required<MetricRules>;
  isSubWindow?: boolean;
  windowStartDate?: string;
  windowEndDate?: string;
  period_starting_scope?: number;
  period_added_points?: number;
  period_dropped_points?: number;
  period_delivered_points?: number;
  period_volatility_pct?: number;
  period_daily_velocity?: number;
  periodStartingScope?: number;
  periodAddedPoints?: number;
  periodDroppedPoints?: number;
  periodDeliveredPoints?: number;
  periodVolatilityPct?: number;
  periodDailyVelocity?: number;
  baselineCommittedPoints?: number;
  baselineCompletedPoints?: number;
  baselinePointsAddedMidSprint?: number;
  baselinePointsDroppedMidSprint?: number;
  baselineScopeCreepPercent?: number;
  baselineCommitmentReliabilityPercent?: number;
}

/**
 * Standard completed status identifiers.
 */
export const COMPLETED_STATUSES = new Set([
  'complete',
  'completed',
  'done',
  'closed',
  'resolved',
  'shipped',
  'published',
]);

/**
 * Standard in-progress status identifiers.
 */
export const IN_PROGRESS_STATUSES = new Set([
  'in_progress',
  'in-progress',
  'in_dev',
  'in_review',
  'active',
  'started',
]);

/**
 * Pure calculation: Rolling Velocity.
 * Takes the up to `windowSize` (default: 3) most recently closed sprints and averages their completed points.
 * Gracefully handles fewer historical sprints than windowSize.
 */
export function calculateRollingVelocity(
  historicalSprints?: HistoricalSprint[],
  windowSize: number = 3
): number {
  if (!historicalSprints || historicalSprints.length === 0) {
    return 0;
  }

  const effectiveWindow = Math.max(1, windowSize || 3);
  // Sprints are expected to be ordered by ends_at DESC; take up to effectiveWindow
  const candidatePeriods = historicalSprints.slice(0, effectiveWindow);
  const total = candidatePeriods.reduce((acc, s) => {
    const pts = Number(s.completed_points);
    return acc + (isNaN(pts) || pts < 0 ? 0 : pts);
  }, 0);

  const avg = total / candidatePeriods.length;
  return Math.round(avg * 10) / 10;
}

/**
 * Pure calculation: Scope Creep / Churn Rate.
 * Delta Scope = (Points Added Mid-Sprint / Committed Points at Start) * 100
 * Handles zero-commit (prevents NaN / Infinity) and negative churn cleanly.
 */
export function calculateScopeCreep(
  pointsAddedMidSprint: number,
  committedPointsAtStart: number
): number {
  const added = Number(pointsAddedMidSprint) || 0;
  const committed = Number(committedPointsAtStart) || 0;

  if (committed <= 0) {
    if (added > 0) return 100.0;
    if (added < 0) return -100.0;
    return 0.0;
  }

  const churn = (added / committed) * 100;
  return Math.round(churn * 10) / 10;
}

/**
 * Pure calculation: Commitment Reliability Ratio (Say/Do Ratio).
 * Reliability = (Completed Points at Close / Committed Points at Start) * 100
 * Handles zero-commit safely without division by zero.
 */
export function calculateCommitmentReliability(
  completedPoints: number,
  committedPointsAtStart: number
): number {
  const completed = Math.max(0, Number(completedPoints) || 0);
  const committed = Number(committedPointsAtStart) || 0;

  if (committed <= 0) {
    return completed > 0 ? 100.0 : 0.0;
  }

  const ratio = (completed / committed) * 100;
  return Math.round(ratio * 10) / 10;
}

/**
 * Categorizes Commitment Reliability % into health status badges based on configurable rules:
 * Default paradigm:
 * >= 85%: Green (Healthy)
 * 70% - 84.9%: Amber (Caution)
 * < 70%: Red (At Risk)
 */
export function getReliabilityStatus(
  reliabilityPercent: number,
  thresholds?: { healthy?: number; warning?: number }
): 'green' | 'amber' | 'red' {
  const healthy = thresholds?.healthy ?? 85;
  const warning = thresholds?.warning ?? 70;

  if (reliabilityPercent >= healthy) return 'green';
  if (reliabilityPercent >= warning) return 'amber';
  return 'red';
}

/**
 * Pure calculation: Cycle Time across completed work items.
 * Mean time in days from status: in_progress to status: complete.
 */
export function calculateCycleTime(
  items?: WorkItemLifecycleData[],
  customCompletedStatuses?: string[] | Set<string>
): number {
  if (!items || items.length === 0) return 0;

  const completedSet = customCompletedStatuses
    ? (customCompletedStatuses instanceof Set ? customCompletedStatuses : new Set(customCompletedStatuses.map(s => s.toLowerCase().trim())))
    : COMPLETED_STATUSES;

  const completedItems = items.filter((it) => {
    const st = String(it.status || '').toLowerCase().trim();
    return completedSet.has(st);
  });

  if (completedItems.length === 0) return 0;

  let totalCycleDurationMs = 0;
  let countWithDuration = 0;

  for (const it of completedItems) {
    const startStr = it.started_at || it.metadata?.in_progress_at || it.metadata?.started_at || it.created_at;
    const endStr = it.completed_at || it.metadata?.completed_at || it.updated_at || it.created_at;

    const startMs = new Date(startStr).getTime();
    const endMs = new Date(endStr).getTime();

    if (!isNaN(startMs) && !isNaN(endMs) && endMs >= startMs) {
      totalCycleDurationMs += (endMs - startMs);
      countWithDuration++;
    }
  }

  if (countWithDuration === 0) return 0;

  const avgDays = totalCycleDurationMs / countWithDuration / (1000 * 60 * 60 * 24);
  return Math.round(avgDays * 10) / 10;
}

/**
 * Pure calculation: WIP Age for currently active / in-progress work items.
 * Mean time in days from started_at to now.
 */
export function calculateWIPAge(
  items?: WorkItemLifecycleData[],
  nowParam?: Date | string | number,
  customInProgressStatuses?: string[] | Set<string>
): number {
  if (!items || items.length === 0) return 0;

  const inProgressSet = customInProgressStatuses
    ? (customInProgressStatuses instanceof Set ? customInProgressStatuses : new Set(customInProgressStatuses.map(s => s.toLowerCase().trim())))
    : IN_PROGRESS_STATUSES;

  const inProgressItems = items.filter((it) => {
    const st = String(it.status || '').toLowerCase().trim();
    return inProgressSet.has(st);
  });

  if (inProgressItems.length === 0) return 0;

  const nowMs = nowParam ? new Date(nowParam).getTime() : Date.now();
  let totalWipDurationMs = 0;
  let count = 0;

  for (const it of inProgressItems) {
    const startStr = it.started_at || it.metadata?.in_progress_at || it.metadata?.started_at || it.created_at;
    const startMs = new Date(startStr).getTime();

    if (!isNaN(startMs) && nowMs >= startMs) {
      totalWipDurationMs += (nowMs - startMs);
      count++;
    }
  }

  if (count === 0) return 0;

  const avgDays = totalWipDurationMs / count / (1000 * 60 * 60 * 24);
  return Math.round(avgDays * 10) / 10;
}

/**
 * Filters sprint items to leaf items (cards without children present in the sprint)
 * to prevent double-counting story points between parent containers and child tasks.
 */
export function getSprintLeafItems(items: WorkItemLifecycleData[]): WorkItemLifecycleData[] {
  if (!items || items.length === 0) return [];
  const parentRefIds = new Set<string>();
  for (const item of items) {
    const pid = item.parent_id;
    if (pid && pid !== '' && pid !== '__none__' && pid !== '__root__' && pid !== item.id) {
      parentRefIds.add(pid);
    }
  }
  return items.filter((item) => {
    if (parentRefIds.has(item.id)) return false;
    if (item.external_ref_id && parentRefIds.has(item.external_ref_id)) return false;
    return true;
  });
}

/**
 * Extracts work metric points from an item safely using optional configured metric key.
 */
function getItemPoints(item: WorkItemLifecycleData, metricKey?: string): number {
  const p = metricKey
    ? (item.metadata?.[metricKey] ?? (item as any)?.[metricKey] ?? (metricKey === 'story_points' ? (item.metadata?.points ?? item.metadata?.estimate) : undefined))
    : (item.metadata?.story_points ?? item.story_points ?? item.points ?? item.metadata?.points ?? item.metadata?.estimate);
  const num = Number(p);
  return isNaN(num) || num < 0 ? 0 : num;
}

const ADDED_EVENT_TYPES = new Set([
  'scope_added',
  'item_churn_created',
  'item_added',
  'churn_added',
]);

const DROPPED_EVENT_TYPES = new Set([
  'scope_removed',
  'scope_dropped',
  'item_removed',
  'item_dropped',
  'churn_dropped',
]);

const COMPLETED_EVENT_TYPES = new Set([
  'item_completed',
  'scope_completed',
]);

/**
 * Pure calculation: Period-Scoped Volatility, Churn, and Velocity Telemetry
 * for sub-sprint windows bounded strictly to [startDate, endDate].
 */
export function computePeriodScopedTelemetry(params: {
  committedPoints: number;
  sprintStartDate?: string | null;
  sprintEndDate?: string | null;
  startDate: string;
  endDate: string;
  items?: WorkItemLifecycleData[];
  events?: SprintEventData[];
  completedStatuses?: Set<string>;
  metricKey?: string;
}): PeriodScopedTelemetry {
  const {
    committedPoints,
    sprintStartDate,
    sprintEndDate,
    startDate,
    endDate,
    items = [],
    events = [],
    completedStatuses = COMPLETED_STATUSES,
    metricKey,
  } = params;

  const winStart = String(startDate || '').slice(0, 10);
  const winEnd = String(endDate || '').slice(0, 10);
  const spStart = sprintStartDate ? String(sprintStartDate).slice(0, 10) : '';
  const spEnd = sprintEndDate ? String(sprintEndDate).slice(0, 10) : '';

  const isSubWindow = Boolean(
    winStart &&
      winEnd &&
      ((spStart && winStart > spStart) ||
        (spEnd && winEnd < spEnd) ||
        (!spStart && !spEnd))
  );

  const windowStartMs = new Date(`${winStart}T00:00:00.000Z`).getTime();
  const windowEndMs = new Date(`${winEnd}T23:59:59.999Z`).getTime();
  const sprintStartMs = spStart ? new Date(`${spStart}T00:00:00.000Z`).getTime() : 0;

  let preWindowAdded = 0;
  let preWindowDropped = 0;
  let preWindowCompleted = 0;

  let periodAddedPoints = 0;
  let periodDroppedPoints = 0;
  let periodDeliveredPoints = 0;

  const eventItemIdsAdded = new Set<string>();
  const eventItemIdsDropped = new Set<string>();
  const eventItemIdsCompleted = new Set<string>();

  const leafItems = getSprintLeafItems(items);
  const itemPointsById = new Map<string, number>();
  for (const it of leafItems) {
    itemPointsById.set(it.id, getItemPoints(it, metricKey));
  }

  for (const ev of events) {
    const rawTs = ev.occurred_at || ev.created_at || ev.timestamp || '';
    const evMs = new Date(rawTs).getTime();
    if (isNaN(evMs)) continue;

    const rawDelta =
      ev.points_delta ??
      ev.delta_points ??
      ev.points ??
      ev.metadata?.points_delta ??
      ev.metadata?.story_points ??
      (ev.work_item_id ? itemPointsById.get(ev.work_item_id) : undefined) ??
      0;
    const pts = Math.abs(Number(rawDelta) || 0);
    const evType = String(ev.event_type || '').toLowerCase().trim();

    if (ADDED_EVENT_TYPES.has(evType)) {
      if (ev.work_item_id) eventItemIdsAdded.add(ev.work_item_id);
      if (evMs < windowStartMs) {
        preWindowAdded += pts;
      } else if (evMs >= windowStartMs && evMs <= windowEndMs) {
        periodAddedPoints += pts;
      }
    } else if (DROPPED_EVENT_TYPES.has(evType)) {
      if (ev.work_item_id) eventItemIdsDropped.add(ev.work_item_id);
      if (evMs < windowStartMs) {
        preWindowDropped += pts;
      } else if (evMs >= windowStartMs && evMs <= windowEndMs) {
        periodDroppedPoints += pts;
      }
    } else if (COMPLETED_EVENT_TYPES.has(evType)) {
      if (ev.work_item_id) eventItemIdsCompleted.add(ev.work_item_id);
      if (evMs < windowStartMs) {
        preWindowCompleted += pts;
      } else if (evMs >= windowStartMs && evMs <= windowEndMs) {
        periodDeliveredPoints += pts;
      }
    } else if (evType === 'status_transition' || evType === 'status_changed') {
      const nextSt = String(
        (typeof ev.new_state === 'string' ? ev.new_state : null) ||
          ev.new_state?.status ||
          ev.to_status ||
          ev.new_status ||
          ev.details?.status ||
          ev.metadata?.new_status ||
          ev.metadata?.status ||
          ''
      )
        .toLowerCase()
        .trim();
      const prevSt = String(
        (typeof ev.previous_state === 'string' ? ev.previous_state : null) ||
          ev.previous_state?.status ||
          (typeof ev.old_state === 'string' ? ev.old_state : null) ||
          ev.old_state?.status ||
          ev.from_status ||
          ev.old_status ||
          ev.details?.previous_state?.status ||
          ev.details?.old_status ||
          ev.metadata?.previous_state?.status ||
          ev.metadata?.old_status ||
          ''
      )
        .toLowerCase()
        .trim();

      const movedToComplete =
        completedStatuses.has(nextSt) && (!prevSt || !completedStatuses.has(prevSt));

      if (movedToComplete && (!ev.work_item_id || !eventItemIdsCompleted.has(ev.work_item_id))) {
        if (ev.work_item_id) eventItemIdsCompleted.add(ev.work_item_id);
        if (evMs < windowStartMs) {
          preWindowCompleted += pts;
        } else if (evMs >= windowStartMs && evMs <= windowEndMs) {
          periodDeliveredPoints += pts;
        }
      }
    }
  }

  for (const it of leafItems) {
    const pts = getItemPoints(it, metricKey);
    if (pts <= 0) continue;

    // 1. Mid-sprint scope additions from item timestamps (when not already covered by sprint_events)
    if (!eventItemIdsAdded.has(it.id)) {
      const explicitAddedStr =
        it.metadata?.added_at ||
        it.metadata?.sprint_assigned_at ||
        it.metadata?.sprint_added_at;
      const createdMs = new Date(it.created_at).getTime();
      const isCreatedMidSprint =
        sprintStartMs > 0 && !isNaN(createdMs) && createdMs > sprintStartMs + 86400000;
      const isMidSprintItem =
        it.metadata?.added_mid_sprint === true ||
        it.metadata?.is_scope_creep === true ||
        isCreatedMidSprint;

      if (isMidSprintItem) {
        // Use explicit assignment timestamp first; only fall back to created_at if the item was created during the sprint
        // (avoids crediting older transferred backlog items to a pre-sprint creation date).
        const addedStr =
          explicitAddedStr ||
          (sprintStartMs === 0 || (!isNaN(createdMs) && createdMs >= sprintStartMs)
            ? it.created_at
            : null);
        const addedMs = addedStr ? new Date(addedStr).getTime() : NaN;
        if (!isNaN(addedMs)) {
          if (addedMs < windowStartMs) {
            preWindowAdded += pts;
          } else if (addedMs >= windowStartMs && addedMs <= windowEndMs) {
            periodAddedPoints += pts;
          }
        }
      }
    }

    // 2. Mid-sprint scope drops from item metadata (when not covered by sprint_events)
    if (!eventItemIdsDropped.has(it.id)) {
      const droppedStr = it.metadata?.dropped_at || it.metadata?.removed_at;
      if (droppedStr) {
        const droppedMs = new Date(droppedStr).getTime();
        if (!isNaN(droppedMs)) {
          if (droppedMs < windowStartMs) {
            preWindowDropped += pts;
          } else if (droppedMs >= windowStartMs && droppedMs <= windowEndMs) {
            periodDroppedPoints += pts;
          }
        }
      }
    }

    // 3. Completed points inside or prior to window
    if (!eventItemIdsCompleted.has(it.id)) {
      const st = String(it.status || '').toLowerCase().trim();
      const isCompleted = completedStatuses.has(st);
      const compStr =
        it.completed_at ||
        it.metadata?.completed_at ||
        (isCompleted ? it.updated_at || it.created_at : null);

      if (compStr && (isCompleted || it.completed_at || it.metadata?.completed_at)) {
        const compMs = new Date(compStr).getTime();
        if (!isNaN(compMs)) {
          if (compMs < windowStartMs) {
            preWindowCompleted += pts;
          } else if (compMs >= windowStartMs && compMs <= windowEndMs) {
            periodDeliveredPoints += pts;
          }
        }
      }
    }
  }

  const periodStartingScope = Math.max(
    0,
    committedPoints + preWindowAdded - preWindowDropped - preWindowCompleted
  );

  const rawVolatility =
    ((periodAddedPoints - periodDroppedPoints) / Math.max(periodStartingScope, 1)) * 100;
  const periodVolatilityPct = Math.round(rawVolatility * 10) / 10;

  const windowDays =
    !isNaN(windowStartMs) && !isNaN(windowEndMs) && windowEndMs >= windowStartMs
      ? Math.max(1, Math.round((windowEndMs - windowStartMs) / 86400000))
      : 1;
  const periodDailyVelocity = Math.round((periodDeliveredPoints / windowDays) * 10) / 10;

  return {
    isSubWindow,
    windowStartDate: winStart,
    windowEndDate: winEnd,
    period_starting_scope: periodStartingScope,
    period_added_points: periodAddedPoints,
    period_dropped_points: periodDroppedPoints,
    period_delivered_points: periodDeliveredPoints,
    period_volatility_pct: periodVolatilityPct,
    period_daily_velocity: periodDailyVelocity,
    periodStartingScope,
    periodAddedPoints,
    periodDroppedPoints,
    periodDeliveredPoints,
    periodVolatilityPct,
    periodDailyVelocity,
  };
}

/**
 * Aggregates all pure sprint metrics and produces the comprehensive SprintHealthReport.
 */
export function computeSprintAnalytics(input: SprintAnalyticsInput): SprintHealthReport {
  const { sprint, historicalSprints = [], items = [], rules: rawRules, now } = input;
  const rules = resolveMetricRules(rawRules || sprint.metadata?.metric_rules || sprint.metadata?.sprint_metrics);
  const metricKey =
    input.metricKey ||
    sprint.metadata?.work_metric_config?.field_key ||
    sprint.metadata?.work_unit_field;

  const isActive = Boolean(
    sprint.is_active ||
    sprint.status === 'active' ||
    sprint.status === 'in_progress' ||
    (sprint as any).is_current
  );

  const committed = Number(sprint.committed_points ?? sprint.metadata?.committed_points) || 0;

  // Aggregate item point buckets exclusively on leaf execution items to avoid parent-child double-counting
  let completedPoints = 0;
  let inProgressPoints = 0;
  let remainingPoints = 0;
  let totalCurrentPoints = 0;
  let pointsAddedMidSprint = 0;

  const pointItems = getSprintLeafItems(items);

  // Status classification sets resolved from project metric rules
  const effectiveCompletedStatuses = new Set(
    rules.completed_statuses && rules.completed_statuses.length > 0
      ? rules.completed_statuses.map((s) => s.toLowerCase().trim())
      : COMPLETED_STATUSES
  );
  const effectiveInProgressStatuses = new Set(
    rules.in_progress_statuses && rules.in_progress_statuses.length > 0
      ? rules.in_progress_statuses.map((s) => s.toLowerCase().trim())
      : IN_PROGRESS_STATUSES
  );

  for (const it of pointItems) {
    const pts = getItemPoints(it, metricKey);
    totalCurrentPoints += pts;

    const st = String(it.status || '').toLowerCase().trim();
    if (effectiveCompletedStatuses.has(st)) {
      completedPoints += pts;
    } else {
      remainingPoints += pts;
      if (effectiveInProgressStatuses.has(st)) {
        inProgressPoints += pts;
      }
    }

    // Check if item was added mid-sprint
    if (it.metadata?.added_mid_sprint === true || it.metadata?.is_scope_creep === true) {
      pointsAddedMidSprint += pts;
    }
  }

  // If pointsAddedMidSprint is not explicitly marked on items, derive from positive scope increase
  if (pointsAddedMidSprint === 0 && totalCurrentPoints > committed) {
    pointsAddedMidSprint = totalCurrentPoints - committed;
  }

  // Scope conservation: current = committed + added - dropped, so any shortfall against the
  // committed baseline (after accounting for added scope) is scope dropped from the sprint.
  const pointsDroppedMidSprint =
    committed > 0 ? Math.max(0, committed + pointsAddedMidSprint - totalCurrentPoints) : 0;

  // 1. Rolling velocity across configured window (default: 3)
  const velocityWindow = rules.velocity_window;
  const rollingVelocity = calculateRollingVelocity(historicalSprints, velocityWindow);

  // 2. Velocity trend: compare delivered points (for completed sprints) or current scope (for active sprints with progress) to rolling velocity
  let velocityTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
  if (rollingVelocity > 0) {
    const comparisonPoints = !isActive
      ? completedPoints
      : completedPoints === 0
      ? 0
      : totalCurrentPoints;

    const diff = comparisonPoints - rollingVelocity;
    const trendThreshold = rules.velocity_trend_threshold;
    if (diff > rollingVelocity * trendThreshold) {
      velocityTrend = 'increasing';
    } else if (diff < -rollingVelocity * trendThreshold) {
      velocityTrend = 'decreasing';
    }
  }

  // 3. Scope creep %
  const scopeCreepPercent = calculateScopeCreep(pointsAddedMidSprint, committed);

  // 4. Say/Do Commitment reliability % with configured health thresholds
  const commitmentReliabilityPercent = calculateCommitmentReliability(completedPoints, committed);
  const reliabilityStatus = getReliabilityStatus(commitmentReliabilityPercent, {
    healthy: rules.reliability_healthy_threshold,
    warning: rules.reliability_warning_threshold,
  });

  // 5. Cycle time & WIP age
  const cycleTimeDays = calculateCycleTime(items, effectiveCompletedStatuses);
  const wipAgeDays = calculateWIPAge(items, now, effectiveInProgressStatuses);

  // 6. Runway elapsed ratio & late runway lock based on configured threshold
  const startedAt = sprint.started_at || sprint.start_date;
  const endsAt = sprint.ends_at || sprint.end_date;
  let runwayElapsedRatio = 0.0;

  if (startedAt && endsAt) {
    const sMs = new Date(startedAt).getTime();
    const eMs = new Date(endsAt).getTime();
    const nowMs = now ? new Date(now).getTime() : Date.now();

    if (!isNaN(sMs) && !isNaN(eMs) && eMs > sMs) {
      runwayElapsedRatio = Math.max(0.0, (nowMs - sMs) / (eMs - sMs));
      runwayElapsedRatio = Math.round(runwayElapsedRatio * 1000) / 1000;
    }
  }

  const isRunwayEnforced =
    rules.late_runway_threshold !== null &&
    rules.late_inflow_cap !== null &&
    rules.enforce_late_inflow_caps !== false;
  const runwayLocked = isActive && isRunwayEnforced && runwayElapsedRatio > (rules.late_runway_threshold ?? 1.0);
  const capacityRemaining = Math.max(0, committed - totalCurrentPoints);

  const periodFields: Partial<SprintHealthReport> = {};
  if (input.startDate && input.endDate) {
    const period = computePeriodScopedTelemetry({
      committedPoints: committed,
      sprintStartDate: startedAt,
      sprintEndDate: endsAt,
      startDate: input.startDate,
      endDate: input.endDate,
      items: pointItems,
      events: input.events,
      completedStatuses: effectiveCompletedStatuses,
      metricKey,
    });

    Object.assign(periodFields, {
      ...period,
      baselineCommittedPoints: committed,
      baselineCompletedPoints: completedPoints,
      baselinePointsAddedMidSprint: pointsAddedMidSprint,
      baselinePointsDroppedMidSprint: pointsDroppedMidSprint,
      baselineScopeCreepPercent: scopeCreepPercent,
      baselineCommitmentReliabilityPercent: commitmentReliabilityPercent,
    });
  }

  return {
    sprintId: sprint.id,
    sprintName: sprint.name,
    status: sprint.status,
    isActive,
    rollingVelocity3Sprint: rollingVelocity,
    rollingVelocity,
    velocityWindow,
    historicalSprintsEvaluated: Math.min(velocityWindow, historicalSprints.length),
    historicalSprints: historicalSprints.map((h) => ({
      id: h.id,
      name: h.name,
      completed_points: h.completed_points,
      committed_points: h.committed_points,
      ends_at: h.ends_at,
      project_id: h.project_id,
    })),
    committedPoints: committed,
    currentSprintPoints: totalCurrentPoints,
    completedPoints,
    remainingPoints,
    inProgressPoints,
    pointsAddedMidSprint,
    pointsDroppedMidSprint,
    scopeCreepPercent,
    commitmentReliabilityPercent,
    reliabilityStatus,
    cycleTimeDays,
    wipAgeDays,
    runwayElapsedRatio,
    runwayLocked,
    runwayCutoffRatio: rules.late_runway_threshold,
    runwayMaxPoints: rules.late_runway_max_points,
    capacityRemaining,
    velocityTrend,
    rules,
    ...periodFields,
  };
}
