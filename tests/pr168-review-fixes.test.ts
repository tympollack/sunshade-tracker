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
              statements: { defaultTimeframe: 'quarter', expandProjectAccordions: false },
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

      const { createServerClient, createServiceClient } = await import('@/lib/supabase-server');
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

      vi.mocked(createServiceClient).mockReturnValue({
        auth: {
          admin: {
            getUserById: vi.fn().mockImplementation(() =>
              Promise.resolve({
                data: {
                  user: {
                    id: 'u-1',
                    user_metadata: savedMetadata,
                  },
                },
                error: null,
              })
            ),
          },
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
      expect(mergedPrefs.default_views.statements.defaultTimeframe).toBe('quarter');
      expect(mergedPrefs.default_views.telemetry.defaultPivot).toBe('project_swimlanes');
      expect(mergedPrefs.widgets.some((w: any) => w.id === 'stmt_kpi_hours_reclaimed')).toBe(true);
      expect(mergedPrefs.widgets.some((w: any) => w.id === 'tel_kpi_wip_saturation')).toBe(true);
    });

    it('rejects invalid view or widget schemas with 400 during surface updates', async () => {
      const { PATCH: tenantMePatch } = await import('@/app/api/v1/tenants/me/route');
      const { NextRequest } = await import('next/server');

      let savedMetadata: any = {
        efficiency_dashboard_preferences: {
          sunshade: {
            schema_version: '1.0',
            widgets: [
              { id: 'stmt_kpi_hours_reclaimed', visible: false, order: 1 },
            ],
            default_views: {},
          },
        },
      };

      const { createServerClient, createServiceClient } = await import('@/lib/supabase-server');
      vi.mocked(createServerClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'u-1', user_metadata: savedMetadata } },
            error: null,
          }),
          updateUser: vi.fn().mockResolvedValue({ data: null, error: null }),
        },
      } as any);
      vi.mocked(createServiceClient).mockReturnValue({
        auth: {
          admin: {
            getUserById: vi.fn().mockImplementation(() =>
              Promise.resolve({
                data: { user: { id: 'u-1', user_metadata: savedMetadata } },
                error: null,
              })
            ),
          },
        },
      } as any);

      // Send invalid widget ID on surface update
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
              { id: 'invalid_malicious_widget_id', visible: true, order: 1 },
            ],
          },
        }),
      });

      const res = await tenantMePatch(patchReq);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Invalid efficiency_dashboard_preferences');
    });

    it('clears all surface preferences when surface is all or omitted with null preferences', async () => {
      const { PATCH: tenantMePatch } = await import('@/app/api/v1/tenants/me/route');
      const { NextRequest } = await import('next/server');

      let savedMetadata: any = {
        efficiency_dashboard_preferences: {
          sunshade: {
            schema_version: '1.0',
            widgets: [{ id: 'stmt_kpi_hours_reclaimed', visible: false, order: 1 }],
          },
        },
      };

      const { createServerClient, createServiceClient } = await import('@/lib/supabase-server');
      vi.mocked(createServerClient).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'u-1', user_metadata: savedMetadata } },
            error: null,
          }),
          updateUser: vi.fn().mockImplementation((payload) => {
            savedMetadata = payload.data;
            return Promise.resolve({ data: { user: { id: 'u-1', user_metadata: savedMetadata } }, error: null });
          }),
        },
      } as any);
      vi.mocked(createServiceClient).mockReturnValue({
        auth: {
          admin: {
            getUserById: vi.fn().mockImplementation(() =>
              Promise.resolve({
                data: { user: { id: 'u-1', user_metadata: savedMetadata } },
                error: null,
              })
            ),
          },
        },
      } as any);

      const patchReq = new NextRequest('http://localhost:3000/api/v1/tenants/me', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-slug': 'sunshade',
        },
        body: JSON.stringify({
          tenant_slug: 'sunshade',
          surface: 'all',
          efficiency_dashboard_preferences: null,
        }),
      });

      const res = await tenantMePatch(patchReq);
      expect(res.status).toBe(200);
      expect(savedMetadata.efficiency_dashboard_preferences.sunshade).toBeUndefined();
    });
  });

  describe('efficiencyMintBridge retry concurrency and patronage recalculation', () => {
    it('recalculates patronage credit and updates ledger/attestation based on fresh reserved count on conflict', async () => {
      const { mintTokensFromEfficiencyStatement } = await import('@/lib/services/efficiencyMintBridge');

      const artifact = {
        artifact_ref_id: 'TOOL-GH-TRACKER',
        builder_user_id: 'tympollack',
        cumulative_uses: 0,
        survival_ratio: 1.0,
      };

      let attempt = 0;
      const attestations: any[] = [];
      const ledgerRows: any[] = [];

      const makeTable = (table: string) => {
        if (table === 'infrastructure_artifacts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    ...artifact,
                    cumulative_uses: attempt === 0 ? 0 : 1,
                  },
                  error: null,
                }),
              })),
            })),
            update: vi.fn((patch: any) => ({
              eq: vi.fn((col1: string, val1: any) => ({
                eq: vi.fn((col2: string, val2: any) => ({
                  select: vi.fn().mockImplementation(() => {
                    attempt++;
                    if (attempt === 1) {
                      // Simulate concurrent conflict on first attempt
                      return Promise.resolve({ data: [], error: null });
                    }
                    // Success on retry with new base count = 1
                    artifact.cumulative_uses = patch.cumulative_uses;
                    return Promise.resolve({ data: [{ ...artifact }], error: null });
                  }),
                })),
              })),
            })),
          };
        }
        if (table === 'efficiency_mint_attestations') {
          return {
            insert: vi.fn((row: any) => {
              attestations.push(row);
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: row, error: null }),
                })),
              };
            }),
          };
        }
        if (table === 'hub_tokens_ledger') {
          return {
            insert: vi.fn((row: any) => {
              ledgerRows.push(row);
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: row, error: null }),
                })),
              };
            }),
          };
        }
        return {};
      };

      const mockClient = {
        schema: vi.fn(() => ({ from: vi.fn(makeTable) })),
        from: vi.fn(makeTable),
      };

      const res = await mintTokensFromEfficiencyStatement(mockClient, {
        tenantId: 'tenant-1',
        workItemId: 'item-retry-test',
        checkpointHash: 'cp-retry-test',
        grossRealizedValueUsd: 125,
        artifactRefId: 'TOOL-GH-TRACKER',
      });

      expect(res.status).toBe('attested');
      // On retry, base count was 1, so next cumulative uses is 2
      expect(res.cumulativeUses).toBe(2);
      expect(artifact.cumulative_uses).toBe(2);
      // Awarded patronage credit must match use 1 (around 850), NOT initial use 0 (2500)
      expect(res.patronageCreditAwarded).toBe(850);
      expect(attestations[0].patronage_credit_awarded).toBe(850);
      expect(ledgerRows[0].metadata.patronage_credit_awarded).toBe(850);
    });
  });
});
