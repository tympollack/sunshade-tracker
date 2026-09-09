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
  visited = new Set<string>()
): WorkItemNode[] {
  let matched = items.filter((item) => {
    if (visited.has(item.id)) return false;
    if (parentId === null) {
      // Root items: parent_id is null/undefined or points to an ID not in items
      return !item.parent_id || !items.some((p) => p.id === item.parent_id);
    }
    return item.parent_id === parentId;
  });

  // Fallback: If at root level no root nodes were found but unvisited items exist
  // (e.g. mutually cyclic references with no null parent), treat the lowest order items as root
  if (parentId === null && matched.length === 0 && items.length > 0) {
    matched = items.filter((item) => !visited.has(item.id));
  }

  const tree = matched
    .sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))
    .map((item) => {
      const nextVisited = new Set(visited);
      nextVisited.add(item.id);
      return {
        ...item,
        depth,
        children: buildTree(items, item.id, depth + 1, nextVisited),
      };
    });

  if (depth === 0) {
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
