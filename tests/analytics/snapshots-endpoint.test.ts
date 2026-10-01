import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getSnapshotsHandler } from '@/app/api/v1/projects/[projectId]/analytics/snapshots/route';
import { GET as getSprintsAnalyticsHandler } from '@/app/api/v1/sprints/analytics/route';
import { supabaseAdmin } from '@/lib/db';
import * as authGuard from '@/lib/auth-guard';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('TASK-TRK-BURNDOWN-SNAPSHOTS-ENDPOINT: snapshots reader and sprint list', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('GET /api/v1/projects/[projectId]/analytics/snapshots', () => {
    it('returns 401 when unauthenticated', async () => {
      vi.spyOn(authGuard, 'authenticate').mockResolvedValue({
        errorResponse: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) as any,
        context: null as any,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/projects/p-1/analytics/snapshots?sprint_id=s-1');
      const res = await getSnapshotsHandler(req, { params: Promise.resolve({ projectId: 'p-1' }) });
      expect(res.status).toBe(401);
    });

    it('returns mapped burndownData from sprint snapshots for BurndownChart', async () => {
      vi.spyOn(authGuard, 'authenticate').mockResolvedValue({
        errorResponse: null as any,
        context: {
          tenant: { id: 't-1', slug: 'test-org' } as any,
          userId: 'u-1',
          role: 'member',
        },
      });

      const mockProject = {
        id: 'proj-123',
        slug: 'my-project',
        name: 'My Project',
        tenant_id: 't-1',
      };

      const mockSnapshots = [
        {
          id: 'snap-1',
          sprint_id: 'sprint-1',
          committed_points: 30,
          remaining_points: 30,
          captured_at: '2026-10-01T00:00:00.000Z',
          assignee_breakdown: { ideal_burn: 30, actors: { 'alice': 0 } },
        },
        {
          id: 'snap-2',
          sprint_id: 'sprint-1',
          committed_points: 30,
          remaining_points: 24,
          captured_at: '2026-10-02T00:00:00.000Z',
          assignee_breakdown: { ideal_burn: 28, actors: { 'alice': 6 } },
        },
      ];

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'projects') {
          const projQuery: any = {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  eq: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
                  }),
                }),
              }),
            }),
          };
          return projQuery;
        }
        if (table === 'sprint_snapshots') {
          const snapQueryBuilder: any = {
            eq: vi.fn().mockImplementation(() => snapQueryBuilder),
            order: vi.fn().mockResolvedValue({ data: mockSnapshots, error: null }),
          };
          return {
            select: vi.fn().mockReturnValue(snapQueryBuilder),
          };
        }
        return { select: vi.fn().mockReturnValue({ data: [], error: null }) };
      });

      const req = new NextRequest(
        'http://localhost:3000/api/v1/projects/my-project/analytics/snapshots?sprint_id=sprint-1'
      );
      const res = await getSnapshotsHandler(req, {
        params: Promise.resolve({ projectId: 'my-project' }),
      });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.project_id).toBe('proj-123');
      expect(json.sprint_id).toBe('sprint-1');
      expect(json.burndownData).toHaveLength(2);
      expect(json.burndownData[0]).toEqual({
        date: '2026-10-01',
        idealRemaining: 30,
        actualRemaining: 30,
        dailyVelocity: undefined,
        contributorBreakdown: { alice: 0 },
        hasScopeCreep: false,
      });
      expect(json.burndownData[1]).toEqual({
        date: '2026-10-02',
        idealRemaining: 28,
        actualRemaining: 24,
        dailyVelocity: 6,
        contributorBreakdown: { alice: 6 },
        hasScopeCreep: false,
      });
    });
  });

  describe('GET /api/v1/sprints/analytics when sprint_id is omitted', () => {
    it('returns available sprints merging database sprints and project settings', async () => {
      vi.spyOn(authGuard, 'authenticate').mockResolvedValue({
        errorResponse: null as any,
        context: {
          tenant: { id: 't-1', slug: 'test-org' } as any,
          userId: 'u-1',
          role: 'member',
        },
      });

      const mockDbSprints = [
        { id: 'db-sprint-1', name: 'Sprint 1 (DB)', status: 'active', is_active: true },
      ];

      const mockProject = {
        id: 'proj-1',
        slug: 'my-project',
        settings: {
          sprint_settings: {
            sprints: [
              { id: 'settings-sprint-2', name: 'Sprint 2 (Settings)', status: 'planned', is_active: false },
            ],
          },
        },
      };

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'sprints') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockResolvedValue({ data: mockDbSprints, error: null }),
            }),
          };
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  eq: vi.fn().mockResolvedValue({ data: [mockProject], error: null }),
                }),
              }),
            }),
          };
        }
        return { select: vi.fn().mockReturnValue({ data: [], error: null }) };
      });

      const req = new NextRequest(
        'http://localhost:3000/api/v1/sprints/analytics?tenant_slug=test-org&project_slug=my-project'
      );
      const res = await getSprintsAnalyticsHandler(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.sprints).toHaveLength(2);
      expect(json.sprints[0].id).toBe('db-sprint-1');
      expect(json.sprints[1].id).toBe('settings-sprint-2');
    });
  });
});
