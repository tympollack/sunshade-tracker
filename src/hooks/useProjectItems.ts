'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { WorkItem } from '@/types/tracker';
import {
  getProjectCache,
  setProjectCache,
  DEFAULT_PROJECT_SETTINGS,
} from '@/context/ProjectDataContext';

export interface UseProjectItemsOptions {
  projectId?: string;
  projectSlug?: string;
  tenantSlug?: string;
  isAllProjects?: boolean;
  autoPoll?: boolean;
  pollIntervalMs?: number;
}

export interface UseProjectItemsResult {
  items: WorkItem[];
  setItems: React.Dispatch<React.SetStateAction<WorkItem[]>>;
  loading: boolean;
  isRefreshing: boolean;
  error: string | null;
  coldCount: number;
  lastSyncedAt: string | null;
  loadColdArchive: () => Promise<void>;
  pollDelta: () => Promise<void>;
  refetch: () => Promise<void>;
}

/**
 * Reconciles an incremental delta sync payload against existing state.
 * 1. Upserts mutated items (overwrites existing by ID, appends newly created).
 * 2. Evicts tombstoned records present in deletedIds.
 */
export function reconcileDelta(
  currentItems: WorkItem[],
  deltaItems: WorkItem[],
  deletedIds: string[]
): WorkItem[] {
  const deletedSet = new Set(deletedIds);
  const deltaMap = new Map(deltaItems.map((item) => [item.id, item]));

  // Evict tombstoned IDs and update existing items
  const surviving = currentItems
    .filter((item) => !deletedSet.has(item.id))
    .map((item) => deltaMap.get(item.id) ?? item);

  // Append newly created items not previously in local state
  const existingIdSet = new Set(currentItems.map((i) => i.id));
  const newItems = deltaItems.filter(
    (item) => !existingIdSet.has(item.id) && !deletedSet.has(item.id)
  );

  return [...surviving, ...newItems];
}

/**
 * Merges cold archived completed items smoothly into state without thrashing.
 */
export function mergeColdArchive(
  currentItems: WorkItem[],
  coldItems: WorkItem[]
): WorkItem[] {
  const coldMap = new Map(coldItems.map((i) => [i.id, i]));
  const updated = currentItems.map((i) => coldMap.get(i.id) || i);
  const currentIdSet = new Set(currentItems.map((i) => i.id));
  const newlyAdded = coldItems.filter((i) => !currentIdSet.has(i.id));
  return [...updated, ...newlyAdded];
}

