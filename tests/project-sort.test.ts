import { describe, it, expect } from 'vitest';
import { createItemComparator, isProjectSort, isValidSortValue } from '@/lib/utils/sortUtils';
import { buildTree } from '@/lib/tree';
import { WorkItem } from '@/types/tracker';

const projects = [
  { id: 'p-z', name: 'Zeta' },
  { id: 'p-a', name: 'Alpha' },
];

const mk = (id: string, project_id: string, order_index: number, parent_id: string | null = null): WorkItem =>
  ({ id, project_id, order_index, parent_id, title: id, item_type: 'story', status: 'unplanned', metadata: {} }) as unknown as WorkItem;

describe('project sorting (STORY-TRK-WORKSPACE-SORT-PROJECT)', () => {
  const items = [mk('z1', 'p-z', 1), mk('a2', 'p-a', 2), mk('z3', 'p-z', 3), mk('a1', 'p-a', 1)];

  it('clusters A to Z by project then order_index', () => {
    const sorted = [...items].sort(createItemComparator('project_asc', projects));
    expect(sorted.map((i) => i.id)).toEqual(['a1', 'a2', 'z1', 'z3']);
  });

  it('clusters Z to A by project, keeping order_index ascending inside', () => {
    const sorted = [...items].sort(createItemComparator('project_desc', projects));
    expect(sorted.map((i) => i.id)).toEqual(['z1', 'z3', 'a1', 'a2']);
  });

  it('sorts hierarchy roots by project while preserving nested children', () => {
    const tree = buildTree(
      [mk('zr', 'p-z', 1), mk('zc', 'p-z', 2, 'zr'), mk('ar', 'p-a', 5), mk('ac', 'p-a', 6, 'ar')],
      null,
      0,
      new Set(),
      createItemComparator('project_asc', projects)
    );
    expect(tree.map((n) => n.id)).toEqual(['ar', 'zr']);
    expect(tree[0]!.children!.map((c) => c.id)).toEqual(['ac']);
  });

  it('manual order restores order_index', () => {
    const sorted = [...items].sort(createItemComparator('order_index', projects));
    expect(sorted.map((i) => i.order_index)).toEqual([1, 1, 2, 3]);
  });

  it('validates sort values', () => {
    expect(isProjectSort('project_asc')).toBe(true);
    expect(isProjectSort('title_asc')).toBe(false);
    expect(isValidSortValue('project_desc')).toBe(true);
    expect(isValidSortValue('bogus')).toBe(false);
  });
});
