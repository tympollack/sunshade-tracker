import { WorkItem, ProjectSettings, SprintDefinition, MetricRules } from '@/types/tracker';
import { calculateSprintLeafPoints } from '@/lib/sprint-utils';
import { resolveMetricRules, DEFAULT_METRIC_RULES } from './sprintAnalyticsService';

export interface SprintScopeData {
  id: string;
  name: string;
  status: 'planned' | 'active' | 'completed' | 'unplanned' | string;
  is_active?: boolean;
  started_at?: string | null;
  ends_at?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  committed_points?: number;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface IntakeValidationOptions {
  ejectedItemIds?: string[];
  ejectedItems?: WorkItem[];
  overrideP0?: boolean;
  isEmergency?: boolean;
  rules?: MetricRules;
  now?: Date | string | number;
}

export interface IntakeValidationResult {
  valid: boolean;
  elapsed_ratio?: number;
  required_ejection_points: number;
  remaining_capacity?: number;
  current_active_points?: number;
  committed_points?: number;
  ejected_items?: WorkItem[];
  ejected_item_ids?: string[];
}

export class SprintGuardrailError extends Error {
  code: 'SCOPE_OVERFLOW' | 'LATE_RUNWAY_EXCEEDED' | 'ESTIMATE_LOCKED' | 'INVALID_EJECTION' | string;
  status: number;
  required_ejection_points?: number;
  details?: Record<string, any>;

