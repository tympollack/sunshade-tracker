import { describe, it, expect } from 'vitest';
import {
  resolveItemLifecycle,
  filterInFlightItems,
  isWithinTerminalGracePeriod,
  parseLifecycleCategory,
  TERMINAL_GRACE_PERIOD_MS,
} from '@/lib/services/lifecycleNormalizer';
import { ProjectSettings, WorkItem } from '@/types/tracker';

const ENGINEERING_SCHEMA: ProjectSettings = {
  schema_version: '1.0',
  hierarchy: [{ type: 'task', label: 'Task', level: 1, allowed_parents: [] }],
  statuses: [
    { id: 'triage', label: 'Triage', color: '#94a3b8', order: 1, lifecycle_category: 'unstarted' },
    { id: 'coding', label: 'Coding', color: '#38bdf8', order: 2, lifecycle_category: 'execution' },
    { id: 'code_review', label: 'Code Review', color: '#f59e0b', order: 3, lifecycle_category: 'verification' },
    { id: 'canary', label: 'Canary', color: '#a855f7', order: 4, lifecycle_category: 'staging' },
    { id: 'merged', label: 'Merged', color: '#22c55e', order: 5, lifecycle_category: 'terminal', is_completed: true },
  ],
  custom_fields: [],
};

const EDITORIAL_SCHEMA: ProjectSettings = {
  schema_version: '1.0',
  hierarchy: [{ type: 'article', label: 'Article', level: 1, allowed_parents: [] }],
  statuses: [
    { id: 'pitch_pool', label: 'Pitch Pool', color: '#94a3b8', order: 1, lifecycle_category: 'unstarted' },
    { id: 'drafting', label: 'Drafting', color: '#38bdf8', order: 2, lifecycle_category: 'execution' },
    { id: 'copy_edit', label: 'Copy Edit', color: '#f59e0b', order: 3, lifecycle_category: 'verification' },
    { id: 'scheduled_press', label: 'Scheduled Press', color: '#a855f7', order: 4, lifecycle_category: 'staging' },
    { id: 'syndicated', label: 'Syndicated', color: '#22c55e', order: 5, lifecycle_category: 'terminal', is_completed: true },
  ],
  custom_fields: ['target_words'],
};

function makeItem(overrides: Partial<WorkItem>): WorkItem {
  return {
    id: overrides.id || 'item-1',
    tenant_id: 'tenant-1',
    project_id: overrides.project_id || 'proj-eng',
    item_type: 'task',
    status: overrides.status ?? 'triage',
    title: overrides.title || 'Sample Work Item',
    order_index: 1000,
    metadata: overrides.metadata || {},
    created_at: overrides.created_at || '2026-11-01T00:00:00.000Z',
    updated_at: overrides.updated_at || '2026-11-01T12:00:00.000Z',
    deleted_at: overrides.deleted_at ?? null,
  };
}

