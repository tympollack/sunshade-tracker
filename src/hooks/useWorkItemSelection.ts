'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { WorkItem } from '@/types/tracker';

export interface UseWorkItemSelectionOptions {
  items: WorkItem[];
  initialItemRef?: string | null;
  onItemChange?: (item: WorkItem | null) => void;
  tenantSlug?: string;
}

export function useWorkItemSelection({
  items,
  initialItemRef,
  onItemChange,
  tenantSlug,
}: UseWorkItemSelectionOptions) {
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const selectedItemRef = useRef<WorkItem | null>(null);
  selectedItemRef.current = selectedItem;
  const initialItemRefProcessed = useRef(false);

  // Resolve item by external_ref_id or UUID
  const findItemByRef = useCallback(
    (refOrId: string | null | undefined): WorkItem | null => {
      if (!refOrId) return null;
      const clean = refOrId.trim();
      return (
        itemsRef.current.find(
          (i) =>
            i.external_ref_id?.toLowerCase() === clean.toLowerCase() ||
            i.id === clean
        ) || null
      );
    },
    []
  );

  // Sync state from URL search params on mount or when URL changes
  const syncFromUrl = useCallback(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const itemParam = params.get('item');

    // Only fallback to initialItemRef on first run if ?item is not present in URL
    let targetRef: string | null = itemParam;
    if (!targetRef && !initialItemRefProcessed.current && initialItemRef) {
      targetRef = initialItemRef;
    }
    initialItemRefProcessed.current = true;

    if (!targetRef) {
      setSelectedItem(null);
      if (onItemChange) {
        onItemChange(null);
      }
      return;
    }

    const clean = targetRef.trim();
    const matched = findItemByRef(clean);
    if (matched) {
      setSelectedItem(matched);
      if (onItemChange) {
        onItemChange(matched);
      }
      return;
    }

    // If already selected and matches targetRef, preserve it (e.g. out-of-project item already loaded)
    const current = selectedItemRef.current;
    if (
      current &&
      (current.id === clean ||
        current.external_ref_id?.toLowerCase() === clean.toLowerCase())
    ) {
      return;
    }

    // Out-of-project deep link: attempt fetch by UUID or external_ref_id
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clean);
    const primaryParam = isUuid ? 'ids' : 'refs';
    const fallbackParam = isUuid ? 'refs' : 'ids';

    const fetchByParam = (paramName: 'ids' | 'refs') =>
      fetch(`/api/v1/items/bulk?${paramName}=${encodeURIComponent(clean)}`, {
        headers: tenantSlug ? { 'x-tenant-slug': tenantSlug } : {},
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => (data?.items && data.items.length > 0 ? (data.items[0] as WorkItem) : null))
        .catch(() => null);

    fetchByParam(primaryParam).then((item) => {
      if (item) {
        setSelectedItem(item);
        if (onItemChange) {
          onItemChange(item);
        }
      } else {
        fetchByParam(fallbackParam).then((fallbackItem) => {
          if (fallbackItem) {
            setSelectedItem(fallbackItem);
            if (onItemChange) {
              onItemChange(fallbackItem);
            }
          } else {
            // Item does not exist anywhere, clean up search param if it's still clean
            if (typeof window !== 'undefined') {
              const url = new URL(window.location.href);
              if (url.searchParams.get('item') === clean) {
                url.searchParams.delete('item');
                window.history.replaceState(null, '', url.pathname + url.search);
              }
            }
            setSelectedItem(null);
            if (onItemChange) {
              onItemChange(null);
            }
          }
        });
      }
    });
  }, [findItemByRef, initialItemRef, onItemChange, tenantSlug]);

  // Initial load check
  useEffect(() => {
    syncFromUrl();
  }, [items, syncFromUrl]);

  // Listen to popstate (back/forward navigation)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      syncFromUrl();
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [syncFromUrl]);

  // Selection updater that updates URL search param via history.replaceState
  const selectItem = useCallback(
    (item: WorkItem | null) => {
      setSelectedItem(item);
      if (onItemChange) {
        onItemChange(item);
      }

      if (typeof window === 'undefined') return;
      const url = new URL(window.location.href);
      if (item) {
        const ref = item.external_ref_id || item.id;
        url.searchParams.set('item', ref);
      } else {
        url.searchParams.delete('item');
      }

      // Non-reloading URL sync preserving scroll position
      window.history.replaceState(null, '', url.pathname + url.search);
    },
    [onItemChange]
  );

  // Global 'Escape' hotkey to dismiss selection
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedItem) {
        selectItem(null);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedItem, selectItem]);

  return {
    selectedItem,
    selectItem,
    isOpen: Boolean(selectedItem),
    close: () => selectItem(null),
  };
}
