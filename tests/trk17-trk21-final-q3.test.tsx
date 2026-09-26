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
import { useModalScrollLock, _resetModalScrollLockForTesting } from '@/hooks/useModalScrollLock';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
import { WorkItem, ProjectSettings } from '@/types/tracker';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

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

  beforeEach(() => {
    _resetModalScrollLockForTesting();
    document.body.style.overflow = '';
    document.documentElement.style.overflow = '';
  });

  afterEach(() => {
    _resetModalScrollLockForTesting();
  });

  it('locks both body and html scroll when modal opens and restores on unmount', () => {
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';

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
    expect(document.documentElement.style.overflow).toBe('hidden');

    unmount();
    expect(document.body.style.overflow).toBe('auto');
    expect(document.documentElement.style.overflow).toBe('auto');
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

  it('useModalScrollLock manages ref counting across stacked modals', () => {
    const { unmount: unmount1 } = renderHook(() => useModalScrollLock(true));
    expect(document.body.style.overflow).toBe('hidden');
    expect(document.documentElement.style.overflow).toBe('hidden');

    const { unmount: unmount2 } = renderHook(() => useModalScrollLock(true));
    expect(document.body.style.overflow).toBe('hidden');

    // Unmount modal 1: modal 2 is still open, so overflow remains hidden
    unmount1();
    expect(document.body.style.overflow).toBe('hidden');

    // Unmount modal 2: all modals closed, overflow restored
    unmount2();
    expect(document.body.style.overflow).toBe('');
  });

  it('cancels wheel and touchmove events when cursor is outside modal content card', () => {
    const TestModalComponent = () => {
      useModalScrollLock(true);
      return (
        <div>
          <div data-testid="test-backdrop" className="fixed inset-0">
            <div data-modal-content="true" data-testid="test-modal-card">
              <p>Inside modal content</p>
            </div>
          </div>
          <div data-testid="test-body-content">Outside page content</div>
        </div>
      );
    };

    render(<TestModalComponent />);

    // 1. Wheel on outside page content
    const outsideEl = screen.getByTestId('test-body-content');
    const wheelOutside = new WheelEvent('wheel', { bubbles: true, cancelable: true });
    const preventOutsideSpy = vi.spyOn(wheelOutside, 'preventDefault');
    outsideEl.dispatchEvent(wheelOutside);
    expect(preventOutsideSpy).toHaveBeenCalled();

    // 2. Wheel on modal backdrop (outside the card)
    const backdropEl = screen.getByTestId('test-backdrop');
    const wheelBackdrop = new WheelEvent('wheel', { bubbles: true, cancelable: true });
    const preventBackdropSpy = vi.spyOn(wheelBackdrop, 'preventDefault');
    backdropEl.dispatchEvent(wheelBackdrop);
    expect(preventBackdropSpy).toHaveBeenCalled();

    // 3. TouchMove on backdrop (outside the card)
    const touchBackdrop = new TouchEvent('touchmove', { bubbles: true, cancelable: true });
    const preventTouchSpy = vi.spyOn(touchBackdrop, 'preventDefault');
    backdropEl.dispatchEvent(touchBackdrop);
    expect(preventTouchSpy).toHaveBeenCalled();

    // 4. Wheel inside modal content card must NOT be prevented
    const cardEl = screen.getByTestId('test-modal-card');
    const wheelInside = new WheelEvent('wheel', { bubbles: true, cancelable: true });
    const preventInsideSpy = vi.spyOn(wheelInside, 'preventDefault');
    cardEl.dispatchEvent(wheelInside);
    expect(preventInsideSpy).not.toHaveBeenCalled();
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

  it('PR-62 / TRK-21: useTabSync queries bulk endpoint with refs for external references when absent from local items', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 1, items: [sampleItem] }),
    } as any);

    const setEditingItem = vi.fn();
    renderHook(() =>
      useTabSync({
        items: [], // Item absent from local state
        setItems: vi.fn(),
        editingItem: null,
        setEditingItem,
        fetchData: vi.fn(),
        tenantSlug: 'test-tenant',
        initialSearchParamItem: 'TRK-21-DEMO',
      })
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/v1/items/bulk?refs=TRK-21-DEMO',
      expect.objectContaining({
        headers: { 'x-tenant-slug': 'test-tenant' },
      })
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(setEditingItem).toHaveBeenCalledWith(sampleItem);
    fetchSpy.mockRestore();
  });

  it('PR-62 / TRK-21: useTabSync queries bulk endpoint with ids for UUID links when absent from local items', async () => {
    const sampleUuid = 'c23ad280-01c8-492f-b4d7-c23ad280e6ab';
    const uuidItem = { ...sampleItem, id: sampleUuid };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ count: 1, items: [uuidItem] }),
    } as any);

    const setEditingItem = vi.fn();
    renderHook(() =>
      useTabSync({
        items: [],
        setItems: vi.fn(),
        editingItem: null,
        setEditingItem,
        fetchData: vi.fn(),
        initialSearchParamItem: sampleUuid,
      })
    );

    expect(fetchSpy).toHaveBeenCalledWith(
      `/api/v1/items/bulk?ids=${sampleUuid}`,
      expect.any(Object)
    );

    await new Promise((r) => setTimeout(r, 10));
    expect(setEditingItem).toHaveBeenCalledWith(uuidItem);
    fetchSpy.mockRestore();
  });

  it('renders ProjectSwitcher with semantic Link elements that allow Ctrl+click without closing', () => {
    const testProjects = [
      { id: 'p1', name: 'Alpha Project', slug: 'alpha', settings: {} as any },
      { id: 'p2', name: 'Beta Project', slug: 'beta', settings: {} as any },
    ];

    render(
      <ProjectSwitcher
        tenantSlug="test-org"
        currentProjectSlug="alpha"
        projects={testProjects}
        isReadOnly={false}
      />
    );

    // Open dropdown
    const trigger = screen.getByTestId('project-switcher-trigger');
    fireEvent.click(trigger);

    // Dropdown items should be rendered
    const alphaLink = screen.getByTestId('project-switcher-item-alpha');
    const betaLink = screen.getByTestId('project-switcher-item-beta');
    const allLink = screen.getByTestId('project-switcher-item-all');

    expect(alphaLink.getAttribute('href')).toBe('/test-org/alpha');
    expect(betaLink.getAttribute('href')).toBe('/test-org/beta');
    expect(allLink.getAttribute('href')).toBe('/test-org/all');

    const preventNav = (e: MouseEvent) => e.preventDefault();
    window.addEventListener('click', preventNav, { capture: true });

    // Ctrl+click on Beta link: should NOT close dropdown
    fireEvent.click(betaLink, { ctrlKey: true });
    expect(screen.getByTestId('project-switcher-dropdown')).toBeDefined();

    // Normal left click: closes dropdown
    fireEvent.click(betaLink);
    expect(screen.queryByTestId('project-switcher-dropdown')).toBeNull();

    window.removeEventListener('click', preventNav, { capture: true });
  });
});
