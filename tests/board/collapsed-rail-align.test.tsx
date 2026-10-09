import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { BoardViewContainer } from '@/components/views/BoardViewContainer';
import { WorkItem, ProjectSettings } from '@/types/tracker';

describe('TASK-TRK-COLLAPSED-RAIL-ALIGN: Collapsed column status dot and count pill alignment', () => {
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
    {
      id: 'task-2',
      tenant_id: 'tenant-1',
      project_id: 'proj-1',
      title: 'Item 2',
      item_type: 'task',
      status: 'backlog',
      order_index: 2000,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {},
    },
  ];

  it('groups status dot and item count pill together at the top of the rail above the vertical text label', () => {
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
          collapsedColumnsSideways: new Set(['backlog']),
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
          columnCounts: { backlog: 2, in_progress: 0 },
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
        } as any)}
      />
    );

    const rail = screen.getByTestId('collapsed-rail-backlog');
    expect(rail).toBeInTheDocument();

    const header = screen.getByTestId('collapsed-rail-header-backlog');
    expect(header).toBeInTheDocument();
    expect(header).toHaveTextContent('2');

    // Verify header is the first child in rail
    expect(rail.firstChild).toBe(header);
    // Vertical label follows header
    expect(rail.textContent).toContain('Backlog');
  });
});
