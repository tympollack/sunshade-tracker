// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { EfficiencyStatementView } from '@/components/efficiency/EfficiencyStatementView';
import { StatementGenerator } from '@/components/statements/StatementGenerator';
import { LiveFlightDeckView } from '@/components/live/LiveFlightDeckView';
import type { EfficiencyMetricsPayload } from '@/lib/services/valueLedgerService';
import type { ProjectSettings, WorkItem } from '@/types/tracker';
import { getEfficiencyDashboardStorageKey } from '@/hooks/useEfficiencyDashboardConfig';

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

const mockUpdateSchemaAction = vi.fn().mockResolvedValue({
  success: true,
  schema: { schema_version: '1.0', widgets: [], default_views: {} },
  resolved: {},
  error: null,
});

vi.mock('@/app/actions/settingsActions', () => ({
  updateEfficiencyDashboardSchemaAction: (...args: any[]) => mockUpdateSchemaAction(...args),
}));

const mockEfficiencyPayload: EfficiencyMetricsPayload = {
  tenant: {
    slug: 'pym-energy',
    name: 'Pym Energy',
    tier: 'Enterprise',
  },
  dateRange: {
    periodLabel: 'Nov 2026 Statement',
    startDate: '2026-11-01T00:00:00.000Z',
    endDate: '2026-11-30T23:59:59.999Z',
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
    breakdown: {
      verifiedArtifactCount: 10,
      personalExcludedCount: 2,
      unverifiedExcludedCount: 4,
      totalConsideredCount: 16,
    },
  },
  itemizedYields: [
    {
      id: 'hierarchical-status-rollup',
      frictionPoint: 'Hierarchical Status Rollup',
      description: 'Saved via automated hierarchy queries.',
      metric: '3 active projects tracked',
      hoursReclaimed: 6.0,
      ratePerHour: 125,
      realizedValue: 750.0,
    },
  ],
  ecosystemNote: 'Built to eliminate busywork.',
  generatedAt: '2026-11-20T12:00:00.000Z',
};

const SAMPLE_PROJECT_SETTINGS: ProjectSettings = {
  schema_version: '1.0',
  wip_limit: 6,
  work_unit_field: 'story_points',
  hierarchy: [{ type: 'task', label: 'Task', level: 1, allowed_parents: [] }],
  statuses: [
    { id: 'coding', label: 'Coding', color: '#38bdf8', order: 1, lifecycle_category: 'execution' },
    { id: 'review', label: 'Review', color: '#f59e0b', order: 2, lifecycle_category: 'verification' },
  ],
  custom_fields: [],
};

const SAMPLE_ITEMS: WorkItem[] = [
  {
    id: 'item-1',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    external_ref_id: 'TRK-888',
    item_type: 'task',
    status: 'coding',
    title: 'Telemetry Card Item',
    order_index: 1000,
    assignee: 'Tymz',
    metadata: { story_points: 5, priority: 'High', is_blocked: true, blocked_reason: 'CI build pending' },
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-20T12:00:00.000Z',
    deleted_at: null,
  },
];

