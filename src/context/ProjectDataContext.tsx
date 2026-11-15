'use client';

import React, { createContext, useContext, ReactNode, useEffect } from 'react';
import { WorkItem, ProjectSettings } from '@/types/tracker';
import { useProjectItems, UseProjectItemsOptions, UseProjectItemsResult } from '@/hooks/useProjectItems';
import { DEFAULT_PROJECT_SETTINGS, normalizeProjectSettings } from '@/hooks/useProjectSettings';

export type WorkItemCard = WorkItem;

export interface ProjectCacheEntry {
  items: WorkItemCard[];
  settings: ProjectSettings;
  latestAt: string;
  tenantSlug?: string;
  isPartial?: boolean;
}

const STORAGE_PREFIX = 'sunshade_project_cache_';
const ALIAS_PREFIX = 'sunshade_project_alias_';

// In-memory cache keyed by projectId (or slug)
const projectCacheMap = new Map<string, ProjectCacheEntry>();
// Slug-to-id and id-to-slug alias mappings
const projectAliasMap = new Map<string, string>();

function safeGetStorage(): Storage | null {
  if (typeof window === 'undefined') return null;
  try {
    return window.sessionStorage || null;
  } catch {
    return null;
  }
}

function safeLoadFromStorage(key: string): ProjectCacheEntry | undefined {
  const storage = safeGetStorage();
  if (!storage) return undefined;
  try {
    const raw = storage.getItem(`${STORAGE_PREFIX}${key}`);
    if (!raw) return undefined;
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.items)) {
      return {
        items: parsed.items,
        settings: parsed.settings ? normalizeProjectSettings(parsed.settings) : DEFAULT_PROJECT_SETTINGS,
        latestAt: typeof parsed.latestAt === 'string' ? parsed.latestAt : new Date().toISOString(),
        tenantSlug: typeof parsed.tenantSlug === 'string' ? parsed.tenantSlug : undefined,
        isPartial: Boolean(parsed.isPartial),
      };
    }
  } catch {
    // Corrupted JSON or storage access error
  }
  return undefined;
}

function safeSaveToStorage(key: string, entry: ProjectCacheEntry): void {
  const storage = safeGetStorage();
  if (!storage) return;

  const serialized = JSON.stringify(entry);
  try {
    storage.setItem(`${STORAGE_PREFIX}${key}`, serialized);
  } catch (err: any) {
    // QuotaExceededError handling: prune older cached projects
    if (err?.name === 'QuotaExceededError' || err?.code === 22) {
      try {
        const keysToRemove: string[] = [];
        for (let i = 0; i < storage.length; i++) {
          const k = storage.key(i);
          if (k && k.startsWith(STORAGE_PREFIX) && k !== `${STORAGE_PREFIX}${key}`) {
            keysToRemove.push(k);
          }
        }
        // Evict up to 3 older cache entries
        keysToRemove.slice(0, 3).forEach((k) => storage.removeItem(k));
        storage.setItem(`${STORAGE_PREFIX}${key}`, serialized);
      } catch {
        // Silently tolerate if still exceeding quota; in-memory cache remains intact
      }
    }
  }
}

/**
 * Retrieves cached work items, settings, and latest_at timestamp for a project.
 * Checks in-memory Map first, then falls back to sessionStorage.
 * Scoped by optional tenantSlug to avoid cross-tenant/account leaking.
 */
