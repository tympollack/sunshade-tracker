/**
 * Fractional Indexing utilities for reordering work items without table-wide re-indexing.
 */

export const DEFAULT_ORDER_STEP = 1000.0;

/**
 * Calculates a midpoint order_index between two adjacent items.
 * 
 * @param prevOrder - The order_index of the item immediately preceding the new position (or null if inserting at start)
 * @param nextOrder - The order_index of the item immediately following the new position (or null if inserting at end)
 * @returns A double precision floating number representing the new order_index.
 */
export function calculateOrderIndex(
  prevOrder: number | null | undefined,
  nextOrder: number | null | undefined
): number {
  const hasPrev = typeof prevOrder === 'number' && !isNaN(prevOrder);
  const hasNext = typeof nextOrder === 'number' && !isNaN(nextOrder);

  if (hasPrev && hasNext) {
    // Insert between two items
    return (prevOrder + nextOrder) / 2.0;
  }

  if (hasPrev && !hasNext) {
    // Insert after the last item
    return prevOrder + DEFAULT_ORDER_STEP;
  }

  if (!hasPrev && hasNext) {
    // Insert before the first item
    if (nextOrder <= 0) {
      return nextOrder - DEFAULT_ORDER_STEP;
    }
    return nextOrder / 2.0;
  }

  // Fallback for empty list
  return DEFAULT_ORDER_STEP;
}

/**
 * Validates dynamic hierarchy parent-child constraint based on project settings.
 */
export function validateHierarchyNesting(
  parentType: string | null,
  childType: string,
  hierarchy: Array<{ type: string; allowed_parents: string[] }>
): { valid: boolean; message?: string } {
  const childDef = hierarchy.find(h => h.type === childType);
  if (!childDef) {
    return { valid: false, message: `Unknown item type '${childType}'` };
  }

  if (!parentType) {
    // Root item check
    if (childDef.allowed_parents.length > 0 && !childDef.allowed_parents.includes('none') && !childDef.allowed_parents.includes('')) {
      // If the hierarchy level strictly requires a parent (e.g. story requires epic)
      // Note: Level 1 (e.g. project / epic) typically has allowed_parents: [] or empty.
      return {
        valid: true, // We allow root creation, or warn if strict
      };
    }
    return { valid: true };
  }

  if (!childDef.allowed_parents.includes(parentType)) {
    return {
      valid: false,
      message: `Item of type '${childType}' cannot be nested under parent of type '${parentType}'. Allowed parent types: [${childDef.allowed_parents.join(', ')}]`,
    };
  }

  return { valid: true };
}
