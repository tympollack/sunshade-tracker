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

  it('chunks batch remap requests into batches of MAX_BULK_ITEMS (100) when items exceed 100', async () => {
    // Generate 150 deviation items
    const manyDeviations: SchemaDeviation[] = Array.from({ length: 150 }, (_, i) => ({
      id: `dev-${i}`,
      itemId: `item-${i}`,
      itemRef: `REF-${i}`,
      itemTitle: `Item ${i}`,
      deviationType: 'unmapped_level',
      currentValue: 'subtask',
      expectedValues: ['epic', 'story', 'task'],
      message: "Item type 'subtask' is not in hierarchy",
    }));

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, updated_count: 100 }),
    });
    global.fetch = fetchMock;

    const onReconciled = vi.fn();

    render(
      <SchemaReconciliationModal
        isOpen={true}
        onClose={vi.fn()}
        deviations={manyDeviations}
        projectSettings={mockSettings}
        projectIdOrSlug="cozy"
        tenantSlug="pym-energy"
        onReconciled={onReconciled}
      />
    );

    const remapBtn = screen.getByTestId('batch-remap-level-btn');
    expect(remapBtn).toHaveTextContent('Remap 150 items');
    fireEvent.click(remapBtn);

    await waitFor(() => {
      // Must have split 150 items into 2 calls: 100 items and 50 items
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const firstCallArgs = fetchMock.mock.calls[0];
    const secondCallArgs = fetchMock.mock.calls[1];

    const firstBody = JSON.parse(firstCallArgs[1].body);
    const secondBody = JSON.parse(secondCallArgs[1].body);

    expect(firstBody.ids).toHaveLength(100);
    expect(secondBody.ids).toHaveLength(50);
    expect(firstBody.updates).toEqual({ item_type: 'task' });
    expect(secondBody.updates).toEqual({ item_type: 'task' });

    await waitFor(() => {
      expect(onReconciled).toHaveBeenCalled();
    });
  });

  it('surfaces partial failure when a batch chunk fails but still invokes onReconciled for successful chunks', async () => {
    const manyDeviations: SchemaDeviation[] = Array.from({ length: 120 }, (_, i) => ({
      id: `dev-${i}`,
      itemId: `item-${i}`,
      itemRef: `REF-${i}`,
      itemTitle: `Item ${i}`,
      deviationType: 'unmapped_level',
      currentValue: 'subtask',
      expectedValues: ['epic', 'story', 'task'],
      message: "Item type 'subtask' is not in hierarchy",
    }));

    // First chunk (100 items) succeeds, second chunk (20 items) fails
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      })
      .mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: 'Database lock timeout' }),
      });
    global.fetch = fetchMock;

    const onReconciled = vi.fn();

    render(
      <SchemaReconciliationModal
        isOpen={true}
        onClose={vi.fn()}
        deviations={manyDeviations}
        projectSettings={mockSettings}
        projectIdOrSlug="cozy"
        tenantSlug="pym-energy"
        onReconciled={onReconciled}
      />
    );

    const remapBtn = screen.getByTestId('batch-remap-level-btn');
    fireEvent.click(remapBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Remapped 100 item\(s\), but 20 item\(s\) failed: Database lock timeout/)
      ).toBeInTheDocument();
    });

    // onReconciled should still be called because 100 items succeeded
    expect(onReconciled).toHaveBeenCalled();
  });

  it('correctly resolves deepest existing level even when hierarchy array is out of order', async () => {
    // Array where task (level 3) is first, and story (level 2) is last
    const unorderedSettings: ProjectSettings = {
      schema_version: '1.0',
      hierarchy: [
        { type: 'task', label: 'Task', level: 3, allowed_parents: ['story'] },
        { type: 'epic', label: 'Epic', level: 1, allowed_parents: [] },
        { type: 'story', label: 'Story', level: 2, allowed_parents: ['epic'] },
      ],
      statuses: mockSettings.statuses,
      custom_fields: [],
    };

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    global.fetch = fetchMock;

    render(
      <SchemaReconciliationModal
        isOpen={true}
        onClose={vi.fn()}
        deviations={mockDeviations}
        projectSettings={unorderedSettings}
        projectIdOrSlug="cozy"
        tenantSlug="pym-energy"
        onReconciled={vi.fn()}
      />
    );

    const extendBtn = screen.getByTestId('extend-hierarchy-btn-subtask');
    fireEvent.click(extendBtn);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const callArgs = fetchMock.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    const newLevel = body.settings.hierarchy.find((h: any) => h.type === 'subtask');
    expect(newLevel).toBeDefined();
    // Must be level 4 and allowed parent must be 'task' (level 3), NOT 'story' (the last array element)
    expect(newLevel.level).toBe(4);
    expect(newLevel.allowed_parents).toEqual(['task']);
  });

  it('scopes portfolio reconciliation actions and settings to owning project without corrupting other projects', async () => {
    const allProjects = [
      {
        id: 'proj-alpha-id',
        slug: 'proj-alpha',
        name: 'Alpha Project',
        settings: mockSettings, // epic -> story -> task
      },
      {
        id: 'proj-beta-id',
        slug: 'proj-beta',
        name: 'Beta Project',
        settings: {
          schema_version: '1.0',
          hierarchy: [
            { type: 'initiative', label: 'Initiative', level: 1, allowed_parents: [] },
            { type: 'feature', label: 'Feature', level: 2, allowed_parents: ['initiative'] },
          ],
          statuses: [
            { id: 'open', label: 'Open', color: '#3b82f6', order: 1000 },
            { id: 'done', label: 'Done', color: '#10b981', order: 2000 },
          ],
          custom_fields: [],
        },
      },
    ];

    const portfolioDeviations: SchemaDeviation[] = [
      {
        id: 'beta-dev-1',
        itemId: 'item-beta-1',
        itemRef: 'BETA-1',
        itemTitle: 'Beta Item Deviation',
        projectId: 'proj-beta-id',
        projectSlug: 'proj-beta',
        projectName: 'Beta Project',
        deviationType: 'unmapped_level',
        currentValue: 'defect',
        expectedValues: ['initiative', 'feature'],
        message: "Item type 'defect' is not in hierarchy",
      },
    ];

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    global.fetch = fetchMock;

    render(
      <SchemaReconciliationModal
        isOpen={true}
        onClose={vi.fn()}
        deviations={portfolioDeviations}
        projectSettings={mockSettings}
        tenantSlug="pym-energy"
        allProjects={allProjects}
        isPortfolio={true}
        onReconciled={vi.fn()}
      />
    );

    // Project header should be displayed for Beta Project
    expect(screen.getByText('Project: Beta Project')).toBeInTheDocument();

    const extendBtn = screen.getByTestId('extend-hierarchy-btn-defect');
    fireEvent.click(extendBtn);

    await waitFor(() => {
      // Must update proj-beta's settings endpoint, NOT cozy or merged settings
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/v1/projects/proj-beta/settings',
        expect.any(Object)
      );
    });

    const callArgs = fetchMock.mock.calls[0];
    const body = JSON.parse(callArgs[1].body);
    // Hierarchy must be extended from Beta's schema (initiative -> feature -> defect), NOT Alpha's
    expect(body.settings.hierarchy).toHaveLength(3);
    const addedLevel = body.settings.hierarchy.find((h: any) => h.type === 'defect');
    expect(addedLevel).toMatchObject({
      type: 'defect',
      level: 3,
      allowed_parents: ['feature'],
    });
  });

  it('auto-switches section and project filter when focusDeviationId is provided', () => {
    const allProjects = [
      {
        id: 'proj-alpha-id',
        slug: 'proj-alpha',
        name: 'Alpha Project',
        settings: mockSettings,
      },
      {
        id: 'proj-beta-id',
        slug: 'proj-beta',
        name: 'Beta Project',
        settings: mockSettings,
      },
    ];

    const deviations: SchemaDeviation[] = [
      {
        id: 'level-dev',
        itemId: 'item-1',
        itemRef: 'REF-1',
        itemTitle: 'Item 1',
        projectId: 'proj-alpha-id',
        projectSlug: 'proj-alpha',
        deviationType: 'unmapped_level',
        currentValue: 'subtask',
        expectedValues: ['task'],
        message: 'Level error',
      },
      {
        id: 'status-dev-beta',
        itemId: 'item-2',
        itemRef: 'REF-2',
        itemTitle: 'Item 2',
        projectId: 'proj-beta-id',
        projectSlug: 'proj-beta',
        projectName: 'Beta Project',
        deviationType: 'unmapped_status',
        currentValue: 'in_review',
        expectedValues: ['not_started'],
        message: 'Status error',
      },
    ];

    render(
      <SchemaReconciliationModal
        isOpen={true}
        onClose={vi.fn()}
        deviations={deviations}
        projectSettings={mockSettings}
        tenantSlug="pym-energy"
        allProjects={allProjects}
        isPortfolio={true}
        focusDeviationId="status-dev-beta"
        onReconciled={vi.fn()}
      />
    );

    // Should have automatically navigated to Unmapped Statuses section
    expect(screen.getByText('Extend Statuses (Add "in_review")')).toBeInTheDocument();
  });
});

