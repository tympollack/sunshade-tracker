'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import { ProjectSettings, RowColumnViewTarget, WorkItem } from '@/types/tracker';
import {
  ResolvedRowColumn,
  getDefaultRowColumnKeys,
  resolveAvailableRowColumns,
  resolveEffectiveRowColumns,
} from '@/lib/row-columns';

export function getRowColumnsStorageKey(projectSlug: string, view: RowColumnViewTarget): string {
  return `tracker_row_columns_${projectSlug || 'default'}_${view}`;
}

export interface UseRowColumnsResult {
  availableColumns: ResolvedRowColumn[];
  effectiveColumns: ResolvedRowColumn[];
  activeKeys: Set<string>;
  isCustomized: boolean;
  toggleColumn: (key: string) => void;
  moveColumn: (key: string, direction: 'up' | 'down') => void;
  resetToSchema: () => void;
}

export function useRowColumns(
  projectSettings: ProjectSettings | null | undefined,
  view: RowColumnViewTarget,
  projectSlug: string = 'default',
  items?: WorkItem[]
): UseRowColumnsResult {
  const storageKey = getRowColumnsStorageKey(projectSlug, view);
  const [userKeys, setUserKeys] = useState<string[] | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.every((k) => typeof k === 'string')) {
          setUserKeys(parsed);
          return;
        }
      }
    } catch {}
    setUserKeys(null);
  }, [storageKey]);

  const availableColumns = useMemo(
    () => resolveAvailableRowColumns(projectSettings, items),
    [projectSettings, items]
  );

  const effectiveColumns = useMemo(
    () => resolveEffectiveRowColumns(projectSettings, view, userKeys, items),
    [projectSettings, view, userKeys, items]
  );

  const activeKeys = useMemo(
    () => new Set(effectiveColumns.map((c) => c.key)),
    [effectiveColumns]
  );

  const persistKeys = useCallback(
    (nextKeys: string[] | null) => {
      setUserKeys(nextKeys);
      if (typeof window === 'undefined') return;
      try {
        if (nextKeys === null) {
          localStorage.removeItem(storageKey);
        } else {
          localStorage.setItem(storageKey, JSON.stringify(nextKeys));
        }
      } catch {}
    },
    [storageKey]
  );

  const toggleColumn = useCallback(
    (key: string) => {
      const currentKeys =
        userKeys !== null ? [...userKeys] : getDefaultRowColumnKeys(projectSettings, view);
      const exists = currentKeys.includes(key);
      const nextKeys = exists
        ? currentKeys.filter((k) => k !== key)
        : [...currentKeys, key];
      persistKeys(nextKeys);
    },
    [userKeys, projectSettings, view, persistKeys]
  );

  const moveColumn = useCallback(
    (key: string, direction: 'up' | 'down') => {
      const currentKeys =
        userKeys !== null ? [...userKeys] : getDefaultRowColumnKeys(projectSettings, view);
      const idx = currentKeys.indexOf(key);
      if (idx === -1) return;
      const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
      if (targetIdx < 0 || targetIdx >= currentKeys.length) return;
      const next = [...currentKeys];
      [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
      persistKeys(next);
    },
    [userKeys, projectSettings, view, persistKeys]
  );

  const resetToSchema = useCallback(() => {
    persistKeys(null);
  }, [persistKeys]);

  return {
    availableColumns,
    effectiveColumns,
    activeKeys,
    isCustomized: userKeys !== null,
    toggleColumn,
    moveColumn,
    resetToSchema,
  };
}
