import { describe, it, expect, vi, beforeEach } from 'vitest';
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
        return {
          select: vi.fn().mockReturnValue({
            data: mockProjects,
            error: null,
          }),
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
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              neq: vi.fn().mockResolvedValue({
                data: mockItems,
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'sprint_events') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gte: vi.fn().mockResolvedValue({
                data: mockEvents,
                error: null,
              }),
            }),
          }),
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
});
