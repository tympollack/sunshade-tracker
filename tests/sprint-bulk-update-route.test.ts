import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as bulkUpdatePOST, PATCH as bulkUpdatePATCH, PUT as bulkUpdatePUT } from '@/app/api/v1/items/bulk-update/route';
import { POST as bulkPOST, PATCH as bulkPATCH } from '@/app/api/v1/items/bulk/route';
import { handleBulkUpdateItems } from '@/lib/bulk-items';
import * as authGuard from '@/lib/auth-guard';

vi.mock('@/lib/bulk-items', () => ({
  handleBulkUpdateItems: vi.fn(),
}));

vi.mock('@/lib/auth-guard', () => ({
  authenticate: vi.fn(),
}));

describe('BUG-TRK-SPRINT-MOVE-DB-REJECT: Bulk Update REST Routes', () => {
  const mockAuthContext = {
    tenant: { id: '00000000-0000-0000-0000-000000000000', slug: 'sunshade' },
    userId: 'admin-user-123',
    role: 'admin',
    userName: 'Workspace Admin',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(authGuard.authenticate).mockResolvedValue({
      errorResponse: null,
      context: mockAuthContext as any,
    });
  });

  describe('/api/v1/items/bulk-update Endpoint', () => {
    it('accepts governance_bypass in body and sets options.governance_bypass = true', async () => {
      vi.mocked(handleBulkUpdateItems).mockResolvedValue({
        success: true,
        updated_count: 5,
        items: [{ id: 'item-1' }, { id: 'item-2' }, { id: 'item-3' }, { id: 'item-4' }, { id: 'item-5' }] as any,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: ['item-1', 'item-2', 'item-3', 'item-4', 'item-5'],
          updates: {
            sprint_id: 'sprint-active-uuid-1',
            metadata: { sprint: 'Sprint 1 (Active)' },
          },
          governance_bypass: true,
        }),
      });

      const res = await bulkUpdatePOST(req);
      expect(res.status).toBe(200);

      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.updated_count).toBe(5);

      expect(handleBulkUpdateItems).toHaveBeenCalledWith(
        mockAuthContext.tenant.id,
        expect.objectContaining({
          governance_bypass: true,
          updates: expect.objectContaining({
            governance_bypass: true,
            metadata: expect.objectContaining({
              governance_bypass: true,
              added_mid_sprint: true,
            }),
          }),
        }),
        expect.objectContaining({
          governance_bypass: true,
          actorId: 'admin-user-123',
        })
      );
    });

    it('extracts governance_bypass from x-governance-bypass HTTP header', async () => {
      vi.mocked(handleBulkUpdateItems).mockResolvedValue({
        success: true,
        updated_count: 5,
        items: [] as any,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk-update', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-governance-bypass': 'true',
        },
        body: JSON.stringify({
          item_ids: ['item-1', 'item-2', 'item-3', 'item-4', 'item-5'],
          updates: {
            sprint_id: 'sprint-active-uuid-1',
            metadata: { sprint: 'Sprint 1 (Active)' },
          },
        }),
      });

      const res = await bulkUpdatePATCH(req);
      expect(res.status).toBe(200);

      expect(handleBulkUpdateItems).toHaveBeenCalledWith(
        mockAuthContext.tenant.id,
        expect.objectContaining({
          governance_bypass: true,
        }),
        expect.objectContaining({
          governance_bypass: true,
        })
      );
    });

    it('surfaces 409 error when governance bypass is false and items are locked', async () => {
      vi.mocked(handleBulkUpdateItems).mockResolvedValue({
        success: false,
        updated_count: 0,
        items: [],
        status: 409,
        error: 'Active sprint scope is locked. Cannot assign estimated items to active sprint.',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: ['item-1'],
          updates: {
            metadata: { sprint: 'Sprint 1 (Active)' },
          },
        }),
      });

      const res = await bulkUpdatePOST(req);
      expect(res.status).toBe(409);

      const json = await res.json();
      expect(json.error).toContain('Active sprint scope is locked');
    });

    it('surfaces exact database failure message with 500 status', async () => {
      vi.mocked(handleBulkUpdateItems).mockResolvedValue({
        success: false,
        updated_count: 0,
        items: [],
        status: 500,
        error: 'Database update failed: new row for relation "work_items" violates check constraint "trg_enforce_sprint_governance"',
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk-update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: ['item-1'],
          updates: {
            sprint_id: 'sprint-active-uuid-1',
          },
        }),
      });

      const res = await bulkUpdatePUT(req);
      expect(res.status).toBe(500);

      const json = await res.json();
      expect(json.error).toContain('violates check constraint "trg_enforce_sprint_governance"');
    });
  });

  describe('/api/v1/items/bulk Endpoint Forwarding', () => {
    it('forwards governance_bypass flag from body in POST /api/v1/items/bulk', async () => {
      vi.mocked(handleBulkUpdateItems).mockResolvedValue({
        success: true,
        updated_count: 5,
        items: [] as any,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update',
          ids: ['item-1', 'item-2', 'item-3', 'item-4', 'item-5'],
          updates: {
            sprint_id: 'sprint-active-uuid-1',
            metadata: { sprint: 'Sprint 1 (Active)' },
          },
          governance_bypass: true,
        }),
      });

      const res = await bulkPOST(req);
      expect(res.status).toBe(200);

      expect(handleBulkUpdateItems).toHaveBeenCalledWith(
        mockAuthContext.tenant.id,
        expect.anything(),
        expect.objectContaining({
          governance_bypass: true,
        })
      );
    });

    it('forwards x-governance-bypass header in PATCH /api/v1/items/bulk', async () => {
      vi.mocked(handleBulkUpdateItems).mockResolvedValue({
        success: true,
        updated_count: 3,
        items: [] as any,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-governance-bypass': 'true',
        },
        body: JSON.stringify({
          ids: ['item-1', 'item-2', 'item-3'],
          updates: {
            sprint_id: 'sprint-active-uuid-1',
          },
        }),
      });

      const res = await bulkPATCH(req);
      expect(res.status).toBe(200);

      expect(handleBulkUpdateItems).toHaveBeenCalledWith(
        mockAuthContext.tenant.id,
        expect.anything(),
        expect.objectContaining({
          governance_bypass: true,
        })
      );
    });

    it('rejects unprivileged member from bypassing governance in /api/v1/items/bulk with 403 status', async () => {
      vi.mocked(authGuard.authenticate).mockResolvedValue({
        errorResponse: null,
        context: {
          ...mockAuthContext,
          role: 'member',
        } as any,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          'x-governance-bypass': 'true',
        },
        body: JSON.stringify({
          ids: ['item-1'],
          updates: { sprint_id: 'sprint-active-uuid-1' },
        }),
      });

      const res = await bulkPATCH(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Forbidden: Only workspace admins and owners can bypass sprint governance');
    });
  });

  describe('Security & Role Guardrails', () => {
    it('rejects unprivileged member from bypassing governance in /api/v1/items/bulk-update with 403 status', async () => {
      vi.mocked(authGuard.authenticate).mockResolvedValue({
        errorResponse: null,
        context: {
          ...mockAuthContext,
          role: 'member',
        } as any,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: ['item-1'],
          updates: { sprint_id: 'sprint-active-uuid-1' },
          governance_bypass: true,
        }),
      });

      const res = await bulkUpdatePOST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Forbidden: Only workspace admins and owners can bypass sprint governance');
    });

    it('rejects unprivileged member from setting items[].governance_bypass in heterogeneous /api/v1/items/bulk-update', async () => {
      vi.mocked(authGuard.authenticate).mockResolvedValue({
        errorResponse: null,
        context: {
          ...mockAuthContext,
          role: 'member',
        } as any,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk-update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              id: 'item-1',
              governance_bypass: true,
              metadata: { sprint: 'Sprint Active' },
            },
          ],
        }),
      });

      const res = await bulkUpdatePOST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Forbidden: Only workspace admins and owners can bypass sprint governance');
    });

    it('rejects unprivileged member from setting items[].metadata.governance_bypass in /api/v1/items/bulk', async () => {
      vi.mocked(authGuard.authenticate).mockResolvedValue({
        errorResponse: null,
        context: {
          ...mockAuthContext,
          role: 'member',
        } as any,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items/bulk', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: [
            {
              id: 'item-1',
              metadata: { sprint: 'Sprint Active', governance_bypass: true },
            },
          ],
        }),
      });

      const res = await bulkPATCH(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('Forbidden: Only workspace admins and owners can bypass sprint governance');
    });
  });
});
