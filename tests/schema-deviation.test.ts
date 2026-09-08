import { describe, it, expect } from 'vitest';
import {
  detectSchemaDeviations,
  summarizeDeviations,
} from '@/lib/schema-deviation';
import { ProjectSettings, WorkItem } from '@/types/tracker';

const mockCozySettings: ProjectSettings = {
  schema_version: '1.0',
  hierarchy: [
    { type: 'project', label: 'Project', level: 1, allowed_parents: [] },
    { type: 'epic', label: 'Epic', level: 2, allowed_parents: ['project'] },
    { type: 'story', label: 'Story', level: 3, allowed_parents: ['epic'] },
    { type: 'task', label: 'Task', level: 4, allowed_parents: ['story'] },
  ],
  statuses: [
    { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1000 },
    { id: 'in_progress', label: 'In Progress', color: '#3b82f6', order: 2000 },
    { id: 'complete', label: 'Complete', color: '#10b981', order: 3000 },
  ],
  custom_fields: [],
};

describe('detectSchemaDeviations', () => {
  it('returns empty array when items array is empty', () => {
    const deviations = detectSchemaDeviations([], mockCozySettings);
    expect(deviations).toEqual([]);
  });

  it('detects unmapped hierarchy levels (e.g. subtask in cozy schema)', () => {
    const items: WorkItem[] = [
      {
        id: 'item-1',
        tenant_id: 'tenant-1',
        project_id: 'proj-cozy',
        item_type: 'task',
        status: 'not_started',
        title: 'Valid Task',
        order_index: 1000,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'item-2',
        tenant_id: 'tenant-1',
        project_id: 'proj-cozy',
        external_ref_id: 'REV-COZY-01',
        item_type: 'subtask', // Not in cozy hierarchy!
        status: 'not_started',
        title: 'Refactor raincloud deduplication',
        order_index: 2000,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const deviations = detectSchemaDeviations(items, mockCozySettings);
    expect(deviations).toHaveLength(1);
    expect(deviations[0].itemId).toBe('item-2');
    expect(deviations[0].deviationType).toBe('unmapped_level');
    expect(deviations[0].currentValue).toBe('subtask');
    expect(deviations[0].expectedValues).toEqual(['project', 'epic', 'story', 'task']);
    expect(deviations[0].itemRef).toBe('REV-COZY-01');
  });

  it('detects unmapped statuses', () => {
    const items: WorkItem[] = [
      {
        id: 'item-1',
        tenant_id: 'tenant-1',
        project_id: 'proj-cozy',
        item_type: 'task',
        status: 'blocked', // Not in cozy statuses!
        title: 'Blocked Task',
        order_index: 1000,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const deviations = detectSchemaDeviations(items, mockCozySettings);
    expect(deviations).toHaveLength(1);
    expect(deviations[0].itemId).toBe('item-1');
    expect(deviations[0].deviationType).toBe('unmapped_status');
    expect(deviations[0].currentValue).toBe('blocked');
    expect(deviations[0].expectedValues).toEqual(['not_started', 'in_progress', 'complete']);
  });

  it('detects hierarchy nesting conflicts', () => {
    const items: WorkItem[] = [
      {
        id: 'task-parent',
        tenant_id: 'tenant-1',
        project_id: 'proj-cozy',
        item_type: 'task',
        status: 'not_started',
        title: 'Parent Task',
        order_index: 1000,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'story-child',
        tenant_id: 'tenant-1',
        project_id: 'proj-cozy',
        parent_id: 'task-parent', // Story cannot be nested under Task! Allowed parent is Epic
        item_type: 'story',
        status: 'not_started',
        title: 'Misnested Story',
        order_index: 2000,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const deviations = detectSchemaDeviations(items, mockCozySettings);
    expect(deviations).toHaveLength(1);
    expect(deviations[0].itemId).toBe('story-child');
    expect(deviations[0].deviationType).toBe('nesting_conflict');
    expect(deviations[0].parentType).toBe('task');
    expect(deviations[0].expectedValues).toEqual(['epic']);
  });

  it('resolves item-specific project settings in portfolio mode', () => {
    const items: WorkItem[] = [
      {
        id: 'item-tracker-subtask',
        tenant_id: 'tenant-1',
        project_id: 'proj-tracker',
        item_type: 'subtask', // Valid in sunshade-tracker, but not in cozy
        status: 'not_started',
        title: 'Tracker Subtask',
        order_index: 1000,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
      {
        id: 'item-cozy-subtask',
        tenant_id: 'tenant-1',
        project_id: 'proj-cozy',
        item_type: 'subtask', // Invalid in cozy
        status: 'not_started',
        title: 'Cozy Subtask',
        order_index: 2000,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    const allProjects = [
      {
        id: 'proj-tracker',
        slug: 'sunshade-tracker',
        settings: {
          schema_version: '1.0',
          hierarchy: [
            { type: 'epic', label: 'Epic', level: 1, allowed_parents: [] },
            { type: 'story', label: 'Story', level: 2, allowed_parents: ['epic'] },
            { type: 'task', label: 'Task', level: 3, allowed_parents: ['story'] },
            { type: 'subtask', label: 'Subtask', level: 4, allowed_parents: ['task'] },
          ],
          statuses: mockCozySettings.statuses,
          custom_fields: [],
        },
      },
      {
        id: 'proj-cozy',
        slug: 'cozy',
        settings: mockCozySettings,
      },
    ];

    const deviations = detectSchemaDeviations(items, mockCozySettings, allProjects, true);
    // Only item-cozy-subtask should be flagged as deviation
    expect(deviations).toHaveLength(1);
    expect(deviations[0].itemId).toBe('item-cozy-subtask');
  });
});

describe('summarizeDeviations', () => {
  it('correctly aggregates deviation counts and unique unmapped values', () => {
    const deviations = [
      {
        id: '1',
        itemId: 'it-1',
        itemRef: 'REF-1',
        itemTitle: 'Item 1',
        deviationType: 'unmapped_level' as const,
        currentValue: 'subtask',
        expectedValues: ['task'],
        message: 'error',
      },
      {
        id: '2',
        itemId: 'it-2',
        itemRef: 'REF-2',
        itemTitle: 'Item 2',
        deviationType: 'unmapped_level' as const,
        currentValue: 'subtask',
        expectedValues: ['task'],
        message: 'error',
      },
      {
        id: '3',
        itemId: 'it-3',
        itemRef: 'REF-3',
        itemTitle: 'Item 3',
        deviationType: 'unmapped_status' as const,
        currentValue: 'abandoned',
        expectedValues: ['complete'],
        message: 'error',
      },
    ];

    const summary = summarizeDeviations(deviations);
    expect(summary.total).toBe(3);
    expect(summary.unmappedLevelsCount).toBe(2);
    expect(summary.unmappedStatusesCount).toBe(1);
    expect(summary.nestingConflictsCount).toBe(0);
    expect(summary.unmappedLevels).toEqual(['subtask']);
    expect(summary.unmappedStatuses).toEqual(['abandoned']);
    expect(summary.affectedItemIds).toHaveLength(3);
  });
});
