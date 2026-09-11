import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import { TreeNode, INDENT_STEP, sanitizeTitle, getLevelBadgeClasses } from '@/components/TreeNode';
import { BulkActionsToolbar } from '@/components/BulkActionsToolbar';
import { SprintItemRow } from '@/components/SprintItemRow';
import { WorkItem, WorkItemNode } from '@/types/tracker';
import { getDescendantIds } from '@/lib/tree';

const mockItem = (overrides: Partial<WorkItem>): WorkItem => ({
  id: 'item-1',
  tenant_id: 'tenant-1',
  project_id: 'proj-1',
  title: 'Test Item',
  item_type: 'story',
  status: 'not_started',
  order_index: 1000,
  metadata: {},
  created_at: new Date().toISOString(),
  updated_at: new Date().toISOString(),
  ...overrides,
});

describe('TASK-TRK-TITLE-TRUNCATION - Single-line text boundaries and badge wrap prevention', () => {
  it('sanitizes escaped markdown sequences in work item titles', () => {
    expect(sanitizeTitle('Fix \\[(dashboard)\\]/\\[tenantSlug\\] path rendering')).toBe(
      'Fix [(dashboard)]/[tenantSlug] path rendering'
    );
    expect(sanitizeTitle('Handle \\*bold\\* and \\_escapes\\_')).toBe(
      'Handle *bold* and _escapes_'
    );
    expect(sanitizeTitle('')).toBe('');
  });

  it('renders title with tooltip title attribute, min-w-0, and truncate boundaries', () => {
    const item: WorkItemNode = {
      ...mockItem({
        id: 'title-node',
        title: 'Very long title representing \\[(dashboard)\\]/\\[tenantSlug\\]/\\[projectSlug\\]/page.tsx',
        external_ref_id: 'TRK-101',
        item_type: 'task',
      }),
      descendantCount: 3,
      rollupPoints: 8,
      depth: 0,
      children: [],
    };

    render(<TreeNode item={item} />);

    // Title element rendered with sanitized title and native title attribute for tooltips
    const titleEl = screen.getByText('Very long title representing [(dashboard)]/[tenantSlug]/[projectSlug]/page.tsx');
    expect(titleEl).toBeInTheDocument();
    expect(titleEl).toHaveAttribute('title', 'Very long title representing [(dashboard)]/[tenantSlug]/[projectSlug]/page.tsx');
    expect(titleEl).toHaveClass('truncate min-w-0 flex-shrink');

    // Parent container must enforce single-line horizontal alignment without flex-wrap
    const container = titleEl.parentElement;
    expect(container).toHaveClass('flex items-center gap-2 min-w-0 flex-1');
    expect(container).not.toHaveClass('flex-wrap');

    // Metadata chips must have whitespace-nowrap and flex-shrink-0 to never drop to a second row
    const refBadge = screen.getByText('[TRK-101]');
    expect(refBadge).toHaveClass('whitespace-nowrap shrink-0');

    const subtasksBadge = screen.getByTestId('tree-node-subtasks-badge');
    expect(subtasksBadge).toHaveClass('whitespace-nowrap shrink-0');

    const rollupBadge = screen.getByTestId('tree-node-rollup-points-badge');
    expect(rollupBadge).toHaveClass('whitespace-nowrap shrink-0');
  });
});

