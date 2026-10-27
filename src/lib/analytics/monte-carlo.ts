/**
 * Monte Carlo Milestone & Epic Delivery Simulator
 * Simulates delivery trajectories by sampling with replacement from historical velocities.
 */

export type MonteCarloCadenceUnit =
  | 'day'
  | 'week'
  | '2-week'
  | 'month'
  | 'quarter'
  | 'year'
  | 'sprint';

export interface CadenceOption {
  unit: MonteCarloCadenceUnit;
  label: string;
}

export const CADENCE_OPTIONS: CadenceOption[] = [
  { unit: 'sprint', label: 'Sprints (Default)' },
  { unit: 'day', label: 'Days' },
  { unit: 'week', label: 'Weeks' },
  { unit: '2-week', label: '2 Weeks (Bi-weekly)' },
  { unit: 'month', label: 'Months' },
  { unit: 'quarter', label: 'Quarters' },
  { unit: 'year', label: 'Years' },
];

export interface ConvertedCadenceDuration {
  value: number | null;
  unit: MonteCarloCadenceUnit;
  label: string;
}

/**
 * Adds business days (excluding Saturday and Sunday) to a start date.
 */
export function addBusinessDays(startDate: Date | string, days: number): Date {
  const date = new Date(startDate);
  let remainingDays = Math.round(days);
  if (remainingDays <= 0) return date;

  while (remainingDays > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const dayOfWeek = date.getUTCDay();
    // 0 = Sunday, 6 = Saturday (UTC)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      remainingDays--;
    }
  }
  return date;
}

/**
 * Derives daily completion throughput bins from historical sprint velocities.
 * Decomposes sprint velocity into discrete daily samples accounting for intra-sprint delivery dynamics.
 */
export function deriveDailyThroughputBins(velocities: number[], sprintLengthDays: number = 14): number[] {
  const bins: number[] = [];
  const validLength = Math.max(1, sprintLengthDays);
  // Business working days in sprint (e.g. 10 days for a 14-day 2-week sprint)
  const activeWorkDays = Math.max(1, Math.round(validLength * (5 / 7)));

  for (const v of velocities) {
    if (v <= 0) {
      // Emit equal number of bins (9) for an idle sprint to preserve uniform historical sprint weighting
      for (let i = 0; i < 9; i++) {
        bins.push(0);
      }
      continue;
    }
    const avgDaily = v / activeWorkDays;
    // Intra-sprint variance distribution across working days:
    // ~11% zero-burn days (impediments, kickoff/retro days)
    // ~67% standard progress days (0.7x - 1.2x)
    // ~22% high-burst progress days (1.4x - 1.6x)
    bins.push(0);
    bins.push(avgDaily * 0.7);
    bins.push(avgDaily * 0.9);
    bins.push(avgDaily * 1.0);
    bins.push(avgDaily * 1.0);
    bins.push(avgDaily * 1.1);
    bins.push(avgDaily * 1.2);
    bins.push(avgDaily * 1.4);
    bins.push(avgDaily * 1.6);
  }

  return bins.length > 0 ? bins : [0];
}

// In-memory simulation cache for instant sub-millisecond retrieval
const memoryCache = new Map<string, MonteCarloSimulationResult>();

/**
 * Deterministic hash for historical velocity distributions.
 * Captures fractional values by scaling to 1000x integer space before hashing.
 */
export function hashVelocities(velocities: number[]): string {
  if (!velocities || velocities.length === 0) return 'v0';
  let hash = 0;
  for (let i = 0; i < velocities.length; i++) {
    const v = velocities[i];
    const scaled = Math.round((Number.isFinite(v) ? v : 0) * 1000);
    hash = (Math.imul(hash, 31) + scaled) | 0;
  }
  return `v_${velocities.length}_${hash}`;
}

export interface MonteCarloCacheKeyParams {
  projectId?: string;
  sprintId?: string;
  targetPts: number;
  cadenceUnit?: MonteCarloCadenceUnit;
  trialCount?: number;
  historicalVelocities: number[];
  sprintLengthDays?: number;
  startDate?: Date | string;
}

