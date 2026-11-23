import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TreeNode } from '@/components/TreeNode';
import { SprintItemRow } from '@/components/SprintItemRow';
import { NavTreeNode } from '@/components/navigation/NavTreeNode';
import { buildTree } from '@/lib/tree';
import { HierarchyLevel, StatusDefinition, WorkItem } from '@/types/tracker';
import { PivotTreeNode } from '@/hooks/usePivotTree';

const mockHierarchy: HierarchyLevel[] = [
  { level: 1, type: 'epic', label: 'Epic', allowed_parents: [] },
  { level: 2, type: 'story', label: 'Story', allowed_parents: ['epic'] },
  { level: 3, type: 'task', label: 'Task', allowed_parents: ['story'] },
];

const mockStatuses: StatusDefinition[] = [
  { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
  { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
  { id: 'complete', label: 'Complete', color: '#22c55e', order: 3, is_completed: true },
];

function makeItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'item-hover-1',
    tenant_id: 't-1',
    project_id: 'p-1',
    title: 'Hover Metadata Declutter Target',
    description: 'Detailed item notes',
    external_ref_id: 'TASK-HOVER-1',
    item_type: 'story',
    status: 'in_progress',
    order_index: 1000,
    assignee: null,
    metadata: {
      story_points: 5,
      priority: 'High',
      sprint: 'Sprint 2026-Q4',
      pr_url: 'https://github.com/sunshade/tracker/pull/42',
    },
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-02T00:00:00Z',
    ...overrides,
  };
}

