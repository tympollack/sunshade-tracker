import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { StatementGenerator } from '@/components/statements/StatementGenerator';
import { EfficiencyMetricsPayload } from '@/lib/services/valueLedgerService';

vi.mock('@/lib/auth-guard', () => ({
  authenticate: vi.fn(),
}));

const mockPayload: EfficiencyMetricsPayload = {
  tenant: {
    slug: 'acme-corp',
    name: 'Acme Corp',
    tier: 'Enterprise',
  },
  dateRange: {
    periodLabel: 'Q3 2026 Statement',
    startDate: '2026-07-01T00:00:00.000Z',
    endDate: '2026-09-30T23:59:59.999Z',
  },
  kpis: {
    completedItemsCount: 24,
    activeProjectsCount: 4,
    totalItemsCount: 60,
    totalHoursReclaimed: 14.0,
    hourlyRate: 125,
    velocityFactor: '+18%',
    grossRealizedValue: 1750.0,
    platformSubscriptionFee: 0.0,
    netRealizedSavings: 1750.0,
  },
  itemizedYields: [
    {
      id: 'hierarchical-status-rollup',
      frictionPoint: 'Hierarchical Status Rollup',
      description: 'Saved via automated hierarchy queries.',
      metric: '4 active projects tracked',
      hoursReclaimed: 8.0,
      ratePerHour: 125,
      realizedValue: 1000.0,
    },
    {
      id: 'backlog-triage-state-sync',
      frictionPoint: 'Backlog Triage & State Sync',
      description: 'Eliminated via atomic status transitions.',
      metric: '24 completed work items',
      hoursReclaimed: 1.2,
      ratePerHour: 125,
      realizedValue: 150.0,
    },
    {
      id: 'autonomous-review-dev-cycles',
      frictionPoint: 'Autonomous Review & Dev Cycles',
      description: 'Eliminated via automated PR linking.',
      metric: '24 attributed items',
      hoursReclaimed: 4.8,
      ratePerHour: 125,
      realizedValue: 600.0,
    },
  ],
  ecosystemNote: 'Built to eliminate busywork.',
  generatedAt: '2026-09-19T12:00:00.000Z',
};

describe('FEAT-TRK-DYNAMIC-STATEMENT-REPORTS: Dynamic Date Range Statement Generator', () => {
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

  it('renders timeframe selector with Month, Quarter, Year, and Custom options', () => {
    render(<StatementGenerator tenantSlug="acme-corp" initialData={mockPayload} />);

    expect(screen.getByTestId('timeframe-btn-month')).toBeInTheDocument();
    expect(screen.getByTestId('timeframe-btn-quarter')).toBeInTheDocument();
    expect(screen.getByTestId('timeframe-btn-year')).toBeInTheDocument();
    expect(screen.getByTestId('timeframe-btn-custom')).toBeInTheDocument();
  });

  it('switches timeframe to Quarter and triggers dynamic calculation', async () => {
    render(<StatementGenerator tenantSlug="acme-corp" initialData={mockPayload} />);

    const quarterBtn = screen.getByTestId('timeframe-btn-quarter');
    fireEvent.click(quarterBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('period=quarter'),
        expect.anything()
      );
    });
  });

  it('reveals custom date picker and validates end_date >= start_date', async () => {
    render(<StatementGenerator tenantSlug="acme-corp" initialData={mockPayload} />);

    const customBtn = screen.getByTestId('timeframe-btn-custom');
    fireEvent.click(customBtn);

    expect(screen.getByTestId('custom-date-range-form')).toBeInTheDocument();

    const startDateInput = screen.getByTestId('custom-start-date');
    const endDateInput = screen.getByTestId('custom-end-date');
    const applyBtn = screen.getByTestId('apply-custom-range-btn');

    // Set invalid date range: start after end
    fireEvent.change(startDateInput, { target: { value: '2026-10-01' } });
    fireEvent.change(endDateInput, { target: { value: '2026-09-01' } });
    fireEvent.click(applyBtn);

    expect(screen.getByTestId('date-validation-error')).toHaveTextContent(
      'Start date cannot be after end date.'
    );

    // Fix valid date range
    fireEvent.change(endDateInput, { target: { value: '2026-10-31' } });
    fireEvent.click(applyBtn);

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('period=custom'),
        expect.anything()
      );
    });
  });

  it('displays statement metrics and itemized yields', () => {
    render(<StatementGenerator tenantSlug="acme-corp" initialData={mockPayload} />);

    expect(screen.getByTestId('statement-period-label')).toHaveTextContent('Q3 2026 Statement');
    expect(screen.getByTestId('kpi-hours-reclaimed')).toHaveTextContent('14.0 hrs');
    expect(screen.getByTestId('kpi-realized-value')).toHaveTextContent('$1,750.00');
    expect(screen.getByTestId('kpi-completed-items')).toHaveTextContent('24');
    expect(screen.getByTestId('kpi-active-projects')).toHaveTextContent('4');
  });
});

describe('GET /api/v1/statements date validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects invalid date format with 400', async () => {
    const { authenticate } = await import('@/lib/auth-guard');
    const { GET } = await import('@/app/api/v1/statements/route');
    const { NextRequest } = await import('next/server');

    (authenticate as any).mockResolvedValue({
      context: {
        tenant: { id: 't-1', slug: 'acme-corp', name: 'Acme Corp' },
        user: { id: 'u-1' },
        role: 'owner',
      },
    });

    const req = new NextRequest('http://localhost:3000/api/v1/statements?tenant_slug=acme-corp&start_date=not-a-date&end_date=2026-09-30');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid date');
  });

  it('rejects end_date before start_date with 400', async () => {
    const { authenticate } = await import('@/lib/auth-guard');
    const { GET } = await import('@/app/api/v1/statements/route');
    const { NextRequest } = await import('next/server');

    (authenticate as any).mockResolvedValue({
      context: {
        tenant: { id: 't-1', slug: 'acme-corp', name: 'Acme Corp' },
        user: { id: 'u-1' },
        role: 'owner',
      },
    });

    const req = new NextRequest('http://localhost:3000/api/v1/statements?tenant_slug=acme-corp&start_date=2026-10-01&end_date=2026-09-01');
    const res = await GET(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('Invalid date range');
  });
});
