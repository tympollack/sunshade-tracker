/**
 * Neglect Multiplier and Sovereign Yield Pricing Engine
 *
 * Implements the formula:
 * M_neglect = 1.0 + min(1.0, (days_dormant / 30) * priority_weight)
 *
 * Calibrated token scale:
 * 20 hours = 1,200,000 tokens
 * 1 hour   = 60,000 tokens
 * 1 minute = 1,000 tokens
 */

export const TOKEN_RATE_PER_HOUR = 60000;
export const SOVEREIGN_WEEKLY_HOURS_CAP = 20;
export const SOVEREIGN_WEEKLY_TOKEN_CAP = SOVEREIGN_WEEKLY_HOURS_CAP * TOKEN_RATE_PER_HOUR; // 1,200,000 tokens
export const MAX_NEGLECT_MULTIPLIER = 2.0;
export const DEFAULT_ESTIMATED_HOURS = 1.0;
export const DEFAULT_PROCESS_EFFICIENCY_FACTOR = 1.0;
export const MIN_PROCESS_EFFICIENCY_FACTOR = 0.1;
export const MAX_PROCESS_EFFICIENCY_FACTOR = 5.0;

export type TaskPriority = 'critical' | 'high' | 'medium' | 'low';

export const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
  critical: 1.5,
  high: 1.25,
  medium: 1.0,
  low: 0.5,
};

export interface NeglectCalculationResult {
  daysDormant: number;
  priorityWeight: number;
  priority: TaskPriority;
  neglectMultiplier: number; // Between 1.0 and 2.0
  processEfficiencyFactor: number; // Clamped to [0.1, 5.0], default 1.0
  patronBoostTokens: number; // Pool-backed Directed Patron Boost
  estimatedHours: number;
  baseTokens: number;
  dynamicBountyTokens: number;
  formattedRewardLabel: string;
}

/**
 * Normalizes a project's process_efficiency_factor into [0.1, 5.0], defaulting to 1.0.
 */
export function normalizeProcessEfficiencyFactor(rawFactor?: number | null): number {
  if (rawFactor === null || rawFactor === undefined) {
    return DEFAULT_PROCESS_EFFICIENCY_FACTOR;
  }
  const n = Number(rawFactor);
  if (!Number.isFinite(n) || n <= 0) {
    return DEFAULT_PROCESS_EFFICIENCY_FACTOR;
  }
  const clamped = Math.min(MAX_PROCESS_EFFICIENCY_FACTOR, Math.max(MIN_PROCESS_EFFICIENCY_FACTOR, n));
  return Number(clamped.toFixed(2));
}

/**
 * Normalizes string priority to recognized TaskPriority.
 */
export function normalizePriority(rawPriority?: string | null): TaskPriority {
  const p = String(rawPriority || '').toLowerCase().trim();
  if (p === 'critical' || p === 'urgent' || p === 'p0') return 'critical';
  if (p === 'high' || p === 'p1') return 'high';
  if (p === 'low' || p === 'p3') return 'low';
  return 'medium';
}

/**
 * Calculates days elapsed between a reference date (or creation/update) and now.
 */
