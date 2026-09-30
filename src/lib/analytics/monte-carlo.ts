/**
 * Monte Carlo Milestone & Epic Delivery Simulator
 * Simulates delivery trajectories by sampling with replacement from historical velocities.
 */

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
  percentiles: {
    p50: number; // 50th Percentile (Median / Aggressive target)
    p85: number; // 85th Percentile (Standard commitment target)
    p95: number; // 95th Percentile (Conservative high-confidence target)
  };
  projectedDates: {
    p50: string;
    p85: string;
    p95: string;
  };
  distribution: number[];
  executionTimeMs: number;
}

export function runMonteCarloSimulation(input: MonteCarloSimulationInput): MonteCarloSimulationResult {
  const startTime = performance.now();
  const iterations = Math.max(1, input.iterations ?? 1000);
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
      percentiles: { p50: 0, p85: 0, p95: 0 },
      projectedDates: { p50: isoStart, p85: isoStart, p95: isoStart },
      distribution: new Array(iterations).fill(0),
      executionTimeMs: Math.round((performance.now() - startTime) * 100) / 100,
    };
  }

  // Filter and sanitize historical velocities
  const validVelocities = (input.historicalVelocities || [])
    .filter((v) => typeof v === 'number' && !isNaN(v) && v > 0);

  // Fallback if no positive velocities exist
  const velocities = validVelocities.length > 0 ? validVelocities : [10];
  const numVelocities = velocities.length;

  const distribution: number[] = new Array(iterations);
  const MAX_SPRINTS_LIMIT = 500;

  for (let i = 0; i < iterations; i++) {
    let currentRemaining = remainingStoryPoints;
    let sprintsNeeded = 0;

    while (currentRemaining > 0 && sprintsNeeded < MAX_SPRINTS_LIMIT) {
      const randomIndex = Math.floor(Math.random() * numVelocities);
      const sampledVelocity = velocities[randomIndex];
      currentRemaining -= sampledVelocity;
      sprintsNeeded++;
    }

    distribution[i] = sprintsNeeded;
  }

  // Sort distribution in ascending order
  distribution.sort((a, b) => a - b);

  // Calculate percentiles
  const getPercentile = (pct: number): number => {
    const index = Math.ceil((pct / 100) * distribution.length) - 1;
    return distribution[Math.max(0, Math.min(distribution.length - 1, index))];
  };

  const p50 = getPercentile(50);
  const p85 = getPercentile(85);
  const p95 = getPercentile(95);

  const calculateProjectedDate = (sprints: number): string => {
    const msOffset = sprints * sprintLengthDays * 24 * 60 * 60 * 1000;
    return new Date(startDate.getTime() + msOffset).toISOString();
  };

  const executionTimeMs = Math.round((performance.now() - startTime) * 100) / 100;

  return {
    remainingStoryPoints,
    iterations,
    sprintLengthDays,
    startDate: startDate.toISOString(),
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
