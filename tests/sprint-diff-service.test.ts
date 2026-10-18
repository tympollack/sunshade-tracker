import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  computeSnapshotItemDiff,
  normalizeSnapshotItem,
  SprintDiffService,
} from '@/lib/services/sprintDiffService';
import { GET as getDiffHandler } from '@/app/api/v1/sprints/[sprintId]/diff/route';
import { supabaseAdmin } from '@/lib/db';
import * as authGuard from '@/lib/auth-guard';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('TASK-TRK-DIFF-CALCULATION-SERVICE: Snapshot Delta Computation Engine', () => {
  describe('normalizeSnapshotItem', () => {
    it('normalizes raw data and extracts story points from various fields', () => {
      const item1 = normalizeSnapshotItem({
        id: 'item-1',
        title: 'Task 1',
        story_points: 5,
        status: 'in_progress',
      });
      expect(item1.story_points).toBe(5);
      expect(item1.title).toBe('Task 1');

      const item2 = normalizeSnapshotItem({
        id: 'item-2',
        title: 'Task 2',
        metadata: { story_points: 8, external_ref_id: 'TASK-2' },
      });
      expect(item2.story_points).toBe(8);
      expect(item2.external_ref_id).toBe('TASK-2');
    });

    it('handles null/undefined gracefully', () => {
      const empty = normalizeSnapshotItem(null);
      expect(empty.id).toBe('');
      expect(empty.story_points).toBe(0);
    });
  });

  describe('computeSnapshotItemDiff (pure engine)', () => {
    it('returns empty diff with net 0 change when comparing identical snapshots', () => {
      const items = [
        { id: 'item-1', title: 'Task 1', status: 'not_started', story_points: 3 },
        { id: 'item-2', title: 'Task 2', status: 'in_progress', story_points: 5 },
      ];

      const diff = computeSnapshotItemDiff(items, items);

      expect(diff.injected).toHaveLength(0);
      expect(diff.ejected).toHaveLength(0);
      expect(diff.estimate_drift).toHaveLength(0);
      expect(diff.status_drift).toHaveLength(0);
      expect(diff.net_points_delta).toBe(0);
      expect(diff.churn_rate_pct).toBe(0);
    });

    it('correctly classifies injected cards (in target but absent in base)', () => {
      const baseItems = [
        { id: 'item-1', title: 'Task 1', status: 'not_started', story_points: 3 },
      ];
      const targetItems = [
        { id: 'item-1', title: 'Task 1', status: 'not_started', story_points: 3 },
        { id: 'item-2', title: 'Task 2 (Injected)', status: 'in_progress', story_points: 5 },
      ];

      const diff = computeSnapshotItemDiff(baseItems, targetItems);

      expect(diff.injected).toHaveLength(1);
      expect(diff.injected[0].id).toBe('item-2');
      expect(diff.ejected).toHaveLength(0);
      expect(diff.injected_points).toBe(5);
      expect(diff.net_points_delta).toBe(5);
      // Churn rate: 5 / 3 * 100 = 166.7%
      expect(diff.churn_rate_pct).toBe(166.7);
    });

    it('correctly classifies ejected cards (in base but absent in target)', () => {
      const baseItems = [
        { id: 'item-1', title: 'Task 1', status: 'not_started', story_points: 3 },
        { id: 'item-2', title: 'Task 2', status: 'in_progress', story_points: 5 },
      ];
      const targetItems = [
        { id: 'item-1', title: 'Task 1', status: 'not_started', story_points: 3 },
      ];

      const diff = computeSnapshotItemDiff(baseItems, targetItems);

      expect(diff.injected).toHaveLength(0);
      expect(diff.ejected).toHaveLength(1);
      expect(diff.ejected[0].id).toBe('item-2');
      expect(diff.ejected_points).toBe(5);
      expect(diff.net_points_delta).toBe(-5);
      // Churn rate: 5 / 8 * 100 = 62.5%
      expect(diff.churn_rate_pct).toBe(62.5);
    });

    it('correctly calculates estimate drift on re-estimated cards', () => {
      const baseItems = [
        { id: 'item-1', title: 'Task 1', status: 'not_started', story_points: 3 },
      ];
      const targetItems = [
        { id: 'item-1', title: 'Task 1', status: 'not_started', story_points: 8 },
      ];

      const diff = computeSnapshotItemDiff(baseItems, targetItems);

      expect(diff.injected).toHaveLength(0);
      expect(diff.ejected).toHaveLength(0);
      expect(diff.estimate_drift).toHaveLength(1);
      expect(diff.estimate_drift[0].base_points).toBe(3);
      expect(diff.estimate_drift[0].target_points).toBe(8);
      expect(diff.estimate_drift[0].delta).toBe(5);
      expect(diff.net_points_delta).toBe(5);
    });

    it('correctly calculates status drift on cards whose status evolved', () => {
      const baseItems = [
        { id: 'item-1', title: 'Task 1', status: 'not_started', story_points: 3 },
      ];
      const targetItems = [
        { id: 'item-1', title: 'Task 1', status: 'complete', story_points: 3 },
      ];

      const diff = computeSnapshotItemDiff(baseItems, targetItems);

      expect(diff.status_drift).toHaveLength(1);
      expect(diff.status_drift[0].base_status).toBe('not_started');
      expect(diff.status_drift[0].target_status).toBe('complete');
    });

    it('computes composite diff across all categories simultaneously', () => {
      const baseItems = [
        { id: 'item-1', title: 'Keep Same', status: 'not_started', story_points: 2 },
        { id: 'item-2', title: 'Dropped', status: 'not_started', story_points: 5 },
        { id: 'item-3', title: 'Re-estimated', status: 'not_started', story_points: 3 },
      ];
      const targetItems = [
        { id: 'item-1', title: 'Keep Same', status: 'not_started', story_points: 2 },
        { id: 'item-3', title: 'Re-estimated', status: 'in_progress', story_points: 5 }, // +2 pts, status drift
        { id: 'item-4', title: 'Injected', status: 'not_started', story_points: 8 }, // +8 pts injected
      ];

      const diff = computeSnapshotItemDiff(baseItems, targetItems);

      expect(diff.injected).toHaveLength(1);
      expect(diff.injected[0].id).toBe('item-4');
      expect(diff.ejected).toHaveLength(1);
      expect(diff.ejected[0].id).toBe('item-2');
      expect(diff.estimate_drift).toHaveLength(1);
      expect(diff.estimate_drift[0].delta).toBe(2);
      expect(diff.status_drift).toHaveLength(1);

      // net_points_delta: +8 (injected) - 5 (ejected) + 2 (drift) = +5
      expect(diff.net_points_delta).toBe(5);
      // churn: (8 + 5) / 10 * 100 = 130%
      expect(diff.churn_rate_pct).toBe(130);
    });
  });

  describe('API Route: GET /api/v1/sprints/[sprintId]/diff', () => {
    beforeEach(() => {
      vi.clearAllMocks();
    });

    it('returns 401 when user is not authenticated', async () => {
      vi.spyOn(authGuard, 'authenticate').mockResolvedValue({
        errorResponse: new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }) as any,
        context: null as any,
      });

      const req = new NextRequest('http://localhost:3000/api/v1/sprints/s-1/diff');
      const res = await getDiffHandler(req, { params: Promise.resolve({ sprintId: 's-1' }) });

      expect(res.status).toBe(401);
    });

    it('returns 403 on cross-tenant slug mismatch', async () => {
      vi.spyOn(authGuard, 'authenticate').mockResolvedValue({
        errorResponse: null as any,
        context: {
          tenant: { id: 'tenant-1', slug: 'my-org' } as any,
          userId: 'user-1',
          role: 'member',
        },
      });

      const req = new NextRequest('http://localhost:3000/api/v1/sprints/s-1/diff?tenant_slug=other-org');
      const res = await getDiffHandler(req, { params: Promise.resolve({ sprintId: 's-1' }) });

      expect(res.status).toBe(403);
    });

    it('returns structured JSON diff when authenticated', async () => {
      vi.spyOn(authGuard, 'authenticate').mockResolvedValue({
        errorResponse: null as any,
        context: {
          tenant: { id: 'tenant-1', slug: 'my-org' } as any,
          userId: 'user-1',
          role: 'member',
        },
      });

      const mockSnapshots = [
        {
          id: 'snap-baseline',
          sprint_id: 'sprint-q4',
          snapshot_type: 'commitment_baseline',
          committed_points: 10,
          captured_at: '2026-10-01T00:00:00Z',
          assignee_breakdown: {
            items: [
              { id: 'it-1', title: 'Task 1', status: 'not_started', story_points: 5 },
              { id: 'it-2', title: 'Task 2', status: 'not_started', story_points: 5 },
            ],
          },
        },
      ];

      const mockLiveItems = [
        { id: 'it-1', title: 'Task 1', status: 'complete', metadata: { sprint: 'sprint-q4', story_points: 5 } },
        { id: 'it-3', title: 'Injected Task', status: 'in_progress', metadata: { sprint: 'sprint-q4', story_points: 3 } },
      ];

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'sprint_snapshots') {
          const snapQueryBuilder: any = {
            eq: vi.fn().mockImplementation(() => snapQueryBuilder),
            or: vi.fn().mockImplementation(() => snapQueryBuilder),
            in: vi.fn().mockImplementation(() => snapQueryBuilder),
            order: vi.fn().mockResolvedValue({ data: mockSnapshots, error: null }),
          };
          return { select: vi.fn().mockReturnValue(snapQueryBuilder) };
        }
        if (table === 'sprints') {
          const sprintQueryBuilder: any = {
            eq: vi.fn().mockImplementation(() => sprintQueryBuilder),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'sprint-q4', name: 'Sprint Q4' }, error: null }),
          };
          return { select: vi.fn().mockReturnValue(sprintQueryBuilder) };
        }
        if (table === 'work_items') {
          const itemsQueryBuilder: any = {
            eq: vi.fn().mockImplementation(() => itemsQueryBuilder),
            is: vi.fn().mockResolvedValue({ data: mockLiveItems, error: null }),
          };
          return { select: vi.fn().mockReturnValue(itemsQueryBuilder) };
        }
        return { select: vi.fn().mockReturnValue({ data: [], error: null }) };
      });

      const req = new NextRequest('http://localhost:3000/api/v1/sprints/sprint-q4/diff');
      const res = await getDiffHandler(req, { params: Promise.resolve({ sprintId: 'sprint-q4' }) });

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.diff).toBeDefined();
      expect(json.diff.injected).toHaveLength(1);
      expect(json.diff.injected[0].id).toBe('it-3');
      expect(json.diff.ejected).toHaveLength(1);
      expect(json.diff.ejected[0].id).toBe('it-2');
      expect(json.diff.status_drift).toHaveLength(1);
      expect(json.diff.status_drift[0].target_status).toBe('complete');
    });

    it('resolves project slug to UUID and enforces project scoping to prevent cross-project item leakage', async () => {
      let queriedProjectId: string | undefined = undefined;

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'uuid-project-123' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'sprint_snapshots') {
          const snapQuery: any = {
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              if (col === 'project_id') queriedProjectId = val;
              return snapQuery;
            }),
            in: vi.fn().mockImplementation(() => snapQuery),
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'snap-1',
                  project_id: 'uuid-project-123',
                  sprint_id: 'sprint-scoped',
                  snapshot_type: 'commitment_baseline',
                  assignee_breakdown: { items: [{ id: 'it-1', status: 'not_started', story_points: 3 }] },
                },
              ],
              error: null,
            }),
          };
          return { select: vi.fn().mockReturnValue(snapQuery) };
        }
        if (table === 'sprints') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'sprint-scoped', name: 'Sprint Scoped', project_id: 'uuid-project-123' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'work_items') {
          const itemQuery: any = {
            eq: vi.fn().mockImplementation((col: string, val: string) => {
              if (col === 'project_id') queriedProjectId = val;
              return itemQuery;
            }),
            in: vi.fn().mockImplementation(() => itemQuery),
            is: vi.fn().mockResolvedValue({
              data: [
                { id: 'it-1', title: 'Task 1', status: 'complete', metadata: { sprint: 'sprint-scoped', story_points: 3 } },
              ],
              error: null,
            }),
          };
          return { select: vi.fn().mockReturnValue(itemQuery) };
        }
        return { select: vi.fn().mockReturnValue({ data: [], error: null }) };
      });

      const { data, error } = await SprintDiffService.getSprintSnapshotDiff('tenant-1', 'sprint-scoped', {
        projectId: 'web-app-slug',
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(queriedProjectId).toBe('uuid-project-123');
    });

    it('reconstructs historical item states using events when snapshots lack itemized breakdown', async () => {
      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'sprint_snapshots') {
          const snapQuery: any = {
            eq: vi.fn().mockImplementation(() => snapQuery),
            in: vi.fn().mockImplementation(() => snapQuery),
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'snap-historical',
                  project_id: 'proj-1',
                  sprint_id: 'sprint-q4',
                  snapshot_type: 'daily_rollup',
                  committed_item_ids: ['item-10'],
                  captured_at: '2026-10-02T00:00:00Z', // Snapshot date
                  assignee_breakdown: {}, // No direct items array
                },
              ],
              error: null,
            }),
          };
          return { select: vi.fn().mockReturnValue(snapQuery) };
        }
        if (table === 'work_items') {
          const itemQuery: any = {
            eq: vi.fn().mockImplementation(() => itemQuery),
            in: vi.fn().mockResolvedValue({
              data: [
                {
                  id: 'item-10',
                  title: 'Evolving item',
                  status: 'complete', // Current status today is complete
                  created_at: '2026-10-01T00:00:00Z', // Existed at snapshot time
                  metadata: { story_points: 8 }, // Current estimate today is 8
                },
              ],
              error: null,
            }),
            is: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
          return { select: vi.fn().mockReturnValue(itemQuery) };
        }
        if (table === 'sprint_events') {
          const evQuery: any = {
            in: vi.fn().mockReturnThis(),
            gt: vi.fn().mockReturnThis(),
            order: vi.fn().mockResolvedValue({
              data: [
                {
                  work_item_id: 'item-10',
                  event_type: 'status_transition',
                  previous_state: { status: 'in_progress' },
                  new_state: { status: 'complete' },
                  occurred_at: '2026-10-05T00:00:00Z', // Completed after snapshot
                },
                {
                  work_item_id: 'item-10',
                  event_type: 'estimate_change',
                  previous_state: { points: 5 },
                  new_state: { points: 8 },
                  points_delta: 3,
                  occurred_at: '2026-10-04T00:00:00Z', // Points increased after snapshot
                },
              ],
              error: null,
            }),
          };
          return { select: vi.fn().mockReturnValue(evQuery) };
        }
        return { select: vi.fn().mockReturnValue({ data: [], error: null }) };
      });

      const { data, error } = await SprintDiffService.getSprintSnapshotDiff('tenant-1', 'sprint-q4', {
        baseSnapshotId: 'snap-historical',
        targetSnapshotId: 'snap-historical',
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      expect(data?.base_snapshot?.total_points).toBe(5); // Rolled back from 8 to 5
    });

    it('treats metadata sprint as authoritative over stale direct sprint_id column', async () => {
      const mockSnapshots = [
        {
          id: 'snap-baseline',
          sprint_id: 'sprint-q4',
          snapshot_type: 'commitment_baseline',
          committed_points: 0,
          captured_at: '2026-10-01T00:00:00Z',
          assignee_breakdown: { items: [] },
        },
      ];

      const mockLiveItems = [
        // Item 1: metadata says sprint-q4, stale relational column says sprint-q3 -> SHOULD be in sprint-q4
        {
          id: 'item-authoritative-q4',
          title: 'Authoritative Q4',
          status: 'not_started',
          sprint_id: 'sprint-q3',
          metadata: { sprint: 'sprint-q4', sprint_id: 'sprint-q4', story_points: 3 },
        },
        // Item 2: metadata says sprint-q3, stale relational column says sprint-q4 -> should NOT be in sprint-q4
        {
          id: 'item-moved-to-q3',
          title: 'Moved to Q3',
          status: 'not_started',
          sprint_id: 'sprint-q4',
          metadata: { sprint: 'sprint-q3', sprint_id: 'sprint-q3', story_points: 5 },
        },
        // Item 3: metadata cleared to backlog, stale relational column says sprint-q4 -> should NOT be in sprint-q4
        {
          id: 'item-moved-to-backlog',
          title: 'Moved to Backlog',
          status: 'not_started',
          sprint_id: 'sprint-q4',
          metadata: { sprint: null, story_points: 2 },
        },
      ];

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'sprint_snapshots') {
          const snapQueryBuilder: any = {
            eq: vi.fn().mockImplementation(() => snapQueryBuilder),
            or: vi.fn().mockImplementation(() => snapQueryBuilder),
            in: vi.fn().mockImplementation(() => snapQueryBuilder),
            order: vi.fn().mockResolvedValue({ data: mockSnapshots, error: null }),
          };
          return { select: vi.fn().mockReturnValue(snapQueryBuilder) };
        }
        if (table === 'sprints') {
          const sprintQueryBuilder: any = {
            eq: vi.fn().mockImplementation(() => sprintQueryBuilder),
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'sprint-q4', name: 'Sprint Q4' }, error: null }),
          };
          return { select: vi.fn().mockReturnValue(sprintQueryBuilder) };
        }
        if (table === 'work_items') {
          const itemsQueryBuilder: any = {
            eq: vi.fn().mockImplementation(() => itemsQueryBuilder),
            is: vi.fn().mockResolvedValue({ data: mockLiveItems, error: null }),
          };
          return { select: vi.fn().mockReturnValue(itemsQueryBuilder) };
        }
        return { select: vi.fn().mockReturnValue({ data: [], error: null }) };
      });

      const { data, error } = await SprintDiffService.getSprintSnapshotDiff('tenant-1', 'sprint-q4', {
        baseSnapshotId: 'snap-baseline',
        targetSnapshotId: 'live',
      });

      expect(error).toBeNull();
      expect(data).toBeDefined();
      // Target snapshot should contain exclusively item-authoritative-q4
      expect(data?.target_snapshot?.total_items).toBe(1);
      expect(data?.target_snapshot?.total_points).toBe(3);
      expect(data?.injected.map((i) => i.id)).toEqual(['item-authoritative-q4']);
    });
  });
});
