import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KanbanCard } from '@/components/board/KanbanCard';
import { TreeNode } from '@/components/TreeNode';
import { WorkItem, WorkItemNode, HierarchyLevel } from '@/types/tracker';

const mockHierarchy: HierarchyLevel[] = [
  { level: 0, type: 'epic', label: 'Epic', color: '#a855f7', allowed_parents: [] },
  { level: 1, type: 'story', label: 'Story', color: '#0ea5e9', allowed_parents: ['epic'] },
  { level: 2, type: 'task', label: 'Task', color: '#64748b', allowed_parents: ['story'] },
];

describe('FEAT-TRK-MOBILE-TOUCH-EXPAND-DESC: Tap-to-expand accordion fallback for ticket descriptions', () => {
  it('KanbanCard: renders expand description button when description is present and expands on tap without triggering edit', () => {
    const handleEdit = vi.fn();
    const mockItem: WorkItem = {
      id: 'item-101',
      tenant_id: 'tenant-1',
      project_id: 'prj-1',
      title: 'Audit Mobile Safe Areas',
      description: 'Long description explaining the mobile layout requirements and tap behavior in depth.',
      status: 'in_progress',
      item_type: 'task',
      order_index: 1000,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    render(
      <KanbanCard
        item={mockItem}
        itemHierarchy={mockHierarchy}
        onEditItem={handleEdit}
      />
    );

    const descElem = screen.getByTestId('card-description-item-101');
    expect(descElem).toBeInTheDocument();
    expect(descElem).toHaveClass('line-clamp-2');
    expect(descElem).toHaveAttribute('title', mockItem.description);

    const expandBtn = screen.getByTestId('card-expand-desc-btn-item-101');
    expect(expandBtn).toBeInTheDocument();
    expect(expandBtn).toHaveAttribute('aria-expanded', 'false');

    // Tap to expand
    fireEvent.click(expandBtn);

    expect(handleEdit).not.toHaveBeenCalled();
    expect(descElem).toHaveClass('line-clamp-none');
    expect(expandBtn).toHaveAttribute('aria-expanded', 'true');

    // Tap to collapse
    fireEvent.click(expandBtn);
    expect(handleEdit).not.toHaveBeenCalled();
    expect(descElem).toHaveClass('line-clamp-2');
    expect(expandBtn).toHaveAttribute('aria-expanded', 'false');
  });

  it('TreeNode: renders expand button and surfaces inline description accordion without triggering edit modal', () => {
    const handleEdit = vi.fn();
    const mockNode: WorkItemNode = {
      id: 'node-202',
      tenant_id: 'tenant-1',
      project_id: 'prj-1',
      title: 'Hierarchy Node With Rich Description',
      description: 'Detailed scope of work describing tree node hierarchy and mobile interactions.',
      status: 'in_progress',
      item_type: 'task',
      order_index: 2000,
      depth: 0,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    render(
      <TreeNode
        item={mockNode}
        hierarchy={mockHierarchy}
        onEditItem={handleEdit}
      />
    );

    // Title includes desktop tooltip
    const titleSpan = screen.getByText('Hierarchy Node With Rich Description');
    expect(titleSpan).toHaveAttribute('title', `Hierarchy Node With Rich Description — ${mockNode.description}`);

    // Initially accordion description is not in DOM
    expect(screen.queryByTestId('tree-node-description-node-202')).not.toBeInTheDocument();

    const expandBtn = screen.getByTestId('tree-expand-desc-btn-node-202');
    expect(expandBtn).toBeInTheDocument();
    expect(expandBtn).toHaveAttribute('aria-expanded', 'false');

    // Tap expand button
    fireEvent.click(expandBtn);
    expect(handleEdit).not.toHaveBeenCalled();

    const descBox = screen.getByTestId('tree-node-description-node-202');
    expect(descBox).toBeInTheDocument();
    expect(descBox).toHaveTextContent(mockNode.description!);
    expect(expandBtn).toHaveAttribute('aria-expanded', 'true');

    // Tap collapse button
    fireEvent.click(expandBtn);
    expect(handleEdit).not.toHaveBeenCalled();
    expect(screen.queryByTestId('tree-node-description-node-202')).not.toBeInTheDocument();
  });
});
