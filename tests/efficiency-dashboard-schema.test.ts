import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  EFFICIENCY_WIDGET_CATALOG,
  DEFAULT_EFFICIENCY_DASHBOARD_SCHEMA,
  DEFAULT_EFFICIENCY_DEFAULT_VIEWS,
  validateEfficiencyDashboardSchema,
  mergeEfficiencyDashboardSchemas,
  mergeSparseEfficiencyDashboardSchemas,
  resolveEfficiencyDashboardConfig,
  getSurfaceWidgets,
  isDashboardWidgetVisible,
  toggleWidgetInOverride,
  reorderWidgetInOverride,
  updateDefaultViewInOverride,
  clearSurfaceOverride,
  extractSurfaceSchema,
} from '@/lib/efficiency-dashboard-schema';

// Mock next/cache and supabase for server action tests
const mockRevalidatePath = vi.fn();
vi.mock('next/cache', () => ({
  revalidatePath: (...args: any[]) => mockRevalidatePath(...args),
}));

const mockGetUser = vi.fn();
const mockUpdateUser = vi.fn();
const mockFrom = vi.fn();

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(async () => ({
    auth: { getUser: mockGetUser, updateUser: mockUpdateUser },
  })),
  createServiceClient: vi.fn(() => ({
    from: (...args: any[]) => mockFrom(...args),
  })),
}));

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

import {
  getEfficiencyDashboardSchemaAction,
  updateEfficiencyDashboardSchemaAction,
} from '@/app/actions/settingsActions';

function createChainMock(result: { data?: any; error?: any }) {
  const chain: any = {
    select: vi.fn(() => chain),
    eq: vi.fn(() => chain),
    is: vi.fn(() => chain),
    update: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => result),
    then: (resolve: any) => Promise.resolve(result).then(resolve),
  };
  return chain;
}

