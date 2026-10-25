import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, renderHook, waitFor } from '@testing-library/react';
import { AnalyticsDashboardSkeleton } from '@/components/analytics/AnalyticsDashboardSkeleton';
import { SprintAnalyticsView } from '@/components/analytics/SprintAnalyticsView';
import { ScopeChurnWaterfall } from '@/components/analytics/ScopeChurnWaterfall';
import { useSprintTelemetry } from '@/hooks/useSprintTelemetry';

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

  describe('useSprintTelemetry hook loading coordination', () => {
    it('holds isLoading = true while isSprintDiscoveryPending is true and defers fetch', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch');

      const { result, rerender } = renderHook(
        (props: { isSprintDiscoveryPending: boolean; selectedSprintId: string }) =>
          useSprintTelemetry({
            tenantSlug: 'sunshade',
            projectSlug: 'tracker',
            selectedSprintId: props.selectedSprintId,
            startDate: '2026-10-01',
            endDate: '2026-10-15',
            isSprintDiscoveryPending: props.isSprintDiscoveryPending,
          }),
        {
          initialProps: {
            isSprintDiscoveryPending: true,
            selectedSprintId: '',
          },
        }
      );

      // Loading remains true while sprint discovery is pending
      expect(result.current.isLoading).toBe(true);
      // Premature telemetry fetch is prevented
      expect(fetchSpy).not.toHaveBeenCalled();

      fetchSpy.mockResolvedValue({
        ok: true,
        json: async () => ({
          committedPoints: 40,
          completedPoints: 35,
          remainingPoints: 5,
        }),
      } as any);

      // Discovery completes and selects active sprint
      rerender({
        isSprintDiscoveryPending: false,
        selectedSprintId: 'sprint-active-1',
      });

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(result.current.kpiMetrics.committedPoints).toBe(40);
      fetchSpy.mockRestore();
    });
  });

  describe('ScopeChurnWaterfall margin and grid alignment', () => {
    it('aligns waterfall BarChart with zero margins and grid-cols-4 overlay to eliminate annotation drift', () => {
      const { container } = render(
        <ScopeChurnWaterfall
          data={{
            baselineCommitted: 40,
            addedPoints: 10,
            droppedPoints: 5,
            finalDelivered: 45,
          }}
        />
      );

      // Labels container uses grid grid-cols-4 for exact 1-to-1 bar center alignment
      const labelsContainer = container.querySelector('.grid.grid-cols-4.absolute.inset-0');
      expect(labelsContainer).toBeInTheDocument();

      // Footer labels use matching grid grid-cols-4
      const footerGrid = container.querySelector('.grid.grid-cols-4.pt-3');
      expect(footerGrid).toBeInTheDocument();
    });
  });
});
