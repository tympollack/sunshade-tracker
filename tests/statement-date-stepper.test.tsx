import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StatementDateStepper } from '@/components/statements/StatementDateStepper';
import { StatementGenerator } from '@/components/statements/StatementGenerator';
import { EfficiencyMetricsPayload } from '@/lib/services/valueLedgerService';

const mockPayload: EfficiencyMetricsPayload = {
  tenant: {
    slug: 'pym-energy',
    name: 'Pym Energy',
    tier: 'Enterprise',
  },
  dateRange: {
    periodLabel: 'Week 40: Sep 28 – Oct 04, 2026',
    startDate: '2026-09-28T00:00:00.000Z',
    endDate: '2026-10-04T23:59:59.999Z',
  },
  kpis: {
    completedItemsCount: 8,
    activeProjectsCount: 2,
    totalItemsCount: 20,
    totalHoursReclaimed: 5.5,
    hourlyRate: 125,
    velocityFactor: '+15%',
    grossRealizedValue: 687.5,
    platformSubscriptionFee: 0.0,
    netRealizedSavings: 687.5,
  },
  itemizedYields: [],
  ecosystemNote: 'Eliminating drag.',
  generatedAt: '2026-10-04T12:00:00.000Z',
};

describe('TASK-TRK-WEEKLY-STEPPER-CONTROLS: StatementDateStepper Component', () => {
  it('renders Week button before Month and all presets', () => {
    const onTimeframeChange = vi.fn();
    const onRangeChange = vi.fn();

    render(
      <StatementDateStepper
        timeframe="week"
        startDate="2026-09-28"
        endDate="2026-10-04"
        onTimeframeChange={onTimeframeChange}
        onRangeChange={onRangeChange}
      />
    );

    const weekBtn = screen.getByTestId('timeframe-btn-week');
    const monthBtn = screen.getByTestId('timeframe-btn-month');
    expect(weekBtn).toBeInTheDocument();
    expect(monthBtn).toBeInTheDocument();

    // Verify Week is listed before Month in the DOM
    const buttons = screen.getAllByRole('button');
    const weekIndex = buttons.indexOf(weekBtn);
    const monthIndex = buttons.indexOf(monthBtn);
    expect(weekIndex).toBeLessThan(monthIndex);
  });

  it('steps previous and next by exact period increment', () => {
    const onTimeframeChange = vi.fn();
    const onRangeChange = vi.fn();

    render(
      <StatementDateStepper
        timeframe="week"
        startDate="2026-09-21"
        endDate="2026-09-27"
        onTimeframeChange={onTimeframeChange}
        onRangeChange={onRangeChange}
      />
    );

    const prevBtn = screen.getByTestId('stepper-prev-btn');
    fireEvent.click(prevBtn);
    expect(onRangeChange).toHaveBeenCalledWith(
      '2026-09-14',
      '2026-09-20',
      expect.stringContaining('Sep 14')
    );

    const nextBtn = screen.getByTestId('stepper-next-btn');
    fireEvent.click(nextBtn);
    expect(onRangeChange).toHaveBeenCalledWith(
      '2026-09-28',
      '2026-10-04',
      expect.stringContaining('Sep 28')
    );
  });

  it('renders jump to Today button and resets timeframe window', () => {
    const onTimeframeChange = vi.fn();
    const onRangeChange = vi.fn();

    render(
      <StatementDateStepper
        timeframe="month"
        startDate="2025-01-01"
        endDate="2025-01-31"
        onTimeframeChange={onTimeframeChange}
        onRangeChange={onRangeChange}
      />
    );

    const todayBtn = screen.getByTestId('stepper-today-btn');
    fireEvent.click(todayBtn);
    expect(onRangeChange).toHaveBeenCalled();
  });
});

describe('TASK-TRK-WEEKLY-STEPPER-CONTROLS: StatementGenerator Integration & URL Sync', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/statements')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockPayload,
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
  });

  it('selecting Week preset updates window and query params', async () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState');

    render(<StatementGenerator tenantSlug="pym-energy" initialData={mockPayload} />);

    const weekBtn = screen.getByTestId('timeframe-btn-week');
    fireEvent.click(weekBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('period=week'),
        expect.anything()
      );
    });

    expect(pushStateSpy).toHaveBeenCalledWith(
      null,
      '',
      expect.stringContaining('timeframe=week')
    );

    pushStateSpy.mockRestore();
  });

  it('clicking Prev in stepper bar updates date range and calls API', async () => {
    render(<StatementGenerator tenantSlug="pym-energy" initialData={mockPayload} />);

    const prevBtn = screen.getByTestId('stepper-prev-btn');
    fireEvent.click(prevBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalled();
    });
  });
});
