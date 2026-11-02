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
  estimatedHours: number;
  baseTokens: number;
  dynamicBountyTokens: number;
  formattedRewardLabel: string;
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
}): NeglectCalculationResult {
  const priority = normalizePriority(options.priority);
  const priorityWeight = PRIORITY_WEIGHTS[priority];
  const daysDormant = calculateDaysDormant(options.lastActivityDate, options.referenceNow);
  const neglectMultiplier = calculateNeglectMultiplier(daysDormant, priority);

  const rawHours = Number(options.estimatedHours);
  const estimatedHours = isNaN(rawHours) || rawHours <= 0 ? DEFAULT_ESTIMATED_HOURS : rawHours;

  const baseTokens = Math.round(estimatedHours * TOKEN_RATE_PER_HOUR);
  const dynamicBountyTokens = Math.round(baseTokens * neglectMultiplier);

  const formattedRewardLabel =
    neglectMultiplier > 1.0
      ? `${dynamicBountyTokens.toLocaleString()} Tokens (${neglectMultiplier.toFixed(2)}x Neglect Yield)`
      : `${dynamicBountyTokens.toLocaleString()} Tokens`;

  return {
    daysDormant,
    priorityWeight,
    priority,
    neglectMultiplier,
    estimatedHours,
    baseTokens,
    dynamicBountyTokens,
    formattedRewardLabel,
  };
}

/**
 * Enriches a work item metadata object with calculated neglect pricing fields.
 */
export function enrichItemWithNeglectPricing(item: any, referenceNow?: Date) {
  const meta = item.metadata || {};
  const dateToUse = item.updated_at || item.created_at;
  const priorityToUse = item.priority || meta.priority;
  const hoursToUse = meta.estimated_hours || meta.bounty_hours;

  const pricing = calculateBountyPricing({
    estimatedHours: hoursToUse,
    priority: priorityToUse,
    lastActivityDate: dateToUse,
    referenceNow,
  });

  return {
    ...item,
    metadata: {
      ...meta,
      bounty_active: meta.bounty_active ?? true,
      neglect_multiplier: pricing.neglectMultiplier,
      days_dormant: pricing.daysDormant,
      priority_weight: pricing.priorityWeight,
      base_tokens: pricing.baseTokens,
      dynamic_tokens: pricing.dynamicBountyTokens,
      bounty_reward: pricing.formattedRewardLabel,
    },
  };
}
