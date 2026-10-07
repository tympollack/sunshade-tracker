import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth-guard', () => ({
  authenticate: vi.fn(),
}));

// Mock supabaseAdmin
const mockTenant = {
  id: 'tenant-100',
  slug: 'pym-energy',
  name: 'Pym Energy',
  settings: {
    velocity_conversion: {
      default_hours_per_point: 2.5,
    },
  },
  created_at: '2026-01-01T00:00:00.000Z',
};

const mockProjects = [
  {
    id: 'proj-alpha',
    slug: 'awesomany',
    name: 'Awesomany App',
    tenant_id: 'tenant-100',
    settings: {
      velocity_ratio: 3.0, // Project override
      statuses: [{ id: 'done', label: 'Done' }],
    },
  },
  {
    id: 'proj-beta',
    slug: 'core-infra',
    name: 'Core Infrastructure',
    tenant_id: 'tenant-100',
    settings: {
      // Inherits workspace default (2.5)
      statuses: [{ id: 'complete', label: 'Complete' }],
    },
  },
];

const mockWorkItems = [
  // Proj Alpha (Awesomany, ratio 3.0):
  // Item 1: Planned Story (Leaf), 5 pts, 12 logged hours
  {
    id: 'item-1',
    project_id: 'proj-alpha',
    parent_id: null,
    external_ref_id: 'TASK-TRK-AUTH',
    item_type: 'task',
    status: 'done',
    title: 'Implement OAuth Flow',
    metadata: {
      story_points: 5,
      completed_at: '2026-10-02T12:00:00.000Z',
    },
    created_at: '2026-09-20T00:00:00.000Z',
    updated_at: '2026-10-02T12:00:00.000Z',
  },
  // Item 2: Mid-sprint Bug (Churn), 2 pts, 8 hours cycle time (no time logs)
  {
    id: 'item-2',
    project_id: 'proj-alpha',
    parent_id: null,
    external_ref_id: 'BUG-TRK-LOGIN',
    item_type: 'bug',
    status: 'done',
    title: 'Fix mobile login redirect loop',
    metadata: {
      story_points: 2,
      completed_at: '2026-10-03T15:00:00.000Z',
      in_progress_at: '2026-10-03T07:00:00.000Z', // 8 hours cycle time
    },
    created_at: '2026-10-01T08:00:00.000Z', // created mid-cycle
    updated_at: '2026-10-03T15:00:00.000Z',
  },
  // Item 3: Container parent item (Story with subtasks), points should NOT count toward planned hours directly
  {
    id: 'item-3-parent',
    project_id: 'proj-beta',
    parent_id: null,
    external_ref_id: 'STORY-TRK-INFRA',
    item_type: 'story',
    status: 'complete',
    title: 'Migrate Redis cluster',
    metadata: {
      story_points: 8,
      completed_at: '2026-10-04T10:00:00.000Z',
    },
    created_at: '2026-09-15T00:00:00.000Z',
    updated_at: '2026-10-04T10:00:00.000Z',
  },
  // Item 4: Leaf subtask of item-3, 3 pts, 6 logged hours
  {
    id: 'item-4-child',
    project_id: 'proj-beta',
    parent_id: 'item-3-parent',
    external_ref_id: 'TASK-TRK-REDIS-CONFIG',
    item_type: 'task',
    status: 'complete',
    title: 'Configure sentinel instances',
    metadata: {
      story_points: 3,
      completed_at: '2026-10-04T09:00:00.000Z',
    },
    created_at: '2026-09-16T00:00:00.000Z',
    updated_at: '2026-10-04T09:00:00.000Z',
  },
];

const mockTimeLogs = [
  // item-1: 12 hours logged (43200 seconds)
  {
    work_item_id: 'item-1',
    duration_seconds: 43200,
  },
  // item-4-child: 6 hours logged (21600 seconds)
  {
    work_item_id: 'item-4-child',
    duration_seconds: 21600,
  },
];

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'tenants') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({ data: mockTenant, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              is: async () => ({ data: mockProjects, error: null }),
            }),
          }),
        };
      }
      if (table === 'work_items') {
        return {
          select: () => ({
            eq: () => ({
              is: async () => ({ data: mockWorkItems, error: null }),
            }),
          }),
        };
      }
      if (table === 'work_item_time_logs') {
        return {
          select: () => ({
            eq: () => ({
              in: async () => ({ data: mockTimeLogs, error: null }),
            }),
          }),
        };
      }
      if (table === 'audit_logs') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: async () => ({ data: [], error: null }),
              }),
            }),
          }),
        };
      }
      return {
        select: () => ({
          eq: async () => ({ data: [], error: null }),
        }),
      };
    }),
  },
}));

