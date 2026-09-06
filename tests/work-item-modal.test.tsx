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
    expect(screen.getByText('priority:')).toBeDefined();
    expect(screen.getByText('High')).toBeDefined();
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
});
