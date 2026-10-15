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

  it('should accept and persist direct order_index on PATCH', async () => {
    const fromMock = vi.mocked(supabaseAdmin.from);
    let capturedUpdates: any = null;
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
          update: vi.fn((updates: any) => {
            capturedUpdates = updates;
            return {
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
            };
          }),
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
        order_index: 3500.0,
      }),
    });

    const res = await patchItemHandler(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.item.order_index).toBe(3500.0);
    expect(capturedUpdates.order_index).toBe(3500.0);
  });

  it('should accept and persist direct order_index on POST', async () => {
    const fromMock = vi.mocked(supabaseAdmin.from);
    let capturedPayload: any = null;
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
        const b: any = {
          eq: vi.fn(() => b),
          single: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
        };
        return {
          select: vi.fn(() => b),
        } as any;
      }
      if (table === 'work_items') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: { item_type: 'epic' }, error: null }),
              })),
            })),
          })),
          insert: vi.fn((payload: any) => {
            capturedPayload = payload;
            return {
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'new-task-1', ...payload },
                  error: null,
                }),
              })),
            };
          }),
        } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/items', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tk_live_sunshade_master_key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project_id: mockProject.id,
        parent_id: 'epic-1',
        title: 'New Subtask',
        item_type: 'task',
        external_ref_id: 'TASK-99',
        order_index: 2500.0,
      }),
    });

    const res = await createItemHandler(req);
    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.item.order_index).toBe(2500.0);
    expect(capturedPayload.order_index).toBe(2500.0);
  });

  it('should return 304 Not Modified when If-Modified-Since is >= MAX(updated_at)', async () => {
    const latestTouchTime = '2026-10-15T02:00:00.000Z';
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
        const queryBuilder: any = {
          select: vi.fn(() => queryBuilder),
          eq: vi.fn(() => queryBuilder),
          order: vi.fn(() => queryBuilder),
          limit: vi.fn(() => queryBuilder),
          single: vi.fn().mockResolvedValue({ data: { updated_at: latestTouchTime }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: { updated_at: latestTouchTime }, error: null }),
        };
        return queryBuilder as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/items?project_slug=portfolio', {
      headers: {
        Authorization: 'Bearer tk_live_sunshade_master_key',
        'If-Modified-Since': new Date(latestTouchTime).toUTCString(),
      },
    });

    const res = await getItemsHandler(req);
    expect(res.status).toBe(304);
    expect(res.headers.get('Last-Modified')).toBe(new Date(latestTouchTime).toUTCString());
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache');
  });

  it('should return delta payload with updated items and deleted_ids when updated_since is provided', async () => {
    const syncTime = '2026-10-15T01:00:00.000Z';
    const deltaRows = [
      {
        id: 'task-1',
        title: 'Updated Task',
        status: 'in_progress',
        updated_at: '2026-10-15T01:30:00.000Z',
        deleted_at: null,
      },
      {
        id: 'task-deleted',
        title: 'Deleted Task',
        status: 'not_started',
        updated_at: '2026-10-15T01:45:00.000Z',
        deleted_at: '2026-10-15T01:45:00.000Z',
      },
    ];

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
        let isTouchQuery = false;
        const queryBuilder: any = {
          select: vi.fn((fields: string) => {
            if (fields === 'updated_at') isTouchQuery = true;
            return queryBuilder;
          }),
          eq: vi.fn(() => queryBuilder),
          gt: vi.fn(() => queryBuilder),
          order: vi.fn(() => {
            if (isTouchQuery) return queryBuilder;
            return Promise.resolve({ data: deltaRows, error: null });
          }),
          limit: vi.fn(() => queryBuilder),
          single: vi.fn().mockResolvedValue({ data: { updated_at: '2026-10-15T01:45:00.000Z' }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: { updated_at: '2026-10-15T01:45:00.000Z' }, error: null }),
        };
        return queryBuilder as any;
      }
      return {} as any;
    });

    const req = new NextRequest(`http://localhost:3000/api/v1/items?project_slug=portfolio&updated_since=${syncTime}`, {
      headers: { Authorization: 'Bearer tk_live_sunshade_master_key' },
    });

    const res = await getItemsHandler(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.is_delta).toBe(true);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].id).toBe('task-1');
    expect(json.deleted_ids).toEqual(['task-deleted']);
    expect(json.latest_at).toBe('2026-10-15T01:45:00.000Z');
    expect(res.headers.get('Last-Modified')).toBe(new Date('2026-10-15T01:45:00.000Z').toUTCString());
    expect(res.headers.get('Cache-Control')).toBe('private, no-cache');
  });

  it('should exclude cold completed items older than 14 days unless include_cold_archive=true', async () => {
    const recentDate = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
    const coldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString(); // 20 days ago

    const itemsWithCold = [
      {
        id: 'task-active',
        status: 'in_progress',
        updated_at: coldDate,
        deleted_at: null,
      },
      {
        id: 'task-recent-done',
        status: 'complete',
        updated_at: recentDate,
        deleted_at: null,
      },
      {
        id: 'task-cold-done',
        status: 'complete',
        updated_at: coldDate,
        deleted_at: null,
      },
    ];

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
        let isTouchQuery = false;
        const queryBuilder: any = {
          select: vi.fn((fields: string) => {
            if (fields === 'updated_at') isTouchQuery = true;
            return queryBuilder;
          }),
          eq: vi.fn(() => queryBuilder),
          is: vi.fn(() => queryBuilder),
          order: vi.fn(() => {
            if (isTouchQuery) return queryBuilder;
            return Promise.resolve({ data: itemsWithCold, error: null });
          }),
          limit: vi.fn(() => queryBuilder),
          single: vi.fn().mockResolvedValue({ data: { updated_at: recentDate }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: { updated_at: recentDate }, error: null }),
        };
        return queryBuilder as any;
      }
      return {} as any;
    });

    // 1. Without include_cold_archive: task-cold-done is filtered out
    const reqDefault = new NextRequest('http://localhost:3000/api/v1/items?project_slug=portfolio', {
      headers: { Authorization: 'Bearer tk_live_sunshade_master_key' },
    });
    const resDefault = await getItemsHandler(reqDefault);
    expect(resDefault.status).toBe(200);
    const jsonDefault = await resDefault.json();
    expect(jsonDefault.items).toHaveLength(2);
    expect(jsonDefault.items.map((i: any) => i.id)).toEqual(['task-active', 'task-recent-done']);
    expect(jsonDefault.cold_count).toBe(1);

    // 2. With include_cold_archive=true: all items returned including cold task
    const reqCold = new NextRequest('http://localhost:3000/api/v1/items?project_slug=portfolio&include_cold_archive=true', {
      headers: { Authorization: 'Bearer tk_live_sunshade_master_key' },
    });
    const resCold = await getItemsHandler(reqCold);
    expect(resCold.status).toBe(200);
    const jsonCold = await resCold.json();
    expect(jsonCold.items).toHaveLength(3);
    expect(jsonCold.cold_count).toBe(0);
  });

  it('should invalidate cache (return 200 instead of 304) when project schema is updated after item touch', async () => {
    const itemTouchTime = '2026-10-15T01:00:00.000Z';
    const projectSchemaTouchTime = '2026-10-15T02:00:00.000Z';
    const clientCachedTime = '2026-10-15T01:30:00.000Z'; // between item touch and schema touch

    const projectWithNewerTouch = {
      ...mockProject,
      updated_at: projectSchemaTouchTime,
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
                single: vi.fn().mockResolvedValue({ data: projectWithNewerTouch, error: null }),
              })),
            })),
          })),
        } as any;
      }
      if (table === 'work_items') {
        let isTouchQuery = false;
        const queryBuilder: any = {
          select: vi.fn((fields: string) => {
            if (fields === 'updated_at') isTouchQuery = true;
            return queryBuilder;
          }),
          eq: vi.fn(() => queryBuilder),
          is: vi.fn(() => queryBuilder),
          order: vi.fn(() => {
            if (isTouchQuery) return queryBuilder;
            return Promise.resolve({ data: sampleItems, error: null });
          }),
          limit: vi.fn(() => queryBuilder),
          single: vi.fn().mockResolvedValue({ data: { updated_at: itemTouchTime }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: { updated_at: itemTouchTime }, error: null }),
        };
        return queryBuilder as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/items?project_slug=portfolio', {
      headers: {
        Authorization: 'Bearer tk_live_sunshade_master_key',
        'If-Modified-Since': new Date(clientCachedTime).toUTCString(),
      },
    });

    const res = await getItemsHandler(req);
    // Since project.updated_at (02:00) > clientCachedTime (01:30), response must NOT be 304
    expect(res.status).toBe(200);
  });

  it('should retain older completed items in main list if associated with an active sprint by name', async () => {
    const coldDate = new Date(Date.now() - 25 * 24 * 60 * 60 * 1000).toISOString(); // 25 days ago
    const projectWithActiveSprint = {
      ...mockProject,
      settings: {
        ...mockProject.settings,
        sprint_settings: {
          sprints: [
            { id: 'sprint-uuid-1', name: 'Sprint Oct 2026', status: 'active', is_active: true },
          ],
        },
      },
    };

    const items = [
      {
        id: 'task-active-sprint-cold',
        status: 'complete',
        updated_at: coldDate,
        deleted_at: null,
        metadata: { sprint: 'Sprint Oct 2026' }, // Matches by sprint NAME
      },
      {
        id: 'task-cold-regular',
        status: 'complete',
        updated_at: coldDate,
        deleted_at: null,
        metadata: { sprint: 'Sprint Sep 2026' }, // Inactive sprint
      },
    ];

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
                single: vi.fn().mockResolvedValue({ data: projectWithActiveSprint, error: null }),
              })),
            })),
          })),
        } as any;
      }
      if (table === 'work_items') {
        let isTouchQuery = false;
        const queryBuilder: any = {
          select: vi.fn((fields: string) => {
            if (fields === 'updated_at') isTouchQuery = true;
            return queryBuilder;
          }),
          eq: vi.fn(() => queryBuilder),
          is: vi.fn(() => queryBuilder),
          order: vi.fn(() => {
            if (isTouchQuery) return queryBuilder;
            return Promise.resolve({ data: items, error: null });
          }),
          limit: vi.fn(() => queryBuilder),
          single: vi.fn().mockResolvedValue({ data: { updated_at: coldDate }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: { updated_at: coldDate }, error: null }),
        };
        return queryBuilder as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/items?project_slug=portfolio', {
      headers: { Authorization: 'Bearer tk_live_sunshade_master_key' },
    });

    const res = await getItemsHandler(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    // task-active-sprint-cold is kept because it belongs to active sprint 'Sprint Oct 2026'
    expect(json.items).toHaveLength(1);
    expect(json.items[0].id).toBe('task-active-sprint-cold');
    expect(json.cold_count).toBe(1); // task-cold-regular was partitioned
  });

  it('should auto-chunk and paginate queries with >1000 items using .range()', async () => {
    // Generate 1250 mock work items
    const largeItemList = Array.from({ length: 1250 }, (_, i) => ({
      id: `task-chunk-${i}`,
      tenant_id: mockTenant.id,
      project_id: mockProject.id,
      title: `Task #${i}`,
      status: 'in_progress',
      order_index: i * 10,
      metadata: {},
      updated_at: new Date().toISOString(),
      deleted_at: null,
    }));

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
        let isTouchQuery = false;
        const queryBuilder: any = {
          select: vi.fn((fields: string) => {
            if (fields === 'updated_at') isTouchQuery = true;
            return queryBuilder;
          }),
          eq: vi.fn(() => queryBuilder),
          is: vi.fn(() => queryBuilder),
          order: vi.fn(() => queryBuilder),
          limit: vi.fn(() => queryBuilder),
          single: vi.fn().mockResolvedValue({ data: { updated_at: new Date().toISOString() }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: { updated_at: new Date().toISOString() }, error: null }),
          range: vi.fn((from: number, to: number) => {
            const slice = largeItemList.slice(from, to + 1);
            return Promise.resolve({ data: slice, error: null });
          }),
        };
        return queryBuilder as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/items?project_slug=portfolio', {
      headers: { Authorization: 'Bearer tk_live_sunshade_master_key' },
    });

    const res = await getItemsHandler(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.count).toBe(1250);
    expect(json.items).toHaveLength(1250);
    expect(json.items[0].id).toBe('task-chunk-0');
    expect(json.items[1249].id).toBe('task-chunk-1249');
  });

  it('should filter items by sprint_id and return all sprint items without cold exclusion', async () => {
    const sprintDate = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days ago
    const items = [
      {
        id: 'task-target-sprint-done',
        status: 'complete',
        updated_at: sprintDate,
        deleted_at: null,
        metadata: { sprint_id: 'sprint-q3' },
      },
      {
        id: 'task-other-sprint',
        status: 'complete',
        updated_at: sprintDate,
        deleted_at: null,
        metadata: { sprint_id: 'sprint-q2' },
      },
    ];

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
        let isTouchQuery = false;
        const queryBuilder: any = {
          select: vi.fn((fields: string) => {
            if (fields === 'updated_at') isTouchQuery = true;
            return queryBuilder;
          }),
          eq: vi.fn(() => queryBuilder),
          is: vi.fn(() => queryBuilder),
          order: vi.fn(() => {
            if (isTouchQuery) return queryBuilder;
            return Promise.resolve({ data: items, error: null });
          }),
          limit: vi.fn(() => queryBuilder),
          single: vi.fn().mockResolvedValue({ data: { updated_at: sprintDate }, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: { updated_at: sprintDate }, error: null }),
        };
        return queryBuilder as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/items?project_slug=portfolio&sprint_id=sprint-q3', {
      headers: { Authorization: 'Bearer tk_live_sunshade_master_key' },
    });

    const res = await getItemsHandler(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.items).toHaveLength(1);
    expect(json.items[0].id).toBe('task-target-sprint-done');
    expect(json.cold_count).toBe(0);
  });
});
