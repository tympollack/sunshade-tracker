import { describe, it, expect } from 'vitest';
import { calculateOrderIndex, validateHierarchyNesting, DEFAULT_ORDER_STEP } from '@/lib/fractional-index';

describe('Fractional Indexing & Ordering Math', () => {
  it('should return default order step for an empty list', () => {
    const index = calculateOrderIndex(null, null);
    expect(index).toBe(DEFAULT_ORDER_STEP);
  });

  it('should calculate exact midpoint between two order indexes', () => {
    const prev = 1000.0;
    const next = 2000.0;
    const mid = calculateOrderIndex(prev, next);
    expect(mid).toBe(1500.0);
  });

  it('should handle dense fractional midpoint insertions', () => {
    const item1 = 1000.0;
    const item2 = 1500.0;
    const mid1 = calculateOrderIndex(item1, item2);
    expect(mid1).toBe(1250.0);

    const mid2 = calculateOrderIndex(item1, mid1);
    expect(mid2).toBe(1125.0);
  });

  it('should calculate position before the first item', () => {
    const next = 1000.0;
    const index = calculateOrderIndex(null, next);
    expect(index).toBe(500.0);
  });

  it('should handle negative next order index when prepending', () => {
    const next = -500.0;
    const index = calculateOrderIndex(null, next);
    expect(index).toBe(-1500.0);
  });

  it('should calculate position after the last item', () => {
    const prev = 3000.0;
    const index = calculateOrderIndex(prev, null);
    expect(index).toBe(4000.0);
  });
});

describe('Dynamic Hierarchy Nesting Validation', () => {
  const sampleHierarchy = [
    { type: 'project', label: 'Project', level: 1, allowed_parents: [] },
    { type: 'epic', label: 'Epic', level: 2, allowed_parents: ['project'] },
    { type: 'story', label: 'Story', level: 3, allowed_parents: ['epic'] },
    { type: 'task', label: 'Task', level: 4, allowed_parents: ['story', 'epic'] },
  ];

  it('should allow valid parent-child nesting according to schema', () => {
    expect(validateHierarchyNesting('epic', 'story', sampleHierarchy)).toEqual({ valid: true });
    expect(validateHierarchyNesting('story', 'task', sampleHierarchy)).toEqual({ valid: true });
    expect(validateHierarchyNesting('epic', 'task', sampleHierarchy)).toEqual({ valid: true });
    expect(validateHierarchyNesting('project', 'epic', sampleHierarchy)).toEqual({ valid: true });
  });

  it('should reject invalid parent-child nesting violating schema', () => {
    const invalidStoryUnderTask = validateHierarchyNesting('task', 'story', sampleHierarchy);
    expect(invalidStoryUnderTask.valid).toBe(false);
    expect(invalidStoryUnderTask.message).toContain("cannot be nested under parent of type 'task'");

    const invalidEpicUnderTask = validateHierarchyNesting('task', 'epic', sampleHierarchy);
    expect(invalidEpicUnderTask.valid).toBe(false);
  });

  it('should reject unknown item types', () => {
    const unknown = validateHierarchyNesting('epic', 'non_existent_type', sampleHierarchy);
    expect(unknown.valid).toBe(false);
    expect(unknown.message).toContain("Unknown item type 'non_existent_type'");
  });

  it('should allow root items when no parent is specified', () => {
    expect(validateHierarchyNesting(null, 'epic', sampleHierarchy)).toEqual({ valid: true });
    expect(validateHierarchyNesting(null, 'project', sampleHierarchy)).toEqual({ valid: true });
  });
});
