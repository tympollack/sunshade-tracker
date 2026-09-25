import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { WorkItemModal } from '@/components/WorkItemModal';
import { QuickAddModal } from '@/components/QuickAddModal';
import { KanbanCard } from '@/components/board/KanbanCard';
import { BoardViewContainer } from '@/components/views/BoardViewContainer';
import { normalizeAssignee, formatAssigneeDisplay } from '@/lib/assignee-utils';
import { useTabSync } from '@/hooks/useTabSync';
import { broadcastItemMutation, subscribeToItemSync } from '@/lib/sync-channel';
import { WorkItem, ProjectSettings } from '@/types/tracker';

describe('TRK-17: Target project selection & validation in All Projects view', () => {
  const settingsA: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [{ type: 'task', label: 'Task A', level: 1, allowed_parents: [] }],
    statuses: [
      { id: 'todo_a', label: 'To Do A', color: '#94a3b8', order: 1 },
      { id: 'done_a', label: 'Done A', color: '#22c55e', order: 2 },
    ],
    sprint_settings: {
      sprints: [{ id: 'sp-a1', name: 'Sprint Alpha', status: 'active' }],
    },
    custom_fields: [],
  };

  const settingsB: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [{ type: 'story', label: 'Story B', level: 1, allowed_parents: [] }],
    statuses: [
      { id: 'todo_b', label: 'To Do B', color: '#94a3b8', order: 1 },
      { id: 'done_b', label: 'Done B', color: '#22c55e', order: 2 },
    ],
    sprint_settings: {
      sprints: [{ id: 'sp-b1', name: 'Sprint Beta', status: 'active' }],
    },
    custom_fields: [],
  };

  const sampleProjects = [
    { id: 'proj-1', slug: 'project-alpha', name: 'Project Alpha', settings: settingsA },
    { id: 'proj-2', slug: 'project-beta', name: 'Project Beta', settings: settingsB },
  ];

  const sampleItem: WorkItem = {
    id: 'item-1',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    title: 'Multi-Project Task',
    item_type: 'task',
    status: 'todo_a',
    order_index: 1000,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('renders target project selector in WorkItemModal and populates statuses and sprints dynamically', async () => {
    const handleSave = vi.fn();
    render(
      <WorkItemModal
        item={sampleItem}
        isOpen={true}
        onClose={() => {}}
        onSave={handleSave}
        onDelete={() => {}}
        projectSettings={settingsA}
        allItems={[sampleItem]}
        isAllProjects={true}
        projects={sampleProjects}
      />
    );

    const projectSelect = screen.getByTestId('item-project-select') as HTMLSelectElement;
    expect(projectSelect).toBeDefined();
    expect(projectSelect.value).toBe('proj-1');

    // Switch project to Project Beta
    fireEvent.change(projectSelect, { target: { value: 'proj-2' } });
    expect(projectSelect.value).toBe('proj-2');

    // Sprints dropdown should now show Sprint Beta from settingsB
    const sprintSelect = screen.getByTestId('item-sprint-select') as HTMLSelectElement;
    expect(sprintSelect).toBeDefined();
    const betaOption = screen.getByText('Sprint Beta (active)');
    expect(betaOption).toBeDefined();
  });

  it('QuickAddModal requires target project selection when opened in isAllProjects mode without a preselected project', async () => {
    const handleSubmit = vi.fn();
    render(
      <QuickAddModal
        isOpen={true}
        onClose={() => {}}
        onSubmit={handleSubmit}
        currentProjectSlug=""
        isAllProjects={true}
        allProjects={sampleProjects}
        hierarchy={settingsA.hierarchy}
        statuses={settingsA.statuses}
      />
    );

    const titleInput = screen.getByTestId('quick-add-title-input');
    fireEvent.change(titleInput, { target: { value: 'New Test Item' } });

    // Try submitting without selecting a project
    const submitBtn = screen.getByRole('button', { name: /Add Item/i });
    fireEvent.click(submitBtn);

    expect(handleSubmit).not.toHaveBeenCalled();
    expect(screen.getByText('Please select a target project.')).toBeDefined();

    // Select Project Alpha
    const projectSelect = screen.getByTestId('quick-add-project-select');
    fireEvent.change(projectSelect, { target: { value: 'project-alpha' } });

    // Submit now succeeds
    fireEvent.click(submitBtn);
    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        project_slug: 'project-alpha',
        title: 'New Test Item',
      })
    );
  });
});

