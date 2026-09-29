import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  calculateRollingVelocity,
  calculateScopeCreep,
  calculateCommitmentReliability,
  calculateCycleTime,
  calculateWIPAge,
  computeSprintAnalytics,
  getReliabilityStatus,
} from '@/lib/services/sprintAnalyticsService';
import { getSprintHealthReport } from '@/lib/services/sprintAnalyticsServer';
import { GET as getSprintAnalyticsRoute } from '@/app/api/v1/sprints/analytics/route';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  authenticate: vi.fn(),
}));

describe('TASK-TRK-VELOCITY-ENGINE: Rolling Velocity & Enterprise KPI Engine', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Pure Mathematical Formulas (sprintAnalyticsService)', () => {
    describe('Rolling 3-Sprint Velocity', () => {
      it('computes exact average across 3 historical completed sprints', () => {
        const history = [
          { id: 's-3', name: 'Sprint 3', completed_points: 30 },
          { id: 's-2', name: 'Sprint 2', completed_points: 25 },
          { id: 's-1', name: 'Sprint 1', completed_points: 20 },
        ];
        // (30 + 25 + 20) / 3 = 25.0
        expect(calculateRollingVelocity(history)).toBe(25.0);
      });

      it('gracefully handles sprint 1 when only 1 historical sprint exists', () => {
        const history = [{ id: 's-1', name: 'Sprint 1', completed_points: 18 }];
        // Single period average = 18.0
        expect(calculateRollingVelocity(history)).toBe(18.0);
      });

      it('gracefully handles sprint 2 when only 2 historical sprints exist', () => {
        const history = [
          { id: 's-2', name: 'Sprint 2', completed_points: 24 },
          { id: 's-1', name: 'Sprint 1', completed_points: 16 },
        ];
        // (24 + 16) / 2 = 20.0
        expect(calculateRollingVelocity(history)).toBe(20.0);
      });

      it('gracefully handles cold start when 0 historical sprints exist', () => {
        expect(calculateRollingVelocity([])).toBe(0);
        expect(calculateRollingVelocity(undefined)).toBe(0);
      });

      it('caps evaluation at the 3 most recent historical sprints', () => {
        const history = [
          { id: 's-4', name: 'Sprint 4', completed_points: 40 },
          { id: 's-3', name: 'Sprint 3', completed_points: 30 },
          { id: 's-2', name: 'Sprint 2', completed_points: 20 },
          { id: 's-1', name: 'Sprint 1', completed_points: 10 }, // should be ignored
        ];
        // (40 + 30 + 20) / 3 = 30.0
        expect(calculateRollingVelocity(history)).toBe(30.0);
      });
    });

    describe('Scope Creep & Churn Rate', () => {
      it('calculates positive scope churn percentage correctly', () => {
        // 5 points added mid-sprint on 25 committed points = (5 / 25) * 100 = 20.0%
        expect(calculateScopeCreep(5, 25)).toBe(20.0);
      });

      it('handles negative churn edge case when items are removed/ejected mid-sprint', () => {
        // -4 points removed on 20 committed points = (-4 / 20) * 100 = -20.0%
        expect(calculateScopeCreep(-4, 20)).toBe(-20.0);
      });

      it('handles zero-commit edge case safely without NaN or Infinity', () => {
        // 0 committed points, 0 added = 0%
        expect(calculateScopeCreep(0, 0)).toBe(0.0);

        // 0 committed points, positive points added = 100.0% (unplanned work)
        expect(calculateScopeCreep(5, 0)).toBe(100.0);

        // 0 committed points, negative points = -100.0%
        expect(calculateScopeCreep(-5, 0)).toBe(-100.0);
      });
    });

    describe('Commitment Reliability (Say/Do Ratio)', () => {
      it('computes standard say/do ratio accurately', () => {
        // 18 completed out of 20 committed = (18 / 20) * 100 = 90.0%
        expect(calculateCommitmentReliability(18, 20)).toBe(90.0);
      });

      it('handles over-delivery (completed > committed)', () => {
        // 25 completed out of 20 committed = (25 / 20) * 100 = 125.0%
        expect(calculateCommitmentReliability(25, 20)).toBe(125.0);
      });

      it('handles zero-commit edge case safely without division by zero', () => {
        expect(calculateCommitmentReliability(0, 0)).toBe(0.0);
        expect(calculateCommitmentReliability(5, 0)).toBe(100.0);
      });

      it('evaluates health badge status correctly', () => {
        expect(getReliabilityStatus(90)).toBe('green');
        expect(getReliabilityStatus(85)).toBe('green');
        expect(getReliabilityStatus(84.9)).toBe('amber');
        expect(getReliabilityStatus(70)).toBe('amber');
        expect(getReliabilityStatus(69.9)).toBe('red');
        expect(getReliabilityStatus(0)).toBe('red');
      });
    });

    describe('Cycle Time & WIP Age', () => {
      it('calculates mean cycle time in days across completed items', () => {
        const items = [
          {
            id: 'item-1',
            status: 'complete',
            created_at: '2026-10-01T00:00:00Z',
            started_at: '2026-10-01T00:00:00Z',
            completed_at: '2026-10-03T00:00:00Z', // 2.0 days
          },
          {
            id: 'item-2',
            status: 'complete',
            created_at: '2026-10-01T00:00:00Z',
            started_at: '2026-10-01T00:00:00Z',
            completed_at: '2026-10-05T00:00:00Z', // 4.0 days
          },
        ];
        // (2 + 4) / 2 = 3.0 days
        expect(calculateCycleTime(items)).toBe(3.0);
      });

      it('calculates mean WIP age in days for in-progress items', () => {
        const items = [
          {
            id: 'wip-1',
            status: 'in_progress',
            created_at: '2026-10-01T00:00:00Z',
            started_at: '2026-10-01T00:00:00Z',
          },
        ];
        // Evaluated at 2026-10-04T00:00:00Z = 3.0 days
        expect(calculateWIPAge(items, '2026-10-04T00:00:00Z')).toBe(3.0);
      });

      it('returns 0 when no completed or in-progress items exist', () => {
        expect(calculateCycleTime([])).toBe(0);
        expect(calculateWIPAge([])).toBe(0);
      });
    });

    describe('computeSprintAnalytics Aggregation', () => {
      it('assembles a full SprintHealthReport from raw inputs', () => {
        const report = computeSprintAnalytics({
          sprint: {
            id: 'sprint-q4',
            name: 'Sprint 2026-Q4',
            status: 'active',
            is_active: true,
            started_at: '2026-10-01T00:00:00Z',
            ends_at: '2026-10-21T00:00:00Z',
            committed_points: 30,
          },
          historicalSprints: [
            { id: 's-3', name: 'Sprint 3', completed_points: 25 },
            { id: 's-2', name: 'Sprint 2', completed_points: 20 },
          ],
          items: [
            {
              id: 'it-1',
              status: 'complete',
              created_at: '2026-10-01T00:00:00Z',
              started_at: '2026-10-01T00:00:00Z',
              completed_at: '2026-10-03T00:00:00Z',
              metadata: { story_points: 15 },
            },
            {
              id: 'it-2',
              status: 'in_progress',
              created_at: '2026-10-01T00:00:00Z',
              started_at: '2026-10-01T00:00:00Z',
              metadata: { story_points: 10 },
            },
            {
              id: 'it-3',
              status: 'not_started',
              created_at: '2026-10-01T00:00:00Z',
              metadata: { story_points: 10, added_mid_sprint: true },
            },
          ],
          now: '2026-10-15T00:00:00Z', // 14 / 20 days = 70% elapsed (> 60% locked!)
        });

        expect(report.sprintName).toBe('Sprint 2026-Q4');
        expect(report.isActive).toBe(true);
        expect(report.rollingVelocity3Sprint).toBe(22.5); // (25 + 20) / 2
        expect(report.committedPoints).toBe(30);
        expect(report.currentSprintPoints).toBe(35); // 15 + 10 + 10
        expect(report.completedPoints).toBe(15);
        expect(report.inProgressPoints).toBe(10);
        expect(report.remainingPoints).toBe(20); // 10 + 10
        expect(report.pointsAddedMidSprint).toBe(10);
        expect(report.scopeCreepPercent).toBeCloseTo(33.3, 1); // (10 / 30) * 100
        expect(report.commitmentReliabilityPercent).toBe(50.0); // (15 / 30) * 100
        expect(report.reliabilityStatus).toBe('red');
        expect(report.runwayElapsedRatio).toBe(0.7);
        expect(report.runwayLocked).toBe(true);
        expect(report.capacityRemaining).toBe(0);
        expect(report.velocityTrend).toBe('increasing'); // 35 vs 22.5
      });
    });
  });

  describe('Server Aggregation (sprintAnalyticsServer)', () => {
    it('queries tenant, project sprint settings, and closed sprints to assemble health report', async () => {
      const mockTenant = { id: 't-10', slug: 'pym-energy', name: 'PYM Energy', tier: 'Enterprise' };
      const mockProjects = [
        {
          id: 'p-10',
          settings: {
            sprint_settings: {
              sprints: [
                {
                  id: 'sprint-q4',
                  name: 'Sprint 2026-Q4',
                  status: 'active',
                  start_date: '2026-10-01',
                  end_date: '2026-10-31',
                  committed_points: 40,
                },
                {
                  id: 'sprint-q3',
                  name: 'Sprint 2026-Q3',
                  status: 'completed',
                  start_date: '2026-07-01',
                  end_date: '2026-09-30',
                  completed_points: 35,
                },
                {
                  id: 'sprint-q2',
                  name: 'Sprint 2026-Q2',
                  status: 'completed',
                  start_date: '2026-04-01',
                  end_date: '2026-06-30',
                  completed_points: 25,
                },
              ],
            },
          },
        },
      ];
      const mockItems: any[] = [
        {
          id: 'item-1',
          status: 'complete',
          created_at: '2026-10-01',
          metadata: { sprint: 'Sprint 2026-Q4', story_points: 20 },
        },
        {
          id: 'item-2',
          status: 'in_progress',
          created_at: '2026-10-01',
          metadata: { sprint: 'Sprint 2026-Q4', story_points: 15 },
        },
      ];

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
          };
        }
        if (table === 'sprints') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            or: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockResolvedValue({ data: mockProjects, error: null }),
          };
        }
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockResolvedValue({ data: mockItems, error: null }),
          };
        }
        return {};
      });

      const report = await getSprintHealthReport('pym-energy', 'Sprint 2026-Q4');

      expect(report.sprintName).toBe('Sprint 2026-Q4');
      expect(report.isActive).toBe(true);
      expect(report.rollingVelocity3Sprint).toBe(30.0); // (35 + 25) / 2
      expect(report.committedPoints).toBe(40);
      expect(report.completedPoints).toBe(20);
      expect(report.capacityRemaining).toBe(5); // 40 - (20 + 15)
    });
  });

  describe('Authenticated API Route (GET /api/v1/sprints/analytics)', () => {
    it('returns 401 when request is unauthenticated', async () => {
      (authenticate as any).mockResolvedValue({
        context: null,
        errorResponse: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
      });

      const req = new NextRequest('http://localhost:3000/api/v1/sprints/analytics?sprint_id=sprint-q4');
      const res = await getSprintAnalyticsRoute(req);

      expect(res.status).toBe(401);
    });

    it('returns 403 when accessing another tenant workspace', async () => {
      (authenticate as any).mockResolvedValue({
        context: { tenant: { slug: 'acme-corp' }, userId: 'u-1', role: 'admin' },
        errorResponse: null,
      });

      const req = new NextRequest(
        'http://localhost:3000/api/v1/sprints/analytics?sprint_id=sprint-q4&tenant_slug=malicious-org'
      );
      const res = await getSprintAnalyticsRoute(req);

      expect(res.status).toBe(403);
    });

    it('returns 400 when sprint_id is missing', async () => {
      (authenticate as any).mockResolvedValue({
        context: { tenant: { slug: 'pym-energy' }, userId: 'u-1', role: 'admin' },
        errorResponse: null,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/sprints/analytics');
      const res = await getSprintAnalyticsRoute(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('sprint_id');
    });

    it('returns 200 with sprint telemetry report on valid authenticated request', async () => {
      (authenticate as any).mockResolvedValue({
        context: { tenant: { slug: 'pym-energy' }, userId: 'u-1', role: 'admin' },
        errorResponse: null,
      });

      const mockTenant = { id: 't-10', slug: 'pym-energy', name: 'PYM Energy' };
      const mockProjects = [
        {
          id: 'p-10',
          settings: {
            sprint_settings: {
              sprints: [
                {
                  id: 'sprint-q4',
                  name: 'Sprint 2026-Q4',
                  status: 'active',
                  committed_points: 30,
                },
              ],
            },
          },
        },
      ];

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
          };
        }
        if (table === 'sprints') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            order: vi.fn().mockReturnThis(),
            limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            or: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockResolvedValue({ data: mockProjects, error: null }),
          };
        }
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
        }
        return {};
      });

      const req = new NextRequest(
        'http://localhost:3000/api/v1/sprints/analytics?sprint_id=sprint-q4'
      );
      const res = await getSprintAnalyticsRoute(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.sprintId).toBe('sprint-q4');
      expect(json.committedPoints).toBe(30);
    });
  });
});
