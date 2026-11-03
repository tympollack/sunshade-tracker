import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  DEFAULT_LIVE_DASHBOARD_SETTINGS,
  resolveLiveDashboardSettings,
} from '@/types/tracker';
import {
  getLiveDashboardSettingsAction,
  updateLiveDashboardSettingsAction,
} from '@/app/actions/settingsActions';

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
}));

const mockGetUser = vi.fn();
vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(() =>
    Promise.resolve({
      auth: {
        getUser: () => mockGetUser(),
      },
    })
  ),
}));

const mockFrom = vi.fn();
vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

describe('Workspace-Level Live Dashboard Configuration Schema (TASK-TRK-WORKSPACE-DEFAULT-SCHEMA)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('resolveLiveDashboardSettings', () => {
    it('returns standard default live_dashboard_settings when input is null or undefined', () => {
      const settings = resolveLiveDashboardSettings(null);
      expect(settings).toEqual(DEFAULT_LIVE_DASHBOARD_SETTINGS);
      expect(settings.default_pivot).toBe('stage_flow');
      expect(settings.stagnation_median_multiplier).toBe(1.5);
      expect(settings.stagnation_warning_label).toBe('System Queue Stall');
      expect(settings.default_refresh_interval_ms).toBe(60000);
      expect(settings.lifecycle_categories).toHaveLength(3);
      expect(settings.lifecycle_categories[0]).toEqual({
        key: 'execution',
        label: 'Active Execution',
        order: 1,
        color: '#38BDF8',
      });
    });

    it('merges partial custom live_dashboard_settings without losing default keys', () => {
      const resolved = resolveLiveDashboardSettings({
        live_dashboard_settings: {
          default_pivot: 'project_swimlanes',
          stagnation_median_multiplier: 2.0,
        },
      });
      expect(resolved.default_pivot).toBe('project_swimlanes');
      expect(resolved.stagnation_median_multiplier).toBe(2.0);
      expect(resolved.stagnation_warning_label).toBe('System Queue Stall');
      expect(resolved.default_refresh_interval_ms).toBe(60000);
      expect(resolved.lifecycle_categories).toHaveLength(3);
    });

    it('sorts custom lifecycle_categories by order ascending', () => {
      const resolved = resolveLiveDashboardSettings({
        live_dashboard_settings: {
          lifecycle_categories: [
            { key: 'staging', label: 'Staged', order: 30, color: '#A855F7' },
            { key: 'execution', label: 'Doing', order: 10, color: '#38BDF8' },
            { key: 'verification', label: 'QA', order: 20, color: '#F59E0B' },
          ],
        },
      });
      expect(resolved.lifecycle_categories.map((c) => c.key)).toEqual([
        'execution',
        'verification',
        'staging',
      ]);
    });
  });

  describe('getLiveDashboardSettingsAction', () => {
    it('resolves seeded settings from tracker.tenants.settings in server action', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'tenant-1',
                  slug: 'sunshade',
                  settings: {
                    live_dashboard_settings: {
                      default_pivot: 'project_swimlanes',
                      stagnation_median_multiplier: 1.8,
                      stagnation_warning_label: 'Custom Queue Stall',
                      default_refresh_interval_ms: 30000,
                      lifecycle_categories: DEFAULT_LIVE_DASHBOARD_SETTINGS.lifecycle_categories,
                    },
                  },
                  metadata: {},
                },
                error: null,
              }),
            }),
          }),
        }),
      });

      const res = await getLiveDashboardSettingsAction('sunshade');
      expect(res.success).toBe(true);
      expect(res.error).toBeNull();
      expect(res.settings.default_pivot).toBe('project_swimlanes');
      expect(res.settings.stagnation_median_multiplier).toBe(1.8);
      expect(res.settings.stagnation_warning_label).toBe('Custom Queue Stall');
      expect(res.settings.default_refresh_interval_ms).toBe(30000);
    });

    it('falls back to default live_dashboard_settings if tenant is not found', async () => {
      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: null,
                error: null,
              }),
            }),
          }),
        }),
      });

      const res = await getLiveDashboardSettingsAction('nonexistent');
      expect(res.success).toBe(false);
      expect(res.settings).toEqual(DEFAULT_LIVE_DASHBOARD_SETTINGS);
    });

    it('rejects unauthenticated requests for private workspaces', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: null },
      });

      mockFrom.mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            is: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  id: 'tenant-priv',
                  slug: 'private-ws',
                  tier: 'pro',
                  owner_id: 'owner-99',
                  settings: {
                    live_dashboard_settings: {
                      default_pivot: 'project_swimlanes',
                    },
                  },
                  metadata: {},
                },
                error: null,
              }),
            }),
          }),
        }),
      });

      const res = await getLiveDashboardSettingsAction('private-ws');
      expect(res.success).toBe(false);
      expect(res.error).toContain('Unauthorized');
      expect(res.settings).toEqual(DEFAULT_LIVE_DASHBOARD_SETTINGS);
    });
  });

  describe('updateLiveDashboardSettingsAction', () => {
    it('persists updated live_dashboard_settings for authorized workspace owner', async () => {
      mockGetUser.mockResolvedValue({
        data: { user: { id: 'owner-1' } },
      });

      const mockUpdateEq = vi.fn().mockResolvedValue({ error: null });
      mockFrom.mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: {
                      id: 'tenant-1',
                      slug: 'sunshade',
                      owner_id: 'owner-1',
                      settings: {
                        velocity_conversion: { default_hours_per_point: 4 },
                      },
                    },
                    error: null,
                  }),
                }),
              }),
            }),
            update: vi.fn().mockReturnValue({
              eq: mockUpdateEq,
            }),
          };
        }
        return {};
      });

      const res = await updateLiveDashboardSettingsAction('sunshade', {
        default_pivot: 'project_swimlanes',
        default_refresh_interval_ms: 120000,
      });

      expect(res.success).toBe(true);
      expect(res.settings.default_pivot).toBe('project_swimlanes');
      expect(res.settings.default_refresh_interval_ms).toBe(120000);
      expect(mockUpdateEq).toHaveBeenCalledWith('id', 'tenant-1');
    });
  });
});
