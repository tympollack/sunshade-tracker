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
  const hasHydratedRef = useRef(false);
  const userHasOpenedModalRef = useRef(false);

  // 1. Initial hydration from query param (?item=...)
  useEffect(() => {
    let targetId = initialSearchParamItem;
    if (!targetId && typeof window !== 'undefined') {
      targetId = new URLSearchParams(window.location.search).get('item');
    }

    if (!targetId) {
      hasHydratedRef.current = true;
      return;
    }

    if (handledDeepLinkRef.current !== targetId) {
      const matched = items.find(
        (it) => it.id === targetId || it.external_ref_id === targetId
      );
      if (matched) {
        handledDeepLinkRef.current = targetId;
        hasHydratedRef.current = true;
        userHasOpenedModalRef.current = true;
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
            hasHydratedRef.current = true;
            userHasOpenedModalRef.current = true;
            setEditingItem(item);
          } else {
            fetchByParam(fallbackParam).then((fallbackItem) => {
              if (fallbackItem) {
                handledDeepLinkRef.current = targetId;
                hasHydratedRef.current = true;
                userHasOpenedModalRef.current = true;
                setEditingItem(fallbackItem);
              } else {
                hasHydratedRef.current = true;
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
      userHasOpenedModalRef.current = true;
      hasHydratedRef.current = true;
      const itemRef = editingItem.external_ref_id || editingItem.id;
      if (currentParam !== itemRef) {
        url.searchParams.set('item', itemRef);
        window.history.replaceState(null, '', url.toString());
      }
    } else {
      if (currentParam) {
        // Only remove 'item' param if user explicitly opened & closed the modal
        // or hydration finished and verified no item exists.
        // Never strip the param while deep link hydration is still pending!
        const canCleanUrl = userHasOpenedModalRef.current || (hasHydratedRef.current && !loading);
        if (canCleanUrl) {
          url.searchParams.delete('item');
          window.history.replaceState(null, '', url.toString());
        }
      }
    }
  }, [editingItem, loading]);

  // 3. Browser Back/Forward navigation (popstate)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      const currentParam = new URLSearchParams(window.location.search).get('item');
      if (!currentParam) {
        setEditingItem(null);
      } else {
        const matched = items.find(
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
  }, [items, setEditingItem, tenantSlug]);

  // 4. Cross-tab synchronization via BroadcastChannel (with tenant & project filtering)
  useEffect(() => {
    const unsubscribe = subscribeToItemSync((msg) => {
      // Tenant filter: Ignore broadcasts from other workspaces
      if (msg.tenantSlug && tenantSlug && msg.tenantSlug !== tenantSlug) {
        return;
      }

      if (msg.type === 'ITEM_UPDATED') {
        if (!isAllProjects && currentProjectId && msg.projectId) {
          const isCurrent = msg.projectId === currentProjectId;
          const isSource = msg.sourceProjectId === currentProjectId;
          const isRelevant = isCurrent || isSource;

          // If item was moved into this project from another project, fetch fresh items
          if (isCurrent && msg.sourceProjectId && msg.sourceProjectId !== currentProjectId) {
            fetchData();
            return;
          }

          // If update is for another project and we don't have this item locally, ignore
          if (!isRelevant && !items.some((it) => it.id === msg.itemId)) {
            return;
          }
        }

        setItems((prev) =>
          prev.map((it) => (it.id === msg.itemId ? { ...it, ...msg.updates } : it))
        );
        setEditingItem((prev) =>
          prev && prev.id === msg.itemId ? { ...prev, ...msg.updates } : prev
        );
      } else if (msg.type === 'ITEM_DELETED') {
        if (!isAllProjects && currentProjectId && msg.projectId && msg.projectId !== currentProjectId) {
          if (!items.some((it) => it.id === msg.itemId)) {
            return;
          }
        }
        setItems((prev) => prev.filter((it) => it.id !== msg.itemId));
        setEditingItem((prev) => (prev && prev.id === msg.itemId ? null : prev));
      } else if (msg.type === 'ITEM_CREATED') {
        // Only refresh if all-projects mode or item belongs to this project
        if (!isAllProjects && currentProjectId) {
          const itemProjId = msg.projectId || msg.item?.project_id;
          if (itemProjId && itemProjId !== currentProjectId) {
            return;
          }
        }
        fetchData();
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
        fetchData();
      }
    });

    return unsubscribe;
  }, [fetchData, setItems, setEditingItem, tenantSlug, projectSlug, currentProjectId, isAllProjects, items]);
}
