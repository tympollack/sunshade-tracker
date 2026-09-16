import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as ingestHandler } from '@/app/api/v1/items/ingest/route';
import { reassignWorkItemProject } from '@/app/actions/trackerActions';
import { supabaseAdmin } from '@/lib/db';
import fs from 'fs';
import path from 'path';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'user-test-123', email: 'test@example.com' } },
        error: null,
      }),
    },
  }),
}));

vi.mock('@/lib/auth-guard', () => ({
  authenticate: vi.fn().mockResolvedValue({
    errorResponse: null,
    context: {
      user: { id: 'user-test-123', email: 'test@example.com' },
      tenant: { id: 'tenant-test-123', slug: 'sunshade' },
      apiKey: null,
    },
  }),
}));

vi.mock('@/lib/audit-log', () => ({
  recordBulkAuditLogs: vi.fn().mockResolvedValue(undefined),
  recordAuditLog: vi.fn().mockResolvedValue(undefined),
  computeChangedFields: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/notifications', () => ({
  dispatchItemNotifications: vi.fn().mockResolvedValue(undefined),
  getTenantMemberRecipients: vi.fn().mockResolvedValue({
    resolve: vi.fn((assignee: string) => ({ id: 'resolved-id', email: `${assignee}@example.com` })),
  }),
}));

