import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import {
  getProjectCache,
  setProjectCache,
  clearProjectCache,
  updateProjectCacheItems,
  syncOptimisticMutationToCache,
  syncOptimisticCreationToCache,
  preloadPortfolioItems,
  resetPortfolioPreloadState,
  prefetchProjectData,
  DEFAULT_PROJECT_SETTINGS,
} from '@/context/ProjectDataContext';
import { useProjectItems } from '@/hooks/useProjectItems';
import { WorkItem } from '@/types/tracker';

const mockCard1: WorkItem = {
  id: 'item-1',
  tenant_id: 'tenant-1',
  project_id: 'proj-1',
  title: 'Implement Cache Layer',
  item_type: 'task',
  status: 'in_progress',
  order_index: 100,
  metadata: { priority: 'P1' },
  created_at: '2026-11-15T10:00:00Z',
  updated_at: '2026-11-15T12:00:00Z',
};

const mockCard2: WorkItem = {
  id: 'item-2',
  tenant_id: 'tenant-1',
  project_id: 'proj-1',
  title: 'Add Hover Prefetching',
  item_type: 'task',
  status: 'planned',
  order_index: 200,
  metadata: { priority: 'P2' },
  created_at: '2026-11-15T10:00:00Z',
  updated_at: '2026-11-15T12:00:00Z',
};

