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

// In-memory simulation cache for instant sub-millisecond retrieval
const memoryCache = new Map<string, MonteCarloSimulationResult>();

/**
 * Deterministic hash for historical velocity distributions.
 */
export function hashVelocities(velocities: number[]): string {
  if (!velocities || velocities.length === 0) return 'v0';
  let hash = 0;
  for (let i = 0; i < velocities.length; i++) {
    hash = (hash * 31 + velocities[i]) | 0;
  }
  return `v_${velocities.length}_${hash}`;
}

export interface MonteCarloCacheKeyParams {
  projectId?: string;
  sprintId?: string;
  targetPts: number;
  cadenceUnit: MonteCarloCadenceUnit;
  trialCount: number;
  historicalVelocities: number[];
}

/**
 * Builds a deterministic cache key adhering to the format:
 * `mc_${projectId}_${sprintId}_${targetPts}_${cadenceUnit}_${trialCount}_${historyHash}`
 */
export function generateMonteCarloCacheKey(params: MonteCarloCacheKeyParams): string {
  const pId = params.projectId || 'proj';
  const sId = params.sprintId || 'sprint';
  const hash = hashVelocities(params.historicalVelocities);
  return `mc_${pId}_${sId}_${params.targetPts}_${params.cadenceUnit}_${params.trialCount}_${hash}`;
}

/**
 * Retrieves a simulation result from memory or sessionStorage.
 */
export function getCachedMonteCarlo(key: string): MonteCarloSimulationResult | null {
  if (memoryCache.has(key)) {
    return memoryCache.get(key)!;
  }
  if (typeof window !== 'undefined' && window.sessionStorage) {
    try {
      const item = window.sessionStorage.getItem(key);
      if (item) {
        const parsed = JSON.parse(item) as MonteCarloSimulationResult;
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
 */
export function convertSprintsToCadence(
  sprints: number | null,
  unit: MonteCarloCadenceUnit = 'sprint',
  sprintLengthDays: number = 14
): ConvertedCadenceDuration {
  if (sprints === null) {
    return {
      value: null,
      unit,
      label: '> 500 sprints',
    };
  }

  const days = sprints * Math.max(1, sprintLengthDays);

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
      // Fractional weeks to 1 decimal place
      const val = Math.round((days / 7) * 10) / 10;
      return {
        value: val,
        unit,
        label: `${val} ${val === 1 ? 'week' : 'weeks'}`,
      };
    }
    case '2-week': {
      // Bi-weekly increments to 1 decimal place
      const val = Math.round((days / 14) * 10) / 10;
      return {
        value: val,
        unit,
        label: `${val} ${val === 1 ? 'bi-week' : 'bi-weeks'}`,
      };
    }
    case 'month': {
      // Calendar month equivalent (30.4375 avg days/month in Gregorian calendar)
      const val = Math.round((days / 30.4375) * 10) / 10;
      return {
        value: val,
        unit,
        label: `${val} ${val === 1 ? 'month' : 'months'}`,
      };
    }
    case 'quarter': {
      // Fractional quarters (365.25 / 4 = 91.3125 days/quarter)
      const val = Math.round((days / 91.3125) * 10) / 10;
      return {
        value: val,
        unit,
        label: `${val} ${val === 1 ? 'quarter' : 'quarters'}`,
      };
    }
    case 'year': {
      // Fractional years (365.25 days/year)
      const val = Math.round((days / 365.25) * 10) / 10;
      return {
        value: val,
        unit,
        label: `${val} ${val === 1 ? 'year' : 'years'}`,
      };
    }
    case 'sprint':
    default: {
      return {
        value: sprints,
        unit: 'sprint',
        label: `${sprints} ${sprints === 1 ? 'sprint' : 'sprints'}`,
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
    };
  }

  const velocities = validVelocities;
  const numVelocities = velocities.length;

  const distribution: number[] = new Array(iterations);
  const MAX_SPRINTS_LIMIT = 500;
  let censoredTrials = 0;

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
  };
}
