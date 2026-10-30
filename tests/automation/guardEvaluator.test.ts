import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { matchesCondition, resolveFieldValue, isBlankValue } from '@/lib/automation/predicateEvaluator';
import {
  validateTransitionGuards,
  resolveGuardTargetStatus,
  getUnmetTransitionGuards,
} from '@/lib/automation/guardEvaluator';
import { updateWorkItemStatus, updateWorkItem } from '@/app/actions/trackerActions';
import { PATCH as patchItemsHandler } from '@/app/api/v1/items/route';
import { PATCH as patchSingleItemHandler } from '@/app/api/v1/items/[id]/route';
import { supabaseAdmin } from '@/lib/db';
import type { ProjectSettings } from '@/types/tracker';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn().mockResolvedValue({
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: 'test-user-id', email: 'test@sunshade.systems' } },
        error: null,
      }),
    },
  }),
}));

describe('Transition Guard Evaluator & Mutation Pipeline (TASK-TRK-GUARD-EVALUATOR)', () => {
  const sampleSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [
      { type: 'story', label: 'Story', level: 1, allowed_parents: [] },
      { type: 'task', label: 'Task', level: 2, allowed_parents: ['story'] },
    ],
    statuses: [
      { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
      { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      { id: 'in_review', label: 'In Review', color: '#f59e0b', order: 3 },
      { id: 'complete', label: 'Complete', color: '#10b981', order: 4, is_completed: true },
    ],
    custom_fields: ['pr_url', 'commit_hash'],
    workflow: {
      review_status: 'in_review',
    },
    transition_guards: [
      {
        id: 'guard-review-pr',
        name: 'Require PR & Commit for In Review',
        enabled: true,
        target_status: '{{settings.workflow.review_status}}',
        conditions: [
          {
            field: 'metadata.pr_url',
            operator: '$is_not_null',
            message: 'Missing Pull Request URL',
          },
          {
            field: 'metadata.commit_hash',
            operator: '$is_not_null',
            message: 'Missing Commit Hash',
          },
        ],
      },
      {
        id: 'guard-disabled',
        name: 'Disabled Guard',
        enabled: false,
        target_status: 'in_progress',
        conditions: [
          {
            field: 'assignee',
            operator: '$is_not_null',
            message: 'Assignee required',
          },
        ],
      },
    ],
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('predicateEvaluator (matchesCondition & resolveFieldValue)', () => {
    it('resolves top-level fields and nested metadata fields with dot notation or fallback', () => {
      const item = {
        id: 'item-1',
        status: 'in_progress',
        assignee: 'alice',
        metadata: {
          pr_url: 'https://github.com/sunshade/tracker/pull/101',
          story_points: 5,
          tags: ['frontend', 'urgent'],
        },
      };

      expect(resolveFieldValue(item, 'assignee')).toBe('alice');
      expect(resolveFieldValue(item, 'metadata.pr_url')).toBe(
        'https://github.com/sunshade/tracker/pull/101'
      );
      expect(resolveFieldValue(item, 'item.metadata.pr_url')).toBe(
        'https://github.com/sunshade/tracker/pull/101'
      );
      expect(resolveFieldValue(item, 'pr_url')).toBe(
        'https://github.com/sunshade/tracker/pull/101'
      );
      expect(resolveFieldValue(item, 'metadata.missing')).toBeUndefined();
    });

    it('evaluates $is_not_null, $is_null, $eq, $ne, $gt, $lt, $in, $nin, and $regex operators', () => {
      const item = {
        id: 'item-1',
        status: 'in_progress',
        metadata: {
          pr_url: 'https://github.com/sunshade/tracker/pull/42',
          empty_str: '   ',
          story_points: 5,
          priority: 'P1',
        },
      };

      expect(matchesCondition(item, { field: 'metadata.pr_url', operator: '$is_not_null' })).toBe(true);
      expect(matchesCondition(item, { field: 'metadata.empty_str', operator: '$is_not_null' })).toBe(false);
      expect(matchesCondition(item, { field: 'metadata.missing', operator: '$is_not_null' })).toBe(false);
      expect(matchesCondition(item, { field: 'metadata.missing', operator: '$is_null' })).toBe(true);

      expect(matchesCondition(item, { field: 'metadata.priority', operator: '$eq', value: 'P1' })).toBe(true);
      expect(matchesCondition(item, { field: 'metadata.priority', operator: '$ne', value: 'P3' })).toBe(true);
      expect(matchesCondition(item, { field: 'metadata.story_points', operator: '$gt', value: 3 })).toBe(true);
      expect(matchesCondition(item, { field: 'metadata.story_points', operator: '$lte', value: 5 })).toBe(true);
      expect(
        matchesCondition(item, { field: 'metadata.priority', operator: '$in', value: ['P0', 'P1'] })
      ).toBe(true);
      expect(
        matchesCondition(item, { field: 'metadata.priority', operator: '$nin', value: ['P2', 'P3'] })
      ).toBe(true);
      expect(
        matchesCondition(item, {
          field: 'metadata.pr_url',
          operator: '$regex',
          value: '^https://github\\.com/.+/pull/\\d+$',
        })
      ).toBe(true);
      expect(isBlankValue('  ')).toBe(true);
    });
  });

  describe('validateTransitionGuards & token interpolation', () => {
    it('resolves {{settings.workflow.review_status}} token against projectSettings', () => {
      expect(
        resolveGuardTargetStatus('{{settings.workflow.review_status}}', sampleSettings)
      ).toBe('in_review');
      expect(resolveGuardTargetStatus('complete', sampleSettings)).toBe('complete');
    });

    it('rejects transition to in_review when required metadata fields are missing', () => {
      const item = {
        id: 'task-1',
        status: 'in_progress',
        metadata: {},
      };

      const res = validateTransitionGuards(item, 'in_review', sampleSettings);
      expect(res.allowed).toBe(false);
      expect(res.errors).toEqual(['Missing Pull Request URL', 'Missing Commit Hash']);
    });

    it('allows transition when required metadata is already present or patched in the same request', () => {
      const item = {
        id: 'task-1',
        status: 'in_progress',
        metadata: {
          commit_hash: 'a1b2c3d',
        },
      };

      const res = validateTransitionGuards(item, 'in_review', sampleSettings, {
        metadata: { pr_url: 'https://github.com/sunshade/tracker/pull/99' },
      });
      expect(res.allowed).toBe(true);
      expect(res.errors).toEqual([]);
    });

    it('ignores disabled guards and unguarded target statuses', () => {
      const item = {
        id: 'task-1',
        status: 'not_started',
        assignee: null,
        metadata: {},
      };

      expect(validateTransitionGuards(item, 'in_progress', sampleSettings)).toEqual({
        allowed: true,
        errors: [],
      });
    });

    it('identifies unmet transition guard fields for modal warning indicators', () => {
      const item = {
        id: 'task-1',
        status: 'in_progress',
        metadata: {
          pr_url: 'https://github.com/sunshade/tracker/pull/99',
          commit_hash: '',
        },
      };

      const unmet = getUnmetTransitionGuards(item, sampleSettings);
      expect(unmet).toHaveLength(1);
      expect(unmet[0]).toMatchObject({
        targetStatus: 'in_review',
        targetStatusLabel: 'In Review',
        fieldKey: 'commit_hash',
        message: 'Missing Commit Hash',
      });
    });
  });

  describe('Server Actions (updateWorkItemStatus & updateWorkItem)', () => {
    it('rejects updateWorkItemStatus with 422 GUARD_REJECTED and aborts DB update when guard fails', async () => {
      const updateSpy = vi.fn();
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'task-1',
                    project_id: 'proj-1',
                    status: 'in_progress',
                    metadata: {},
                  },
                  error: null,
                }),
              })),
            })),
            update: updateSpy,
          } as any;
        }
        if (table === 'projects') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'proj-1', settings: sampleSettings },
                  error: null,
                }),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const res = await updateWorkItemStatus('task-1', 'in_review');
      expect(res.success).toBe(false);
      expect(res.status).toBe(422);
      expect(res.code).toBe('GUARD_REJECTED');
      expect(res.errors).toEqual(['Missing Pull Request URL', 'Missing Commit Hash']);
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('allows updateWorkItem when status change and required metadata are provided simultaneously', async () => {
      let capturedUpdate: any = null;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'task-1',
                    project_id: 'proj-1',
                    status: 'in_progress',
                    metadata: {},
                  },
                  error: null,
                }),
              })),
            })),
            update: vi.fn((fields: any) => {
              capturedUpdate = fields;
              return {
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({
                      data: { id: 'task-1', ...fields },
                      error: null,
                    }),
                  })),
                })),
              };
            }),
          } as any;
        }
        if (table === 'projects') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: { id: 'proj-1', settings: sampleSettings },
                  error: null,
                }),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const res = await updateWorkItem('task-1', {
        status: 'in_review',
        metadata: {
          pr_url: 'https://github.com/sunshade/tracker/pull/150',
          commit_hash: '9876543',
        },
      });

      expect(res.success).toBe(true);
      expect(res.status).toBe(200);
      expect(capturedUpdate).toMatchObject({
        status: 'in_review',
        metadata: {
          pr_url: 'https://github.com/sunshade/tracker/pull/150',
          commit_hash: '9876543',
        },
      });
    });
  });

  describe('REST API PATCH (/api/v1/items & /api/v1/items/[id])', () => {
    const mockTenant = { id: '00000000-0000-0000-0000-000000000000', slug: 'sunshade' };

    it('returns 422 GUARD_REJECTED on PATCH /api/v1/items when guard conditions fail', async () => {
      const updateSpy = vi.fn();
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
              })),
            })),
          } as any;
        }
        if (table === 'projects') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'proj-1', settings: sampleSettings },
                  error: null,
                }),
              })),
            })),
          } as any;
        }
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'task-1',
                      tenant_id: mockTenant.id,
                      project_id: 'proj-1',
                      item_type: 'task',
                      status: 'in_progress',
                      title: 'Guarded Task',
                      order_index: 1000,
                      metadata: {},
                    },
                    error: null,
                  }),
                })),
              })),
            })),
            update: updateSpy,
          } as any;
        }
        return {} as any;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer tk_live_sunshade_master_key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id: 'task-1',
          status: 'in_review',
        }),
      });

      const res = await patchItemsHandler(req);
      expect(res.status).toBe(422);
      const body = await res.json();
      expect(body.code).toBe('GUARD_REJECTED');
      expect(body.errors).toEqual(['Missing Pull Request URL', 'Missing Commit Hash']);
      expect(updateSpy).not.toHaveBeenCalled();
    });

    it('succeeds with 200 on PATCH /api/v1/items/[id] when status and required metadata are supplied together', async () => {
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
              })),
            })),
          } as any;
        }
        if (table === 'projects') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'proj-1', settings: sampleSettings },
                  error: null,
                }),
              })),
            })),
          } as any;
        }
        if (table === 'sprints') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          } as any;
        }
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: {
                      id: 'task-1',
                      tenant_id: mockTenant.id,
                      project_id: 'proj-1',
                      item_type: 'task',
                      status: 'in_progress',
                      title: 'Guarded Task',
                      order_index: 1000,
                      metadata: {},
                    },
                    error: null,
                  }),
                })),
              })),
            })),
            update: vi.fn((updates: any) => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({
                      data: { id: 'task-1', ...updates },
                      error: null,
                    }),
                  })),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/items/task-1', {
        method: 'PATCH',
        headers: {
          Authorization: 'Bearer tk_live_sunshade_master_key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          status: 'in_review',
          metadata: {
            pr_url: 'https://github.com/sunshade/tracker/pull/155',
            commit_hash: 'deadbeef',
          },
        }),
      });

      const res = await patchSingleItemHandler(req, {
        params: Promise.resolve({ id: 'task-1' }),
      });
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.item.status).toBe('in_review');
      expect(json.item.metadata.pr_url).toBe('https://github.com/sunshade/tracker/pull/155');
    });
  });
});
