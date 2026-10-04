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
  feature_story_types: ['story', 'feature'],
  allowed_late_types: ['chore', 'task', 'debt', 'documentation', 'doc', 'test', 'bug'],
  enforce_zero_sum: true,
  unstarted_statuses: ['not_started', 'todo', 'unplanned', 'backlog', 'open', 'planned', 'pitch_backlog'],
  in_progress_statuses: ['in_progress', 'doing', 'review', 'in_review', 'qa', 'testing'],
  completed_statuses: ['complete', 'completed', 'done', 'resolved', 'closed', 'shipped'],
  emergency_priorities: ['P0', 'CRITICAL', 'EMERGENCY'],
  lock_estimates_in_active_sprint: true,
  scope_creep_warning_threshold: 15,
  scope_creep_danger_threshold: 30,
};

/**
 * Resolves effective metric rules by merging provided or stored JSON settings
 * with canonical task specification defaults.
 */
export function resolveMetricRules(settingsOrObject?: any): Required<MetricRules> {
  if (!settingsOrObject || typeof settingsOrObject !== 'object') {
    return { ...DEFAULT_METRIC_RULES };
  }

  // Look for metric_rules or sprint_metrics in various supported JSON locations:
  const rawRules: any =
    settingsOrObject.sprint_metrics ||
    settingsOrObject.metric_rules ||
    settingsOrObject.sprint_settings?.metric_rules ||
    settingsOrObject.sprint_settings?.metrics ||
    settingsOrObject.metadata?.metric_rules ||
    settingsOrObject.metadata?.sprint_metrics ||
    settingsOrObject;

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
    if (
      typeof rawRules.late_runway_threshold === 'number' &&
      rawRules.late_runway_threshold >= 0 &&
      rawRules.late_runway_threshold <= 1
    ) {
      resolved.late_runway_threshold = rawRules.late_runway_threshold;
    }
    if (typeof rawRules.late_runway_max_points === 'number' && rawRules.late_runway_max_points >= 0) {
      resolved.late_runway_max_points = rawRules.late_runway_max_points;
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
  rules?: MetricRules;
  now?: Date | string | number;
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
  scopeCreepPercent: number;
  commitmentReliabilityPercent: number;
  reliabilityStatus: 'green' | 'amber' | 'red';
  cycleTimeDays: number;
  wipAgeDays: number;
  runwayElapsedRatio: number;
  runwayLocked: boolean;
  runwayCutoffRatio: number;
  runwayMaxPoints: number;
  capacityRemaining: number;
  velocityTrend: 'increasing' | 'stable' | 'decreasing';
  rules: Required<MetricRules>;
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
 * Extracts story points from an item safely.
 */
function getItemPoints(item: WorkItemLifecycleData): number {
  const p = item.metadata?.story_points ?? item.story_points ?? item.points ?? item.metadata?.points ?? item.metadata?.estimate;
  const num = Number(p);
  return isNaN(num) || num < 0 ? 0 : num;
}

/**
 * Aggregates all pure sprint metrics and produces the comprehensive SprintHealthReport.
 */
export function computeSprintAnalytics(input: SprintAnalyticsInput): SprintHealthReport {
  const { sprint, historicalSprints = [], items = [], rules: rawRules, now } = input;
  const rules = resolveMetricRules(rawRules || sprint.metadata?.metric_rules || sprint.metadata?.sprint_metrics);

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
    const pts = getItemPoints(it);
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

  const runwayLocked = isActive && runwayElapsedRatio > rules.late_runway_threshold;
  const capacityRemaining = Math.max(0, committed - totalCurrentPoints);

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
    })),
    committedPoints: committed,
    currentSprintPoints: totalCurrentPoints,
    completedPoints,
    remainingPoints,
    inProgressPoints,
    pointsAddedMidSprint,
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
  };
}