  constructor(opts: {
    code: 'SCOPE_OVERFLOW' | 'LATE_RUNWAY_EXCEEDED' | 'ESTIMATE_LOCKED' | 'INVALID_EJECTION' | string;
    message: string;
    status?: number;
    required_ejection_points?: number;
    details?: Record<string, any>;
  }) {
    super(opts.message);
    this.name = 'SprintGuardrailError';
    this.code = opts.code;
    this.status = opts.status ?? (opts.code === 'INVALID_EJECTION' ? 400 : 409);
    this.required_ejection_points = opts.required_ejection_points;
    this.details = opts.details;
  }
}

/**
 * Standard unstarted / backlog status identifiers.
 */
export const UNSTARTED_STATUSES = new Set([
  'not_started',
  'todo',
  'unplanned',
  'backlog',
  'open',
  'planned',
  'pitch_backlog',
]);

/**
 * Check if a status represents an unstarted work item eligible for ejection.
 */
export function isUnstartedStatus(
  status?: string | null,
  customStatuses?: string[] | Set<string>
): boolean {
  if (!status) return true;
  const normalized = status.toLowerCase().trim();
  if (customStatuses) {
    if (customStatuses instanceof Set) {
      return customStatuses.has(normalized);
    }
    return customStatuses.some((s) => s.toLowerCase().trim() === normalized);
  }
  return UNSTARTED_STATUSES.has(normalized);
}

/**
 * Check whether a sprint is considered active.
 */
export function isSprintActive(sprint?: Partial<SprintScopeData> | null): boolean {
  if (!sprint) return false;
  if (sprint.is_active === true) return true;
  if (sprint.is_current === true) return true;
  const st = String(sprint.status || '').toLowerCase().trim();
  return st === 'active' || st === 'in_progress';
}

/**
 * Calculates elapsed sprint ratio: (now - started_at) / (ends_at - started_at).
 * Returns a number between 0.0 and 1.0 (or greater if past ends_at).
 */
export function calculateElapsedRatio(
  startedAt?: string | number | Date | null,
  endsAt?: string | number | Date | null,
  nowTime?: string | number | Date | null
): number {
  if (!startedAt || !endsAt) return 0.0;

  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(endsAt).getTime();
  const nowMs = nowTime ? new Date(nowTime).getTime() : Date.now();

  if (isNaN(startMs) || isNaN(endMs) || isNaN(nowMs)) return 0.0;
  if (endMs <= startMs) return 1.0;

  const ratio = (nowMs - startMs) / (endMs - startMs);
  return Math.max(0.0, ratio);
}

/**
 * Extracts numeric story points from item metadata or root attributes.
 */
export function extractStoryPoints(item?: Partial<WorkItem> | any): number {
  if (!item) return 0;
  const p = item.metadata?.story_points ?? item.story_points ?? item.points ?? item.metadata?.points ?? item.metadata?.estimate;
  const num = Number(p);
  return isNaN(num) || num < 0 ? 0 : num;
}

/**
 * Checks if work item is a feature / story type subject to late runway sizing.
 */
export function isFeatureStory(
  item?: Partial<WorkItem> | any,
  customFeatureTypes?: string[]
): boolean {
  if (!item) return false;
  const type = String(item.item_type || item.type || item.metadata?.item_type || '').toLowerCase().trim();
  if (customFeatureTypes && customFeatureTypes.length > 0) {
    return customFeatureTypes.some((t) => t.toLowerCase().trim() === type);
  }
  return type === 'story' || type === 'feature';
}

/**
 * Pure validation engine for sprint intake. Isolated with 0 external database calls.
 */
export function validateSprintIntakePure(params: {
  sprint: Partial<SprintScopeData>;
  currentSprintItems: WorkItem[];
  incomingItem: Partial<WorkItem> | any;
  options?: IntakeValidationOptions;
  rules?: MetricRules;
}): IntakeValidationResult {
  const { sprint, currentSprintItems, incomingItem, options } = params;
  const rules = resolveMetricRules(
    params.rules ||
      options?.rules ||
      sprint?.metadata?.metric_rules ||
      sprint?.metadata?.sprint_metrics ||
      sprint?.metadata
  );

  // 1. Check Emergency Override flag (using configured emergency priorities)
  const itemPriority = String(
    incomingItem.metadata?.priority || incomingItem.priority || ''
  ).toUpperCase().trim();
  const isP0Item = rules.emergency_priorities.some((p: string) => p.toUpperCase().trim() === itemPriority);
  const isEmergency = isP0Item;

  if (isEmergency) {
    return {
      valid: true,
      required_ejection_points: 0,
      ejected_items: options?.ejectedItems || [],
      ejected_item_ids: options?.ejectedItemIds || [],
    };
  }

  // If sprint is not active, guardrails do not block intake
  if (!isSprintActive(sprint)) {
    return {
      valid: true,
      required_ejection_points: 0,
      ejected_items: options?.ejectedItems || [],
      ejected_item_ids: options?.ejectedItemIds || [],
    };
  }

  // 2. Guardrail 2: Late-Sprint Runway Rules
  // Calculate elapsed sprint timeline: elapsed_ratio = (now() - started_at) / (ends_at - started_at)
  const startedAt = sprint.started_at || sprint.start_date;
  const endsAt = sprint.ends_at || sprint.end_date;
  let elapsedRatio = 0.0;

  if (startedAt && endsAt) {
    elapsedRatio = calculateElapsedRatio(startedAt, endsAt, options?.now);

    // If elapsed_ratio > rules.late_runway_threshold (default 0.60), enforce strict sizing:
    if (elapsedRatio > rules.late_runway_threshold) {
      const incomingPoints = extractStoryPoints(incomingItem);
      const incomingType = String(incomingItem.item_type || incomingItem.type || incomingItem.metadata?.item_type || '').toLowerCase().trim();
      const isAllowedLateType = (rules.allowed_late_types || []).some((t) => t.toLowerCase().trim() === incomingType);
      const isFeature = isFeatureStory(incomingItem, rules.feature_story_types);

      if ((isFeature || !isAllowedLateType) && incomingPoints > rules.late_runway_max_points) {
        const thresholdPercent = Math.round(rules.late_runway_threshold * 100);
        const remainingPercent = 100 - thresholdPercent;
        throw new SprintGuardrailError({
          code: 'LATE_RUNWAY_EXCEEDED',
          status: 409,
          message: `Late-sprint runway threshold exceeded (${(elapsedRatio * 100).toFixed(1)}% elapsed > ${thresholdPercent}%). New feature stories are capped at ${rules.late_runway_max_points} story points during the final ${remainingPercent}% of the sprint. Only non-feature chores, test debt, or documentation tasks may exceed ${rules.late_runway_max_points} points.`,
          details: {
            elapsed_ratio: elapsedRatio,
            threshold: rules.late_runway_threshold,
            max_points: rules.late_runway_max_points,
            incoming_points: incomingPoints,
            item_type: incomingItem.item_type || incomingItem.type || 'story',
          },
        });
      }
    }
  }

  // 3. Guardrail 1: Strict Zero-Sum Swap API
  // Invariant: Total Active Points <= Sprint Commitment (if rules.enforce_zero_sum is true)
  const committedPoints = sprint.committed_points ?? sprint.metadata?.committed_points;

  if (rules.enforce_zero_sum && committedPoints !== undefined && committedPoints !== null) {
    // Current points in sprint (filtering out incomingItem if it was already in currentSprintItems)
    const existingSprintItems = (currentSprintItems || []).filter((it) => {
      if (incomingItem.id && it.id === incomingItem.id) return false;
      if (incomingItem.external_ref_id && it.external_ref_id && it.external_ref_id === incomingItem.external_ref_id) {
        return false;
      }
      return true;
    });
    const currentActivePoints = calculateSprintLeafPoints(existingSprintItems);
    const incomingPoints = extractStoryPoints(incomingItem);
    const remainingCapacity = Math.max(0, committedPoints - currentActivePoints);

    // Check if ejection candidates are provided for atomic ejection
    const candidateEjections: WorkItem[] = [];

    if (options?.ejectedItems && options.ejectedItems.length > 0) {
      candidateEjections.push(...options.ejectedItems);
    } else if (options?.ejectedItemIds && options.ejectedItemIds.length > 0) {
      const idSet = new Set(options.ejectedItemIds);
      for (const it of existingSprintItems) {
        if (idSet.has(it.id) || (it.external_ref_id && idSet.has(it.external_ref_id))) {
          candidateEjections.push(it);
        }
      }
    }

    // Always validate ejection candidates: must belong to the sprint and be in an unstarted status
    let totalEjectedPoints = 0;
    for (const ejected of candidateEjections) {
      const itemSprint = ejected.metadata?.sprint || (ejected as any).sprint;
      const itemSprintId = ejected.metadata?.sprint_id;
      const matchesSprint =
        (sprint.name && itemSprint === sprint.name) ||
        (sprint.id && (itemSprintId === sprint.id || itemSprint === sprint.id)) ||
        existingSprintItems.some((it) => it.id === ejected.id);

      if (!matchesSprint) {
        throw new SprintGuardrailError({
          code: 'INVALID_EJECTION',
          status: 400,
          message: `Cannot eject item '${ejected.title || ejected.id}': item does not belong to active sprint '${sprint.name || sprint.id}'.`,
          details: {
            invalid_item_id: ejected.id,
            sprint: sprint.name || sprint.id,
          },
        });
      }

      if (!isUnstartedStatus(ejected.status, rules.unstarted_statuses)) {
        throw new SprintGuardrailError({
          code: 'INVALID_EJECTION',
          status: 400,
          message: `Cannot eject item '${ejected.title || ejected.id}' (status: ${ejected.status}). Only unstarted items can be ejected back to the backlog.`,
          details: {
            invalid_item_id: ejected.id,
            status: ejected.status,
          },
        });
      }
      totalEjectedPoints += extractStoryPoints(ejected);
    }

    if (incomingPoints > remainingCapacity) {
      const requiredEjectionPoints = incomingPoints - remainingCapacity;

      if (totalEjectedPoints < requiredEjectionPoints) {
        throw new SprintGuardrailError({
          code: 'SCOPE_OVERFLOW',
          status: 409,
          required_ejection_points: requiredEjectionPoints,
          message: `Sprint capacity exceeded by ${requiredEjectionPoints} points (Committed: ${committedPoints}, Current: ${currentActivePoints}, Incoming: ${incomingPoints}, Remaining: ${remainingCapacity}). Required ejection: at least ${requiredEjectionPoints} unstarted points. Provided: ${totalEjectedPoints} points.`,
          details: {
            code: 'SCOPE_OVERFLOW',
            required_ejection_points: requiredEjectionPoints,
            committed_points: committedPoints,
            current_active_points: currentActivePoints,
            remaining_capacity: remainingCapacity,
            incoming_points: incomingPoints,
            ejected_points: totalEjectedPoints,
          },
        });
      }

      return {
        valid: true,
        elapsed_ratio: elapsedRatio,
        required_ejection_points: requiredEjectionPoints,
        remaining_capacity: remainingCapacity,
        current_active_points: currentActivePoints,
        committed_points: committedPoints,
        ejected_items: candidateEjections,
        ejected_item_ids: candidateEjections.map((it) => it.id),
      };
    }

    return {
      valid: true,
      elapsed_ratio: elapsedRatio,
      required_ejection_points: 0,
      remaining_capacity: remainingCapacity,
      current_active_points: currentActivePoints,
      committed_points: committedPoints,
      ejected_items: candidateEjections,
      ejected_item_ids: candidateEjections.map((it) => it.id),
    };
  }

  return {
    valid: true,
    elapsed_ratio: elapsedRatio,
    required_ejection_points: 0,
  };
}

/**
 * Guardrail 3 (Immutable Estimates):
 * Validates that story_points are not changed while an item is in an active sprint.
 * Respects configured `lock_estimates_in_active_sprint` rule (default: true).
 */
export function validateEstimateImmutability(
  currentItem: Partial<WorkItem>,
  incomingMetadata: Record<string, any>,
  sprint?: Partial<SprintScopeData> | null,
  rulesParam?: MetricRules
): void {
  const rules = resolveMetricRules(
    rulesParam || sprint?.metadata?.metric_rules || sprint?.metadata?.sprint_metrics || sprint?.metadata
  );

  // If estimate locking is disabled via configured settings, permit update
  if (!rules.lock_estimates_in_active_sprint) return;

  const oldPoints = currentItem.metadata?.story_points ?? currentItem.metadata?.points;
  const newPoints = incomingMetadata?.story_points ?? incomingMetadata?.points;

  // If estimates did not change, always allow
  if (oldPoints === undefined && newPoints === undefined) return;
  if (String(oldPoints ?? '') === String(newPoints ?? '')) return;

  if (sprint && isSprintActive(sprint)) {
    throw new SprintGuardrailError({
      code: 'ESTIMATE_LOCKED',
      status: 409,
      message: 'Estimates locked while sprint is active: cannot modify story_points or points on active sprint items',
      details: {
        item_id: currentItem.id,
        before: oldPoints,
        after: newPoints,
        sprint: sprint.name,
      },
    });
  }
}