/**
 * Builds a deterministic cache key adhering to the format:
 * `mc_${projectId}_${sprintId}_${targetPts}_${cadenceUnit}_${trialCount}_${historyHash}`
 * with optional sprint length and start date bounds when supplied.
 */
export function generateMonteCarloCacheKey(params: MonteCarloCacheKeyParams): string {
  const pId = params.projectId || 'proj';
  const sId = params.sprintId || 'sprint';
  const unit = params.cadenceUnit || 'sprint';
  const trials = params.trialCount || 1000;
  const hash = hashVelocities(params.historicalVelocities);
  let key = `mc_${pId}_${sId}_${params.targetPts}_${unit}_${trials}_${hash}`;
  if (params.sprintLengthDays !== undefined && params.sprintLengthDays !== 14) {
    key += `_l${params.sprintLengthDays}`;
  }
  if (params.startDate !== undefined) {
    const sDate = (params.startDate instanceof Date ? params.startDate.toISOString() : String(params.startDate)).split('T')[0];
    key += `_d${sDate}`;
  }
  return key;
}

/**
 * Retrieves a simulation result from memory or sessionStorage.
 */
export function getCachedMonteCarlo(key: string): MonteCarloSimulationResult | null {
  if (memoryCache.has(key)) {
    const item = memoryCache.get(key)!;
    // Invalidate pre-v2 weekly multi-sprint entries that used the legacy daily model
    if (key.includes('_week_') && (!item.version || item.version < 2)) {
      memoryCache.delete(key);
      if (typeof window !== 'undefined' && window.sessionStorage) {
        try { window.sessionStorage.removeItem(key); } catch {}
      }
      return null;
    }
    return item;
  }
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const item = window.sessionStorage.getItem(key);
      if (item) {
        const parsed = JSON.parse(item) as MonteCarloSimulationResult;
        // Invalidate pre-v2 weekly multi-sprint entries that used the legacy daily model
        if (key.includes('_week_') && (!parsed.version || parsed.version < 2)) {
          window.sessionStorage.removeItem(key);
          return null;
        }
        memoryCache.set(key, parsed);
        return parsed;
      }
    } catch {
      // Ignore sessionStorage exceptions
    }
  }
  return null;
}

/**
 * Stores a simulation result into memory and sessionStorage.
 */
export function setCachedMonteCarlo(key: string, result: MonteCarloSimulationResult): void {
  memoryCache.set(key, result);
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      window.sessionStorage.setItem(key, JSON.stringify(result));
    } catch {
      // Ignore quota/access errors
    }
  }
}

/**
 * Clears the simulation caches (useful for testing or project resets).
 */
export function clearMonteCarloCache(): void {
  memoryCache.clear();
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i++) {
        const k = window.sessionStorage.key(i);
        if (k && k.startsWith('mc_')) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => window.sessionStorage.removeItem(k));
    } catch {
      // Ignore
    }
  }
}

/**
 * Converts a sprint count into the selected cadence duration and formatted display string.
 *
 * @param sprints Number of sprints simulated (or null if exceeded horizon)
 * @param unit Selected cadence unit
 * @param sprintLengthDays Length of a sprint in days (default 14)
 * @param isDailySimulation Whether the simulation was run in daily discrete event mode
 */
