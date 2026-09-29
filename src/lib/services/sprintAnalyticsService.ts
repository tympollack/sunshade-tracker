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
  now?: Date | string | number;
}

export interface SprintHealthReport {
  sprintId: string;
  sprintName: string;
  status: string;
  isActive: boolean;
  rollingVelocity3Sprint: number;
  historicalSprintsEvaluated: number;
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
  capacityRemaining: number;
  velocityTrend: 'increasing' | 'stable' | 'decreasing';
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
 * Pure calculation: Rolling 3-Sprint Velocity.
 * Takes the up to 3 most recently closed sprints and averages their completed points.
 * Gracefully handles 0, 1, or 2 historical sprints.
 */
export function calculateRollingVelocity(historicalSprints?: HistoricalSprint[]): number {
  if (!historicalSprints || historicalSprints.length === 0) {
    return 0;
  }

  // Sprints are expected to be ordered by ends_at DESC; take up to 3
  const candidatePeriods = historicalSprints.slice(0, 3);
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
 * Categorizes Commitment Reliability % into SunShade standard health badges:
 * >= 85%: Green (Healthy)
 * 70% - 84.9%: Amber (Caution)
 * < 70%: Red (At Risk)
 */
export function getReliabilityStatus(reliabilityPercent: number): 'green' | 'amber' | 'red' {
  if (reliabilityPercent >= 85) return 'green';
  if (reliabilityPercent >= 70) return 'amber';
  return 'red';
}

/**
 * Pure calculation: Cycle Time across completed work items.
 * Mean time in days from status: in_progress to status: complete.
 */
export function calculateCycleTime(items?: WorkItemLifecycleData[]): number {
  if (!items || items.length === 0) return 0;

  const completedItems = items.filter((it) => {
    const st = String(it.status || '').toLowerCase().trim();
    return COMPLETED_STATUSES.has(st);
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
  nowParam?: Date | string | number
): number {
  if (!items || items.length === 0) return 0;

  const inProgressItems = items.filter((it) => {
    const st = String(it.status || '').toLowerCase().trim();
    return IN_PROGRESS_STATUSES.has(st);
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
  const { sprint, historicalSprints = [], items = [], now } = input;

  const isActive = Boolean(
    sprint.is_active ||
    sprint.status === 'active' ||
    sprint.status === 'in_progress' ||
    (sprint as any).is_current
  );

  const committed = Number(sprint.committed_points ?? sprint.metadata?.committed_points) || 0;

  // Aggregate item point buckets
  let completedPoints = 0;
  let inProgressPoints = 0;
  let remainingPoints = 0;
  let totalCurrentPoints = 0;
  let pointsAddedMidSprint = 0;

  for (const it of items) {
    const pts = getItemPoints(it);
    totalCurrentPoints += pts;

    const st = String(it.status || '').toLowerCase().trim();
    if (COMPLETED_STATUSES.has(st)) {
      completedPoints += pts;
    } else {
      remainingPoints += pts;
      if (IN_PROGRESS_STATUSES.has(st)) {
        inProgressPoints += pts;
      }
    }

    // Check if item was added mid-sprint
    if (it.metadata?.added_mid_sprint === true || it.metadata?.is_scope_creep === true) {
      pointsAddedMidSprint += pts;
    }
  }

  // If pointsAddedMidSprint is not explicitly marked on items, derive from totalCurrentPoints - committed
  if (pointsAddedMidSprint === 0 && totalCurrentPoints !== committed) {
    pointsAddedMidSprint = totalCurrentPoints - committed;
  }

  // 1. Rolling 3-sprint velocity
  const rollingVelocity = calculateRollingVelocity(historicalSprints);

  // 2. Velocity trend: compare current sprint points to rolling velocity
  let velocityTrend: 'increasing' | 'stable' | 'decreasing' = 'stable';
  if (rollingVelocity > 0) {
    const diff = totalCurrentPoints - rollingVelocity;
    if (diff > rollingVelocity * 0.1) {
      velocityTrend = 'increasing';
    } else if (diff < -rollingVelocity * 0.1) {
      velocityTrend = 'decreasing';
    }
  }

  // 3. Scope creep %
  const scopeCreepPercent = calculateScopeCreep(pointsAddedMidSprint, committed);

  // 4. Say/Do Commitment reliability %
  const commitmentReliabilityPercent = calculateCommitmentReliability(completedPoints, committed);
  const reliabilityStatus = getReliabilityStatus(commitmentReliabilityPercent);

  // 5. Cycle time & WIP age
  const cycleTimeDays = calculateCycleTime(items);
  const wipAgeDays = calculateWIPAge(items, now);

  // 6. Runway elapsed ratio & late runway lock
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

  const runwayLocked = isActive && runwayElapsedRatio > 0.60;
  const capacityRemaining = Math.max(0, committed - totalCurrentPoints);

  return {
    sprintId: sprint.id,
    sprintName: sprint.name,
    status: sprint.status,
    isActive,
    rollingVelocity3Sprint: rollingVelocity,
    historicalSprintsEvaluated: Math.min(3, historicalSprints.length),
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
    capacityRemaining,
    velocityTrend,
  };
}
