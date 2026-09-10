import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkActionsToolbar } from '@/components/BulkActionsToolbar';
import { StatusDefinition } from '@/types/tracker';

describe('BulkActionsToolbar Component (TASK-TRK-SPRINT-HIER-BULK-ACTIONS)', () => {
  const mockStatuses: StatusDefinition[] = [
    { id: 'not_started', label: 'Not Started', color: '#64748b', order: 1000 },
    { id: 'in_progress', label: 'In Progress', color: '#0ea5e9', order: 2000 },
    { id: 'complete', label: 'Complete', color: '#10b981', order: 3000 },
  ];

  const mockSprints = ['Sprint 2026-Q3', 'Sprint 2026-Q4'];
  const mockMembers = [
    { id: 'u1', name: 'Alice' },
    { id: 'u2', name: 'Bob' },
  ];

  it('renders nothing when selectedCount is 0', () => {
    const { container } = render(
      <BulkActionsToolbar
        selectedCount={0}
        availableSprints={mockSprints}
        statuses={mockStatuses}
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

  it('renders counter badge and triggers bulk move to sprint', () => {
    const onMoveToSprint = vi.fn();
    render(
      <BulkActionsToolbar
        selectedCount={3}
        availableSprints={mockSprints}
        statuses={mockStatuses}
        onMoveToSprint={onMoveToSprint}
        onSetStatus={vi.fn()}
        onAssignMember={vi.fn()}
        onAdjustPoints={vi.fn()}
        onDeleteSelected={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );

    expect(screen.getByText('3 items selected')).toBeDefined();

    const sprintSelect = screen.getByTitle('Move selected items to a sprint or backlog');
    fireEvent.change(sprintSelect, { target: { value: 'Sprint 2026-Q4' } });

    expect(onMoveToSprint).toHaveBeenCalledWith('Sprint 2026-Q4');
  });

  it('triggers bulk status update', () => {
    const onSetStatus = vi.fn();
    render(
      <BulkActionsToolbar
        selectedCount={2}
        availableSprints={mockSprints}
        statuses={mockStatuses}
        onMoveToSprint={vi.fn()}
        onSetStatus={onSetStatus}
        onAssignMember={vi.fn()}
        onAdjustPoints={vi.fn()}
        onDeleteSelected={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );

    const statusSelect = screen.getByTitle('Set status for selected items');
    fireEvent.change(statusSelect, { target: { value: 'complete' } });

    expect(onSetStatus).toHaveBeenCalledWith('complete');
  });

  it('triggers bulk member assignment', () => {
    const onAssignMember = vi.fn();
    render(
      <BulkActionsToolbar
        selectedCount={2}
        availableSprints={mockSprints}
        statuses={mockStatuses}
        members={mockMembers}
        onMoveToSprint={vi.fn()}
        onSetStatus={vi.fn()}
        onAssignMember={onAssignMember}
        onAdjustPoints={vi.fn()}
        onDeleteSelected={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );

    const memberSelect = screen.getByTitle('Assign member to selected items');
    fireEvent.change(memberSelect, { target: { value: 'Alice' } });

    expect(onAssignMember).toHaveBeenCalledWith('Alice');
  });

  it('triggers story points adjustment', () => {
    const onAdjustPoints = vi.fn();
    render(
      <BulkActionsToolbar
        selectedCount={1}
        availableSprints={mockSprints}
        statuses={mockStatuses}
        onMoveToSprint={vi.fn()}
        onSetStatus={vi.fn()}
        onAssignMember={vi.fn()}
        onAdjustPoints={onAdjustPoints}
        onDeleteSelected={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );

    fireEvent.click(screen.getByTitle('Set story points for selected items'));
    const input = screen.getByPlaceholderText('Pts');
    fireEvent.change(input, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set' }));

    expect(onAdjustPoints).toHaveBeenCalledWith(5);
  });

  it('triggers delete and clear selection', () => {
    const onDelete = vi.fn();
    const onClear = vi.fn();
    render(
      <BulkActionsToolbar
        selectedCount={1}
        availableSprints={mockSprints}
        statuses={mockStatuses}
        onMoveToSprint={vi.fn()}
        onSetStatus={vi.fn()}
        onAssignMember={vi.fn()}
        onAdjustPoints={vi.fn()}
        onDeleteSelected={onDelete}
        onClearSelection={onClear}
      />
    );

    fireEvent.click(screen.getByTitle('Soft delete selected items'));
    expect(onDelete).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTitle('Deselect all items'));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});
