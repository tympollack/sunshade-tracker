import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal';

describe('ConfirmDeleteModal component', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ConfirmDeleteModal
        isOpen={false}
        itemTitle="Test task"
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal with item title and reference when isOpen is true', () => {
    render(
      <ConfirmDeleteModal
        isOpen={true}
        itemTitle="Refactor authentication layer"
        itemRef="TASK-AUTH-01"
        onConfirm={() => {}}
        onClose={() => {}}
      />
    );

    expect(screen.getByText('Delete Work Item')).toBeDefined();
    expect(screen.getByText('TASK-AUTH-01')).toBeDefined();
    expect(screen.getByText('Refactor authentication layer')).toBeDefined();
    expect(screen.getByRole('button', { name: /Delete Item/i })).toBeDefined();
    expect(screen.getByRole('button', { name: /Cancel/i })).toBeDefined();
  });

  it('calls onConfirm and onClose when Delete Item button is clicked', async () => {
    const handleConfirm = vi.fn().mockResolvedValue(undefined);
    const handleClose = vi.fn();

    render(
      <ConfirmDeleteModal
        isOpen={true}
        itemTitle="Fix layout bug"
        onConfirm={handleConfirm}
        onClose={handleClose}
      />
    );

    const deleteBtn = screen.getByRole('button', { name: /Delete Item/i });
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    expect(handleConfirm).toHaveBeenCalled();
    expect(handleClose).toHaveBeenCalled();
  });

  it('calls onClose when Cancel button is clicked', async () => {
    const handleConfirm = vi.fn();
    const handleClose = vi.fn();

    render(
      <ConfirmDeleteModal
        isOpen={true}
        itemTitle="Fix layout bug"
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
});
