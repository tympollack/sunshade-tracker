/**
 * Metric calculation and formatting utilities for Sprint & Flow Analytics.
 */

export interface SayDoBadge {
  label: 'Healthy' | 'Over-Delivered' | 'Moderate Drift' | 'Scope Volatile';
  colorClasses: string;
}

/**
 * Calculates Say/Do commitment reliability percentage.
 * Formula: (deliveredPoints / committedPoints) * 100, clamped to 1 decimal place.
 * Returns 0 if committedPoints <= 0 or invalid.
 */
export function calculateSayDoPercentage(committedPoints?: number, deliveredPoints?: number): number {
  if (typeof committedPoints !== 'number' || isNaN(committedPoints) || committedPoints <= 0) {
    return 0;
  }
  const safeDelivered = typeof deliveredPoints === 'number' && !isNaN(deliveredPoints) ? deliveredPoints : 0;
  const rawPct = (safeDelivered / committedPoints) * 100;
  return Math.round(rawPct * 10) / 10;
}

/**
 * Formats a Say/Do percentage with clean precision:
 * - Eliminates floating point leaks (e.g. 0.8859999999999999% -> 88.6%).
 * - Integers render without decimal (e.g. 100%, 89%, 188%).
 * - Fractional values clamp to max 1 decimal place (e.g. 88.6%, 33.3%).
 */
export function formatSayDoPercentage(value: number): string {
  if (typeof value !== 'number' || isNaN(value)) {
    return '0%';
  }
  const rounded = Math.round(value * 10) / 10;
  if (Number.isInteger(rounded)) {
    return `${rounded}%`;
  }
  return `${rounded.toFixed(1)}%`;
}

/**
 * Determines the Say/Do health badge and color styling according to governance rules:
 * - 'Healthy' (emerald/green) if 85% <= sayDoPct <= 115%
 * - 'Over-Delivered' (purple/blue) if sayDoPct > 115%
 * - 'Scope Volatile' (rose/red) if scope volatility exceeds threshold or sayDoPct < 70%
 * - 'Moderate Drift' (amber) if 70% <= sayDoPct < 85%
 */
export function getSayDoBadge(
  sayDoPct: number,
  scopeVolatility: number = 0,
  volatilityThreshold: number = 20
): SayDoBadge {
  const isVolatile = Math.abs(scopeVolatility) > volatilityThreshold;

  if (isVolatile || sayDoPct < 70) {
    return {
      label: 'Scope Volatile',
      colorClasses: 'text-red-400 bg-red-950/60 border-red-800/50',
    };
  }

  if (sayDoPct > 115) {
    return {
      label: 'Over-Delivered',
      colorClasses: 'text-purple-400 bg-purple-950/60 border-purple-800/50',
    };
  }

  if (sayDoPct >= 85) {
    return {
      label: 'Healthy',
      colorClasses: 'text-emerald-400 bg-emerald-950/60 border-emerald-800/50',
    };
  }

  return {
    label: 'Moderate Drift',
    colorClasses: 'text-amber-400 bg-amber-950/60 border-amber-800/50',
  };
}
