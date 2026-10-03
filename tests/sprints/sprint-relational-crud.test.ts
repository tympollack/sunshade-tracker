import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { SprintRelationalService } from '@/lib/services/sprintRelationalService';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';
import { GET as getSprintsRoute, POST as postSprintRoute } from '@/app/api/v1/sprints/route';
import {
  GET as getSprintByIdRoute,
  PATCH as patchSprintRoute,
  DELETE as deleteSprintRoute,
} from '@/app/api/v1/sprints/[sprintId]/route';

vi.mock('@/lib/auth-guard', () => ({
  authenticate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('TASK-TRK-SPRINT-RELATIONAL-CRUD-API: Relational tracker.sprints API & Service', () => {
  const tenantId = 'tenant-123';
  const sprintId = 'sprint-456';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('SprintRelationalService', () => {
    it('creates a new sprint in tracker.sprints with committed points and defaults', async () => {
      const mockInsertedSprint = {
        id: sprintId,
        tenant_id: tenantId,
        name: 'Sprint 2026-Q4',
        goal: 'Complete Three-Pane Shell',
        status: 'active',
        is_active: true,
        committed_points: 15,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const mockInsert = vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({ data: mockInsertedSprint, error: null }),
        }),
      });

      (supabaseAdmin.from as any).mockReturnValue({
        insert: mockInsert,
      });

      const res = await SprintRelationalService.createSprint(tenantId, {
        name: 'Sprint 2026-Q4',
        goal: 'Complete Three-Pane Shell',
        status: 'active',
        committed_points: 15,
      });

      expect(res.error).toBeNull();
      expect(res.data?.name).toBe('Sprint 2026-Q4');
      expect(res.data?.is_active).toBe(true);
      expect(mockInsert).toHaveBeenCalledWith(
        expect.objectContaining({
          tenant_id: tenantId,
          name: 'Sprint 2026-Q4',
          is_active: true,
        })
      );
    });

    it('lists sprints scoped to tenant with optional filters', async () => {
      const mockSprints = [
        { id: 's-1', name: 'Sprint 1', is_active: true, tenant_id: tenantId },
        { id: 's-2', name: 'Sprint 2', is_active: false, tenant_id: tenantId },
      ];

      const mockOrder = vi.fn().mockResolvedValue({ data: mockSprints, error: null });
      const mockEqTenant = vi.fn().mockReturnValue({
        order: mockOrder,
      });

      (supabaseAdmin.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: mockEqTenant,
        }),
      });

      const res = await SprintRelationalService.listSprints(tenantId);
      expect(res.error).toBeNull();
      expect(res.data?.length).toBe(2);
      expect(mockEqTenant).toHaveBeenCalledWith('tenant_id', tenantId);
    });

    it('synchronizes work item metadata when sprint is renamed', async () => {
      const currentSprint = {
        id: sprintId,
        tenant_id: tenantId,
        name: 'Sprint Old Name',
        status: 'planned',
        is_active: false,
      };

      const updatedSprint = {
        ...currentSprint,
        name: 'Sprint New Name',
      };

      // Mock getSprintById
      const mockMaybeSingle = vi.fn().mockResolvedValue({ data: currentSprint, error: null });
      const mockSelectById = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: mockMaybeSingle,
          }),
        }),
      });

      // Mock update
      const mockSingleUpdate = vi.fn().mockResolvedValue({ data: updatedSprint, error: null });
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: mockSingleUpdate,
            }),
          }),
        }),
      });

      // Mock work_items query and update
      const mockItems = [
        { id: 'w-1', metadata: { sprint: 'Sprint Old Name' } },
        { id: 'w-2', metadata: { sprint: 'Other Sprint' } },
      ];
      const mockItemsIs = vi.fn().mockResolvedValue({ data: mockItems, error: null });
      const mockItemsEq = vi.fn().mockReturnValue({ is: mockItemsIs });
      const mockItemsSelect = vi.fn().mockReturnValue({ eq: mockItemsEq });

      const mockWorkItemUpdateEq = vi.fn().mockResolvedValue({ error: null });
      const mockWorkItemUpdate = vi.fn().mockReturnValue({ eq: mockWorkItemUpdateEq });

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'sprints') {
          return {
            select: mockSelectById,
            update: mockUpdate,
          };
        }
        if (table === 'work_items') {
          return {
            select: mockItemsSelect,
            update: mockWorkItemUpdate,
          };
        }
        return {};
      });

      const res = await SprintRelationalService.updateSprint(tenantId, sprintId, {
        name: 'Sprint New Name',
      });

      expect(res.error).toBeNull();
      expect(res.data?.name).toBe('Sprint New Name');
      // Verifies work_items was updated with new sprint name
      expect(mockWorkItemUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { sprint: 'Sprint New Name' } })
      );
    });
  });

  describe('API Routes: /api/v1/sprints and /api/v1/sprints/[sprintId]', () => {
    it('GET /api/v1/sprints lists sprints for authenticated workspace', async () => {
      (authenticate as any).mockResolvedValue({
        context: { tenant: { id: tenantId, slug: 'pym-energy' }, userId: 'u-1', role: 'admin' },
        errorResponse: null,
      });

      const mockOrder = vi.fn().mockResolvedValue({ data: [{ id: 's-1', name: 'Sprint 1' }], error: null });
      (supabaseAdmin.from as any).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ order: mockOrder }),
        }),
      });

      const req = new NextRequest('http://localhost:3000/api/v1/sprints');
      const res = await getSprintsRoute(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.sprints).toHaveLength(1);
    });

    it('POST /api/v1/sprints validates input and creates sprint', async () => {
      (authenticate as any).mockResolvedValue({
        context: { tenant: { id: tenantId, slug: 'pym-energy' }, userId: 'u-1', role: 'admin' },
        errorResponse: null,
      });

      // Validation check for empty name
      const reqEmpty = new NextRequest('http://localhost:3000/api/v1/sprints', {
        method: 'POST',
        body: JSON.stringify({ name: '' }),
      });
      const resEmpty = await postSprintRoute(reqEmpty);
      expect(resEmpty.status).toBe(400);

      // Successful creation
      const mockInserted = { id: 's-new', name: 'Sprint New', is_active: false };
      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'sprints') {
          return {
            insert: vi.fn().mockReturnValue({
              select: vi.fn().mockReturnValue({
                single: vi.fn().mockResolvedValue({ data: mockInserted, error: null }),
              }),
            }),
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      });

      const reqValid = new NextRequest('http://localhost:3000/api/v1/sprints', {
        method: 'POST',
        body: JSON.stringify({ name: 'Sprint New' }),
      });
      const resValid = await postSprintRoute(reqValid);
      expect(resValid.status).toBe(201);
      const json = await resValid.json();
      expect(json.sprint.name).toBe('Sprint New');
    });

    it('DELETE /api/v1/sprints/[sprintId] deletes sprint', async () => {
      (authenticate as any).mockResolvedValue({
        context: { tenant: { id: tenantId, slug: 'pym-energy' }, userId: 'u-1', role: 'admin' },
        errorResponse: null,
      });

      const mockDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'sprints') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: sprintId, name: 'S1', tenant_id: tenantId },
                    error: null,
                  }),
                }),
              }),
            }),
            delete: mockDelete,
          };
        }
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      });

      const req = new NextRequest(`http://localhost:3000/api/v1/sprints/${sprintId}`, {
        method: 'DELETE',
      });
      const res = await deleteSprintRoute(req, { params: Promise.resolve({ sprintId }) });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
    });

    it('rejects POST /api/v1/sprints when caller has viewer role', async () => {
      (authenticate as any).mockResolvedValue({
        context: { tenant: { id: tenantId, slug: 'pym-energy' }, userId: 'u-viewer', role: 'viewer' },
        errorResponse: null,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/sprints', {
        method: 'POST',
        body: JSON.stringify({ name: 'Unauthorized Sprint' }),
      });
      const res = await postSprintRoute(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Viewer role cannot modify sprints');
    });

    it('rejects DELETE /api/v1/sprints/[sprintId] when caller has viewer role', async () => {
      (authenticate as any).mockResolvedValue({
        context: { tenant: { id: tenantId, slug: 'pym-energy' }, userId: 'u-viewer', role: 'viewer' },
        errorResponse: null,
      });

      const req = new NextRequest(`http://localhost:3000/api/v1/sprints/${sprintId}`, {
        method: 'DELETE',
      });
      const res = await deleteSprintRoute(req, { params: Promise.resolve({ sprintId }) });
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Viewer role cannot modify sprints');
    });
  });
});
