'use client';

import { useEffect, useRef } from 'react';
import { WorkItem } from '@/types/tracker';
import { subscribeToItemSync } from '@/lib/sync-channel';

export interface UseTabSyncProps {
  items: WorkItem[];
  setItems: React.Dispatch<React.SetStateAction<WorkItem[]>>;
  editingItem: WorkItem | null;
  setEditingItem: React.Dispatch<React.SetStateAction<WorkItem | null>>;
  fetchData: () => Promise<void> | void;
  tenantSlug?: string;
  projectSlug?: string;
  currentProjectId?: string;
  isAllProjects?: boolean;
  initialSearchParamItem?: string | null;
  loading?: boolean;
}

export function useTabSync({
  items,
  setItems,
  editingItem,
  setEditingItem,
  fetchData,
  tenantSlug,
  projectSlug,
  currentProjectId,
  isAllProjects = false,
  initialSearchParamItem,
  loading = false,
}: UseTabSyncProps) {
  const handledDeepLinkRef = useRef<string | null>(null);
  const hasModalCommittedOpenRef = useRef(false);

  const itemsRef = useRef(items);
  itemsRef.current = items;

  const editingItemRef = useRef(editingItem);
  editingItemRef.current = editingItem;

  const setItemsRef = useRef(setItems);
  setItemsRef.current = setItems;

  const setEditingItemRef = useRef(setEditingItem);
  setEditingItemRef.current = setEditingItem;

  const fetchDataRef = useRef(fetchData);
  fetchDataRef.current = fetchData;

  // 1. Initial hydration from query param (?item=...)
  useEffect(() => {
    let targetId = initialSearchParamItem;
    if (!targetId && typeof window !== 'undefined') {
      targetId = new URLSearchParams(window.location.search).get('item');
    }

    if (!targetId) {
      return;
    }

    if (handledDeepLinkRef.current !== targetId) {
      const matched = items.find(
        (it) => it.id === targetId || it.external_ref_id === targetId
      );
      if (matched) {
        handledDeepLinkRef.current = targetId;
        setEditingItem(matched);
      } else if (!loading) {
        // Attempt fetch by UUID (ids) or external_ref_id (refs) with fallback
        const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(targetId);
        const primaryParam = isUuid ? 'ids' : 'refs';
        const fallbackParam = isUuid ? 'refs' : 'ids';

        const fetchByParam = (paramName: 'ids' | 'refs') =>
          fetch(`/api/v1/items/bulk?${paramName}=${encodeURIComponent(targetId)}`, {
            headers: tenantSlug ? { 'x-tenant-slug': tenantSlug } : {},
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => (data?.items && data.items.length > 0 ? data.items[0] : null))
            .catch(() => null);

        fetchByParam(primaryParam).then((item) => {
          if (item) {
            handledDeepLinkRef.current = targetId;
            setEditingItem(item);
          } else {
            fetchByParam(fallbackParam).then((fallbackItem) => {
              if (fallbackItem) {
                handledDeepLinkRef.current = targetId;
                setEditingItem(fallbackItem);
              } else {
                handledDeepLinkRef.current = targetId;
                // Nonexistent item: explicitly clean up URL if still pointing to targetId
                if (typeof window !== 'undefined') {
                  const url = new URL(window.location.href);
                  if (url.searchParams.get('item') === targetId) {
                    url.searchParams.delete('item');
                    window.history.replaceState(null, '', url.toString());
                  }
                }
              }
            });
          }
        });
      }
    }
  }, [initialSearchParamItem, items, loading, tenantSlug, setEditingItem]);

  // 2. URL synchronization when editingItem opens / closes
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);
    const currentParam = url.searchParams.get('item');

    if (editingItem) {
      hasModalCommittedOpenRef.current = true;
      const itemRef = editingItem.external_ref_id || editingItem.id;
      if (currentParam !== itemRef) {
        url.searchParams.set('item', itemRef);
        window.history.replaceState(null, '', url.toString());
      }
    } else {
      // Only remove ?item on genuine transition after modal has committed open
      if (hasModalCommittedOpenRef.current) {
        hasModalCommittedOpenRef.current = false;
        if (currentParam) {
          url.searchParams.delete('item');
          window.history.replaceState(null, '', url.toString());
        }
      }
    }
  }, [editingItem]);

  // 3. Browser Back/Forward navigation (popstate)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      const currentParam = new URLSearchParams(window.location.search).get('item');
      if (!currentParam) {
        setEditingItem(null);
      } else {
        const matched = itemsRef.current.find(
          (it) => it.id === currentParam || it.external_ref_id === currentParam
        );
        if (matched) {
          setEditingItem(matched);
        } else {
          const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentParam);
          const pName = isUuid ? 'ids' : 'refs';
          fetch(`/api/v1/items/bulk?${pName}=${encodeURIComponent(currentParam)}`, {
            headers: tenantSlug ? { 'x-tenant-slug': tenantSlug } : {},
          })
            .then((res) => (res.ok ? res.json() : null))
            .then((data) => {
              if (data?.items && data.items.length > 0) {
                setEditingItem(data.items[0]);
              }
            })
            .catch(() => {});
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [setEditingItem, tenantSlug]);

  // 4. Cross-tab synchronization via BroadcastChannel (with tenant & project filtering)
  useEffect(() => {
    const unsubscribe = subscribeToItemSync((msg) => {
      // Tenant filter: Ignore broadcasts from other workspaces
      if (msg.tenantSlug && tenantSlug && msg.tenantSlug !== tenantSlug) {
        return;
      }

      const currentItems = itemsRef.current;
      const currentEditing = editingItemRef.current;

      if (msg.type === 'ITEM_UPDATED') {
        const isItemRelevantLocally =
          currentItems.some((it) => it.id === msg.itemId) ||
          currentEditing?.id === msg.itemId;

        if (!isAllProjects && currentProjectId && msg.projectId) {
          const isCurrent = msg.projectId === currentProjectId;
          const isSource = msg.sourceProjectId === currentProjectId;
          const isRelevant = isCurrent || isSource;

          // If item was moved into this project from another project, fetch fresh items
          if (isCurrent && msg.sourceProjectId && msg.sourceProjectId !== currentProjectId) {
            fetchDataRef.current();
            return;
          }

          // If update is for another project and we don't have this item locally or open, ignore
          if (!isRelevant && !isItemRelevantLocally) {
            return;
          }
        }

        setItemsRef.current((prev) =>
          prev.map((it) => (it.id === msg.itemId ? { ...it, ...msg.updates } : it))
        );
        setEditingItemRef.current((prev) =>
          prev && prev.id === msg.itemId ? { ...prev, ...msg.updates } : prev
        );
      } else if (msg.type === 'ITEM_DELETED') {
        const isItemRelevantLocally =
          currentItems.some((it) => it.id === msg.itemId) ||
          currentEditing?.id === msg.itemId;

        if (!isAllProjects && currentProjectId && msg.projectId && msg.projectId !== currentProjectId) {
          if (!isItemRelevantLocally) {
            return;
          }
        }
        setItemsRef.current((prev) => prev.filter((it) => it.id !== msg.itemId));
        setEditingItemRef.current((prev) => (prev && prev.id === msg.itemId ? null : prev));
      } else if (msg.type === 'ITEM_CREATED') {
        // Only refresh if all-projects mode or item belongs to this project
        if (!isAllProjects && currentProjectId) {
          const itemProjId = msg.projectId || msg.item?.project_id;
          if (itemProjId && itemProjId !== currentProjectId) {
            return;
          }
        }
        fetchDataRef.current();
      } else if (msg.type === 'ITEMS_REFRESH') {
        if (!isAllProjects && currentProjectId) {
          const isTarget = msg.projectId && msg.projectId === currentProjectId;
          const isSource = msg.sourceProjectId && msg.sourceProjectId === currentProjectId;
          const isSlug = msg.projectSlug && msg.projectSlug === projectSlug;

          if (msg.projectId || msg.sourceProjectId || msg.projectSlug) {
            if (!isTarget && !isSource && !isSlug) {
              return;
            }
          }
        }
        fetchDataRef.current();
      }
    });

    return unsubscribe;
  }, [tenantSlug, projectSlug, currentProjectId, isAllProjects]);
}
