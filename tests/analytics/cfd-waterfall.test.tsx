import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { CumulativeFlowChart, calculateAdaptiveTickInterval } from '@/components/analytics/CumulativeFlowChart';
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

    it('slants date labels by -45 degrees and sets textAnchor to end', () => {
      const sampleData: CfdDataPoint[] = [
        { date: '2026-10-01', complete: 5, in_review: 2, in_progress: 8, not_started: 10, unplanned: 1 },
        { date: '2026-10-02', complete: 8, in_review: 3, in_progress: 6, not_started: 8, unplanned: 1 },
      ];

      const { container } = render(<CumulativeFlowChart data={sampleData} />);
      const dateLabels = container.querySelectorAll('svg text[text-anchor="end"]');

      // Both date labels should have text-anchor="end" and transform with rotate(-45 ...)
      const dateTextElements = Array.from(dateLabels).filter(
        (el) => el.getAttribute('transform')?.includes('rotate(-45')
      );

      expect(dateTextElements.length).toBe(2);
      expect(dateTextElements[0].textContent).toBe('10/01');
      expect(dateTextElements[1].textContent).toBe('10/02');
      expect(dateTextElements[0].getAttribute('transform')).toMatch(/rotate\(-45\s+\d+(\.\d+)?\s+\d+(\.\d+)?\)/);
    });

    it('adaptively chunks X-axis date labels into readable intervals over multi-week ranges', () => {
      // 30 days of data (approx 4.5 weeks)
      const monthData: CfdDataPoint[] = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-10-${String(i + 1).padStart(2, '0')}`,
        complete: i * 2,
        in_review: 2,
        in_progress: 5,
        not_started: 10,
        unplanned: 0,
      }));

      const { container } = render(<CumulativeFlowChart data={monthData} />);
      const slantedLabels = Array.from(container.querySelectorAll('svg text')).filter(
        (el) => el.getAttribute('transform')?.includes('rotate(-45')
      );

      // Over 30 days, interval is 5 days, so 30 / 5 = 6 labels render instead of 30 overlapping labels
      expect(slantedLabels.length).toBe(6);
      expect(slantedLabels[0].textContent).toBe('10/01');
      expect(slantedLabels[1].textContent).toBe('10/06');
      expect(slantedLabels[2].textContent).toBe('10/11');
      expect(slantedLabels[3].textContent).toBe('10/16');
      expect(slantedLabels[4].textContent).toBe('10/21');
      expect(slantedLabels[5].textContent).toBe('10/26');
    });

    it('calculates adaptive tick intervals correctly across various timeframe lengths', () => {
      expect(calculateAdaptiveTickInterval(5)).toBe(1);
      expect(calculateAdaptiveTickInterval(7)).toBe(1);
      expect(calculateAdaptiveTickInterval(14)).toBe(2);
      expect(calculateAdaptiveTickInterval(21)).toBe(3);
      expect(calculateAdaptiveTickInterval(28)).toBe(5);
      expect(calculateAdaptiveTickInterval(42)).toBe(7);
      expect(calculateAdaptiveTickInterval(56)).toBe(7);
      expect(calculateAdaptiveTickInterval(90)).toBe(14);
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
