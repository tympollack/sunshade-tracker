import { describe, it, expect, vi, beforeEach } from 'vitest';
import { addComment, deleteComment } from '@/app/actions/commentActions';
import { getAdaptiveTickIndices } from '@/components/analytics/CumulativeFlowChart';
import { buildTree, WorkItemNode } from '@/lib/tree';
import { WorkItem, ProjectSettings, MAX_COMMENT_LENGTH } from '@/types/tracker';
import { supabaseAdmin } from '@/lib/db';
import { createServerClient } from '@/lib/supabase-server';

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('PR #90 Devin Review Fixes Verification', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Comment Guardrails & Authorization (Comments 8, 9, 10)', () => {
    it('Comment 10: addComment rejects comment content exceeding 5000 characters', async () => {
      const longComment = 'a'.repeat(MAX_COMMENT_LENGTH + 1);
      const res = await addComment('item-1', longComment);
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/5000/);
    });

    it('Comment 8: deleteComment rejects deletion in read-only public workspace even if author', async () => {
      (createServerClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'author-user-1', email: 'author@sunshade.icu' } },
            error: null,
          }),
        },
      });

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'work_item_comments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'c-1', author_id: 'author-user-1', item_id: 'item-demo' },
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
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'item-demo', tenant_id: 'tenant-demo', deleted_at: null },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'tenants') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'tenant-demo', slug: 'sunshade', tier: 'demo' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await deleteComment('c-1');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/read-only/i);
    });

    it('Comment 9: deleteComment rejects deletion if caller is a regular member and not the author', async () => {
      (createServerClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'regular-member-2', email: 'member@sunshade.icu' } },
            error: null,
          }),
        },
      });

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'work_item_comments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'c-2', author_id: 'different-author-99', item_id: 'item-private' },
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
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'item-private', tenant_id: 'tenant-priv', deleted_at: null },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'tenants') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'tenant-priv', slug: 'priv-workspace', tier: 'pro', owner_id: 'owner-user-7' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'tenant_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { role: 'member' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await deleteComment('c-2');
      expect(res.success).toBe(false);
      expect(res.error).toMatch(/permission|admin/i);
    });

    it('Comment 9: deleteComment allows workspace admin to delete another authors comment', async () => {
      (createServerClient as any).mockResolvedValue({
        auth: {
          getUser: vi.fn().mockResolvedValue({
            data: { user: { id: 'admin-user-3', email: 'admin@sunshade.icu' } },
            error: null,
          }),
        },
      });

      const deleteFn = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'work_item_comments') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'c-3', author_id: 'other-author', item_id: 'item-admin-test' },
                  error: null,
                }),
              }),
            }),
            delete: deleteFn,
          };
        }
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'item-admin-test', tenant_id: 'tenant-admin', deleted_at: null },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'tenants') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { id: 'tenant-admin', slug: 'admin-test-slug', owner_id: 'tenant-owner' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        if (table === 'tenant_members') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                eq: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { role: 'admin' },
                    error: null,
                  }),
                }),
              }),
            }),
          };
        }
        return {};
      });

      const res = await deleteComment('c-3');
      expect(res.success).toBe(true);
      expect(deleteFn).toHaveBeenCalled();
    });
  });

  describe('Adaptive Tick Label Budget (Comment 7)', () => {
    it('Comment 7: getAdaptiveTickIndices guarantees ticks never exceed maxLabels budget', () => {
      // 19 data points with maxTicks = 4.
      // Candidate interval 5 gives initial ticks [0, 5, 10, 15] (length 4).
      // Distance from 15 to 18 is 3 (>= threshold).
      // Instead of appending 18 to make length 5 (exceeding budget), it must replace 15 with 18.
      const ticks = getAdaptiveTickIndices(19, 4);
      expect(ticks.length).toBeLessThanOrEqual(4);
      expect(ticks[ticks.length - 1]).toBe(18); // Guaranteed final endpoint included
    });
  });

  describe('Portfolio Metric Resolver in buildTree (Comment 3)', () => {
    it('Comment 3: buildTree computes rollup metrics using per-project settings resolver', () => {
      const projectASettings = {
        statuses: [{ id: 'todo', label: 'To Do', category: 'unstarted', order: 0 }],
        hierarchy: [{ level: 0, label: 'Epic', type: 'epic' }, { level: 1, label: 'Task', type: 'task' }],
        work_metric_config: { field_key: 'story_points', unit_label: 'Story Points', unit_type: 'points' },
      } as unknown as ProjectSettings;

      const projectBSettings = {
        statuses: [{ id: 'todo', label: 'To Do', category: 'unstarted', order: 0 }],
        hierarchy: [{ level: 0, label: 'Epic', type: 'epic' }, { level: 1, label: 'Task', type: 'task' }],
        work_metric_config: { field_key: 'estimate_hours', unit_label: 'Hours', unit_type: 'hours' },
      } as unknown as ProjectSettings;

      const items = [
        {
          id: 'epic-a',
          title: 'Project A Epic',
          status: 'todo',
          item_type: 'epic',
          project_id: 'proj-a',
          metadata: { story_points: 0 },
        },
        {
          id: 'task-a1',
          title: 'Project A Task 1',
          status: 'todo',
          item_type: 'task',
          parent_id: 'epic-a',
          project_id: 'proj-a',
          metadata: { story_points: 8 },
        },
        {
          id: 'epic-b',
          title: 'Project B Epic',
          status: 'todo',
          item_type: 'epic',
          project_id: 'proj-b',
          metadata: { estimate_hours: 0 },
        },
        {
          id: 'task-b1',
          title: 'Project B Task 1',
          status: 'todo',
          item_type: 'task',
          parent_id: 'epic-b',
          project_id: 'proj-b',
          metadata: { estimate_hours: 40 },
        },
      ] as unknown as WorkItem[];

      const resolver = (item: WorkItem) => {
        return item.project_id === 'proj-b' ? projectBSettings : projectASettings;
      };

      const tree = buildTree(items, null, 0, new Set(), undefined, resolver);
      const epicANode = tree.find((n) => n.id === 'epic-a');
      const epicBNode = tree.find((n) => n.id === 'epic-b');

      expect(epicANode).toBeDefined();
      expect(epicBNode).toBeDefined();
      expect(epicANode?.rollupPoints).toBe(8);
      expect(epicBNode?.rollupPoints).toBe(40);
    });
  });

  describe('Historical Sprint project_id Preservation (Comment 5)', () => {
    it('Comment 5: HistoricalSprint preserves project_id so sprintProj lookup resolves in analytics', async () => {
      const { computeSprintAnalytics } = await import('@/lib/services/sprintAnalyticsService');

      const historicalSprints = [
        {
          id: 'sprint-h1',
          name: 'Sprint 1',
          completed_points: 25,
          committed_points: 30,
          project_id: 'proj-alpha',
        },
      ];

      const res = computeSprintAnalytics({
        sprint: { id: 'sprint-curr', name: 'Sprint 2', status: 'active', committed_points: 30, is_active: true } as any,
        historicalSprints,
        items: [],
      });

      expect(res.rollingVelocity).toBe(25);
      expect(res.historicalSprints?.[0]?.project_id).toBe('proj-alpha');
    });
  });
});
