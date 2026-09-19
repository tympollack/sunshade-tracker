import { describe, it, expect } from 'vitest';
import {
  calculateSprintLeafPoints,
  calculateSprintMacroPoints,
  getSprintLeafItems,
  getSprintRootItems,
} from '@/lib/sprint-utils';
import { WorkItem } from '@/types/tracker';

describe('FEAT-TRK-LEAF-NODE-SUM-CALC: Sprint Leaf & Macro Points Calculation', () => {
  const createMockItem = (
    id: string,
    parentId: string | null,
    points?: number,
    refId?: string
  ): WorkItem => ({
    id,
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    parent_id: parentId,
    external_ref_id: refId || id,
    title: `Item ${id}`,
    item_type: parentId === null ? 'epic' : 'task',
    status: 'in_progress',
    order_index: 1000,
    metadata: points !== undefined ? { story_points: points } : {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  it('decouples points by calculating strictly across leaf nodes (eliminates parent-child double counting)', () => {
    // Epic 13 -> Story 5 -> Task 1 (2 pts), Task 2 (2 pts)
    const epic = createMockItem('epic-1', null, 13, 'EPIC-1');
    const story = createMockItem('story-1', 'epic-1', 5, 'STORY-1');
    const task1 = createMockItem('task-1', 'story-1', 2, 'TASK-1');
    const task2 = createMockItem('task-2', 'story-1', 2, 'TASK-2');

    const sprintItems = [epic, story, task1, task2];

    const leafPoints = calculateSprintLeafPoints(sprintItems);
    expect(leafPoints).toBe(4); // 2 + 2 = 4 (strictly bottom-most leaves)

    const macroPoints = calculateSprintMacroPoints(sprintItems);
    expect(macroPoints).toBe(13); // Root Epic = 13 pts
  });

  it('correctly resolves parentage via external_ref_id as well as UUID', () => {
    const parent = createMockItem('uuid-parent', null, 10, 'PARENT-100');
    const child = createMockItem('uuid-child', 'PARENT-100', 3, 'CHILD-101');

    const sprintItems = [parent, child];
    expect(calculateSprintLeafPoints(sprintItems)).toBe(3);
    expect(calculateSprintMacroPoints(sprintItems)).toBe(10);
  });

  it('handles multiple independent hierarchies and standalone leaf tasks in the same sprint', () => {
    const epic1 = createMockItem('epic-1', null, 20);
    const story1 = createMockItem('story-1', 'epic-1', 8);
    const task1 = createMockItem('task-1', 'story-1', 3);
    const task2 = createMockItem('task-2', 'story-1', 5);
    const standaloneTask = createMockItem('task-alone', null, 5);

    const sprintItems = [epic1, story1, task1, task2, standaloneTask];

    // Leaves: task1 (3), task2 (5), standaloneTask (5) -> 13
    expect(calculateSprintLeafPoints(sprintItems)).toBe(13);

    // Roots: epic1 (20), standaloneTask (5) -> 25
    expect(calculateSprintMacroPoints(sprintItems)).toBe(25);
  });

  it('handles items without story points or with non-numeric estimates gracefully', () => {
    const parent = createMockItem('parent', null, 8);
    const childWithoutPoints = createMockItem('child-1', 'parent');
    const childWithPoints = createMockItem('child-2', 'parent', 5);

    const sprintItems = [parent, childWithoutPoints, childWithPoints];
    expect(calculateSprintLeafPoints(sprintItems)).toBe(5);
  });

  it('returns 0 for empty item list', () => {
    expect(calculateSprintLeafPoints([])).toBe(0);
    expect(calculateSprintMacroPoints([])).toBe(0);
  });

  it('filters leaf and root items correctly via helper functions', () => {
    const parent = createMockItem('parent', null, 8);
    const child = createMockItem('child', 'parent', 5);

    const sprintItems = [parent, child];
    const leaves = getSprintLeafItems(sprintItems);
    const roots = getSprintRootItems(sprintItems);

    expect(leaves.map((l) => l.id)).toEqual(['child']);
    expect(roots.map((r) => r.id)).toEqual(['parent']);
  });
});
