import { WorkItem, WorkItemNode } from '@/types/tracker';

export type { WorkItemNode };

/**
 * Computes recursive subtree metrics (descendantCount and rollupPoints) for each node.
 */
function computeSubtreeMetrics(node: WorkItemNode): { descendantCount: number; rollupPoints: number } {
  const ownPoints = Number(node.metadata?.story_points ?? node.metadata?.points ?? node.metadata?.estimate ?? 0) || 0;
  let descendantCount = 0;
  let totalPoints = ownPoints;

  for (const child of node.children || []) {
    descendantCount += 1;
    const childMetrics = computeSubtreeMetrics(child);
    descendantCount += childMetrics.descendantCount;
    totalPoints += childMetrics.rollupPoints;
  }

  node.descendantCount = descendantCount;
  node.rollupPoints = totalPoints;
  return { descendantCount, rollupPoints: totalPoints };
}

/**
 * Checks whether a parent_id value effectively represents an unparented root item.
 */
export function isEffectivelyUnparented(parentId: string | null | undefined): boolean {
  if (!parentId) return true;
  const trimmed = String(parentId).trim();
  return (
    !trimmed ||
    trimmed.toLowerCase() === 'null' ||
    trimmed.toLowerCase() === 'undefined' ||
    trimmed.toLowerCase() === 'none'
  );
}

/**
 * Transforms flat WorkItem array into a recursive tree structure with depth indicators and rollup metrics.
 * 
 * @param items Flat array of work items
 * @param parentId Target parent ID (null for root level items)
 * @param depth Current recursion depth (starts at 0)
 * @param visited Set of visited IDs to prevent cycles
 * @returns Hierarchical WorkItemNode tree sorted by order_index
 */
export function buildTree(
  items: WorkItem[],
  parentId: string | null = null,
  depth = 0,
  visited = new Set<string>(),
  sortFn?: (a: WorkItem, b: WorkItem) => number
): WorkItemNode[] {
  const parentItem = parentId
    ? items.find((p) => p.id === parentId || (p.external_ref_id && p.external_ref_id === parentId))
    : null;

  let matched = items.filter((item) => {
    if (visited.has(item.id)) return false;
    if (parentId === null) {
      // Root items: parent_id is missing, null, empty, self-referencing, or points to an ID/ref not in items
      if (isEffectivelyUnparented(item.parent_id)) return true;
      if (item.parent_id === item.id) return true;

      const hasParentInItems = items.some(
        (p) =>
          p.id !== item.id &&
          (p.id === item.parent_id || Boolean(p.external_ref_id && p.external_ref_id === item.parent_id))
      );
      return !hasParentInItems;
    }

    return (
      item.parent_id === parentId ||
      Boolean(parentItem?.external_ref_id && item.parent_id === parentItem.external_ref_id)
    );
  });

  const comparator = sortFn || ((a: WorkItem, b: WorkItem) => (a.order_index ?? 0) - (b.order_index ?? 0));

  // Fallback: If at root level no natural root nodes were found but unvisited items exist
  // (e.g. isolated circular references like A -> B -> A), pick the lowest order candidate as root
  if (parentId === null && matched.length === 0 && items.length > 0) {
    const unvisitedCandidates = items.filter((item) => !visited.has(item.id));
    if (unvisitedCandidates.length > 0) {
      unvisitedCandidates.sort(comparator);
      matched = [unvisitedCandidates[0]];
    }
  }

  const tree: WorkItemNode[] = matched
    .sort(comparator)
    .map((item) => {
      const nextVisited = new Set(visited);
      nextVisited.add(item.id);
      return {
        ...item,
        depth,
        children: buildTree(items, item.id, depth + 1, nextVisited, sortFn),
      };
    });

  if (depth === 0) {
    // Collect any items that were not placed anywhere in the tree (e.g. disconnected orphan cycles)
    const placedIds = new Set(flattenTree(tree).map((n) => n.id));
    const unvisitedRemaining = items.filter((item) => !placedIds.has(item.id));
    if (unvisitedRemaining.length > 0) {
      const orphanSubtrees = buildTree(unvisitedRemaining, null, 0, placedIds, sortFn);
      tree.push(...orphanSubtrees);
    }

    tree.forEach((root) => computeSubtreeMetrics(root));
  }

  return tree;
}


/**
 * Recursively searches for a node by ID in a WorkItemNode tree.
 */
export function findNodeInTree(nodes: WorkItemNode[], id: string): WorkItemNode | null {
  for (const node of nodes) {
    if (node.id === id) return node;
    if (node.children && node.children.length > 0) {
      const found = findNodeInTree(node.children, id);
      if (found) return found;
    }
  }
  return null;
}

/**
 * Checks if targetId is a descendant of ancestorId to prevent cycles.
 */
export function isDescendantOf(nodes: WorkItemNode[], ancestorId: string, targetId: string): boolean {
  const ancestor = findNodeInTree(nodes, ancestorId);
  if (!ancestor || !ancestor.children) return false;
  
  for (const child of ancestor.children) {
    if (child.id === targetId) return true;
    if (isDescendantOf([child], child.id, targetId)) return true;
  }
  return false;
}

/**
 * Flattens a WorkItemNode tree into a depth-first ordered array.
 */
export function flattenTree(nodes: WorkItemNode[]): WorkItemNode[] {
  const result: WorkItemNode[] = [];
  function traverse(n: WorkItemNode) {
    result.push(n);
    for (const child of n.children || []) {
      traverse(child);
    }
  }
  for (const root of nodes) {
    traverse(root);
  }
  return result;
}

/**
 * Recursively collects all descendant IDs (children, grand-children, etc.) for a given root item ID.
 */
export function getDescendantIds(
  items: Array<{ id: string; parent_id?: string | null; external_ref_id?: string | null }>,
  rootId: string
): string[] {
  if (!items || items.length === 0 || !rootId) return [];

  const rootItem = items.find((it) => it.id === rootId || it.external_ref_id === rootId);
  const rootRef = rootItem?.external_ref_id;

  const childrenMap = new Map<string, string[]>();
  for (const it of items) {
    if (it.parent_id && !isEffectivelyUnparented(it.parent_id) && it.parent_id !== it.id) {
      const list = childrenMap.get(it.parent_id) || [];
      list.push(it.id);
      childrenMap.set(it.parent_id, list);
    }
  }

  const descendants: string[] = [];
  const visited = new Set<string>();
  const queue = [rootId];
  if (rootRef && rootRef !== rootId) {
    queue.push(rootRef);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const children = childrenMap.get(current) || [];
    for (const childId of children) {
      if (!visited.has(childId)) {
        visited.add(childId);
        descendants.push(childId);
        queue.push(childId);
        const childItem = items.find((it) => it.id === childId);
        if (childItem?.external_ref_id) {
          queue.push(childItem.external_ref_id);
        }
      }
    }
  }

  return descendants;
}


