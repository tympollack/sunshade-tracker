import { describe, it, expect } from 'vitest';
import { buildTree, getDescendantIds, isEffectivelyUnparented } from '@/lib/tree';
import { categorizeWorkItemHierarchy } from '@/components/rev_trk_03';
import { WorkItem } from '@/types/tracker';

const mockItem = (overrides: Partial<WorkItem>): WorkItem => ({
  id: 'item-1',
  tenant_id: 'tenant-1',
  project_id: 'proj-1',
  title: 'Test Item',
  item_type: 'story',
  status: 'in_progress',
  order_index: 1000,
  metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe('Tree parentId Matching Fallback for Unparented Orphan Work Items (REV-TRK-03)', () => {
  it('identifies unparented root helper values correctly', () => {
    expect(isEffectivelyUnparented(null)).toBe(true);
    expect(isEffectivelyUnparented(undefined)).toBe(true);
    expect(isEffectivelyUnparented('')).toBe(true);
    expect(isEffectivelyUnparented('   ')).toBe(true);
    expect(isEffectivelyUnparented('null')).toBe(true);
    expect(isEffectivelyUnparented('undefined')).toBe(true);
    expect(isEffectivelyUnparented('none')).toBe(true);
    expect(isEffectivelyUnparented('valid-parent-id')).toBe(false);
  });

  it('safely handles self-referencing items (parent_id === id) by promoting them to root', () => {
    const items: WorkItem[] = [
      mockItem({ id: 'self-1', title: 'Self Referencing Item', parent_id: 'self-1', order_index: 100 }),
    ];

    const tree = buildTree(items);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('self-1');
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children).toHaveLength(0);
  });

  it('safely matches children by parent external_ref_id when parent_id stores ref tag', () => {
    const items: WorkItem[] = [
      mockItem({
        id: 'epic-uuid-001',
        external_ref_id: 'EPIC-100',
        title: 'Core Architecture Epic',
        item_type: 'epic',
        parent_id: null,
        order_index: 100,
      }),
      mockItem({
        id: 'story-uuid-002',
        external_ref_id: 'STORY-200',
        title: 'Ingestion Pipeline',
        item_type: 'story',
        parent_id: 'EPIC-100', // Points to parent's external_ref_id rather than UUID
        order_index: 200,
      }),
    ];

    const tree = buildTree(items);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('epic-uuid-001');
    expect(tree[0].children).toHaveLength(1);
    expect(tree[0].children![0].id).toBe('story-uuid-002');
    expect(tree[0].children![0].depth).toBe(1);

    // Verify getDescendantIds resolves via external_ref_id
    const descendants = getDescendantIds(items, 'epic-uuid-001');
    expect(descendants).toContain('story-uuid-002');
  });

  it('handles isolated cyclic references alongside normal root hierarchies without dropping items', () => {
    const items: WorkItem[] = [
      // Normal hierarchy
      mockItem({ id: 'root-epic', title: 'Normal Epic', parent_id: null, order_index: 10 }),
      mockItem({ id: 'story-child', title: 'Normal Story', parent_id: 'root-epic', order_index: 20 }),

      // Cyclic orphan pair: neither has null parent_id
      mockItem({ id: 'cycle-a', title: 'Cycle Node A', parent_id: 'cycle-b', order_index: 30 }),
      mockItem({ id: 'cycle-b', title: 'Cycle Node B', parent_id: 'cycle-a', order_index: 40 }),
    ];

    const tree = buildTree(items);

    // Both the normal root epic and the recovered cycle root must be present
    expect(tree.length).toBeGreaterThanOrEqual(2);

    const epicNode = tree.find((n) => n.id === 'root-epic');
    expect(epicNode).toBeDefined();
    expect(epicNode?.children).toHaveLength(1);
    expect(epicNode?.children![0].id).toBe('story-child');

    // Verify all 4 items are in the tree structure
    const allTreeIds = new Set<string>();
    function collect(nodes: typeof tree) {
      for (const n of nodes) {
        allTreeIds.add(n.id);
        if (n.children) collect(n.children);
      }
    }
    collect(tree);

    expect(allTreeIds.has('root-epic')).toBe(true);
    expect(allTreeIds.has('story-child')).toBe(true);
    expect(allTreeIds.has('cycle-a')).toBe(true);
    expect(allTreeIds.has('cycle-b')).toBe(true);
  });

  it('categorizes work items cleanly with categorizeWorkItemHierarchy', () => {
    const items: WorkItem[] = [
      mockItem({ id: 'root-1', parent_id: null }),
      mockItem({ id: 'child-1', parent_id: 'root-1' }),
      mockItem({ id: 'orphan-1', parent_id: 'non-existent-id' }),
      mockItem({ id: 'self-1', parent_id: 'self-1' }),
    ];

    const result = categorizeWorkItemHierarchy(items);
    expect(result.roots).toHaveLength(1);
    expect(result.roots[0].id).toBe('root-1');

    expect(result.children).toHaveLength(1);
    expect(result.children[0].id).toBe('child-1');

    expect(result.orphans).toHaveLength(1);
    expect(result.orphans[0].id).toBe('orphan-1');

    expect(result.selfReferencing).toHaveLength(1);
    expect(result.selfReferencing[0].id).toBe('self-1');
  });
});
