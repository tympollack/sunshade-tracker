import { MetricRules } from '@/types/tracker';
import { resolveMetricRules, DEFAULT_METRIC_RULES } from '@/lib/services/sprintAnalyticsService';

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

  const rules: any =
    metricsOrSettings.sprint_metrics ||
    metricsOrSettings.metric_rules ||
    metricsOrSettings.sprint_settings?.metric_rules ||
    metricsOrSettings.sprint_settings?.metrics ||
    metricsOrSettings;

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
 * Also synchronizes legacy late_runway_max_points and late_runway_threshold to null.
 */
export function disableLateInflowCaps(metrics?: MetricRules): MetricRules {
  return {
    ...metrics,
    late_inflow_cap: null,
    runway_cutoff: null,
    late_runway_max_points: null,
    late_runway_threshold: null,
    enforce_late_inflow_caps: false,
  };
}

/**
 * Enables late inflow and runway caps with specified or default thresholds.
 */
export function enableLateInflowCaps(
  metrics?: MetricRules,
  defaultCap: number = DEFAULT_LATE_INFLOW_CAP,
  defaultCutoff: number = DEFAULT_RUNWAY_CUTOFF
): MetricRules {
  return {
    ...metrics,
    late_inflow_cap: defaultCap,
    runway_cutoff: defaultCutoff,
    late_runway_max_points: defaultCap,
    late_runway_threshold: defaultCutoff,
    enforce_late_inflow_caps: true,
  };
}

/**
 * Resolves the effective late inflow governance rules from project settings or metric rules.
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
