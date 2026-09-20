import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { GlobalSearchModal } from '@/components/GlobalSearchModal';
import { WorkItem, ProjectSettings } from '@/types/tracker';

const mockSettings: ProjectSettings = {
  schema_version: '1.0',
  hierarchy: [
    { type: 'epic', label: 'Epic', level: 1, allowed_parents: [], color: '#38bdf8' },
    { type: 'task', label: 'Task', level: 2, allowed_parents: ['epic'], color: '#fbbf24' },
  ],
  statuses: [
    { id: 'todo', label: 'To Do', color: '#94a3b8', order: 1 },
    { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
    { id: 'done', label: 'Done', color: '#34d399', order: 3 },
  ],
  custom_fields: [],
};

const mockItems: WorkItem[] = [
  {
    id: 'item-1',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    title: 'Implement OAuth provider login',
    external_ref_id: 'AUTH-101',
    item_type: 'task',
    status: 'in_progress',
    assignee: 'Alice',
    order_index: 1000,
    metadata: { story_points: 5 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'item-2',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    title: 'Fix safe area gap on mobile browsers',
    external_ref_id: 'BUG-202',
    item_type: 'task',
    status: 'todo',
    assignee: 'Bob',
    order_index: 2000,
    metadata: { story_points: 3 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: 'item-3',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    title: 'Epic Infrastructure Modernization',
    external_ref_id: 'INFRA-303',
    item_type: 'epic',
    status: 'done',
    assignee: 'Charlie',
    order_index: 3000,
    metadata: { story_points: 13 },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

describe('FEAT-TRK-SEARCH-POPOVER: GlobalSearchModal', () => {
  it('does not render when isOpen is false', () => {
    render(
      <GlobalSearchModal
        isOpen={false}
        onClose={vi.fn()}
        items={mockItems}
        onSelectItem={vi.fn()}
        projectSettings={mockSettings}
      />
    );
    expect(screen.queryByTestId('global-search-modal')).not.toBeInTheDocument();
  });

  it('renders modal and filters by title, external_ref_id, and assignee', () => {
    const onClose = vi.fn();
    const onSelectItem = vi.fn();

    const { rerender } = render(
      <GlobalSearchModal
        isOpen={true}
        onClose={onClose}
        items={mockItems}
        onSelectItem={onSelectItem}
        projectSettings={mockSettings}
      />
    );

    const input = screen.getByTestId('global-search-input');
    expect(input).toBeInTheDocument();

    // Search by ref ID: 'BUG-202'
    fireEvent.change(input, { target: { value: 'BUG-202' } });
    expect(screen.getByText('Fix safe area gap on mobile browsers')).toBeInTheDocument();
    expect(screen.queryByText('Implement OAuth provider login')).not.toBeInTheDocument();

    // Search by assignee: 'Alice'
    fireEvent.change(input, { target: { value: 'Alice' } });
    expect(screen.getByText('Implement OAuth provider login')).toBeInTheDocument();
    expect(screen.queryByText('Fix safe area gap on mobile browsers')).not.toBeInTheDocument();

    // Search by title keyword: 'Modernization'
    fireEvent.change(input, { target: { value: 'Modernization' } });
    expect(screen.getByText('Epic Infrastructure Modernization')).toBeInTheDocument();
  });

  it('selects item on click or Enter key and calls onSelectItem', () => {
    const onClose = vi.fn();
    const onSelectItem = vi.fn();

    render(
      <GlobalSearchModal
        isOpen={true}
        onClose={onClose}
        items={mockItems}
        onSelectItem={onSelectItem}
        projectSettings={mockSettings}
      />
    );

    const input = screen.getByTestId('global-search-input');
    fireEvent.change(input, { target: { value: 'OAuth' } });

    // Press Enter to select first result
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onSelectItem).toHaveBeenCalledWith(mockItems[0]);
    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();

    render(
      <GlobalSearchModal
        isOpen={true}
        onClose={onClose}
        items={mockItems}
        onSelectItem={vi.fn()}
        projectSettings={mockSettings}
      />
    );

    const modal = screen.getByRole('dialog');
    fireEvent.keyDown(modal, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