describe('TASK-TRK-ESTIMATION-CALIBRATION-SVC: Estimation Calibration Service', () => {
  it('correctly aggregates actual hours, planned envelopes, and empirical ratio k', async () => {
    const { getEstimationCalibrationTelemetry } = await import('@/lib/services/estimationCalibrationService');

    const result = await getEstimationCalibrationTelemetry('pym-energy', {
      startDate: '2026-10-01T00:00:00.000Z',
      endDate: '2026-10-05T23:59:59.999Z',
    });

    expect(result.tenant.slug).toBe('pym-energy');
    expect(result.defaultVelocityRatio).toBe(2.5);

    // Projects breakdown
    expect(result.projects).toHaveLength(2);

    const alpha = result.projects.find((p) => p.projectId === 'proj-alpha')!;
    expect(alpha).toBeDefined();
    expect(alpha.configuredRatio).toBe(3.0); // project override
    expect(alpha.isCustomRatio).toBe(true);
    // Item 1: 5 leaf pts * 3.0 = 15 planned hrs. 12 logged hrs.
    // Item 2: 2 leaf pts * 3.0 = 6 planned hrs. 8 cycle time hrs.
    // Total points = 7. Planned = 21 hrs. Actual = 20 hrs.
    expect(alpha.totalPoints).toBe(7);
    expect(alpha.plannedHours).toBe(21);
    expect(alpha.actualHours).toBe(20);
    // k = 20 / 7 = 2.86
    expect(alpha.empiricalRatio).toBe(2.86);

    // Churn classification
    const item1 = alpha.items.find((i) => i.id === 'item-1')!;
    expect(item1.classification).toBe('planned_scope');
    expect(item1.isChurn).toBe(false);

    const item2 = alpha.items.find((i) => i.id === 'item-2')!;
    expect(item2.classification).toBe('unplanned_churn');
    expect(item2.isChurn).toBe(true);
    expect(item2.churnReason).toBe('bug_hotfix');

    // Container items in Proj Beta:
    // item-3-parent has child, so isLeaf = false -> plannedHours = 0
    // item-4-child is leaf -> 3 pts * 2.5 (workspace default) = 7.5 planned hrs
    const beta = result.projects.find((p) => p.projectId === 'proj-beta')!;
    expect(beta).toBeDefined();
    expect(beta.configuredRatio).toBe(2.5);
    expect(beta.isCustomRatio).toBe(false);
    expect(beta.totalPoints).toBe(3); // only leaf points
    expect(beta.plannedHours).toBe(7.5);
    expect(beta.actualHours).toBe(6);
  });

  it('supports client simulation ratio override', async () => {
    const { getEstimationCalibrationTelemetry } = await import('@/lib/services/estimationCalibrationService');

    const result = await getEstimationCalibrationTelemetry('pym-energy', {
      startDate: '2026-10-01T00:00:00.000Z',
      endDate: '2026-10-05T23:59:59.999Z',
      simulatedRatio: 4.0,
    });

    expect(result.simulatedVelocityRatio).toBe(4.0);
    // Both projects use simulated ratio 4.0
    const alpha = result.projects.find((p) => p.projectId === 'proj-alpha')!;
    expect(alpha.configuredRatio).toBe(4.0);
    expect(alpha.plannedHours).toBe(28); // 7 points * 4.0
  });

  it('guards against division-by-zero when no points or logs exist', async () => {
    const { getEstimationCalibrationTelemetry } = await import('@/lib/services/estimationCalibrationService');

    // Empty date range where no items completed
    const result = await getEstimationCalibrationTelemetry('pym-energy', {
      startDate: '2025-01-01T00:00:00.000Z',
      endDate: '2025-01-02T00:00:00.000Z',
    });

    expect(result.totalPoints).toBe(0);
    expect(result.totalActualHours).toBe(0);
    expect(result.overallEmpiricalRatio).toBe(0);
    expect(result.overallPredictabilityIndex).toBe(100);
    expect(isNaN(result.overallEmpiricalRatio)).toBe(false);
  });
});

describe('TASK-TRK-ESTIMATION-CALIBRATION-SVC: GET /api/v1/statements/calibration Endpoint', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects unauthenticated requests or invalid workspace permissions', async () => {
    const { authenticate } = await import('@/lib/auth-guard');
    const { GET } = await import('@/app/api/v1/statements/calibration/route');

    (authenticate as any).mockResolvedValue({
      context: {
        tenant: { id: 'tenant-100', slug: 'pym-energy', name: 'Pym Energy' },
        user: { id: 'user-1' },
      },
    });

    // Requesting different tenant slug than authenticated
    const req = new NextRequest(
      'http://localhost:3000/api/v1/statements/calibration?tenant_slug=forbidden-tenant'
    );
    const res = await GET(req);
    expect(res.status).toBe(403);
  });

  it('validates start and end dates and returns 400 on malformed input', async () => {
    const { authenticate } = await import('@/lib/auth-guard');
    const { GET } = await import('@/app/api/v1/statements/calibration/route');

    (authenticate as any).mockResolvedValue({
      context: {
        tenant: { id: 'tenant-100', slug: 'pym-energy', name: 'Pym Energy' },
        user: { id: 'user-1' },
      },
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/statements/calibration?tenant_slug=pym-energy&start_date=invalid-date'
    );
    const res = await GET(req);
    expect(res.status).toBe(400);
  });

  it('returns status 200 with calibrated payload for valid request', async () => {
    const { authenticate } = await import('@/lib/auth-guard');
    const { GET } = await import('@/app/api/v1/statements/calibration/route');

    (authenticate as any).mockResolvedValue({
      context: {
        tenant: { id: 'tenant-100', slug: 'pym-energy', name: 'Pym Energy' },
        user: { id: 'user-1' },
      },
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/statements/calibration?tenant_slug=pym-energy&start_date=2026-10-01&end_date=2026-10-05'
    );
    const res = await GET(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.tenant.slug).toBe('pym-energy');
    expect(body.projects).toBeDefined();
    expect(Array.isArray(body.projects)).toBe(true);
  });
});
