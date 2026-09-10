import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getProjects, DELETE as deleteProject } from '@/app/api/v1/projects/route';
import { POST as restoreProject } from '@/app/api/v1/projects/restore/route';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';

vi.mock('@/lib/db', () => {
  return {
    supabaseAdmin: {
      from: vi.fn(),
    },
  };
});

vi.mock('@/lib/auth-guard', () => {
  return {
    authenticate: vi.fn(),
  };
});

describe('Project Archival & Soft Deletion Lifecycle (TASK-TRK-PROJECT-ARCHIVE & TASK-TRK-PROJECT-ARCHIVE-VIEW)', () => {
  const mockTenant = {
    id: 'tenant-123',
    slug: 'sunshade',
    name: 'SunShade Workspace',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should allow owner/admin to soft-delete a project by id and cascade to work items', async () => {
    vi.mocked(authenticate).mockResolvedValueOnce({
      context: {
        tenant: mockTenant as any,
        userId: 'user-owner',
        role: 'owner',
      },
      errorResponse: null,
    });

    const mockProject = {
      id: 'proj-1',
      slug: 'core-platform',
      name: 'Core Platform',
      deleted_at: new Date().toISOString(),
    };

    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
                  })),
                })),
              })),
            })),
          })),
        } as any;
      }
      if (table === 'work_items') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn().mockResolvedValue({ error: null }),
              })),
            })),
          })),
        } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'proj-1' }),
    });

    const res = await deleteProject(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.soft_deleted_project.id).toBe('proj-1');
    expect(json.soft_deleted_project.slug).toBe('core-platform');
  });

  it('should reject viewer role from archiving projects with 403 Forbidden', async () => {
    vi.mocked(authenticate).mockResolvedValueOnce({
      context: {
        tenant: mockTenant as any,
        userId: null,
        role: 'viewer',
      },
      errorResponse: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'proj-1' }),
    });

    const res = await deleteProject(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('Viewers cannot archive projects');
  });

  it('should return only archived projects when ?archived=true', async () => {
    vi.mocked(authenticate).mockResolvedValueOnce({
      context: {
        tenant: mockTenant as any,
        userId: 'user-admin',
        role: 'admin',
      },
      errorResponse: null,
    });

    const archivedProjectsList = [
      { id: 'proj-archived', slug: 'old-proj', name: 'Old Project', deleted_at: '2026-09-01T00:00:00Z' },
    ];

    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockImplementation((table: string) => {
      if (table === 'projects') {
        const notMock = vi.fn().mockResolvedValue({ data: archivedProjectsList, error: null });
        const orderMock = vi.fn(() => ({ not: notMock }));
        const eqMock = vi.fn(() => ({ order: orderMock }));
        const selectMock = vi.fn(() => ({ eq: eqMock }));
        return { select: selectMock } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects?archived=true');
    const res = await getProjects(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.projects).toHaveLength(1);
    expect(json.projects[0].slug).toBe('old-proj');
  });

  it('should restore an archived project and its cascaded work items', async () => {
    vi.mocked(authenticate).mockResolvedValueOnce({
      context: {
        tenant: mockTenant as any,
        userId: 'user-admin',
        role: 'admin',
      },
      errorResponse: null,
    });

    const archivedProj = { id: 'proj-archived', slug: 'old-proj', name: 'Old Project', deleted_at: '2026-09-01T00:00:00Z' };
    const restoredProj = { id: 'proj-archived', slug: 'old-proj', name: 'Old Project', deleted_at: null };

    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                not: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: archivedProj, error: null }),
                })),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: restoredProj, error: null }),
                })),
              })),
            })),
          })),
        } as any;
      }
      if (table === 'work_items') {
        return {
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                not: vi.fn().mockResolvedValue({ error: null }),
              })),
            })),
          })),
        } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'proj-archived' }),
    });

    const res = await restoreProject(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.restored_project.deleted_at).toBeNull();
  });

  it('should reject viewer role from restoring projects with 403 Forbidden', async () => {
    vi.mocked(authenticate).mockResolvedValueOnce({
      context: {
        tenant: mockTenant as any,
        userId: null,
        role: 'viewer',
      },
      errorResponse: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects/restore', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: 'proj-archived' }),
    });

    const res = await restoreProject(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('Viewers cannot restore projects');
  });
});
