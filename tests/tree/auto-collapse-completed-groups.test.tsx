import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import {
  getDefaultCollapsedTreeNodeIds,
  getDefaultCollapsedSprintNames,
  flattenVisibleTreeNodes,
  TREE_COLLAPSE_STORAGE_PREFIX,
  SPRINT_COLLAPSE_STORAGE_PREFIX,
} from '@/lib/tree-collapse';
import {
  useAutoCollapsedTreeNodes,
  useAutoCollapsedSprints,
} from '@/hooks/useAutoCollapseState';
import { SprintViewContainer } from '@/components/views/SprintViewContainer';
import {
  HierarchyLevel,
  ProjectSettings,
  SprintDefinition,
  StatusDefinition,
  WorkItem,
  WorkItemNode,
} from '@/types/tracker';
import { buildTree } from '@/lib/tree';

const mockHierarchy: HierarchyLevel[] = [
  { level: 1, type: 'epic', label: 'Epic', allowed_parents: [] },
  { level: 2, type: 'story', label: 'Story', allowed_parents: ['epic'] },
  { level: 3, type: 'task', label: 'Task', allowed_parents: ['story'] },
];

const mockStatuses: StatusDefinition[] = [
  { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1, is_completed: false },
  { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2, is_completed: false },
  { id: 'complete', label: 'Complete', color: '#22c55e', order: 3, is_completed: true },
  { id: 'qa_verified', label: 'QA Verified', color: '#a855f7', order: 4, is_completed: true },
];

const baseSettings: ProjectSettings = {
  schema_version: '1.0',
  hierarchy: mockHierarchy,
  statuses: mockStatuses,
  custom_fields: [],
};

