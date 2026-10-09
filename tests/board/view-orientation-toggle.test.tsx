import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectToolbar } from '@/components/board/ProjectToolbar';
import { BoardViewContainer } from '@/components/views/BoardViewContainer';
import { WorkItem, ProjectSettings } from '@/types/tracker';

describe('TASK-TRK-VIEW-ORIENTATION-TOGGLE: Toolbar Orientation Toggle & Desktop Vertical Collapse Retirement', () => {
  const sampleSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [{ type: 'task', label: 'Task', level: 1, allowed_parents: [] }],
    statuses: [
      { id: 'backlog', label: 'Backlog', color: '#64748b', order: 1 },
      { id: 'in_progress', label: 'In Progress', color: '#3b82f6', order: 2 },
    ],
    custom_fields: [],
  };

  const sampleItems: WorkItem[] = [
    {
      id: 'task-1',
      tenant_id: 'tenant-1',
      project_id: 'proj-1',
      title: 'Item 1',
      item_type: 'task',
      status: 'backlog',
      order_index: 1000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {},
    },
  ];

  describe('ProjectToolbar Orientation Switcher', () => {
    it('renders orientation toggle with Columns and Wide Stack buttons and fires onOrientationChange', () => {
      const handleOrientationChange = vi.fn();

      render(
        <ProjectToolbar
          statusFilterOptions={[]}
          effectiveSelectedStatuses={[]}
          setSelectedStatuses={() => {}}
          levelFilterOptions={[]}
          effectiveSelectedLevels={[]}
          setSelectedLevels={() => {}}
          selectedSprint="all"
          setSelectedSprint={() => {}}
          availableSprints={[]}
          items={sampleItems}
          projectSettings={sampleSettings}
          pointMode="granular"
          handlePointModeChange={() => {}}
          collapseAllColumns={() => {}}
          expandAllColumns={() => {}}
          boardOrientation="columns"
          onOrientationChange={handleOrientationChange}
        />
      );

      const toggle = screen.getByTestId('board-orientation-toggle');
      expect(toggle).toBeInTheDocument();

      const columnsBtn = screen.getByTestId('orientation-columns-btn');
      const stackBtn = screen.getByTestId('orientation-stack-btn');

      expect(columnsBtn).toBeInTheDocument();
      expect(stackBtn).toBeInTheDocument();

      // Click Wide Stack
      fireEvent.click(stackBtn);
      expect(handleOrientationChange).toHaveBeenCalledWith('stack');

      // Click Columns
      fireEvent.click(columnsBtn);
      expect(handleOrientationChange).toHaveBeenCalledWith('columns');
    });
  });

  describe('BoardViewContainer Desktop Vertical Collapse Retirement & Wide Stack Layout', () => {
    it('in horizontal columns view: vertical collapse button has md:hidden (retired on desktop) while sideways collapse is visible', () => {
      render(
        <BoardViewContainer
          {...({
            items: sampleItems,
            projectSettings: sampleSettings,
            projectSlug: 'sunshade-tracker',
            tenantSlug: 'sunshade',
            isReadOnly: false,
            loading: false,
            setEditingItem: () => {},
            setDeleteConfirmItem: () => {},
            handleUpdateStatus: () => {},
            handleUpdateType: () => {},
            handleDragStart: () => {},
            handleDragEnd: () => {},
            handleDragOverCard: () => {},
            handleDrop: () => {},
            childCountMap: new Map(),
            pointsRollupMap: new Map(),
            allProjects: [],
            isAllProjects: false,
            pointMode: 'granular',
            handlePointModeChange: () => {},
            getItemHierarchy: () => sampleSettings.hierarchy,
            getItemStatuses: () => sampleSettings.statuses,
            displayedStatuses: sampleSettings.statuses,
            columnsItemsMap: { backlog: sampleItems, in_progress: [] },
            collapsedColumnsUp: new Set(),
            collapsedColumnsSideways: new Set(),
            statusFilterOptions: [],
            effectiveSelectedStatuses: [],
            setSelectedStatuses: () => {},
            levelFilterOptions: [],
            effectiveSelectedLevels: [],
            setSelectedLevels: () => {},
            selectedSprint: 'all',
            setSelectedSprint: () => {},
            availableSprints: [],
            collapseAllColumns: () => {},
            expandAllColumns: () => {},
            toggleCollapseUp: () => {},
            toggleCollapseSideways: () => {},
            boardHeightMode: 'standard',
            setBoardHeightMode: () => {},
            boardScrollRef: { current: null },
            handleBoardWheel: () => {},
            columnCounts: { backlog: 1, in_progress: 0 },
            draggedItemId: null,
            dragOverTarget: null,
            quickAddColId: null,
            setQuickAddColId: () => {},
            quickAddTitle: '',
            setQuickAddTitle: () => {},
            isCreatingQuickItem: false,
            handleCreateQuickInlineItem: () => {},
            hiddenBoardItems: [],
            dismissedBoardDeviationBanner: false,
            setDismissedBoardDeviationBanner: () => {},
            onOpenReconciliation: () => {},
            boardOrientation: 'columns',
          } as any)}
        />
      );

      // Sideways collapse is visible in columns mode
      const sidewaysBtn = screen.getByTestId('column-collapse-sideways-btn-backlog');
      expect(sidewaysBtn).toBeInTheDocument();

      // Vertical collapse chevron has md:hidden, retiring it from desktop view when not collapsed
      const verticalBtn = screen.getByTestId('column-collapse-up-btn-backlog');
      expect(verticalBtn).toBeInTheDocument();
      expect(verticalBtn.className).toContain('md:hidden');
    });

    it('in horizontal columns view: when column is collapsed upward, expand button is exposed on desktop and clicking header or button expands it (PR-82 comment 1)', () => {
      const handleToggleCollapseUp = vi.fn();

      render(
        <BoardViewContainer
          {...({
            items: sampleItems,
            projectSettings: sampleSettings,
            projectSlug: 'sunshade-tracker',
            tenantSlug: 'sunshade',
            isReadOnly: false,
            loading: false,
            setEditingItem: () => {},
            setDeleteConfirmItem: () => {},
            handleUpdateStatus: () => {},
            handleUpdateType: () => {},
            handleDragStart: () => {},
            handleDragEnd: () => {},
            handleDragOverCard: () => {},
            handleDrop: () => {},
            childCountMap: new Map(),
            pointsRollupMap: new Map(),
            allProjects: [],
            isAllProjects: false,
            pointMode: 'granular',
            handlePointModeChange: () => {},
            getItemHierarchy: () => sampleSettings.hierarchy,
            getItemStatuses: () => sampleSettings.statuses,
            displayedStatuses: sampleSettings.statuses,
            columnsItemsMap: { backlog: sampleItems, in_progress: [] },
            collapsedColumnsUp: new Set(['backlog']),
            collapsedColumnsSideways: new Set(),
            statusFilterOptions: [],
            effectiveSelectedStatuses: [],
            setSelectedStatuses: () => {},
            levelFilterOptions: [],
            effectiveSelectedLevels: [],
            setSelectedLevels: () => {},
            selectedSprint: 'all',
            setSelectedSprint: () => {},
            availableSprints: [],
            collapseAllColumns: () => {},
            expandAllColumns: () => {},
            toggleCollapseUp: handleToggleCollapseUp,
            toggleCollapseSideways: () => {},
            boardHeightMode: 'standard',
            setBoardHeightMode: () => {},
            boardScrollRef: { current: null },
            handleBoardWheel: () => {},
            columnCounts: { backlog: 1, in_progress: 0 },
            draggedItemId: null,
            dragOverTarget: null,
            quickAddColId: null,
            setQuickAddColId: () => {},
            quickAddTitle: '',
            setQuickAddTitle: () => {},
            isCreatingQuickItem: false,
            handleCreateQuickInlineItem: () => {},
            hiddenBoardItems: [],
            dismissedBoardDeviationBanner: false,
            setDismissedBoardDeviationBanner: () => {},
            onOpenReconciliation: () => {},
            boardOrientation: 'columns',
          } as any)}
        />
      );

      // Expand button is exposed on desktop without md:hidden
      const verticalBtn = screen.getByTestId('column-collapse-up-btn-backlog');
      expect(verticalBtn).toBeInTheDocument();
      expect(verticalBtn.className).not.toContain('md:hidden');
      expect(verticalBtn).toHaveAttribute('title', 'Expand Backlog');

      // Clicking expand button toggles upward collapse
      fireEvent.click(verticalBtn);
      expect(handleToggleCollapseUp).toHaveBeenCalledWith('backlog');

      // Clicking column header directly toggles collapse
      const columnHeader = screen.getByText('Backlog').closest('div[class*="rounded-t-xl"]');
      expect(columnHeader).not.toBeNull();
      fireEvent.click(columnHeader!);
      expect(handleToggleCollapseUp).toHaveBeenCalledTimes(2);
    });

    it('in wide stack view: vertical accordion chevron is visible across all viewports and sideways collapse is retired', () => {
      const handleToggleCollapseUp = vi.fn();

      render(
        <BoardViewContainer
          {...({
            items: sampleItems,
            projectSettings: sampleSettings,
            projectSlug: 'sunshade-tracker',
            tenantSlug: 'sunshade',
            isReadOnly: false,
            loading: false,
            setEditingItem: () => {},
            setDeleteConfirmItem: () => {},
            handleUpdateStatus: () => {},
            handleUpdateType: () => {},
            handleDragStart: () => {},
            handleDragEnd: () => {},
            handleDragOverCard: () => {},
            handleDrop: () => {},
            childCountMap: new Map(),
            pointsRollupMap: new Map(),
            allProjects: [],
            isAllProjects: false,
            pointMode: 'granular',
            handlePointModeChange: () => {},
            getItemHierarchy: () => sampleSettings.hierarchy,
            getItemStatuses: () => sampleSettings.statuses,
            displayedStatuses: sampleSettings.statuses,
            columnsItemsMap: { backlog: sampleItems, in_progress: [] },
            collapsedColumnsUp: new Set(),
            collapsedColumnsSideways: new Set(),
            statusFilterOptions: [],
            effectiveSelectedStatuses: [],
            setSelectedStatuses: () => {},
            levelFilterOptions: [],
            effectiveSelectedLevels: [],
            setSelectedLevels: () => {},
            selectedSprint: 'all',
            setSelectedSprint: () => {},
            availableSprints: [],
            collapseAllColumns: () => {},
            expandAllColumns: () => {},
            toggleCollapseUp: handleToggleCollapseUp,
            toggleCollapseSideways: () => {},
            boardHeightMode: 'standard',
            setBoardHeightMode: () => {},
            boardScrollRef: { current: null },
            handleBoardWheel: () => {},
            columnCounts: { backlog: 1, in_progress: 0 },
            draggedItemId: null,
            dragOverTarget: null,
            quickAddColId: null,
            setQuickAddColId: () => {},
            quickAddTitle: '',
            setQuickAddTitle: () => {},
            isCreatingQuickItem: false,
            handleCreateQuickInlineItem: () => {},
            hiddenBoardItems: [],
            dismissedBoardDeviationBanner: false,
            setDismissedBoardDeviationBanner: () => {},
            onOpenReconciliation: () => {},
            boardOrientation: 'stack',
          } as any)}
        />
      );

      // Sideways collapse is retired in stack mode
      expect(screen.queryByTestId('column-collapse-sideways-btn-backlog')).not.toBeInTheDocument();

      // Vertical collapse chevron is active without md:hidden
      const verticalBtn = screen.getByTestId('column-collapse-up-btn-backlog');
      expect(verticalBtn).toBeInTheDocument();
      expect(verticalBtn.className).not.toContain('md:hidden');

      // Clicking triggers toggleCollapseUp
      fireEvent.click(verticalBtn);
      expect(handleToggleCollapseUp).toHaveBeenCalledWith('backlog');
    });
  });
});
