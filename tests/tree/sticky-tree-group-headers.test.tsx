import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import { TreeViewContainer } from '@/components/views/TreeViewContainer';
import { SprintViewContainer } from '@/components/views/SprintViewContainer';
import { TreeNode } from '@/components/TreeNode';
import { LeftHandNavTree } from '@/components/navigation/LeftHandNavTree';
import { buildTree } from '@/lib/tree';
import {
  HierarchyLevel,
  ProjectSettings,
  StatusDefinition,
  WorkItem,
  WorkItemNode,
} from '@/types/tracker';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

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
    project_id: 'proj-1',
    title: 'Work Item',
    item_type: 'story',
    status: 'in_progress',
    order_index: 1000,
    metadata: { story_points: 3 },
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

describe('TASK-TRK-STICKY-TREE-GROUP-HEADERS', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders sticky project headers per project group in All Projects TreeViewContainer and offsets top-level epics beneath them', () => {
    const items: WorkItem[] = [
      makeItem({ id: 'epic-a', project_id: 'proj-a', item_type: 'epic', title: 'Alpha Epic', order_index: 1000 }),
      makeItem({ id: 'task-a', project_id: 'proj-a', parent_id: 'epic-a', item_type: 'task', title: 'Alpha Task', order_index: 2000 }),
      makeItem({ id: 'epic-b', project_id: 'proj-b', item_type: 'epic', title: 'Beta Epic', order_index: 3000 }),
      makeItem({ id: 'task-b', project_id: 'proj-b', parent_id: 'epic-b', item_type: 'task', title: 'Beta Task', order_index: 4000 }),
    ];
    const treeItems: WorkItemNode[] = buildTree(items);
    const allProjects = [
      { id: 'proj-a', slug: 'alpha', name: 'Project Alpha' },
      { id: 'proj-b', slug: 'beta', name: 'Project Beta' },
    ];

    render(
      <TreeViewContainer
        handleExpandAllTreeNodes={vi.fn()}
        handleCollapseAllTreeNodes={vi.fn()}
        selectedSprint="all"
        setSelectedSprint={vi.fn()}
        availableSprints={[]}
        statusFilterOptions={[]}
        effectiveTreeStatuses={['not_started', 'in_progress', 'complete']}
        setTreeSelectedStatuses={vi.fn()}
        levelFilterOptions={[]}
        effectiveTreeLevels={['epic', 'story', 'task']}
        setTreeSelectedLevels={vi.fn()}
        assigneeFilterOptions={[]}
        effectiveTreeAssignees={[]}
        setTreeSelectedAssignees={vi.fn()}
        treeSortBy="project_asc"
        isAllProjects={true}
        setTreeSortBy={vi.fn()}
        pointMode="granular"
        handlePointModeChange={vi.fn()}
        treeFilteredItems={items}
        projectSettings={baseSettings}
        isReadOnly={false}
        loading={false}
        items={items}
        treeItems={treeItems}
        isTreeRootOver={false}
        setIsTreeRootOver={vi.fn()}
        treeDraggedItemId={null}
        setTreeDraggedItemId={vi.fn()}
        handleTreeReparent={vi.fn()}
        getStatusColor={() => '#38bdf8'}
        deviations={[]}
        onOpenReconciliation={vi.fn()}
        getItemStatuses={() => mockStatuses}
        getItemHierarchy={() => mockHierarchy}
        workspaceMembers={[]}
        getItemProjectSettings={() => baseSettings}
        collapsedTreeNodes={new Set()}
        handleToggleCollapseTreeNode={vi.fn()}
        handleUpdateStatus={vi.fn()}
        handleTreeUpdateAssignee={vi.fn()}
        handleTreeCreateChild={vi.fn()}
        setEditingItem={vi.fn()}
        projectSlug="all"
        allProjects={allProjects}
      />
    );

    const alphaHeader = screen.getByTestId('tree-project-header-proj-a');
    expect(alphaHeader).toHaveClass('sticky', 'top-0');
    expect(alphaHeader).toHaveTextContent('Project Alpha');

    const betaHeader = screen.getByTestId('tree-project-header-proj-b');
    expect(betaHeader).toHaveClass('sticky', 'top-0');
    expect(betaHeader).toHaveTextContent('Project Beta');

    // Expanded top-level epics inside project groups have sticky header offset below project header
    const alphaGroup = screen.getByTestId('tree-project-group-proj-a');
    const stickyEpicRow = alphaGroup.querySelector('[data-sticky-header="true"]');
    expect(stickyEpicRow).not.toBeNull();
    expect(stickyEpicRow).toHaveClass('sticky', 'top-9');
  });

  it('applies sticky header only to expanded root parent nodes in TreeNode, not collapsed or child nodes', () => {
    const items: WorkItem[] = [
      makeItem({ id: 'epic-expanded', item_type: 'epic', title: 'Expanded Epic' }),
      makeItem({ id: 'story-child', item_type: 'story', parent_id: 'epic-expanded', title: 'Child Story' }),
      makeItem({ id: 'task-grandchild', item_type: 'task', parent_id: 'story-child', title: 'Leaf Task' }),
    ];
    const tree = buildTree(items);

    const { rerender, container } = render(
      <TreeNode
        item={tree[0]}
        collapsedNodeIds={new Set()}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
      />
    );

    // Expanded root epic has sticky header, child story does not
    const stickyHeaders = container.querySelectorAll('[data-sticky-header="true"]');
    expect(stickyHeaders).toHaveLength(1);
    expect(stickyHeaders[0]).toHaveClass('sticky', 'top-0');

    // When collapsed, root epic is no longer sticky
    rerender(
      <TreeNode
        item={tree[0]}
        collapsedNodeIds={new Set(['epic-expanded'])}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
      />
    );
    expect(container.querySelectorAll('[data-sticky-header="true"]')).toHaveLength(0);
  });

  it('adds sticky top-level epic context headers inside SprintViewContainer Hierarchy mode', () => {
    const items: WorkItem[] = [
      makeItem({
        id: 'epic-s1',
        item_type: 'epic',
        title: 'Sprint Epic',
        metadata: { sprint: 'Sprint 2026-Q4', story_points: 5 },
      }),
      makeItem({
        id: 'task-s1',
        item_type: 'task',
        parent_id: 'epic-s1',
        title: 'Sprint Child Task',
        metadata: { sprint: 'Sprint 2026-Q4', story_points: 3 },
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
        projectSlug="sticky-sprint-proj"
      />
    );

    const branch = screen.getByTestId('sprint-tree-branch-epic-s1');
    const rows = within(branch).getAllByTestId('sprint-item-row');
    expect(rows[0]).toHaveAttribute('data-sticky-header', 'true');
    expect(rows[0]).toHaveClass('md:sticky');
    expect(rows[1]).not.toHaveAttribute('data-sticky-header', 'true');
  });

  it('makes expanded Project and Epic nodes sticky inside LeftHandNavTree', () => {
    const items: WorkItem[] = [
      makeItem({ id: 'epic-lhn', project_id: 'proj-1', item_type: 'epic', title: 'LHN Sticky Epic', metadata: { sprint: 'Sprint 2026-Q4' } }),
      makeItem({ id: 'task-lhn', project_id: 'proj-1', parent_id: 'epic-lhn', item_type: 'task', title: 'LHN Task', metadata: { sprint: 'Sprint 2026-Q4' } }),
    ];
    const projects = [{ id: 'proj-1', slug: 'tracker', name: 'Tracker Project' }];

    // Expand all in localStorage before mount
    localStorage.setItem(
      'sunshade_tree_state_pym-energy',
      JSON.stringify(['project:proj-1', 'project:proj-1:sprint:Sprint 2026-Q4', 'item:epic-lhn'])
    );

    const { container } = render(
      <LeftHandNavTree
        items={items}
        projects={projects}
        tenantSlug="pym-energy"
      />
    );

    // Switch to Projects tab (Domain mode: Project > Sprint > Item)
    const projectsTab = screen.getByRole('tab', { name: /projects/i });
    fireEvent.click(projectsTab);

    const treeItems = container.querySelectorAll('[role="treeitem"]');
    const projectRow = Array.from(treeItems).find((el) => el.textContent?.includes('Tracker Project'));
    expect(projectRow).toHaveClass('sticky', 'top-0');

    const epicRow = Array.from(treeItems).find((el) => el.textContent?.includes('LHN Sticky Epic'));
    expect(epicRow).toHaveClass('sticky', 'top-7');
  });
});
