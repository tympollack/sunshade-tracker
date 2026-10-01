import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import { aggregateSprintBurndown } from '@/lib/analytics/burndown-aggregator';
import { WorkItem } from '@/types/tracker';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('FEAT-TRK-LEAF-NODE-SUM-CALC: Burndown Aggregator & Cron Rollup', () => {
  const originalCronSecret = process.env.CRON_SECRET;

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.CRON_SECRET = 'test-cron-secret';
  });

  afterAll(() => {
    process.env.CRON_SECRET = originalCronSecret;
  });

  const createItem = (
    id: string,
    parentId: string | null,
    points: number,
    status: string = 'in_progress'
  ): WorkItem => ({
    id,
    tenant_id: 't-1',
    project_id: 'p-1',
    parent_id: parentId,
    external_ref_id: id,
    title: `Task ${id}`,
    item_type: parentId === null ? 'story' : 'task',
    status,
    order_index: 1000,
    metadata: { story_points: points, sprint: 'Sprint 1' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  it('calculates burndown snapshot metrics strictly from leaf execution items', () => {
    // Story (8 pts) has 2 child tasks: Task 1 (3 pts, done), Task 2 (5 pts, in_progress)
    const story = createItem('story-1', null, 8);
    const task1 = createItem('task-1', 'story-1', 3, 'done');
    const task2 = createItem('task-2', 'story-1', 5, 'in_progress');

    const sprintItems = [story, task1, task2];
    const snapshot = aggregateSprintBurndown(sprintItems, '2026-09-17');

    expect(snapshot.date).toBe('2026-09-17');
    expect(snapshot.totalPoints).toBe(8); // 3 + 5 = 8 (leaves only)
    expect(snapshot.completedPoints).toBe(3); // task1
    expect(snapshot.remainingPoints).toBe(5); // task2
    expect(snapshot.leafItemCount).toBe(2);
    expect(snapshot.completedLeafCount).toBe(1);
    expect(snapshot.totalItemCount).toBe(3);
  });

  it('recognizes custom terminal completion statuses like shipped and resolved', () => {
    const task1 = createItem('task-1', null, 3, 'shipped');
    const task2 = createItem('task-2', null, 5, 'in_progress');

    const snapshot = aggregateSprintBurndown([task1, task2], '2026-09-17');
    expect(snapshot.totalPoints).toBe(8);
    expect(snapshot.completedPoints).toBe(3);
    expect(snapshot.remainingPoints).toBe(5);
    expect(snapshot.completedLeafCount).toBe(1);
  });

  it('recognizes custom schema terminal completion status absent from DEFAULT_COMPLETED_STATUS_IDS', () => {
    // 'released' is not in DEFAULT_COMPLETED_STATUS_IDS
    const task1 = createItem('task-1', null, 4, 'released');
    const task2 = createItem('task-2', null, 6, 'in_progress');

    const customStatuses = [
      { id: 'todo', label: 'To Do' },
      { id: 'in_progress', label: 'In Progress' },
      { id: 'released', label: 'Released', is_completed: true },
    ];

    const snapshot = aggregateSprintBurndown([task1, task2], '2026-09-17', customStatuses);
    expect(snapshot.totalPoints).toBe(10);
    expect(snapshot.completedPoints).toBe(4);
    expect(snapshot.remainingPoints).toBe(6);
    expect(snapshot.completedLeafCount).toBe(1);
  });

  it('aggregates cron endpoint rollups for active sprints using custom project schema completion statuses', async () => {
    const { supabaseAdmin } = await import('@/lib/db');
    const { POST } = await import('@/app/api/cron/burndown-rollup/route');

    const mockProjects = [
      {
        id: 'proj-1',
        tenant_id: 't-1',
        slug: 'sunshade-tracker',
        name: 'Tracker',
        settings: {
          statuses: [
            { id: 'todo', label: 'To Do' },
            { id: 'released', label: 'Released', is_completed: true },
          ],
          sprint_settings: {
            sprints: [
              { id: 'sprint-q3', name: 'Sprint 2026-Q3', status: 'active', is_active: true, is_current: true },
            ],
          },
        },
      },
    ];

    const mockItems = [
      createItem('epic-1', null, 13),
      createItem('leaf-1', 'epic-1', 5, 'released'), // custom schema completion status absent from defaults
      createItem('leaf-2', 'epic-1', 8, 'todo'),
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
                data: mockItems.map((it) => ({
                  ...it,
                  metadata: { ...it.metadata, sprint: 'Sprint 2026-Q3' },
                })),
                error: null,
              }),
            }),
          }),
        };
      }
      if (table === 'sprint_events') {
        const eventsBuilder: any = {
          eq: vi.fn().mockImplementation(() => eventsBuilder),
          gte: vi.fn().mockResolvedValue({
            data: [],
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
                    data: { committed_points: 13, committed_item_ids: ['leaf-1', 'leaf-2'] },
                    error: null,
                  }),
                  gte: vi.fn().mockReturnValue({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: null,
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
      return { select: vi.fn().mockReturnThis() };
    });

    const req = new NextRequest('http://localhost:3000/api/cron/burndown-rollup', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-cron-secret',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.rollups_processed).toBe(1);
    expect(data.rollups[0].sprint_id).toBe('sprint-q3');
    expect(data.rollups[0].remaining_points).toBe(26);
  });
});
