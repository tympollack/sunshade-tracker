import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CumulativeFlowChart } from '@/components/analytics/CumulativeFlowChart';
import { CfdDataPoint } from '@/lib/analytics/flow-diagnostics';

describe('TASK-TRK-CFD-WIP-SCALE-TOGGLE: CFD WIP Scaling and Backlog Toggle', () => {
  const mockTelemetry: CfdDataPoint[] = [
    {
      date: '2026-10-01',
      complete: 20,
      in_review: 5,
      in_progress: 15,
      not_started: 200, // Large backlog dominating the vertical range
      unplanned: 0,
    },
    {
      date: '2026-10-02',
      complete: 25,
      in_review: 8,
      in_progress: 17,
      not_started: 190,
      unplanned: 0,
    },
    {
      date: '2026-10-03',
      complete: 30,
      in_review: 6,
      in_progress: 14,
      not_started: 180,
      unplanned: 0,
    },
  ];

  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('renders All Scope by default with all 5 layers and high Y-axis ceiling', () => {
    const { container } = render(<CumulativeFlowChart data={mockTelemetry} />);

    // Scope toggle renders
    expect(screen.getByTestId('cfd-scope-all')).toBeInTheDocument();
    expect(screen.getByTestId('cfd-scope-wip-only')).toBeInTheDocument();

    // All Scope button is active by default
    expect(screen.getByTestId('cfd-scope-all')).toHaveClass('bg-slate-700');

    // 5 layer paths rendered
    const chartSvg = container.querySelector('svg[viewBox="0 0 800 360"]');
    const paths = chartSvg?.querySelectorAll('path');
    expect(paths?.length).toBe(5);

    // Max total with backlog is 20 + 5 + 15 + 200 = 240, ceiling is ~245
    const yAxisLabels = Array.from(container.querySelectorAll('svg text[text-anchor="end"]'))
      .map((el) => el.textContent?.trim())
      .filter((text) => /^\d+$/.test(text || ''));

    const maxLabel = Math.max(...yAxisLabels.map(Number));
    expect(maxLabel).toBeGreaterThanOrEqual(240);
  });

  it('rescales Y-axis and excludes not_started when WIP & Delivery Only is clicked', () => {
    const { container } = render(<CumulativeFlowChart data={mockTelemetry} />);

    // Click WIP & Delivery Only
    const wipOnlyBtn = screen.getByTestId('cfd-scope-wip-only');
    fireEvent.click(wipOnlyBtn);

    // Persisted to localStorage
    expect(localStorage.getItem('trk_cfd_hide_unstarted')).toBe('true');

    // Now only 4 layers are rendered (complete, in_review, in_progress, unplanned)
    const chartSvg = container.querySelector('svg[viewBox="0 0 800 360"]');
    const paths = chartSvg?.querySelectorAll('path');
    expect(paths?.length).toBe(4);

    // Active WIP + complete max total: 30 + 6 + 14 = 50. Ceiling is ~55 instead of ~245
    const yAxisLabels = Array.from(container.querySelectorAll('svg text[text-anchor="end"]'))
      .map((el) => el.textContent?.trim())
      .filter((text) => /^\d+$/.test(text || ''));

    const maxLabel = Math.max(...yAxisLabels.map(Number));
    expect(maxLabel).toBeLessThanOrEqual(60);
    expect(maxLabel).toBeGreaterThanOrEqual(50);

    // Not Started legend chip is dimmed with line-through
    const notStartedLegend = screen.getByTestId('cfd-legend-not_started');
    expect(notStartedLegend).toHaveClass('line-through');
    expect(notStartedLegend).toHaveClass('opacity-40');
  });

  it('restores unstarted backlog when All Scope button is clicked', () => {
    const { container } = render(<CumulativeFlowChart data={mockTelemetry} initialHideUnstarted={true} />);

    const getChartPaths = () =>
      container.querySelector('svg[viewBox="0 0 800 360"]')?.querySelectorAll('path') || [];

    // Initially 4 paths
    expect(getChartPaths().length).toBe(4);

    // Click All Scope
    fireEvent.click(screen.getByTestId('cfd-scope-all'));

    expect(localStorage.getItem('trk_cfd_hide_unstarted')).toBe('false');

    expect(getChartPaths().length).toBe(5);

    const notStartedLegend = screen.getByTestId('cfd-legend-not_started');
    expect(notStartedLegend).not.toHaveClass('line-through');
  });

  it('allows clicking legend chips to toggle individual layers and reflects in scope state', () => {
    const { container } = render(<CumulativeFlowChart data={mockTelemetry} />);

    const notStartedLegend = screen.getByTestId('cfd-legend-not_started');
    fireEvent.click(notStartedLegend);

    expect(notStartedLegend).toHaveClass('line-through');
    expect(localStorage.getItem('trk_cfd_hide_unstarted')).toBe('true');

    // Toggling it back restores the layer
    fireEvent.click(notStartedLegend);
    expect(notStartedLegend).not.toHaveClass('line-through');
    expect(localStorage.getItem('trk_cfd_hide_unstarted')).toBe('false');
  });

  it('loads hide unstarted preference from localStorage on mount', () => {
    localStorage.setItem('trk_cfd_hide_unstarted', 'true');

    const { container } = render(<CumulativeFlowChart data={mockTelemetry} />);

    const chartPaths =
      container.querySelector('svg[viewBox="0 0 800 360"]')?.querySelectorAll('path') || [];
    expect(chartPaths.length).toBe(4);

    expect(screen.getByTestId('cfd-legend-not_started')).toHaveClass('line-through');
  });

  it('displays Visible Total and separates hidden layers in hover tooltip when a layer is hidden', () => {
    const { container } = render(
      <CumulativeFlowChart data={mockTelemetry} initialHideUnstarted={true} />
    );

    // Hover over the first data point column in the chart SVG
    const hoverColumn = container.querySelector('rect[data-testid="cfd-hover-column-0"]');
    expect(hoverColumn).toBeInTheDocument();
    fireEvent.mouseEnter(hoverColumn!);

    // Tooltip should be visible with "Visible Total: 40 items" (20 complete + 5 in review + 15 in progress)
    const totalEl = screen.getByTestId('cfd-tooltip-total');
    expect(totalEl).toHaveTextContent('Visible Total: 40 items');

    // And "Hidden from Chart" section lists Not Started: 200
    expect(screen.getByText('Hidden from Chart')).toBeInTheDocument();
  });
});
