import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { buildTree } from '@/lib/tree';
import { TreeNode } from '@/components/TreeNode';
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

describe('buildTree recursive tree builder', () => {
  it('returns empty array when given empty items', () => {
    expect(buildTree([])).toEqual([]);
  });

  it('builds flat root items with depth 0', () => {
    const items: WorkItem[] = [
      mockItem({ id: 'item-1', title: 'Root 1', order_index: 1000 }),
      mockItem({ id: 'item-2', title: 'Root 2', order_index: 2000 }),
    ];

    const tree = buildTree(items);
    expect(tree).toHaveLength(2);
    expect(tree[0].id).toBe('item-1');
    expect(tree[0].depth).toBe(0);
    expect(tree[0].children).toHaveLength(0);
    expect(tree[1].id).toBe('item-2');
    expect(tree[1].depth).toBe(0);
  });

  it('correctly nests children with depth and order_index sorting', () => {
    const items: WorkItem[] = [
      mockItem({ id: 'root-1', title: 'Epic', item_type: 'epic', parent_id: null, order_index: 1000 }),
      mockItem({ id: 'child-2', title: 'Task B', item_type: 'task', parent_id: 'child-1', order_index: 2000 }),
      mockItem({ id: 'child-1', title: 'Story 1', item_type: 'story', parent_id: 'root-1', order_index: 1500 }),
      mockItem({ id: 'child-3', title: 'Task A', item_type: 'task', parent_id: 'child-1', order_index: 1000 }),
      mockItem({ id: 'child-4', title: 'Story 2', item_type: 'story', parent_id: 'root-1', order_index: 3000 }),
    ];

    const tree = buildTree(items);
    expect(tree).toHaveLength(1);

    // Root Epic
    const epic = tree[0];
    expect(epic.id).toBe('root-1');
    expect(epic.depth).toBe(0);
    expect(epic.children).toHaveLength(2);

    // Epic children sorted by order_index (Story 1: 1500, Story 2: 3000)
    const [story1, story2] = epic.children!;
    expect(story1.id).toBe('child-1');
    expect(story1.depth).toBe(1);
    expect(story2.id).toBe('child-4');
    expect(story2.depth).toBe(1);

    // Story 1 children sorted by order_index (Task A: 1000, Task B: 2000)
    expect(story1.children).toHaveLength(2);
    expect(story1.children![0].id).toBe('child-3');
    expect(story1.children![0].depth).toBe(2);
    expect(story1.children![1].id).toBe('child-2');
    expect(story1.children![1].depth).toBe(2);
  });

  it('safely handles orphaned items with non-existent parent_id at root level', () => {
    const items: WorkItem[] = [
      mockItem({ id: 'orphan-1', title: 'Orphan Item', parent_id: 'missing-parent', order_index: 1000 }),
    ];

    const tree = buildTree(items);
    expect(tree).toHaveLength(1);
    expect(tree[0].id).toBe('orphan-1');
    expect(tree[0].depth).toBe(0);
  });

  it('prevents infinite recursion on circular parent-child references', () => {
    const items: WorkItem[] = [
      mockItem({ id: 'item-a', title: 'Item A', parent_id: 'item-b', order_index: 1000 }),
      mockItem({ id: 'item-b', title: 'Item B', parent_id: 'item-a', order_index: 2000 }),
    ];

    // Neither has parent_id: null, but orphan check or cycle guard handles it gracefully
    const tree = buildTree(items);
    expect(tree.length).toBeGreaterThan(0);
  });
});

describe('TreeNode component', () => {
  it('renders root item without branch connector and with 0px margin', () => {
    const rootNode = {
      ...mockItem({ id: 'root-1', title: 'Root Feature', external_ref_id: 'FEAT-100', item_type: 'epic', status: 'planned' }),
      depth: 0,
      children: [],
    };

    const { container } = render(<TreeNode item={rootNode} />);

    expect(screen.getByText('Root Feature')).toBeInTheDocument();
    expect(screen.getByText('epic')).toBeInTheDocument();
    expect(screen.getByText('[FEAT-100]')).toBeInTheDocument();
    expect(screen.getByText('planned')).toBeInTheDocument();

    // No connector at depth 0
    expect(screen.queryByTestId('branch-connector')).not.toBeInTheDocument();

    const row = container.querySelector('.flex.items-center.gap-3');
    expect(row).toHaveStyle({ marginLeft: '0px' });
  });

  it('renders child item with branch connector and dynamic margin-left based on depth', () => {
    const childNode = {
      ...mockItem({ id: 'child-1', title: 'Nested Task', item_type: 'task', status: 'in_progress' }),
      depth: 2,
      children: [],
    };

    const { container } = render(<TreeNode item={childNode} />);

    expect(screen.getByText('Nested Task')).toBeInTheDocument();

    // Branch connector rendered for depth > 0
    expect(screen.getByTestId('branch-connector')).toBeInTheDocument();

    // Margin is depth * 28px = 56px
    const row = container.querySelector('.flex.items-center.gap-3');
    expect(row).toHaveStyle({ marginLeft: '56px' });
  });

  it('recursively renders children nodes', () => {
    const treeData = {
      ...mockItem({ id: 'root-1', title: 'Root Parent', item_type: 'story' }),
      depth: 0,
      children: [
        {
          ...mockItem({ id: 'child-1', title: 'First Child', item_type: 'task' }),
          depth: 1,
          children: [
            {
              ...mockItem({ id: 'grandchild-1', title: 'Grandchild Item', item_type: 'subtask' }),
              depth: 2,
              children: [],
            },
          ],
        },
      ],
    };

    render(<TreeNode item={treeData} />);

    expect(screen.getByText('Root Parent')).toBeInTheDocument();
    expect(screen.getByText('First Child')).toBeInTheDocument();
    expect(screen.getByText('Grandchild Item')).toBeInTheDocument();

    const connectors = screen.getAllByTestId('branch-connector');
    expect(connectors).toHaveLength(2); // depth 1 and depth 2
  });

  it('applies custom status color when getStatusColor is passed', () => {
    const node = {
      ...mockItem({ id: 'item-1', title: 'Status Color Test', status: 'complete' }),
      depth: 0,
      children: [],
    };

    render(<TreeNode item={node} getStatusColor={() => '#22c55e'} />);

    const statusBadge = screen.getByText('complete');
    expect(statusBadge).toHaveStyle({ color: '#22c55e' });
  });
});
