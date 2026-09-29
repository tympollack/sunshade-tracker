import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SprintGuardrailModal } from '@/components/sprints/SprintGuardrailModal';
import { WorkItem } from '@/types/tracker';

describe('TASK-TRK-SPRINT-ANALYTICS-UI: SprintGuardrailModal Component', () => {
  const mockIncomingItem = {
    title: 'Distributed Transaction Outbox Engine',
    story_points: 5,
    external_ref_id: 'TASK-OUTBOX',
    item_type: 'story',
  };

  const mockAvailableItems: WorkItem[] = [
    {
      id: 'unstarted-1',
      tenant_id: 't-1',
      project_id: 'p-1',
      title: 'Chore: Update Readme Badges',
      status: 'not_started',
      item_type: 'task',
      order_index: 1000,
      metadata: { story_points: 2 },
      created_at: '2026-10-01',
      updated_at: '2026-10-01',
    },
    {
      id: 'unstarted-2',
      tenant_id: 't-1',
      project_id: 'p-1',
      title: 'Refactor: Legacy DB Helper',
      status: 'not_started',
      item_type: 'task',
      order_index: 2000,
      metadata: { story_points: 3 },
      created_at: '2026-10-01',
      updated_at: '2026-10-01',
    },
    {
      id: 'in-progress-1',
      tenant_id: 't-1',
      project_id: 'p-1',
      title: 'Active Core Service',
      status: 'in_progress', // Should be excluded from candidate ejections
      item_type: 'task',
      order_index: 3000,
      metadata: { story_points: 8 },
      created_at: '2026-10-01',
      updated_at: '2026-10-01',
    },
  ];

  it('renders modal with canonical impassable capacity message and incoming story points', () => {
    render(
      <SprintGuardrailModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirmSwap={vi.fn()}
        incomingItem={mockIncomingItem}
        sprintName="Sprint 2026-Q4"
        requiredEjectionPoints={3}
        availableUnstartedItems={mockAvailableItems}
      />
    );

    expect(screen.getByTestId('sprint-guardrail-modal')).toBeInTheDocument();
    expect(screen.getByTestId('guardrail-capacity-message')).toHaveTextContent(
      'Capacity limit reached. To add this 5-point story, select unstarted items totaling at least 3 points to eject back to the backlog.'
    );
    expect(screen.getByText('Distributed Transaction Outbox Engine')).toBeInTheDocument();
  });

  it('filters available items to exclusively unstarted items, omitting in-progress items', () => {
    render(
      <SprintGuardrailModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirmSwap={vi.fn()}
        incomingItem={mockIncomingItem}
        sprintName="Sprint 2026-Q4"
        requiredEjectionPoints={3}
        availableUnstartedItems={mockAvailableItems}
      />
    );

    expect(screen.getByText('Chore: Update Readme Badges')).toBeInTheDocument();
    expect(screen.getByText('Refactor: Legacy DB Helper')).toBeInTheDocument();
    expect(screen.queryByText('Active Core Service')).not.toBeInTheDocument();
  });

  it('computes instantaneous differential math and keeps swap button disabled until deficit reaches 0', async () => {
    const handleConfirm = vi.fn();

    render(
      <SprintGuardrailModal
        isOpen={true}
        onClose={vi.fn()}
        onConfirmSwap={handleConfirm}
        incomingItem={mockIncomingItem}
        sprintName="Sprint 2026-Q4"
        requiredEjectionPoints={3}
        availableUnstartedItems={mockAvailableItems}
      />
    );

    const swapBtn = screen.getByTestId('guardrail-confirm-swap-button');
    expect(swapBtn).toBeDisabled();
    expect(screen.getByTestId('points-required')).toHaveTextContent('3 pts');
    expect(screen.getByTestId('points-selected')).toHaveTextContent('0 pts');
    expect(screen.getByTestId('points-deficit')).toHaveTextContent('3 pts');

    // Select item 1 (2 points): still 1 point deficit (2 < 3)
    fireEvent.click(screen.getByTestId('ejection-item-unstarted-1'));
    expect(screen.getByTestId('points-selected')).toHaveTextContent('2 pts');
    expect(screen.getByTestId('points-deficit')).toHaveTextContent('1 pts');
    expect(swapBtn).toBeDisabled();

    // Select item 2 (3 points): total = 5 points >= 3 required -> deficit 0!
    fireEvent.click(screen.getByTestId('ejection-item-unstarted-2'));
    expect(screen.getByTestId('points-selected')).toHaveTextContent('5 pts');
    expect(screen.getByTestId('points-deficit')).toHaveTextContent('0 pts');
    expect(swapBtn).not.toBeDisabled();

    // Confirm swap
    fireEvent.click(swapBtn);
    expect(handleConfirm).toHaveBeenCalledWith(
      expect.arrayContaining(['unstarted-1', 'unstarted-2'])
    );
  });

  it('triggers onClose when close button or cancel is clicked', () => {
    const handleClose = vi.fn();

    render(
      <SprintGuardrailModal
        isOpen={true}
        onClose={handleClose}
        onConfirmSwap={vi.fn()}
        incomingItem={mockIncomingItem}
        sprintName="Sprint 2026-Q4"
        requiredEjectionPoints={3}
        availableUnstartedItems={mockAvailableItems}
      />
    );

    fireEvent.click(screen.getByTestId('guardrail-close-button'));
    expect(handleClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Cancel'));
    expect(handleClose).toHaveBeenCalledTimes(2);
  });
});
