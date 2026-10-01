import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { CumulativeFlowChart } from '@/components/analytics/CumulativeFlowChart';
import { ScopeChurnWaterfall } from '@/components/analytics/ScopeChurnWaterfall';
import { CfdDataPoint } from '@/lib/analytics/flow-diagnostics';

describe('TASK-TRK-UI-CFD-WATERFALL: CFD and Waterfall widgets', () => {
  describe('CumulativeFlowChart', () => {
    it('renders empty state when no data provided', () => {
      render(<CumulativeFlowChart data={[]} />);
      expect(screen.getByText('No Flow Telemetry Available')).toBeInTheDocument();
    });

    it('renders stacked area paths and legend for all statuses', () => {
      const sampleData: CfdDataPoint[] = [
        { date: '2026-10-01', complete: 5, in_review: 2, in_progress: 8, not_started: 10, unplanned: 1 },
        { date: '2026-10-02', complete: 8, in_review: 3, in_progress: 6, not_started: 8, unplanned: 1 },
        { date: '2026-10-03', complete: 12, in_review: 2, in_progress: 5, not_started: 6, unplanned: 0 },
      ];

      const { container } = render(<CumulativeFlowChart data={sampleData} />);

      expect(screen.getByText('Cumulative Flow Diagram (CFD)')).toBeInTheDocument();
      expect(screen.getByText('Complete')).toBeInTheDocument();
      expect(screen.getByText('In Review')).toBeInTheDocument();
      expect(screen.getByText('In Progress')).toBeInTheDocument();
      expect(screen.getByText('Not Started')).toBeInTheDocument();
      expect(screen.getByText('Unplanned Scope')).toBeInTheDocument();

      const chartSvg = container.querySelector('svg[viewBox="0 0 800 360"]');
      expect(chartSvg).toBeInTheDocument();

      // There should be 5 layer paths rendered in the CFD chart
      const paths = chartSvg?.querySelectorAll('path');
      expect(paths?.length).toBe(5);
    });
  });

  describe('ScopeChurnWaterfall', () => {
    it('renders baseline, added, dropped, and delivered bars with point labels', () => {
      render(
        <ScopeChurnWaterfall
          data={{
            baselineCommitted: 50,
            addedPoints: 12,
            droppedPoints: 6,
            finalDelivered: 48,
          }}
        />
      );

      expect(screen.getByText('Scope Churn Waterfall')).toBeInTheDocument();
      expect(screen.getByText('50 pts')).toBeInTheDocument();
      expect(screen.getByText('+12 pts')).toBeInTheDocument();
      expect(screen.getByText('-6 pts')).toBeInTheDocument();
      expect(screen.getByText('48 pts')).toBeInTheDocument();
      expect(screen.getByText('Net Scope:')).toBeInTheDocument();
    });

    it('handles zero added or dropped scope gracefully', () => {
      render(
        <ScopeChurnWaterfall
          data={{
            baselineCommitted: 30,
            addedPoints: 0,
            droppedPoints: 0,
            finalDelivered: 30,
          }}
        />
      );

      expect(screen.getByText('0 added')).toBeInTheDocument();
      expect(screen.getByText('0 dropped')).toBeInTheDocument();
    });
  });
});
