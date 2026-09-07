import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { WorkItemModal } from '@/components/WorkItemModal';
import { WorkItem, ProjectSettings } from '@/types/tracker';

describe('WorkItemModal component', () => {
  const sampleSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [
      { type: 'epic', label: 'Epic', level: 1, allowed_parents: [] },
      { type: 'task', label: 'Task', level: 2, allowed_parents: ['epic'] },
    ],
    statuses: [
      { id: 'backlog', label: 'Backlog', color: '#94a3b8', order: 1 },
      { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      { id: 'done', label: 'Done', color: '#22c55e', order: 3 },
    ],
    custom_fields: ['priority'],
  };

  const sampleItem: WorkItem = {
    id: 'item-101',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    title: 'Implement Dark Theme',
    description: 'Ensure dark mode colors meet WCAG standards',
    item_type: 'task',
    status: 'in_progress',
    assignee: 'Alice',
    external_ref_id: 'THEME-01',
    order_index: 1000,
    metadata: { priority: 'High' },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <WorkItemModal
        item={sampleItem}
        isOpen={false}
        onClose={() => {}}
        onSave={() => {}}
        onDelete={() => {}}
        projectSettings={sampleSettings}
        allItems={[sampleItem]}
      />
    );

    expect(container.firstChild).toBeNull();
  });

  it('renders item details when open', () => {
    render(
      <WorkItemModal
        item={sampleItem}
        isOpen={true}
        onClose={() => {}}
        onSave={() => {}}
        onDelete={() => {}}
        projectSettings={sampleSettings}
        allItems={[sampleItem]}
        currentUser={{ full_name: 'Bob Smith', email: 'bob@sunshade.icu' }}
        workspaceMembers={[{ full_name: 'Alice', email: 'alice@sunshade.icu' }]}
      />
    );

    expect(screen.getByDisplayValue('Implement Dark Theme')).toBeDefined();
    expect(screen.getByDisplayValue('Ensure dark mode colors meet WCAG standards')).toBeDefined();
    expect(screen.getByDisplayValue('THEME-01')).toBeDefined();
    expect(screen.getByText('priority')).toBeDefined();
    expect(screen.getByDisplayValue('High')).toBeDefined();
  });

  it('calls onSave with modified fields when save is clicked', async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    await act(async () => {
      render(
        <WorkItemModal
          item={sampleItem}
          isOpen={true}
          onClose={() => {}}
          onSave={handleSave}
          onDelete={() => {}}
          projectSettings={sampleSettings}
          allItems={[sampleItem]}
        />
      );
    });

    const titleInput = screen.getByDisplayValue('Implement Dark Theme');
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'Implement High-Contrast Dark Theme' } });
    });

    const saveBtn = screen.getByText('Save Changes');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(handleSave).toHaveBeenCalledWith(
      'item-101',
      expect.objectContaining({
        title: 'Implement High-Contrast Dark Theme',
        status: 'in_progress',
        item_type: 'task',
      })
    );
  });

  it('displays error banner and keeps modal open when save fails', async () => {
    const handleSave = vi.fn().mockRejectedValue(new Error('Validation error: duplicate ref'));
    const handleClose = vi.fn();

    await act(async () => {
      render(
        <WorkItemModal
          item={sampleItem}
          isOpen={true}
          onClose={handleClose}
          onSave={handleSave}
          onDelete={() => {}}
          projectSettings={sampleSettings}
          allItems={[sampleItem]}
        />
      );
    });

    const saveBtn = screen.getByText('Save Changes');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(handleSave).toHaveBeenCalled();
    // Modal did not close
    expect(handleClose).not.toHaveBeenCalled();
    // Error banner is visible
    expect(screen.getByText('Validation error: duplicate ref')).toBeDefined();
  });

  it('delegates deletion to onDelete without prompting twice', async () => {
    const handleDelete = vi.fn().mockResolvedValue(true);
    const handleClose = vi.fn();

    await act(async () => {
      render(
        <WorkItemModal
          item={sampleItem}
          isOpen={true}
          onClose={handleClose}
          onSave={() => {}}
          onDelete={handleDelete}
          projectSettings={sampleSettings}
          allItems={[sampleItem]}
        />
      );
    });

    const deleteBtn = screen.getByTitle('Delete work item');
    await act(async () => {
      fireEvent.click(deleteBtn);
    });

    expect(handleDelete).toHaveBeenCalledWith('item-101');
    expect(handleClose).toHaveBeenCalled();
  });

  it('excludes parent items from other projects in the parent picker dropdown', async () => {
    const parentSameProject: WorkItem = {
      id: 'epic-same',
      tenant_id: 'tenant-1',
      project_id: 'proj-1',
      title: 'Same Project Epic',
      item_type: 'epic',
      status: 'in_progress',
      order_index: 500,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const parentOtherProject: WorkItem = {
      id: 'epic-other',
      tenant_id: 'tenant-1',
      project_id: 'proj-2',
      title: 'Other Project Epic',
      item_type: 'epic',
      status: 'in_progress',
      order_index: 600,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    render(
      <WorkItemModal
        item={sampleItem}
        isOpen={true}
        onClose={() => {}}
        onSave={() => {}}
        onDelete={() => {}}
        projectSettings={sampleSettings}
        allItems={[sampleItem, parentSameProject, parentOtherProject]}
      />
    );

    // Same project epic should be present as an option
    expect(screen.queryByText(/Same Project Epic/)).toBeDefined();
    // Other project epic must be completely absent from options
    expect(screen.queryByText(/Other Project Epic/)).toBeNull();
  });

  it('allows text edits to null metadata without requiring numbers', async () => {
    const itemWithNullMeta: WorkItem = {
      ...sampleItem,
      metadata: { custom_note: null },
    };

    render(
      <WorkItemModal
        item={itemWithNullMeta}
        isOpen={true}
        onClose={() => {}}
        onSave={() => {}}
        onDelete={() => {}}
        projectSettings={sampleSettings}
        allItems={[itemWithNullMeta]}
      />
    );

    const input = screen.getByPlaceholderText('Enter custom_note...');
    await act(async () => {
      fireEvent.change(input, { target: { value: 'This is a text note' } });
    });

    // Should not display "Must be a valid number" error
    expect(screen.queryByText(/Must be a valid number/)).toBeNull();
    expect(screen.getByDisplayValue('This is a text note')).toBeDefined();
  });
});
