import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { TreeNode } from '@/components/TreeNode';
import { TreeNodeCard } from '@/components/tree/TreeNodeCard';
import { WorkspaceShell } from '@/components/layout/WorkspaceShell';
import { WorkItemNode, StatusDefinition, HierarchyLevel } from '@/types/tracker';

const mockStatuses: StatusDefinition[] = [
  { id: 'not_started', label: 'Not Started', color: '#64748b', order: 1 },
  { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
  { id: 'in_review', label: 'In Review', color: '#f59e0b', order: 3 },
  { id: 'complete', label: 'Complete', color: '#22c55e', order: 4 },
];

const mockHierarchy: HierarchyLevel[] = [
  { level: 1, type: 'epic', label: 'Epic', allowed_parents: [] },
  { level: 2, type: 'story', label: 'Story', allowed_parents: ['epic'] },
  { level: 3, type: 'task', label: 'Task', allowed_parents: ['story'] },
];

const mockMembers = [
  { id: 'm-1', name: 'Tymz' },
  { id: 'm-2', name: 'Alice Engineering Lead' },
];

function createTestItem(overrides: Partial<WorkItemNode> = {}): WorkItemNode {
  return {
    id: 'story-1',
    tenant_id: 'test-tenant',
    project_id: 'test-project',
    external_ref_id: 'BUG-TRK-TOOLTIP-VIEWPORT-COLLISION',
    title: 'Hierarchy Tree Row Density Streamline & 3-Pane Adaptive Layout',
    item_type: 'story',
    status: 'not_started',
    parent_id: null,
    order_index: 1000,
    depth: 0,
    assignee: 'Tymz',
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    metadata: {},
    children: [],
    ...overrides,
  };
}

describe('STORY-TRK-HIERARCHY-ROW-DENSITY-STREAMLINE Suite', () => {
  describe('TASK-TRK-TREE-COMPACT-DROPDOWNS-TO-ICONS', () => {
    it('renders compact 20x20px interactive status glyph and opens portaled micro-popover on click', async () => {
      const onUpdateStatus = vi.fn();
      const item = createTestItem({ status: 'in_progress' });

      render(
        <TreeNodeCard
          item={item}
          nodeIsImmutable={false}
          isBeingDragged={false}
          dropPosition={null}
          sanitizedTitle={item.title}
          isDescExpanded={false}
          setIsDescExpanded={vi.fn()}
          validChildTypes={[]}
          isCreatingChild={false}
          setIsCreatingChild={vi.fn()}
          setChildError={vi.fn()}
          onDragOver={vi.fn()}
          onDragLeave={vi.fn()}
          onDrop={vi.fn()}
          onUpdateStatus={onUpdateStatus}
          effectiveStatuses={mockStatuses}
          members={mockMembers}
        />
      );

      const statusBtn = screen.getByTestId(`status-icon-btn-${item.id}`);
      expect(statusBtn).toBeInTheDocument();
      expect(statusBtn).toHaveClass('w-5', 'h-5', 'rounded-full');
      expect(statusBtn).toHaveAttribute('title', 'Status: In Progress');

      // Click to open micro-popover
      fireEvent.click(statusBtn);

      const popover = screen.getByTestId(`status-popover-${item.id}`);
      expect(popover).toBeInTheDocument();

      // Select 'Complete' from popover
      const completeOption = screen.getByTestId('status-option-complete');
      expect(completeOption).toBeInTheDocument();
      fireEvent.click(completeOption);

      expect(onUpdateStatus).toHaveBeenCalledWith('story-1', 'complete');
      expect(screen.queryByTestId(`status-popover-${item.id}`)).not.toBeInTheDocument();
    });

    it('renders custom schema statuses with their configured label and color styling on compact glyphs', () => {
      const customStatuses: StatusDefinition[] = [
        ...mockStatuses,
        { id: 'blocked', label: 'Blocked', color: '#ef4444', order: 5 },
      ];
      const item = createTestItem({ status: 'blocked' });

      render(
        <TreeNodeCard
          item={item}
          nodeIsImmutable={false}
          isBeingDragged={false}
          dropPosition={null}
          sanitizedTitle={item.title}
          isDescExpanded={false}
          setIsDescExpanded={vi.fn()}
          validChildTypes={[]}
          isCreatingChild={false}
          setIsCreatingChild={vi.fn()}
          setChildError={vi.fn()}
          onDragOver={vi.fn()}
          onDragLeave={vi.fn()}
          onDrop={vi.fn()}
          effectiveStatuses={customStatuses}
          members={mockMembers}
        />
      );

      const statusBtn = screen.getByTestId(`status-icon-btn-${item.id}`);
      expect(statusBtn).toBeInTheDocument();
      expect(statusBtn).toHaveAttribute('title', 'Status: Blocked');
    });

    it('renders compact 22x22px circular avatar glyph with user initial and opens assignee micro-popover', async () => {
      const onUpdateAssignee = vi.fn();
      const item = createTestItem({ assignee: 'Tymz' });

      render(
        <TreeNodeCard
          item={item}
          nodeIsImmutable={false}
          isBeingDragged={false}
          dropPosition={null}
          sanitizedTitle={item.title}
          isDescExpanded={false}
          setIsDescExpanded={vi.fn()}
          validChildTypes={[]}
          isCreatingChild={false}
          setIsCreatingChild={vi.fn()}
          setChildError={vi.fn()}
          onDragOver={vi.fn()}
          onDragLeave={vi.fn()}
          onDrop={vi.fn()}
          onUpdateAssignee={onUpdateAssignee}
          effectiveStatuses={mockStatuses}
          members={mockMembers}
        />
      );

      const avatarBtn = screen.getByTestId(`assignee-avatar-btn-${item.id}`);
      expect(avatarBtn).toBeInTheDocument();
      expect(avatarBtn).toHaveClass('w-[22px]', 'h-[22px]', 'rounded-full');
      expect(avatarBtn).toHaveTextContent('T');
      expect(avatarBtn).toHaveAttribute('title', 'Tymz');

      // Click to open assignee micro-popover
      fireEvent.click(avatarBtn);

      const popover = screen.getByTestId(`assignee-popover-${item.id}`);
      expect(popover).toBeInTheDocument();

      // Click 'Alice Engineering Lead'
      const aliceOption = screen.getByTestId('assignee-option-m-2');
      expect(aliceOption).toBeInTheDocument();
      fireEvent.click(aliceOption);

      expect(onUpdateAssignee).toHaveBeenCalledWith('story-1', 'Alice Engineering Lead');
      expect(screen.queryByTestId(`assignee-popover-${item.id}`)).not.toBeInTheDocument();
    });

    it('disables compact status glyph and assignee avatar when item is immutable', () => {
      const item = createTestItem({ status: 'complete' });

      render(
        <TreeNodeCard
          item={item}
          nodeIsImmutable={true}
          isBeingDragged={false}
          dropPosition={null}
          sanitizedTitle={item.title}
          isDescExpanded={false}
          setIsDescExpanded={vi.fn()}
          validChildTypes={[]}
          isCreatingChild={false}
          setIsCreatingChild={vi.fn()}
          setChildError={vi.fn()}
          onDragOver={vi.fn()}
          onDragLeave={vi.fn()}
          onDrop={vi.fn()}
          effectiveStatuses={mockStatuses}
          members={mockMembers}
        />
      );

      const statusBtn = screen.getByTestId(`status-icon-btn-${item.id}`);
      expect(statusBtn).toBeDisabled();
      expect(statusBtn).toHaveClass('opacity-50', 'cursor-not-allowed');

      const avatarBtn = screen.getByTestId(`assignee-avatar-btn-${item.id}`);
      expect(avatarBtn).toBeDisabled();
      expect(avatarBtn).toHaveClass('opacity-50', 'cursor-not-allowed');
    });
  });

  describe('TASK-TRK-TREE-TITLE-FIRST-HIERARCHY', () => {
    it('prioritizes title width with min-w-[120px] and truncates long external ref IDs in secondary element', () => {
      const item = createTestItem();

      render(
        <TreeNode
          item={item}
          statuses={mockStatuses}
          hierarchy={mockHierarchy}
          members={mockMembers}
        />
      );

      const titleEl = screen.getByText(item.title);
      expect(titleEl).toHaveClass('truncate', 'font-medium', 'text-slate-100', 'text-sm', 'flex-1', 'min-w-[120px]');

      const refContainer = screen.getByTestId(`tree-node-ref-id-${item.id}`);
      expect(refContainer).toBeInTheDocument();
      expect(refContainer).toHaveClass('shrink-0', 'max-w-[140px]', 'truncate', 'central-stage-ref-id');

      const levelBadge = screen.getByTestId(`level-badge-${item.item_type}`);
      expect(levelBadge).toHaveClass('px-1.5', 'py-0.5', 'font-semibold', 'shrink-0');
    });
  });

  describe('TASK-TRK-3PANE-CONTAINER-RESPONSIVENESS', () => {
    it('sets container-type inline-size and container-name central-stage on workspace canvas', () => {
      render(
        <WorkspaceShell
          centerPane={<div>Central Hierarchy Tree</div>}
        />
      );

      const canvas = screen.getByTestId('workspace-canvas');
      expect(canvas).toHaveStyle({ containerType: 'inline-size', containerName: 'central-stage' });
    });

    it('automatically collapses LHN sidebar when RHN inspector opens on viewports < 1440px and restores on close', () => {
      // Mock window.innerWidth to 1280px (standard laptop viewport)
      const originalInnerWidth = window.innerWidth;
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: 1280 });

      const { rerender } = render(
        <WorkspaceShell
          leftPane={<div>Navigation Tree</div>}
          centerPane={<div>Central Hierarchy Tree</div>}
          rightPane={<div>Inspector Drawer</div>}
          isRightOpen={false}
        />
      );

      const lhn = screen.getByTestId('workspace-lhn');
      // Initially not collapsed (style width is DEFAULT_LHN_WIDTH or expanded)
      expect(lhn).toHaveStyle({ width: '280px' });

      // Open inspector drawer on screen < 1440px
      rerender(
        <WorkspaceShell
          leftPane={<div>Navigation Tree</div>}
          centerPane={<div>Central Hierarchy Tree</div>}
          rightPane={<div>Inspector Drawer</div>}
          isRightOpen={true}
        />
      );

      // Should automatically collapse LHN sidebar to icon rail (56px)
      expect(lhn).toHaveStyle({ width: '56px' });
      expect(lhn).toHaveClass('w-14');

      // Close inspector drawer
      rerender(
        <WorkspaceShell
          leftPane={<div>Navigation Tree</div>}
          centerPane={<div>Central Hierarchy Tree</div>}
          rightPane={<div>Inspector Drawer</div>}
          isRightOpen={false}
        />
      );

      // Should restore LHN sidebar to its expanded width
      expect(lhn).toHaveStyle({ width: '280px' });

      // Restore original innerWidth
      Object.defineProperty(window, 'innerWidth', { writable: true, configurable: true, value: originalInnerWidth });
    });
  });
});
