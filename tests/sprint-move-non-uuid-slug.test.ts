import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reconcileSprintMetadata, isUuid, handleBulkUpdateItems } from '@/lib/bulk-items';
import { ProjectSettings } from '@/types/tracker';
import { supabaseAdmin } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/audit-log', () => ({
  recordBulkAuditLogs: vi.fn().mockResolvedValue(undefined),
  computeChangedFields: vi.fn().mockReturnValue({}),
}));

vi.mock('@/lib/notifications', () => ({
  getTenantMemberRecipients: vi.fn().mockResolvedValue([]),
  dispatchItemNotifications: vi.fn().mockResolvedValue(undefined),
}));

describe('Sprint Move Non-UUID Slug ID Guard', () => {
  const tenantId = '00000000-0000-0000-0000-000000000000';
  const projectId = '11111111-1111-1111-1111-111111111111';

  const mockSettingsWithSlugId = {
    sprint_settings: {
      sprints: [
        {
          id: 'sprint-2026-q4', // Legacy / slug-based ID
          name: 'Sprint 2026-Q4',
          status: 'active',
          is_active: true,
        },
      ],
    },
  } as unknown as ProjectSettings;

  const mockSettingsWithUuid = {
    sprint_settings: {
      sprints: [
        {
          id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
          name: 'Sprint 2026-Q4',
          status: 'active',
          is_active: true,
        },
      ],
    },
  } as unknown as ProjectSettings;

  describe('isUuid', () => {
    it('returns true for standard UUIDs', () => {
      expect(isUuid('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11')).toBe(true);
      expect(isUuid('00000000-0000-0000-0000-000000000000')).toBe(true);
    });

    it('returns false for slug identifiers or invalid strings', () => {
      expect(isUuid('sprint-2026-q4')).toBe(false);
      expect(isUuid('sprint-1')).toBe(false);
      expect(isUuid(null)).toBe(false);
      expect(isUuid(undefined)).toBe(false);
      expect(isUuid(123)).toBe(false);
    });
  });

  describe('reconcileSprintMetadata', () => {
    it('does NOT assign non-UUID slug ID to sprint_id in metadata', () => {
      const result = reconcileSprintMetadata(
        {},
        { sprint: 'Sprint 2026-Q4' },
        mockSettingsWithSlugId
      );

      expect(result.sprint).toBe('Sprint 2026-Q4');
      // Must not contain sprint-2026-q4 as sprint_id
      expect(result.sprint_id).toBeUndefined();
    });

    it('does NOT set non-UUID slug ID if sprint_id was passed directly as slug', () => {
      const result = reconcileSprintMetadata(
        {},
        { sprint_id: 'sprint-2026-q4' },
        mockSettingsWithSlugId
      );

      expect(result.sprint).toBe('Sprint 2026-Q4');
      expect(result.sprint_id).toBeUndefined();
    });

    it('correctly sets sprint_id when target sprint has genuine UUID', () => {
      const result = reconcileSprintMetadata(
        {},
        { sprint: 'Sprint 2026-Q4' },
        mockSettingsWithUuid
      );

      expect(result.sprint).toBe('Sprint 2026-Q4');
      expect(result.sprint_id).toBe('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11');
    });
  });

  describe('handleBulkUpdateItems DB query payload', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('sends sprint_id: null instead of "sprint-2026-q4" to prevent PostgreSQL UUID syntax error', async () => {
      const existingItem = {
        id: 'item-001',
        tenant_id: tenantId,
        project_id: projectId,
        title: 'Story to move',
        metadata: { story_points: 5 },
      };

      let capturedPayload: any = null;

      const mockUpdate = vi.fn().mockImplementation((payload) => {
        capturedPayload = payload;
        return {
          eq: vi.fn().mockReturnThis(),
          select: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { ...existingItem, ...payload },
            error: null,
          }),
        };
      });

      const mockFrom = vi.fn().mockImplementation((table: string) => {
        if (table === 'projects') {
          const projectObj = {
            id: projectId,
            slug: 'sunshade-tracker',
            settings: mockSettingsWithSlugId,
          };
          const chain: any = {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: projectObj, error: null }),
            single: vi.fn().mockResolvedValue({ data: projectObj, error: null }),
            then: (resolve: any) => resolve({ data: [projectObj], error: null }),
          };
          return chain;
        }
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            update: mockUpdate,
            // for initial fetch of existing items
            then: (resolve: any) => resolve({ data: [existingItem], error: null }),
          };
        }
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          in: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          single: vi.fn().mockResolvedValue({ data: null, error: null }),
          then: (resolve: any) => resolve({ data: [], error: null }),
        };
      });

      vi.mocked(supabaseAdmin.from).mockImplementation(mockFrom as any);

      const res = await handleBulkUpdateItems(
        tenantId,
        {
          ids: ['item-001'],
          governance_bypass: true,
          updates: {
            sprint_id: 'sprint-2026-q4', // client or caller passed slug
            metadata: {
              sprint: 'Sprint 2026-Q4',
              sprint_id: 'sprint-2026-q4',
            },
          },
        },
        {
          actorId: 'admin-1',
          actorName: 'Admin',
          governance_bypass: true,
        }
      );

      expect(res.success).toBe(true);
      expect(capturedPayload).not.toBeNull();
      // sprint_id in database update payload must NOT be the slug string!
      expect(capturedPayload.sprint_id).toBeNull();
      expect(capturedPayload.metadata.sprint).toBe('Sprint 2026-Q4');
      expect(capturedPayload.metadata.sprint_id).toBeUndefined();
    });
  });
});
