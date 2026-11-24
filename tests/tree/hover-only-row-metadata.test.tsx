import React from 'react';
import fs from 'fs';
import path from 'path';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TreeNode } from '@/components/TreeNode';
import { SprintItemRow } from '@/components/SprintItemRow';
import { NavTreeNode } from '@/components/navigation/NavTreeNode';
import { SprintViewContainer } from '@/components/views/SprintViewContainer';
import { RowColumnHeader } from '@/components/common/RowColumnHeader';
import { getStaticRowColumns, getColumnTrackWidthClass } from '@/lib/row-columns';
import { buildTree } from '@/lib/tree';
import { HierarchyLevel, ProjectSettings, StatusDefinition, WorkItem } from '@/types/tracker';
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
    title: 'Always Visible Row Metadata Target',
    description: 'Detailed item notes',
    external_ref_id: 'TASK-VIS-1',
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

describe('Always-visible row metadata and single-screen row fit', () => {
  it('keeps secondary metadata and empty states visible at rest in TreeNode', () => {
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

    const refContainer = screen.getByTestId('tree-node-ref-id-epic-1');
    expect(refContainer).not.toHaveClass('md:opacity-0');

    const descBtn = screen.getByTestId('tree-expand-desc-btn-epic-1');
    expect(descBtn).not.toHaveClass('md:opacity-0');

    expect(screen.queryByTestId('tree-hover-meta-summary-epic-1')).toBeNull();

    const lockBadges = screen.getAllByTestId('immutable-lock-badge');
    const lockText = lockBadges[0].querySelector('span');
    expect(lockText).not.toHaveClass('md:hidden');

    const expandedSubtasks = screen.getByTestId('tree-node-subtasks-badge');
    expect(expandedSubtasks).not.toHaveClass('md:opacity-0');

    const assigneeCols = screen.getAllByTestId('col-assignee');
    expect(assigneeCols[0]).not.toHaveClass('md:opacity-0');

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
    expect(collapsedSubtasks).not.toHaveClass('md:opacity-0');
  });

  it('keeps row metadata, empty indicators, clamped widths, and overflow guards visible at rest in SprintItemRow', () => {
    const populatedItem = makeItem({ id: 'sprint-row-1', assignee: null });
    const emptyItem = makeItem({
      id: 'sprint-row-empty',
      external_ref_id: 'TASK-VERY-LONG-REF-IDENTIFIER-12345',
      assignee: null,
      metadata: {},
    });

    render(
      <>
        <SprintItemRow
          item={populatedItem}
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
        <SprintItemRow
          item={emptyItem}
          isSelected={false}
          onToggleSelect={vi.fn()}
          isImmutable={false}
          onEditItem={vi.fn()}
          getItemHierarchy={() => mockHierarchy}
          getItemStatuses={() => mockStatuses}
          availableSprints={['Sprint 2026-Q4']}
        />
      </>
    );

    const refEl = screen.getByTestId('copyable-ref-id-TASK-VIS-1');
    expect(refEl).not.toHaveClass('md:opacity-0');
    expect(refEl).toHaveClass('sm:max-w-[110px]');

    const longRefEl = screen.getByTestId('copyable-ref-id-TASK-VERY-LONG-REF-IDENTIFIER-12345');
    expect(longRefEl).toHaveClass('sm:max-w-[110px]', 'truncate');

    const subtasksPill = screen.getByTestId('tree-child-count-badge');
    expect(subtasksPill).not.toHaveClass('md:opacity-0');

    const sprintCell = screen.getByTestId('row-cell-sprint-sprint-row-1');
    expect(sprintCell).not.toHaveClass('md:opacity-0');
    expect(sprintCell).toHaveClass('overflow-hidden');

    const githubCell = screen.getByTestId('row-cell-github-sprint-row-1');
    expect(githubCell).not.toHaveClass('md:opacity-0');
    expect(githubCell).toHaveClass('w-36', 'overflow-hidden');

    // Empty github cell stays visible so missing fields show an empty indicator at rest
    const emptyGithubCell = screen.getByTestId('row-cell-github-sprint-row-empty');
    expect(emptyGithubCell).not.toHaveClass('md:opacity-0');
    expect(emptyGithubCell).toHaveTextContent('—');

    const assigneeCells = screen.getAllByTestId('sprint-col-assignee');
    expect(assigneeCells[0]).not.toHaveClass('md:opacity-0');

    const editBtn = screen.getByTestId('edit-item-desktop-sprint-row-1');
    expect(editBtn).not.toHaveClass('md:opacity-0');
  });

  it('keeps item-level rollup points and sprint settings visible at rest in NavTreeNode', () => {
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

    const settingsBtn = screen.getByLabelText('Sprint Settings');
    expect(settingsBtn).not.toHaveClass('opacity-0');

    expect(screen.getByText('10 pts')).not.toHaveClass('opacity-0');
    expect(screen.getByText('5 pts')).not.toHaveClass('opacity-0');
  });

  it('fits SprintViewContainer rows within a single screen width and uses compact column headers', () => {
    const item = makeItem({
      id: 'sprint-fit-1',
      title: 'Extremely Long Autonomous Execution Control Plane Title That Should Truncate Instead Of Overflowing',
    });

    const projectSettings: ProjectSettings = {
      schema_version: '1.0',
      hierarchy: mockHierarchy,
      statuses: mockStatuses,
      custom_fields: [],
      sprints: [{ name: 'Sprint 2026-Q4', start_date: '2026-10-01', end_date: '2026-12-31' }],
    };

    const { container } = render(
      <SprintViewContainer
        items={[item]}
        projectSettings={projectSettings}
        isReadOnly={false}
        pointMode="macro"
        handlePointModeChange={vi.fn()}
        sprintViewMode="flat"
        setSprintViewMode={vi.fn()}
        handleToggleCollapseAllSprints={vi.fn()}
        collapsedSprints={new Set()}
        toggleSprintCollapse={vi.fn()}
        handleToggleHideCompletedSprints={vi.fn()}
        hideCompletedSprints={false}
        hiddenCompletedSprintsCount={0}
        statusFilterOptions={[]}
        effectiveSprintStatuses={[]}
        setSprintSelectedStatuses={vi.fn()}
        levelFilterOptions={[]}
        effectiveSprintLevels={[]}
        setSprintSelectedLevels={vi.fn()}
        sprintSortBy="manual"
        setSprintSortBy={vi.fn()}
        setIsManageSprintsOpen={vi.fn()}
        visibleSprints={['Sprint 2026-Q4']}
        availableSprints={['Sprint 2026-Q4']}
        filterSprintItems={(list) => list}
        sprintComparator={() => 0}
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
        handleUpdateItemSprint={vi.fn()}
      />
    );

    const sprintBodyScroll = container.querySelector('[data-testid="sprint-body-scroll-Sprint 2026-Q4"]');
    expect(sprintBodyScroll).toHaveClass('md:overflow-x-clip');
    expect(sprintBodyScroll).not.toHaveClass('max-h-[75dvh]', 'overflow-y-auto');
    expect(sprintBodyScroll?.firstElementChild).toHaveClass('w-full', 'min-w-0');
    expect(sprintBodyScroll?.firstElementChild).not.toHaveClass('md:w-max');

    const backlogBodyScroll = container.querySelector('[data-testid="backlog-body-scroll"]');
    expect(backlogBodyScroll).toHaveClass('md:overflow-x-clip');
    expect(backlogBodyScroll).not.toHaveClass('max-h-[75dvh]', 'overflow-y-auto');
    expect(backlogBodyScroll?.firstElementChild).toHaveClass('w-full', 'min-w-0');
    expect(backlogBodyScroll?.firstElementChild).not.toHaveClass('md:w-max');

    render(<RowColumnHeader columns={getStaticRowColumns(projectSettings)} />);
    expect(screen.getAllByText('Pts').length).toBeGreaterThan(0);
    expect(screen.getAllByText('User').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sts').length).toBeGreaterThan(0);

    // Narrow central-stage native @container rules & wrapping keep Tier 1/Tier 2 controls reachable without clipping
    const firstRow = container.querySelector('[data-testid="sprint-item-row"]');
    const firstTier1 = firstRow?.querySelector('.sprint-item-row-tier1');
    const firstTier2 = container.querySelector('[data-testid="sprint-item-row-tier2"]');
    const sprintHeaderStrip = container.querySelector('[data-testid="sprint-column-header-Sprint 2026-Q4"]');
    expect(firstRow).toHaveClass('sprint-item-row', 'md:flex-wrap');
    expect(firstTier1).toHaveClass('md:min-w-[200px]');
    expect(firstTier2).toHaveClass('sprint-item-row-tier2', 'md:flex-wrap', 'max-w-full', 'min-w-0');
    expect(sprintHeaderStrip).toHaveClass('sprint-column-header');

    const globalsCss = fs.readFileSync(path.resolve(__dirname, '../../src/app/globals.css'), 'utf-8');
    expect(globalsCss).toContain('@container central-stage (max-width: 860px)');
    expect(globalsCss).toContain('.sprint-item-row-tier2');
    expect(globalsCss).toContain('.sprint-column-header');

    // Custom work metric labels (e.g. Hours, AI Credits) preserve their configured name instead of 'Pts'
    const customMetricCols = getStaticRowColumns({
      ...projectSettings,
      work_metric_config: { field_key: 'hours', label: 'Hours', unit_label: 'hrs' },
    });
    render(<RowColumnHeader columns={customMetricCols} testId="custom-metric-header" />);
    expect(screen.getByTestId('custom-metric-header')).toHaveTextContent('Hours');

    // Explicit github column width overrides are honored while default remains lg (w-36)
    expect(getColumnTrackWidthClass('lg', 'github')).toBe('w-36');
    expect(getColumnTrackWidthClass('sm', 'github')).toBe('w-24');
  });
});
