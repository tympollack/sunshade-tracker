import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CompactAssigneeCell, CompactStatusCell } from '@/components/common/CompactRowCells';
import { SprintItemRow } from '@/components/SprintItemRow';
import { TreeNode } from '@/components/TreeNode';
import { WorkItemNode, StatusDefinition, HierarchyLevel } from '@/types/tracker';

const mockStatuses: StatusDefinition[] = [
  { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
  { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
  { id: 'in_review', label: 'In Review', color: '#f59e0b', order: 3 },
  { id: 'complete', label: 'Complete', color: '#22c55e', order: 4, is_completed: true },
];

const mockHierarchy: HierarchyLevel[] = [
  { type: 'story', label: 'Story', level: 1, allowed_parents: [] },
  { type: 'task', label: 'Task', level: 2, allowed_parents: ['story'] },
];

const mockMembers = [
  { id: 'u1', name: 'Tymz' },
  { id: 'u2', name: 'Elena' },
];

function createItem(overrides: Partial<WorkItemNode> = {}): WorkItemNode {
  return {
    id: 'compact-item-1',
    tenant_id: 't1',
    project_id: 'p1',
    title: 'Compact Row Item',
    item_type: 'task',
    status: 'in_progress',
    order_index: 1000,
    depth: 0,
    assignee: 'Tymz',
    metadata: { story_points: 3, sprint: 'Sprint 2026-Q4' },
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
    ...overrides,
  };
}

describe('TASK-TRK-COMPACT-ASSIGNEE-STATUS-CELLS', () => {
  it('CompactAssigneeCell renders 22x22 avatar, opens portaled popover, closes on Escape & outside click', () => {
    const onUpdateAssignee = vi.fn();
    render(
      <CompactAssigneeCell
        itemId="item-a"
        assignee="Tymz"
        members={mockMembers}
        onUpdateAssignee={onUpdateAssignee}
      />
    );

    const btn = screen.getByTestId('assignee-avatar-btn-item-a');
    expect(btn).toHaveClass('w-[22px]', 'h-[22px]', 'rounded-full');
    expect(btn).toHaveTextContent('T');
    expect(btn).toHaveAttribute('title', 'Tymz');

    fireEvent.click(btn);
    const popover = screen.getByTestId('assignee-popover-item-a');
    expect(popover).toBeInTheDocument();
    expect(popover.parentElement).toBe(document.body);

    // Escape closes popover
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('assignee-popover-item-a')).not.toBeInTheDocument();

    // Re-open and select Unassigned
    fireEvent.click(btn);
    fireEvent.click(screen.getByTestId('assignee-option-unassigned'));
    expect(onUpdateAssignee).toHaveBeenCalledWith('item-a', null);
    expect(screen.queryByTestId('assignee-popover-item-a')).not.toBeInTheDocument();

    // Re-open and click outside
    fireEvent.click(btn);
    expect(screen.getByTestId('assignee-popover-item-a')).toBeInTheDocument();
    fireEvent.mouseDown(document.body);
    expect(screen.queryByTestId('assignee-popover-item-a')).not.toBeInTheDocument();
  });

  it('CompactStatusCell honors custom status colors and closes on Escape', () => {
    const onUpdateStatus = vi.fn();
    render(
      <CompactStatusCell
        itemId="item-s"
        status="in_review"
        statuses={mockStatuses}
        onUpdateStatus={onUpdateStatus}
      />
    );

    const btn = screen.getByTestId('status-icon-btn-item-s');
    expect(btn).toHaveClass('w-5', 'h-5', 'rounded-full');
    expect(btn).toHaveStyle({ color: '#f59e0b' });

    fireEvent.click(btn);
    const popover = screen.getByTestId('status-popover-item-s');
    expect(popover).toBeInTheDocument();

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('status-popover-item-s')).not.toBeInTheDocument();

    fireEvent.click(btn);
    fireEvent.click(screen.getByTestId('status-option-complete'));
    expect(onUpdateStatus).toHaveBeenCalledWith('item-s', 'complete');
  });

  it('SprintItemRow uses slim interactive assignee & status icon popovers instead of bulky controls', () => {
    const onUpdateStatus = vi.fn();
    const onUpdateAssignee = vi.fn();
    const item = createItem({ assignee: 'Elena', status: 'not_started' });

    render(
      <SprintItemRow
        item={item}
        isSelected={false}
        onToggleSelect={vi.fn()}
        isImmutable={false}
        onEditItem={vi.fn()}
        getItemHierarchy={() => mockHierarchy}
        getItemStatuses={() => mockStatuses}
        onUpdateStatus={onUpdateStatus}
        onUpdateAssignee={onUpdateAssignee}
        members={mockMembers}
      />
    );

    expect(screen.getByTestId('sprint-col-assignee')).toHaveClass('w-9', 'shrink-0');
    expect(screen.getByTestId('sprint-col-status')).toHaveClass('w-9', 'shrink-0');
    expect(screen.queryByTestId(`sprint-status-select-${item.id}`)).not.toBeInTheDocument();

    // Update assignee via compact popover
    fireEvent.click(screen.getByTestId(`assignee-avatar-btn-${item.id}`));
    fireEvent.click(screen.getByTestId('assignee-option-u1'));
    expect(onUpdateAssignee).toHaveBeenCalledWith(item.id, 'Tymz');

    // Update status via compact popover
    fireEvent.click(screen.getByTestId(`status-icon-btn-${item.id}`));
    fireEvent.click(screen.getByTestId('status-option-in_progress'));
    expect(onUpdateStatus).toHaveBeenCalledWith(item.id, 'in_progress');
  });

  it('TreeNode omits bulky desktop select controls in favor of slim 36px (w-9) compact tracks', () => {
    const item = createItem();
    render(
      <TreeNode
        item={item}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
        members={mockMembers}
        onUpdateAssignee={vi.fn()}
        onUpdateStatus={vi.fn()}
      />
    );

    expect(screen.queryByTestId(`assignee-select-${item.id}`)).not.toBeInTheDocument();
    expect(screen.queryByTestId(`status-select-${item.id}`)).not.toBeInTheDocument();
    expect(screen.getByTestId('col-assignee')).toHaveClass('w-9', 'shrink-0');
    expect(screen.getByTestId('col-status')).toHaveClass('w-9', 'shrink-0');
  });

  it('moves focus into opened compact row menu and restores focus to trigger on Escape', () => {
    render(
      <CompactStatusCell
        itemId="focus-s"
        status="in_review"
        statuses={mockStatuses}
        onUpdateStatus={vi.fn()}
      />
    );

    const trigger = screen.getByTestId('status-icon-btn-focus-s');
    trigger.focus();
    fireEvent.click(trigger);

    const selectedOption = screen.getByTestId('status-option-in_review');
    expect(document.activeElement).toBe(selectedOption);

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(document.activeElement).toBe(trigger);
  });
});
