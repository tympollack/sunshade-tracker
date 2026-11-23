import { SprintDefinition, StatusDefinition, WorkItem, WorkItemNode } from '@/types/tracker';
import { getCompletedStatusSet, isItemCompleted } from '@/lib/sprint-utils';

export const TREE_COLLAPSE_STORAGE_PREFIX = 'tracker_collapsed_tree_nodes_';
export const SPRINT_COLLAPSE_STORAGE_PREFIX = 'tracker_collapsed_sprints_';
export const SPRINT_TREE_COLLAPSE_STORAGE_PREFIX = 'tracker_collapsed_sprint_tree_nodes_';

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

/**
 * Computes default collapsed sprint names:
 * any sprint whose definition status is 'completed' defaults to collapsed on load.
 */
export function getDefaultCollapsedSprintNames(
  sprintNames: string[],
  sprintDefs: SprintDefinition[] = []
): Set<string> {
  const collapsed = new Set<string>();
  for (const name of sprintNames) {
    const def = sprintDefs.find((s) => s.name === name || s.id === name);
    if (def?.status?.toLowerCase().trim() === 'completed') {
      collapsed.add(name);
    }
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
