import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import EfficiencyStatementPage from '@/app/(dashboard)/[tenantSlug]/settings/efficiency/page';

// Mock Next.js navigation components
vi.mock('next/link', () => ({
  default: ({ children, href, className }: any) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

vi.mock('@/components/SunShadeLogo', () => ({
  SunShadeLogo: () => <div data-testid="logo">SunShade</div>,
}));

vi.mock('@/components/WorkspaceSwitcher', () => ({
  WorkspaceSwitcher: () => <div data-testid="workspace-switcher">Switcher</div>,
}));

vi.mock('@/components/UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu">UserMenu</div>,
}));

const mockEfficiencyData = {
  tenant: {
    slug: 'pym-energy',
    name: 'Pym Energy',
    tier: 'Enterprise',
  },
  dateRange: {
    periodLabel: 'Sep 2026 Statement',
    startDate: '2026-09-01T00:00:00.000Z',
    endDate: '2026-09-07T00:00:00.000Z',
  },
  kpis: {
    completedItemsCount: 16,
    activeProjectsCount: 3,
    totalItemsCount: 42,
    totalHoursReclaimed: 10.0,
    hourlyRate: 125,
    velocityFactor: '+18%',
    grossRealizedValue: 1250.0,
    platformSubscriptionFee: 0.0,
    netRealizedSavings: 1250.0,
  },
  itemizedYields: [
    {
      id: 'hierarchical-status-rollup',
      frictionPoint: 'Hierarchical Status Rollup',
      description: '15–30 min per project/week saved via automated hierarchy queries & real-time progress rollups.',
      metric: '3 active projects tracked',
      hoursReclaimed: 6.0,
      ratePerHour: 125,
      realizedValue: 750.0,
    },
    {
      id: 'backlog-triage-state-sync',
      frictionPoint: 'Backlog Triage & State Sync',
      description: '2–5 min per item eliminated via atomic status transitions and inline metadata management.',
      metric: '16 completed work items',
      hoursReclaimed: 0.8,
      ratePerHour: 125,
      realizedValue: 100.0,
    },
    {
      id: 'autonomous-review-dev-cycles',
      frictionPoint: 'Autonomous Review & Dev Cycles',
      description: 'Friction eliminated via automated PR linking, commit attribution, and autonomous agent loops.',
      metric: '16 attributed items',
      hoursReclaimed: 3.2,
      ratePerHour: 125,
      realizedValue: 400.0,
    },
  ],
  ecosystemNote: 'Built to eliminate busywork. Spend your reclaimed hours building, not managing administrative overhead.',
  generatedAt: '2026-09-07T18:00:00.000Z',
};

describe('EfficiencyStatementPage Component', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/tenants/me')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            workspaces: [{ slug: 'pym-energy', name: 'Pym Energy' }],
          }),
        });
      }
      if (url.includes('/api/v1/tenants/efficiency')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockEfficiencyData,
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });
  });

  it('renders statement title, tenant slug, and KPIs accurately', async () => {
    await act(async () => {
      render(
        <EfficiencyStatementPage
          params={Promise.resolve({ tenantSlug: 'pym-energy' })}
        />
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText('Operational Yield & Efficiency Statement')
      ).toBeDefined();
    });

    expect(screen.getByText(/@pym-energy/i)).toBeDefined();
    expect(screen.getByText('Enterprise', { exact: false })).toBeDefined();

    // KPI Values
    expect(screen.getByText('10.0')).toBeDefined();
    expect(screen.getByText('+18%')).toBeDefined();
    expect(screen.getAllByText('$1,250.00').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('$0.00').length).toBeGreaterThanOrEqual(1);
  });

  it('renders itemized audit rows with calculated yields', async () => {
    await act(async () => {
      render(
        <EfficiencyStatementPage
          params={Promise.resolve({ tenantSlug: 'pym-energy' })}
        />
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Hierarchical Status Rollup')).toBeDefined();
      expect(screen.getByText('Backlog Triage & State Sync')).toBeDefined();
      expect(screen.getByText('Autonomous Review & Dev Cycles')).toBeDefined();
    });

    expect(screen.getByText('3 active projects tracked')).toBeDefined();
    expect(screen.getByText('6.00 hrs')).toBeDefined();
    expect(screen.getByText('$750.00')).toBeDefined();
    expect(screen.getByText('0.80 hrs')).toBeDefined();
    expect(screen.getByText('$100.00')).toBeDefined();
    expect(screen.getByText('3.20 hrs')).toBeDefined();
    expect(screen.getByText('$400.00')).toBeDefined();
  });

  it('renders the bottom line banner with $0 subscription fee and ecosystem note', async () => {
    await act(async () => {
      render(
        <EfficiencyStatementPage
          params={Promise.resolve({ tenantSlug: 'pym-energy' })}
        />
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Net Tenant Benefit Summary')).toBeDefined();
    });

    expect(
      screen.getByText(
        '“Built to eliminate busywork. Spend your reclaimed hours building, not managing administrative overhead.”'
      )
    ).toBeDefined();
  });

  it('handles CSV and JSON export button clicks', async () => {
    // Mock URL.createObjectURL, URL.revokeObjectURL, and HTMLAnchorElement click
    const createObjectURLMock = vi.fn().mockReturnValue('blob:test-url');
    const revokeObjectURLMock = vi.fn();
    global.URL.createObjectURL = createObjectURLMock;
    global.URL.revokeObjectURL = revokeObjectURLMock;
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    await act(async () => {
      render(
        <EfficiencyStatementPage
          params={Promise.resolve({ tenantSlug: 'pym-energy' })}
        />
      );
    });

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Export CSV/i })).toBeDefined();
    });

    const csvBtn = screen.getByRole('button', { name: /Export CSV/i });
    const jsonBtn = screen.getByRole('button', { name: /Export JSON/i });

    await act(async () => {
      fireEvent.click(csvBtn);
    });

    expect(createObjectURLMock).toHaveBeenCalled();
    expect(clickSpy).toHaveBeenCalled();
    expect(screen.getByText('CSV statement downloaded')).toBeDefined();

    await act(async () => {
      fireEvent.click(jsonBtn);
    });

    expect(createObjectURLMock).toHaveBeenCalledTimes(2);
    expect(clickSpy).toHaveBeenCalledTimes(2);
    expect(screen.getByText('JSON statement downloaded')).toBeDefined();

    clickSpy.mockRestore();
  });

  it('displays error state when API call fails', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('Network connection failed'));

    await act(async () => {
      render(
        <EfficiencyStatementPage
          params={Promise.resolve({ tenantSlug: 'failing-tenant' })}
        />
      );
    });

    await waitFor(() => {
      expect(screen.getByText('Statement Unavailable')).toBeDefined();
      expect(screen.getByText('Network connection failed')).toBeDefined();
    });
  });
});