export function convertSprintsToCadence(
  sprints: number | null,
  unit: MonteCarloCadenceUnit = 'sprint',
  sprintLengthDays: number = 14,
  isDailySimulation: boolean = false
): ConvertedCadenceDuration {
  if (sprints === null) {
    return {
      value: null,
      unit,
      label: '> 500 sprints',
    };
  }

  const validLength = Math.max(1, sprintLengthDays);
  const activeWorkDays = Math.max(1, Math.round(validLength * (5 / 7)));
  // For daily discrete event simulation, 'day' cadence unit maps directly to business working days
  const days =
    unit === 'day' && isDailySimulation
      ? sprints * activeWorkDays
      : sprints * validLength;

  switch (unit) {
    case 'day': {
      // Round to nearest 0.5 or integer day
      const val = Math.round(days * 2) / 2;
      return {
        value: val,
        unit,
        label: `${val} ${val === 1 ? 'day' : 'days'}`,
      };
    }
    case 'week': {
      // Fractional weeks to 1 decimal place; preserve nonzero values
      let val = Math.round((days / 7) * 10) / 10;
      let label = `${val} ${val === 1 ? 'week' : 'weeks'}`;
      if (days > 0 && val === 0) {
        val = Math.max(0.01, Math.round((days / 7) * 100) / 100);
        label = `${val} weeks`;
      }
      return {
        value: val,
        unit,
        label,
      };
    }
    case '2-week': {
      // Bi-weekly increments to 1 decimal place; preserve nonzero values
      let val = Math.round((days / 14) * 10) / 10;
      let label = `${val} ${val === 1 ? 'bi-week' : 'bi-weeks'}`;
      if (days > 0 && val === 0) {
        val = Math.max(0.01, Math.round((days / 14) * 100) / 100);
        label = `${val} bi-weeks`;
      }
      return {
        value: val,
        unit,
        label,
      };
    }
    case 'month': {
      // Calendar month equivalent (30.4375 avg days/month in Gregorian calendar)
      let val = Math.round((days / 30.4375) * 10) / 10;
      let label = `${val} ${val === 1 ? 'month' : 'months'}`;
      if (days > 0 && val === 0) {
        val = Math.max(0.01, Math.round((days / 30.4375) * 100) / 100);
        label = `${val} months`;
      }
      return {
        value: val,
        unit,
        label,
      };
    }
    case 'quarter': {
      // Fractional quarters (365.25 / 4 = 91.3125 days/quarter)
      let val = Math.round((days / 91.3125) * 10) / 10;
      let label = `${val} ${val === 1 ? 'quarter' : 'quarters'} `;
      if (days > 0 && val === 0) {
        val = Math.max(0.01, Math.round((days / 91.3125) * 100) / 100);
        label = `${val} quarters`;
      }
      return {
        value: val,
        unit,
        label: label.trim(),
      };
    }
    case 'year': {
      // Fractional years (365.25 days/year)
      let val = Math.round((days / 365.25) * 10) / 10;
      let label = `${val} ${val === 1 ? 'year' : 'years'}`;
      if (days > 0 && val === 0) {
        val = Math.max(0.01, Math.round((days / 365.25) * 100) / 100);
        label = `${val} years`;
      }
      return {
        value: val,
        unit,
        label,
      };
    }
    case 'sprint':
    default: {
      if (sprints === null) {
        return {
          value: null,
          unit: 'sprint',
          label: '> 500 sprints',
        };
      }
      let val = sprints;
      let label = `${sprints} ${sprints === 1 ? 'sprint' : 'sprints'}`;
      if (isDailySimulation) {
        const rounded1 = Math.round(sprints * 10) / 10;
        if (sprints > 0 && rounded1 === 0) {
          // Preserve nonzero fractional sprint values (e.g. 1/21 for a 30-day sprint -> 0.05 sprints)
          val = Math.max(0.01, Math.round(sprints * 100) / 100);
          label = `${val} sprints`;
        } else {
          val = rounded1;
          label = `${val} ${val === 1 ? 'sprint' : 'sprints'}`;
        }
      }
      return {
        value: val,
        unit: 'sprint',
        label,
      };
    }
  }
}

export interface MonteCarloSimulationInput {
  remainingStoryPoints: number;
  historicalVelocities: number[];
  iterations?: number;
  sprintLengthDays?: number;
  startDate?: Date | string;
  cadenceUnit?: MonteCarloCadenceUnit;
}

export interface MonteCarloSimulationResult {
  remainingStoryPoints: number;
  iterations: number;
  sprintLengthDays: number;
  startDate: string;
  deliveredWithinHorizon: boolean;
  censoredTrials: number;
  percentiles: {
    p50: number | null; // 50th Percentile (Median / Aggressive target)
    p85: number | null; // 85th Percentile (Standard commitment target)
    p95: number | null; // 95th Percentile (Conservative high-confidence target)
  };
  projectedDates: {
    p50: string | null;
    p85: string | null;
    p95: string | null;
  };
  distribution: number[];
  executionTimeMs: number;
  cadenceUnit?: MonteCarloCadenceUnit;
  isDailySimulation?: boolean;
  version?: number;
}

