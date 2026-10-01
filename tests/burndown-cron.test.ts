import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/cron/burndown-rollup/route';
import { supabaseAdmin } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('TASK-TRK-BURNDOWN-CRON: /api/cron/burndown-rollup', () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'super-secret-cron-token';
  });

  afterAll(() => {
    process.env.CRON_SECRET = originalCronSecret;
  });

  it('rejects requests with missing or invalid bearer token with 401', async () => {
    const reqNoAuth = new NextRequest('http://localhost:3000/api/cron/burndown-rollup', {
      method: 'POST',
    });
    const resNoAuth = await POST(reqNoAuth);
    expect(resNoAuth.status).toBe(401);
    const dataNoAuth = await resNoAuth.json();
    expect(dataNoAuth.error).toContain('Unauthorized');

    const reqWrongAuth = new NextRequest('http://localhost:3000/api/cron/burndown-rollup', {
      method: 'POST',
      headers: {
        authorization: 'Bearer wrong-token',
      },
    });
    const resWrongAuth = await POST(reqWrongAuth);
    expect(resWrongAuth.status).toBe(401);
  });

  it('processes active sprints, computes ideal burn, and upserts snapshots', async () => {
    const mockProjects = [
      {
        id: 'proj-1',
        tenant_id: 'tenant-1',
        name: 'Alpha Project',
        slug: 'alpha',
        settings: {
          sprint_settings: {
            sprints: [
              {
                id: 'sprint-q4',
                name: 'Sprint 2026-Q4',
                is_active: true,
                start_date: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
                end_date: new Date(Date.now() + 9 * 24 * 60 * 60 * 1000).toISOString(),
                committed_points: 30,
              },
            ],
          },
        },
      },
    ];

    const mockItems = [
      {
        id: 'item-1',
        status: 'in_progress',
        metadata: { sprint: 'Sprint 2026-Q4', story_points: 8 },
        assignee: 'user-alice',
      },
      {
        id: 'item-2',
        status: 'not_started',
        metadata: { sprint: 'Sprint 2026-Q4', story_points: 12 },
        assignee: 'user-bob',
      },
    ];

    const mockEvents = [
      {
        actor_id: 'user-alice',
        points_delta: 5,
        event_type: 'status_transition',
        occurred_at: new Date().toISOString(),
      },
    ];

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'projects') {
        const projQuery: any = {
          is: vi.fn().mockImplementation(() => projQuery),
          data: mockProjects,
          error: null,
        };
        projQuery.then = (onRes: any) => Promise.resolve({ data: mockProjects, error: null }).then(onRes);
        return {
          select: vi.fn().mockReturnValue(projQuery),
        };
      }
      if (table === 'sprints') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockResolvedValue({
                data: [],
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'work_items') {
        const itemQuery: any = {
          eq: vi.fn().mockImplementation(() => itemQuery),
          is: vi.fn().mockImplementation(() => itemQuery),
          neq: vi.fn().mockImplementation(() => itemQuery),
        };
        itemQuery.then = (onRes: any) => Promise.resolve({ data: mockItems, error: null }).then(onRes);
        return {
          select: vi.fn().mockReturnValue(itemQuery),
        };
      }
      if (table === 'sprint_events') {
        const eventsBuilder: any = {
          eq: vi.fn().mockImplementation(() => eventsBuilder),
          gte: vi.fn().mockResolvedValue({
            data: mockEvents,
            error: null,
          }),
        };
        return {
          select: vi.fn().mockReturnValue(eventsBuilder),
        };
      }
      if (table === 'sprint_snapshots') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { committed_points: 30, committed_item_ids: ['item-1', 'item-2'] },
                    error: null,
                  }),
                  gte: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: null, // No snapshot for today yet
                      error: null,
                    }),
                  }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({
                data: { id: 'snap-123' },
                error: null,
              }),
            }),
          }),
          update: vi.fn().mockReturnValue({
            eq: vi.fn().mockResolvedValue({ error: null }),
          }),
        };
      }

      return {
        select: vi.fn().mockReturnValue({ data: [], error: null }),
      };
    });

    const req = new NextRequest('http://localhost:3000/api/cron/burndown-rollup', {
      method: 'POST',
      headers: {
        authorization: 'Bearer super-secret-cron-token',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.rollups_processed).toBe(1);
    expect(data.rollups[0].sprint_id).toBe('sprint-q4');
    expect(data.rollups[0].remaining_points).toBe(20);
    expect(data.rollups[0].committed_points).toBe(30);
    expect(data.rollups[0].actor_attribution['user-alice']).toBe(5);
    expect(data.rollups[0].snapshot_id).toBe('snap-123');
  });

  it('preserves zero committed points baseline and excludes archived projects', async () => {
    const mockProjects = [
      {
        id: 'proj-archived',
        tenant_id: 'tenant-1',
        name: 'Archived Project',
        slug: 'archived',
        settings: {
          archived: true,
          sprint_settings: {
            sprints: [{ id: 'sprint-archived', is_active: true }],
          },
        },
      },
      {
        id: 'proj-active',
        tenant_id: 'tenant-1',
        name: 'Active Zero Commit Project',
        slug: 'active-zero',
        settings: {
          sprint_settings: {
            sprints: [
              {
                id: 'sprint-zero',
                name: 'Zero Commit Sprint',
                is_active: true,
                start_date: new Date().toISOString(),
                end_date: new Date(Date.now() + 14 * 86400000).toISOString(),
                committed_points: 0,
              },
            ],
          },
        },
      },
    ];

    // Parent item (8 pts) has child item (8 pts); done item (5 pts) should be excluded
    const mockItems = [
      {
        id: 'parent-1',
        status: 'in_progress',
        metadata: { sprint: 'Zero Commit Sprint', story_points: 8 },
      },
      {
        id: 'child-1',
        parent_id: 'parent-1',
        status: 'in_progress',
        metadata: { sprint: 'Zero Commit Sprint', story_points: 8 },
      },
      {
        id: 'item-done',
        status: 'done', // Should be excluded as completed
        metadata: { sprint: 'Zero Commit Sprint', story_points: 5 },
      },
    ];

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'projects') {
        const projQuery: any = {
          is: vi.fn().mockImplementation(() => projQuery),
          data: mockProjects,
          error: null,
        };
        projQuery.then = (onRes: any) => Promise.resolve({ data: mockProjects, error: null }).then(onRes);
        return { select: vi.fn().mockReturnValue(projQuery) };
      }
      if (table === 'sprints') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              or: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        };
      }
      if (table === 'work_items') {
        const itemQuery: any = {
          eq: vi.fn().mockImplementation(() => itemQuery),
          is: vi.fn().mockImplementation(() => itemQuery),
        };
        itemQuery.then = (onRes: any) => Promise.resolve({ data: mockItems, error: null }).then(onRes);
        return { select: vi.fn().mockReturnValue(itemQuery) };
      }
      if (table === 'sprint_events') {
        const eventsBuilder: any = {
          eq: vi.fn().mockImplementation(() => eventsBuilder),
          gte: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
        return { select: vi.fn().mockReturnValue(eventsBuilder) };
      }
      if (table === 'sprint_snapshots') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { committed_points: 0, committed_item_ids: [] }, // baseline committed_points is 0!
                    error: null,
                  }),
                  gte: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                  }),
                }),
              }),
            }),
          }),
          insert: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'snap-zero' }, error: null }),
            }),
          }),
          update: vi.fn().mockReturnValue({ eq: vi.fn().mockResolvedValue({ error: null }) }),
        };
      }
      return { select: vi.fn().mockReturnValue({ data: [], error: null }) };
    });

    const req = new NextRequest('http://localhost:3000/api/cron/burndown-rollup', {
      method: 'POST',
      headers: { authorization: 'Bearer super-secret-cron-token' },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.rollups_processed).toBe(1);
    // Only the active project processed; archived project was skipped
    expect(data.rollups[0].project_id).toBe('proj-active');
    // Committed points baseline should stay 0 and NOT fallback to remaining_points (8)
    expect(data.rollups[0].committed_points).toBe(0);
    // Remaining points: only child-1 (8 pts) counted; parent-1 deduplicated, done item excluded
    expect(data.rollups[0].remaining_points).toBe(8);
  });
});
