import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AnalyticsDashboardSkeleton } from '@/components/analytics/AnalyticsDashboardSkeleton';
import { SprintAnalyticsView } from '@/components/analytics/SprintAnalyticsView';

describe('BUG-TRK-INITIAL-LOAD-DUMMY-DEFAULTS: Dashboard-Wide Loading Skeletons', () => {
  describe('AnalyticsDashboardSkeleton component', () => {
    it('renders the complete coordinated skeleton structure across all 4 dashboard tiers', () => {
      render(<AnalyticsDashboardSkeleton />);

      // Root skeleton container with aria-label
      const skeletonRoot = screen.getByTestId('analytics-dashboard-skeleton');
      expect(skeletonRoot).toBeInTheDocument();
      expect(skeletonRoot).toHaveClass('animate-pulse');

      // 1. Top KPI Row: 4 pulse skeleton cards with header and large number placeholders
      const kpiRow = screen.getByTestId('skeleton-kpi-row');
      expect(kpiRow).toBeInTheDocument();
      const kpiCards = screen.getAllByTestId('skeleton-kpi-card');
      expect(kpiCards).toHaveLength(4);

      // 2. Middle Row: 2 large chart skeleton cards (Burndown & Scope Churn Waterfall)
      const middleRow = screen.getByTestId('skeleton-middle-charts-row');
      expect(middleRow).toBeInTheDocument();
      expect(screen.getByTestId('skeleton-burndown-card')).toBeInTheDocument();
      expect(screen.getByTestId('skeleton-waterfall-card')).toBeInTheDocument();

      // 3. CFD Row: 1 wide chart skeleton card with range pill placeholders
      const cfdRow = screen.getByTestId('skeleton-cfd-row');
      expect(cfdRow).toBeInTheDocument();
      expect(screen.getByTestId('skeleton-cfd-card')).toBeInTheDocument();

      // 4. Bottom Row: Monte Carlo card skeleton with 3 confidence placeholder cards
      const mcRow = screen.getByTestId('skeleton-monte-carlo-row');
      expect(mcRow).toBeInTheDocument();
      const mcConfidenceCards = screen.getAllByTestId('skeleton-mc-confidence-card');
      expect(mcConfidenceCards).toHaveLength(3);
    });
  });

  describe('SprintAnalyticsView integration with loading state', () => {
    it('renders coordinated skeletons and zero dummy numbers when isLoading is true', () => {
      render(
        <SprintAnalyticsView
          isLoading={true}
          projectSlug="sunshade-tracker"
          selectedSprintId="sprint-1"
          forecastStartDate="2026-10-01"
        />
      );

      // Skeletons are rendered
      expect(screen.getByTestId('analytics-dashboard-skeleton')).toBeInTheDocument();
      expect(screen.getAllByTestId('skeleton-kpi-card')).toHaveLength(4);

      // Invariant: no dummy numbers or real metric text flash during load
      expect(screen.queryByText('3-Sprint Velocity')).toBeNull();
      expect(screen.queryByText('Scope Churn Waterfall')).toBeNull();
      expect(screen.queryByText('Cumulative Flow Diagram (CFD)')).toBeNull();
    });

    it('renders full interactive analytics dashboard panels once isLoading resolves to false', () => {
      render(
        <SprintAnalyticsView
          isLoading={false}
          projectSlug="sunshade-tracker"
          selectedSprintId="sprint-1"
          forecastStartDate="2026-10-01"
          simulationVelocities={[25, 30]}
          kpiMetrics={{
            rollingVelocity: 32,
            sayDoRatio: 90,
            scopeVolatility: 10,
            remainingPoints: 24,
            committedPoints: 50,
            deliveredPoints: 45,
          }}
          churnData={{
            baselineCommitted: 50,
            addedPoints: 10,
            droppedPoints: 5,
            finalDelivered: 45,
          }}
        />
      );

      // Skeleton dismissed
      expect(screen.queryByTestId('analytics-dashboard-skeleton')).toBeNull();

      // Resolved dashboard visible
      expect(screen.getByTestId('sprint-analytics-view')).toBeInTheDocument();
      expect(screen.getByText('3-Sprint Velocity')).toBeInTheDocument();
      expect(screen.getByText('Scope Churn Waterfall')).toBeInTheDocument();
      expect(screen.getByText('Monte Carlo Milestone Simulator')).toBeInTheDocument();
    });
  });
});
