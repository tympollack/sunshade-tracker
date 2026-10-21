import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import {
  generateMonteCarloCacheKey,
  getCachedMonteCarlo,
  setCachedMonteCarlo,
  clearMonteCarloCache,
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
  });
});
