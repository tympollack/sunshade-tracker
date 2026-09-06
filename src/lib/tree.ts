import { WorkItem, WorkItemNode } from '@/types/tracker';

export type { WorkItemNode };

/**
 * Transforms flat WorkItem array into a recursive tree structure with depth indicators.
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

  return matched
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
}
