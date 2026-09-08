import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  GET as bulkGetHandler,
  POST as bulkCreateHandler,
  PATCH as bulkUpdateHandler,
  DELETE as bulkDeleteHandler,
} from '@/app/api/v1/items/bulk/route';
import {
  GET as itemsGetHandler,
  POST as itemsPostHandler,
  PATCH as itemsPatchHandler,
  DELETE as itemsDeleteHandler,
} from '@/app/api/v1/items/route';
import { supabaseAdmin } from '@/lib/db';
import { MAX_BULK_ITEMS } from '@/lib/bulk-items';

vi.mock('@/lib/db', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
  };
});

describe('Bulk Work Items API (/api/v1/items/bulk & /api/v1/items)', () => {
  const mockTenant = { id: '00000000-0000-0000-0000-000000000000', slug: 'sunshade' };
  const mockProject = {
    id: 'proj-123',
    tenant_id: mockTenant.id,
    slug: 'sunshade-tracker',
    name: 'SunShade Tracker',
    settings: {
      schema_version: '1.0',
      hierarchy: [
        { type: 'epic', label: 'Epic', level: 0, allowed_parents: [] },
        { type: 'story', label: 'Story', level: 1, allowed_parents: ['epic'] },
        { type: 'task', label: 'Task', level: 2, allowed_parents: ['story'] },
      ],
      statuses: [
        { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 0 },
        { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 1 },
        { id: 'complete', label: 'Complete', color: '#10b981', order: 2 },
      ],
      custom_fields: [],
    },
  };

  const sampleItems = [
    {
      id: '11111111-1111-1111-1111-111111111111',
      tenant_id: mockTenant.id,
      project_id: mockProject.id,
      parent_id: null,
      external_ref_id: 'TASK-101',
      item_type: 'task',
      status: 'not_started',
      title: 'Bulk Item 1',
      order_index: 1000.0,
      metadata: { priority: 'High' },
    },
    {
      id: '22222222-2222-2222-2222-222222222222',
      tenant_id: mockTenant.id,
      project_id: mockProject.id,
      parent_id: null,
      external_ref_id: 'TASK-102',
      item_type: 'task',
      status: 'not_started',
      title: 'Bulk Item 2',
      order_index: 2000.0,
      metadata: { priority: 'Medium' },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setupAuthMock() {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
        })),
      })),
    };
  }

  function setupProjectMock(proj: any = mockProject) {
    return {
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: proj, error: null }),
            })),
            maybeSingle: vi.fn().mockResolvedValue({ data: proj, error: null }),
          })),
          is: vi.fn(() => ({
            maybeSingle: vi.fn().mockResolvedValue({ data: proj, error: null }),
          })),
          maybeSingle: vi.fn().mockResolvedValue({ data: proj, error: null }),
        })),
      })),
    };
  }

  describe('GET /api/v1/items/bulk (Bulk Retrieval)', () => {
    it('retrieves multiple items by comma-separated ids', async () => {
      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  in: vi.fn(() => ({
                    order: vi.fn().mockResolvedValue({ data: sampleItems, error: null }),
                  })),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const req = new NextRequest(
        `http://localhost:3000/api/v1/items/bulk?ids=${sampleItems[0].id},${sampleItems[1].id}`,
        { headers: { Authorization: 'Bearer test_key' } }
      );

      const res = await bulkGetHandler(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.count).toBe(2);
      expect(body.items).toHaveLength(2);
      expect(body.items[0].id).toBe(sampleItems[0].id);
    });

    it('supports ids parameter on standard /api/v1/items endpoint (dual-compatibility)', async () => {
      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  in: vi.fn(() => ({
                    order: vi.fn().mockResolvedValue({ data: sampleItems, error: null }),
                  })),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const req = new NextRequest(
        `http://localhost:3000/api/v1/items?ids=${sampleItems[0].id},${sampleItems[1].id}`,
        { headers: { Authorization: 'Bearer test_key' } }
      );

      const res = await itemsGetHandler(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.count).toBe(2);
      expect(body.items).toHaveLength(2);
    });

    it('rejects bulk get when requested ids exceed MAX_BULK_ITEMS', async () => {
      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        return {} as any;
      });

      const excessIds = Array.from({ length: MAX_BULK_ITEMS + 1 }, (_, i) => `id-${i}`).join(',');
      const req = new NextRequest(
        `http://localhost:3000/api/v1/items/bulk?ids=${excessIds}`,
        { headers: { Authorization: 'Bearer test_key' } }
      );

      const res = await bulkGetHandler(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain(`limited to a maximum of ${MAX_BULK_ITEMS} items`);
    });

    it('returns 404 when project_slug does not resolve', async () => {
      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        if (table === 'projects') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  })),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const req = new NextRequest(
        'http://localhost:3000/api/v1/items/bulk?refs=TASK-101&project_slug=nonexistent-project',
        { headers: { Authorization: 'Bearer test_key' } }
      );

      const res = await bulkGetHandler(req);
      expect(res.status).toBe(404);
      const body = await res.json();
      expect(body.error).toContain("Project with slug 'nonexistent-project' not found");
    });
  });

  describe('POST /api/v1/items/bulk (Bulk Creation)', () => {
    it('creates multiple items in a single request', async () => {
      const createdItems = [
        { ...sampleItems[0], id: 'new-1', title: 'Created 1' },
        { ...sampleItems[1], id: 'new-2', title: 'Created 2' },
      ];

      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        if (table === 'projects') return setupProjectMock() as any;
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: vi.fn().mockResolvedValue({ data: { order_index: 3000.0 }, error: null }),
                    })),
                  })),
                })),
              })),
            })),
            insert: vi.fn((rows: any[]) => ({
              select: vi.fn().mockResolvedValue({ data: createdItems, error: null }),
            })),
          } as any;
        }
        return {} as any;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk', {
        method: 'POST',
        headers: { Authorization: 'Bearer test_key', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_slug: 'sunshade-tracker',
          items: [
            { title: 'Created 1', item_type: 'task', status: 'not_started' },
            { title: 'Created 2', item_type: 'task', status: 'in_progress' },
          ],
        }),
      });

      const res = await bulkCreateHandler(req);
      expect(res.status).toBe(201);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.count).toBe(2);
      expect(body.items).toHaveLength(2);
    });

    it('rejects bulk create when items array is empty or missing title', async () => {
      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        return {} as any;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk', {
        method: 'POST',
        headers: { Authorization: 'Bearer test_key' },
        body: JSON.stringify({ project_slug: 'sunshade-tracker', items: [] }),
      });

      const res = await bulkCreateHandler(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('non-empty "items" array');
    });

    it('rejects bulk create when items array exceeds MAX_BULK_ITEMS', async () => {
      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        return {} as any;
      });

      const excessItems = Array.from({ length: MAX_BULK_ITEMS + 1 }, (_, i) => ({
        title: `Item ${i}`,
      }));

      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk', {
        method: 'POST',
        headers: { Authorization: 'Bearer test_key' },
        body: JSON.stringify({ project_slug: 'sunshade-tracker', items: excessItems }),
      });

      const res = await bulkCreateHandler(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain(`limited to a maximum of ${MAX_BULK_ITEMS} items`);
    });

    it('resolves intra-batch parent_ref_id references (forward references supported)', async () => {
      let insertedRows: any[] = [];
      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        if (table === 'projects') return setupProjectMock() as any;
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                    })),
                  })),
                })),
              })),
            })),
            insert: vi.fn((rows: any[]) => {
              insertedRows = rows;
              return {
                select: vi.fn().mockResolvedValue({ data: rows, error: null }),
              };
            }),
          } as any;
        }
        return {} as any;
      });

      // Child story is declared FIRST (forward reference to EPIC-REF)
      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk', {
        method: 'POST',
        headers: { Authorization: 'Bearer test_key' },
        body: JSON.stringify({
          project_slug: 'sunshade-tracker',
          items: [
            {
              title: 'Child Story',
              item_type: 'story',
              external_ref_id: 'STORY-REF',
              parent_ref_id: 'EPIC-REF',
            },
            {
              title: 'Parent Epic',
              item_type: 'epic',
              external_ref_id: 'EPIC-REF',
            },
          ],
        }),
      });

      const res = await bulkCreateHandler(req);
      expect(res.status).toBe(201);
      expect(insertedRows).toHaveLength(2);

      const childRow = insertedRows.find((r) => r.title === 'Child Story');
      const parentRow = insertedRows.find((r) => r.title === 'Parent Epic');

      expect(childRow).toBeDefined();
      expect(parentRow).toBeDefined();
      // Child's parent_id must match the parent's pre-assigned UUID
      expect(childRow.parent_id).toBe(parentRow.id);
    });

    it('rejects invalid hierarchy nesting on creation with 422', async () => {
      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        if (table === 'projects') return setupProjectMock() as any;
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                    })),
                  })),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      // Trying to make an Epic a child of a Task
      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk', {
        method: 'POST',
        headers: { Authorization: 'Bearer test_key' },
        body: JSON.stringify({
          project_slug: 'sunshade-tracker',
          items: [
            { title: 'Parent Task', item_type: 'task', external_ref_id: 'TASK-1' },
            { title: 'Child Epic', item_type: 'epic', parent_ref_id: 'TASK-1' },
          ],
        }),
      });

      const res = await bulkCreateHandler(req);
      expect(res.status).toBe(422);
    });

    it('creates multiple items via standard /api/v1/items POST with items array (dual-compatibility)', async () => {
      const createdItems = [{ ...sampleItems[0], id: 'new-1' }];

      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        if (table === 'projects') return setupProjectMock() as any;
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  order: vi.fn(() => ({
                    limit: vi.fn(() => ({
                      maybeSingle: vi.fn().mockResolvedValue({ data: null }),
                    })),
                  })),
                })),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn().mockResolvedValue({ data: createdItems, error: null }),
            })),
          } as any;
        }
        return {} as any;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items', {
        method: 'POST',
        headers: { Authorization: 'Bearer test_key' },
        body: JSON.stringify({
          project_slug: 'sunshade-tracker',
          items: [{ title: 'Single in bulk format' }],
        }),
      });

      const res = await itemsPostHandler(req);
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.count).toBe(1);
    });
  });

  describe('PATCH /api/v1/items/bulk (Bulk Update)', () => {
    it('uniformly updates status, assignee, and merges metadata across multiple item IDs (Modality A)', async () => {
      const updatedItem1 = {
        ...sampleItems[0],
        status: 'complete',
        assignee: 'tympollack',
        metadata: { priority: 'High', sprint: 'Sprint 2026-Q3' },
      };
      const updatedItem2 = {
        ...sampleItems[1],
        status: 'complete',
        assignee: 'tympollack',
        metadata: { priority: 'Medium', sprint: 'Sprint 2026-Q3' },
      };

      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        if (table === 'projects') return setupProjectMock() as any;
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn().mockResolvedValue({ data: sampleItems, error: null }),
                })),
              })),
            })),
            update: vi.fn((patch: any) => ({
              eq: vi.fn((col1: string, val1: string) => ({
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({
                      data: val1 === sampleItems[0].id ? updatedItem1 : updatedItem2,
                      error: null,
                    }),
                  })),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer test_key' },
        body: JSON.stringify({
          ids: [sampleItems[0].id, sampleItems[1].id],
          updates: {
            status: 'complete',
            assignee: 'tympollack',
            metadata: { sprint: 'Sprint 2026-Q3' },
          },
        }),
      });

      const res = await bulkUpdateHandler(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.updated_count).toBe(2);
      expect(body.items[0].status).toBe('complete');
      expect(body.items[0].metadata.sprint).toBe('Sprint 2026-Q3');
      // Original metadata key 'priority' is preserved
      expect(body.items[0].metadata.priority).toBe('High');
      expect(body.items[1].metadata.priority).toBe('Medium');
    });

    it('performs heterogeneous updates with distinct item fields (Modality B)', async () => {
      const updatedItem1 = { ...sampleItems[0], status: 'in_progress' };

      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        if (table === 'projects') return setupProjectMock() as any;
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn().mockResolvedValue({ data: [sampleItems[0]], error: null }),
                })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({ data: updatedItem1, error: null }),
                  })),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer test_key' },
        body: JSON.stringify({
          items: [{ id: sampleItems[0].id, status: 'in_progress' }],
        }),
      });

      const res = await bulkUpdateHandler(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.updated_count).toBe(1);
    });

    it('rejects invalid status during bulk update with 422', async () => {
      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        if (table === 'projects') return setupProjectMock() as any;
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn().mockResolvedValue({ data: [sampleItems[0]], error: null }),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer test_key' },
        body: JSON.stringify({
          ids: [sampleItems[0].id],
          updates: { status: 'invalid_status_xyz' },
        }),
      });

      const res = await bulkUpdateHandler(req);
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.error).toContain("invalid status 'invalid_status_xyz'");
    });

    it('rejects self-parenting during bulk update with 400', async () => {
      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        if (table === 'projects') return setupProjectMock() as any;
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn().mockResolvedValue({ data: [sampleItems[0]], error: null }),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer test_key' },
        body: JSON.stringify({
          ids: [sampleItems[0].id],
          updates: { parent_id: sampleItems[0].id },
        }),
      });

      const res = await bulkUpdateHandler(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('cannot be its own parent');
    });

    it('rejects bulk update when IDs array exceeds MAX_BULK_ITEMS', async () => {
      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        return {} as any;
      });

      const excessIds = Array.from({ length: MAX_BULK_ITEMS + 1 }, (_, i) => `id-${i}`);
      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer test_key' },
        body: JSON.stringify({
          ids: excessIds,
          updates: { status: 'complete' },
        }),
      });

      const res = await bulkUpdateHandler(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain(`limited to a maximum of ${MAX_BULK_ITEMS} items`);
    });

    it('supports bulk update on standard /api/v1/items PATCH (dual-compatibility)', async () => {
      const updatedItem = { ...sampleItems[0], status: 'complete' };

      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        if (table === 'projects') return setupProjectMock() as any;
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              in: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn().mockResolvedValue({ data: [sampleItems[0]], error: null }),
                })),
              })),
            })),
            update: vi.fn(() => ({
              in: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn(() => ({
                    select: vi.fn().mockResolvedValue({ data: [updatedItem], error: null }),
                  })),
                })),
              })),
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({ data: updatedItem, error: null }),
                  })),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items', {
        method: 'PATCH',
        headers: { Authorization: 'Bearer test_key' },
        body: JSON.stringify({
          ids: [sampleItems[0].id],
          updates: { status: 'complete' },
        }),
      });

      const res = await itemsPatchHandler(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.updated_count).toBe(1);
    });
  });

  describe('DELETE /api/v1/items/bulk (Bulk Soft-Deletion)', () => {
    it('soft-deletes multiple items by ID array', async () => {
      const deletedRows = [
        { id: sampleItems[0].id, deleted_at: new Date().toISOString() },
        { id: sampleItems[1].id, deleted_at: new Date().toISOString() },
      ];

      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        if (table === 'work_items') {
          return {
            update: vi.fn(() => ({
              in: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn(() => ({
                    select: vi.fn().mockResolvedValue({ data: deletedRows, error: null }),
                  })),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test_key' },
        body: JSON.stringify({ ids: [sampleItems[0].id, sampleItems[1].id] }),
      });

      const res = await bulkDeleteHandler(req);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.deleted_count).toBe(2);
      expect(body.deleted_ids).toEqual([sampleItems[0].id, sampleItems[1].id]);
    });

    it('rejects bulk delete when ids exceed MAX_BULK_ITEMS', async () => {
      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        return {} as any;
      });

      const excessIds = Array.from({ length: MAX_BULK_ITEMS + 1 }, (_, i) => `id-${i}`);
      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test_key' },
        body: JSON.stringify({ ids: excessIds }),
      });

      const res = await bulkDeleteHandler(req);
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toContain(`limited to a maximum of ${MAX_BULK_ITEMS} items`);
    });

    it('supports bulk soft-delete on standard /api/v1/items DELETE (dual-compatibility)', async () => {
      const deletedRows = [{ id: sampleItems[0].id, deleted_at: new Date().toISOString() }];

      const fromMock = vi.mocked(supabaseAdmin.from);
      fromMock.mockImplementation((table: string) => {
        if (table === 'tenants') return setupAuthMock() as any;
        if (table === 'work_items') {
          return {
            update: vi.fn(() => ({
              in: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn(() => ({
                    select: vi.fn().mockResolvedValue({ data: deletedRows, error: null }),
                  })),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items', {
        method: 'DELETE',
        headers: { Authorization: 'Bearer test_key' },
        body: JSON.stringify({ ids: [sampleItems[0].id] }),
      });

      const res = await itemsDeleteHandler(req);
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.success).toBe(true);
      expect(body.deleted_count).toBe(1);
    });
  });
});
