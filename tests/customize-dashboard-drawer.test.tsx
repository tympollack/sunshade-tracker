// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { EfficiencyStatementView } from '@/components/efficiency/EfficiencyStatementView';
import { StatementGenerator } from '@/components/statements/StatementGenerator';
import { ProjectFocusAccordion } from '@/components/statements/ProjectFocusAccordion';
import { LiveFlightDeckView } from '@/components/live/LiveFlightDeckView';
import type { EfficiencyMetricsPayload } from '@/lib/services/valueLedgerService';
import type { ProjectSettings, WorkItem } from '@/types/tracker';
import {
  getEfficiencyDashboardStorageKey,
  useEfficiencyDashboardConfig,
} from '@/hooks/useEfficiencyDashboardConfig';

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

  it('toggles KPIs/Modules, saves workspace default via API, traps focus, and resets user overrides to saved workspace layout', async () => {
    const schemaSaveCalls: any[] = [];
    const profilePatchCalls: any[] = [];

    global.fetch = vi.fn().mockImplementation((url: string, init?: RequestInit) => {
      if (url.includes('/api/v1/tenants/efficiency-schema')) {
        const parsed = init?.body ? JSON.parse(String(init.body)) : {};
        schemaSaveCalls.push(parsed);
        return Promise.resolve({
          ok: true,
          json: async () => ({
            success: true,
            schema: parsed.updates,
            resolved: {},
          }),
        });
      }
      if (url.includes('/api/v1/tenants/me')) {
        if (init?.method === 'PATCH') {
          const parsed = init?.body ? JSON.parse(String(init.body)) : {};
          profilePatchCalls.push(parsed);
          return Promise.resolve({
            ok: true,
            json: async () => ({ success: true }),
          });
        }
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

    // Focus trap keeps Tab inside the drawer
    const closeBtn = within(drawer).getByTestId('customize-dashboard-close-btn');
    closeBtn.focus();
    fireEvent.keyDown(window, { key: 'Tab', shiftKey: true });
    expect(drawer.contains(document.activeElement)).toBe(true);

    // Toggle off Velocity Factor KPI and save as Workspace Default via API route
    fireEvent.click(within(drawer).getByTestId('widget-toggle-eff_kpi_velocity_factor'));
    expect(screen.queryByTestId('efficiency-kpi-velocity-factor')).toBeNull();

    // Verify localStorage & scoped profile PATCH
    const savedRaw = localStorage.getItem(getEfficiencyDashboardStorageKey('pym-energy'));
    expect(savedRaw).toBeTruthy();
    expect(savedRaw).toContain('eff_kpi_velocity_factor');
    expect(profilePatchCalls[0]?.tenant_slug).toBe('pym-energy');

    fireEvent.click(within(drawer).getByTestId('customize-dashboard-save-workspace-btn'));
    await waitFor(() => {
      expect(schemaSaveCalls.length).toBe(1);
      expect(schemaSaveCalls[0].tenant_slug).toBe('pym-energy');
      expect(screen.getByTestId('customize-dashboard-workspace-saved')).toBeInTheDocument();
    });

    // Now apply a user-only override hiding Token Yield Module, then Reset to Default:
    // Reset must restore Token Yield (workspace default) while keeping Velocity Factor hidden (saved workspace default!)
    fireEvent.click(within(drawer).getByTestId('widget-toggle-eff_mod_token_yield'));
    expect(screen.queryByTestId('efficiency-module-token-yield')).toBeNull();

    fireEvent.click(within(drawer).getByTestId('customize-dashboard-reset-btn'));
    expect(screen.getByTestId('efficiency-module-token-yield')).toBeInTheDocument();
    expect(screen.queryByTestId('efficiency-kpi-velocity-factor')).toBeNull();

    // Close via Escape key
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('customize-dashboard-drawer')).toBeNull();
  });

  it('defers initial fetch until isConfigReady is true and applies asynchronously loaded statement default timeframe', async () => {
    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/statements')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockEfficiencyPayload,
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    const { rerender } = render(
      <StatementGenerator
        tenantSlug="acme-corp"
        isConfigReady={false}
        workspaceSchema={null}
      />
    );

    // Must not fetch monthly report before workspace/profile config settles
    expect(global.fetch).not.toHaveBeenCalled();

    // Config arrives with workspace defaultTimeframe = 'quarter'
    rerender(
      <StatementGenerator
        tenantSlug="acme-corp"
        isConfigReady={true}
        workspaceSchema={{
          schema_version: '1.0',
          default_views: { statements: { defaultTimeframe: 'quarter' } },
        }}
      />
    );

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('period=quarter'),
        expect.anything()
      );
    });
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

    fireEvent.click(within(drawer).getByTestId('widget-toggle-stmt_kpi_completed_items'));
    fireEvent.click(within(drawer).getByTestId('widget-toggle-stmt_mod_itemized_breakdown'));

    expect(screen.queryByTestId('kpi-completed-items')).toBeNull();
    expect(screen.queryByTestId('statement-module-itemized-breakdown')).toBeNull();

    fireEvent.click(within(drawer).getByTestId('default-view-stmt-timeframe-quarter'));
    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('period=quarter'),
        expect.anything()
      );
    });
  });

  it('hydrates async profile defaults, reorders ribbon above marquee, and restores baseline on Reset in LiveFlightDeckView', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 304, ok: false }));

    const { rerender } = render(
      <LiveFlightDeckView
        tenantSlug="sunshade"
        items={SAMPLE_ITEMS}
        projects={[{ id: 'proj-1', slug: 'trk', name: 'Tracker', settings: SAMPLE_PROJECT_SETTINGS }]}
        profileLoaded={false}
        isKioskMode={false}
        onToggleKioskMode={vi.fn()}
      />
    );

    // Initially Stage Flow + Balanced (60000)
    expect(screen.getByTestId('stage-flow-view')).toBeInTheDocument();
    expect(
      (screen.getByTestId('live-polling-cadence-select') as HTMLSelectElement).value
    ).toBe('60000');

    // Profile loads asynchronously with Paused (0) + Project Lanes
    rerender(
      <LiveFlightDeckView
        tenantSlug="sunshade"
        items={SAMPLE_ITEMS}
        projects={[{ id: 'proj-1', slug: 'trk', name: 'Tracker', settings: SAMPLE_PROJECT_SETTINGS }]}
        profileLoaded={true}
        userDashboardPreferences={{
          schema_version: '1.0',
          default_views: {
            telemetry: { defaultPivot: 'project_swimlanes', defaultRefreshIntervalMs: 0 },
          },
        }}
        isKioskMode={false}
        onToggleKioskMode={vi.fn()}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('project-swimlane-view')).toBeInTheDocument();
      expect(
        (screen.getByTestId('live-polling-cadence-select') as HTMLSelectElement).value
      ).toBe('0');
    });

    // Open customizer and click Reset to Default -> restores Stage Flow + Balanced (60000)
    fireEvent.click(screen.getByTestId('customize-dashboard-trigger'));
    const drawer = screen.getByTestId('customize-dashboard-drawer');
    fireEvent.click(within(drawer).getByTestId('customize-dashboard-reset-btn'));

    expect(screen.getByTestId('stage-flow-view')).toBeInTheDocument();
    expect(
      (screen.getByTestId('live-polling-cadence-select') as HTMLSelectElement).value
    ).toBe('60000');

    // Move Telemetry Ribbon above Ambient Blocker Marquee -> renders ribbon BEFORE marquee in DOM
    fireEvent.click(within(drawer).getByTestId('widget-move-up-tel_mod_telemetry_ribbon'));
    const deck = screen.getByTestId('live-flight-deck-view');
    const ribbonEl = screen.getByTestId('telemetry-metric-badges-grid');
    const marqueeEl = screen.getByTestId('ambient-blocker-marquee');
    expect(
      Boolean(ribbonEl.compareDocumentPosition(marqueeEl) & Node.DOCUMENT_POSITION_FOLLOWING)
    ).toBe(true);
    expect(deck).toBeInTheDocument();

    // Toggle off Scope Inflow KPI & Blocker Marquee
    fireEvent.click(within(drawer).getByTestId('widget-toggle-tel_kpi_scope_inflow'));
    fireEvent.click(within(drawer).getByTestId('widget-toggle-tel_mod_blocker_marquee'));
    expect(screen.queryByTestId('metric-scope-inflow')).toBeNull();
    expect(screen.queryByTestId('ambient-blocker-marquee')).toBeNull();

    // Close by clicking backdrop
    fireEvent.click(screen.getByTestId('customize-dashboard-drawer-backdrop'));
    expect(screen.queryByTestId('customize-dashboard-drawer')).toBeNull();
  });

  it('keeps untouched projects following defaultExpanded in ProjectFocusAccordion when another project is toggled', () => {
    const projects = [
      {
        projectId: 'proj-a',
        projectName: 'Project Alpha',
        projectSlug: 'alpha',
        configuredRatio: 2,
        isCustomRatio: false,
        totalItems: 2,
        empiricalRatio: 1.8,
        totalPoints: 10,
        plannedHours: 20,
        actualHours: 18,
        varianceHours: -2,
        predictabilityIndex: 90,
        focusPercentage: 60,
        plannedScopePoints: 10,
        churnPoints: 0,
        items: [],
      },
      {
        projectId: 'proj-b',
        projectName: 'Project Beta',
        projectSlug: 'beta',
        configuredRatio: 2,
        isCustomRatio: false,
        totalItems: 1,
        empiricalRatio: 2.2,
        totalPoints: 5,
        plannedHours: 10,
        actualHours: 11,
        varianceHours: 1,
        predictabilityIndex: 90,
        focusPercentage: 40,
        plannedScopePoints: 5,
        churnPoints: 0,
        items: [],
      },
    ] as any;

    const { rerender } = render(
      <ProjectFocusAccordion projects={projects} tenantSlug="sunshade" defaultExpanded={true} />
    );

    // Toggle only Project Alpha closed
    fireEvent.click(within(screen.getByTestId('project-accordion-proj-a')).getByRole('button'));
    const stored = JSON.parse(localStorage.getItem('statement_accordion_state_sunshade') || '{}');
    expect(stored).toEqual({ 'proj-a': false });

    // Switch defaultExpanded to false -> Project Beta (untouched) collapses too!
    rerender(
      <ProjectFocusAccordion projects={projects} tenantSlug="sunshade" defaultExpanded={false} />
    );
    expect(
      within(screen.getByTestId('project-accordion-proj-b'))
        .getByRole('button')
        .getAttribute('aria-expanded')
    ).toBe('false');
  });

  it('reconciles stale localStorage cache when signed-in profile loads null (remote reset)', () => {
    localStorage.setItem(
      getEfficiencyDashboardStorageKey('ws-a'),
      JSON.stringify({
        schema_version: '1.0',
        widgets: [{ id: 'eff_kpi_velocity_factor', visible: false }],
      })
    );

    function Probe({ profileLoaded, prefs }: { profileLoaded: boolean; prefs: any }) {
      const cfg = useEfficiencyDashboardConfig({
        tenantSlug: 'ws-a',
        surface: 'efficiency',
        initialUserOverrides: prefs,
        profileLoaded,
      });
      return <div data-testid="probe-visible">{String(cfg.isWidgetVisible('eff_kpi_velocity_factor'))}</div>;
    }

    const { rerender } = render(<Probe profileLoaded={false} prefs={null} />);
    expect(screen.getByTestId('probe-visible').textContent).toBe('false');

    // Server profile resolves with null -> clears stale local cache and restores widget
    rerender(<Probe profileLoaded={true} prefs={null} />);
    expect(screen.getByTestId('probe-visible').textContent).toBe('true');
    expect(localStorage.getItem(getEfficiencyDashboardStorageKey('ws-a'))).toBeNull();
  });
});