describe('TASK-TRK-EFFICIENCY-VIEW-CUSTOMIZER-UI: Customize Dashboard Drawer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    window.history.replaceState(null, '', '/');
  });

  it('toggles KPIs and Modules, reorders KPIs, persists to localStorage, and resets in EfficiencyStatementView', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/tenants/me')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            user: { id: 'user-1', email: 'tymz@sunshade.icu' },
            workspaces: [{ slug: 'pym-energy', name: 'Pym Energy', role: 'owner', settings: {} }],
          }),
        });
      }
      if (url.includes('/api/v1/tenants/efficiency')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockEfficiencyPayload,
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    render(<EfficiencyStatementView tenantSlug="pym-energy" />);

    await waitFor(() => {
      expect(screen.getByTestId('efficiency-module-summary-kpis')).toBeInTheDocument();
    });

    expect(screen.getByTestId('efficiency-kpi-velocity-factor')).toBeInTheDocument();
    expect(screen.getByTestId('efficiency-module-token-yield')).toBeInTheDocument();

    // Open Customize Dashboard drawer
    fireEvent.click(screen.getByTestId('customize-dashboard-trigger'));
    const drawer = screen.getByTestId('customize-dashboard-drawer');
    expect(drawer).toBeInTheDocument();

    // Toggle off Velocity Factor KPI and Token Yield Module
    fireEvent.click(within(drawer).getByTestId('widget-toggle-eff_kpi_velocity_factor'));
    fireEvent.click(within(drawer).getByTestId('widget-toggle-eff_mod_token_yield'));

    expect(screen.queryByTestId('efficiency-kpi-velocity-factor')).toBeNull();
    expect(screen.queryByTestId('efficiency-module-token-yield')).toBeNull();

    // Verify localStorage persistence
    const savedRaw = localStorage.getItem(getEfficiencyDashboardStorageKey('pym-energy'));
    expect(savedRaw).toBeTruthy();
    expect(savedRaw).toContain('eff_kpi_velocity_factor');

    // Save as Workspace Default button is visible for owner & calls server action
    fireEvent.click(within(drawer).getByTestId('customize-dashboard-save-workspace-btn'));
    await waitFor(() => {
      expect(mockUpdateSchemaAction).toHaveBeenCalledWith(
        'pym-energy',
        expect.objectContaining({
          schema_version: '1.0',
        })
      );
      expect(screen.getByTestId('customize-dashboard-workspace-saved')).toBeInTheDocument();
    });

    // Reset to Default restores both widgets
    fireEvent.click(within(drawer).getByTestId('customize-dashboard-reset-btn'));
    expect(screen.getByTestId('efficiency-kpi-velocity-factor')).toBeInTheDocument();
    expect(screen.getByTestId('efficiency-module-token-yield')).toBeInTheDocument();

    // Close via Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('customize-dashboard-drawer')).toBeNull();
  });

  it('toggles KPIs and switches default timeframe immediately in StatementGenerator', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/statements')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockEfficiencyPayload,
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    render(<StatementGenerator tenantSlug="acme-corp" initialData={mockEfficiencyPayload} />);

    expect(screen.getByTestId('kpi-completed-items')).toBeInTheDocument();
    expect(screen.getByTestId('statement-module-itemized-breakdown')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('customize-dashboard-trigger'));
    const drawer = screen.getByTestId('customize-dashboard-drawer');

    // Hide Completed Items KPI & Itemized Breakdown module
    fireEvent.click(within(drawer).getByTestId('widget-toggle-stmt_kpi_completed_items'));
    fireEvent.click(within(drawer).getByTestId('widget-toggle-stmt_mod_itemized_breakdown'));

    expect(screen.queryByTestId('kpi-completed-items')).toBeNull();
    expect(screen.queryByTestId('statement-module-itemized-breakdown')).toBeNull();

    // Switch default timeframe to Quarter and verify immediate refetch with period=quarter
    fireEvent.click(within(drawer).getByTestId('default-view-stmt-timeframe-quarter'));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('period=quarter'),
        expect.anything()
      );
    });
  });

  it('toggles Telemetry KPIs, Blocker Marquee, and Default Pivot in LiveFlightDeckView', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 304, ok: false }));

    render(
      <LiveFlightDeckView
        tenantSlug="sunshade"
        items={SAMPLE_ITEMS}
        projects={[{ id: 'proj-1', slug: 'trk', name: 'Tracker', settings: SAMPLE_PROJECT_SETTINGS }]}
        isKioskMode={false}
        onToggleKioskMode={vi.fn()}
      />
    );

    expect(screen.getByTestId('metric-wip-saturation')).toBeInTheDocument();
    expect(screen.getByTestId('metric-scope-inflow')).toBeInTheDocument();
    expect(screen.getByTestId('ambient-blocker-marquee')).toBeInTheDocument();
    expect(screen.getByTestId('stage-flow-view')).toBeInTheDocument();

    // Open customizer from LiveDashboardToolbar
    fireEvent.click(screen.getByTestId('customize-dashboard-trigger'));
    const drawer = screen.getByTestId('customize-dashboard-drawer');

    // Toggle off Scope Inflow KPI and Ambient Blocker Marquee
    fireEvent.click(within(drawer).getByTestId('widget-toggle-tel_kpi_scope_inflow'));
    fireEvent.click(within(drawer).getByTestId('widget-toggle-tel_mod_blocker_marquee'));

    expect(screen.queryByTestId('metric-scope-inflow')).toBeNull();
    expect(screen.queryByTestId('ambient-blocker-marquee')).toBeNull();
    expect(screen.getByTestId('metric-wip-saturation')).toBeInTheDocument();

    // Switch default pivot to Project Lanes and verify immediate switch
    fireEvent.click(within(drawer).getByTestId('default-view-tel-pivot-project_swimlanes'));
    expect(screen.getByTestId('project-swimlane-view')).toBeInTheDocument();
    expect(screen.queryByTestId('stage-flow-view')).toBeNull();

    // Close by clicking backdrop
    fireEvent.click(screen.getByTestId('customize-dashboard-drawer-backdrop'));
    expect(screen.queryByTestId('customize-dashboard-drawer')).toBeNull();
  });
});
