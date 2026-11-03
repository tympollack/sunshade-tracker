import { LifecycleStage, ProjectSettings, StatusDefinition, WorkItem } from '@/types/tracker';
import { DEFAULT_METRIC_RULES } from './sprintAnalyticsService';

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
 * 4. Compatibility fallback for legacy persisted schemas that omit `lifecycle_category` and bucket arrays.
 * 5. Graceful fallback to `'unstarted'`.
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

  // Compatibility fallback for already-persisted schemas whose status definitions omit lifecycle_category
  if (matchedStatus) {
    if (
      matchedStatus.is_completed !== false &&
      DEFAULT_METRIC_RULES.completed_statuses.some(
        (s) => s.trim().toLowerCase() === targetStatusId
      )
    ) {
      return 'terminal';
    }
    if (
      DEFAULT_METRIC_RULES.unstarted_statuses.some(
        (s) => s.trim().toLowerCase() === targetStatusId
      )
    ) {
      return 'unstarted';
    }
    if (
      DEFAULT_METRIC_RULES.in_progress_statuses.some(
        (s) => s.trim().toLowerCase() === targetStatusId
      )
    ) {
      return 'execution';
    }

    // Positional fallback when no status in the schema has an explicit lifecycle_category
    const hasAnyExplicitCategory = statuses.some((s) =>
      Boolean(parseLifecycleCategory(s?.lifecycle_category))
    );
    if (!hasAnyExplicitCategory) {
      const nonTerminalSorted = statuses
        .filter((s) => s && !s.is_completed)
        .slice()
        .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
      const posIndex = nonTerminalSorted.findIndex(
        (s) => s.id.trim().toLowerCase() === targetStatusId
      );
      if (posIndex > 0) {
        return 'execution';
      }
    }
  }

  return 'unstarted';
}

/**
 * Resolves the completion timestamp (in epoch ms) for a terminal item.
 * Prioritizes:
 * 1. `item.metadata?.completed_at`
 * 2. Transition timestamp from `stageEntryTimestamps` (audit log transition into terminal status)
 * 3. `item.metadata?.stage_entered_at`
 * 4. When `stageEntryTimestamps` is provided, falls back to `item.created_at` (avoiding general `updated_at`
 *    so unrelated edits to old completed items do not re-count them as recent completions).
 *    When `stageEntryTimestamps` is omitted, falls back to `item.updated_at || item.created_at`.
 */
export function resolveTerminalCompletionMs(
  item: Pick<WorkItem, 'id' | 'created_at' | 'updated_at' | 'metadata'>,
  stageEntryTimestamps?: Map<string, number>
): number {
  if (typeof item.metadata?.completed_at === 'string' && item.metadata.completed_at.trim()) {
    const parsed = Date.parse(item.metadata.completed_at.trim());
    if (!Number.isNaN(parsed)) return parsed;
  }

  if (stageEntryTimestamps && item.id && stageEntryTimestamps.has(item.id)) {
    const transitionMs = stageEntryTimestamps.get(item.id)!;
    if (!Number.isNaN(transitionMs)) return transitionMs;
  }

  if (typeof item.metadata?.stage_entered_at === 'string' && item.metadata.stage_entered_at.trim()) {
    const parsed = Date.parse(item.metadata.stage_entered_at.trim());
    if (!Number.isNaN(parsed)) return parsed;
  }

  const fallbackIso = stageEntryTimestamps
    ? item.created_at
    : item.updated_at || item.created_at;
  if (typeof fallbackIso === 'string' && fallbackIso.trim()) {
    return Date.parse(fallbackIso.trim());
  }

  return NaN;
}

/**
 * Determines whether a terminal item was completed within the recent grace window (default: 12 hours).
 */
export function isWithinTerminalGracePeriod(
  item: Pick<WorkItem, 'updated_at' | 'metadata'> & Partial<Pick<WorkItem, 'id' | 'created_at'>>,
  nowMs: number = Date.now(),
  gracePeriodMs: number = TERMINAL_GRACE_PERIOD_MS,
  stageEntryTimestamps?: Map<string, number>
): boolean {
  const timestampMs = resolveTerminalCompletionMs(
    {
      id: item.id || '',
      created_at: item.created_at || '',
      updated_at: item.updated_at,
      metadata: item.metadata,
    },
    stageEntryTimestamps
  );
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
  gracePeriodMs: number = TERMINAL_GRACE_PERIOD_MS,
  stageEntryTimestamps?: Map<string, number>
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
      return isWithinTerminalGracePeriod(item, nowMs, gracePeriodMs, stageEntryTimestamps);
    }

    return false;
  });
}