describe('TRK-18: Body scroll locking and backdrop wheel isolation', () => {
  const sampleSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [{ type: 'task', label: 'Task', level: 1, allowed_parents: [] }],
    statuses: [{ id: 'backlog', label: 'Backlog', color: '#94a3b8', order: 1 }],
    custom_fields: [],
  };

  const sampleItem: WorkItem = {
    id: 'item-lock-1',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    title: 'Scroll Lock Test Item',
    item_type: 'task',
    status: 'backlog',
    order_index: 1000,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('locks body scroll when modal opens and restores on unmount', () => {
    document.body.style.overflow = 'auto';

    const { unmount } = render(
      <WorkItemModal
        item={sampleItem}
        isOpen={true}
        onClose={() => {}}
        onSave={() => {}}
        onDelete={() => {}}
        projectSettings={sampleSettings}
        allItems={[sampleItem]}
      />
    );

    expect(document.body.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('auto');
  });

  it('isolates mouse wheel events on backdrop overlay', () => {
    render(
      <WorkItemModal
        item={sampleItem}
        isOpen={true}
        onClose={() => {}}
        onSave={() => {}}
        onDelete={() => {}}
        projectSettings={sampleSettings}
        allItems={[sampleItem]}
      />
    );

    const backdrop = screen.getByTestId('work-item-modal-backdrop');
    const wheelEvent = new WheelEvent('wheel', { bubbles: true, cancelable: true });
    const preventDefaultSpy = vi.spyOn(wheelEvent, 'preventDefault');
    const stopPropagationSpy = vi.spyOn(wheelEvent, 'stopPropagation');

    backdrop.dispatchEvent(wheelEvent);

    expect(preventDefaultSpy).toHaveBeenCalled();
    expect(stopPropagationSpy).toHaveBeenCalled();
  });
});

describe('TRK-19: Assignee canonical normalization and (You) display formatting', () => {
  it('normalizes various assignee strings to canonical form', () => {
    expect(normalizeAssignee('Me (Tymz)')).toBe('Tymz');
    expect(normalizeAssignee('Tymz (You)')).toBe('Tymz');
    expect(normalizeAssignee('Tymz (Me)')).toBe('Tymz');
    expect(normalizeAssignee('Tymz')).toBe('Tymz');
    expect(normalizeAssignee('__unassigned__')).toBeNull();
    expect(normalizeAssignee('')).toBeNull();
    expect(normalizeAssignee(null)).toBeNull();
    expect(normalizeAssignee(undefined)).toBeNull();
  });

  it('formats display with (You) only for current user handle', () => {
    expect(formatAssigneeDisplay('Tymz', 'Tymz')).toBe('Tymz (You)');
    expect(formatAssigneeDisplay('Me (Tymz)', 'Tymz')).toBe('Tymz (You)');
    expect(formatAssigneeDisplay('Alice', 'Tymz')).toBe('Alice');
    expect(formatAssigneeDisplay('', 'Tymz')).toBe('Unassigned');
    expect(formatAssigneeDisplay(null, 'Tymz')).toBe('Unassigned');
  });

  it('uses canonical handles in WorkItemModal assignee options and avoids duplicate keys', () => {
    const sampleSettings: ProjectSettings = {
      schema_version: '1.0',
      hierarchy: [{ type: 'task', label: 'Task', level: 1, allowed_parents: [] }],
      statuses: [{ id: 'backlog', label: 'Backlog', color: '#94a3b8', order: 1 }],
      custom_fields: [],
    };

    const itemWithAssignee: WorkItem = {
      id: 'item-assignee-1',
      tenant_id: 'tenant-1',
      project_id: 'proj-1',
      title: 'Assignee Test',
      item_type: 'task',
      status: 'backlog',
      assignee: 'Tymz',
      order_index: 1000,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    render(
      <WorkItemModal
        item={itemWithAssignee}
        isOpen={true}
        onClose={() => {}}
        onSave={() => {}}
        onDelete={() => {}}
        projectSettings={sampleSettings}
        allItems={[itemWithAssignee]}
        currentUser={{ full_name: 'Tymz', email: 'tymz@sunshade.icu' }}
        workspaceMembers={[{ full_name: 'Alice', email: 'alice@sunshade.icu' }]}
      />
    );

    const assigneeSelect = screen.getByTestId('item-assignee-select') as HTMLSelectElement;
    expect(assigneeSelect.value).toBe('Tymz');

    // The option value is canonical 'Tymz', but display is 'Tymz (You)'
    const youOption = screen.getByText('Tymz (You)') as HTMLOptionElement;
    expect(youOption.value).toBe('Tymz');
  });

  it('QuickAddModal selects canonical handle and submits normalized assignee', async () => {
    const handleSubmit = vi.fn();
    render(
      <QuickAddModal
        isOpen={true}
        onClose={() => {}}
        onSubmit={handleSubmit}
        currentProjectSlug="sunshade-tracker"
        hierarchy={[{ type: 'task', label: 'Task', level: 1, allowed_parents: [] }]}
        statuses={[{ id: 'backlog', label: 'Backlog', order: 1, color: '#94a3b8' }]}
        myDisplayName="Tymz (You)"
      />
    );

    const titleInput = screen.getByTestId('quick-add-title-input');
    fireEvent.change(titleInput, { target: { value: 'Task with Assignee' } });

    const submitBtn = screen.getByRole('button', { name: /Add Item/i });
    fireEvent.click(submitBtn);

    expect(handleSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Task with Assignee',
        assignee: 'Tymz',
      })
    );
  });
});

