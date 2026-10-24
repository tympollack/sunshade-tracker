import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  CumulativeFlowChart,
  calculateAdaptiveTickInterval,
  getAdaptiveTickIndices,
  formatCfdDate,
} from '@/components/analytics/CumulativeFlowChart';
import { CumulativeFlowDiagram } from '@/components/analytics/CumulativeFlowDiagram';
import { ScopeChurnWaterfall } from '@/components/analytics/ScopeChurnWaterfall';
import { CfdDataPoint } from '@/lib/analytics/flow-diagnostics';

describe('TASK-TRK-UI-CFD-WATERFALL & FEAT-TRK-CFD-TIME-WINDOW-STRIDE: CFD and Waterfall suite', () => {
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

      const { container } = render(<CumulativeFlowDiagram data={sampleData} />);

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

    it('slants date labels by -45 degrees and formats using MMM DD by default', () => {
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
      expect(dateTextElements[0].textContent).toBe('Oct 01');
      expect(dateTextElements[1].textContent).toBe('Oct 02');
      expect(dateTextElements[0].getAttribute('transform')).toMatch(/rotate\(-45\s+\d+(\.\d+)?\s+\d+(\.\d+)?\)/);
    });

    it('supports MM/DD format when explicitly requested via dateFormat prop', () => {
      const sampleData: CfdDataPoint[] = [
        { date: '2026-10-01', complete: 5, in_review: 2, in_progress: 8, not_started: 10, unplanned: 1 },
        { date: '2026-10-02', complete: 8, in_review: 3, in_progress: 6, not_started: 8, unplanned: 1 },
      ];

      const { container } = render(<CumulativeFlowChart data={sampleData} dateFormat="MM/DD" />);
      const dateLabels = container.querySelectorAll('svg text[text-anchor="end"]');
      const dateTextElements = Array.from(dateLabels).filter(
        (el) => el.getAttribute('transform')?.includes('rotate(-45')
      );

      expect(dateTextElements[0].textContent).toBe('10/01');
      expect(dateTextElements[1].textContent).toBe('10/02');
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

      // Over 30 days, interval is 5 days, and last day (index 29 -> Oct 30) is included
      expect(slantedLabels.length).toBe(7);
      expect(slantedLabels[0].textContent).toBe('Oct 01');
      expect(slantedLabels[1].textContent).toBe('Oct 06');
      expect(slantedLabels[2].textContent).toBe('Oct 11');
      expect(slantedLabels[3].textContent).toBe('Oct 16');
      expect(slantedLabels[4].textContent).toBe('Oct 21');
      expect(slantedLabels[5].textContent).toBe('Oct 26');
      expect(slantedLabels[6].textContent).toBe('Oct 30');
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
      expect(slantedLabels[slantedLabels.length - 1].textContent).toBe('Oct 90');
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

    it('supports quick-select range filter pills [14D | 30D | Full Sprint] and dynamically rescales area curves', () => {
      // 45 days of CFD data
      const longData: CfdDataPoint[] = Array.from({ length: 45 }, (_, i) => ({
        date: `2026-09-${String(i + 1).padStart(2, '0')}`,
        complete: i * 3,
        in_review: 2,
        in_progress: 4,
        not_started: 8,
        unplanned: 1,
      }));

      const { container } = render(<CumulativeFlowDiagram data={longData} />);

      // Verify preset buttons exist
      const btn14 = screen.getByTestId('cfd-window-14d');
      const btn30 = screen.getByTestId('cfd-window-30d');
      const btnFull = screen.getByTestId('cfd-window-full-sprint');

      expect(btn14).toBeInTheDocument();
      expect(btn30).toBeInTheDocument();
      expect(btnFull).toBeInTheDocument();

      // Click 14D
      fireEvent.click(btn14);

      // Should now render the last 14 days of data
      const labels14D = Array.from(container.querySelectorAll('svg text')).filter(
        (el) => el.getAttribute('transform')?.includes('rotate(-45')
      );
      // For 14 days, ticks interval is 2 -> ~7 ticks
      expect(labels14D.length).toBeLessThanOrEqual(8);
      // Last label should still be day 45
      expect(labels14D[labels14D.length - 1].textContent).toBe('Sep 45');

      // Click 30D
      fireEvent.click(btn30);
      const labels30D = Array.from(container.querySelectorAll('svg text')).filter(
        (el) => el.getAttribute('transform')?.includes('rotate(-45')
      );
      expect(labels30D.length).toBe(7);

      // Return to Full Sprint
      fireEvent.click(btnFull);
      expect(btnFull).toHaveClass('bg-slate-700');
    });

    it('formats CFD dates cleanly using formatCfdDate helper', () => {
      expect(formatCfdDate('2026-10-02')).toBe('Oct 02');
      expect(formatCfdDate('2026-10-16')).toBe('Oct 16');
      expect(formatCfdDate('2026-01-05')).toBe('Jan 05');
      expect(formatCfdDate('2026-10-02', 'MM/DD')).toBe('10/02');
      expect(formatCfdDate('')).toBe('');
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

    it('renders subtle horizontal dashed bridge lines connecting intermediate delta bars', () => {
      const { container } = render(
        <ScopeChurnWaterfall
          data={{
            baselineCommitted: 35,
            addedPoints: 26,
            droppedPoints: 5,
            finalDelivered: 56,
          }}
        />
      );

      const baselineBridge = container.querySelector('[data-testid="bridge-baseline-added"]');
      expect(baselineBridge).toBeInTheDocument();
      expect(baselineBridge).toHaveAttribute('stroke-dasharray', '2 2');
      expect(baselineBridge).toHaveClass('stroke-slate-600');

      const addedBridge = container.querySelector('[data-testid="bridge-added-dropped"]');
      expect(addedBridge).toBeInTheDocument();
      expect(addedBridge).toHaveAttribute('stroke-dasharray', '2 2');

      const droppedBridge = container.querySelector('[data-testid="bridge-dropped-delivered"]');
      expect(droppedBridge).toBeInTheDocument();
      expect(droppedBridge).toHaveAttribute('stroke-dasharray', '2 2');
    });

    it('renders high-contrast white text with subtle dark pill backdrop on bar value callouts', () => {
      render(
        <ScopeChurnWaterfall
          data={{
            baselineCommitted: 35,
            addedPoints: 26,
            droppedPoints: 5,
            finalDelivered: 56,
          }}
        />
      );

      const addedLabel = screen.getByText('+26 pts');
      expect(addedLabel).toHaveClass('text-slate-100');
      expect(addedLabel).toHaveClass('bg-slate-900/80');

      // Verify centered sub-labels
      expect(screen.getByText('Day 1 Commitment')).toBeInTheDocument();
      expect(screen.getByText('Injected Scope')).toBeInTheDocument();
      expect(screen.getByText('Backlog Return')).toBeInTheDocument();
      expect(screen.getByText('Delivered')).toBeInTheDocument();
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

    it('BUG-TRK-WATERFALL-RENDER-COLLAPSE: renders all bars and bridges correctly when delivered scope outscales baseline', () => {
      const { container } = render(
        <ScopeChurnWaterfall
          data={{
            baselineCommitted: 164,
            addedPoints: 94,
            droppedPoints: 10,
            finalDelivered: 484, // Outsized delivered scope exceeding baseline + added (258)
          }}
        />
      );

      // Verify container dimension lock
      const canvas = container.querySelector('.min-h-\\[250px\\]');
      expect(canvas).toBeInTheDocument();
      expect(canvas).toHaveClass('w-full', 'h-64', 'overflow-hidden');

      // Verify all 4 bar pills render
      expect(screen.getByText('164 pts')).toBeInTheDocument();
      expect(screen.getByText('+94 pts')).toBeInTheDocument();
      expect(screen.getByText('-10 pts')).toBeInTheDocument();
      expect(screen.getByText('484 pts')).toBeInTheDocument();

      // Net Scope pill
      expect(screen.getByText('248 pts')).toBeInTheDocument();

      // Bridge lines render with valid Y coordinates (not NaN or out of bounds)
      const baselineBridge = container.querySelector('[data-testid="bridge-baseline-added"]');
      const addedBridge = container.querySelector('[data-testid="bridge-added-dropped"]');
      const droppedBridge = container.querySelector('[data-testid="bridge-dropped-delivered"]');

      expect(baselineBridge).toBeInTheDocument();
      expect(addedBridge).toBeInTheDocument();
      expect(droppedBridge).toBeInTheDocument();

      const y1Baseline = baselineBridge?.getAttribute('y1');
      expect(y1Baseline).toMatch(/^\d+(\.\d+)?%$/);
      expect(parseFloat(y1Baseline!)).toBeGreaterThan(0);
      expect(parseFloat(y1Baseline!)).toBeLessThanOrEqual(100);
    });
  });
});
