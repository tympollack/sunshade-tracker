import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { authenticateSession } from '@/lib/auth-guard';
import { GET as getTenantsMe } from '@/app/api/v1/tenants/me/route';
import { PATCH as patchTenant } from '@/app/api/v1/tenants/[tenantId]/route';
import { supabaseAdmin } from '@/lib/db';
import { createServerClient, createServiceClient } from '@/lib/supabase-server';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
  createServiceClient: vi.fn(),
}));

describe('Public Demo Workspace Guest Access (TASK-TRK-PUBLIC-DEMO-WORKSPACE)', () => {
  const publicDemoTenant = {
    id: 'demo-tenant-id',
    slug: 'sunshade',
    name: 'SunShade Demo Workspace',
    tier: 'demo',
    owner_id: 'system-owner',
    metadata: { is_public: true },
    created_at: '2026-01-01T00:00:00Z',
    deleted_at: null,
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should grant read-only viewer access to unauthenticated guest on public demo workspace for GET requests', async () => {
    // Unauthenticated SSR client
    vi.mocked(createServerClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('No session') }),
      },
    } as any);

    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockImplementation((table: string) => {
      if (table === 'tenants') {
        const maybeSingleMock = vi.fn().mockResolvedValue({ data: publicDemoTenant, error: null });
        const isMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
        const eqMock = vi.fn(() => ({ is: isMock, maybeSingle: maybeSingleMock }));
        const selectMock = vi.fn(() => ({ eq: eqMock }));
        return { select: selectMock } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/items?tenant_slug=sunshade', {
      method: 'GET',
    });

    const auth = await authenticateSession(req);
    expect(auth.errorResponse).toBeNull();
    expect(auth.context).not.toBeNull();
    expect(auth.context?.tenant.slug).toBe('sunshade');
    expect(auth.context?.role).toBe('viewer');
    expect(auth.context?.userId).toBeNull();
  });

  it('should reject unauthenticated guest mutation requests (POST/PATCH/DELETE) on public workspace with 403 Forbidden', async () => {
    vi.mocked(createServerClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('No session') }),
      },
    } as any);

    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockImplementation((table: string) => {
      if (table === 'tenants') {
        const maybeSingleMock = vi.fn().mockResolvedValue({ data: publicDemoTenant, error: null });
        const isMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
        const eqMock = vi.fn(() => ({ is: isMock, maybeSingle: maybeSingleMock }));
        const selectMock = vi.fn(() => ({ eq: eqMock }));
        return { select: selectMock } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/items?tenant_slug=sunshade', {
      method: 'POST',
      body: JSON.stringify({ title: 'New Item' }),
    });

    const auth = await authenticateSession(req);
    expect(auth.context).toBeNull();
    expect(auth.errorResponse).not.toBeNull();
    expect(auth.errorResponse?.status).toBe(403);
    const json = await auth.errorResponse?.json();
    expect(json.error).toContain('The public demo workspace is read-only');
  });

  it('should return guest workspace in /api/v1/tenants/me for unauthenticated visitors of public workspace', async () => {
    vi.mocked(createServerClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: new Error('No session') }),
      },
    } as any);

    const serviceMock = {
      from: vi.fn((table: string) => {
        if (table === 'tenants') {
          const maybeSingleMock = vi.fn().mockResolvedValue({ data: publicDemoTenant, error: null });
          const isMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
          const eqMock = vi.fn(() => ({ is: isMock, maybeSingle: maybeSingleMock }));
          const selectMock = vi.fn(() => ({ eq: eqMock }));
          return { select: selectMock };
        }
        if (table === 'projects') {
          const orderMock = vi.fn().mockResolvedValue({
            data: [{ id: 'p1', slug: 'demo-proj', name: 'Demo Project' }],
            error: null,
          });
          const isMock = vi.fn(() => ({ order: orderMock }));
          const eqMock = vi.fn(() => ({ is: isMock }));
          const selectMock = vi.fn(() => ({ eq: eqMock }));
          return { select: selectMock };
        }
        return {};
      }),
    };

    vi.mocked(createServiceClient).mockReturnValueOnce(serviceMock as any);

    const req = new NextRequest('http://localhost:3000/api/v1/tenants/me?tenant_slug=sunshade');
    const res = await getTenantsMe(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.is_guest).toBe(true);
    expect(json.user).toBeNull();
    expect(json.workspaces).toHaveLength(1);
    expect(json.workspaces[0].slug).toBe('sunshade');
    expect(json.workspaces[0].role).toBe('viewer');
    expect(json.workspaces[0].projects).toHaveLength(1);
  });

  it('should allow owner/admin to toggle is_public in PATCH /api/v1/tenants/[tenantId]', async () => {
    vi.mocked(createServerClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'owner-id' } }, error: null }),
      },
    } as any);

    const updatedTenantData = {
      ...publicDemoTenant,
      metadata: { is_public: true },
    };

    const serviceMock = {
      from: vi.fn((table: string) => {
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
          };
        }
        if (table === 'tenants') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: publicDemoTenant,
                    error: null,
                  }),
                })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: updatedTenantData,
                    error: null,
                  }),
                })),
              })),
            })),
          };
        }
        return {};
      }),
    };

    vi.mocked(createServiceClient).mockReturnValueOnce(serviceMock as any);

    const req = new NextRequest('http://localhost:3000/api/v1/tenants/demo-tenant-id', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_public: true }),
    });

    const res = await patchTenant(req, { params: Promise.resolve({ tenantId: 'demo-tenant-id' }) });
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.tenant.metadata.is_public).toBe(true);
  });

  it('should reject authenticated viewer mutation requests (POST/PATCH/DELETE) with 403 Forbidden', async () => {
    vi.mocked(createServerClient).mockResolvedValueOnce({
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'authenticated-viewer-id' } }, error: null }),
      },
    } as any);

    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockImplementation((table: string) => {
      if (table === 'tenants') {
        const maybeSingleMock = vi.fn().mockResolvedValue({ data: publicDemoTenant, error: null });
        const isMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
        const eqMock = vi.fn(() => ({ is: isMock, maybeSingle: maybeSingleMock }));
        const selectMock = vi.fn(() => ({ eq: eqMock }));
        return { select: selectMock } as any;
      }
      if (table === 'tenant_members') {
        const maybeSingleMock = vi.fn().mockResolvedValue({
          data: { role: 'viewer', tenants: publicDemoTenant },
          error: null,
        });
        const limitMock = vi.fn(() => ({ maybeSingle: maybeSingleMock }));
        const isMock = vi.fn(() => ({ limit: limitMock, maybeSingle: maybeSingleMock }));
        const eqMock = vi.fn(() => ({ eq: eqMock, is: isMock, limit: limitMock, maybeSingle: maybeSingleMock }));
        const selectMock = vi.fn(() => ({ eq: eqMock }));
        return { select: selectMock } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/items?tenant_slug=sunshade', {
      method: 'POST',
      body: JSON.stringify({ title: 'New Item' }),
    });

    const auth = await authenticateSession(req);
    expect(auth.context).toBeNull();
    expect(auth.errorResponse).not.toBeNull();
    expect(auth.errorResponse?.status).toBe(403);
    const json = await auth.errorResponse?.json();
    expect(json.error).toContain('Workspace viewers have read-only access');
  });
});
