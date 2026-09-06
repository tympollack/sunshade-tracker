import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getItemsHandler, POST as createItemHandler, PATCH as patchItemHandler } from '@/app/api/v1/items/route';
import { supabaseAdmin } from '@/lib/db';

vi.mock('@/lib/db', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
  };
});

describe('Work Items REST Endpoint (/api/v1/items)', () => {
  const mockTenant = { id: '00000000-0000-0000-0000-000000000000', slug: 'sunshade' };
  const mockProject = {
    id: 'proj-123',
    tenant_id: mockTenant.id,
    slug: 'portfolio',
    name: 'Portfolio Project',
    settings: {
      schema_version: '1.0',
      hierarchy: [
        { type: 'epic', label: 'Epic', level: 1, allowed_parents: [] },
        { type: 'task', label: 'Task', level: 2, allowed_parents: ['epic'] },
      ],
      statuses: [
        { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
        { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      ],
      custom_fields: ['complexity'],
    },
  };

  const sampleItems = [
    {
      id: 'epic-1',
      tenant_id: mockTenant.id,
      project_id: mockProject.id,
      parent_id: null,
      external_ref_id: 'EPIC-01',
      item_type: 'epic',
      status: 'in_progress',
      title: 'Infrastructure Setup',
      order_index: 1000.0,
      metadata: {},
    },
    {
      id: 'task-1',
      tenant_id: mockTenant.id,
      project_id: mockProject.id,
      parent_id: 'epic-1',
      external_ref_id: 'TASK-01',
      item_type: 'task',
      status: 'not_started',
      title: 'Configure DB',
      order_index: 2000.0,
      metadata: {},
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return nested tree hierarchy when format=tree', async () => {
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
              eq: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({ data: sampleItems, error: null }),
              })),
            })),
          })),
        } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/items?project_slug=portfolio&format=tree', {
      headers: { Authorization: 'Bearer tk_live_sunshade_master_key' },
    });

    const res = await getItemsHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.format).toBe('tree');
    expect(json.count).toBe(2);
    expect(json.tree).toHaveLength(1); // 1 root epic
    expect(json.tree[0].id).toBe('epic-1');
    expect(json.tree[0].children).toHaveLength(1); // 1 child task
    expect(json.tree[0].children[0].id).toBe('task-1');
  });

  it('should return grouped columns when format=board', async () => {
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
              eq: vi.fn(() => ({
                order: vi.fn().mockResolvedValue({ data: sampleItems, error: null }),
              })),
            })),
          })),
        } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/items?project_slug=portfolio&format=board', {
      headers: { Authorization: 'Bearer tk_live_sunshade_master_key' },
    });

    const res = await getItemsHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.format).toBe('board');
    expect(json.columns).toHaveLength(2);
    expect(json.columns[0].status.id).toBe('not_started');
    expect(json.columns[0].items).toHaveLength(1); // task-1
    expect(json.columns[1].status.id).toBe('in_progress');
    expect(json.columns[1].items).toHaveLength(1); // epic-1
  });

  it('should patch item and recalculate fractional order index', async () => {
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
              single: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
            })),
          })),
        } as any;
      }
      if (table === 'work_items') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: sampleItems[1], error: null }),
              })),
            })),
          })),
          update: vi.fn((updates: any) => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'task-1', ...updates },
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

    const req = new NextRequest('http://localhost:3000/api/v1/items', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer tk_live_sunshade_master_key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 'task-1',
        status: 'in_progress',
        prev_order: 1000.0,
        next_order: 2000.0,
      }),
    });

    const res = await patchItemHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.item.status).toBe('in_progress');
    expect(json.item.order_index).toBe(1500.0); // Fractional midpoint calculation
  });

  it('should persist external_ref_id on PATCH and reject duplicate in same project', async () => {
    const fromMock = vi.mocked(supabaseAdmin.from);
    let selectCount = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === 'tenants') {
        const b: any = { eq: vi.fn(() => b), single: vi.fn().mockResolvedValue({ data: mockTenant, error: null }) };
        return { select: vi.fn(() => b) } as any;
      }
      if (table === 'projects') {
        const b: any = { eq: vi.fn(() => b), single: vi.fn().mockResolvedValue({ data: mockProject, error: null }) };
        return { select: vi.fn(() => b) } as any;
      }
      if (table === 'work_items') {
        return {
          select: vi.fn(() => {
            selectCount++;
            if (selectCount === 1) {
              const b: any = {
                eq: vi.fn(() => b),
                single: vi.fn().mockResolvedValue({ data: sampleItems[1], error: null }),
              };
              return b;
            }
            const b: any = {
              eq: vi.fn(() => b),
              neq: vi.fn(() => b),
              is: vi.fn(() => b),
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'other-item' }, error: null }),
            };
            return b;
          }),
        } as any;
      }
      return {} as any;
    });

    // Attempting to use duplicate reference
    const req = new NextRequest('http://localhost:3000/api/v1/items', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer tk_live_sunshade_master_key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 'task-1',
        external_ref_id: 'DUPLICATE-REF',
      }),
    });

    const res = await patchItemHandler(req);
    expect(res.status).toBe(409);
    const json = await res.json();
    expect(json.error).toContain('already exists');
  });

  it('should reject invalid item_type on PATCH with 422', async () => {
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
              single: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
            })),
          })),
        } as any;
      }
      if (table === 'work_items') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: sampleItems[1], error: null }),
              })),
            })),
          })),
        } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/items', {
      method: 'PATCH',
      headers: {
        Authorization: 'Bearer tk_live_sunshade_master_key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        id: 'task-1',
        item_type: 'nonexistent_type',
      }),
    });

    const res = await patchItemHandler(req);
    expect(res.status).toBe(422);
    const json = await res.json();
    expect(json.error).toContain("Invalid item_type 'nonexistent_type'");
  });
});
