/**
 * Predicate & Condition Evaluator for Transition Guards and Automation Rules
 */

export interface ConditionPredicate {
  field: string;
  operator: string;
  value?: any;
  message?: string;
}

/**
 * Checks whether a value is considered blank/empty (null, undefined, whitespace-only string, or empty array).
 */
export function isBlankValue(value: any): boolean {
  if (value === null || value === undefined) return true;
  if (typeof value === 'string') return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Traverses an object using a dot-separated path.
 */
function getByDotPath(obj: Record<string, any> | null | undefined, path: string): any {
  if (!obj || typeof obj !== 'object' || !path) return undefined;
  const parts = path.split('.');
  let current: any = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

/**
 * Resolves a field path against a work item.
 * Supports:
 * - "metadata.pr_url"
 * - "item.metadata.pr_url"
 * - "pr_url" (falls back to item.metadata.pr_url if not on top-level item)
 * - "assignee", "status", "item_type", etc.
 */
export function resolveFieldValue(
  item: Record<string, any> | null | undefined,
  fieldPath: string
): any {
  if (!item || typeof item !== 'object' || !fieldPath || typeof fieldPath !== 'string') {
    return undefined;
  }

  let normalizedPath = fieldPath.trim();
  if (normalizedPath.startsWith('item.')) {
    normalizedPath = normalizedPath.slice(5);
  }

  if (normalizedPath.includes('.')) {
    const directVal = getByDotPath(item, normalizedPath);
    if (directVal !== undefined) return directVal;

    if (!normalizedPath.startsWith('metadata.') && item.metadata && typeof item.metadata === 'object') {
      return getByDotPath(item.metadata, normalizedPath);
    }
    return undefined;
  }

  if (normalizedPath in item && item[normalizedPath] !== undefined) {
    return item[normalizedPath];
  }

  if (item.metadata && typeof item.metadata === 'object' && normalizedPath in item.metadata) {
    return item.metadata[normalizedPath];
  }

  return undefined;
}

function isConditionObject(val: any): val is ConditionPredicate {
  return Boolean(
    val &&
      typeof val === 'object' &&
      typeof val.field === 'string' &&
      typeof val.operator === 'string'
  );
}

/**
 * Evaluates a single condition predicate against a work item.
 * Supports both `matchesCondition(item, condition)` and `matchesCondition(condition, item)`.
 */
export function matchesCondition(
  itemOrCondition: Record<string, any> | ConditionPredicate | null | undefined,
  conditionOrItem: ConditionPredicate | Record<string, any> | null | undefined
): boolean {
  let item: Record<string, any> | null | undefined;
  let condition: ConditionPredicate | null | undefined;

  if (isConditionObject(itemOrCondition) && !isConditionObject(conditionOrItem)) {
    condition = itemOrCondition;
    item = conditionOrItem as Record<string, any>;
  } else {
    item = itemOrCondition as Record<string, any>;
    condition = conditionOrItem as ConditionPredicate;
  }

  if (!condition || typeof condition.field !== 'string') {
    return true;
  }
  if (!item || typeof item !== 'object') {
    return false;
  }

  const actual = resolveFieldValue(item, condition.field);
  const expected = condition.value;
  const op = (condition.operator || '$eq').trim().toLowerCase();

  switch (op) {
    case '$is_not_null':
    case 'is_not_null':
    case '$not_null':
    case 'not_null':
    case '$not_empty':
    case 'not_empty':
    case 'is_not_empty':
    case 'required':
    case '$exists':
    case 'exists': {
      if (expected === false) {
        return isBlankValue(actual);
      }
      return !isBlankValue(actual);
    }

    case '$is_null':
    case 'is_null':
    case '$null':
    case 'null':
    case '$empty':
    case 'empty':
    case 'is_empty':
    case '$not_exists':
    case 'not_exists': {
      if (expected === false) {
        return !isBlankValue(actual);
      }
      return isBlankValue(actual);
    }

    case '$eq':
    case 'eq':
    case 'equals':
    case '==':
    case '===': {
      if (actual === expected) return true;
      if (
        actual !== null &&
        actual !== undefined &&
        expected !== null &&
        expected !== undefined &&
        (typeof actual === 'number' || typeof expected === 'number') &&
        typeof actual !== 'boolean' &&
        typeof expected !== 'boolean' &&
        String(actual).trim() !== '' &&
        String(expected).trim() !== ''
      ) {
        return Number(actual) === Number(expected);
      }
      return false;
    }

    case '$ne':
    case 'ne':
    case 'not_equals':
    case '!=':
    case '!==': {
      return actual !== expected;
    }

    case '$gt':
    case 'gt':
    case '>': {
      if (isBlankValue(actual) || isBlankValue(expected)) return false;
      const numActual = Number(actual);
      const numExpected = Number(expected);
      if (Number.isNaN(numActual) || Number.isNaN(numExpected)) return false;
      return numActual > numExpected;
    }

    case '$gte':
    case 'gte':
    case '>=': {
      if (isBlankValue(actual) || isBlankValue(expected)) return false;
      const numActual = Number(actual);
      const numExpected = Number(expected);
      if (Number.isNaN(numActual) || Number.isNaN(numExpected)) return false;
      return numActual >= numExpected;
    }

    case '$lt':
    case 'lt':
    case '<': {
      if (isBlankValue(actual) || isBlankValue(expected)) return false;
      const numActual = Number(actual);
      const numExpected = Number(expected);
      if (Number.isNaN(numActual) || Number.isNaN(numExpected)) return false;
      return numActual < numExpected;
    }

    case '$lte':
    case 'lte':
    case '<=': {
      if (isBlankValue(actual) || isBlankValue(expected)) return false;
      const numActual = Number(actual);
      const numExpected = Number(expected);
      if (Number.isNaN(numActual) || Number.isNaN(numExpected)) return false;
      return numActual <= numExpected;
    }

    case '$in':
    case 'in': {
      const list = Array.isArray(expected)
        ? expected
        : typeof expected === 'string'
        ? expected.split(',').map((s) => s.trim())
        : [];
      if (Array.isArray(actual)) {
        return actual.some((itemVal) => list.includes(itemVal));
      }
      return list.includes(actual);
    }

    case '$nin':
    case 'nin':
    case 'not_in':
    case '$not_in': {
      const list = Array.isArray(expected)
        ? expected
        : typeof expected === 'string'
        ? expected.split(',').map((s) => s.trim())
        : [];
      if (Array.isArray(actual)) {
        return !actual.some((itemVal) => list.includes(itemVal));
      }
      return !list.includes(actual);
    }

    case '$contains':
    case 'contains':
    case '$includes':
    case 'includes': {
      if (typeof actual === 'string') {
        return actual.includes(String(expected ?? ''));
      }
      if (Array.isArray(actual)) {
        return actual.includes(expected);
      }
      return false;
    }

    case '$regex':
    case 'regex':
    case 'matches':
    case '$match':
    case 'pattern': {
      if (isBlankValue(actual) || expected === null || expected === undefined) return false;
      try {
        const regex = expected instanceof RegExp ? expected : new RegExp(String(expected));
        return regex.test(String(actual));
      } catch {
        return false;
      }
    }

    default:
      return actual === expected;
  }
}
