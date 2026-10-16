import { MetricRules } from '@/types/tracker';
import {
  resolveMetricRules,
  extractRawMetricRules,
  DEFAULT_METRIC_RULES,
} from '@/lib/services/sprintAnalyticsService';

export const DEFAULT_RUNWAY_CUTOFF = 0.60;
export const DEFAULT_LATE_INFLOW_CAP = 2;

export interface LateInflowGovernanceConfig {
  enforced: boolean;
  late_inflow_cap: number | null;
  runway_cutoff: number | null;
}

/**
 * Checks whether late inflow limits and runway cutoff constraints are active.
 * Returns false if explicitly disabled with null caps or enforce_late_inflow_caps === false.
 */
export function isLateInflowEnforced(metricsOrSettings?: any): boolean {
  if (!metricsOrSettings || typeof metricsOrSettings !== 'object') {
    return true;
  }

  // Consistent raw-rules extraction across settings, direct rules, or metadata
  const rules: any = extractRawMetricRules(metricsOrSettings);
  if (!rules || typeof rules !== 'object') {
    return true;
  }

  if (rules.enforce_late_inflow_caps === false) {
    return false;
  }

  if (rules.late_inflow_cap === null || rules.runway_cutoff === null) {
    return false;
  }

  if (rules.late_runway_max_points === null || rules.late_runway_threshold === null) {
    return false;
  }

  return true;
}

/**
 * Disables late inflow and runway caps by setting late_inflow_cap and runway_cutoff to null.
 * Also synchronizes legacy late_runway_max_points and late_runway_threshold to null,
 * while preserving previous custom numbers in _prev_late_inflow_cap / _prev_runway_cutoff
 * so custom values are not permanently lost across on/off toggle cycles.
 */
export function disableLateInflowCaps(metrics?: MetricRules): MetricRules {
  const currentCap =
    typeof metrics?.late_inflow_cap === 'number'
      ? metrics.late_inflow_cap
      : typeof metrics?.late_runway_max_points === 'number'
      ? metrics.late_runway_max_points
      : (metrics as any)?._prev_late_inflow_cap;

  const currentCutoff =
    typeof metrics?.runway_cutoff === 'number'
      ? metrics.runway_cutoff
      : typeof metrics?.late_runway_threshold === 'number'
      ? metrics.late_runway_threshold
      : (metrics as any)?._prev_runway_cutoff;

  return {
    ...metrics,
    late_inflow_cap: null,
    runway_cutoff: null,
    late_runway_max_points: null,
    late_runway_threshold: null,
    enforce_late_inflow_caps: false,
    _prev_late_inflow_cap: typeof currentCap === 'number' ? currentCap : DEFAULT_LATE_INFLOW_CAP,
    _prev_runway_cutoff: typeof currentCutoff === 'number' ? currentCutoff : DEFAULT_RUNWAY_CUTOFF,
  };
}

/**
 * Enables late inflow and runway caps with specified, previously preserved, or default thresholds.
 */
export function enableLateInflowCaps(
  metrics?: MetricRules,
  defaultCap?: number,
  defaultCutoff?: number
): MetricRules {
  const restoredCap =
    (typeof defaultCap === 'number' && defaultCap > 0 ? defaultCap : undefined) ??
    (typeof (metrics as any)?._prev_late_inflow_cap === 'number'
      ? (metrics as any)._prev_late_inflow_cap
      : undefined) ??
    (typeof metrics?.late_inflow_cap === 'number' ? metrics.late_inflow_cap : undefined) ??
    (typeof metrics?.late_runway_max_points === 'number'
      ? metrics.late_runway_max_points
      : undefined) ??
    DEFAULT_LATE_INFLOW_CAP;

  const restoredCutoff =
    (typeof defaultCutoff === 'number' && defaultCutoff > 0 ? defaultCutoff : undefined) ??
    (typeof (metrics as any)?._prev_runway_cutoff === 'number'
      ? (metrics as any)._prev_runway_cutoff
      : undefined) ??
    (typeof metrics?.runway_cutoff === 'number' ? metrics.runway_cutoff : undefined) ??
    (typeof metrics?.late_runway_threshold === 'number'
      ? metrics.late_runway_threshold
      : undefined) ??
    DEFAULT_RUNWAY_CUTOFF;

  return {
    ...metrics,
    late_inflow_cap: restoredCap,
    runway_cutoff: restoredCutoff,
    late_runway_max_points: restoredCap,
    late_runway_threshold: restoredCutoff,
    enforce_late_inflow_caps: true,
  };
}

/**
 * Resolves the effective late inflow governance rules from project settings or metric rules.
 * Uses consistent alias precedence (late_inflow_cap before late_runway_max_points;
 * runway_cutoff before late_runway_threshold).
 */
export function getEffectiveLateInflowRules(rulesOrSettings?: any): LateInflowGovernanceConfig {
  const enforced = isLateInflowEnforced(rulesOrSettings);
  if (!enforced) {
    return {
      enforced: false,
      late_inflow_cap: null,
      runway_cutoff: null,
    };
  }

  const rules = resolveMetricRules(rulesOrSettings);
  const cap =
    typeof rules.late_inflow_cap === 'number'
      ? rules.late_inflow_cap
      : typeof rules.late_runway_max_points === 'number'
      ? rules.late_runway_max_points
      : DEFAULT_LATE_INFLOW_CAP;

  const cutoff =
    typeof rules.runway_cutoff === 'number'
      ? rules.runway_cutoff
      : typeof rules.late_runway_threshold === 'number'
      ? rules.late_runway_threshold
      : DEFAULT_RUNWAY_CUTOFF;

  return {
    enforced: true,
    late_inflow_cap: cap,
    runway_cutoff: cutoff,
  };
}