describe('TRK-21: Multi-tab viewing, semantic link anchors, and BroadcastChannel sync', () => {
  const sampleSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [{ type: 'task', label: 'Task', level: 1, allowed_parents: [] }],
    statuses: [{ id: 'backlog', label: 'Backlog', color: '#94a3b8', order: 1 }],
    custom_fields: [],
  };

  const sampleItem: WorkItem = {
    id: 'item-tab-1',
    external_ref_id: 'TRK-21-DEMO',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    title: 'Multi-Tab Card',
    item_type: 'task',
    status: 'backlog',
    order_index: 1000,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('renders card title with semantic link anchor pointing to ?item=[ref_id]', () => {
    const handleEdit = vi.fn();
    render(
      <KanbanCard
        item={sampleItem}
        itemHierarchy={sampleSettings.hierarchy}
        onEditItem={handleEdit}
      />
    );

    const link = screen.getByTestId(`kanban-card-link-${sampleItem.id}`);
    expect(link.getAttribute('href')).toBe('?item=TRK-21-DEMO');
    expect(link.textContent).toBe('Multi-Tab Card');

    // Normal click opens edit modal
    fireEvent.click(link);
    expect(handleEdit).toHaveBeenCalledWith(sampleItem);
  });

  it('allows middle/ctrl clicks for native new tab navigation', () => {
    const handleEdit = vi.fn();
    render(
      <KanbanCard
        item={sampleItem}
        itemHierarchy={sampleSettings.hierarchy}
        onEditItem={handleEdit}
      />
    );

    const link = screen.getByTestId(`kanban-card-link-${sampleItem.id}`);
    // Ctrl+click shouldn't trigger local onEditItem
    fireEvent.click(link, { ctrlKey: true });
    expect(handleEdit).not.toHaveBeenCalled();
  });

  it('BoardViewContainer wraps cards in semantic link anchors pointing to ?item=[ref_id]', () => {
    render(
      <BoardViewContainer
        {...({
          items: [sampleItem],
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
          columnsItemsMap: { backlog: [sampleItem] },
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
          columnCounts: { backlog: 1 },
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

    const cardAnchor = screen.getByTestId(`kanban-card-link-${sampleItem.id}`);
    expect(cardAnchor.getAttribute('href')).toBe('?item=TRK-21-DEMO');
  });

  it('useTabSync hook synchronizes URL with editingItem and syncs mutations across tabs via BroadcastChannel', async () => {
    let currentItems: WorkItem[] = [sampleItem];
    const setItems = vi.fn((updater) => {
      if (typeof updater === 'function') {
        currentItems = updater(currentItems);
      } else {
        currentItems = updater;
      }
    });

    let currentEditingItem: WorkItem | null = null;
    const setEditingItem = vi.fn((val) => {
      currentEditingItem = val;
    });

    const fetchData = vi.fn();

    const { rerender } = renderHook(
      ({ editingItem }) =>
        useTabSync({
          items: currentItems,
          setItems,
          editingItem,
          setEditingItem,
          fetchData,
          initialSearchParamItem: 'TRK-21-DEMO',
        }),
      { initialProps: { editingItem: null as WorkItem | null } }
    );

    // Initial hydration should match sampleItem
    expect(setEditingItem).toHaveBeenCalledWith(sampleItem);

    // URL sync when editing item is open
    rerender({ editingItem: sampleItem });
    expect(window.location.search).toContain('item=TRK-21-DEMO');

    // Simulate cross-tab mutation broadcast
    act(() => {
      broadcastItemMutation({
        type: 'ITEM_UPDATED',
        itemId: sampleItem.id,
        updates: { title: 'Updated from Tab B' },
      });
    });

    await new Promise((r) => setTimeout(r, 60));

    expect(setItems).toHaveBeenCalled();
  });
});