export function calculateDaysDormant(dateInput?: string | Date | null, referenceNow: Date = new Date()): number {
  if (!dateInput) return 0;
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return 0;

  const diffMs = referenceNow.getTime() - d.getTime();
  if (diffMs <= 0) return 0;

  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Calculates the Neglect Multiplier M_neglect:
 * M_neglect = 1.0 + min(1.0, (days_dormant / 30) * priority_weight)
 */
export function calculateNeglectMultiplier(
  daysDormant: number,
  priority: TaskPriority = 'medium'
): number {
  const weight = PRIORITY_WEIGHTS[priority] ?? 1.0;
  const normalizedDays = Math.max(0, daysDormant);
  const surge = Math.min(1.0, (normalizedDays / 30) * weight);
  const multiplier = 1.0 + surge;

  // Cap at MAX_NEGLECT_MULTIPLIER (2.0) and round to 2 decimal places
  return Number(Math.min(MAX_NEGLECT_MULTIPLIER, multiplier).toFixed(2));
}

/**
 * Calculates dynamic sovereign bounty token rewards given an item or parameters.
 */
export function calculateBountyPricing(options: {
  estimatedHours?: number | null;
  priority?: string | null;
  lastActivityDate?: string | Date | null;
  referenceNow?: Date;
  processEfficiencyFactor?: number | null;
  patronBoostTokens?: number | null;
}): NeglectCalculationResult {
  const priority = normalizePriority(options.priority);
  const priorityWeight = PRIORITY_WEIGHTS[priority];
  const daysDormant = calculateDaysDormant(options.lastActivityDate, options.referenceNow);
  const neglectMultiplier = calculateNeglectMultiplier(daysDormant, priority);
  const processEfficiencyFactor = normalizeProcessEfficiencyFactor(options.processEfficiencyFactor);
  const rawBoost = Number(options.patronBoostTokens);
  const patronBoostTokens = Number.isFinite(rawBoost) && rawBoost > 0 ? Math.round(rawBoost) : 0;

  const rawHours = Number(options.estimatedHours);
  const estimatedHours = isNaN(rawHours) || rawHours <= 0 ? DEFAULT_ESTIMATED_HOURS : rawHours;

  const baseTokens = Math.round(estimatedHours * TOKEN_RATE_PER_HOUR);
  const dynamicBountyTokens =
    Math.round(baseTokens * neglectMultiplier * processEfficiencyFactor) + patronBoostTokens;

  const badges: string[] = [];
  if (neglectMultiplier > 1.0) {
    badges.push(
      processEfficiencyFactor !== 1.0
        ? `${neglectMultiplier.toFixed(2)}x Neglect`
        : `${neglectMultiplier.toFixed(2)}x Neglect Yield`
    );
  }
  if (processEfficiencyFactor !== 1.0) {
    badges.push(
      neglectMultiplier > 1.0
        ? `${processEfficiencyFactor.toFixed(2)}x Efficiency`
        : `${processEfficiencyFactor.toFixed(2)}x Process Efficiency`
    );
  }
  if (patronBoostTokens > 0) {
    badges.push(`+${patronBoostTokens.toLocaleString()} Patron Boost`);
  }

  const formattedRewardLabel =
    badges.length > 0
      ? `${dynamicBountyTokens.toLocaleString()} Tokens (${badges.join(' · ')})`
      : `${dynamicBountyTokens.toLocaleString()} Tokens`;

  return {
    daysDormant,
    priorityWeight,
    priority,
    neglectMultiplier,
    processEfficiencyFactor,
    patronBoostTokens,
    estimatedHours,
    baseTokens,
    dynamicBountyTokens,
    formattedRewardLabel,
  };
}

/**
 * Enriches a work item metadata object with calculated neglect pricing fields.
 */
export function enrichItemWithNeglectPricing(
  item: any,
  referenceNow?: Date,
  projectSettings?: { process_efficiency_factor?: number | null } | null
) {
  const meta = item.metadata || {};
  const dateToUse = item.updated_at || item.created_at;
  const priorityToUse = item.priority || meta.priority;
  const hoursToUse = meta.estimated_hours || meta.bounty_hours;
  const factorToUse =
    projectSettings?.process_efficiency_factor ??
    item.process_efficiency_factor ??
    meta.process_efficiency_factor;

  const pricing = calculateBountyPricing({
    estimatedHours: hoursToUse,
    priority: priorityToUse,
    lastActivityDate: dateToUse,
    referenceNow,
    processEfficiencyFactor: factorToUse,
  });

  return {
    ...item,
    metadata: {
      ...meta,
      bounty_active: meta.bounty_active ?? true,
      neglect_multiplier: pricing.neglectMultiplier,
      process_efficiency_factor: pricing.processEfficiencyFactor,
      days_dormant: pricing.daysDormant,
      priority_weight: pricing.priorityWeight,
      base_tokens: pricing.baseTokens,
      dynamic_tokens: pricing.dynamicBountyTokens,
      bounty_reward: pricing.formattedRewardLabel,
    },
  };
}
