import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { CumulativeFlowChart, calculateAdaptiveTickInterval, getAdaptiveTickIndices } from '@/components/analytics/CumulativeFlowChart';
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

    it('adaptively chunks X-axis date labels and guarantees the latest date is labeled without crowding', () => {
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

      // Over 30 days, interval is 5 days, and last day (index 29 -> 10/30) is included
      expect(slantedLabels.length).toBe(7);
      expect(slantedLabels[0].textContent).toBe('10/01');
      expect(slantedLabels[1].textContent).toBe('10/06');
      expect(slantedLabels[2].textContent).toBe('10/11');
      expect(slantedLabels[3].textContent).toBe('10/16');
      expect(slantedLabels[4].textContent).toBe('10/21');
      expect(slantedLabels[5].textContent).toBe('10/26');
      expect(slantedLabels[6].textContent).toBe('10/30');
    });

    it('labels the 90-day maximum range endpoint and replaces preceding tick when too close', () => {
      // 90 days of CFD data (13-week quarter)
      const quarterData: CfdDataPoint[] = Array.from({ length: 90 }, (_, i) => ({
        date: `2026-10-${String(i + 1).padStart(2, '0')}`,
        complete: i,
        in_review: 2,
        in_progress: 3,
        not_started: 5,
        unplanned: 0,
      }));

      const { container } = render(<CumulativeFlowChart data={quarterData} />);
      const slantedLabels = Array.from(container.querySelectorAll('svg text')).filter(
        (el) => el.getAttribute('transform')?.includes('rotate(-45')
      );

      // At length 90, interval is 14. Initial ticks: 0, 14, 28, 42, 56, 70, 84.
      // Index 89 (day 90) is only 5 days from index 84 (less than half of 14), so 84 is replaced by 89.
      expect(slantedLabels.length).toBe(7);
      expect(slantedLabels[slantedLabels.length - 1].textContent).toBe('10/90');
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

    it('getAdaptiveTickIndices handles ranges whose last index is not divisible by the interval', () => {
      // Exact divisible range
      expect(getAdaptiveTickIndices(15)).toEqual([0, 2, 4, 6, 8, 10, 12, 14]);

      // Non-divisible where last index is too close to preceding tick (distance < threshold) -> replaces last tick
      // For 14 days, interval 2: initial ticks end at 12; last index 13 is distance 1 from 12 -> replaces 12 with 13
      expect(getAdaptiveTickIndices(14)).toEqual([0, 2, 4, 6, 8, 10, 13]);

      // For 27 days, interval 5: initial ticks end at 25; last index 26 is distance 1 from 25 -> replaces 25 with 26
      expect(getAdaptiveTickIndices(27)).toEqual([0, 5, 10, 15, 20, 26]);

      // For 90 days, interval 14: initial ticks end at 84; last index 89 is distance 5 from 84 (< 7) -> replaces 84 with 89
      expect(getAdaptiveTickIndices(90)).toEqual([0, 14, 28, 42, 56, 70, 89]);

      // Non-divisible where last index has sufficient distance (distance >= threshold) -> appends last index
      // For 30 days, interval 5: initial ticks end at 25; last index 29 is distance 4 from 25 (>= 3) -> appends 29
      expect(getAdaptiveTickIndices(30)).toEqual([0, 5, 10, 15, 20, 25, 29]);
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