export function runMonteCarloSimulation(input: MonteCarloSimulationInput): MonteCarloSimulationResult {
  const startTime = performance.now();
  // Safe bounded iterations between 100 and 10,000
  const iterations = Math.min(10000, Math.max(100, input.iterations || 1000));
  const sprintLengthDays = Math.max(1, input.sprintLengthDays ?? 14);
  const startDate = input.startDate ? new Date(input.startDate) : new Date();
  const remainingStoryPoints = Math.max(0, input.remainingStoryPoints || 0);

  // If there are no points remaining, 0 sprints are required
  if (remainingStoryPoints === 0) {
    const isoStart = startDate.toISOString();
    return {
      remainingStoryPoints: 0,
      iterations,
      sprintLengthDays,
      startDate: isoStart,
      deliveredWithinHorizon: true,
      censoredTrials: 0,
      percentiles: { p50: 0, p85: 0, p95: 0 },
      projectedDates: { p50: isoStart, p85: isoStart, p95: isoStart },
      distribution: new Array(iterations).fill(0),
      executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
    };
  }

  // Filter and sanitize historical velocities (allow v >= 0 to include zero-delivery history)
  const validVelocities = (input.historicalVelocities || [])
    .filter((v) => typeof v === 'number' && !isNaN(v) && v >= 0);

  const hasProgress = validVelocities.some((v) => v > 0);

  // If there is zero throughput recorded across historical sprints, milestone cannot finish
  if (!hasProgress) {
    return {
      remainingStoryPoints,
      iterations,
      sprintLengthDays,
      startDate: startDate.toISOString(),
      deliveredWithinHorizon: false,
      censoredTrials: iterations,
      percentiles: { p50: null, p85: null, p95: null },
      projectedDates: { p50: null, p85: null, p95: null },
      distribution: new Array(iterations).fill(Number.POSITIVE_INFINITY),
      executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
      cadenceUnit: input.cadenceUnit,
    };
  }

  const velocities = validVelocities;
  const numVelocities = velocities.length;

  const distribution: number[] = new Array(iterations);
  const MAX_SPRINTS_LIMIT = 500;
  let censoredTrials = 0;

  const maxVelocity = Math.max(...velocities);
  const isIntraSprintScope = remainingStoryPoints <= maxVelocity;
  const shouldUseDailySim =
    input.cadenceUnit === 'day' ||
    isIntraSprintScope;

  // Day-level discrete event simulation for day cadence or intra-sprint remaining scope
  if (shouldUseDailySim) {
    const validLength = Math.max(1, sprintLengthDays);
    const activeWorkDays = Math.max(1, Math.round(validLength * (5 / 7)));
    const dailyBins = deriveDailyThroughputBins(velocities, sprintLengthDays);
    const numDailyBins = dailyBins.length;
    const MAX_DAYS_LIMIT = MAX_SPRINTS_LIMIT * activeWorkDays;

    const workingDaysDistribution: number[] = new Array(iterations);

    for (let i = 0; i < iterations; i++) {
      let currentRemaining = remainingStoryPoints;
      let daysElapsed = 0;

      while (currentRemaining > 0 && daysElapsed < MAX_DAYS_LIMIT) {
        const randomIndex = Math.floor(Math.random() * numDailyBins);
        const sampledDaily = dailyBins[randomIndex];
        currentRemaining -= sampledDaily;
        daysElapsed++;
      }

      if (currentRemaining > 0) {
        censoredTrials++;
        distribution[i] = Number.POSITIVE_INFINITY;
        workingDaysDistribution[i] = Number.POSITIVE_INFINITY;
      } else {
        // Convert working-day elapsed time into sprint duration
        distribution[i] = daysElapsed / activeWorkDays;
        workingDaysDistribution[i] = daysElapsed;
      }
    }

    distribution.sort((a, b) => a - b);
    workingDaysDistribution.sort((a, b) => a - b);

    const getDailyPercentile = (pct: number): { sprintVal: number | null; workDaysVal: number | null } => {
      const index = Math.ceil((pct / 100) * distribution.length) - 1;
      const clampedIndex = Math.max(0, Math.min(distribution.length - 1, index));
      const sprintVal = distribution[clampedIndex];
      const workDaysVal = workingDaysDistribution[clampedIndex];
      return !isFinite(sprintVal) || sprintVal > MAX_SPRINTS_LIMIT ? { sprintVal: null, workDaysVal: null } : { sprintVal, workDaysVal };
    };

    const p50Data = getDailyPercentile(50);
    const p85Data = getDailyPercentile(85);
    const p95Data = getDailyPercentile(95);

    const calculateDailyProjectedDate = (days: number | null): string | null => {
      if (days === null) return null;
      return addBusinessDays(startDate, days).toISOString();
    };

    const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;
    const deliveredWithinHorizon = censoredTrials === 0;

    return {
      remainingStoryPoints,
      iterations,
      sprintLengthDays,
      startDate: startDate.toISOString(),
      deliveredWithinHorizon,
      censoredTrials,
      percentiles: {
        p50: p50Data.sprintVal,
        p85: p85Data.sprintVal,
        p95: p95Data.sprintVal,
      },
      projectedDates: {
        p50: calculateDailyProjectedDate(p50Data.workDaysVal),
        p85: calculateDailyProjectedDate(p85Data.workDaysVal),
        p95: calculateDailyProjectedDate(p95Data.workDaysVal),
      },
      distribution,
      executionTimeMs,
      cadenceUnit: input.cadenceUnit,
      isDailySimulation: true,
      version: 2,
    };
  }

  // Standard sprint-level simulation loop
  for (let i = 0; i < iterations; i++) {
    let currentRemaining = remainingStoryPoints;
    let sprintsNeeded = 0;

    while (currentRemaining > 0 && sprintsNeeded < MAX_SPRINTS_LIMIT) {
      const randomIndex = Math.floor(Math.random() * numVelocities);
      const sampledVelocity = velocities[randomIndex];
      currentRemaining -= sampledVelocity;
      sprintsNeeded++;
    }

    if (currentRemaining > 0) {
      // Milestone could not be finished within the 500-sprint simulation horizon (right-censored)
      censoredTrials++;
      distribution[i] = Number.POSITIVE_INFINITY;
    } else {
      distribution[i] = sprintsNeeded;
    }
  }

  // Sort distribution in ascending order
  distribution.sort((a, b) => a - b);

  // Calculate percentiles
  const getPercentile = (pct: number): number | null => {
    const index = Math.ceil((pct / 100) * distribution.length) - 1;
    const val = distribution[Math.max(0, Math.min(distribution.length - 1, index))];
    return !isFinite(val) || val > MAX_SPRINTS_LIMIT ? null : val;
  };

  const p50 = getPercentile(50);
  const p85 = getPercentile(85);
  const p95 = getPercentile(95);

  const calculateProjectedDate = (sprints: number | null): string | null => {
    if (sprints === null) return null;
    const msOffset = sprints * sprintLengthDays * 24 * 60 * 60 * 1000;
    return new Date(startDate.getTime() + msOffset).toISOString();
  };

  const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;
  const deliveredWithinHorizon = censoredTrials === 0;

  return {
    remainingStoryPoints,
    iterations,
    sprintLengthDays,
    startDate: startDate.toISOString(),
    deliveredWithinHorizon,
    censoredTrials,
    percentiles: {
      p50,
      p85,
      p95,
    },
    projectedDates: {
      p50: calculateProjectedDate(p50),
      p85: calculateProjectedDate(p85),
      p95: calculateProjectedDate(p95),
    },
    distribution,
    executionTimeMs,
    cadenceUnit: input.cadenceUnit,
    version: 2,
  };
}
