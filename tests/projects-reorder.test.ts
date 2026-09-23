import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/v1/projects/reorder/route';

// Mock DB and Auth
vi.mock('@/lib/auth-guard', () => ({
  authenticate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
  createServiceClient: vi.fn(),
}));

describe('FEAT-TRK-PROJECT-MODAL-REORDER: Projects Reordering API & Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty or invalid reorder payloads with 400', async () => {
    const { authenticate } = await import('@/lib/auth-guard');
    (authenticate as any).mockResolvedValue({
      context: {
        tenant: { id: 'tenant-123', slug: 'sunshade', name: 'SunShade' },
        user: { id: 'user-1' },
        role: 'owner',
      },
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects/reorder', {
      method: 'POST',
      body: JSON.stringify({ items: [] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('non-empty array');
  });

  it('persists project order indices and returns updated count', async () => {
    const { authenticate } = await import('@/lib/auth-guard');
    const { supabaseAdmin } = await import('@/lib/db');

    (authenticate as any).mockResolvedValue({
      context: {
        tenant: { id: 'tenant-123', slug: 'sunshade', name: 'SunShade' },
        user: { id: 'user-1' },
        role: 'owner',
      },
    });

    // Mock supabaseAdmin queries
    const mockSelect = vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { id: 'proj-1', settings: {} },
            { id: 'proj-2', settings: {} },
          ],
          error: null,
        }),
      }),
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }),
    });

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: mockSelect,
          update: mockUpdate,
        };
      }
      return {};
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects/reorder', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          { project_id: 'proj-1', order_index: 1000 },
          { project_id: 'proj-2', order_index: 2000 },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.updated_count).toBe(2);
  });

  it('rejects viewer and member roles with 403 forbidden', async () => {
    const { authenticate } = await import('@/lib/auth-guard');

    (authenticate as any).mockResolvedValue({
      context: {
        tenant: { id: 'tenant-123', slug: 'sunshade', name: 'SunShade' },
        user: { id: 'viewer-1' },
        role: 'viewer',
      },
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects/reorder', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ project_id: 'proj-1', order_index: 1000 }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.error).toContain('Only workspace owners and admins');

    (authenticate as any).mockResolvedValue({
      context: {
        tenant: { id: 'tenant-123', slug: 'sunshade', name: 'SunShade' },
        user: { id: 'member-1' },
        role: 'member',
      },
    });

    const res2 = await POST(req);
    expect(res2.status).toBe(403);
  });

  it('returns 500 when all project updates fail', async () => {
    const { authenticate } = await import('@/lib/auth-guard');
    const { supabaseAdmin } = await import('@/lib/db');

    (authenticate as any).mockResolvedValue({
      context: {
        tenant: { id: 'tenant-123', slug: 'sunshade', name: 'SunShade' },
        user: { id: 'user-1' },
        role: 'owner',
      },
    });

    const mockSelect = vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [{ id: 'proj-1', settings: {} }],
          error: null,
        }),
      }),
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Database write failed' },
        }),
      }),
    });

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: mockSelect,
          update: mockUpdate,
        };
      }
      return {};
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects/reorder', {
      method: 'POST',
      body: JSON.stringify({
        items: [{ project_id: 'proj-1', order_index: 1000 }],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('Failed to persist complete project order');
  });

  it('returns 500 when partial reorder occurs (e.g. 1 of 2 project updates fails)', async () => {
    const { authenticate } = await import('@/lib/auth-guard');
    const { supabaseAdmin } = await import('@/lib/db');

    (authenticate as any).mockResolvedValue({
      context: {
        tenant: { id: 'tenant-123', slug: 'sunshade', name: 'SunShade' },
        user: { id: 'user-1' },
        role: 'owner',
      },
    });

    const mockSelect = vi.fn().mockReturnValue({
      in: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: [
            { id: 'proj-1', settings: {} },
            { id: 'proj-2', settings: {} },
          ],
          error: null,
        }),
      }),
    });

    // proj-1 succeeds, proj-2 fails
    const mockUpdate = vi.fn().mockImplementation((data: any) => ({
      eq: vi.fn().mockImplementation((field: string, val: string) => ({
        eq: vi.fn().mockImplementation(() => {
          if (val === 'proj-2') {
            return Promise.resolve({ data: null, error: { message: 'Write lock timeout' } });
          }
          return Promise.resolve({ data: null, error: null });
        }),
      })),
    }));

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: mockSelect,
          update: mockUpdate,
        };
      }
      return {};
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects/reorder', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          { project_id: 'proj-1', order_index: 1000 },
          { project_id: 'proj-2', order_index: 2000 },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.error).toContain('1 of 2 projects updated successfully');
  });

  it('GET /api/v1/tenants/me falls back gracefully to fetch projects when order_index column does not exist', async () => {
    const { createServerClient, createServiceClient } = await import('@/lib/supabase-server');
    const { GET: getTenantsMe } = await import('@/app/api/v1/tenants/me/route');

    (createServerClient as any).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: 'user-1', email: 'test@example.com' } },
          error: null,
        }),
      },
    });

    const mockService = {
      from: vi.fn((table: string) => {
        if (table === 'tenant_members') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  order: vi.fn().mockResolvedValue({
                    data: [
                      {
                        role: 'owner',
                        created_at: '2026-01-01',
                        tenants: {
                          id: 't-1',
                          slug: 'sunshade',
                          name: 'SunShade',
                          tier: 'pro',
                          owner_id: 'user-1',
                          created_at: '2026-01-01',
                        },
                      },
                    ],
                    error: null,
                  }),
                })),
              })),
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          };
        }
        if (table === 'projects') {
          return {
            select: vi.fn((fields: string) => ({
              in: vi.fn(() => ({
                is: vi.fn(() => ({
                  order: vi.fn().mockImplementation(() => {
                    if (fields.includes('order_index')) {
                      // Simulate column does not exist error on database
                      return Promise.resolve({
                        data: null,
                        error: { message: 'column projects.order_index does not exist' },
                      });
                    }
                    return Promise.resolve({
                      data: [
                        {
                          id: 'proj-b',
                          tenant_id: 't-1',
                          slug: 'proj-b',
                          name: 'Project B',
                          settings: { order_index: 2000 },
                          created_at: '2026-01-02',
                        },
                        {
                          id: 'proj-a',
                          tenant_id: 't-1',
                          slug: 'proj-a',
                          name: 'Project A',
                          settings: { order_index: 1000 },
                          created_at: '2026-01-01',
                        },
                      ],
                      error: null,
                    });
                  }),
                })),
              })),
            })),
          };
        }
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          })),
        };
      }),
    };

    (createServiceClient as any).mockReturnValue(mockService);

    const req = new NextRequest('http://localhost:3000/api/v1/tenants/me');
    const res = await getTenantsMe(req);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.workspaces).toHaveLength(1);
    expect(json.workspaces[0].projects).toHaveLength(2);
    // Order should be sorted by settings.order_index: proj-a (1000) then proj-b (2000)
    expect(json.workspaces[0].projects[0].slug).toBe('proj-a');
    expect(json.workspaces[0].projects[1].slug).toBe('proj-b');
  });
});