export function useProjectItems(options: UseProjectItemsOptions = {}): UseProjectItemsResult {
  const {
    projectId,
    projectSlug,
    tenantSlug,
    isAllProjects = false,
    autoPoll = true,
    pollIntervalMs = 120000,
  } = options;

  const cacheKey = projectId || projectSlug || (isAllProjects ? 'all' : undefined);
  const cachedEntry = cacheKey ? getProjectCache(cacheKey) : undefined;

  const [items, _setItems] = useState<WorkItem[]>(() => cachedEntry?.items || []);
  const [loading, setLoading] = useState<boolean>(() => !cachedEntry && Boolean(projectId || projectSlug || isAllProjects));
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [coldCount, setColdCount] = useState<number>(0);
  const [lastSyncedAt, setLastSyncedAt] = useState<string | null>(() => cachedEntry?.latestAt || null);

  const lastSyncedAtRef = useRef<string | null>(cachedEntry?.latestAt || null);
  const isFetchingRef = useRef(false);

  // Synchronize state updates to the client project cache immediately
  const setItems: React.Dispatch<React.SetStateAction<WorkItem[]>> = useCallback(
    (action) => {
      _setItems((prev) => {
        const next = typeof action === 'function' ? action(prev) : action;
        if (cacheKey) {
          const cur = getProjectCache(cacheKey);
          setProjectCache(
            cacheKey,
            {
              items: next,
              settings: cur?.settings || DEFAULT_PROJECT_SETTINGS,
              latestAt: lastSyncedAtRef.current || new Date().toISOString(),
            },
            projectId && projectSlug ? (cacheKey === projectId ? projectSlug : projectId) : undefined
          );
        }
        return next;
      });
    },
    [cacheKey, projectId, projectSlug]
  );

  const buildBaseUrl = useCallback(
    (includeCold = false, updatedSince?: string) => {
      const params = new URLSearchParams();
      if (tenantSlug) params.set('tenant_slug', tenantSlug);
      if (isAllProjects) {
        params.set('all_projects', 'true');
      } else if (projectId) {
        params.set('project_id', projectId);
      } else if (projectSlug) {
        params.set('project_slug', projectSlug);
      }

      if (includeCold) {
        params.set('include_cold_archive', 'true');
        params.set('include_archived', 'true');
      }
      if (updatedSince) {
        params.set('updated_since', updatedSince);
      }

      return `/api/v1/items?${params.toString()}`;
    },
    [tenantSlug, isAllProjects, projectId, projectSlug]
  );

  const fetchInitial = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      else setIsRefreshing(true);
      setError(null);

      try {
        const url = buildBaseUrl(false);
        const headers: Record<string, string> = {};
        if (tenantSlug) headers['x-tenant-slug'] = tenantSlug;
        const res = await fetch(url, { credentials: 'include', headers });
        if (res.ok) {
          const data = await res.json();
          const fetchedItems = data.items || [];
          _setItems(fetchedItems);
          const latest = data.latest_at || new Date().toISOString();
          lastSyncedAtRef.current = latest;
          setLastSyncedAt(latest);

          if (cacheKey) {
            const cur = getProjectCache(cacheKey);
            setProjectCache(
              cacheKey,
              {
                items: fetchedItems,
                settings: cur?.settings || DEFAULT_PROJECT_SETTINGS,
                latestAt: latest,
              },
              projectId && projectSlug ? (cacheKey === projectId ? projectSlug : projectId) : undefined
            );
          }

          if (typeof data.cold_count === 'number') {
            setColdCount(data.cold_count);
          }
        } else {
          const err = await res.json().catch(() => ({}));
          setError(err.error || `Failed to fetch items (${res.status})`);
        }
      } catch (err: any) {
        setError(err.message || 'Network error fetching items');
      } finally {
        setLoading(false);
        setIsRefreshing(false);
      }
    },
    [buildBaseUrl, cacheKey, projectId, projectSlug, tenantSlug]
  );

  const loadColdArchive = useCallback(async () => {
    try {
      const url = buildBaseUrl(true);
      const headers: Record<string, string> = {};
      if (tenantSlug) headers['x-tenant-slug'] = tenantSlug;
      const res = await fetch(url, { credentials: 'include', headers });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items)) {
          setItems((prev) => mergeColdArchive(prev, data.items));
          setColdCount(0);
        }
        if (data.latest_at) {
          lastSyncedAtRef.current = data.latest_at;
          setLastSyncedAt(data.latest_at);
        }
      }
    } catch {
      // Gracefully ignore load errors
    }
  }, [buildBaseUrl, setItems, tenantSlug]);

  const pollDelta = useCallback(async () => {
    if (!lastSyncedAtRef.current || isFetchingRef.current) return;
    isFetchingRef.current = true;

    try {
      const syncedAt = lastSyncedAtRef.current;
      const url = buildBaseUrl(false, syncedAt);

      const headers: Record<string, string> = {
        'If-Modified-Since': syncedAt,
      };
      if (tenantSlug) headers['x-tenant-slug'] = tenantSlug;

      const res = await fetch(url, {
        credentials: 'include',
        headers,
      });

      // HTTP 304 Not Modified: zero state updates
      if (res.status === 304) {
        return;
      }

      if (res.ok) {
        const data = await res.json();
        if (data.is_delta) {
          _setItems((prev) => {
            const next = reconcileDelta(prev, data.items || [], data.deleted_ids || []);
            const newLatest = data.latest_at || lastSyncedAtRef.current || new Date().toISOString();
            if (cacheKey) {
              const cur = getProjectCache(cacheKey);
              setProjectCache(
                cacheKey,
                {
                  items: next,
                  settings: cur?.settings || DEFAULT_PROJECT_SETTINGS,
                  latestAt: newLatest,
                },
                projectId && projectSlug ? (cacheKey === projectId ? projectSlug : projectId) : undefined
              );
            }
            return next;
          });

          if (data.latest_at) {
            lastSyncedAtRef.current = data.latest_at;
            setLastSyncedAt(data.latest_at);
          }
        }
      }
    } catch {
      // Background poll silently ignores transient errors
    } finally {
      isFetchingRef.current = false;
    }
  }, [buildBaseUrl, cacheKey, projectId, projectSlug, tenantSlug]);

  // Initial load / project switch
  useEffect(() => {
    if (!cacheKey) return;

    const entry = getProjectCache(cacheKey);
    if (entry) {
      // Hydrate state immediately from cache with zero skeleton flash
      _setItems(entry.items);
      lastSyncedAtRef.current = entry.latestAt;
      setLastSyncedAt(entry.latestAt);
      setLoading(false);

      // Non-blocking background delta fetch
      pollDelta();
    } else {
      fetchInitial();
    }
  }, [cacheKey, fetchInitial, pollDelta]);

  // 2-minute delta polling loop and window focus re-activation
  useEffect(() => {
    if (!autoPoll) return;

    const interval = setInterval(pollDelta, pollIntervalMs);

    const onFocus = () => {
      pollDelta();
    };
    window.addEventListener('focus', onFocus);

    return () => {
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
    };
  }, [autoPoll, pollIntervalMs, pollDelta]);

  return {
    items,
    setItems,
    loading,
    isRefreshing,
    error,
    coldCount,
    lastSyncedAt,
    loadColdArchive,
    pollDelta,
    refetch: () => fetchInitial(true),
  };
}