describe('TASK-TRK-EFFICIENCY-DASHBOARD-SCHEMA-ENGINE', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Declarative Widget Catalog & Validation', () => {
    it('defines unique widget ids across efficiency, statements, and telemetry surfaces', () => {
      const ids = EFFICIENCY_WIDGET_CATALOG.map((w) => w.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(ids.length);

      const surfaces = new Set(EFFICIENCY_WIDGET_CATALOG.map((w) => w.surface));
      expect(surfaces).toEqual(new Set(['efficiency', 'statements', 'telemetry']));
      expect(DEFAULT_EFFICIENCY_DASHBOARD_SCHEMA.schema_version).toBe('1.0');
    });

    it('accepts valid declarative widget & default view schemas', () => {
      const result = validateEfficiencyDashboardSchema({
        schema_version: '1.0',
        widgets: [
          { id: 'eff_kpi_hours_reclaimed', visible: true, order: 2 },
          { id: 'eff_mod_token_yield', visible: false, order: 3 },
        ],
        default_views: {
          efficiency: { defaultPeriod: 'all-time', compactMode: true },
          statements: { defaultTimeframe: 'quarter', expandProjectAccordions: false },
          telemetry: { defaultPivot: 'project_swimlanes', defaultRefreshIntervalMs: 30000 },
        },
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects unknown widget ids, duplicate widget ids, and invalid refresh intervals', () => {
      const result = validateEfficiencyDashboardSchema({
        schema_version: '1.0',
        widgets: [
          { id: 'unknown_widget_id', visible: true },
          { id: 'eff_kpi_hours_reclaimed', visible: true },
          { id: 'eff_kpi_hours_reclaimed', visible: false },
        ],
        default_views: {
          telemetry: { defaultRefreshIntervalMs: 12345 as any },
        },
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('Unknown efficiency dashboard widget id'))).toBe(true);
      expect(result.errors.some((e) => e.message.includes('Duplicate widget id'))).toBe(true);
      expect(result.errors.some((e) => e.message.includes('defaultRefreshIntervalMs'))).toBe(true);
    });
  });

  describe('Layered Schema Resolution & Mutation Helpers', () => {
    it('resolves built-in defaults when no workspace or user overrides exist', () => {
      const resolved = resolveEfficiencyDashboardConfig();
      expect(resolved.is_customized).toBe(false);
      expect(resolved.default_views).toEqual(DEFAULT_EFFICIENCY_DEFAULT_VIEWS);
      expect(isDashboardWidgetVisible(resolved, 'eff_kpi_hours_reclaimed')).toBe(true);
      expect(isDashboardWidgetVisible(resolved, 'tel_mod_blocker_marquee')).toBe(true);
    });

    it('bridges liveDashboardSettings pivot & cadence and layers user overrides on top', () => {
      const resolved = resolveEfficiencyDashboardConfig({
        liveDashboardSettings: {
          default_pivot: 'project_swimlanes',
          default_refresh_interval_ms: 120000,
        },
        workspaceSettings: {
          widgets: [{ id: 'eff_mod_token_yield', visible: false }],
          default_views: {
            statements: { defaultTimeframe: 'quarter' },
          },
        },
        userOverrides: {
          widgets: [
            { id: 'eff_mod_token_yield', visible: true },
            { id: 'tel_kpi_scope_inflow', visible: false },
          ],
          default_views: {
            telemetry: { defaultPivot: 'stage_flow' },
          },
        },
      });

      expect(resolved.is_customized).toBe(true);
      // User override restores eff_mod_token_yield over workspace hidden setting
      expect(isDashboardWidgetVisible(resolved, 'eff_mod_token_yield')).toBe(true);
      expect(isDashboardWidgetVisible(resolved, 'tel_kpi_scope_inflow')).toBe(false);
      // Statements inherits workspace defaultTimeframe
      expect(resolved.default_views.statements.defaultTimeframe).toBe('quarter');
      // Telemetry takes user pivot override while keeping liveDashboardSettings cadence
      expect(resolved.default_views.telemetry.defaultPivot).toBe('stage_flow');
      expect(resolved.default_views.telemetry.defaultRefreshIntervalMs).toBe(120000);
    });

    it('toggles visibility, reorders widgets within a surface+kind, and clears per-surface overrides', () => {
      const base = resolveEfficiencyDashboardConfig();
      let override = toggleWidgetInOverride(null, base, 'eff_kpi_velocity_factor');
      let resolved = resolveEfficiencyDashboardConfig({ userOverrides: override });
      expect(isDashboardWidgetVisible(resolved, 'eff_kpi_velocity_factor')).toBe(false);

      // Move eff_kpi_gross_value up from index 2 to index 1
      override = reorderWidgetInOverride(override, resolved, 'efficiency', 'kpi', 'eff_kpi_gross_value', 'up');
      resolved = resolveEfficiencyDashboardConfig({ userOverrides: override });
      const effKpis = getSurfaceWidgets(resolved, 'efficiency', 'kpi');
      expect(effKpis.map((w) => w.id)).toEqual([
        'eff_kpi_hours_reclaimed',
        'eff_kpi_gross_value',
        'eff_kpi_velocity_factor',
        'eff_kpi_platform_fee',
      ]);

      // Update default view for telemetry & clear only efficiency overrides
      override = updateDefaultViewInOverride(override, 'telemetry', { defaultPivot: 'project_swimlanes' });
      const cleared = clearSurfaceOverride(override, 'efficiency');
      resolved = resolveEfficiencyDashboardConfig({ userOverrides: cleared });
      expect(isDashboardWidgetVisible(resolved, 'eff_kpi_velocity_factor')).toBe(true);
      expect(resolved.default_views.telemetry.defaultPivot).toBe('project_swimlanes');

      const extracted = extractSurfaceSchema(resolved, 'telemetry');
      expect(extracted.default_views?.telemetry?.defaultPivot).toBe('project_swimlanes');
      expect(extracted.widgets?.every((w) => w.id.startsWith('tel_'))).toBe(true);
    });

    it('mergeEfficiencyDashboardSchemas ignores unknown widget keys safely', () => {
      const merged = mergeEfficiencyDashboardSchemas({
        widgets: [{ id: 'nonexistent', visible: false }],
      });
      expect(merged.widgets?.some((w) => w.id === 'nonexistent')).toBe(false);
    });
  });

  describe('Server Actions (getEfficiencyDashboardSchemaAction & updateEfficiencyDashboardSchemaAction)', () => {
    it('resolves public workspace schema without requiring user session', async () => {
      mockFrom.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return createChainMock({
            data: {
              id: 't-pub',
              slug: 'sunshade',
              tier: 'demo',
              owner_id: 'owner-1',
              settings: {
                efficiency_dashboard_settings: {
                  schema_version: '1.0',
                  default_views: { efficiency: { defaultPeriod: 'all-time', compactMode: true } },
                },
              },
              metadata: { is_public: true },
            },
            error: null,
          });
        }
        return createChainMock({ data: null, error: null });
      });

      const res = await getEfficiencyDashboardSchemaAction('sunshade');
      expect(res.success).toBe(true);
      expect(res.resolved.default_views.efficiency.defaultPeriod).toBe('all-time');
      expect(res.resolved.default_views.efficiency.compactMode).toBe(true);
    });

    it('rejects unauthenticated or invalid updates and persists valid updates for owner', async () => {
      const invalidRes = await updateEfficiencyDashboardSchemaAction('sunshade', {
        widgets: [{ id: 'bad_id', visible: false }],
      });
      expect(invalidRes.success).toBe(false);
      expect(invalidRes.error).toContain('Unknown efficiency dashboard widget id');

      mockGetUser.mockResolvedValue({ data: { user: { id: 'owner-1' } } });
      const updateSpy = vi.fn(() => createChainMock({ data: null, error: null }));
      mockFrom.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn(() =>
              createChainMock({
                data: {
                  id: 't-1',
                  slug: 'sunshade',
                  owner_id: 'owner-1',
                  settings: {},
                },
                error: null,
              })
            ),
            update: updateSpy,
          };
        }
        return createChainMock({ data: null, error: null });
      });

      const res = await updateEfficiencyDashboardSchemaAction('sunshade', {
        schema_version: '1.0',
        widgets: [{ id: 'eff_mod_token_yield', visible: false }],
        default_views: {
          telemetry: { defaultPivot: 'project_swimlanes', defaultRefreshIntervalMs: 30000 },
        },
      });

      expect(res.success).toBe(true);
      expect(isDashboardWidgetVisible(res.resolved, 'eff_mod_token_yield')).toBe(false);
      expect(res.resolved.default_views.telemetry.defaultPivot).toBe('project_swimlanes');
      expect(updateSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          settings: expect.objectContaining({
            efficiency_dashboard_settings: expect.any(Object),
            live_dashboard_settings: expect.objectContaining({
              default_pivot: 'project_swimlanes',
              default_refresh_interval_ms: 30000,
            }),
          }),
        })
      );
      expect(mockRevalidatePath).toHaveBeenCalledWith('/sunshade/settings/efficiency');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/sunshade/statements');
      expect(mockRevalidatePath).toHaveBeenCalledWith('/sunshade/all');
    });

    it('preserves legacy live_dashboard_settings when saving unrelated efficiency/statements surfaces (sparse merge)', async () => {
      mockGetUser.mockResolvedValue({ data: { user: { id: 'owner-1' } } });
      let savedSettings: any = null;
      mockFrom.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn(() =>
              createChainMock({
                data: {
                  id: 't-1',
                  slug: 'sunshade',
                  owner_id: 'owner-1',
                  settings: {
                    live_dashboard_settings: {
                      default_pivot: 'project_swimlanes',
                      default_refresh_interval_ms: 0,
                    },
                  },
                },
                error: null,
              })
            ),
            update: vi.fn((payload: any) => {
              savedSettings = payload.settings;
              return createChainMock({ data: null, error: null });
            }),
          };
        }
        return createChainMock({ data: null, error: null });
      });

      const res = await updateEfficiencyDashboardSchemaAction('sunshade', {
        schema_version: '1.0',
        widgets: [{ id: 'eff_mod_token_yield', visible: false }],
        default_views: {
          efficiency: { defaultPeriod: 'all-time', compactMode: true },
        },
      });

      expect(res.success).toBe(true);
      // Telemetry must remain unset in sparse efficiency_dashboard_settings so legacy live_dashboard_settings stays authoritative
      expect(savedSettings.efficiency_dashboard_settings.default_views?.telemetry).toBeUndefined();
      expect(res.resolved.default_views.telemetry.defaultPivot).toBe('project_swimlanes');
      expect(res.resolved.default_views.telemetry.defaultRefreshIntervalMs).toBe(0);
    });

    it('never discloses private dashboard settings on unauthorized or viewer write denials', async () => {
      mockGetUser.mockResolvedValue({ data: { user: null } });
      mockFrom.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return createChainMock({
            data: {
              id: 't-priv',
              slug: 'secret-ws',
              owner_id: 'owner-999',
              settings: {
                efficiency_dashboard_settings: {
                  schema_version: '1.0',
                  widgets: [{ id: 'eff_mod_token_yield', visible: false }],
                  default_views: { efficiency: { defaultPeriod: 'all-time', compactMode: true } },
                },
              },
            },
            error: null,
          });
        }
        return createChainMock({ data: null, error: null });
      });

      const unauthRes = await updateEfficiencyDashboardSchemaAction('secret-ws', {
        schema_version: '1.0',
        widgets: [{ id: 'eff_kpi_hours_reclaimed', visible: true }],
      });

      expect(unauthRes.success).toBe(false);
      expect(unauthRes.error).toContain('Unauthorized');
      expect(unauthRes.resolved.default_views.efficiency.defaultPeriod).toBe('monthly');
      expect(isDashboardWidgetVisible(unauthRes.resolved, 'eff_mod_token_yield')).toBe(true);
    });

    it('mergeSparseEfficiencyDashboardSchemas merges only explicit keys', () => {
      const sparse = mergeSparseEfficiencyDashboardSchemas(
        { default_views: { statements: { defaultTimeframe: 'quarter' } } },
        { default_views: { efficiency: { compactMode: true } } }
      );
      expect(sparse.default_views?.statements?.defaultTimeframe).toBe('quarter');
      expect(sparse.default_views?.efficiency?.compactMode).toBe(true);
      expect(sparse.default_views?.telemetry).toBeUndefined();
    });
  });

  describe('API Routes (/api/v1/tenants/efficiency-schema & /api/v1/tenants/me)', () => {
    it('PATCH /api/v1/tenants/efficiency-schema rejects viewers/unauthenticated and saves sparsely for owners', async () => {
      const { NextRequest } = await import('next/server');
      const { PATCH } = await import('@/app/api/v1/tenants/efficiency-schema/route');

      mockGetUser.mockResolvedValue({ data: { user: null } });
      const unauthReq = new NextRequest('http://localhost/api/v1/tenants/efficiency-schema', {
        method: 'PATCH',
        body: JSON.stringify({ tenant_slug: 'sunshade', updates: { schema_version: '1.0' } }),
      });
      const unauthRes = await PATCH(unauthReq);
      expect(unauthRes.status).toBe(401);

      mockGetUser.mockResolvedValue({ data: { user: { id: 'viewer-1' } } });
      mockFrom.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return createChainMock({
            data: { id: 't-1', slug: 'sunshade', owner_id: 'owner-1', settings: {} },
            error: null,
          });
        }
        if (table === 'tenant_members') {
          return createChainMock({ data: { role: 'viewer' }, error: null });
        }
        return createChainMock({ data: null, error: null });
      });

      const viewerReq = new NextRequest('http://localhost/api/v1/tenants/efficiency-schema', {
        method: 'PATCH',
        body: JSON.stringify({ tenant_slug: 'sunshade', updates: { schema_version: '1.0' } }),
      });
      const viewerRes = await PATCH(viewerReq);
      expect(viewerRes.status).toBe(403);
    });

    it('PATCH /api/v1/tenants/me stores efficiency_dashboard_preferences scoped per tenant_slug', async () => {
      const { NextRequest } = await import('next/server');
      const { PATCH } = await import('@/app/api/v1/tenants/me/route');

      mockGetUser.mockResolvedValue({
        data: {
          user: {
            id: 'user-1',
            email: 'tymz@sunshade.icu',
            user_metadata: {
              efficiency_dashboard_preferences: {
                'ws-a': {
                  schema_version: '1.0',
                  widgets: [{ id: 'eff_kpi_velocity_factor', visible: false }],
                },
              },
            },
          },
        },
      });
      mockUpdateUser.mockResolvedValue({ error: null });

      const req = new NextRequest('http://localhost/api/v1/tenants/me', {
        method: 'PATCH',
        body: JSON.stringify({
          tenant_slug: 'ws-b',
          efficiency_dashboard_preferences: {
            schema_version: '1.0',
            widgets: [{ id: 'eff_kpi_velocity_factor', visible: true }],
          },
        }),
      });
      const res = await PATCH(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.efficiency_dashboard_preferences_map['ws-a'].widgets[0].visible).toBe(false);
      expect(body.efficiency_dashboard_preferences_map['ws-b'].widgets[0].visible).toBe(true);
    });
  });
});