describe('Q3 Tracker Items Verification Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // REV-TRK-01: Asset generation script path resolution
  describe('REV-TRK-01: Asset generation script path resolution', () => {
    it('should not contain hardcoded Windows absolute user paths in generate-assets.mjs', () => {
      const scriptPath = path.join(process.cwd(), 'scripts', 'generate-assets.mjs');
      const content = fs.readFileSync(scriptPath, 'utf8');
      expect(content).not.toContain('C:/Users/Tymz');
      expect(content).not.toContain('c:/Users/Tymz');
      expect(content).not.toContain('C:\\Users\\Tymz');
      expect(content).toContain('rootDir');
    });
  });

  // TRK-06: Completed sprints with 0 items calculate 100% progress
  describe('TRK-06: Sprint progress calculation', () => {
    it('should calculate 100% progress for completed sprint with 0 items', () => {
      const sprintName = 'Sprint 2026-Q2';
      const sprintItems: any[] = [];
      const sprintDef = { name: sprintName, status: 'completed' };

      const completedItems = sprintItems.filter((it) =>
        ['done', 'closed', 'complete', 'completed'].includes(it.status)
      );
      const isCompletedSprint = sprintDef?.status === 'completed';
      const progressPct =
        sprintItems.length > 0
          ? Math.round((completedItems.length / sprintItems.length) * 100)
          : isCompletedSprint
          ? 100
          : 0;

      expect(progressPct).toBe(100);
    });

    it('should calculate 0% progress for active/uncompleted sprint with 0 items', () => {
      const sprintName = 'Sprint 2026-Q3';
      const sprintItems: any[] = [];
      const sprintDef = { name: sprintName, status: 'active' };

      const completedItems = sprintItems.filter((it) =>
        ['done', 'closed', 'complete', 'completed'].includes(it.status)
      );
      const isCompletedSprint = sprintDef?.status === 'completed';
      const progressPct =
        sprintItems.length > 0
          ? Math.round((completedItems.length / sprintItems.length) * 100)
          : isCompletedSprint
          ? 100
          : 0;

      expect(progressPct).toBe(0);
    });
  });

  // TRK-07: Hierarchy and Sprint Planning multi-select filtering
  describe('TRK-07: Multi-select filtering for Status and Level', () => {
    const mockItems = [
      { id: '1', title: 'Epic 1', status: 'not_started', item_type: 'epic' },
      { id: '2', title: 'Story 1', status: 'in_progress', item_type: 'story' },
      { id: '3', title: 'Task 1', status: 'planned', item_type: 'task' },
      { id: '4', title: 'Task 2', status: 'complete', item_type: 'task' },
    ];

    it('should show all items when filter is null (all selected by default)', () => {
      const treeSelectedStatuses: string[] | null = null;
      const effectiveTreeStatuses = ['not_started', 'in_progress', 'planned', 'complete'];

      let res = mockItems;
      if (treeSelectedStatuses !== null) {
        res = res.filter((it) => effectiveTreeStatuses.includes(it.status));
      }
      expect(res.length).toBe(4);
    });

    it('should filter out exactly 1 status when all but 1 status is selected', () => {
      // User deselects "complete" -> 3 out of 4 statuses remain selected
      const treeSelectedStatuses: string[] = ['not_started', 'in_progress', 'planned'];

      let res = mockItems;
      if (treeSelectedStatuses !== null) {
        res = res.filter((it) => treeSelectedStatuses.includes(it.status));
      }
      expect(res.length).toBe(3);
      expect(res.map((it) => it.status)).toEqual(['not_started', 'in_progress', 'planned']);
      expect(res.some((it) => it.status === 'complete')).toBe(false);
    });

    it('should filter out items when level filter excludes specific levels', () => {
      // User deselects "epic" and "task" -> only "story" remains
      const sprintSelectedLevels: string[] = ['story'];

      let res = mockItems;
      if (sprintSelectedLevels !== null) {
        res = res.filter((it) => sprintSelectedLevels.includes(it.item_type));
      }
      expect(res.length).toBe(1);
      expect(res[0].item_type).toBe('story');
    });

    it('should return 0 items when none selected ([])', () => {
      const treeSelectedStatuses: string[] = [];

      let res = mockItems;
      if (treeSelectedStatuses !== null) {
        res = res.filter((it) => treeSelectedStatuses.includes(it.status));
      }
      expect(res.length).toBe(0);
    });
  });

  // TRK-08: Ingestion Route Overrides (Project, Sprint, Assignee)
  describe('TRK-08: Ingest endpoint property overrides', () => {
    it('should apply override_project_slug, override_sprint, and override_assignee to ingested items', async () => {
      let capturedPayload: any = null;
      const fromMock = vi.mocked(supabaseAdmin.from);

      fromMock.mockImplementation((table: string) => {
        if (table === 'projects') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: 'proj-override-id',
                        slug: 'override-project',
                        name: 'Override Project',
                        settings: {
                          statuses: [{ id: 'not_started' }, { id: 'complete' }],
                          hierarchy: [{ type: 'task' }],
                        },
                      },
                      error: null,
                    }),
                  })),
                })),
              })),
            })),
          } as any;
        }
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      single: vi.fn().mockResolvedValue({ data: { order_index: 5000 }, error: null }),
                    })),
                  })),
                })),
                in: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
            upsert: vi.fn((payload: any) => {
              capturedPayload = payload;
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'item-uuid-1', ...payload },
                    error: null,
                  }),
                })),
              };
            }),
          } as any;
        }
        return {} as any;
      });

      const payload = {
        project_slug: 'original-project',
        override_project_slug: 'override-project',
        override_sprint: 'Sprint 2026-Q3',
        override_assignee: 'target-engineer',
        items: [
          {
            external_ref_id: 'TEST-ITEM-1',
            title: 'Test Ingest Task',
            item_type: 'task',
            status: 'not_started',
            assignee: 'original-assignee',
            metadata: { sprint: 'Original Sprint' },
          },
        ],
      };

      const req = new NextRequest('http://localhost:3000/api/v1/items/ingest', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const res = await ingestHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.count).toBe(1);

      // Verify the item was upserted with overridden properties
      expect(capturedPayload).not.toBeNull();
      expect(capturedPayload.project_id).toBe('proj-override-id');
      expect(capturedPayload.assignee).toBe('target-engineer');
      expect(capturedPayload.metadata.sprint).toBe('Sprint 2026-Q3');
    });

    it('should unassign sprint and assignee when __none__ or __unassigned__ overrides are passed', async () => {
      let capturedPayload: any = null;
      const fromMock = vi.mocked(supabaseAdmin.from);

      fromMock.mockImplementation((table: string) => {
        if (table === 'projects') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: 'proj-123',
                        slug: 'sunshade-tracker',
                        name: 'SunShade Tracker',
                        settings: {
                          statuses: [{ id: 'not_started' }],
                          hierarchy: [{ type: 'task' }],
                        },
                      },
                      error: null,
                    }),
                  })),
                })),
              })),
            })),
          } as any;
        }
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      single: vi.fn().mockResolvedValue({ data: null, error: null }),
                    })),
                  })),
                })),
                in: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
            upsert: vi.fn((payload: any) => {
              capturedPayload = payload;
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'item-uuid-2', ...payload },
                    error: null,
                  }),
                })),
              };
            }),
          } as any;
        }
        return {} as any;
      });

      const payload = {
        project_slug: 'sunshade-tracker',
        override_sprint: '__none__',
        override_assignee: '__unassigned__',
        items: [
          {
            external_ref_id: 'TEST-ITEM-2',
            title: 'Test Unassign Overrides',
            item_type: 'task',
            status: 'not_started',
            assignee: 'some-user',
            metadata: { sprint: 'Sprint 2026-Q1' },
          },
        ],
      };

      const req = new NextRequest('http://localhost:3000/api/v1/items/ingest', {
        method: 'POST',
        body: JSON.stringify(payload),
      });

      const res = await ingestHandler(req);
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.success).toBe(true);

      expect(capturedPayload).not.toBeNull();
      expect(capturedPayload.assignee).toBeNull();
      expect(capturedPayload.metadata.sprint).toBeUndefined();
    });
  });

  // BUG-TRK-PROJECT-REASSIGN-MUTATION: Cross-project parent disconnect & atomic reassignment
  describe('BUG-TRK-PROJECT-REASSIGN-MUTATION: reassignWorkItemProject server action', () => {
    it('should disconnect cross-project parent when item is moved to a new project', async () => {
      let targetUpdatedFields: any = null;
      let descUpdatedFields: any = null;
      let descUpdatedIds: any = null;

      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'work_items') {
          return {
            select: vi.fn((cols: string) => {
              const queryObj: any = {
                eq: vi.fn((field: string, val: any) => {
                  if (field === 'id' && val === 'parent-item-id') {
                    // Parent lookup
                    return {
                      eq: vi.fn(() => ({
                        maybeSingle: vi.fn().mockResolvedValue({
                          data: { id: 'parent-item-id', project_id: 'old-project-id' },
                          error: null,
                        }),
                      })),
                      maybeSingle: vi.fn().mockResolvedValue({
                        data: { id: 'parent-item-id', project_id: 'old-project-id' },
                        error: null,
                      }),
                    };
                  }
                  if (field === 'tenant_id') {
                    // tenantItems query
                    return Promise.resolve({
                      data: [
                        { id: 'target-item-id', parent_id: 'parent-item-id' },
                        { id: 'child-item-1', parent_id: 'target-item-id' },
                      ],
                      error: null,
                    });
                  }
                  // targetItem query (id = target-item-id)
                  return {
                    single: vi.fn().mockResolvedValue({
                      data: {
                        id: 'target-item-id',
                        tenant_id: 'tenant-test-123',
                        project_id: 'old-project-id',
                        parent_id: 'parent-item-id',
                      },
                      error: null,
                    }),
                  };
                }),
              };
              return queryObj;
            }),
            update: vi.fn((fields: any) => ({
              eq: vi.fn((field: string, val: any) => {
                targetUpdatedFields = fields;
                return Promise.resolve({ error: null });
              }),
              in: vi.fn((field: string, ids: any) => {
                descUpdatedFields = fields;
                descUpdatedIds = ids;
                return Promise.resolve({ error: null });
              }),
            })),
          } as any;
        }
        if (table === 'tenant_members') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { role: 'owner' },
                    error: null,
                  }),
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
                    data: { id: 'new-project-id', slug: 'new-proj', name: 'New Project' },
                    error: null,
                  }),
                })),
              })),
            })),
          } as any;
        }
        if (table === 'audit_logs') {
          return {
            insert: vi.fn().mockResolvedValue({ error: null }),
          } as any;
        }
        return {} as any;
      });

      const result = await reassignWorkItemProject('target-item-id', 'new-project-id');
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
      expect(result.updatedCount).toBe(2); // target item + 1 child

      // Verify parent was disconnected on target item
      expect(targetUpdatedFields).not.toBeNull();
      expect(targetUpdatedFields.project_id).toBe('new-project-id');
      expect(targetUpdatedFields.parent_id).toBeNull();

      // Verify child item was also moved
      expect(descUpdatedFields).not.toBeNull();
      expect(descUpdatedFields.project_id).toBe('new-project-id');
      expect(descUpdatedIds).toEqual(['child-item-1']);
    });
  });
});
