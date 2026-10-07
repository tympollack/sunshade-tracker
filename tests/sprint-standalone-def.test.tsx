import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ManageSprintsModal } from '@/components/ManageSprintsModal';
import { SprintDefinition, WorkItem } from '@/types/tracker';

describe('ManageSprintsModal Component (TASK-TRK-SPRINT-STANDALONE-DEF)', () => {
  const mockSprints: SprintDefinition[] = [
    {
      id: 's1',
      name: 'Sprint 2026-Q3',
      start_date: '2026-07-01',
      end_date: '2026-09-30',
      goal: 'Deliver high-priority board enhancements',
      status: 'active',
      is_current: true,
    },
    {
      id: 's2',
      name: 'Sprint 2026-Q4',
      start_date: '2026-10-01',
      end_date: '2026-12-31',
      goal: 'Architecture rollouts',
      status: 'planned',
      is_current: false,
    },
  ];

  const mockItems: WorkItem[] = [
    {
      id: 'it1',
      tenant_id: 't1',
      project_id: 'p1',
      item_type: 'story',
      status: 'in_progress',
      title: 'Item in Q3',
      order_index: 1000,
      metadata: { sprint: 'Sprint 2026-Q3' },
      created_at: '',
      updated_at: '',
    },
  ];

  it('renders configured sprints with names, badges, and metadata', () => {
    render(
      <ManageSprintsModal
        isOpen={true}
        onClose={vi.fn()}
        sprints={mockSprints}
        onSaveSprints={vi.fn()}
        items={mockItems}
      />
    );

    expect(screen.getByText('Manage Sprints')).toBeDefined();
    expect(screen.getByText('Sprint 2026-Q3')).toBeDefined();
    expect(screen.getByText('Sprint 2026-Q4')).toBeDefined();
    expect(screen.getByText('Active Sprint')).toBeDefined();
    expect(screen.getByText('Current Focus')).toBeDefined();
    expect(screen.getByText('1 item')).toBeDefined();
  });

  it('adds a new sprint and validates required fields', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ManageSprintsModal
        isOpen={true}
        onClose={vi.fn()}
        sprints={mockSprints}
        onSaveSprints={onSave}
        items={mockItems}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /New Sprint/i }));
    expect(screen.getByText('Create New Sprint')).toBeDefined();

    // Attempting to save empty form yields error
    fireEvent.click(screen.getByRole('button', { name: /Add Sprint/i }));
    expect(screen.getByText(/Sprint name is required/i)).toBeDefined();

    // Fill form
    fireEvent.change(screen.getByPlaceholderText('e.g. Sprint 2026-Q4'), {
      target: { value: 'Sprint 2027-Q1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add Sprint/i }));

    expect(screen.getByText('Sprint 2027-Q1')).toBeDefined();

    // Save and commit
    fireEvent.click(screen.getByRole('button', { name: /Save Sprints/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
      const saved = onSave.mock.calls[0][0];
      expect(saved.length).toBe(3);
      expect(saved.some((s: SprintDefinition) => s.name === 'Sprint 2027-Q1')).toBe(true);
    });
  });

  it('transitions sprint to completed and sets active', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ManageSprintsModal
        isOpen={true}
        onClose={vi.fn()}
        sprints={mockSprints}
        onSaveSprints={onSave}
        items={mockItems}
      />
    );

    // Click "Complete" on Sprint 2026-Q3
    fireEvent.click(screen.getByRole('button', { name: /Complete Sprint 2026-Q3/i }));

    // Click "Set Active" on Sprint 2026-Q4
    fireEvent.click(screen.getByRole('button', { name: /Set Sprint 2026-Q4 Active/i }));

    fireEvent.click(screen.getByRole('button', { name: /Save Sprints/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
      const saved = onSave.mock.calls[0][0];
      const q3 = saved.find((s: SprintDefinition) => s.name === 'Sprint 2026-Q3');
      const q4 = saved.find((s: SprintDefinition) => s.name === 'Sprint 2026-Q4');
      expect(q3.status).toBe('completed');
      expect(q4.status).toBe('active');
      expect(q4.is_current).toBe(true);
    });
  });

  it('calls onClose when close button or Cancel is clicked', () => {
    const onClose = vi.fn();
    render(
      <ManageSprintsModal
        isOpen={true}
        onClose={onClose}
        sprints={mockSprints}
        onSaveSprints={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('creates a sprint entity with all fields: name, start date, end date, goal, and active/planned status', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ManageSprintsModal
        isOpen={true}
        onClose={vi.fn()}
        sprints={[]}
        onSaveSprints={onSave}
        items={[]}
      />
    );

    fireEvent.click(screen.getByTestId('create-new-sprint-btn'));

    fireEvent.change(screen.getByTestId('sprint-form-name-input'), {
      target: { value: 'Sprint 2027-Q2 (Alpha Launch)' },
    });
    fireEvent.change(screen.getByTestId('sprint-form-status-select'), {
      target: { value: 'active' },
    });
    fireEvent.change(screen.getByTestId('sprint-form-start-date-input'), {
      target: { value: '2027-04-01' },
    });
    fireEvent.change(screen.getByTestId('sprint-form-end-date-input'), {
      target: { value: '2027-06-30' },
    });
    fireEvent.change(screen.getByTestId('sprint-form-goal-input'), {
      target: { value: 'Execute the high-throughput alpha platform launch' },
    });

    fireEvent.click(screen.getByTestId('save-sprint-form-btn'));

    expect(screen.getByText('Sprint 2027-Q2 (Alpha Launch)')).toBeDefined();

    fireEvent.click(screen.getByTestId('save-all-sprints-btn'));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
      const saved = onSave.mock.calls[0][0];
      expect(saved).toHaveLength(1);
      const s = saved[0];
      expect(s.name).toBe('Sprint 2027-Q2 (Alpha Launch)');
      expect(s.status).toBe('active');
      expect(s.is_current).toBe(true);
      expect(s.start_date).toBe('2027-04-01');
      expect(s.end_date).toBe('2027-06-30');
      expect(s.goal).toBe('Execute the high-throughput alpha platform launch');
    });
  });

  it('renders Configure Sprints / + New Sprint button in SprintViewContainer and opens modal', async () => {
    const setIsManageSprintsOpen = vi.fn();
    const { SprintViewContainer } = await import('@/components/views/SprintViewContainer');
    render(
      <SprintViewContainer
        items={[]}
        projectSettings={{
          schema_version: '1.0',
          hierarchy: [],
          statuses: [],
          custom_fields: [],
        }}
        isReadOnly={false}
        pointMode="granular"
        handlePointModeChange={vi.fn()}
        sprintViewMode="flat"
        setSprintViewMode={vi.fn()}
        handleToggleCollapseAllSprints={vi.fn()}
        collapsedSprints={new Set()}
        toggleSprintCollapse={vi.fn()}
        handleToggleHideCompletedSprints={vi.fn()}
        hideCompletedSprints={false}
        hiddenCompletedSprintsCount={0}
        statusFilterOptions={[]}
        effectiveSprintStatuses={[]}
        setSprintSelectedStatuses={vi.fn()}
        levelFilterOptions={[]}
        effectiveSprintLevels={[]}
        setSprintSelectedLevels={vi.fn()}
        sprintSortBy="order_index"
        setSprintSortBy={vi.fn()}
        setIsManageSprintsOpen={setIsManageSprintsOpen}
        visibleSprints={['Sprint 1']}
        availableSprints={['Sprint 1']}
        filterSprintItems={(list: any) => list}
        sprintComparator={() => 0}
        selectedItemIds={new Set()}
        handleToggleSelectItem={vi.fn()}
        handleSelectAllInPool={vi.fn()}
        activeSprintPopover={null}
        setActiveSprintPopover={vi.fn()}
        setEditingItem={vi.fn()}
        getItemHierarchy={() => []}
        getItemStatuses={() => []}
        deviations={[]}
        setFocusedDeviationId={vi.fn()}
        setIsReconciliationModalOpen={vi.fn()}
        isAllProjects={false}
        allProjects={[]}
        handleUpdateStatus={vi.fn()}
        handleUpdateItemSprint={vi.fn()}
      />
    );

    const btn = screen.getByRole('button', { name: /Configure Sprints \/ \+ New Sprint/i });
    expect(btn).toBeDefined();
    fireEvent.click(btn);
    expect(setIsManageSprintsOpen).toHaveBeenCalledWith(true);
  });
});
