import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { KanbanCard } from '@/components/board/KanbanCard';
import { WorkItem, HierarchyLevel } from '@/types/tracker';

describe('TASK-TRK-COMPACT-KANBAN-CARDS: Dense 3-line Kanban card layout', () => {
  const mockHierarchy: HierarchyLevel[] = [
    { level: 0, type: 'epic', label: 'Epic', color: '#a855f7', allowed_parents: [] },
    { level: 1, type: 'story', label: 'Story', color: '#0ea5e9', allowed_parents: ['epic'] },
    { level: 2, type: 'task', label: 'Task', color: '#64748b', allowed_parents: ['story'] },
  ];

  const mockItem: WorkItem = {
    id: 'item-compact-101',
    external_ref_id: 'TASK-TRK-101',
    tenant_id: 'tenant-1',
    project_id: 'prj-1',
    title: 'Dense Kanban Card Title Clamped Cleanly to Two Lines on Board',
    description: 'This is a long description that should be stripped out from compact cards and viewed only in drawer.',
    status: 'in_progress',
    item_type: 'task',
    order_index: 1000,
    metadata: {
      priority: 'High',
      complexity: 2,
      agent_prompt: '### SYSTEM ROLE: Do not render this code block inside card body',
      story_points: 5,
    },
    created_at: new Date(Date.now() - 3600 * 1000).toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('enforces dense 3-line card wrapper geometry with min-h-[76px] and max-h-[88px]', () => {
    render(
      <KanbanCard
        item={mockItem}
        itemHierarchy={mockHierarchy}
      />
    );

    const card = screen.getByTestId('kanban-card-item-compact-101');
    expect(card).toBeInTheDocument();
    expect(card.className).toContain('min-h-[76px]');
    expect(card.className).toContain('max-h-[88px]');
    expect(card.className).toContain('flex-col');
    expect(card.className).toContain('justify-between');
  });

  it('strips description snippet, accordion expander, metadata tags, and status dropdown in default compact mode', () => {
    const handleUpdateStatus = vi.fn();
    render(
      <KanbanCard
        item={mockItem}
        itemHierarchy={mockHierarchy}
        onUpdateStatus={handleUpdateStatus}
        getItemStatuses={() => [
          { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
          { id: 'in_progress', label: 'In Progress', color: '#3b82f6', order: 2 },
        ]}
      />
    );

    // No description text rendered in card body
    expect(screen.queryByTestId('card-description-item-compact-101')).not.toBeInTheDocument();
    expect(screen.queryByText(/This is a long description/)).not.toBeInTheDocument();

    // No accordion expand button
    expect(screen.queryByTestId('card-expand-desc-btn-item-compact-101')).not.toBeInTheDocument();

    // No raw agent prompt or metadata chips
    expect(screen.queryByText(/### SYSTEM ROLE/)).not.toBeInTheDocument();
    expect(screen.queryByText(/complexity:/)).not.toBeInTheDocument();

    // No inline status dropdown
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });

  it('renders Line 1 with static type pill, ref ID, points badge; Line 2 with clamped title; Line 3 with assignee and timestamp', () => {
    render(
      <KanbanCard
        item={mockItem}
        childCount={3}
        itemHierarchy={mockHierarchy}
      />
    );

    // Line 1: Static type badge
    expect(screen.getByText('Task')).toBeInTheDocument();
    // Line 1: Copyable ref ID
    expect(screen.getByTestId('copyable-ref-id-TASK-TRK-101')).toBeInTheDocument();
    // Line 1: Story points badge
    expect(screen.getByTestId('dual-point-badge')).toHaveTextContent('5 pts');

    // Line 2: Title with native tooltip and link anchor
    const link = screen.getByTestId('kanban-card-link-item-compact-101');
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('title', mockItem.title);
    expect(link.className).toContain('line-clamp-2');

    // Line 3: Assignee and priority
    expect(screen.getByText(/High/)).toBeInTheDocument();
    expect(screen.getByText(/(3 tasks)/)).toBeInTheDocument();
    expect(screen.getByTestId('card-timestamp-item-compact-101')).toBeInTheDocument();
  });

  it('clicking card body triggers onEditItem to offload inspection to RHN drawer', () => {
    const handleEdit = vi.fn();
    render(
      <KanbanCard
        item={mockItem}
        itemHierarchy={mockHierarchy}
        onEditItem={handleEdit}
      />
    );

    const card = screen.getByTestId('kanban-card-item-compact-101');
    fireEvent.click(card);

    expect(handleEdit).toHaveBeenCalledWith(mockItem);
  });
});
