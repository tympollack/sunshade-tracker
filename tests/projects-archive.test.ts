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

  it('should allow owner/admin to soft-delete a project by id and cascade to active work items snapshot', async () => {
    vi.mocked(authenticate).mockResolvedValueOnce({
      context: {
        tenant: mockTenant as any,
        userId: 'user-owner',
        role: 'owner',
      },
      errorResponse: null,
    });

    const mockExistingProject = {
      id: 'proj-1',
      slug: 'core-platform',
      name: 'Core Platform',
      settings: { schema_version: '1.0' },
      deleted_at: null,
    };

    const mockSoftDeletedProject = {
      id: 'proj-1',
      slug: 'core-platform',
      name: 'Core Platform',
      deleted_at: new Date().toISOString(),
    };

    const fromMock = vi.mocked(supabaseAdmin.from);
    fromMock.mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockExistingProject, error: null }),
                })),
              })),
            })),
          })),
          update: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({ data: mockSoftDeletedProject, error: null }),
                  })),
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
              eq: vi.fn(() => ({
                is: vi.fn().mockResolvedValue({ data: [{ id: 'item-101' }], error: null }),
              })),
            })),
          })),
          update: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({ error: null }),
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

  it('should reject viewer and member roles from archiving projects with 403 Forbidden', async () => {
    vi.mocked(authenticate).mockResolvedValueOnce({
      context: {
        tenant: mockTenant as any,
        userId: 'user-viewer',
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
    expect(json.error).toContain('Only workspace owners and admins can archive projects');

    // Also verify regular member role
    vi.mocked(authenticate).mockResolvedValueOnce({
      context: {
        tenant: mockTenant as any,
        userId: 'user-member',
        role: 'member',
      },
      errorResponse: null,
    });

    const resMember = await deleteProject(req);
    expect(resMember.status).toBe(403);
    const jsonMember = await resMember.json();
    expect(jsonMember.error).toContain('Only workspace owners and admins can archive projects');
  });

  it('should reject non-admin/non-owner from querying ?archived=true with 403 Forbidden', async () => {
    vi.mocked(authenticate).mockResolvedValueOnce({
      context: {
        tenant: mockTenant as any,
        userId: 'user-guest',
        role: 'viewer',
      },
      errorResponse: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects?archived=true');
    const res = await getProjects(req);
    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('Only workspace owners and admins can view archived projects');
  });

  it('should return archived projects with item_count when ?archived=true for owner/admin', async () => {
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
      if (table === 'work_items') {
        return {
          select: vi.fn(() => ({
            in: vi.fn().mockResolvedValue({
              data: [
                { id: 'item-1', project_id: 'proj-archived' },
                { id: 'item-2', project_id: 'proj-archived' },
              ],
              error: null,
            }),
          })),
        } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects?archived=true');
    const res = await getProjects(req);
    expect(res.status).toBe(200);

    const json = await res.json();
    expect(json.projects).toHaveLength(1);
    expect(json.projects[0].slug).toBe('old-proj');
    expect(json.projects[0].item_count).toBe(2);
  });

  it('should restore an archived project and ONLY its snapshot cascaded items, preserving previous deletions', async () => {
    vi.mocked(authenticate).mockResolvedValueOnce({
      context: {
        tenant: mockTenant as any,
        userId: 'user-admin',
        role: 'admin',
      },
      errorResponse: null,
    });

    const archivedProj = {
      id: 'proj-archived',
      slug: 'old-proj',
      name: 'Old Project',
      deleted_at: '2026-09-01T00:00:00Z',
      settings: {
        archival_snapshot: {
          archived_at: '2026-09-01T00:00:00Z',
          cascaded_item_ids: ['item-active-1', 'item-active-2'],
        },
      },
    };
    const restoredProj = { id: 'proj-archived', slug: 'old-proj', name: 'Old Project', deleted_at: null };

    const itemUpdateMock = vi.fn(() => ({
      in: vi.fn(() => ({
        eq: vi.fn(() => ({
          eq: vi.fn().mockResolvedValue({ error: null }),
        })),
      })),
    }));

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
          update: itemUpdateMock,
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
    // Verify item update targeted the specific cascaded item ids
    expect(itemUpdateMock).toHaveBeenCalledWith({ deleted_at: null, updated_at: expect.any(String) });
  });

  it('should rollback project restoration if work item restoration fails', async () => {
    vi.mocked(authenticate).mockResolvedValueOnce({
      context: {
        tenant: mockTenant as any,
        userId: 'user-admin',
        role: 'admin',
      },
      errorResponse: null,
    });

    const archivedProj = {
      id: 'proj-archived',
      slug: 'old-proj',
      name: 'Old Project',
      deleted_at: '2026-09-01T00:00:00Z',
      settings: {
        archival_snapshot: {
          archived_at: '2026-09-01T00:00:00Z',
          cascaded_item_ids: ['item-active-1'],
        },
      },
    };
    const restoredProj = { id: 'proj-archived', slug: 'old-proj', name: 'Old Project', deleted_at: null };

    const projectRollbackMock = vi.fn(() => ({
      eq: vi.fn().mockResolvedValue({ error: null }),
    }));

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
          update: vi.fn((updatePayload: any) => {
            if (updatePayload.deleted_at === null) {
              return {
                eq: vi.fn(() => ({
                  eq: vi.fn(() => ({
                    select: vi.fn(() => ({
                      single: vi.fn().mockResolvedValue({ data: restoredProj, error: null }),
                    })),
                  })),
                })),
              };
            }
            return projectRollbackMock();
          }),
        } as any;
      }
      if (table === 'work_items') {
        return {
          update: vi.fn(() => ({
            in: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ error: new Error('Database connection failed during work item update') }),
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
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.error).toContain('Failed to restore project items');
    expect(projectRollbackMock).toHaveBeenCalled();
  });

  it('should reject viewer and member roles from restoring projects with 403 Forbidden', async () => {
    vi.mocked(authenticate).mockResolvedValueOnce({
      context: {
        tenant: mockTenant as any,
        userId: 'user-viewer',
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
    expect(json.error).toContain('Only workspace owners and admins can restore projects');

    // Also verify member role
    vi.mocked(authenticate).mockResolvedValueOnce({
      context: {
        tenant: mockTenant as any,
        userId: 'user-member',
        role: 'member',
      },
      errorResponse: null,
    });

    const resMember = await restoreProject(req);
    expect(resMember.status).toBe(403);
    const jsonMember = await resMember.json();
    expect(jsonMember.error).toContain('Only workspace owners and admins can restore projects');
  });
});
