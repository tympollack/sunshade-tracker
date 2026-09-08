import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SchemaReconciliationModal } from '@/components/SchemaReconciliationModal';
import { ProjectSettings } from '@/types/tracker';
import { SchemaDeviation } from '@/lib/schema-deviation';

const mockSettings: ProjectSettings = {
  schema_version: '1.0',
  hierarchy: [
    { type: 'epic', label: 'Epic', level: 1, allowed_parents: [] },
    { type: 'story', label: 'Story', level: 2, allowed_parents: ['epic'] },
    { type: 'task', label: 'Task', level: 3, allowed_parents: ['story'] },
  ],
  statuses: [
    { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1000 },
    { id: 'in_progress', label: 'In Progress', color: '#3b82f6', order: 2000 },
    { id: 'complete', label: 'Complete', color: '#10b981', order: 3000 },
  ],
  custom_fields: [],
};

const mockDeviations: SchemaDeviation[] = [
  {
    id: 'dev-1',
    itemId: 'item-101',
    itemRef: 'COZY-101',
    itemTitle: 'Subtask Item 1',
    deviationType: 'unmapped_level',
    currentValue: 'subtask',
    expectedValues: ['epic', 'story', 'task'],
    message: "Item type 'subtask' is not in hierarchy",
  },
  {
    id: 'dev-2',
    itemId: 'item-102',
    itemRef: 'COZY-102',
    itemTitle: 'Subtask Item 2',
    deviationType: 'unmapped_level',
    currentValue: 'subtask',
    expectedValues: ['epic', 'story', 'task'],
    message: "Item type 'subtask' is not in hierarchy",
  },
];

describe('SchemaReconciliationModal', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders nothing when isOpen is false', () => {
    render(
      <SchemaReconciliationModal
        isOpen={false}
        onClose={vi.fn()}
        deviations={mockDeviations}
        projectSettings={mockSettings}
        projectIdOrSlug="cozy"
        tenantSlug="pym-energy"
        onReconciled={vi.fn()}
      />
    );
    expect(screen.queryByTestId('schema-reconciliation-modal')).not.toBeInTheDocument();
  });

  it('renders modal with detected deviations count and issue list when isOpen is true', () => {
    render(
      <SchemaReconciliationModal
        isOpen={true}
        onClose={vi.fn()}
        deviations={mockDeviations}
        projectSettings={mockSettings}
        projectIdOrSlug="cozy"
        tenantSlug="pym-energy"
        onReconciled={vi.fn()}
      />
    );

    expect(screen.getByTestId('schema-reconciliation-modal')).toBeInTheDocument();
    expect(screen.getByText('2 issues')).toBeInTheDocument();
    expect(screen.getByText(/Subtask Item 1/)).toBeInTheDocument();
    expect(screen.getByText(/Subtask Item 2/)).toBeInTheDocument();
  });

  it('executes 1-click Extend Project Hierarchy API call when clicking extend button', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    global.fetch = fetchMock;

    const onReconciled = vi.fn();

    render(
      <SchemaReconciliationModal
        isOpen={true}
        onClose={vi.fn()}
        deviations={mockDeviations}
        projectSettings={mockSettings}
        projectIdOrSlug="cozy"
        tenantSlug="pym-energy"
        onReconciled={onReconciled}
      />
    );

    const extendBtn = screen.getByTestId('extend-hierarchy-btn-subtask');
    fireEvent.click(extendBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/projects/cozy/settings',
        expect.objectContaining({
          method: 'PUT',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-tenant-slug': 'pym-energy',
          }),
        })
      );
    });

    const callArgs = fetchMock.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    expect(body.settings.hierarchy).toHaveLength(4);
    expect(body.settings.hierarchy[3]).toMatchObject({
      type: 'subtask',
      label: 'Subtask',
      level: 4,
      allowed_parents: ['task'],
    });

    await waitFor(() => {
      expect(onReconciled).toHaveBeenCalled();
    });
  });

  it('executes Batch Remap item types API call via bulk PATCH', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, updated_count: 2 }),
    });
    global.fetch = fetchMock;

    const onReconciled = vi.fn();

    render(
      <SchemaReconciliationModal
        isOpen={true}
        onClose={vi.fn()}
        deviations={mockDeviations}
        projectSettings={mockSettings}
        projectIdOrSlug="cozy"
        tenantSlug="pym-energy"
        onReconciled={onReconciled}
      />
    );

    const remapBtn = screen.getByTestId('batch-remap-level-btn');
    fireEvent.click(remapBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/items/bulk',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({
            ids: ['item-101', 'item-102'],
            updates: { item_type: 'task' },
          }),
        })
      );
    });

    await waitFor(() => {
      expect(onReconciled).toHaveBeenCalled();
    });
  });

  it('closes on Escape key press', () => {
    const onClose = vi.fn();
    render(
      <SchemaReconciliationModal
        isOpen={true}
        onClose={onClose}
        deviations={mockDeviations}
        projectSettings={mockSettings}
        projectIdOrSlug="cozy"
        tenantSlug="pym-energy"
        onReconciled={vi.fn()}
      />
    );

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalled();
  });
});
