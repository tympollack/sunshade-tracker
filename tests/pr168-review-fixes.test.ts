import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getItemTokenCommitment } from '@/lib/bounties/flexLedgerService';
import { TOKEN_RATE_PER_HOUR } from '@/lib/bounties/neglectPricing';
import { reassignWorkItemProject, bulkReassignProjects } from '@/app/actions/trackerActions';
import { saveModalItem } from '@/lib/save-modal-item';
import { supabaseAdmin } from '@/lib/db';
import { WorkItem } from '@/types/tracker';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'user-tester-1',
            email: 'tester@sunshade.icu',
            user_metadata: { full_name: 'Tester User' },
          },
        },
        error: null,
      }),
    },
  }),
  createServiceClient: vi.fn().mockReturnValue({
    from: vi.fn(),
    auth: {
      admin: {
        getUserById: vi.fn(),
      },
    },
  }),
}));

describe('PR #168 Review Fixes & Cross-Project Move 304 Cache Invalidation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('BUG: flexLedgerService getItemTokenCommitment unestimated bounty scaling', () => {
    it('applies project process_efficiency_factor to the 1-hour fallback when estimated hours are missing', () => {
      const itemWithoutEstimate = {
        id: 'item-1',
        title: 'Unestimated Bounty Task',
        metadata: {},
      };

      // Factor 1.0 -> 1 * 60,000 = 60,000
      expect(getItemTokenCommitment(itemWithoutEstimate, 1.0)).toBe(TOKEN_RATE_PER_HOUR);

      // Factor 2.0 -> 1 * 60,000 * 2.0 = 120,000
      expect(getItemTokenCommitment(itemWithoutEstimate, 2.0)).toBe(TOKEN_RATE_PER_HOUR * 2);

      // Factor 0.5 -> 1 * 60,000 * 0.5 = 30,000
      expect(getItemTokenCommitment(itemWithoutEstimate, 0.5)).toBe(Math.round(TOKEN_RATE_PER_HOUR * 0.5));
    });

    it('applies item-level process_efficiency_factor and neglect_multiplier to the 1-hour fallback', () => {
      const itemWithMetaFactor = {
        id: 'item-2',
        title: 'Unestimated with neglect',
        metadata: {
          neglect_multiplier: 1.5,
          process_efficiency_factor: 2.0,
        },
      };

      // 1 hr * 60,000 * 1.5 * 2.0 = 180,000
      expect(getItemTokenCommitment(itemWithMetaFactor, 1.0)).toBe(180000);
    });
  });

  describe('BUG-TRK-PROJECT-MOVE-304: Bumping projects.updated_at on source and destination projects', () => {
    it('updates projects.updated_at for both source and destination projects during reassignWorkItemProject', async () => {
      const tenantId = '00000000-0000-0000-0000-000000000001';
      const targetItem = {
        id: 'item-epic-1',
        tenant_id: tenantId,
        project_id: 'proj-source',
        parent_id: null,
        item_type: 'epic',
        status: 'not_started',
      };

      const projectUpdates: any[] = [];
      const itemUpdates: any[] = [];

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col, val) => {
                if (col === 'id') {
                  return {
                    single: vi.fn().mockResolvedValue({ data: targetItem, error: null }),
                  };
                }
                return {
                  eq: vi.fn().mockResolvedValue({ data: [], error: null }),
                };
              }),
            })),
            update: vi.fn((fields) => {
              itemUpdates.push(fields);
              return {
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
                in: vi.fn().mockResolvedValue({ data: null, error: null }),
              };
            }),
          } as any;
        }

        if (table === 'tenant_members') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }),
                })),
              })),
            })),
          } as any;
        }

        if (table === 'projects') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'proj-dest', slug: 'dest-proj', name: 'Dest Project', settings: {} },
                    error: null,
                  }),
                })),
              })),
            })),
            update: vi.fn((fields) => ({
              in: vi.fn((col, ids) => {
                projectUpdates.push({ fields, ids });
                return {
                  eq: vi.fn().mockResolvedValue({ data: null, error: null }),
                };
              }),
            })),
          } as any;
        }

        if (table === 'audit_logs') {
          return {
            update: vi.fn(() => ({
              in: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          } as any;
        }

        return {} as any;
      });

      const res = await reassignWorkItemProject('item-epic-1', 'proj-dest');
      expect(res.success).toBe(true);

      // Verify that projects table was updated for both source and destination projects
      expect(projectUpdates.length).toBeGreaterThan(0);
      const affectedProjectIds = projectUpdates[0].ids;
      expect(affectedProjectIds).toContain('proj-source');
      expect(affectedProjectIds).toContain('proj-dest');
    });

    it('updates projects.updated_at for all source projects and the destination project during bulkReassignProjects', async () => {
      const tenantId = '00000000-0000-0000-0000-000000000001';
      const items = [
        { id: 'item-1', tenant_id: tenantId, project_id: 'proj-source-a', parent_id: null, item_type: 'task', status: 'not_started' },
        { id: 'item-2', tenant_id: tenantId, project_id: 'proj-source-b', parent_id: null, item_type: 'task', status: 'not_started' },
      ];

      const projectUpdates: any[] = [];

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({ data: items, error: null }),
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
            update: vi.fn(() => ({
              in: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
          } as any;
        }

        if (table === 'tenant_members') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: { role: 'admin' }, error: null }),
                })),
              })),
            })),
          } as any;
        }

        if (table === 'projects') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'proj-dest', slug: 'dest-proj', name: 'Dest Project', settings: {} },
                    error: null,
                  }),
                })),
              })),
            })),
            update: vi.fn((fields) => ({
              in: vi.fn((col, ids) => {
                projectUpdates.push({ fields, ids });
                return {
                  eq: vi.fn().mockResolvedValue({ data: null, error: null }),
                };
              }),
            })),
          } as any;
        }

        if (table === 'audit_logs') {
          return {
            update: vi.fn(() => ({
              in: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
            insert: vi.fn().mockResolvedValue({ data: null, error: null }),
          } as any;
        }

        return {} as any;
      });

      const res = await bulkReassignProjects(['item-1', 'item-2'], 'proj-dest');
      expect(res.success).toBe(true);

      expect(projectUpdates.length).toBeGreaterThan(0);
      const affectedProjectIds = projectUpdates[0].ids;
      expect(affectedProjectIds).toContain('proj-source-a');
      expect(affectedProjectIds).toContain('proj-source-b');
      expect(affectedProjectIds).toContain('proj-dest');
    });
  });

  describe('saveModalItem optimistic state eviction on project migration', () => {
    it('optimistically evicts the migrated item and its descendants from local React items state', async () => {
      const items: WorkItem[] = [
        {
          id: 'epic-1',
          tenant_id: 't-1',
          project_id: 'proj-source',
          item_type: 'epic',
          title: 'Epic 1',
          status: 'not_started',
          order_index: 1,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {},
        },
        {
          id: 'story-1',
          parent_id: 'epic-1',
          tenant_id: 't-1',
          project_id: 'proj-source',
          item_type: 'story',
          title: 'Story 1',
          status: 'not_started',
          order_index: 2,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {},
        },
        {
          id: 'task-1',
          parent_id: 'story-1',
          tenant_id: 't-1',
          project_id: 'proj-source',
          item_type: 'task',
          title: 'Task 1',
          status: 'not_started',
          order_index: 3,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {},
        },
        {
          id: 'unrelated-task',
          tenant_id: 't-1',
          project_id: 'proj-source',
          item_type: 'task',
          title: 'Unrelated Task',
          status: 'not_started',
          order_index: 4,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          metadata: {},
        },
      ];

      let currentItems = [...items];
      const setItems = vi.fn((updater: any) => {
        if (typeof updater === 'function') {
          currentItems = updater(currentItems);
        } else {
          currentItems = updater;
        }
      });

      const reassignMock = vi.fn().mockResolvedValue({
        success: true,
        updatedCount: 3,
      });

      const broadcastMock = vi.fn();
      const fetchMock = vi.fn();
      const toastMock = vi.fn();

      await saveModalItem({
        itemId: 'epic-1',
        updates: { project_id: 'proj-dest' },
        items,
        editingItem: items[0],
        allProjects: [
          { id: 'proj-source', slug: 'source', name: 'Source' },
          { id: 'proj-dest', slug: 'dest', name: 'Dest' },
        ],
        projectSlug: 'source',
        tenantSlug: 'tenant',
        setItems,
        setEditingItem: vi.fn(),
        setBulkToast: toastMock,
        fetchData: fetchMock,
        reassignProjectFn: reassignMock,
        broadcastMutationFn: broadcastMock,
      });

      // Verify that epic-1 and its descendants story-1 and task-1 were optimistically removed
      expect(currentItems).toHaveLength(1);
      expect(currentItems[0].id).toBe('unrelated-task');
      expect(toastMock).toHaveBeenCalledWith('Moved item and 2 child tasks to Dest');
    });
  });

  describe('PATCH /api/v1/tenants/me surface preference isolation across tabs', () => {
    it('merges disjoint surface preferences without overwriting other surfaces', async () => {
      const { PATCH: tenantMePatch } = await import('@/app/api/v1/tenants/me/route');
      const { NextRequest } = await import('next/server');

      let savedMetadata: any = {
        efficiency_dashboard_preferences: {
          sunshade: {
            schema_version: '1.0',
            widgets: [
              { id: 'stmt_kpi_hours_reclaimed', visible: false, order: 1 }, // statements widget
            ],
            default_views: {
              statements: { defaultTimeframe: 'quarterly', expandProjectAccordions: false },
            },
          },
        },
      };

      const mockSupabase = {
        auth: {
          updateUser: vi.fn().mockImplementation((payload) => {
            savedMetadata = payload.data;
            return Promise.resolve({ data: { user: { id: 'u-1', user_metadata: savedMetadata } }, error: null });
          }),
        },
      };

      const { createServerClient } = await import('@/lib/supabase-server');
      vi.mocked(createServerClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: {
              user: {
                id: 'u-1',
                email: 'test@sunshade.icu',
                user_metadata: savedMetadata,
              },
            },
            error: null,
          }),
          updateUser: mockSupabase.auth.updateUser,
        },
      } as any);

      // Tab 2 edits telemetry surface: sets telemetry default views and a telemetry widget
      const patchReq = new NextRequest('http://localhost:3000/api/v1/tenants/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-slug': 'sunshade',
        },
        body: JSON.stringify({
          tenant_slug: 'sunshade',
          surface: 'telemetry',
          efficiency_dashboard_preferences: {
            schema_version: '1.0',
            widgets: [
              { id: 'tel_kpi_wip_saturation', visible: true, order: 1 }, // telemetry widget
            ],
            default_views: {
              telemetry: { defaultPivot: 'project_swimlanes', defaultRefreshIntervalMs: 30000 },
            },
          },
        }),
      });

      const res = await tenantMePatch(patchReq);
      expect(res.status).toBe(200);

      // Verify that Tab 1's statements preferences and Tab 2's telemetry preferences both coexist!
      const mergedPrefs = savedMetadata.efficiency_dashboard_preferences.sunshade;
      expect(mergedPrefs.default_views.statements.defaultTimeframe).toBe('quarterly');
      expect(mergedPrefs.default_views.telemetry.defaultPivot).toBe('project_swimlanes');
      expect(mergedPrefs.widgets.some((w: any) => w.id === 'stmt_kpi_hours_reclaimed')).toBe(true);
      expect(mergedPrefs.widgets.some((w: any) => w.id === 'tel_kpi_wip_saturation')).toBe(true);
    });
  });
});
