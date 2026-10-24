import { describe, it, expect } from 'vitest';
import { runMonteCarloSimulation, deriveDailyThroughputBins } from '@/lib/analytics/monte-carlo';

describe('TASK-TRK-MONTE-CARLO: monte-carlo simulation', () => {
  it('executes 1,000 iterations in < 50ms with valid percentiles', () => {
    const start = performance.now();
    const result = runMonteCarloSimulation({
      remainingStoryPoints: 85,
      historicalVelocities: [18, 22, 15, 25, 20],
      iterations: 1000,
    });
    const duration = performance.now() - start;

    expect(duration).toBeLessThan(50);
    expect(result.iterations).toBe(1000);
    expect(result.percentiles.p50!).toBeGreaterThan(0);
    expect(result.percentiles.p50!).toBeLessThanOrEqual(result.percentiles.p85!);
    expect(result.percentiles.p85!).toBeLessThanOrEqual(result.percentiles.p95!);
    expect(result.distribution.length).toBe(1000);
  });

  it('determines exact sprint counts for uniform historical velocity', () => {
    const result = runMonteCarloSimulation({
      remainingStoryPoints: 100,
      historicalVelocities: [20],
      iterations: 100,
      sprintLengthDays: 14,
      startDate: '2026-10-01T00:00:00.000Z',
    });

    expect(result.percentiles.p50).toBe(5);
    expect(result.percentiles.p85).toBe(5);
    expect(result.percentiles.p95).toBe(5);

    // 5 sprints * 14 days = 70 days
    const expectedDate = new Date('2026-10-01T00:00:00.000Z').getTime() + 70 * 24 * 60 * 60 * 1000;
    expect(result.projectedDates.p50).toBe(new Date(expectedDate).toISOString());
  });

  it('handles 0 remaining story points gracefully', () => {
    const result = runMonteCarloSimulation({
      remainingStoryPoints: 0,
      historicalVelocities: [20, 25],
      startDate: '2026-10-01T00:00:00.000Z',
    });

    expect(result.percentiles.p50).toBe(0);
    expect(result.percentiles.p85).toBe(0);
    expect(result.percentiles.p95).toBe(0);
    expect(result.projectedDates.p50).toBe('2026-10-01T00:00:00.000Z');
  });

  it('handles empty or non-positive velocities without inventing fake progress', () => {
    const result = runMonteCarloSimulation({
      remainingStoryPoints: 50,
      historicalVelocities: [0, 0],
      iterations: 100,
    });

    expect(result.deliveredWithinHorizon).toBe(false);
    expect(result.censoredTrials).toBe(100);
    expect(result.percentiles.p50).toBeNull();
    expect(result.projectedDates.p50).toBeNull();
  });

  it('preserves forecast when trial finishes exactly on the 500th sprint horizon limit', () => {
    const result = runMonteCarloSimulation({
      remainingStoryPoints: 500,
      historicalVelocities: [1],
      iterations: 100,
      sprintLengthDays: 14,
    });

    expect(result.deliveredWithinHorizon).toBe(true);
    expect(result.censoredTrials).toBe(0);
    expect(result.percentiles.p50).toBe(500);
    expect(result.percentiles.p85).toBe(500);
    expect(result.percentiles.p95).toBe(500);
    expect(result.projectedDates.p50).toBeDefined();
  });

  it('clamps iterations to safe range between 100 and 10,000', () => {
    const lowResult = runMonteCarloSimulation({
      remainingStoryPoints: 20,
      historicalVelocities: [10],
      iterations: 10,
    });
    expect(lowResult.iterations).toBe(100);

    const highResult = runMonteCarloSimulation({
      remainingStoryPoints: 20,
      historicalVelocities: [10],
      iterations: 50000,
    });
    expect(highResult.iterations).toBe(10000);
  });

  it('correctly flags right-censored trials when milestone cannot finish within 500 sprints', () => {
    const result = runMonteCarloSimulation({
      remainingStoryPoints: 10000,
      historicalVelocities: [1], // 1 pt/sprint would need 10,000 sprints (> 500)
      iterations: 100,
    });

    expect(result.deliveredWithinHorizon).toBe(false);
    expect(result.censoredTrials).toBe(100);
    expect(result.percentiles.p50).toBeNull();
    expect(result.percentiles.p85).toBeNull();
    expect(result.percentiles.p95).toBeNull();
    expect(result.projectedDates.p50).toBeNull();
  });

  describe('BUG-TRK-MC-DAILY-THROUGHPUT-SIM: Daily Throughput Discrete Simulation', () => {
    it('simulates low remaining scope (5 pts) against high velocity (472 pts/sprint) into 1-2 days rather than 14 days', () => {
      const startDate = '2026-10-23T00:00:00.000Z'; // Friday
      const result = runMonteCarloSimulation({
        remainingStoryPoints: 5,
        historicalVelocities: [472],
        iterations: 1000,
        sprintLengthDays: 14,
        startDate,
        cadenceUnit: 'day',
      });

      // 5 pts with ~33.7 pts/day velocity:
      // p50 and p85 resolve to 1 day (~0.071 sprints)
      const p50Days = Math.round(result.percentiles.p50! * 14);
      const p85Days = Math.round(result.percentiles.p85! * 14);
      const p95Days = Math.round(result.percentiles.p95! * 14);

      expect(p50Days).toBe(1);
      expect(p85Days).toBe(1);
      expect(p95Days).toBeGreaterThanOrEqual(1);
      expect(p95Days).toBeLessThanOrEqual(3);

      // Verify business day advancement: 1 business day from Friday Oct 23 is Monday Oct 26
      expect(result.projectedDates.p50).toBe('2026-10-26T00:00:00.000Z');
      expect(result.projectedDates.p85).toBe('2026-10-26T00:00:00.000Z');

      // Distribution array contains values in consistent sprint units
      expect(result.distribution[0]).toBeGreaterThan(0);
      expect(result.distribution[0]).toBeLessThan(1);
    });

    it('emits equal bins for zero and positive historical velocities to maintain unbiased sprint weighting', () => {
      // 1 idle sprint (0 pts), 1 active sprint (140 pts)
      const bins = deriveDailyThroughputBins([0, 140], 14);
      // Both sprints contribute 9 bins each (18 total)
      expect(bins).toHaveLength(18);
      // Idle sprint contributed 9 zeros, active sprint contributed 1 zero + 8 positive values -> 10 zeros total
      const zeroBins = bins.filter((b) => b === 0);
      expect(zeroBins).toHaveLength(10);
    });

    it('censors daily simulation when working days exceed 500 sprints horizon (e.g. 5,500 pts with 10 pts/sprint)', () => {
      const result = runMonteCarloSimulation({
        remainingStoryPoints: 5500,
        historicalVelocities: [10],
        iterations: 100,
        sprintLengthDays: 14,
        cadenceUnit: 'day',
      });

      expect(result.deliveredWithinHorizon).toBe(false);
      expect(result.censoredTrials).toBe(100);
      expect(result.percentiles.p50).toBeNull();
      expect(result.projectedDates.p50).toBeNull();
    });
  });
});
