import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as ingestHandler } from '@/app/api/v1/items/ingest/route';
import { supabaseAdmin } from '@/lib/db';
import { dispatchItemNotifications } from '@/lib/notifications';

vi.mock('@/lib/db', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
  };
});

vi.mock('@/lib/notifications', () => ({
  dispatchItemNotifications: vi.fn().mockResolvedValue(undefined),
  getTenantMemberRecipients: vi.fn().mockResolvedValue({
    resolve: vi.fn((assignee: string) => ({ id: 'resolved-id', email: `${assignee}@example.com` })),
  }),
}));

describe('Headless Ingest API Endpoint (POST /api/v1/items/ingest)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 401 if Authorization header is missing', async () => {
    const req = new NextRequest('http://localhost:3000/api/v1/items/ingest', {
      method: 'POST',
      body: JSON.stringify({ project_slug: 'portfolio', items: [] }),
    });

    const res = await ingestHandler(req);
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toContain('Authorization');
  });

  it('should return 400 if project_slug or items array is empty', async () => {
    // Mock tenant auth
    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { id: 'tenant-123', slug: 'sunshade' },
                error: null,
              }),
            })),
          })),
        } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/items/ingest', {
      method: 'POST',
      headers: { Authorization: 'Bearer tk_live_sunshade_master_key' },
      body: JSON.stringify({ project_slug: '', items: [] }),
    });

    const res = await ingestHandler(req);
    expect(res.status).toBe(400);
  });

  it('should successfully ingest, chain parent references, and upsert items', async () => {
    const mockTenant = { id: '00000000-0000-0000-0000-000000000000', slug: 'sunshade' };
    const mockProject = {
      id: 'proj-123',
      tenant_id: mockTenant.id,
      slug: 'portfolio',
      settings: {
        schema_version: '1.0',
        hierarchy: [
          { type: 'project', label: 'Project', level: 1, allowed_parents: [] },
          { type: 'epic', label: 'Epic', level: 2, allowed_parents: ['project'] },
          { type: 'story', label: 'Story', level: 3, allowed_parents: ['epic'] },
          { type: 'task', label: 'Task', level: 4, allowed_parents: ['story', 'epic'] },
        ],
        statuses: [
          { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
          { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
          { id: 'planned', label: 'Planned', color: '#a855f7', order: 3 },
          { id: 'complete', label: 'Complete', color: '#22c55e', order: 4 },
        ],
      },
    };

    const insertedDbRows: any[] = [];

    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
            })),
          })),
        } as any;
      }

      if (table === 'projects') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
              })),
            })),
          })),
        } as any;
      }

      if (table === 'work_items') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: { order_index: 2000.0 }, error: null }),
                })),
              })),
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'parent-uuid-1' }, error: null }),
              })),
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
          upsert: vi.fn((payload: any) => {
            const row = { id: `item-uuid-${insertedDbRows.length + 1}`, ...payload };
            insertedDbRows.push(row);
            return {
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: row, error: null }),
              })),
            };
          }),
        } as any;
      }

      return {} as any;
    });

    const payload = {
      project_slug: 'portfolio',
      items: [
        {
          external_ref_id: 'SPEC-HUB-11',
          title: 'Deploy Sovereign Event Bus to PatchWork',
          description: 'Auto-generate maintenance tasks from citizen reports.',
          item_type: 'story',
          status: 'in_progress',
          assignee: 'tympollack',
          metadata: {
            complexity: 3,
            priority: 'High',
            origin_agent: 'Gemini Spark',
          },
        },
        {
          external_ref_id: 'TASK-HUB-11-A',
          parent_ref_id: 'SPEC-HUB-11',
          title: 'Implement POST /api/events Webhook Route',
          item_type: 'task',
          status: 'planned',
          metadata: {
            complexity: 1,
          },
        },
      ],
    };

    const req = new NextRequest('http://localhost:3000/api/v1/items/ingest', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tk_live_sunshade_master_key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const res = await ingestHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.count).toBe(2);
    expect(json.items).toHaveLength(2);
    expect(json.items[0].external_ref_id).toBe('SPEC-HUB-11');
    expect(json.items[1].external_ref_id).toBe('TASK-HUB-11-A');
    expect(json.items[1].parent_id).toBe('item-uuid-1'); // Resolved from first item in same batch!
  });

  it('preserves pre-mutation snapshot as beforeItem and supplies tenantSlug and projectSlug to notifications when updating existing item', async () => {
    const mockTenant = { id: 'tenant-abc-123', slug: 'workspace-slug' };
    const mockProject = {
      id: 'proj-xyz-789',
      tenant_id: mockTenant.id,
      slug: 'portfolio-slug',
      settings: {
        statuses: [{ id: 'not_started' }, { id: 'in_progress' }],
        hierarchy: [{ type: 'task' }],
      },
    };

    const priorRow = {
      id: 'item-prior-1',
      project_id: mockProject.id,
      tenant_id: mockTenant.id,
      external_ref_id: 'REF-EXISTING',
      title: 'Prior Title',
      status: 'not_started',
      assignee: 'dev_user_old',
      deleted_at: null,
    };

    const updatedRow = {
      ...priorRow,
      status: 'in_progress',
      assignee: 'dev_user_new',
      updated_at: new Date().toISOString(),
    };

    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
            })),
          })),
        } as any;
      }

      if (table === 'projects') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
                })),
                single: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
              })),
            })),
          })),
        } as any;
      }

      if (table === 'work_items') {
        return {
          select: vi.fn((fields?: string) => {
            if (fields === 'order_index') {
              return {
                eq: vi.fn(() => ({
                  is: vi.fn(() => ({
                    order: vi.fn(() => ({
                      limit: vi.fn(() => ({
                        single: vi.fn().mockResolvedValue({ data: null, error: null }),
                      })),
                    })),
                  })),
                })),
              };
            }
            // Prior items lookup
            return {
              eq: vi.fn(() => ({
                in: vi.fn().mockResolvedValue({ data: [priorRow], error: null }),
              })),
            };
          }),
          upsert: vi.fn(() => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: updatedRow, error: null }),
            })),
          })),
        } as any;
      }

      if (table === 'audit_logs') {
        return {
          insert: vi.fn(() => ({
            select: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        } as any;
      }

      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/items/ingest', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tk_live_sunshade_master_key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project_slug: 'portfolio-slug',
        items: [
          {
            external_ref_id: 'REF-EXISTING',
            title: 'Updated Title',
            status: 'in_progress',
            assignee: 'dev_user_new',
          },
        ],
      }),
    });

    const res = await ingestHandler(req);
    expect(res.status).toBe(200);

    // Verify dispatchItemNotifications was invoked with correct parameters
    expect(dispatchItemNotifications).toHaveBeenCalled();
    const callArgs = vi.mocked(dispatchItemNotifications).mock.calls[0][0];

    // Verify workspace & project slugs
    expect(callArgs.tenantSlug).toBe('workspace-slug');
    expect(callArgs.projectSlug).toBe('portfolio-slug');

    // Verify beforeItem retained the pre-mutation state
    expect(callArgs.beforeItem).toEqual(priorRow);
    expect(callArgs.item.status).toBe('in_progress');
    expect(callArgs.item.assignee).toBe('dev_user_new');
  });
});
