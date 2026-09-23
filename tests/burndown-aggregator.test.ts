import { describe, it, expect, vi, beforeEach } from 'vitest';
import { aggregateSprintBurndown } from '@/lib/analytics/burndown-aggregator';
import { WorkItem } from '@/types/tracker';
import { NextRequest } from 'next/server';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('FEAT-TRK-LEAF-NODE-SUM-CALC: Burndown Aggregator & Cron Rollup', () => {
  beforeEach(() => {
    vi.clearAllMocks();
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

  it('aggregates cron endpoint rollups for active sprints', async () => {
    const { supabaseAdmin } = await import('@/lib/db');
    const { POST } = await import('@/app/api/cron/burndown-rollup/route');

    const mockProjects = [
      {
        id: 'proj-1',
        slug: 'sunshade-tracker',
        name: 'Tracker',
        settings: {
          sprint_settings: {
            sprints: [
              { name: 'Sprint 2026-Q3', status: 'active', is_current: true },
            ],
          },
        },
      },
    ];

    const mockItems = [
      createItem('epic-1', null, 13),
      createItem('leaf-1', 'epic-1', 5, 'done'),
      createItem('leaf-2', 'epic-1', 8, 'todo'),
    ];

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({ data: mockProjects, error: null }),
        };
      }
      if (table === 'work_items') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockResolvedValue({
            data: mockItems.map((it) => ({
              ...it,
              metadata: { ...it.metadata, sprint: 'Sprint 2026-Q3' },
            })),
            error: null,
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    const req = new NextRequest('http://localhost:3000/api/cron/burndown-rollup', {
      method: 'POST',
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data.success).toBe(true);
    expect(data.rollupsCount).toBe(1);
    expect(data.rollups[0].sprintName).toBe('Sprint 2026-Q3');
    expect(data.rollups[0].metrics.totalPoints).toBe(13); // 5 + 8 leaf points
    expect(data.rollups[0].metrics.completedPoints).toBe(5); // leaf-1 done
    expect(data.rollups[0].metrics.remainingPoints).toBe(8); // leaf-2 todo
  });
});
