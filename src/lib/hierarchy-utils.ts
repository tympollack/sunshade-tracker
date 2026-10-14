import {
  WorkItem,
  WorkItemNode,
  ProjectSettings,
  WorkMetricConfig,
  getWorkMetricConfig,
} from '@/types/tracker';
import { getItemWorkMetric } from '@/lib/sprint-utils';

export { getItemWorkMetric };

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
 * Computes recursive leaf rollup points for a WorkItemNode or item hierarchy
 * using the project's configured work metric field.
 */
export function calculateHierarchyRollupPoints(
  node: WorkItemNode,
  metricKeyOrSettings?: string | ProjectSettings | null
): { descendantCount: number; rollupPoints: number } {
  const ownPoints = getItemWorkMetric(node, metricKeyOrSettings);
  let descendantCount = 0;
  let childRollupSum = 0;
  const children = node.children || [];

  for (const child of children) {
    descendantCount += 1;
    const childMetrics = calculateHierarchyRollupPoints(child, metricKeyOrSettings);
    descendantCount += childMetrics.descendantCount;
    childRollupSum += childMetrics.rollupPoints;
  }

  // Leaf rollup mode: strictly sums leaf nodes without adding parent item's intrinsic points when children exist.
  const totalPoints = children.length > 0 ? childRollupSum : ownPoints;
  node.descendantCount = descendantCount;
  node.rollupPoints = totalPoints;
  return { descendantCount, rollupPoints: totalPoints };
}

/**
 * Extracts all leaf execution work items (items that have no children within the items list).
 */
export function getHierarchyLeafItems(items: WorkItem[]): WorkItem[] {
  if (!items || items.length === 0) return [];
  const parentIds = new Set<string>();
  for (const item of items) {
    if (item.parent_id && !isEffectivelyUnparented(item.parent_id) && item.parent_id !== item.id) {
      parentIds.add(item.parent_id);
    }
  }
  return items.filter((item) => {
    if (parentIds.has(item.id)) return false;
    if (item.external_ref_id && parentIds.has(item.external_ref_id)) return false;
    return true;
  });
}

/**
 * Aggregates total leaf work points across a list of items using dynamic work metric.
 */
export function calculateHierarchyLeafPoints(
  items: WorkItem[],
  metricKeyOrSettings?: string | ProjectSettings | null
): number {
  const leaves = getHierarchyLeafItems(items);
  return leaves.reduce((acc, it) => acc + getItemWorkMetric(it, metricKeyOrSettings), 0);
}

/**
 * Extracts root-level items in the hierarchy scope.
 */
export function getHierarchyRootItems(items: WorkItem[]): WorkItem[] {
  if (!items || items.length === 0) return [];
  const itemIdSet = new Set<string>();
  for (const item of items) {
    itemIdSet.add(item.id);
    if (item.external_ref_id) {
      itemIdSet.add(item.external_ref_id);
    }
  }
  return items.filter((item) => {
    if (isEffectivelyUnparented(item.parent_id) || item.parent_id === item.id) {
      return true;
    }
    return !itemIdSet.has(item.parent_id!);
  });
}

/**
 * Aggregates macro capacity across root items in a hierarchy using dynamic work metric.
 */
export function calculateHierarchyMacroPoints(
  items: WorkItem[],
  metricKeyOrSettings?: string | ProjectSettings | null
): number {
  const roots = getHierarchyRootItems(items);
  return roots.reduce((acc, it) => acc + getItemWorkMetric(it, metricKeyOrSettings), 0);
}

/**
 * Formats a numeric work amount with the project's configured work unit label (e.g. "5 pts" or "12 credits").
 */
export function formatWorkMetric(
  amount: number,
  settings?: ProjectSettings | null
): string {
  const config = getWorkMetricConfig(settings);
  const unit = config.unit_label || 'pts';
  return `${amount} ${unit}`;
}
