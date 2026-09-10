import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import React from 'react';
import { ConfirmArchiveProjectModal } from '@/components/ConfirmArchiveProjectModal';

describe('ConfirmArchiveProjectModal Component (TASK-TRK-PROJECT-ARCHIVE)', () => {
  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ConfirmArchiveProjectModal
        isOpen={false}
        projectName="Core Platform"
        projectSlug="core-platform"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders project name, slug, warning text, and triggers onConfirm and onClose', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();

    render(
      <ConfirmArchiveProjectModal
        isOpen={true}
        projectName="Core Platform"
        projectSlug="core-platform"
        onClose={onClose}
        onConfirm={onConfirm}
      />
    );

    expect(screen.getByRole('heading', { name: 'Archive Project' })).toBeDefined();
    expect(screen.getByText('/core-platform')).toBeDefined();
    expect(screen.getByText('Core Platform')).toBeDefined();
    expect(screen.getByText(/no data will be permanently deleted/i)).toBeDefined();

    const cancelBtn = screen.getByRole('button', { name: /cancel/i });
    fireEvent.click(cancelBtn);
    expect(onClose).toHaveBeenCalledTimes(1);

    const archiveBtn = screen.getByRole('button', { name: /archive project/i });
    fireEvent.click(archiveBtn);
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('disables buttons and shows loader when isArchiving is true', () => {
    render(
      <ConfirmArchiveProjectModal
        isOpen={true}
        projectName="Core Platform"
        projectSlug="core-platform"
        onClose={vi.fn()}
        onConfirm={vi.fn()}
        isArchiving={true}
      />
    );

    expect(screen.getByText('Archiving…')).toBeDefined();
    const archiveBtn = screen.getByRole('button', { name: /archiving…/i });
    expect((archiveBtn as HTMLButtonElement).disabled).toBe(true);
  });
});
