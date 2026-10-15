import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import { useProjectItems, reconcileDelta, mergeColdArchive } from '@/hooks/useProjectItems';
import { BoardViewContainer } from '@/components/views/BoardViewContainer';
import { WorkItem, ProjectSettings } from '@/types/tracker';

describe('Delta Synchronization & Cold Archive Partitioning Suite', () => {
  const sampleSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [
      { type: 'story', label: 'Story', level: 1, allowed_parents: [] },
      { type: 'task', label: 'Task', level: 2, allowed_parents: ['story'] },
    ],
    statuses: [
      { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
      { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      { id: 'complete', label: 'Complete', color: '#22c55e', order: 3 },
    ],
    custom_fields: [],
  };

  const activeItem: WorkItem = {
    id: 'task-active',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    parent_id: null,
    external_ref_id: 'TRK-01',
    item_type: 'task',
    status: 'in_progress',
    title: 'Active In-Progress Task',
    order_index: 1000,
    metadata: {},
    created_at: '2026-10-01T00:00:00.000Z',
    updated_at: '2026-10-01T00:00:00.000Z',
  };

  const completedRecentItem: WorkItem = {
    id: 'task-recent-done',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    parent_id: null,
    external_ref_id: 'TRK-02',
    item_type: 'task',
    status: 'complete',
    title: 'Recently Completed Task',
    order_index: 2000,
    metadata: {},
    created_at: '2026-10-10T00:00:00.000Z',
    updated_at: '2026-10-10T00:00:00.000Z',
  };

  const coldArchivedItem: WorkItem = {
    id: 'task-cold-done',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    parent_id: null,
    external_ref_id: 'TRK-03',
    item_type: 'task',
    status: 'complete',
    title: 'Cold Completed Task (Old)',
    order_index: 3000,
    metadata: {},
    created_at: '2026-08-01T00:00:00.000Z',
    updated_at: '2026-08-01T00:00:00.000Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Pure Reconciliation Functions', () => {
    it('reconcileDelta cleanly mutates existing items, adds new items, and evicts tombstones', () => {
      const current = [
        activeItem,
        completedRecentItem,
        { ...activeItem, id: 'task-to-delete', title: 'Will be deleted' },
      ];

      const deltaItems: WorkItem[] = [
        { ...activeItem, status: 'complete', title: 'Active Task Now Complete' },
        {
          id: 'task-new',
          tenant_id: 'tenant-1',
          project_id: 'proj-1',
          parent_id: null,
          external_ref_id: 'TRK-99',
          item_type: 'task',
          status: 'not_started',
          title: 'Brand New Task',
          order_index: 4000,
          metadata: {},
          created_at: '2026-10-15T00:00:00.000Z',
          updated_at: '2026-10-15T00:00:00.000Z',
        },
      ];

      const deletedIds = ['task-to-delete'];

      const result = reconcileDelta(current, deltaItems, deletedIds);

      expect(result).toHaveLength(3);
      // Evicted task-to-delete
      expect(result.find((i) => i.id === 'task-to-delete')).toBeUndefined();
      // Updated task-active
      const updated = result.find((i) => i.id === 'task-active');
      expect(updated?.status).toBe('complete');
      expect(updated?.title).toBe('Active Task Now Complete');
      // Preserved unmutated item
      expect(result.find((i) => i.id === 'task-recent-done')).toBeDefined();
      // Appended new item
      expect(result.find((i) => i.id === 'task-new')).toBeDefined();
    });

    it('mergeColdArchive appends new records without duplicating existing records', () => {
      const current = [activeItem, completedRecentItem];
      const cold = [completedRecentItem, coldArchivedItem];

      const result = mergeColdArchive(current, cold);
      expect(result).toHaveLength(3);
      expect(result.map((i) => i.id)).toEqual(['task-active', 'task-recent-done', 'task-cold-done']);
    });

    it('mergeColdArchive updates existing items with newer data from cold items', () => {
      const current = [
        { ...activeItem, title: 'Old Title' },
        completedRecentItem,
      ];
      const cold = [
        { ...activeItem, title: 'Updated Newer Title' },
        coldArchivedItem,
      ];

      const result = mergeColdArchive(current, cold);
      expect(result).toHaveLength(3);
      expect(result.find((i) => i.id === 'task-active')?.title).toBe('Updated Newer Title');
      expect(result.find((i) => i.id === 'task-cold-done')).toBeDefined();
    });
  });

  describe('useProjectItems Hook', () => {
    beforeEach(() => {
      vi.useFakeTimers({ shouldAdvanceTime: true });
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('initializes lastSyncedAt from server latest_at and tracks coldCount', async () => {
      const serverLatestAt = '2026-10-15T02:30:00.000Z';
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: [activeItem, completedRecentItem],
          latest_at: serverLatestAt,
          cold_count: 5,
          is_delta: false,
        }),
      });
      global.fetch = mockFetch;

      const { result } = renderHook(() =>
        useProjectItems({
          projectId: 'proj-1',
          tenantSlug: 'sunshade',
          autoPoll: false,
        })
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/v1/items?tenant_slug=sunshade&project_id=proj-1',
        { credentials: 'include', headers: { 'x-tenant-slug': 'sunshade' } }
      );
      expect(result.current.items).toHaveLength(2);
      expect(result.current.coldCount).toBe(5);
      expect(result.current.lastSyncedAt).toBe(serverLatestAt);
    });

    it('loads cold archive when loadColdArchive is invoked', async () => {
      const serverLatestAt = '2026-10-15T02:30:00.000Z';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [activeItem],
            latest_at: serverLatestAt,
            cold_count: 1,
            is_delta: false,
          }),
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [activeItem, coldArchivedItem],
            latest_at: serverLatestAt,
            cold_count: 0,
            is_delta: false,
          }),
        });
      global.fetch = mockFetch;

      const { result } = renderHook(() =>
        useProjectItems({
          projectId: 'proj-1',
          tenantSlug: 'sunshade',
          autoPoll: false,
        })
      );

      await act(async () => {
        await vi.runAllTimersAsync();
      });
      expect(result.current.coldCount).toBe(1);

      await act(async () => {
        await result.current.loadColdArchive();
      });

      expect(mockFetch).toHaveBeenLastCalledWith(
        '/api/v1/items?tenant_slug=sunshade&project_id=proj-1&include_cold_archive=true',
        { credentials: 'include', headers: { 'x-tenant-slug': 'sunshade' } }
      );
      expect(result.current.items).toHaveLength(2);
      expect(result.current.coldCount).toBe(0);
    });

    it('performs delta sync every 2 minutes with If-Modified-Since and handles 304 without state mutations', async () => {
      const serverLatestAt = '2026-10-15T02:30:00.000Z';
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [activeItem],
            latest_at: serverLatestAt,
            cold_count: 0,
            is_delta: false,
          }),
        })
        .mockResolvedValueOnce({
          status: 304,
          ok: false,
        });
      global.fetch = mockFetch;

      const { result } = renderHook(() =>
        useProjectItems({
          projectId: 'proj-1',
          tenantSlug: 'sunshade',
          autoPoll: true,
          pollIntervalMs: 120000,
        })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.items).toHaveLength(1);

      // Advance by 120,000ms (2 minutes)
      await act(async () => {
        await vi.advanceTimersByTimeAsync(120000);
      });

      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`updated_since=${encodeURIComponent(serverLatestAt)}`),
        expect.objectContaining({
          headers: {
            'If-Modified-Since': serverLatestAt,
            'x-tenant-slug': 'sunshade',
          },
        })
      );
      // State remains identical
      expect(result.current.items).toHaveLength(1);
    });

    it('reconciles delta mutations and evicts deleted items on 200 is_delta response', async () => {
      const initialAt = '2026-10-15T02:00:00.000Z';
      const nextAt = '2026-10-15T02:05:00.000Z';

      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            items: [activeItem, completedRecentItem],
            latest_at: initialAt,
            cold_count: 0,
            is_delta: false,
          }),
        })
        .mockResolvedValueOnce({
          status: 200,
          ok: true,
          json: async () => ({
            items: [{ ...activeItem, title: 'Mutated in Background' }],
            deleted_ids: ['task-recent-done'],
            latest_at: nextAt,
            is_delta: true,
          }),
        });
      global.fetch = mockFetch;

      const { result } = renderHook(() =>
        useProjectItems({
          projectId: 'proj-1',
          tenantSlug: 'sunshade',
          autoPoll: true,
          pollIntervalMs: 120000,
        })
      );

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(result.current.items).toHaveLength(2);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(120000);
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].id).toBe('task-active');
      expect(result.current.items[0].title).toBe('Mutated in Background');
      expect(result.current.lastSyncedAt).toBe(nextAt);
    });
  });

  describe('BoardViewContainer Cold Archive Banner UI', () => {
    it('renders "Showing recent (last 14d) — Load older completed tasks (N items)" when coldCount > 0 and triggers onLoadColdArchive', () => {
      const handleLoadCold = vi.fn();

      render(
        <BoardViewContainer
          hiddenBoardItems={[]}
          dismissedBoardDeviationBanner={true}
          setDismissedBoardDeviationBanner={vi.fn()}
          onOpenReconciliation={vi.fn()}
          isReadOnly={false}
          loading={false}
          tenantSlug="sunshade"
          projectSlug="portfolio"
          statusFilterOptions={[]}
          effectiveSelectedStatuses={['not_started', 'in_progress', 'complete']}
          setSelectedStatuses={vi.fn()}
          levelFilterOptions={[]}
          effectiveSelectedLevels={['task']}
          setSelectedLevels={vi.fn()}
          selectedSprint="all"
          setSelectedSprint={vi.fn()}
          availableSprints={[]}
          items={[activeItem, completedRecentItem]}
          projectSettings={sampleSettings}
          pointMode="granular"
          handlePointModeChange={vi.fn()}
          boardHeightMode="standard"
          setBoardHeightMode={vi.fn()}
          collapsedColumnsUp={new Set()}
          toggleCollapseUp={vi.fn()}
          collapsedColumnsSideways={new Set()}
          toggleCollapseSideways={vi.fn()}
          collapseAllColumns={vi.fn()}
          expandAllColumns={vi.fn()}
          boardScrollRef={{ current: null }}
          handleBoardWheel={vi.fn()}
          displayedStatuses={sampleSettings.statuses}
          columnCounts={{ not_started: 0, in_progress: 1, complete: 1 }}
          columnsItemsMap={{
            not_started: [],
            in_progress: [activeItem],
            complete: [completedRecentItem],
          }}
          quickAddColId={null}
          setQuickAddColId={vi.fn()}
          quickAddTitle=""
          setQuickAddTitle={vi.fn()}
          isCreatingQuickItem={false}
          handleCreateQuickInlineItem={vi.fn()}
          draggedItemId={null}
          dragOverTarget={null}
          childCountMap={new Map()}
          pointsRollupMap={new Map()}
          getItemHierarchy={() => []}
          allProjects={[]}
          isAllProjects={false}
          setEditingItem={vi.fn()}
          setDeleteConfirmItem={vi.fn()}
          handleUpdateStatus={vi.fn()}
          handleUpdateType={vi.fn()}
          getItemStatuses={() => sampleSettings.statuses}
          handleDragStart={vi.fn()}
          handleDragEnd={vi.fn()}
          handleDragOverCard={vi.fn()}
          handleDrop={vi.fn()}
          handleDropOnColEnd={vi.fn()}
          unmappedItems={[]}
          draggedItem={null}
          coldCount={12}
          isLoadingColdArchive={false}
          onLoadColdArchive={handleLoadCold}
        />
      );

      const banner = screen.getByTestId('cold-archive-banner');
      expect(banner).toBeDefined();
      expect(banner.textContent).toContain('Showing recent (last 14d)');

      const button = screen.getByTestId('load-older-completed-btn');
      expect(button.textContent).toContain('Load older completed tasks (12 items)');

      fireEvent.click(button);
      expect(handleLoadCold).toHaveBeenCalledTimes(1);
    });

    it('does not render cold archive banner when coldCount is 0', () => {
      render(
        <BoardViewContainer
          hiddenBoardItems={[]}
          dismissedBoardDeviationBanner={true}
          setDismissedBoardDeviationBanner={vi.fn()}
          onOpenReconciliation={vi.fn()}
          isReadOnly={false}
          loading={false}
          tenantSlug="sunshade"
          projectSlug="portfolio"
          statusFilterOptions={[]}
          effectiveSelectedStatuses={['not_started', 'in_progress', 'complete']}
          setSelectedStatuses={vi.fn()}
          levelFilterOptions={[]}
          effectiveSelectedLevels={['task']}
          setSelectedLevels={vi.fn()}
          selectedSprint="all"
          setSelectedSprint={vi.fn()}
          availableSprints={[]}
          items={[activeItem, completedRecentItem]}
          projectSettings={sampleSettings}
          pointMode="granular"
          handlePointModeChange={vi.fn()}
          boardHeightMode="standard"
          setBoardHeightMode={vi.fn()}
          collapsedColumnsUp={new Set()}
          toggleCollapseUp={vi.fn()}
          collapsedColumnsSideways={new Set()}
          toggleCollapseSideways={vi.fn()}
          collapseAllColumns={vi.fn()}
          expandAllColumns={vi.fn()}
          boardScrollRef={{ current: null }}
          handleBoardWheel={vi.fn()}
          displayedStatuses={sampleSettings.statuses}
          columnCounts={{ not_started: 0, in_progress: 1, complete: 1 }}
          columnsItemsMap={{
            not_started: [],
            in_progress: [activeItem],
            complete: [completedRecentItem],
          }}
          quickAddColId={null}
          setQuickAddColId={vi.fn()}
          quickAddTitle=""
          setQuickAddTitle={vi.fn()}
          isCreatingQuickItem={false}
          handleCreateQuickInlineItem={vi.fn()}
          draggedItemId={null}
          dragOverTarget={null}
          childCountMap={new Map()}
          pointsRollupMap={new Map()}
          getItemHierarchy={() => []}
          allProjects={[]}
          isAllProjects={false}
          setEditingItem={vi.fn()}
          setDeleteConfirmItem={vi.fn()}
          handleUpdateStatus={vi.fn()}
          handleUpdateType={vi.fn()}
          getItemStatuses={() => sampleSettings.statuses}
          handleDragStart={vi.fn()}
          handleDragEnd={vi.fn()}
          handleDragOverCard={vi.fn()}
          handleDrop={vi.fn()}
          handleDropOnColEnd={vi.fn()}
          unmappedItems={[]}
          draggedItem={null}
          coldCount={0}
        />
      );

      expect(screen.queryByTestId('cold-archive-banner')).toBeNull();
    });
  });
});
