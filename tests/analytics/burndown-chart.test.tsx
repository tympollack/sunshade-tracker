import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  BurndownChart,
  BurndownDataPoint,
  calculateBurndownTickInterval,
  getBurndownTickIndices,
} from '@/components/analytics/BurndownChart';
import { SprintBurndownChart } from '@/components/analytics/SprintBurndownChart';

describe('TASK-TRK-UI-BURNDOWN & BUG-TRK-BURNDOWN-XAXIS-COLLISION: BurndownChart suite', () => {
  it('renders friendly empty state when no data provided', () => {
    render(<BurndownChart data={[]} />);
    expect(screen.getByText('No Burndown Snapshots')).toBeInTheDocument();
  });

  it('renders SVG chart with ideal and actual burn lines and contributor bars', () => {
    const sampleData: BurndownDataPoint[] = [
      {
        date: '2026-10-01',
        idealRemaining: 40,
        actualRemaining: 40,
        dailyVelocity: 0,
      },
      {
        date: '2026-10-02',
        idealRemaining: 30,
        actualRemaining: 25,
        dailyVelocity: 15,
        contributorBreakdown: { alice: 10, bob: 5 },
      },
      {
        date: '2026-10-03',
        idealRemaining: 20,
        actualRemaining: 30, // Scope spike
        dailyVelocity: 0,
        hasScopeCreep: true,
      },
      {
        date: '2026-10-04',
        idealRemaining: 10,
        actualRemaining: 10,
        dailyVelocity: 20,
        contributorBreakdown: { alice: 20 },
      },
    ];

    const { container } = render(<BurndownChart data={sampleData} />);

    // Check header and legend
    expect(screen.getByText('Sprint Burndown & Daily Velocity')).toBeInTheDocument();
    expect(screen.getByText('Ideal Burn')).toBeInTheDocument();
    expect(screen.getByText('Actual Burn')).toBeInTheDocument();

    // Check SVG rendered
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();

    // Check paths for ideal and actual burn
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(2);

    // Check alert marker for spike rendered
    const alertCircle = container.querySelector('circle[fill="#ef4444"]');
    expect(alertCircle).toBeInTheDocument();
  });

  describe('Adaptive Tick Stride Sampling & Collision Prevention (BUG-TRK-BURNDOWN-XAXIS-COLLISION)', () => {
    it('calculates proper interval strides for short, medium, and long date ranges', () => {
      expect(calculateBurndownTickInterval(7)).toBe(1);
      expect(calculateBurndownTickInterval(14)).toBe(1);
      expect(calculateBurndownTickInterval(20)).toBe(2);
      expect(calculateBurndownTickInterval(25)).toBe(5);
      expect(calculateBurndownTickInterval(35)).toBe(6);
      expect(calculateBurndownTickInterval(45)).toBe(7);
    });

    it('anchors the start and end dates and avoids crowded collisions', () => {
      // 30 days of burndown data
      const indices30 = getBurndownTickIndices(30);
      expect(indices30[0]).toBe(0);
      expect(indices30[indices30.length - 1]).toBe(29);
      expect(indices30.length).toBeLessThanOrEqual(8);

      // 45 days of burndown data
      const indices45 = getBurndownTickIndices(45);
      expect(indices45[0]).toBe(0);
      expect(indices45[indices45.length - 1]).toBe(44);
      expect(indices45.length).toBeLessThanOrEqual(9);
    });

    it('renders evenly spaced, tilted date labels on 30+ day sprint without text mashing', () => {
      const monthData: BurndownDataPoint[] = Array.from({ length: 30 }, (_, i) => ({
        date: `2026-09-${String(i + 1).padStart(2, '0')}`,
        idealRemaining: 100 - i * 3,
        actualRemaining: 95 - i * 2.8,
      }));

      const { container } = render(<SprintBurndownChart data={monthData} />);
      const textNodes = Array.from(container.querySelectorAll('svg text[text-anchor="end"]'));

      // Tilted date labels should have text-anchor="end", dy="8", and rotate(-35 ...)
      const tiltedLabels = textNodes.filter((node) =>
        node.getAttribute('transform')?.includes('rotate(-35')
      );

      expect(tiltedLabels.length).toBeGreaterThanOrEqual(5);
      expect(tiltedLabels.length).toBeLessThanOrEqual(8);

      // Anchored first date
      expect(tiltedLabels[0].textContent).toBe('09/01');
      // Anchored final date
      expect(tiltedLabels[tiltedLabels.length - 1].textContent).toBe('09/30');

      // Check typography and font-mono class
      tiltedLabels.forEach((el) => {
        expect(el).toHaveClass('font-mono');
        expect(el.getAttribute('dy')).toBe('8');
      });
    });

    it('remains legible on long 45+ day timelines with zero text collisions', () => {
      const longTimeline: BurndownDataPoint[] = Array.from({ length: 46 }, (_, i) => ({
        date: i < 30 ? `2026-09-${String(i + 1).padStart(2, '0')}` : `2026-10-${String(i - 29).padStart(2, '0')}`,
        idealRemaining: 150 - i * 3,
        actualRemaining: 140 - i * 2.5,
      }));

      const { container } = render(<BurndownChart data={longTimeline} />);
      const textNodes = Array.from(container.querySelectorAll('svg text[text-anchor="end"]'));
      const tiltedLabels = textNodes.filter((node) =>
        node.getAttribute('transform')?.includes('rotate(-35')
      );

      // For 46 days, labels are cleanly sampled (not all 46 rendered)
      expect(tiltedLabels.length).toBeLessThanOrEqual(9);
      expect(tiltedLabels[0].textContent).toBe('09/01');
      expect(tiltedLabels[tiltedLabels.length - 1].textContent).toBe('10/16');
    });

    it('TASK-TRK-CFD-SPRINT-TO-DATE-DEFAULT: defaults BurndownChart to Sprint to Date and reveals remaining runway on Full Sprint', () => {
      const sprintData: BurndownDataPoint[] = Array.from({ length: 28 }, (_, i) => ({
        date: `2026-10-${String(i + 1).padStart(2, '0')}`,
        idealRemaining: 100 - i * 3,
        actualRemaining: i <= 13 ? 100 - i * 4 : 48,
      }));

      const { container } = render(
        <BurndownChart
          data={sprintData}
          sprintEndDate="2026-10-28"
          today="2026-10-14"
        />
      );

      expect(screen.getByTestId('burndown-window-sprint-to-date')).toHaveClass('bg-slate-700');

      const getAxisDates = () =>
        Array.from(container.querySelectorAll('svg text.font-mono')).map((el) => el.textContent);

      const clampedDates = getAxisDates();
      expect(clampedDates[clampedDates.length - 1]).toBe('10/14');

      fireEvent.click(screen.getByTestId('burndown-window-full-sprint'));
      const fullDates = getAxisDates();
      expect(fullDates[fullDates.length - 1]).toBe('10/28');
    });

    it('TASK-TRK-BURNDOWN-INTERACTIVE-ZOOM-SYNC: supports drag brush zoom and Apply Window to Page callback', () => {
      const sprintData: BurndownDataPoint[] = Array.from({ length: 20 }, (_, i) => ({
        date: `2026-10-${String(i + 1).padStart(2, '0')}`,
        idealRemaining: 100 - i * 4,
        actualRemaining: 95 - i * 3.5,
      }));

      let syncedRange: [string, string] | null = null;
      const { container } = render(
        <BurndownChart
          data={sprintData}
          sprintStartDate="2026-10-01"
          sprintEndDate="2026-10-20"
          today="2026-10-20"
          onApplyWindowToPage={(s, e) => {
            syncedRange = [s, e];
          }}
        />
      );

      // Drag across columns 2..8
      const col2 = screen.getByTestId('burndown-hover-column-2');
      const col8 = screen.getByTestId('burndown-hover-column-8');

      fireEvent.mouseDown(col2);
      fireEvent.mouseMove(col8);
      expect(screen.getByTestId('burndown-brush-selection')).toBeInTheDocument();

      fireEvent.mouseUp(col8);

      const getAxisDates = () =>
        Array.from(container.querySelectorAll('svg text.font-mono')).map((el) => el.textContent);

      const zoomedDates = getAxisDates();
      expect(zoomedDates[0]).toBe('10/03');
      expect(zoomedDates[zoomedDates.length - 1]).toBe('10/09');

      // Apply Window to Page button should be visible and invoke callback
      const applyBtn = screen.getByTestId('burndown-apply-window-to-page');
      fireEvent.click(applyBtn);
      expect(syncedRange).toEqual(['2026-10-03', '2026-10-09']);

      // Reset Zoom restores full sprint-to-date range
      fireEvent.click(screen.getByTestId('burndown-zoom-reset'));
      const restoredDates = getAxisDates();
      expect(restoredDates[0]).toBe('10/01');
      expect(restoredDates[restoredDates.length - 1]).toBe('10/20');
    });
  });
});
