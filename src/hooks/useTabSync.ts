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
  initialSearchParamItem,
  loading = false,
}: UseTabSyncProps) {
  const handledDeepLinkRef = useRef<string | null>(null);

  // 1. Initial hydration from query param (?item=...)
  useEffect(() => {
    let targetId = initialSearchParamItem;
    if (!targetId && typeof window !== 'undefined') {
      targetId = new URLSearchParams(window.location.search).get('item');
    }

    if (targetId && handledDeepLinkRef.current !== targetId) {
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
      const itemRef = editingItem.external_ref_id || editingItem.id;
      if (currentParam !== itemRef) {
        url.searchParams.set('item', itemRef);
        window.history.replaceState(null, '', url.toString());
      }
    } else {
      if (currentParam) {
        url.searchParams.delete('item');
        window.history.replaceState(null, '', url.toString());
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

  // 4. Cross-tab synchronization via BroadcastChannel
  useEffect(() => {
    const unsubscribe = subscribeToItemSync((msg) => {
      if (msg.type === 'ITEM_UPDATED') {
        setItems((prev) =>
          prev.map((it) => (it.id === msg.itemId ? { ...it, ...msg.updates } : it))
        );
        setEditingItem((prev) =>
          prev && prev.id === msg.itemId ? { ...prev, ...msg.updates } : prev
        );
      } else if (msg.type === 'ITEM_DELETED') {
        setItems((prev) => prev.filter((it) => it.id !== msg.itemId));
        setEditingItem((prev) => (prev && prev.id === msg.itemId ? null : prev));
      } else if (msg.type === 'ITEM_CREATED' || msg.type === 'ITEMS_REFRESH') {
        fetchData();
      }
    });

    return unsubscribe;
  }, [fetchData, setItems, setEditingItem]);
}