describe('TASK-TRK-TREE-LEVEL-FORMATTING - Indentation steps, guide rails, and level hierarchy styling', () => {
  it('calibrates INDENT_STEP to 20px', () => {
    expect(INDENT_STEP).toBe(20);
  });

  it('applies distinct visual hierarchy classes per hierarchy level', () => {
    const epicClass = getLevelBadgeClasses('epic', false);
    expect(epicClass).toContain('bg-purple-950/60');
    expect(epicClass).toContain('text-purple-300');
    expect(epicClass).toContain('font-bold');

    const storyClass = getLevelBadgeClasses('story', false);
    expect(storyClass).toContain('bg-sky-950/60');
    expect(storyClass).toContain('text-sky-300');
    expect(storyClass).toContain('font-semibold');

    const taskClass = getLevelBadgeClasses('task', false);
    expect(taskClass).toContain('bg-slate-800/80');
    expect(taskClass).toContain('text-slate-300');

    const subtaskClass = getLevelBadgeClasses('subtask', false);
    expect(subtaskClass).toContain('bg-slate-900');
    expect(subtaskClass).toContain('text-slate-400');
    expect(subtaskClass).toContain('tracking-wider');

    const unmappedClass = getLevelBadgeClasses('custom', true);
    expect(unmappedClass).toContain('bg-amber-950/80');
    expect(unmappedClass).toContain('text-amber-300');
  });

  it('differentiates card background and vertical padding between root and nested nodes', () => {
    const rootNode: WorkItemNode = {
      ...mockItem({ id: 'root-card', item_type: 'epic' }),
      depth: 0,
      children: [],
    };
    const { rerender } = render(<TreeNode item={rootNode} />);

    const rootCard = screen.getByTestId('tree-node-card-root-card');
    expect(rootCard).toHaveClass('py-2.5 px-3 bg-slate-900/70 border-slate-800');

    const nestedNode: WorkItemNode = {
      ...mockItem({ id: 'nested-card', item_type: 'subtask' }),
      depth: 2,
      children: [],
    };
    rerender(<TreeNode item={nestedNode} />);

    const nestedCard = screen.getByTestId('tree-node-card-nested-card');
    expect(nestedCard).toHaveClass('py-1.5 px-3 bg-slate-950/40 border-slate-800/80');
  });
});

describe('BUG-TRK-HIERARCHY-DND-TOLERANCE - Drop corridors and glowing visual guidelines', () => {
  it('renders glowing visual drop guidelines for before, inside, and after with expanded hitbox tolerance', () => {
    const item: WorkItemNode = {
      ...mockItem({ id: 'dnd-node', title: 'DND Node' }),
      depth: 1,
      children: [],
    };

    render(<TreeNode item={item} />);

    const card = screen.getByTestId('tree-node-card-dnd-node');
    Object.defineProperty(card, 'getBoundingClientRect', {
      value: () => ({
        top: 100,
        height: 100,
        bottom: 200,
        left: 0,
        right: 500,
        width: 500,
        x: 0,
        y: 100,
        toJSON: () => {},
      }),
      configurable: true,
    });

    // Top threshold corridor (< 25px) -> before
    const dragBefore = createEvent.dragOver(card);
    Object.defineProperty(dragBefore, 'clientY', { value: 110 });
    fireEvent(card, dragBefore);
    const indicatorBefore = screen.getByTestId('drop-indicator-before');
    expect(indicatorBefore).toBeInTheDocument();
    expect(indicatorBefore).toHaveClass('bg-emerald-400');
    expect(indicatorBefore).toHaveStyle({ marginLeft: '40px' }); // (depth 1 * 20) + 20 = 40px

    // Bottom threshold corridor (> 75px) -> after
    const dragAfter = createEvent.dragOver(card);
    Object.defineProperty(dragAfter, 'clientY', { value: 190 });
    fireEvent(card, dragAfter);
    const indicatorAfter = screen.getByTestId('drop-indicator-after');
    expect(indicatorAfter).toBeInTheDocument();
    expect(indicatorAfter).toHaveClass('bg-emerald-400');

    // Middle threshold corridor -> inside
    const dragInside = createEvent.dragOver(card);
    Object.defineProperty(dragInside, 'clientY', { value: 150 });
    fireEvent(card, dragInside);
    expect(screen.getByTestId('drop-indicator-inside')).toBeInTheDocument();
    expect(screen.getByText('Nest inside')).toBeInTheDocument();
  });
});

