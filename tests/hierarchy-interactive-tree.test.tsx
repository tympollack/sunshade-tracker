import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, createEvent, waitFor } from '@testing-library/react';
import { buildTree, isDescendantOf, flattenTree } from '@/lib/tree';
import { calculateOrderIndex, validateHierarchyNesting } from '@/lib/fractional-index';
import { TreeNode } from '@/components/TreeNode';
import { WorkItem, WorkItemNode, HierarchyLevel, StatusDefinition } from '@/types/tracker';

const mockItem = (overrides: Partial<WorkItem>): WorkItem => ({
  id: 'item-1',
  tenant_id: 'tenant-1',
  project_id: 'proj-1',
  title: 'Test Item',
  item_type: 'story',
  status: 'not_started',
  order_index: 1000,
  metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

const mockHierarchy: HierarchyLevel[] = [
  { type: 'epic', label: 'Epic', level: 1, allowed_parents: [], color: '#38bdf8' },
  { type: 'story', label: 'Story', level: 2, allowed_parents: ['epic'], color: '#34d399' },
  { type: 'task', label: 'Task', level: 3, allowed_parents: ['story', 'epic'], color: '#fbbf24' },
];

const mockStatuses: StatusDefinition[] = [
  { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
  { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
  { id: 'in_review', label: 'In Review', color: '#a855f7', order: 3 },
  { id: 'complete', label: 'Complete', color: '#22c55e', order: 4 },
];

const mockMembers = [
  { id: 'user-1', name: 'Alice Smith' },
  { id: 'user-2', name: 'Bob Jones' },
];

describe('Hierarchy UX - TASK-TRK-HIER-ROLLUP-METRICS', () => {
  it('calculates recursive descendant counts and story point rollups on tree nodes', () => {
    const items: WorkItem[] = [
      mockItem({ id: 'epic-1', title: 'Main Epic', item_type: 'epic', metadata: { points: 0 } }),
      mockItem({ id: 'story-1', title: 'User Auth', item_type: 'story', parent_id: 'epic-1', metadata: { story_points: 5 } }),
      mockItem({ id: 'task-1', title: 'Login API', item_type: 'task', parent_id: 'story-1', metadata: { points: 3 } }),
      mockItem({ id: 'task-2', title: 'Session Cookie', item_type: 'task', parent_id: 'story-1', metadata: { points: 2 } }),
    ];

    const tree = buildTree(items);
    expect(tree).toHaveLength(1);
    const epicNode = tree[0];

    // Epic has 1 story + 2 tasks = 3 descendants, points = 0 + 5 + 3 + 2 = 10 pts
    expect(epicNode.descendantCount).toBe(3);
    expect(epicNode.rollupPoints).toBe(10);

    const storyNode = epicNode.children![0];
    expect(storyNode.descendantCount).toBe(2);
    expect(storyNode.rollupPoints).toBe(10); // 5 own + 3 + 2 = 10 pts

    render(
      <TreeNode
        item={epicNode}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
        members={mockMembers}
      />
    );

    // Epic displays rollup badges
    expect(screen.getByText('3 subtasks')).toBeInTheDocument();
    expect(screen.getAllByText('10 pts rollup')).toHaveLength(2);
  });

  it('indicates sprint filtering in rollup badges tooltip when isFilteredBySprint is true', () => {
    const items: WorkItem[] = [
      mockItem({ id: 'epic-1', title: 'Main Epic', item_type: 'epic', metadata: { points: 0 } }),
      mockItem({ id: 'story-1', title: 'User Auth', item_type: 'story', parent_id: 'epic-1', metadata: { story_points: 5 } }),
    ];

    const tree = buildTree(items);

    render(
      <TreeNode
        item={tree[0]}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
        isFilteredBySprint={true}
      />
    );

    const subtaskBadge = screen.getByTestId('tree-node-subtasks-badge');
    expect(subtaskBadge).toHaveAttribute('title', '1 descendant item(s) (sprint filtered)');

    const rollupBadges = screen.getAllByTestId('tree-node-rollup-points-badge');
    expect(rollupBadges[0]).toHaveAttribute('title', 'Subtree total: 5 pts (sprint filtered)');
  });
});

describe('Hierarchy UX - TASK-TRK-HIER-BRANCH-COLLAPSE', () => {
  it('renders collapse chevron for nodes with children and invokes onToggleCollapse', () => {
    const onToggle = vi.fn();
    const items: WorkItem[] = [
      mockItem({ id: 'epic-1', title: 'Expandable Epic', item_type: 'epic' }),
      mockItem({ id: 'story-1', title: 'Nested Story', item_type: 'story', parent_id: 'epic-1' }),
    ];
    const tree = buildTree(items);

    render(
      <TreeNode
        item={tree[0]}
        collapsedNodeIds={new Set()}
        onToggleCollapse={onToggle}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
      />
    );

    const toggleBtn = screen.getByTestId('collapse-toggle-epic-1');
    expect(toggleBtn).toBeInTheDocument();
    expect(screen.getByText('Nested Story')).toBeInTheDocument();

    fireEvent.click(toggleBtn);
    expect(onToggle).toHaveBeenCalledWith('epic-1');
  });

  it('hides children when the node ID is included in collapsedNodeIds', () => {
    const items: WorkItem[] = [
      mockItem({ id: 'epic-1', title: 'Expandable Epic', item_type: 'epic' }),
      mockItem({ id: 'story-1', title: 'Nested Story', item_type: 'story', parent_id: 'epic-1' }),
    ];
    const tree = buildTree(items);

    render(
      <TreeNode
        item={tree[0]}
        collapsedNodeIds={new Set(['epic-1'])}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
      />
    );

    expect(screen.getByText('Expandable Epic')).toBeInTheDocument();
    expect(screen.queryByText('Nested Story')).not.toBeInTheDocument();
    expect(screen.queryByTestId('children-container-epic-1')).not.toBeInTheDocument();
  });
});

describe('Hierarchy UX - TASK-TRK-HIER-INLINE-EDIT', () => {
  it('updates status directly through inline select without opening full modal', async () => {
    const onUpdateStatus = vi.fn();
    const item = buildTree([mockItem({ id: 'story-1', title: 'Story Test', status: 'not_started' })])[0];

    render(
      <TreeNode
        item={item}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
        members={mockMembers}
        onUpdateStatus={onUpdateStatus}
      />
    );

    const statusSelect = screen.getByTestId('status-select-story-1');
    expect(statusSelect).toHaveValue('not_started');

    fireEvent.change(statusSelect, { target: { value: 'in_progress' } });
    expect(onUpdateStatus).toHaveBeenCalledWith('story-1', 'in_progress');
  });

  it('updates assignee directly through inline select without modal', async () => {
    const onUpdateAssignee = vi.fn();
    const item = buildTree([mockItem({ id: 'story-1', title: 'Story Test', assignee: null })])[0];

    render(
      <TreeNode
        item={item}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
        members={mockMembers}
        onUpdateAssignee={onUpdateAssignee}
      />
    );

    const assigneeSelect = screen.getByTestId('assignee-select-story-1');
    expect(assigneeSelect).toHaveValue('');

    fireEvent.change(assigneeSelect, { target: { value: 'Alice Smith' } });
    expect(onUpdateAssignee).toHaveBeenCalledWith('story-1', 'Alice Smith');
  });

  it('disables editing and drag when item is immutable from closed sprint', () => {
    const item = buildTree([mockItem({ id: 'locked-1', title: 'Locked Item', status: 'complete' })])[0];

    render(
      <TreeNode
        item={item}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
        members={mockMembers}
        isImmutable={true}
      />
    );

    expect(screen.getByTestId('immutable-lock-badge')).toBeInTheDocument();
    expect(screen.getByTestId('status-select-locked-1')).toBeDisabled();
    expect(screen.getByTestId('assignee-select-locked-1')).toBeDisabled();
    expect(screen.queryByTestId('add-child-btn-locked-1')).not.toBeInTheDocument();

    const card = screen.getByTestId('tree-node-card-locked-1');
    expect(card).toHaveAttribute('draggable', 'false');
  });
});

describe('Hierarchy UX - TASK-TRK-HIER-CREATE-CHILD', () => {
  it('opens quick child form and invokes onCreateChild with valid child type', async () => {
    const onCreateChild = vi.fn().mockResolvedValue(undefined);
    const item = buildTree([mockItem({ id: 'epic-1', title: 'Feature Epic', item_type: 'epic' })])[0];

    render(
      <TreeNode
        item={item}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
        onCreateChild={onCreateChild}
      />
    );

    const addBtn = screen.getByTestId('add-child-btn-epic-1');
    fireEvent.click(addBtn);

    const titleInput = screen.getByTestId('inline-create-child-input');
    expect(titleInput).toBeInTheDocument();

    // Type is filtered by allowed_parents: story is allowed parent of epic
    const typeSelect = screen.getByTestId('inline-create-child-type-select');
    expect(typeSelect).toHaveValue('story');

    fireEvent.change(titleInput, { target: { value: 'Sub Feature Story' } });
    const submitBtn = screen.getByTestId('inline-create-child-submit');
    fireEvent.click(submitBtn);

    await waitFor(() => {
      expect(onCreateChild).toHaveBeenCalledWith('epic-1', 'Sub Feature Story', 'story');
    });
  });

  it('hides quick child add button on leaf nodes with no allowed child types', () => {
    // In mockHierarchy: Task has no types listing it as allowed_parent
    const leafItem = buildTree([mockItem({ id: 'task-1', title: 'Leaf Task', item_type: 'task' })])[0];

    render(
      <TreeNode
        item={leafItem}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
        onCreateChild={vi.fn()}
      />
    );

    expect(screen.queryByTestId('add-child-btn-task-1')).not.toBeInTheDocument();
  });

  it('keeps inline form open and displays error feedback when child creation fails', async () => {
    const onCreateChild = vi.fn().mockRejectedValue(new Error('Invalid item type for project'));
    const item = buildTree([mockItem({ id: 'epic-1', title: 'Feature Epic', item_type: 'epic' })])[0];

    render(
      <TreeNode
        item={item}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
        onCreateChild={onCreateChild}
      />
    );

    fireEvent.click(screen.getByTestId('add-child-btn-epic-1'));
    const titleInput = screen.getByTestId('inline-create-child-input');
    fireEvent.change(titleInput, { target: { value: 'Failing Child Story' } });

    fireEvent.click(screen.getByTestId('inline-create-child-submit'));

    await waitFor(() => {
      expect(screen.getByTestId('inline-create-child-error')).toHaveTextContent('Invalid item type for project');
    });

    // Input is preserved and form remains open
    expect(screen.getByTestId('inline-create-child-input')).toHaveValue('Failing Child Story');
  });
});

describe('Hierarchy UX - TASK-TRK-HIER-DND-REORDER', () => {
  it('handles drag over positions: before, inside, after', () => {
    const item = buildTree([mockItem({ id: 'node-1', title: 'Target Node' })])[0];

    render(
      <TreeNode
        item={item}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
      />
    );

    const card = screen.getByTestId('tree-node-card-node-1');

    // Mock getBoundingClientRect
    Object.defineProperty(card, 'getBoundingClientRect', {
      value: () => ({
        top: 100,
        height: 100,
        bottom: 200,
        left: 0,
        right: 500,
        width: 500,
        x: 0,
        y: 100,
        toJSON: () => {},
      }),
      configurable: true,
    });

    // Hover at top 15% (clientY = 115) -> before (offsetY = 15 < 25)
    const dragBefore = createEvent.dragOver(card);
    Object.defineProperty(dragBefore, 'clientY', { value: 115 });
    fireEvent(card, dragBefore);
    expect(screen.getByTestId('drop-indicator-before')).toBeInTheDocument();

    // Hover at bottom 85% (clientY = 185) -> after (offsetY = 85 > 75)
    const dragAfter = createEvent.dragOver(card);
    Object.defineProperty(dragAfter, 'clientY', { value: 185 });
    fireEvent(card, dragAfter);
    expect(screen.getByTestId('drop-indicator-after')).toBeInTheDocument();
  });

  it('triggers onReparentItem on drop with draggedId and target position', async () => {
    const onReparent = vi.fn();
    const item = buildTree([mockItem({ id: 'target-node', title: 'Target Node' })])[0];

    render(
      <TreeNode
        item={item}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
        onReparentItem={onReparent}
      />
    );

    const card = screen.getByTestId('tree-node-card-target-node');
    Object.defineProperty(card, 'getBoundingClientRect', {
      value: () => ({
        top: 100,
        height: 100,
        bottom: 200,
        left: 0,
        right: 500,
        width: 500,
        x: 0,
        y: 100,
        toJSON: () => {},
      }),
      configurable: true,
    });

    // Drag over middle -> inside
    fireEvent.dragOver(card, { clientY: 150, dataTransfer: { dropEffect: '' } });

    // Drop
    fireEvent.drop(card, {
      dataTransfer: {
        getData: (key: string) => (key === 'text/plain' ? 'dragged-node' : ''),
      },
    });

    expect(onReparent).toHaveBeenCalledWith('dragged-node', 'target-node', 'inside');
  });

  it('prevents cycle reparenting: ancestor cannot be nested under descendant', () => {
    const items: WorkItem[] = [
      mockItem({ id: 'parent-1', title: 'Parent Node', item_type: 'epic' }),
      mockItem({ id: 'child-1', title: 'Child Node', item_type: 'story', parent_id: 'parent-1' }),
      mockItem({ id: 'grandchild-1', title: 'Grandchild Node', item_type: 'task', parent_id: 'child-1' }),
    ];
    const tree = buildTree(items);

    // grandchild-1 is a descendant of parent-1
    expect(isDescendantOf(tree, 'parent-1', 'grandchild-1')).toBe(true);
    // grandchild-1 is a descendant of child-1
    expect(isDescendantOf(tree, 'child-1', 'grandchild-1')).toBe(true);
    // parent-1 is NOT a descendant of grandchild-1
    expect(isDescendantOf(tree, 'grandchild-1', 'parent-1')).toBe(false);
  });

  it('prevents cycle reparenting across sprint boundaries using allTreeItems', () => {
    // Parent is in Sprint 1, Child is in Sprint 2, Grandchild is in Sprint 1
    const allItems: WorkItem[] = [
      mockItem({ id: 'parent-1', title: 'Parent Node', item_type: 'epic', metadata: { sprint: 'Sprint 1' } }),
      mockItem({ id: 'child-1', title: 'Child Node', item_type: 'story', parent_id: 'parent-1', metadata: { sprint: 'Sprint 2' } }),
      mockItem({ id: 'grandchild-1', title: 'Grandchild Node', item_type: 'task', parent_id: 'child-1', metadata: { sprint: 'Sprint 1' } }),
    ];

    // Filtered tree for Sprint 1 only
    const sprint1Items = allItems.filter((it) => it.metadata?.sprint === 'Sprint 1');
    const filteredTree = buildTree(sprint1Items);
    // Because child-1 is in Sprint 2, filteredTree separates parent-1 and grandchild-1
    expect(isDescendantOf(filteredTree, 'parent-1', 'grandchild-1')).toBe(false);

    // But with allTreeItems, descendant relationship is correctly detected across sprint filters!
    const allTreeItems = buildTree(allItems);
    expect(isDescendantOf(allTreeItems, 'parent-1', 'grandchild-1')).toBe(true);
  });

  it('validates hierarchy constraints for allowed parents', () => {
    // Story under Epic: allowed
    const validStory = validateHierarchyNesting('epic', 'story', mockHierarchy);
    expect(validStory.valid).toBe(true);

    // Task under Story: allowed
    const validTask = validateHierarchyNesting('story', 'task', mockHierarchy);
    expect(validTask.valid).toBe(true);

    // Epic under Task: forbidden
    const invalidEpic = validateHierarchyNesting('task', 'epic', mockHierarchy);
    expect(invalidEpic.valid).toBe(false);
    expect(invalidEpic.message).toContain("cannot be nested under parent of type 'task'");
  });

  it('calculates fractional indexes correctly for sibling insertions', () => {
    // Insert between 1000 and 2000 -> 1500
    expect(calculateOrderIndex(1000, 2000)).toBe(1500);

    // Insert after 2000 -> 3000
    expect(calculateOrderIndex(2000, null)).toBe(3000);

    // Insert before 1000 -> 500
    expect(calculateOrderIndex(null, 1000)).toBe(500);

    // Empty list -> 1000
    expect(calculateOrderIndex(null, null)).toBe(1000);
  });

  it('flattens tree correctly into depth-first order', () => {
    const items: WorkItem[] = [
      mockItem({ id: 'epic-1', title: 'Epic 1' }),
      mockItem({ id: 'story-1', title: 'Story 1', parent_id: 'epic-1' }),
      mockItem({ id: 'task-1', title: 'Task 1', parent_id: 'story-1' }),
      mockItem({ id: 'epic-2', title: 'Epic 2' }),
    ];
    const tree = buildTree(items);
    const flat = flattenTree(tree);

    expect(flat.map((f) => f.id)).toEqual(['epic-1', 'story-1', 'task-1', 'epic-2']);
  });
});