describe('TASK-TRK-HOVER-ONLY-ROW-METADATA', () => {
  it('defers secondary metadata (ref_id, desc toggle, unassigned assignee, consolidated priority/sprint, actions) to hover in TreeNode', () => {
    const items = [
      makeItem({ id: 'epic-1', item_type: 'epic', title: 'Parent Epic' }),
      makeItem({ id: 'task-1', item_type: 'task', parent_id: 'epic-1', title: 'Child Task' }),
    ];
    const tree = buildTree(items);

    const { rerender } = render(
      <TreeNode
        item={tree[0]}
        collapsedNodeIds={new Set()}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
        isImmutable={true}
        onCreateChild={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    // Ref ID deferred to hover
    const refContainer = screen.getByTestId('tree-node-ref-id-epic-1');
    expect(refContainer).toHaveClass('md:opacity-0', 'md:group-hover:opacity-100');

    // Description chevron deferred to hover when not expanded
    const descBtn = screen.getByTestId('tree-expand-desc-btn-epic-1');
    expect(descBtn).toHaveClass('md:opacity-0', 'md:group-hover:opacity-100');

    // Consolidated hover metadata chip surfaces unrendered priority & sprint on hover
    const hoverChip = screen.getByTestId('tree-hover-meta-summary-epic-1');
    expect(hoverChip).toHaveClass('md:opacity-0', 'md:group-hover:opacity-100');
    expect(hoverChip).toHaveTextContent('High · Sprint 2026-Q4');

    // Lock badge consolidates text to hover on desktop
    const lockBadges = screen.getAllByTestId('immutable-lock-badge');
    const lockText = lockBadges[0].querySelector('span');
    expect(lockText).toHaveClass('md:hidden', 'md:group-hover:inline');

    // Expanded parent defers (n) subtask count to hover
    const expandedSubtasks = screen.getByTestId('tree-node-subtasks-badge');
    expect(expandedSubtasks).toHaveClass('md:opacity-0', 'md:group-hover:opacity-100');

    // Unassigned assignee deferred to hover
    const assigneeCols = screen.getAllByTestId('col-assignee');
    expect(assigneeCols[0]).toHaveClass('md:opacity-0', 'md:group-hover:opacity-100');

    // Collapsed parent keeps (n) softly visible
    rerender(
      <TreeNode
        item={tree[0]}
        collapsedNodeIds={new Set(['epic-1'])}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
        onEditItem={vi.fn()}
      />
    );
    const collapsedSubtasks = screen.getByTestId('tree-node-subtasks-badge');
    expect(collapsedSubtasks).toHaveClass('opacity-75', 'group-hover:opacity-100');
    expect(collapsedSubtasks).not.toHaveClass('md:opacity-0');
  });

  it('keeps assigned assignee avatar visible at rest in TreeNode and SprintItemRow', () => {
    const assignedItem = makeItem({ id: 'assigned-1', assignee: 'Tymz' });
    const tree = buildTree([assignedItem]);

    render(
      <TreeNode
        item={tree[0]}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
      />
    );

    expect(screen.getByTestId('col-assignee')).not.toHaveClass('md:opacity-0');

    render(
      <SprintItemRow
        item={assignedItem}
        isSelected={false}
        onToggleSelect={vi.fn()}
        isImmutable={false}
        onEditItem={vi.fn()}
        getItemHierarchy={() => mockHierarchy}
        getItemStatuses={() => mockStatuses}
      />
    );

    expect(screen.getByTestId('sprint-col-assignee')).not.toHaveClass('md:opacity-0');
  });

  it('defers secondary metadata (ref_id, subtasks pill, sprint select, github cluster, edit action, unassigned assignee) to hover in SprintItemRow', () => {
    const item = makeItem({ id: 'sprint-row-1', assignee: null });

    render(
      <SprintItemRow
        item={item}
        isSelected={false}
        onToggleSelect={vi.fn()}
        isImmutable={true}
        onEditItem={vi.fn()}
        getItemHierarchy={() => mockHierarchy}
        getItemStatuses={() => mockStatuses}
        availableSprints={['Sprint 2026-Q4']}
        currentSprintName="Sprint 2026-Q4"
        isTreeMode={true}
        childCount={3}
        rollupPoints={12}
      />
    );

    const refEl = screen.getByTestId('copyable-ref-id-TASK-HOVER-1');
    expect(refEl).toHaveClass('md:opacity-0', 'md:group-hover:opacity-100');

    const subtasksPill = screen.getByTestId('tree-child-count-badge');
    expect(subtasksPill).toHaveClass('md:opacity-0', 'md:group-hover:opacity-100');

    const sprintCell = screen.getByTestId('row-cell-sprint-sprint-row-1');
    expect(sprintCell).toHaveClass('md:opacity-0', 'md:group-hover:opacity-100');

    const githubCell = screen.getByTestId('row-cell-github-sprint-row-1');
    expect(githubCell).toHaveClass('md:opacity-0', 'md:group-hover:opacity-100');

    const assigneeCell = screen.getByTestId('sprint-col-assignee');
    expect(assigneeCell).toHaveClass('md:opacity-0', 'md:group-hover:opacity-100');

    const editBtn = screen.getByTestId('edit-item-desktop-sprint-row-1');
    expect(editBtn).toHaveClass('md:opacity-0', 'md:group-hover:opacity-100');
  });

  it('defers item-level rollup points and sprint settings trigger to row hover in NavTreeNode', () => {
    const sprintNode: PivotTreeNode = {
      id: 'sprint:S1',
      title: 'Sprint 1',
      type: 'sprint',
      sprintName: 'Sprint 1',
      depth: 0,
      childCount: 2,
      rollupPoints: 10,
      children: [
        {
          id: 'item:i1',
          title: 'Nested Task',
          type: 'item',
          itemType: 'task',
          depth: 1,
          childCount: 0,
          rollupPoints: 5,
          children: [],
        },
      ],
    };

    render(
      <NavTreeNode
        node={sprintNode}
        depth={0}
        isExpanded={true}
        onToggle={vi.fn()}
        onSelectSprint={vi.fn()}
        expandedNodes={new Set(['sprint:S1'])}
      />
    );

    // Sprint settings trigger deferred to row hover on hover-capable devices, visible on touch
    const settingsBtn = screen.getByLabelText('Sprint Settings');
    expect(settingsBtn).toHaveClass('opacity-0', '[@media(hover:none)]:opacity-70', 'group-hover/row:opacity-100');

    // Sprint-level rollup points stay visible
    expect(screen.getByText('10 pts')).not.toHaveClass('opacity-0');

    // Item-level rollup points deferred to row hover
    expect(screen.getByText('5 pts')).toHaveClass('opacity-0', 'group-hover/row:opacity-100');
  });
});
