'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { WorkItem } from '@/types/tracker';

export interface UseWorkItemSelectionOptions {
  items: WorkItem[];
  initialItemRef?: string | null;
  onItemChange?: (item: WorkItem | null) => void;
}

export function useWorkItemSelection({
  items,
  initialItemRef,
  onItemChange,
}: UseWorkItemSelectionOptions) {
  const [selectedItem, setSelectedItem] = useState<WorkItem | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

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
    const matched = findItemByRef(itemParam || initialItemRef);
    setSelectedItem(matched);
    if (onItemChange) {
      onItemChange(matched);
    }
  }, [findItemByRef, initialItemRef, onItemChange]);

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