describe('TASK-TRK-CLIENT-PROJECT-CACHE: Client Project Cache & Portfolio Preload', () => {
  beforeEach(() => {
    clearProjectCache();
    resetPortfolioPreloadState();
    sessionStorage.clear();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    clearProjectCache();
    resetPortfolioPreloadState();
    sessionStorage.clear();
  });

  describe('1. In-Memory & sessionStorage Project Cache', () => {
    it('stores and retrieves cache entries with in-memory hit and alias support', () => {
      setProjectCache('proj-1', {
        items: [mockCard1],
        settings: DEFAULT_PROJECT_SETTINGS,
        latestAt: '2026-11-15T12:00:00Z',
      }, 'alpha-slug');

      const byId = getProjectCache('proj-1');
      expect(byId).toBeDefined();
      expect(byId?.items).toHaveLength(1);
      expect(byId?.items[0].id).toBe('item-1');

      // Access by alias slug
      const bySlug = getProjectCache('alpha-slug');
      expect(bySlug).toBeDefined();
      expect(bySlug?.items[0].id).toBe('item-1');
    });

    it('restores from sessionStorage when in-memory cache is cold', () => {
      setProjectCache('proj-stored', {
        items: [mockCard2],
        settings: DEFAULT_PROJECT_SETTINGS,
        latestAt: '2026-11-15T12:30:00Z',
      });

      // Clear memory map directly by clearing, then manually putting into sessionStorage
      clearProjectCache();
      sessionStorage.setItem(
        'sunshade_project_cache_proj-stored',
        JSON.stringify({
          items: [mockCard2],
          settings: DEFAULT_PROJECT_SETTINGS,
          latestAt: '2026-11-15T12:30:00Z',
        })
      );

      const restored = getProjectCache('proj-stored');
      expect(restored).toBeDefined();
      expect(restored?.items).toHaveLength(1);
      expect(restored?.items[0].id).toBe('item-2');
    });

    it('handles sessionStorage QuotaExceededError and corrupted JSON safely', () => {
      // Corrupted JSON in sessionStorage should not crash
      sessionStorage.setItem('sunshade_project_cache_corrupt', '{bad json');
      expect(getProjectCache('corrupt')).toBeUndefined();

      // QuotaExceeded error simulation
      const originalSetItem = sessionStorage.setItem;
      let quotaThrown = false;
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (key, value) {
        if (!quotaThrown) {
          quotaThrown = true;
          const err = new Error('Quota exceeded');
          err.name = 'QuotaExceededError';
          throw err;
        }
        return originalSetItem.call(sessionStorage, key, value);
      });

      // Should succeed in-memory despite quota error during write
      setProjectCache('proj-quota', {
        items: [mockCard1],
        settings: DEFAULT_PROJECT_SETTINGS,
        latestAt: '2026-11-15T12:00:00Z',
      });

      const entry = getProjectCache('proj-quota');
      expect(entry).toBeDefined();
      expect(entry?.items[0].id).toBe('item-1');
    });
  });

  describe('2. Optimistic Mutation Sync', () => {
    it('synchronizes card field mutations across cached entries', () => {
      setProjectCache('proj-1', {
        items: [mockCard1, mockCard2],
        settings: DEFAULT_PROJECT_SETTINGS,
        latestAt: '2026-11-15T12:00:00Z',
      });

      syncOptimisticMutationToCache({
        id: 'item-1',
        status: 'complete',
        title: 'Updated Cache Layer',
      });

      const updated = getProjectCache('proj-1');
      const item1 = updated?.items.find((i) => i.id === 'item-1');
      expect(item1?.status).toBe('complete');
      expect(item1?.title).toBe('Updated Cache Layer');
    });

    it('synchronizes newly created cards into project cache', () => {
      setProjectCache('proj-1', {
        items: [mockCard1],
        settings: DEFAULT_PROJECT_SETTINGS,
        latestAt: '2026-11-15T12:00:00Z',
      });

      syncOptimisticCreationToCache(mockCard2, 'proj-1');

      const updated = getProjectCache('proj-1');
      expect(updated?.items).toHaveLength(2);
      expect(updated?.items.map((i) => i.id)).toContain('item-2');
    });

    it('updates items via functional updater', () => {
      setProjectCache('proj-1', {
        items: [mockCard1],
        settings: DEFAULT_PROJECT_SETTINGS,
        latestAt: '2026-11-15T12:00:00Z',
      });

      updateProjectCacheItems('proj-1', (items) => items.filter((i) => i.id !== 'item-1'));
      expect(getProjectCache('proj-1')?.items).toHaveLength(0);
    });
  });

  describe('3. Portfolio Preload on Workspace Mount', () => {
    it('fetches active cross-project items and partitions them into project caches', async () => {
      const crossProjectItems: WorkItem[] = [
        { ...mockCard1, project_id: 'proj-alpha', status: 'in_progress' },
        { ...mockCard2, project_id: 'proj-beta', status: 'planned' },
        { ...mockCard1, id: 'item-3', project_id: 'proj-gamma', status: 'complete' }, // Completed should be ignored
      ];

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          items: crossProjectItems,
          latest_at: '2026-11-15T13:00:00Z',
        }),
      } as any);

      await preloadPortfolioItems('test-tenant');

      const alphaCache = getProjectCache('proj-alpha', 'test-tenant');
      const betaCache = getProjectCache('proj-beta', 'test-tenant');
      const gammaCache = getProjectCache('proj-gamma', 'test-tenant');

      expect(alphaCache).toBeDefined();
      expect(alphaCache?.items).toHaveLength(1);
      expect(alphaCache?.items[0].project_id).toBe('proj-alpha');

      expect(betaCache).toBeDefined();
      expect(betaCache?.items).toHaveLength(1);
      expect(betaCache?.items[0].project_id).toBe('proj-beta');

      // Complete items are omitted from active preload
      expect(gammaCache).toBeUndefined();
    });
  });

  describe('4. useProjectItems Immediate Cache Hydration & Delta Sync', () => {
    it('hydrates board state immediately with loading=false when cache entry exists', async () => {
      setProjectCache('proj-instant', {
        items: [mockCard1],
        settings: DEFAULT_PROJECT_SETTINGS,
        latestAt: '2026-11-15T12:00:00Z',
      });

      // Mock delta sync endpoint returning 304 Not Modified
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 304,
      } as any);

      const { result } = renderHook(() =>
        useProjectItems({
          projectId: 'proj-instant',
          autoPoll: false,
        })
      );

      // Instantaneous hydration: zero skeleton flash!
      expect(result.current.loading).toBe(false);
      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].id).toBe('item-1');

      // Delta sync was fired in background with If-Modified-Since header
      await waitFor(() => {
        expect(globalThis.fetch).toHaveBeenCalledWith(
          expect.stringContaining('updated_since=2026-11-15T12%3A00%3A00Z'),
          expect.objectContaining({
            headers: expect.objectContaining({
              'If-Modified-Since': '2026-11-15T12:00:00Z',
            }),
          })
        );
      });
    });

    it('falls back to loading=true and full fetchInitial when no cache entry exists', async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          items: [mockCard2],
          latest_at: '2026-11-15T14:00:00Z',
        }),
      } as any);

      const { result } = renderHook(() =>
        useProjectItems({
          projectId: 'proj-uncached',
          autoPoll: false,
        })
      );

      // Initially loading is true because no cache exists
      expect(result.current.loading).toBe(true);

      await waitFor(() => {
        expect(result.current.loading).toBe(false);
      });

      expect(result.current.items).toHaveLength(1);
      expect(result.current.items[0].id).toBe('item-2');

      // Cache should now be populated
      const cached = getProjectCache('proj-uncached');
      expect(cached).toBeDefined();
      expect(cached?.items[0].id).toBe('item-2');
    });

    it('updates cache immediately when setItems is invoked', async () => {
      setProjectCache('proj-mutate', {
        items: [mockCard1],
        settings: DEFAULT_PROJECT_SETTINGS,
        latestAt: '2026-11-15T12:00:00Z',
      });

      globalThis.fetch = vi.fn().mockResolvedValue({ status: 304 } as any);

      const { result } = renderHook(() =>
        useProjectItems({
          projectId: 'proj-mutate',
          autoPoll: false,
        })
      );

      act(() => {
        result.current.setItems([mockCard1, mockCard2]);
      });

      expect(result.current.items).toHaveLength(2);
      const cached = getProjectCache('proj-mutate');
      expect(cached?.items).toHaveLength(2);
    });
  });
});
