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

    // Scroll container supports both horizontal & vertical touch/wheel scroll so sticky headers work
    const scrollContainer = screen.getByTestId('tree-scroll-container');
    expect(scrollContainer).toHaveClass('overflow-x-auto', 'overflow-y-auto', 'touch-pan-x', 'touch-pan-y');
    scrollContainer.scrollTop = 250;
    fireEvent.scroll(scrollContainer);

    // Expanded top-level epics inside project groups have sticky header offset below project header
    const alphaGroup = screen.getByTestId('tree-project-group-proj-a');
    const stickyEpicRow = alphaGroup.querySelector('[data-sticky-header="true"]');
    expect(stickyEpicRow).not.toBeNull();
    expect(stickyEpicRow).toHaveClass('sticky', 'top-9');
    // Sticky header is a direct child of tree-node so its containing block spans children-container
    const treeNodeWrapper = stickyEpicRow!.parentElement;
    expect(treeNodeWrapper).toHaveAttribute('data-testid', 'tree-node');
    expect(
      treeNodeWrapper!.querySelector('[data-testid="children-container-epic-a"]')
    ).not.toBeNull();
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

    const sprintBodyScroll = screen.getByTestId('sprint-body-scroll-Sprint 2026-Q4');
    expect(sprintBodyScroll).toHaveClass('overflow-x-auto', 'overflow-y-auto');
    sprintBodyScroll.scrollTop = 180;
    fireEvent.scroll(sprintBodyScroll);

    const branch = screen.getByTestId('sprint-tree-branch-epic-s1');
    const rows = within(branch).getAllByTestId('sprint-item-row');
    expect(rows[0]).toHaveAttribute('data-sticky-header', 'true');
    expect(rows[0]).toHaveClass('md:sticky', 'md:top-0');
    expect(rows[1]).not.toHaveAttribute('data-sticky-header', 'true');
  });

  it('accumulates non-overlapping sticky offsets in NavTreeNode for Sprint > Project > custom top-level Initiative (BUG_0006 & ANALYSIS_0004)', () => {
    const items: WorkItem[] = [
      makeItem({
        id: 'init-lhn',
        project_id: 'proj-1',
        item_type: 'initiative',
        title: 'LHN Initiative',
        metadata: { sprint: 'Sprint 2026-Q4' },
      }),
      makeItem({
        id: 'task-lhn',
        project_id: 'proj-1',
        parent_id: 'init-lhn',
        item_type: 'task',
        title: 'LHN Child Task',
        metadata: { sprint: 'Sprint 2026-Q4' },
      }),
    ];
    const projects = [{ id: 'proj-1', slug: 'tracker', name: 'Tracker Project' }];

    localStorage.setItem(
      'sunshade_tree_state_pym-energy',
      JSON.stringify(['sprint:Sprint 2026-Q4', 'sprint:Sprint 2026-Q4:project:proj-1', 'item:init-lhn'])
    );

    const { container } = render(
      <LeftHandNavTree
        items={items}
        projects={projects}
        tenantSlug="pym-energy"
      />
    );

    const treeContainer = screen.getByRole('tree', { name: 'Work Items File Tree' });
    treeContainer.scrollTop = 120;
    fireEvent.scroll(treeContainer);

    const treeItems = Array.from(container.querySelectorAll('[role="treeitem"]'));
    const sprintRow = treeItems.find((el) => el.textContent?.includes('Sprint 2026-Q4')) as HTMLElement;
    const projectRow = treeItems.find((el) => el.textContent?.includes('Tracker Project')) as HTMLElement;
    const initiativeRow = treeItems.find((el) => el.textContent?.includes('LHN Initiative')) as HTMLElement;

    expect(sprintRow).toHaveStyle({ top: '0px', zIndex: '20' });
    expect(projectRow).toHaveStyle({ top: '28px', zIndex: '15' });
    expect(initiativeRow).toHaveStyle({ top: '56px', zIndex: '10' });
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
    expect(projectRow).toHaveClass('sticky');
    expect(projectRow).toHaveStyle({ top: '0px' });

    const epicRow = Array.from(treeItems).find((el) => el.textContent?.includes('LHN Sticky Epic'));
    expect(epicRow).toHaveClass('sticky');
    expect(epicRow).toHaveStyle({ top: '56px' });
  });

  it('preserves inline child creation drafts in TreeViewContainer when sorting reorders project groups (BUG_0004)', () => {
    const items: WorkItem[] = [
      makeItem({ id: 'epic-beta', project_id: 'proj-b', item_type: 'epic', title: 'Beta Epic', order_index: 1000 }),
      makeItem({ id: 'epic-alpha', project_id: 'proj-a', item_type: 'epic', title: 'Alpha Epic', order_index: 2000 }),
    ];
    const allProjects = [
      { id: 'proj-a', slug: 'alpha', name: 'Alpha Project' },
      { id: 'proj-b', slug: 'beta', name: 'Beta Project' },
    ];

    const SortHarness = () => {
      const [sortBy, setSortBy] = React.useState('order_index');
      const sortedItems = React.useMemo(() => {
        const copy = [...items];
        if (sortBy === 'project_asc') {
          return copy.reverse();
        }
        return copy;
      }, [sortBy]);
      const treeItems = React.useMemo(() => buildTree(sortedItems), [sortedItems]);

      return (
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
          treeSortBy={sortBy}
          isAllProjects={true}
          setTreeSortBy={setSortBy}
          pointMode="granular"
          handlePointModeChange={vi.fn()}
          treeFilteredItems={sortedItems}
          projectSettings={baseSettings}
          isReadOnly={false}
          loading={false}
          items={sortedItems}
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
    };

    render(<SortHarness />);

    fireEvent.click(screen.getByTestId('add-child-btn-epic-alpha'));
    const draftInput = screen.getByTestId('inline-create-child-input');
    fireEvent.change(draftInput, { target: { value: 'Unsaved Child Draft' } });

    // Switch sort so Alpha moves from second section to first section
    fireEvent.change(screen.getByTestId('tree-sort-by'), { target: { value: 'project_asc' } });

    expect(screen.getByTestId('inline-create-child-input')).toHaveValue('Unsaved Child Draft');
  });

  it('keeps expanded description and quick child form outside the sticky header block on sticky root epics (ANALYSIS_0002)', () => {
    const items: WorkItem[] = [
      makeItem({
        id: 'epic-root',
        item_type: 'epic',
        title: 'Root Epic',
        description: 'Long epic description that should not stay pinned in sticky bar',
      }),
      makeItem({
        id: 'task-child',
        item_type: 'task',
        parent_id: 'epic-root',
        title: 'Child Task',
      }),
    ];
    const tree = buildTree(items);

    const { container } = render(
      <TreeNode
        item={tree[0]}
        collapsedNodeIds={new Set()}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
        onCreateChild={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTestId('tree-expand-desc-btn-epic-root'));
    fireEvent.click(screen.getByTestId('add-child-btn-epic-root'));

    const stickyBlock = container.querySelector('[data-sticky-header="true"]')!;
    const descBox = screen.getByTestId('tree-node-description-epic-root');
    const childForm = screen.getByTestId('inline-create-child-form');

    expect(stickyBlock).not.toContainElement(descBox);
    expect(stickyBlock).not.toContainElement(childForm);
  });
});
