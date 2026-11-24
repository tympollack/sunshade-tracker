'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SprintDefinition, StatusDefinition, WorkItem, WorkItemNode } from '@/types/tracker';
import {
  SprintCollapseOptions,
  areSetsEqual,
  getDefaultCollapsedSprintNames,
  getDefaultCollapsedTreeNodeIds,
  readOrMigrateCollapseSet,
  writeStoredCollapseSet,
} from '@/lib/tree-collapse';

export interface CollapseMigrationOptions {
  legacyStorageKey?: string;
  projectSlug?: string;
}

function collectTreeNodeIds(nodes: WorkItemNode[]): Set<string> {
  const ids = new Set<string>();
  const walk = (branch: WorkItemNode[]) => {
    for (const n of branch) {
      ids.add(n.id);
      if (n.children && n.children.length > 0) walk(n.children);
    }
  };
  walk(nodes);
  return ids;
}

/**
 * Manages collapsed node IDs for a hierarchy tree with localStorage persistence.
 * When no user preference is stored for the storageKey, completed parent groups
 * (epics, stories, etc. with children) default to collapsed on load.
 * Transient expansions (e.g. dropping or quick-adding an item under a parent) are tracked
 * separately so tree rebuilds keep the target open without disabling future auto-collapse defaults.
 */
