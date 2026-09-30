import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { BulkDeleteConfirmModal, BulkDeleteItemSummary } from '@/components/BulkDeleteConfirmModal';

describe('BulkDeleteConfirmModal Component (BUG-TRK-BULK-DELETE-CONFIRM-MODAL)', () => {
  const mockItems: BulkDeleteItemSummary[] = [
    { id: '1', external_ref_id: 'TRK-01', title: 'First Task' },
    { id: '2', external_ref_id: 'TRK-02', title: 'Second Task' },
    { id: '3', external_ref_id: null, title: 'Third Task without Ref' },
  ];

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <BulkDeleteConfirmModal
        isOpen={false}
        items={mockItems}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with items count and title when isOpen is true', () => {
    render(
      <BulkDeleteConfirmModal
        isOpen={true}
        items={mockItems}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Permanently Delete Work Items')).toBeDefined();
    expect(
      screen.getByText('Action cannot be undone. 3 items will be deleted.')
    ).toBeDefined();
    expect(screen.getByRole('button', { name: /Permanently Delete \(3\)/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeDefined();
  });

  it('toggles item details preview list when clicked', () => {
    render(
      <BulkDeleteConfirmModal
        isOpen={true}
        items={mockItems}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );

    const toggleButton = screen.getByRole('button', { name: /Selected Work Items \(3\)/i });
    expect(toggleButton).toBeDefined();

    // Not visible initially
    expect(screen.queryByText('First Task')).toBeNull();

    // Expand
    fireEvent.click(toggleButton);
    expect(screen.getByText('First Task')).toBeDefined();
    expect(screen.getByText('TRK-01')).toBeDefined();
    expect(screen.getByText('Second Task')).toBeDefined();
    expect(screen.getByText('Third Task without Ref')).toBeDefined();

    // Collapse
    fireEvent.click(toggleButton);
    expect(screen.queryByText('First Task')).toBeNull();
  });

  it('calls onConfirm when Delete button is clicked', async () => {
    const handleConfirm = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <BulkDeleteConfirmModal
        isOpen={true}
        items={mockItems}
        onConfirm={handleConfirm}
        onClose={handleClose}
      />
    );

    const deleteBtn = screen.getByRole('button', { name: /Permanently Delete \(3\)/i });
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    expect(handleConfirm).toHaveBeenCalled();
  });

  it('calls onClose when Cancel button is clicked', async () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <BulkDeleteConfirmModal
        isOpen={true}
        items={mockItems}
        onConfirm={handleConfirm}
        onClose={handleClose}
      />
    );

    const cancelBtn = screen.getByRole('button', { name: /Cancel/i });
    await act(async () => {
      fireEvent.click(cancelBtn);
    });

    expect(handleConfirm).not.toHaveBeenCalled();
    expect(handleClose).toHaveBeenCalled();
  });

  it('disables buttons when isDeleting is true', () => {
    render(
      <BulkDeleteConfirmModal
        isOpen={true}
        items={mockItems}
        isDeleting={true}
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );

    expect(screen.getByRole('button', { name: /Deleting \(3\)\.\.\./i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Cancel/i })).toHaveProperty('disabled', true);
  });
});
