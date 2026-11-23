'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SprintDefinition, StatusDefinition, WorkItem, WorkItemNode } from '@/types/tracker';
import {
  areSetsEqual,
  getDefaultCollapsedSprintNames,
  getDefaultCollapsedTreeNodeIds,
  readStoredCollapseSet,
  writeStoredCollapseSet,
} from '@/lib/tree-collapse';

/**
 * Manages collapsed node IDs for a hierarchy tree with localStorage persistence.
 * When no user preference is stored for the storageKey, completed parent groups
 * (epics, stories, etc. with children) default to collapsed on load.
 */
export function useAutoCollapsedTreeNodes(
  storageKey: string,
  treeItems: WorkItemNode[],
  getStatuses?: (item: WorkItem) => StatusDefinition[] | undefined
) {
  const [hasUserOverride, setHasUserOverride] = useState<boolean>(
    () => readStoredCollapseSet(storageKey) !== null
  );
  const [collapsedIds, setCollapsedIds] = useState<Set<string>>(() => {
    const stored = readStoredCollapseSet(storageKey);
    if (stored !== null) return stored;
    return getDefaultCollapsedTreeNodeIds(treeItems, getStatuses);
  });

  const prevStorageKeyRef = useRef<string>(storageKey);
  const getStatusesRef = useRef(getStatuses);
  getStatusesRef.current = getStatuses;

  useEffect(() => {
    const stored = readStoredCollapseSet(storageKey);
    const keyChanged = prevStorageKeyRef.current !== storageKey;
    prevStorageKeyRef.current = storageKey;

    if (stored !== null) {
      setHasUserOverride(true);
      setCollapsedIds((prev) => (keyChanged || !areSetsEqual(prev, stored) ? stored : prev));
      return;
    }

    if (keyChanged) {
      setHasUserOverride(false);
    }

    if (keyChanged || !hasUserOverride) {
      const defaults = getDefaultCollapsedTreeNodeIds(treeItems, getStatusesRef.current);
      setCollapsedIds((prev) => (areSetsEqual(prev, defaults) ? prev : defaults));
    }
  }, [storageKey, treeItems, hasUserOverride]);

  const toggleNode = useCallback(
    (nodeId: string) => {
      setHasUserOverride(true);
      setCollapsedIds((prev) => {
        const next = new Set(prev);
        if (next.has(nodeId)) {
          next.delete(nodeId);
        } else {
          next.add(nodeId);
        }
        writeStoredCollapseSet(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const expandNode = useCallback(
    (nodeId: string, persist: boolean = false) => {
      if (persist) {
        setHasUserOverride(true);
      }
      setCollapsedIds((prev) => {
        if (!prev.has(nodeId)) return prev;
        const next = new Set(prev);
        next.delete(nodeId);
        if (persist) {
          writeStoredCollapseSet(storageKey, next);
        }
        return next;
      });
    },
    [storageKey]
  );

  const expandAll = useCallback(() => {
    setHasUserOverride(true);
    const empty = new Set<string>();
    setCollapsedIds(empty);
    writeStoredCollapseSet(storageKey, empty);
  }, [storageKey]);

  const collapseAll = useCallback(
    (nodesToCollect: WorkItemNode[] = treeItems) => {
      setHasUserOverride(true);
      const parentIds = new Set<string>();
      const collectParents = (nodes: WorkItemNode[]) => {
        for (const n of nodes) {
          if (n.children && n.children.length > 0) {
            parentIds.add(n.id);
            collectParents(n.children);
          }
        }
      };
      collectParents(nodesToCollect);
      setCollapsedIds(parentIds);
      writeStoredCollapseSet(storageKey, parentIds);
    },
    [storageKey, treeItems]
  );

  return {
    collapsedIds,
    toggleNode,
    expandNode,
    expandAll,
    collapseAll,
  };
}

/**
 * Manages collapsed sprint swimlanes with localStorage persistence.
 * When no user preference is stored for the storageKey, completed sprints default to collapsed on load.
 */
export function useAutoCollapsedSprints(
  storageKey: string,
  sprintNames: string[],
  sprintDefs: SprintDefinition[]
) {
  const [hasUserOverride, setHasUserOverride] = useState<boolean>(
    () => readStoredCollapseSet(storageKey) !== null
  );
  const [collapsedSprints, setCollapsedSprints] = useState<Set<string>>(() => {
    const stored = readStoredCollapseSet(storageKey);
    if (stored !== null) return stored;
    return getDefaultCollapsedSprintNames(sprintNames, sprintDefs);
  });

  const prevStorageKeyRef = useRef<string>(storageKey);

  useEffect(() => {
    const stored = readStoredCollapseSet(storageKey);
    const keyChanged = prevStorageKeyRef.current !== storageKey;
    prevStorageKeyRef.current = storageKey;

    if (stored !== null) {
      setHasUserOverride(true);
      setCollapsedSprints((prev) => (keyChanged || !areSetsEqual(prev, stored) ? stored : prev));
      return;
    }

    if (keyChanged) {
      setHasUserOverride(false);
    }

    if (keyChanged || !hasUserOverride) {
      const defaults = getDefaultCollapsedSprintNames(sprintNames, sprintDefs);
      setCollapsedSprints((prev) => (areSetsEqual(prev, defaults) ? prev : defaults));
    }
  }, [storageKey, sprintNames, sprintDefs, hasUserOverride]);

  const toggleSprint = useCallback(
    (sprintKey: string) => {
      setHasUserOverride(true);
      setCollapsedSprints((prev) => {
        const next = new Set(prev);
        if (next.has(sprintKey)) {
          next.delete(sprintKey);
        } else {
          next.add(sprintKey);
        }
        writeStoredCollapseSet(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  const toggleAllSprints = useCallback(
    (allKeys: string[]) => {
      setHasUserOverride(true);
      setCollapsedSprints((prev) => {
        const allCurrentlyCollapsed =
          allKeys.length > 0 && allKeys.every((k) => prev.has(k));
        const next = allCurrentlyCollapsed ? new Set<string>() : new Set<string>(allKeys);
        writeStoredCollapseSet(storageKey, next);
        return next;
      });
    },
    [storageKey]
  );

  return {
    collapsedSprints,
    toggleSprint,
    toggleAllSprints,
  };
}
