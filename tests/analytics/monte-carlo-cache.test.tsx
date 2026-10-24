import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  generateMonteCarloCacheKey,
  getCachedMonteCarlo,
  setCachedMonteCarlo,
  clearMonteCarloCache,
  hashVelocities,
  MonteCarloSimulationResult,
} from '@/lib/analytics/monte-carlo';
import { MonteCarloSimulator } from '@/components/analytics/MonteCarloSimulator';

const sampleSimulation: MonteCarloSimulationResult = {
  remainingStoryPoints: 40,
  iterations: 1000,
  sprintLengthDays: 14,
  startDate: '2026-10-01T00:00:00.000Z',
  deliveredWithinHorizon: true,
  censoredTrials: 0,
  percentiles: {
    p50: 2,
    p85: 3,
    p95: 4,
  },
  projectedDates: {
    p50: '2026-10-29T00:00:00.000Z',
    p85: '2026-11-12T00:00:00.000Z',
    p95: '2026-11-26T00:00:00.000Z',
  },
  distribution: [2, 3, 4],
  executionTimeMs: 15,
};

describe('TASK-TRK-MC-CACHE-AND-SKELETON: Monte Carlo Cache and Skeleton Loaders', () => {
  beforeEach(() => {
    clearMonteCarloCache();
    sessionStorage.clear();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('Deterministic Caching Utility', () => {
    it('generates consistent cache key adhering to specification format', () => {
      const key = generateMonteCarloCacheKey({
        projectId: 'prj-alpha',
        sprintId: 'sp-101',
        targetPts: 45,
        cadenceUnit: 'week',
        trialCount: 1000,
        historicalVelocities: [10, 15, 20],
      });

      expect(key).toMatch(/^mc_prj-alpha_sp-101_45_week_1000_v_3_-?\d+$/);
    });

    it('stores and retrieves cached simulation synchronously (0ms latency)', () => {
      const key = 'mc_test_project_sprint1_50_sprint_1000_v1';
      expect(getCachedMonteCarlo(key)).toBeNull();

      setCachedMonteCarlo(key, sampleSimulation);

      const start = performance.now();
      const retrieved = getCachedMonteCarlo(key);
      const elapsed = performance.now() - start;

      expect(elapsed).toBeLessThan(5);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.percentiles.p50).toBe(2);
      expect(retrieved?.percentiles.p85).toBe(3);
    });

    it('generates distinct velocity hashes for fractional velocity variations', () => {
      const hash1 = hashVelocities([10.1]);
      const hash2 = hashVelocities([10.9]);
      expect(hash1).not.toBe(hash2);
      expect(hash1).toMatch(/^v_1_-?\d+$/);
      expect(hash2).toMatch(/^v_1_-?\d+$/);
    });

    it('incorporates startDate and non-default sprint length in cache keys', () => {
      const keyWithDate = generateMonteCarloCacheKey({
        projectId: 'prj-alpha',
        sprintId: 'sp-101',
        targetPts: 45,
        historicalVelocities: [10],
        startDate: '2026-10-01T00:00:00.000Z',
        sprintLengthDays: 7,
      });

      expect(keyWithDate).toContain('_l7');
      expect(keyWithDate).toContain('_d2026-10-01');
    });
  });

  describe('Skeleton Pulse Cards UI', () => {
    it('renders exactly 3 skeleton pulse cards with shimmer styles when isLoading is true', () => {
      render(
        <MonteCarloSimulator
          simulation={null}
          isLoading={true}
          remainingStoryPoints={40}
        />
      );

      const skeletonCards = screen.getAllByTestId('mc-skeleton-card');
      expect(skeletonCards).toHaveLength(3);
      skeletonCards.forEach((card) => {
        expect(card).toHaveClass('animate-pulse');
        expect(card).toHaveClass('bg-slate-900/60');
      });
    });

    it('renders 3 skeleton pulse cards when isCalculating prop is true', () => {
      render(
        <MonteCarloSimulator
          simulation={sampleSimulation}
          isCalculating={true}
          remainingStoryPoints={40}
        />
      );

      const skeletonCards = screen.getAllByTestId('mc-skeleton-card');
      expect(skeletonCards).toHaveLength(3);
    });

    it('displays computed simulation cards and dismisses skeletons once computation settles', async () => {
      vi.useFakeTimers();

      render(
        <MonteCarloSimulator
          projectId="proj-beta"
          sprintId="sp-active"
          remainingStoryPoints={30}
          historicalVelocities={[15, 15]}
        />
      );

      // Skeletons are visible while calculating
      expect(screen.getAllByTestId('mc-skeleton-card')).toHaveLength(3);

      // Fast-forward the setTimeout(..., 0)
      act(() => {
        vi.runAllTimers();
      });

      // Simulation content rendered
      expect(screen.queryByTestId('mc-skeleton-card')).toBeNull();
      expect(screen.getByTestId('mc-p50-value')).toHaveTextContent('2 sprints');

      vi.useRealTimers();
    });

    it('prioritizes updated propSimulation over an existing stale cache entry', () => {
      const key = generateMonteCarloCacheKey({
        projectId: 'proj-gamma',
        sprintId: 'sp-1',
        targetPts: 40,
        cadenceUnit: 'sprint',
        trialCount: 1000,
        historicalVelocities: [10],
        sprintLengthDays: 14,
      });

      // Populate stale cache with 4 sprints forecast
      const staleSim: MonteCarloSimulationResult = {
        ...sampleSimulation,
        percentiles: { p50: 4, p85: 5, p95: 6 },
      };
      setCachedMonteCarlo(key, staleSim);

      // Parent now provides fresh propSimulation reflecting updated velocity (2 sprints)
      const freshSim: MonteCarloSimulationResult = {
        ...sampleSimulation,
        percentiles: { p50: 2, p85: 2.5, p95: 3 },
      };

      render(
        <MonteCarloSimulator
          projectId="proj-gamma"
          sprintId="sp-1"
          remainingStoryPoints={40}
          historicalVelocities={[10]}
          simulation={freshSim}
        />
      );

      // Must display the fresh prop value (2 sprints), NOT the stale cached value (4 sprints)
      expect(screen.getByTestId('mc-p50-value')).toHaveTextContent('2 sprints');
    });

    it('TASK-TRK-MC-SKELETON-PANELS & ASYNC-WORKER-INDICATOR: shows calculation header badge and dimension-locked skeleton panels', () => {
      vi.useFakeTimers();

      render(
        <MonteCarloSimulator
          projectId="proj-delta"
          sprintId="sp-loading"
          remainingStoryPoints={25}
          historicalVelocities={[12, 18]}
          iterations={1000}
        />
      );

      // Calculating header badge should be rendered
      const calculatingBadge = screen.getByTestId('mc-calculating-badge');
      expect(calculatingBadge).toBeInTheDocument();
      expect(calculatingBadge).toHaveTextContent('Simulating 1,000 runs...');

      // Skeletons should be present with min-h-[108px]
      const skeletonCards = screen.getAllByTestId('mc-skeleton-card');
      expect(skeletonCards).toHaveLength(3);
      skeletonCards.forEach((card) => {
        expect(card).toHaveClass('min-h-[108px]');
        expect(card).toHaveClass('animate-pulse');
      });

      // Complete execution
      act(() => {
        vi.runAllTimers();
      });

      // Calculation indicator should transition to completed time
      expect(screen.queryByTestId('mc-calculating-badge')).toBeNull();
      expect(screen.getByTestId('mc-header-status')).toHaveTextContent(/Completed in \d+(\.\d+)?ms/);

      // Results rendered with matched dimensions
      const p50Card = screen.getByTestId('mc-p50-card');
      expect(p50Card).toHaveClass('min-h-[108px]');

      vi.useRealTimers();
    });
  });
});
