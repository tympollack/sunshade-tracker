import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { WorkspaceShell } from '@/components/layout/WorkspaceShell';

describe('TASK-TRK-VIEWPORT-LOCK-SCAFFOLD: WorkspaceShell', () => {
  it('renders root container locking viewport to 100dvh with zero outer overflow', () => {
    const { container } = render(
      <WorkspaceShell
        header={<div>Header Content</div>}
        centerPane={<div>Central Board View</div>}
      />
    );

    const root = screen.getByTestId('workspace-shell');
    expect(root).toBeInTheDocument();
    expect(root.className).toContain('h-[100dvh]');
    expect(root.className).toContain('w-full');
    expect(root.className).toContain('overflow-hidden');
    expect(root.className).toContain('flex-col');
  });

  it('renders header with shrink-0 so it never collapses under pane compression', () => {
    render(
      <WorkspaceShell
        header={<div data-testid="custom-header">Header Content</div>}
        centerPane={<div>Central Board View</div>}
      />
    );

    const headerContainer = screen.getByTestId('workspace-header');
    expect(headerContainer.className).toContain('shrink-0');
    expect(screen.getByTestId('custom-header')).toBeInTheDocument();
  });

  it('renders three-pane layout with independent scroll containers', () => {
    render(
      <WorkspaceShell
        header={<div>Header</div>}
        leftPane={<div data-testid="lhn-tree">Tree Items</div>}
        centerPane={<div data-testid="board-canvas">Kanban Cards</div>}
        rightPane={<div data-testid="rhn-inspector">Inspector Drawer</div>}
        isRightOpen={true}
      />
    );

    const lhn = screen.getByTestId('workspace-lhn');
    expect(lhn).toBeInTheDocument();
    expect(lhn.className).toContain('w-64');
    expect(lhn.className).toContain('shrink-0');
    expect(lhn.className).toContain('border-r');

    const canvas = screen.getByTestId('workspace-canvas');
    expect(canvas).toBeInTheDocument();
    expect(canvas.className).toContain('flex-1');
    expect(canvas.className).toContain('min-w-0');

    const dockedRhn = screen.getByTestId('workspace-rhn-docked');
    expect(dockedRhn).toBeInTheDocument();
    expect(dockedRhn.className).toContain('2xl:flex');
    expect(dockedRhn.className).toContain('w-96');
    expect(dockedRhn.className).toContain('shrink-0');
  });

  it('supports collapsing left pane to a w-14 icon rail', () => {
    const onToggle = vi.fn();
    const { rerender } = render(
      <WorkspaceShell
        leftPane={<div>Tree Items</div>}
        centerPane={<div>Central Board</div>}
        isLeftCollapsed={false}
        onToggleLeftCollapse={onToggle}
      />
    );

    const lhn = screen.getByTestId('workspace-lhn');
    expect(lhn.className).toContain('w-64');

    const collapseBtn = screen.getByRole('button', { name: /collapse navigation tree/i });
    fireEvent.click(collapseBtn);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(
      <WorkspaceShell
        leftPane={<div>Tree Items</div>}
        centerPane={<div>Central Board</div>}
        isLeftCollapsed={true}
        onToggleLeftCollapse={onToggle}
      />
    );

    expect(lhn.className).toContain('w-14');
  });

  it('renders overlay drawer and backdrop on laptop/tablet when isRightOpen is true', () => {
    const onClose = vi.fn();
    render(
      <WorkspaceShell
        centerPane={<div>Central Board</div>}
        rightPane={<div data-testid="inspector-content">Details</div>}
        isRightOpen={true}
        onCloseRight={onClose}
      />
    );

    const overlay = screen.getByTestId('workspace-rhn-overlay');
    expect(overlay).toBeInTheDocument();
    expect(overlay.className).toContain('2xl:hidden');
    expect(overlay.className).toContain('fixed');
    expect(overlay.className).toContain('w-[420px]');

    const backdrop = screen.getByTestId('workspace-rhn-backdrop');
    expect(backdrop).toBeInTheDocument();
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