export function getProjectCache(key: string, tenantSlug?: string): ProjectCacheEntry | undefined {
  if (!key) return undefined;

  const scopedKey = tenantSlug ? `${tenantSlug}:${key}` : null;

  const validateTenant = (entry?: ProjectCacheEntry): ProjectCacheEntry | undefined => {
    if (!entry) return undefined;
    if (tenantSlug && entry.tenantSlug && entry.tenantSlug !== tenantSlug) {
      return undefined;
    }
    return entry;
  };

  // 1. Direct hit in in-memory Map (scoped key first, then raw key)
  if (scopedKey && projectCacheMap.has(scopedKey)) {
    return validateTenant(projectCacheMap.get(scopedKey));
  }
  if (projectCacheMap.has(key)) {
    return validateTenant(projectCacheMap.get(key));
  }

  // 2. Check alias in in-memory Map
  const resolvedAlias = (scopedKey ? projectAliasMap.get(scopedKey) : null) || projectAliasMap.get(key);
  if (resolvedAlias && projectCacheMap.has(resolvedAlias)) {
    return validateTenant(projectCacheMap.get(resolvedAlias));
  }

  // 3. Fallback to sessionStorage
  const fromStorage =
    (scopedKey ? safeLoadFromStorage(scopedKey) : undefined) ||
    safeLoadFromStorage(key) ||
    (resolvedAlias ? safeLoadFromStorage(resolvedAlias) : undefined);

  if (fromStorage) {
    const valid = validateTenant(fromStorage);
    if (valid) {
      if (scopedKey) projectCacheMap.set(scopedKey, valid);
      projectCacheMap.set(key, valid);
      if (resolvedAlias) {
        projectCacheMap.set(resolvedAlias, valid);
      }
      return valid;
    }
  }

  // 4. Try storage alias lookup
  const storage = safeGetStorage();
  if (storage) {
    try {
      const storedAlias =
        (scopedKey ? storage.getItem(`${ALIAS_PREFIX}${scopedKey}`) : null) ||
        storage.getItem(`${ALIAS_PREFIX}${key}`);
      if (storedAlias) {
        projectAliasMap.set(key, storedAlias);
        projectAliasMap.set(storedAlias, key);
        const aliasedEntry = safeLoadFromStorage(storedAlias);
        if (aliasedEntry) {
          const valid = validateTenant(aliasedEntry);
          if (valid) {
            projectCacheMap.set(key, valid);
            projectCacheMap.set(storedAlias, valid);
            return valid;
          }
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  return undefined;
}

/**
 * Persists an entry into the in-memory Map and sessionStorage.
 * Optionally binds an alternate key (e.g. projectSlug <-> projectId).
 * Supports optional tenantSlug scoping to prevent cross-account collisions.
 */
export function setProjectCache(
  key: string,
  entry: ProjectCacheEntry,
  alternateKey?: string,
  tenantSlug?: string
): void {
  if (!key) return;

  const effectiveTenantSlug = tenantSlug || entry.tenantSlug;
  const enrichedEntry: ProjectCacheEntry = {
    ...entry,
    tenantSlug: effectiveTenantSlug,
  };

  const scopedKey = effectiveTenantSlug ? `${effectiveTenantSlug}:${key}` : key;

  projectCacheMap.set(scopedKey, enrichedEntry);
  safeSaveToStorage(scopedKey, enrichedEntry);

  if (scopedKey !== key) {
    projectCacheMap.set(key, enrichedEntry);
    safeSaveToStorage(key, enrichedEntry);
  }

  if (alternateKey && alternateKey !== key) {
    const scopedAltKey = effectiveTenantSlug ? `${effectiveTenantSlug}:${alternateKey}` : alternateKey;
    projectCacheMap.set(scopedAltKey, enrichedEntry);
    safeSaveToStorage(scopedAltKey, enrichedEntry);
    if (scopedAltKey !== alternateKey) {
      projectCacheMap.set(alternateKey, enrichedEntry);
      safeSaveToStorage(alternateKey, enrichedEntry);
    }
    projectAliasMap.set(key, alternateKey);
    projectAliasMap.set(alternateKey, key);
    if (scopedKey && scopedAltKey) {
      projectAliasMap.set(scopedKey, scopedAltKey);
      projectAliasMap.set(scopedAltKey, scopedKey);
    }

    const storage = safeGetStorage();
    if (storage) {
      try {
        storage.setItem(`${ALIAS_PREFIX}${key}`, alternateKey);
        storage.setItem(`${ALIAS_PREFIX}${alternateKey}`, key);
        if (scopedKey && scopedAltKey) {
          storage.setItem(`${ALIAS_PREFIX}${scopedKey}`, scopedAltKey);
          storage.setItem(`${ALIAS_PREFIX}${scopedAltKey}`, scopedKey);
        }
      } catch {
        // Quota or access error, non-fatal
      }
    }
  }
}

/**
 * Clears in-memory and sessionStorage project cache.
 */
export function clearProjectCache(): void {
  projectCacheMap.clear();
  projectAliasMap.clear();

  const storage = safeGetStorage();
  if (storage) {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const k = storage.key(i);
        if (k && (k.startsWith(STORAGE_PREFIX) || k.startsWith(ALIAS_PREFIX))) {
          keysToRemove.push(k);
        }
      }
      keysToRemove.forEach((k) => storage.removeItem(k));
    } catch {
      // Ignore
    }
  }
}

/**
 * Applies an updater function to the items of a cached project.
 */
export function updateProjectCacheItems(
  key: string,
  updater: (items: WorkItemCard[]) => WorkItemCard[]
): void {
  const entry = getProjectCache(key);
  if (!entry) return;

  const nextItems = updater(entry.items);
  setProjectCache(key, {
    ...entry,
    items: nextItems,
    latestAt: new Date().toISOString(),
  });
}

/**
 * Optimistically synchronizes an updated card across all relevant cache entries.
 */
export function syncOptimisticMutationToCache(
  item: Partial<WorkItemCard> & { id: string },
  projectId?: string
): void {
  const keysToUpdate = new Set<string>();
  if (projectId) keysToUpdate.add(projectId);

  // Search through all cached entries for the card
  for (const [key, entry] of projectCacheMap.entries()) {
    const idx = entry.items.findIndex((i) => i.id === item.id);
    if (idx !== -1) {
      keysToUpdate.add(key);
    }
  }

  for (const key of keysToUpdate) {
    const entry = getProjectCache(key);
    if (!entry) continue;
    const idx = entry.items.findIndex((i) => i.id === item.id);
    if (idx !== -1) {
      const updatedList = [...entry.items];
      updatedList[idx] = {
        ...updatedList[idx],
        ...item,
        updated_at: new Date().toISOString(),
      };
      setProjectCache(key, {
        ...entry,
        items: updatedList,
        latestAt: new Date().toISOString(),
      });
    }
  }
}

/**
 * Optimistically adds a newly created card to the cached project.
 */
export function syncOptimisticCreationToCache(item: WorkItemCard, projectIdOrSlug: string): void {
  if (!projectIdOrSlug) return;
  const entry = getProjectCache(projectIdOrSlug);
  if (entry) {
    if (!entry.items.some((i) => i.id === item.id)) {
      setProjectCache(projectIdOrSlug, {
        ...entry,
        items: [item, ...entry.items],
        latestAt: new Date().toISOString(),
      });
    }
  }
}

let hasPreloadedPortfolio = false;

/** Resets preload guard (useful in test suites) */
export function resetPortfolioPreloadState(): void {
  hasPreloadedPortfolio = false;
}

/**
 * Triggers a background fetch on initial workspace mount for active cross-project
 * items (status != 'complete') so initial switches across portfolio projects resolve
 * directly from the client cache with zero skeleton flash.
 */
export async function preloadPortfolioItems(tenantSlug?: string): Promise<void> {
  if (hasPreloadedPortfolio || typeof window === 'undefined') return;
  hasPreloadedPortfolio = true;

  try {
    const params = new URLSearchParams();
    params.set('all_projects', 'true');
    params.set('status_filter', 'active');
    if (tenantSlug) params.set('tenant_slug', tenantSlug);

    const headers: Record<string, string> = {};
    if (tenantSlug) headers['x-tenant-slug'] = tenantSlug;

    const res = await fetch(`/api/v1/items?${params.toString()}`, {
      credentials: 'include',
      headers,
    });
    if (!res.ok) return;

    const data = await res.json();
    const items = (data.items || []) as WorkItemCard[];
    const latestAt = data.latest_at || new Date().toISOString();

    // Group items by project_id
    const grouped = new Map<string, WorkItemCard[]>();
    for (const item of items) {
      if (item.status === 'complete') continue;
      if (!item.project_id) continue;
      const list = grouped.get(item.project_id) || [];
      list.push(item);
      grouped.set(item.project_id, list);
    }

    // Populate cache for each project_id
    for (const [projId, projItems] of grouped.entries()) {
      const existing = getProjectCache(projId, tenantSlug);
      if (!existing) {
        setProjectCache(
          projId,
          {
            items: projItems,
            settings: DEFAULT_PROJECT_SETTINGS,
            latestAt,
            tenantSlug,
            isPartial: true,
          },
          undefined,
          tenantSlug
        );
      }
    }
  } catch {
    // Non-blocking background preload silently ignores failures
  }
}

/**
 * Prefetches project data on hover into the client cache so clicking it renders 0ms.
 */
export async function prefetchProjectData(projectIdOrSlug: string, tenantSlug?: string): Promise<void> {
  if (!projectIdOrSlug || typeof window === 'undefined') return;
  if (getProjectCache(projectIdOrSlug, tenantSlug)) return;

  try {
    const params = new URLSearchParams();
    if (projectIdOrSlug.includes('-') && projectIdOrSlug.length > 20) {
      params.set('project_id', projectIdOrSlug);
    } else {
      params.set('project_slug', projectIdOrSlug);
    }
    if (tenantSlug) params.set('tenant_slug', tenantSlug);

    const headers: Record<string, string> = {};
    if (tenantSlug) headers['x-tenant-slug'] = tenantSlug;

    const res = await fetch(`/api/v1/items?${params.toString()}`, {
      credentials: 'include',
      headers,
    });
    if (res.ok) {
      const data = await res.json();
      const items = (data.items || []) as WorkItemCard[];
      const latestAt = data.latest_at || new Date().toISOString();
      const projId = data.project?.id || projectIdOrSlug;
      const projSlug = data.project?.slug || projectIdOrSlug;

      setProjectCache(
        projId,
        {
          items,
          settings: DEFAULT_PROJECT_SETTINGS,
          latestAt,
          tenantSlug,
          isPartial: false,
        },
        projSlug,
        tenantSlug
      );
    }
  } catch {
    // Prefetch failures are non-blocking
  }
}

// React Context Provider
export interface ProjectDataContextValue extends UseProjectItemsResult {
  cache: {
    get: typeof getProjectCache;
    set: typeof setProjectCache;
    clear: typeof clearProjectCache;
    updateItems: typeof updateProjectCacheItems;
    syncMutation: typeof syncOptimisticMutationToCache;
    syncCreation: typeof syncOptimisticCreationToCache;
  };
}

const ProjectDataContext = createContext<ProjectDataContextValue | null>(null);

export interface ProjectDataProviderProps extends UseProjectItemsOptions {
  children: ReactNode;
}

export function ProjectDataProvider(props: ProjectDataProviderProps) {
  const { children, tenantSlug, ...options } = props;
  const projectData = useProjectItems({ tenantSlug, ...options });

  useEffect(() => {
    preloadPortfolioItems(tenantSlug);
  }, [tenantSlug]);

  const value: ProjectDataContextValue = {
    ...projectData,
    cache: {
      get: getProjectCache,
      set: setProjectCache,
      clear: clearProjectCache,
      updateItems: updateProjectCacheItems,
      syncMutation: syncOptimisticMutationToCache,
      syncCreation: syncOptimisticCreationToCache,
    },
  };

  return (
    <ProjectDataContext.Provider value={value}>
      {children}
    </ProjectDataContext.Provider>
  );
}

export function useProjectData(): ProjectDataContextValue {
  const ctx = useContext(ProjectDataContext);
  if (!ctx) {
    throw new Error('useProjectData must be used within a ProjectDataProvider');
  }
  return ctx;
}

export { ProjectDataContext };
export {
  useProjectSettings,
  normalizeProjectSettings,
  DEFAULT_PROJECT_SETTINGS,
} from '@/hooks/useProjectSettings';