describe('BUG-TRK-SPRINT-BAR-GLOBAL-LEAK - BulkActionsToolbar scoping and dismissal', () => {
  it('renders dismiss button with accessible label and invokes onClearSelection when clicked', () => {
    const onClear = vi.fn();
    render(
      <BulkActionsToolbar
        selectedCount={3}
        availableSprints={['Sprint 1', 'Sprint 2']}
        statuses={[{ id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 }]}
        onMoveToSprint={vi.fn()}
        onSetStatus={vi.fn()}
        onAssignMember={vi.fn()}
        onAdjustPoints={vi.fn()}
        onDeleteSelected={vi.fn()}
        onClearSelection={onClear}
      />
    );

    expect(screen.getByText('3 items selected')).toBeInTheDocument();
    const dismissBtn = screen.getByTestId('bulk-actions-dismiss');
    expect(dismissBtn).toBeInTheDocument();
    expect(dismissBtn).toHaveAttribute('aria-label', 'Dismiss bulk selection');

    fireEvent.click(dismissBtn);
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('does not render when selectedCount is 0', () => {
    const { container } = render(
      <BulkActionsToolbar
        selectedCount={0}
        availableSprints={[]}
        statuses={[]}
        onMoveToSprint={vi.fn()}
        onSetStatus={vi.fn()}
        onAssignMember={vi.fn()}
        onAdjustPoints={vi.fn()}
        onDeleteSelected={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('FEAT-TRK-SPRINT-CASCADE-SELECTION - Recursive selection and indeterminate state', () => {
  it('renders indeterminate checkbox when isIndeterminate is true in SprintItemRow', () => {
    const item = mockItem({ id: 'parent-row', title: 'Parent Story', item_type: 'story' });
    const onToggle = vi.fn();

    render(
      <SprintItemRow
        item={item}
        isSelected={false}
        isIndeterminate={true}
        onToggleSelect={onToggle}
        isImmutable={false}
        onEditItem={vi.fn()}
        getItemHierarchy={() => []}
        getItemStatuses={() => []}
        onUpdateStatus={vi.fn()}
        onUpdateSprint={vi.fn()}
        availableSprints={[]}
      />
    );

    const checkbox = screen.getByTestId('sprint-item-checkbox-parent-row');
    expect(checkbox).toHaveAttribute('title', 'Some child tasks selected (click to select all)');
    expect(screen.getByTestId('indeterminate-checkbox')).toBeInTheDocument();

    const hiddenInput = checkbox.querySelector('input[type="checkbox"]');
    expect(hiddenInput).toBeInTheDocument();
    expect((hiddenInput as HTMLInputElement).indeterminate).toBe(true);

    fireEvent.click(checkbox);
    expect(onToggle).toHaveBeenCalledWith('parent-row', expect.any(Object));
  });

  it('recursively gathers all descendant IDs via getDescendantIds', () => {
    const items = [
      mockItem({ id: 'epic-1', parent_id: null }),
      mockItem({ id: 'story-1', parent_id: 'epic-1' }),
      mockItem({ id: 'task-1', parent_id: 'story-1' }),
      mockItem({ id: 'subtask-1', parent_id: 'task-1' }),
      mockItem({ id: 'story-2', parent_id: 'epic-1' }),
      mockItem({ id: 'other-root', parent_id: null }),
    ];

    const epicDescendants = getDescendantIds(items, 'epic-1');
    expect(epicDescendants).toEqual(['story-1', 'story-2', 'task-1', 'subtask-1']);

    const storyDescendants = getDescendantIds(items, 'story-1');
    expect(storyDescendants).toEqual(['task-1', 'subtask-1']);

    const leafDescendants = getDescendantIds(items, 'subtask-1');
    expect(leafDescendants).toEqual([]);
  });
});

describe('PRJ-05 - Read-only view state during project loading', () => {
  it('does not flag isReadOnly as true while loading is true even if currentUser is null', () => {
    const computeIsReadOnly = (loading: boolean, currentUser: any, role?: string) =>
      !loading && (currentUser === null || role === 'viewer');

    expect(computeIsReadOnly(true, null, undefined)).toBe(false);
    expect(computeIsReadOnly(true, null, 'admin')).toBe(false);
    expect(computeIsReadOnly(false, null, undefined)).toBe(true);
    expect(computeIsReadOnly(false, { id: 'u1' }, 'viewer')).toBe(true);
    expect(computeIsReadOnly(false, { id: 'u1' }, 'member')).toBe(false);
    expect(computeIsReadOnly(false, { id: 'u1' }, 'admin')).toBe(false);
  });
});
