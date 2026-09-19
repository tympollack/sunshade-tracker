import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TreeNode } from '@/components/TreeNode';
import { DualPointBadge } from '@/components/DualPointBadge';
import { WorkItemNode, HierarchyLevel, StatusDefinition } from '@/types/tracker';

const mockStatuses: StatusDefinition[] = [
  { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
  { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
  { id: 'complete', label: 'Complete', color: '#22c55e', order: 3 },
];

const mockHierarchy: HierarchyLevel[] = [
  { type: 'epic', label: 'Epic', level: 1, allowed_parents: [], color: '#38bdf8' },
  { type: 'story', label: 'Story', level: 2, allowed_parents: ['epic'], color: '#34d399' },
  { type: 'task', label: 'Task', level: 3, allowed_parents: ['story'], color: '#fbbf24' },
];

describe('FEAT-TRK-HIERARCHY-ROW-DECLUTTER - Hierarchy tree row declutter & single rollup point pill', () => {
  it('displays ONLY single rolled-up sum pill in granular mode for items with children and surfaces intrinsic estimate via hover tooltip', () => {
    const parentItem: WorkItemNode = {
      id: 'parent-1',
      tenant_id: 't-1',
      project_id: 'p-1',
      title: 'Authentication Epic',
      external_ref_id: 'AUTH-100',
      item_type: 'epic',
      status: 'in_progress',
      order_index: 1000,
      metadata: { story_points: 8 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      descendantCount: 4,
      rollupPoints: 13,
      depth: 0,
      children: [
        {
          id: 'child-1',
          tenant_id: 't-1',
          project_id: 'p-1',
          title: 'Login UI',
          external_ref_id: 'AUTH-101',
          item_type: 'task',
          status: 'complete',
          order_index: 2000,
          metadata: { story_points: 5 },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          descendantCount: 0,
          rollupPoints: 5,
          depth: 1,
          children: [],
        },
      ],
    };

    render(
      <TreeNode
        item={parentItem}
        pointMode="granular"
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
      />
    );

    // Rollup pill is displayed for parent
    const [rollupBadge, childBadge] = screen.getAllByTestId('dual-point-badge');
    expect(rollupBadge).toBeInTheDocument();
    expect(rollupBadge).toHaveTextContent('Σ 13 pts');

    // Child leaf item displays 5 pts
    expect(childBadge).toBeInTheDocument();
    expect(childBadge).toHaveTextContent('5 pts');

    // Intrinsic pill "Est: 8" is hidden from default view to declutter row
    expect(screen.queryByTestId('dual-point-badge-intrinsic')).toBeNull();

    // Tooltip surfaces intrinsic estimate on hover
    expect(rollupBadge).toHaveAttribute('title', 'Intrinsic Estimate: 8 pts');
  });

  it('renders a single compact pill for leaf items (child_count === 0)', () => {
    const leafItem: WorkItemNode = {
      id: 'leaf-1',
      tenant_id: 't-1',
      project_id: 'p-1',
      title: 'Single Task',
      external_ref_id: 'TASK-1',
      item_type: 'task',
      status: 'not_started',
      order_index: 3000,
      metadata: { story_points: 5 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      descendantCount: 0,
      rollupPoints: 0,
      depth: 1,
      children: [],
    };

    render(
      <TreeNode
        item={leafItem}
        pointMode="granular"
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
      />
    );

    const leafBadge = screen.getByTestId('dual-point-badge');
    expect(leafBadge).toHaveTextContent('5 pts');
    expect(leafBadge).not.toHaveTextContent('Σ');
    expect(leafBadge).not.toHaveTextContent('Est:');
  });

  it('converts subtask count badge into a discreet counter and de-emphasizes external ref ID', () => {
    const item: WorkItemNode = {
      id: 'epic-1',
      tenant_id: 't-1',
      project_id: 'p-1',
      title: 'Checkout Flow Redesign',
      external_ref_id: 'CHK-99',
      item_type: 'epic',
      status: 'in_progress',
      order_index: 1000,
      metadata: { story_points: 10 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      descendantCount: 6,
      rollupPoints: 21,
      depth: 0,
      children: [],
    };

    render(
      <TreeNode
        item={item}
        pointMode="granular"
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
      />
    );

    // Discreet counter formatted as (count) with slate-400 font-mono
    const subtaskBadge = screen.getByTestId('tree-node-subtasks-badge');
    expect(subtaskBadge).toHaveTextContent('(6)');
    expect(subtaskBadge).toHaveClass('text-slate-400 text-xs font-mono');
    expect(subtaskBadge).not.toHaveClass('bg-sky-950/70');

    // External ref ID rendered with muted text-slate-500 font-mono
    const refBadge = screen.getByTestId('copyable-ref-id-CHK-99');
    expect(refBadge).toHaveClass('text-slate-500');
  });

  it('maintains clean two-zone alignment with truncate on title and non-wrapping right zone', () => {
    const item: WorkItemNode = {
      id: 'node-align',
      tenant_id: 't-1',
      project_id: 'p-1',
      title: 'A very long work item title that needs proper truncation without pushing badges off row',
      external_ref_id: 'LONG-1',
      item_type: 'story',
      status: 'in_progress',
      order_index: 1000,
      metadata: { story_points: 3 },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      descendantCount: 2,
      rollupPoints: 8,
      depth: 0,
      children: [],
    };

    render(
      <TreeNode
        item={item}
        pointMode="granular"
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
      />
    );

    // Left zone has min-w-0 flex-1 overflow-hidden
    const leftZone = screen.getByTestId('tree-node-left-zone-node-align');
    expect(leftZone).toHaveClass('flex items-center gap-2 min-w-0 flex-1 overflow-hidden');

    // Right zone has shrink-0 ml-auto
    const rightZone = screen.getByTestId('tree-node-right-zone-node-align');
    expect(rightZone).toHaveClass('flex items-center gap-3 shrink-0 ml-auto');

    // Title has truncate min-w-0 flex-1
    const title = screen.getByText('A very long work item title that needs proper truncation without pushing badges off row');
    expect(title).toHaveClass('truncate min-w-0 flex-1');
  });
});
