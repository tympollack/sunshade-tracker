import { LifecycleStage, ProjectSettings, StatusDefinition, WorkItem } from '@/types/tracker';

export const TERMINAL_GRACE_PERIOD_MS = 12 * 60 * 60 * 1000; // 12 hours

const VALID_LIFECYCLE_STAGES = new Set<LifecycleStage>([
  'unstarted',
  'execution',
  'verification',
  'staging',
  'terminal',
]);

/**
 * Normalizes a candidate lifecycle category string into a valid LifecycleStage,
 * or returns undefined if unrecognized.
 */
export function parseLifecycleCategory(raw: unknown): LifecycleStage | undefined {
  if (typeof raw !== 'string') return undefined;
  const cleaned = raw.trim().toLowerCase();
  if (cleaned === 'backlog') return 'unstarted';
  if (VALID_LIFECYCLE_STAGES.has(cleaned as LifecycleStage)) {
    return cleaned as LifecycleStage;
  }
  return undefined;
}

/**
 * Dynamically classifies an arbitrary work item status into a canonical lifecycle stage
 * ('unstarted' | 'execution' | 'verification' | 'staging' | 'terminal') using only
 * the project's schema configuration (`projectSettings.statuses`), with zero hardcoded
 * status string checks.
 *
 * Resolution order:
 * 1. Explicit `lifecycle_category` on the matching status definition in `projectSettings.statuses`.
 * 2. Boolean `is_completed === true` on the status definition -> `'terminal'`.
 * 3. Configured project bucket arrays (`completed_statuses`, `unstarted_statuses`, `in_progress_statuses`).
 * 4. Graceful fallback to `'unstarted'`.
 */
export function resolveItemLifecycle(
  item: Pick<WorkItem, 'status'> | null | undefined,
  projectSettings?: ProjectSettings | null
): LifecycleStage {
  if (!item || typeof item.status !== 'string' || !projectSettings) {
    return 'unstarted';
  }

  const targetStatusId = item.status.trim().toLowerCase();
  if (!targetStatusId) {
    return 'unstarted';
  }

  const statuses: StatusDefinition[] = Array.isArray(projectSettings.statuses)
    ? projectSettings.statuses
    : [];

  const matchedStatus = statuses.find(
    (s) => s && typeof s.id === 'string' && s.id.trim().toLowerCase() === targetStatusId
  );

  if (matchedStatus) {
    const explicitCategory = parseLifecycleCategory(matchedStatus.lifecycle_category);
    if (explicitCategory) {
      return explicitCategory;
    }
    if (matchedStatus.is_completed === true) {
      return 'terminal';
    }
  }

  // Check project-configured status bucket arrays if defined on projectSettings
  const completedBucket =
    projectSettings.completed_statuses || projectSettings.sprint_metrics?.completed_statuses;
  if (
    Array.isArray(completedBucket) &&
    completedBucket.some((s) => typeof s === 'string' && s.trim().toLowerCase() === targetStatusId)
  ) {
    return 'terminal';
  }

  const unstartedBucket =
    projectSettings.unstarted_statuses || projectSettings.sprint_metrics?.unstarted_statuses;
  if (
    Array.isArray(unstartedBucket) &&
    unstartedBucket.some((s) => typeof s === 'string' && s.trim().toLowerCase() === targetStatusId)
  ) {
    return 'unstarted';
  }

  const inProgressBucket =
    projectSettings.in_progress_statuses || projectSettings.sprint_metrics?.in_progress_statuses;
  if (
    Array.isArray(inProgressBucket) &&
    inProgressBucket.some((s) => typeof s === 'string' && s.trim().toLowerCase() === targetStatusId)
  ) {
    return 'execution';
  }

  return 'unstarted';
}

/**
 * Determines whether a terminal item was completed within the recent grace window (default: 12 hours).
 */
export function isWithinTerminalGracePeriod(
  item: Pick<WorkItem, 'updated_at' | 'metadata'>,
  nowMs: number = Date.now(),
  gracePeriodMs: number = TERMINAL_GRACE_PERIOD_MS
): boolean {
  const rawTimestamp = item.metadata?.completed_at || item.updated_at;
  if (typeof rawTimestamp !== 'string' || !rawTimestamp.trim()) {
    return false;
  }
  const timestampMs = Date.parse(rawTimestamp);
  if (Number.isNaN(timestampMs)) {
    return false;
  }
  const elapsedMs = nowMs - timestampMs;
  return elapsedMs >= 0 && elapsedMs <= gracePeriodMs;
}

/**
 * Filters a collection of work items down to active in-flight items across diverse project schemas:
 * - Excludes items mapped to `'unstarted'`.
 * - Retains items classified as `'execution'`, `'verification'`, or `'staging'`.
 * - Retains `'terminal'` items only if completed within the last 12 hours (grace period).
 */
export function filterInFlightItems(
  items: WorkItem[],
  projectMap: Map<string, ProjectSettings>,
  nowMs: number = Date.now(),
  gracePeriodMs: number = TERMINAL_GRACE_PERIOD_MS
): WorkItem[] {
  if (!Array.isArray(items) || !(projectMap instanceof Map)) {
    return [];
  }

  return items.filter((item) => {
    if (!item || item.deleted_at) {
      return false;
    }

    const projectSettings = projectMap.get(item.project_id);
    const stage = resolveItemLifecycle(item, projectSettings);

    if (stage === 'execution' || stage === 'verification' || stage === 'staging') {
      return true;
    }

    if (stage === 'terminal') {
      return isWithinTerminalGracePeriod(item, nowMs, gracePeriodMs);
    }

    return false;
  });
}