function makeItem(overrides: Partial<WorkItem>): WorkItem {
  return {
    id: 'item-1',
    tenant_id: 't-1',
    project_id: 'p-1',
    title: 'Work Item',
    item_type: 'task',
    status: 'not_started',
    order_index: 1000,
    metadata: {},
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

describe('TASK-TRK-AUTO-COLLAPSE-COMPLETED-GROUPS', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('defaults completed epics and stories with children to collapsed while keeping active groups expanded', () => {
    const items: WorkItem[] = [
      makeItem({ id: 'epic-done', item_type: 'epic', status: 'complete', title: 'Done Epic' }),
      makeItem({ id: 'story-under-done', item_type: 'story', parent_id: 'epic-done', status: 'done', title: 'Done Child Story' }),
      makeItem({ id: 'task-under-done', item_type: 'task', parent_id: 'story-under-done', status: 'done', title: 'Leaf Task' }),
      makeItem({ id: 'epic-active', item_type: 'epic', status: 'in_progress', title: 'Active Epic' }),
      makeItem({ id: 'story-completed-custom', item_type: 'story', parent_id: 'epic-active', status: 'qa_verified', title: 'Verified Story' }),
      makeItem({ id: 'task-under-verified', item_type: 'task', parent_id: 'story-completed-custom', status: 'qa_verified', title: 'Verified Task' }),
      makeItem({ id: 'story-active', item_type: 'story', parent_id: 'epic-active', status: 'in_progress', title: 'Active Story' }),
      makeItem({ id: 'task-active', item_type: 'task', parent_id: 'story-active', status: 'not_started', title: 'Pending Task' }),
      makeItem({ id: 'leaf-done-story', item_type: 'story', status: 'complete', title: 'Leaf Story Without Children' }),
    ];

    const tree: WorkItemNode[] = buildTree(items);
    const collapsed = getDefaultCollapsedTreeNodeIds(tree, () => mockStatuses);

    expect(collapsed.has('epic-done')).toBe(true);
    expect(collapsed.has('story-under-done')).toBe(true);
    expect(collapsed.has('story-completed-custom')).toBe(true);
    expect(collapsed.has('epic-active')).toBe(false);
    expect(collapsed.has('story-active')).toBe(false);
    // Leaf nodes without children are not collapsed parent groups
    expect(collapsed.has('task-under-done')).toBe(false);
    expect(collapsed.has('leaf-done-story')).toBe(false);
  });

  it('defaults completed sprints to collapsed while keeping active and planned sprints expanded', () => {
    const sprintDefs: SprintDefinition[] = [
      { id: 's1', name: 'Sprint 2026-Q1', status: 'completed' },
      { id: 's2', name: 'Sprint 2026-Q2', status: 'active', is_active: true },
      { id: 's3', name: 'Sprint 2026-Q3', status: 'planned' },
    ];

    const collapsed = getDefaultCollapsedSprintNames(
      ['Sprint 2026-Q1', 'Sprint 2026-Q2', 'Sprint 2026-Q3'],
      sprintDefs
    );

    expect(collapsed.has('Sprint 2026-Q1')).toBe(true);
    expect(collapsed.has('Sprint 2026-Q2')).toBe(false);
    expect(collapsed.has('Sprint 2026-Q3')).toBe(false);
  });

  it('auto-collapses completed tree groups when items load asynchronously and respects Expand All persistence', () => {
    const storageKey = `${TREE_COLLAPSE_STORAGE_PREFIX}proj-alpha`;
    const items: WorkItem[] = [
      makeItem({ id: 'epic-1', item_type: 'epic', status: 'complete', title: 'Completed Epic' }),
      makeItem({ id: 'task-1', item_type: 'task', parent_id: 'epic-1', status: 'complete', title: 'Task 1' }),
    ];
    const loadedTree = buildTree(items);

    const { result, rerender } = renderHook(
      ({ tree }) => useAutoCollapsedTreeNodes(storageKey, tree, () => mockStatuses),
      { initialProps: { tree: [] as WorkItemNode[] } }
    );

    expect(result.current.collapsedIds.size).toBe(0);

    // Simulate async items load
    rerender({ tree: loadedTree });
    expect(result.current.collapsedIds.has('epic-1')).toBe(true);

    // User clicks Expand All -> persists empty array []
    act(() => {
      result.current.expandAll();
    });
    expect(result.current.collapsedIds.size).toBe(0);
    expect(localStorage.getItem(storageKey)).toBe('[]');

    // Re-mounting hook respects persisted [] and keeps epic-1 expanded
    const { result: remounted } = renderHook(() =>
      useAutoCollapsedTreeNodes(storageKey, loadedTree, () => mockStatuses)
    );
    expect(remounted.current.collapsedIds.size).toBe(0);
  });

  it('auto-collapses completed sprints when sprint definitions arrive asynchronously and persists manual toggles', () => {
    const storageKey = `${SPRINT_COLLAPSE_STORAGE_PREFIX}proj-beta`;
    const sprintNames = ['Sprint 1', 'Sprint 2'];

    const { result, rerender } = renderHook(
      ({ defs }) => useAutoCollapsedSprints(storageKey, sprintNames, defs),
      { initialProps: { defs: [] as SprintDefinition[] } }
    );

    expect(result.current.collapsedSprints.size).toBe(0);

    // Sprint metadata arrives
    rerender({
      defs: [
        { id: 's1', name: 'Sprint 1', status: 'completed' },
        { id: 's2', name: 'Sprint 2', status: 'active' },
      ],
    });
    expect(result.current.collapsedSprints.has('Sprint 1')).toBe(true);
    expect(result.current.collapsedSprints.has('Sprint 2')).toBe(false);

    // User expands Sprint 1 manually
    act(() => {
      result.current.toggleSprint('Sprint 1');
    });
    expect(result.current.collapsedSprints.has('Sprint 1')).toBe(false);
    expect(JSON.parse(localStorage.getItem(storageKey)!)).toEqual([]);
  });

  it('collapses completed epics and stories on load in SprintViewContainer Hierarchy mode and allows toggling', () => {
    const items: WorkItem[] = [
      makeItem({
        id: 'epic-done',
        item_type: 'epic',
        status: 'complete',
        title: 'Completed Sprint Epic',
        metadata: { sprint: 'Sprint 2026-Q4' },
      }),
      makeItem({
        id: 'task-under-done',
        item_type: 'task',
        parent_id: 'epic-done',
        status: 'complete',
        title: 'Hidden Completed Child Task',
        metadata: { sprint: 'Sprint 2026-Q4' },
      }),
      makeItem({
        id: 'story-active',
        item_type: 'story',
        status: 'in_progress',
        title: 'Active Sprint Story',
        metadata: { sprint: 'Sprint 2026-Q4' },
      }),
      makeItem({
        id: 'task-under-active',
        item_type: 'task',
        parent_id: 'story-active',
        status: 'not_started',
        title: 'Visible Active Child Task',
        metadata: { sprint: 'Sprint 2026-Q4' },
      }),
    ];

    render(
      <SprintViewContainer
        items={items}
        projectSettings={baseSettings}
        isReadOnly={false}
        pointMode="granular"
        handlePointModeChange={vi.fn()}
        sprintViewMode="tree"
        setSprintViewMode={vi.fn()}
        handleToggleCollapseAllSprints={vi.fn()}
        collapsedSprints={new Set()}
        toggleSprintCollapse={vi.fn()}
        handleToggleHideCompletedSprints={vi.fn()}
        hideCompletedSprints={false}
        hiddenCompletedSprintsCount={0}
        statusFilterOptions={[]}
        effectiveSprintStatuses={['not_started', 'in_progress', 'complete']}
        setSprintSelectedStatuses={vi.fn()}
        levelFilterOptions={[]}
        effectiveSprintLevels={['epic', 'story', 'task']}
        setSprintSelectedLevels={vi.fn()}
        sprintSortBy="order_index"
        setSprintSortBy={vi.fn()}
        setIsManageSprintsOpen={vi.fn()}
        visibleSprints={['Sprint 2026-Q4']}
        availableSprints={['Sprint 2026-Q4']}
        filterSprintItems={(list) => list}
        sprintComparator={(a, b) => a.order_index - b.order_index}
        selectedItemIds={new Set()}
        handleToggleSelectItem={vi.fn()}
        handleSelectAllInPool={vi.fn()}
        activeSprintPopover={null}
        setActiveSprintPopover={vi.fn()}
        setEditingItem={vi.fn()}
        getItemHierarchy={() => mockHierarchy}
        getItemStatuses={() => mockStatuses}
        deviations={[]}
        setFocusedDeviationId={vi.fn()}
        setIsReconciliationModalOpen={vi.fn()}
        isAllProjects={false}
        allProjects={[]}
        handleUpdateStatus={vi.fn()}
        handleUpdateAssignee={vi.fn()}
        handleUpdateItemSprint={vi.fn()}
        projectSlug="sprint-tree-proj"
      />
    );

    // Completed epic is visible, its child is collapsed
    expect(screen.getByText('Completed Sprint Epic')).toBeInTheDocument();
    expect(screen.queryByText('Hidden Completed Child Task')).not.toBeInTheDocument();

    // Active story and its child are visible
    expect(screen.getByText('Active Sprint Story')).toBeInTheDocument();
    expect(screen.getByText('Visible Active Child Task')).toBeInTheDocument();

    // Expanding the completed epic reveals its child task
    fireEvent.click(screen.getByTestId('sprint-tree-collapse-toggle-epic-done'));
    expect(screen.getByText('Hidden Completed Child Task')).toBeInTheDocument();
  });

  it('keeps transiently expanded parent open when treeItems rebuild after dropping a child inside it (BUG_0004)', () => {
    const storageKey = `${TREE_COLLAPSE_STORAGE_PREFIX}proj-dnd`;
    const initialItems: WorkItem[] = [
      makeItem({ id: 'epic-1', item_type: 'epic', status: 'in_progress', title: 'Active Epic' }),
      makeItem({ id: 'task-1', item_type: 'task', parent_id: 'epic-1', status: 'not_started', title: 'Existing Child' }),
      makeItem({ id: 'story-moved', item_type: 'story', status: 'in_progress', title: 'Moved Story' }),
    ];
    const initialTree = buildTree(initialItems);

    const { result, rerender } = renderHook(
      ({ tree, keyName }) => useAutoCollapsedTreeNodes(keyName, tree, () => mockStatuses),
      { initialProps: { tree: initialTree, keyName: storageKey } }
    );

    // User manually collapses epic-1
    act(() => {
      result.current.toggleNode('epic-1');
    });
    expect(result.current.collapsedIds.has('epic-1')).toBe(true);

    // User drops story-moved inside epic-1 -> rebuilds treeItems & transiently expands epic-1
    const rebuiltTree = buildTree(
      initialItems.map((it) => (it.id === 'story-moved' ? { ...it, parent_id: 'epic-1' } : it))
    );
    act(() => {
      result.current.expandNode('epic-1');
    });
    rerender({ tree: rebuiltTree, keyName: storageKey });

    // epic-1 stays expanded after tree rebuild
    expect(result.current.collapsedIds.has('epic-1')).toBe(false);

    // User manually toggles epic-1 again -> collapses and clears transient state
    act(() => {
      result.current.toggleNode('epic-1');
    });
    expect(result.current.collapsedIds.has('epic-1')).toBe(true);
  });

  it('excludes collapsed descendants from visible shift-click range selection pool in SprintViewContainer (BUG_0001)', () => {
    const items: WorkItem[] = [
      makeItem({
        id: 'task-a',
        item_type: 'task',
        status: 'in_progress',
        order_index: 1000,
        title: 'Task A',
        metadata: { sprint: 'Sprint 2026-Q4' },
      }),
      makeItem({
        id: 'story-done',
        item_type: 'story',
        status: 'complete',
        order_index: 2000,
        title: 'Done Story',
        metadata: { sprint: 'Sprint 2026-Q4' },
      }),
      makeItem({
        id: 'task-hidden',
        item_type: 'task',
        parent_id: 'story-done',
        status: 'in_progress',
        order_index: 3000,
        title: 'Hidden Mutable Task',
        metadata: { sprint: 'Sprint 2026-Q4' },
      }),
      makeItem({
        id: 'task-d',
        item_type: 'task',
        status: 'in_progress',
        order_index: 4000,
        title: 'Task D',
        metadata: { sprint: 'Sprint 2026-Q4' },
      }),
    ];

    const visiblePool = flattenVisibleTreeNodes(buildTree(items), new Set(['story-done']));
    expect(visiblePool.map((n) => n.id)).toEqual(['task-a', 'story-done', 'task-d']);

    const handleToggleSelectItem = vi.fn();

    render(
      <SprintViewContainer
        items={items}
        projectSettings={baseSettings}
        isReadOnly={false}
        pointMode="granular"
        handlePointModeChange={vi.fn()}
        sprintViewMode="tree"
        setSprintViewMode={vi.fn()}
        handleToggleCollapseAllSprints={vi.fn()}
        collapsedSprints={new Set()}
        toggleSprintCollapse={vi.fn()}
        handleToggleHideCompletedSprints={vi.fn()}
        hideCompletedSprints={false}
        hiddenCompletedSprintsCount={0}
        statusFilterOptions={[]}
        effectiveSprintStatuses={['not_started', 'in_progress', 'complete']}
        setSprintSelectedStatuses={vi.fn()}
        levelFilterOptions={[]}
        effectiveSprintLevels={['epic', 'story', 'task']}
        setSprintSelectedLevels={vi.fn()}
        sprintSortBy="order_index"
        setSprintSortBy={vi.fn()}
        setIsManageSprintsOpen={vi.fn()}
        visibleSprints={['Sprint 2026-Q4']}
        availableSprints={['Sprint 2026-Q4']}
        filterSprintItems={(list) => list}
        sprintComparator={(a, b) => a.order_index - b.order_index}
        selectedItemIds={new Set()}
        handleToggleSelectItem={handleToggleSelectItem}
        handleSelectAllInPool={vi.fn()}
        activeSprintPopover={null}
        setActiveSprintPopover={vi.fn()}
        setEditingItem={vi.fn()}
        getItemHierarchy={() => mockHierarchy}
        getItemStatuses={() => mockStatuses}
        deviations={[]}
        setFocusedDeviationId={vi.fn()}
        setIsReconciliationModalOpen={vi.fn()}
        isAllProjects={false}
        allProjects={[]}
        handleUpdateStatus={vi.fn()}
        handleUpdateAssignee={vi.fn()}
        handleUpdateItemSprint={vi.fn()}
        projectSlug="range-pool-proj"
      />
    );

    fireEvent.click(screen.getByTestId('sprint-item-checkbox-task-d'), { shiftKey: true });
    expect(handleToggleSelectItem).toHaveBeenCalledTimes(1);
    const passedPool = handleToggleSelectItem.mock.calls[0][2] as WorkItem[];
    expect(passedPool.map((it) => it.id)).toEqual(['task-a', 'story-done', 'task-d']);
  });
});
