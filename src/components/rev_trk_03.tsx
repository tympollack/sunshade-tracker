'use client';

import { WorkItem, WorkItemNode } from '@/types/tracker';
import {
  buildTree,
  findNodeInTree,
  isDescendantOf,
  flattenTree,
  getDescendantIds,
  isEffectivelyUnparented,
} from '@/lib/tree';

export {
  buildTree,
  findNodeInTree,
  isDescendantOf,
  flattenTree,
  getDescendantIds,
  isEffectivelyUnparented,
};

/**
 * Diagnostic utility to categorize and resolve orphan work items (REV-TRK-03).
 *
 * Identifies work items with non-existent parents, self-referential parent IDs,
 * or cyclic references that would otherwise be excluded from standard tree traversals.
 */
export function categorizeWorkItemHierarchy(items: WorkItem[]): {
  roots: WorkItem[];
  children: WorkItem[];
  orphans: WorkItem[];
  selfReferencing: WorkItem[];
} {
  const itemMap = new Map<string, WorkItem>();
  for (const it of items) {
    itemMap.set(it.id, it);
    if (it.external_ref_id) {
      itemMap.set(it.external_ref_id, it);
    }
  }

  const roots: WorkItem[] = [];
  const children: WorkItem[] = [];
  const orphans: WorkItem[] = [];
  const selfReferencing: WorkItem[] = [];

  for (const it of items) {
    if (isEffectivelyUnparented(it.parent_id)) {
      roots.push(it);
    } else if (it.parent_id === it.id) {
      selfReferencing.push(it);
    } else if (!itemMap.has(it.parent_id!)) {
      orphans.push(it);
    } else {
      children.push(it);
    }
  }

  return {
    roots,
    children,
    orphans,
    selfReferencing,
  };
}