export function useAutoCollapsedTreeNodes(
  storageKey: string,
  treeItems: WorkItemNode[],
  getStatuses?: (item: WorkItem) => StatusDefinition[] | undefined,
  migration?: CollapseMigrationOptions
) {
  const ownedNodeIds = useMemo(() => collectTreeNodeIds(treeItems), [treeItems]);
  const [hasUserOverride, setHasUserOverride] = useState<boolean>(
    () =>
      readOrMigrateCollapseSet(storageKey, {
        ...migration,
        ownedIds: ownedNodeIds,
      }) !== null
  );
  const [baseCollapsedIds, setBaseCollapsedIds] = useState<Set<string>>(() => {
    const stored = readOrMigrateCollapseSet(storageKey, {
      ...migration,
      ownedIds: ownedNodeIds,
    });
    if (stored !== null) return stored;
    return getDefaultCollapsedTreeNodeIds(treeItems, getStatuses);
  });
  const [transientExpandedIds, setTransientExpandedIds] = useState<Set<string>>(() => new Set());

  const prevStorageKeyRef = useRef<string>(storageKey);
  const getStatusesRef = useRef(getStatuses);
  getStatusesRef.current = getStatuses;
  const migrationRef = useRef(migration);
  migrationRef.current = migration;

  useEffect(() => {
    const stored = readOrMigrateCollapseSet(storageKey, {
      ...migrationRef.current,
      ownedIds: ownedNodeIds,
    });
    const keyChanged = prevStorageKeyRef.current !== storageKey;
    prevStorageKeyRef.current = storageKey;

    if (keyChanged) {
      setTransientExpandedIds(new Set());
    }

    if (stored !== null) {
      setHasUserOverride(true);
      setBaseCollapsedIds((prev) => (keyChanged || !areSetsEqual(prev, stored) ? stored : prev));
      return;
    }

    if (keyChanged) {
      setHasUserOverride(false);
    }

    if (keyChanged || !hasUserOverride) {
      const defaults = getDefaultCollapsedTreeNodeIds(treeItems, getStatusesRef.current);
      setBaseCollapsedIds((prev) => (areSetsEqual(prev, defaults) ? prev : defaults));
    }
  }, [storageKey, treeItems, ownedNodeIds, hasUserOverride]);

  const collapsedIds = useMemo(() => {
    if (transientExpandedIds.size === 0) return baseCollapsedIds;
    const next = new Set(baseCollapsedIds);
    transientExpandedIds.forEach((id) => next.delete(id));
    return next;
  }, [baseCollapsedIds, transientExpandedIds]);

  const toggleNode = useCallback(
    (nodeId: string) => {
      setHasUserOverride(true);
      const currentlyCollapsed = collapsedIds.has(nodeId);
      setTransientExpandedIds((prev) => {
        if (!prev.has(nodeId)) return prev;
        const next = new Set(prev);
        next.delete(nodeId);
        return next;
      });
      setBaseCollapsedIds((prev) => {
        const next = new Set(prev);
        transientExpandedIds.forEach((id) => {
          if (id !== nodeId) next.delete(id);
        });
        if (currentlyCollapsed) {
          next.delete(nodeId);
        } else {
          next.add(nodeId);
        }
        writeStoredCollapseSet(storageKey, next);
        return next;
      });
    },
    [storageKey, collapsedIds, transientExpandedIds]
  );

  const expandNode = useCallback(
    (nodeId: string, persist: boolean = false) => {
      // If the user has an explicit persisted override and this node is collapsed in it,
      // update the persisted override; otherwise use transient expansion so we never
      // suppress automatic completion collapse defaults for other groups.
      if (persist && hasUserOverride) {
        setTransientExpandedIds((prev) => {
          if (!prev.has(nodeId)) return prev;
          const next = new Set(prev);
          next.delete(nodeId);
          return next;
        });
        setBaseCollapsedIds((prev) => {
          if (!prev.has(nodeId)) return prev;
          const next = new Set(prev);
          next.delete(nodeId);
          writeStoredCollapseSet(storageKey, next);
          return next;
        });
        return;
      }

      setTransientExpandedIds((prev) => {
        if (prev.has(nodeId)) return prev;
        const next = new Set(prev);
        next.add(nodeId);
        return next;
      });
    },
    [storageKey, hasUserOverride]
  );

  const expandAll = useCallback(() => {
    setHasUserOverride(true);
    setTransientExpandedIds(new Set());
    const empty = new Set<string>();
    setBaseCollapsedIds(empty);
    writeStoredCollapseSet(storageKey, empty);
  }, [storageKey]);

  const collapseAll = useCallback(
    (nodesToCollect: WorkItemNode[] = treeItems) => {
      setHasUserOverride(true);
      setTransientExpandedIds(new Set());
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
      setBaseCollapsedIds(parentIds);
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
  sprintDefs: SprintDefinition[],
  options?: SprintCollapseOptions & CollapseMigrationOptions
) {
  const ownedSprintIds = useMemo(() => new Set(sprintNames), [sprintNames]);
  const [hasUserOverride, setHasUserOverride] = useState<boolean>(
    () =>
      readOrMigrateCollapseSet(storageKey, {
        legacyStorageKey: options?.legacyStorageKey,
        projectSlug: options?.projectSlug,
        ownedIds: ownedSprintIds,
      }) !== null
  );
  const [collapsedSprints, setCollapsedSprints] = useState<Set<string>>(() => {
    const stored = readOrMigrateCollapseSet(storageKey, {
      legacyStorageKey: options?.legacyStorageKey,
      projectSlug: options?.projectSlug,
      ownedIds: ownedSprintIds,
    });
    if (stored !== null) return stored;
    return getDefaultCollapsedSprintNames(sprintNames, sprintDefs, options);
  });

  const prevStorageKeyRef = useRef<string>(storageKey);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  useEffect(() => {
    const stored = readOrMigrateCollapseSet(storageKey, {
      legacyStorageKey: optionsRef.current?.legacyStorageKey,
      projectSlug: optionsRef.current?.projectSlug,
      ownedIds: ownedSprintIds,
    });
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
      const defaults = getDefaultCollapsedSprintNames(
        sprintNames,
        sprintDefs,
        optionsRef.current
      );
      setCollapsedSprints((prev) => (areSetsEqual(prev, defaults) ? prev : defaults));
    }
  }, [storageKey, sprintNames, ownedSprintIds, sprintDefs, options?.isAllProjects, options?.items, hasUserOverride]);

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
