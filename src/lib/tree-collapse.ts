import { SprintDefinition, StatusDefinition, WorkItem, WorkItemNode } from '@/types/tracker';
import { getCompletedStatusSet, isItemCompleted } from '@/lib/sprint-utils';
import { getDescendantIds } from '@/lib/tree';

export const TREE_COLLAPSE_STORAGE_PREFIX = 'tracker_collapsed_tree_nodes_';
export const SPRINT_COLLAPSE_STORAGE_PREFIX = 'tracker_collapsed_sprints_';
export const SPRINT_TREE_COLLAPSE_STORAGE_PREFIX = 'tracker_collapsed_sprint_tree_nodes_';

/**
 * Builds a workspace- and project-scoped localStorage key so preferences for
 * shared slugs like 'all' never leak across different tenant workspaces.
 */
export function buildCollapseStorageKey(
  prefix: string,
  tenantSlug: string = 'default',
  projectSlug: string = 'default'
): string {
  return `${prefix}${tenantSlug || 'default'}_${projectSlug || 'default'}`;
}

/**
 * Reads a persisted collapse Set from localStorage.
 * Returns null when no preference has been saved yet so callers can apply auto-collapse defaults.
 */
export function readStoredCollapseSet(storageKey: string): Set<string> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (raw === null) return null;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return new Set(parsed.filter((v): v is string => typeof v === 'string'));
  } catch {
    return null;
  }
}

/**
 * Persists a collapse Set to localStorage.
 */
export function writeStoredCollapseSet(storageKey: string, ids: Set<string>): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(Array.from(ids)));
  } catch {
    // Ignore storage quota or security errors
  }
}

/**
 * Computes default collapsed node IDs for hierarchy trees:
 * any parent node (epic, story, etc. with children) whose status is completed defaults to collapsed on load.
 */
export function getDefaultCollapsedTreeNodeIds(
  nodes: WorkItemNode[],
  getStatuses?: (item: WorkItem) => StatusDefinition[] | undefined
): Set<string> {
  const collapsed = new Set<string>();
  const defaultCompletionSet = getCompletedStatusSet();

  const walk = (branch: WorkItemNode[]) => {
    for (const node of branch) {
      const children = node.children || [];
      if (children.length > 0) {
        const itemStatuses = getStatuses?.(node);
        const completionSet =
          itemStatuses && itemStatuses.length > 0
            ? getCompletedStatusSet(itemStatuses)
            : defaultCompletionSet;
        if (isItemCompleted(node.status, completionSet)) {
          collapsed.add(node.id);
        }
        walk(children);
      }
    }
  };

  walk(nodes);
  return collapsed;
}

export interface SprintCollapseOptions {
  isAllProjects?: boolean;
  items?: WorkItem[];
}

/**
 * Computes default collapsed sprint names:
 * a sprint lane defaults to collapsed on load only when all matching project-scoped
 * sprint definitions are completed (preventing active work in shared-name lanes from hiding).
 */
export function getDefaultCollapsedSprintNames(
  sprintNames: string[],
  sprintDefs: SprintDefinition[] = [],
  options?: SprintCollapseOptions
): Set<string> {
  const collapsed = new Set<string>();
  for (const name of sprintNames) {
    const matches = sprintDefs.filter((s) => s.name === name || s.id === name);
    if (matches.length === 0) continue;
    const allMatchingCompleted = matches.every(
      (def) => def.status?.toLowerCase().trim() === 'completed'
    );
    if (!allMatchingCompleted) continue;

    if (options?.isAllProjects && options.items) {
      const completedProjectIds = new Set(
        matches.map((d) => d.project_id).filter((id): id is string => Boolean(id))
      );
      if (completedProjectIds.size > 0) {
        const hasItemWithoutCompletedDef = options.items.some((it) => {
          const itemSprint = it.metadata?.sprint;
          if (itemSprint !== name && it.metadata?.sprint_id !== name) return false;
          return Boolean(it.project_id && !completedProjectIds.has(it.project_id));
        });
        if (hasItemWithoutCompletedDef) continue;
      }
    }

    collapsed.add(name);
  }
  return collapsed;
}

/**
 * Checks whether two string sets contain identical members.
 */
export function areSetsEqual(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const val of a) {
    if (!b.has(val)) return false;
  }
  return true;
}

/**
 * Flattens a tree into depth-first order excluding descendants of collapsed nodes,
 * so Shift-click range selection only spans currently visible rows.
 */
export function flattenVisibleTreeNodes(
  nodes: WorkItemNode[],
  collapsedIds: Set<string>
): WorkItemNode[] {
  const visible: WorkItemNode[] = [];
  const walk = (branch: WorkItemNode[]) => {
    for (const node of branch) {
      visible.push(node);
      if (!collapsedIds.has(node.id) && node.children && node.children.length > 0) {
        walk(node.children);
      }
    }
  };
  walk(nodes);
  return visible;
}

/**
 * Pure selection toggle logic for flat and hierarchy rows.
 * In hierarchy mode (`cascade = true`), a Shift-click whose anchor is missing from
 * the visible `pool` (e.g., inside a collapsed branch) falls back to toggling only
 * `itemId` instead of cascading into hidden descendants.
 */
export function computeToggledSelection(params: {
  prev: Set<string>;
  itemId: string;
  lastSelectedId: string | null;
  isShiftKey: boolean;
  pool: WorkItem[];
  allItems: WorkItem[];
  cascade: boolean;
}): { next: Set<string>; nextLastSelectedId: string } {
  const { prev, itemId, lastSelectedId, isShiftKey, pool, allItems, cascade } = params;
  const next = new Set(prev);

  if (isShiftKey) {
    if (lastSelectedId) {
      const lastIdx = pool.findIndex((it) => it.id === lastSelectedId);
      const currIdx = pool.findIndex((it) => it.id === itemId);
      if (lastIdx !== -1 && currIdx !== -1) {
        const start = Math.min(lastIdx, currIdx);
        const end = Math.max(lastIdx, currIdx);
        for (let i = start; i <= end; i++) {
          next.add(pool[i].id);
        }
        return { next, nextLastSelectedId: itemId };
      }
    }

    if (cascade) {
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return { next, nextLastSelectedId: itemId };
    }
  }

  const isCurrentlySelected = next.has(itemId);
  const descendants = cascade ? getDescendantIds(allItems, itemId) : [];

  if (isCurrentlySelected) {
    next.delete(itemId);
    if (cascade) {
      descendants.forEach((dId) => next.delete(dId));
      let parentId = allItems.find((it) => it.id === itemId)?.parent_id;
      while (parentId) {
        next.delete(parentId);
        parentId = allItems.find((it) => it.id === parentId)?.parent_id;
      }
    }
  } else {
    next.add(itemId);
    if (cascade) {
      descendants.forEach((dId) => next.add(dId));
    }
  }

  return { next, nextLastSelectedId: itemId };
}
