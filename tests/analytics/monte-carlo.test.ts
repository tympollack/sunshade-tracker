import { describe, it, expect } from 'vitest';
import { runMonteCarloSimulation } from '@/lib/analytics/monte-carlo';

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
    expect(result.percentiles.p50).toBeGreaterThan(0);
    expect(result.percentiles.p50).toBeLessThanOrEqual(result.percentiles.p85);
    expect(result.percentiles.p85).toBeLessThanOrEqual(result.percentiles.p95);
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

  it('handles empty or non-positive velocities with safe fallback', () => {
    const result = runMonteCarloSimulation({
      remainingStoryPoints: 50,
      historicalVelocities: [],
      iterations: 50,
    });

    expect(result.percentiles.p50).toBeGreaterThan(0);
    expect(result.projectedDates.p50).toBeDefined();
  });
});