describe('Dynamic Taxonomy Normalizer & Lifecycle Classifier (TASK-TRK-LIFECYCLE-NORMALIZER)', () => {
  describe('parseLifecycleCategory', () => {
    it('normalizes valid stage strings and aliases', () => {
      expect(parseLifecycleCategory('execution')).toBe('execution');
      expect(parseLifecycleCategory('  VERIFICATION ')).toBe('verification');
      expect(parseLifecycleCategory('staging')).toBe('staging');
      expect(parseLifecycleCategory('terminal')).toBe('terminal');
      expect(parseLifecycleCategory('unstarted')).toBe('unstarted');
      expect(parseLifecycleCategory('Backlog')).toBe('unstarted');
    });

    it('returns undefined for non-strings or unrecognized categories', () => {
      expect(parseLifecycleCategory(null)).toBeUndefined();
      expect(parseLifecycleCategory(123)).toBeUndefined();
      expect(parseLifecycleCategory('unknown_stage')).toBeUndefined();
    });
  });

  describe('resolveItemLifecycle', () => {
    it('classifies engineering project statuses using explicit lifecycle_category', () => {
      expect(resolveItemLifecycle({ status: 'triage' }, ENGINEERING_SCHEMA)).toBe('unstarted');
      expect(resolveItemLifecycle({ status: 'coding' }, ENGINEERING_SCHEMA)).toBe('execution');
      expect(resolveItemLifecycle({ status: 'code_review' }, ENGINEERING_SCHEMA)).toBe('verification');
      expect(resolveItemLifecycle({ status: 'canary' }, ENGINEERING_SCHEMA)).toBe('staging');
      expect(resolveItemLifecycle({ status: 'merged' }, ENGINEERING_SCHEMA)).toBe('terminal');
    });

    it('classifies editorial project statuses (drafting, copy_edit, scheduled_press, syndicated)', () => {
      expect(resolveItemLifecycle({ status: 'pitch_pool' }, EDITORIAL_SCHEMA)).toBe('unstarted');
      expect(resolveItemLifecycle({ status: 'drafting' }, EDITORIAL_SCHEMA)).toBe('execution');
      expect(resolveItemLifecycle({ status: 'copy_edit' }, EDITORIAL_SCHEMA)).toBe('verification');
      expect(resolveItemLifecycle({ status: 'scheduled_press' }, EDITORIAL_SCHEMA)).toBe('staging');
      expect(resolveItemLifecycle({ status: 'syndicated' }, EDITORIAL_SCHEMA)).toBe('terminal');
    });

    it('resolves is_completed status when lifecycle_category is omitted', () => {
      const customSchema: ProjectSettings = {
        ...ENGINEERING_SCHEMA,
        statuses: [
          { id: 'active_work', label: 'Active', color: '#38bdf8', order: 1 },
          { id: 'finished_custom', label: 'Finished', color: '#22c55e', order: 2, is_completed: true },
        ],
      };
      expect(resolveItemLifecycle({ status: 'finished_custom' }, customSchema)).toBe('terminal');
    });

    it('resolves project bucket arrays (completed_statuses, unstarted_statuses, in_progress_statuses)', () => {
      const bucketSchema: ProjectSettings = {
        schema_version: '1.0',
        hierarchy: [],
        statuses: [{ id: 'custom_1', label: 'C1', color: '#000', order: 1 }],
        custom_fields: [],
        completed_statuses: ['shipped_v1'],
        unstarted_statuses: ['icebox_v1'],
        in_progress_statuses: ['hacking_v1'],
      };

      expect(resolveItemLifecycle({ status: 'shipped_v1' }, bucketSchema)).toBe('terminal');
      expect(resolveItemLifecycle({ status: 'icebox_v1' }, bucketSchema)).toBe('unstarted');
      expect(resolveItemLifecycle({ status: 'hacking_v1' }, bucketSchema)).toBe('execution');
    });

    it('falls back to sprint_metrics bucket arrays when top-level buckets are undefined', () => {
      const sprintMetricBucketSchema: ProjectSettings = {
        schema_version: '1.0',
        hierarchy: [],
        statuses: [] as any,
        custom_fields: [],
        sprint_metrics: {
          completed_statuses: ['done_m'],
          unstarted_statuses: ['todo_m'],
          in_progress_statuses: ['wip_m'],
        },
      };

      expect(resolveItemLifecycle({ status: 'done_m' }, sprintMetricBucketSchema)).toBe('terminal');
      expect(resolveItemLifecycle({ status: 'todo_m' }, sprintMetricBucketSchema)).toBe('unstarted');
      expect(resolveItemLifecycle({ status: 'wip_m' }, sprintMetricBucketSchema)).toBe('execution');
    });

    it('gracefully falls back to unstarted when inputs are null, empty, or unmapped', () => {
      expect(resolveItemLifecycle(null, ENGINEERING_SCHEMA)).toBe('unstarted');
      expect(resolveItemLifecycle({ status: '' }, ENGINEERING_SCHEMA)).toBe('unstarted');
      expect(resolveItemLifecycle({ status: 'coding' }, null)).toBe('unstarted');
      expect(resolveItemLifecycle({ status: 'non_existent_status' }, ENGINEERING_SCHEMA)).toBe('unstarted');
      expect(
        resolveItemLifecycle(
          { status: 'unmapped' },
          { schema_version: '1.0', hierarchy: [], statuses: null as any, custom_fields: [] }
        )
      ).toBe('unstarted');
    });
  });

  describe('isWithinTerminalGracePeriod', () => {
    const nowMs = Date.parse('2026-11-03T12:00:00.000Z');

    it('returns true when completed within the 12-hour grace window', () => {
      expect(
        isWithinTerminalGracePeriod(
          { updated_at: '2026-11-03T06:00:00.000Z', metadata: {} },
          nowMs
        )
      ).toBe(true);

      expect(
        isWithinTerminalGracePeriod(
          {
            updated_at: '2026-10-01T00:00:00.000Z',
            metadata: { completed_at: '2026-11-03T11:30:00.000Z' },
          },
          nowMs
        )
      ).toBe(true);
    });

    it('returns false when completed more than 12 hours ago or invalid timestamp', () => {
      expect(
        isWithinTerminalGracePeriod(
          { updated_at: '2026-11-02T23:59:59.000Z', metadata: {} },
          nowMs,
          TERMINAL_GRACE_PERIOD_MS
        )
      ).toBe(false);

      expect(
        isWithinTerminalGracePeriod({ updated_at: '', metadata: {} }, nowMs)
      ).toBe(false);

      expect(
        isWithinTerminalGracePeriod({ updated_at: 'not-a-date', metadata: {} }, nowMs)
      ).toBe(false);
    });
  });

  describe('filterInFlightItems', () => {
    const nowMs = Date.parse('2026-11-03T12:00:00.000Z');
    const projectMap = new Map<string, ProjectSettings>([
      ['proj-eng', ENGINEERING_SCHEMA],
      ['proj-edit', EDITORIAL_SCHEMA],
    ]);

    it('retains execution, verification, staging, and recent terminal items while excluding unstarted and old terminal items', () => {
      const items: WorkItem[] = [
        makeItem({ id: '1', project_id: 'proj-eng', status: 'triage' }), // unstarted -> exclude
        makeItem({ id: '2', project_id: 'proj-eng', status: 'coding' }), // execution -> keep
        makeItem({ id: '3', project_id: 'proj-eng', status: 'code_review' }), // verification -> keep
        makeItem({ id: '4', project_id: 'proj-eng', status: 'canary' }), // staging -> keep
        makeItem({
          id: '5',
          project_id: 'proj-eng',
          status: 'merged',
          updated_at: '2026-11-03T08:00:00.000Z', // 4h ago -> keep
        }),
        makeItem({
          id: '6',
          project_id: 'proj-eng',
          status: 'merged',
          updated_at: '2026-11-02T08:00:00.000Z', // 28h ago -> exclude
        }),
        makeItem({ id: '7', project_id: 'proj-edit', status: 'drafting' }), // execution -> keep
        makeItem({ id: '8', project_id: 'proj-edit', status: 'copy_edit' }), // verification -> keep
        makeItem({ id: '9', project_id: 'proj-edit', status: 'pitch_pool' }), // unstarted -> exclude
        makeItem({
          id: '10',
          project_id: 'proj-edit',
          status: 'drafting',
          deleted_at: '2026-11-03T01:00:00.000Z', // soft-deleted -> exclude
        }),
      ];

      const filtered = filterInFlightItems(items, projectMap, nowMs);
      expect(filtered.map((i) => i.id)).toEqual(['2', '3', '4', '5', '7', '8']);
    });

    it('returns empty array when inputs are malformed', () => {
      expect(filterInFlightItems(null as any, projectMap)).toEqual([]);
      expect(filterInFlightItems([], null as any)).toEqual([]);
    });
  });
});
