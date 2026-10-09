import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { BulkActionsToolbar } from '@/components/BulkActionsToolbar';
import { ProjectToolbar } from '@/components/board/ProjectToolbar';
import { SprintDefinition, WorkItem, ProjectSettings } from '@/types/tracker';
import { sortSprintNames } from '@/lib/sprint-utils';

describe('BUG-TRK-SPRINT-DROPDOWN-SOURCE-DESYNC: Populate Sprint Selectors from Configured Sprints Table', () => {
  const configuredSprints: SprintDefinition[] = [
    {
      id: 'sp-q1',
      name: 'Sprint 2026-Q1',
      status: 'active',
      is_current: true,
    },
    {
      id: 'sp-q2-empty',
      name: 'Sprint 2026-Q2',
      status: 'planned',
      is_current: false,
    },
    {
      id: 'sp-q3-new-empty',
      name: 'Sprint 2026-Q3 (Newly Configured)',
      status: 'planned',
      is_current: false,
    },
  ];

  // Only Sprint 2026-Q1 has items; Q2 and Q3 have 0 items
  const mockItems: WorkItem[] = [
    {
      id: 'item-1',
      tenant_id: 't1',
      project_id: 'p1',
      title: 'Active item in Q1',
      item_type: 'story',
      status: 'in_progress',
      order_index: 10,
      metadata: { sprint: 'Sprint 2026-Q1' },
      created_at: '',
      updated_at: '',
    },
  ];

  it('populates availableSprints from configured database sprints even when sprints have 0 items', () => {
    // Simulated availableSprints logic mirroring ProjectWorkspaceView.tsx
    const dbSprints = configuredSprints;
    const projectSettingsSprints: SprintDefinition[] = [];

    const set = new Set<string>();
    dbSprints.forEach((s) => {
      if (s.name && s.status !== 'unplanned' && s.name.toLowerCase() !== 'unplanned') {
        set.add(s.name);
      }
    });
    projectSettingsSprints.forEach((s) => {
      if (s.name && s.status !== 'unplanned' && s.name.toLowerCase() !== 'unplanned') {
        set.add(s.name);
      }
    });
    mockItems.forEach((it) => {
      if (it.metadata?.sprint) {
        const s = String(it.metadata.sprint).trim();
        if (s && s.toLowerCase() !== 'unplanned' && s !== '__none__') {
          set.add(s);
        }
      }
    });

    const availableSprints = sortSprintNames(Array.from(set), [...dbSprints, ...projectSettingsSprints]);

    // All 3 sprints must be present, including the 0-item sprints
    expect(availableSprints).toContain('Sprint 2026-Q1');
    expect(availableSprints).toContain('Sprint 2026-Q2');
    expect(availableSprints).toContain('Sprint 2026-Q3 (Newly Configured)');
    expect(availableSprints).toHaveLength(3);
  });

  it('renders newly configured 0-item sprints in Move Sprint -> dropdown in BulkActionsToolbar', () => {
    const onMoveToSprint = vi.fn();
    const availableSprints = [
      'Sprint 2026-Q1',
      'Sprint 2026-Q2',
      'Sprint 2026-Q3 (Newly Configured)',
    ];

    render(
      <BulkActionsToolbar
        selectedCount={1}
        availableSprints={availableSprints}
        statuses={[{ id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 1 }]}
        onMoveToSprint={onMoveToSprint}
        onSetStatus={vi.fn()}
        onAssignMember={vi.fn()}
        onAdjustPoints={vi.fn()}
        onDeleteSelected={vi.fn()}
        onClearSelection={vi.fn()}
      />
    );

    const select = screen.getByTestId('bulk-move-sprint-select') as HTMLSelectElement;
    expect(select).toBeDefined();

    // Verify all options are rendered including the empty configured sprints
    const options = Array.from(select.options).map((opt) => opt.value);
    expect(options).toContain('__none__');
    expect(options).toContain('Sprint 2026-Q1');
    expect(options).toContain('Sprint 2026-Q2');
    expect(options).toContain('Sprint 2026-Q3 (Newly Configured)');

    // Selecting an empty newly configured sprint executes move
    fireEvent.change(select, { target: { value: 'Sprint 2026-Q3 (Newly Configured)' } });
    expect(onMoveToSprint).toHaveBeenCalledWith('Sprint 2026-Q3 (Newly Configured)');
  });

  it('renders empty configured sprints in ProjectToolbar sprint filter options', () => {
    const onSelectSprint = vi.fn();
    const availableSprints = [
      'Sprint 2026-Q1',
      'Sprint 2026-Q2',
      'Sprint 2026-Q3 (Newly Configured)',
    ];

    const mockSettings: ProjectSettings = {
      schema_version: '1.0',
      hierarchy: [],
      statuses: [],
      custom_fields: [],
    };

    render(
      <ProjectToolbar
        selectedSprint="all"
        setSelectedSprint={onSelectSprint}
        availableSprints={availableSprints}
        statusFilterOptions={[]}
        effectiveSelectedStatuses={[]}
        setSelectedStatuses={vi.fn()}
        levelFilterOptions={[]}
        effectiveSelectedLevels={[]}
        setSelectedLevels={vi.fn()}
        pointMode="granular"
        handlePointModeChange={vi.fn()}
        collapseAllColumns={vi.fn()}
        expandAllColumns={vi.fn()}
        items={mockItems}
        projectSettings={mockSettings}
      />
    );

    // The sprint selector must contain the empty sprints
    expect(screen.getByText(/Sprint 2026-Q2 \(0 items\)/i)).toBeDefined();
    expect(screen.getByText(/Sprint 2026-Q3 \(Newly Configured\) \(0 items\)/i)).toBeDefined();
    expect(screen.getByText(/Sprint 2026-Q1 \(1 item\)/i)).toBeDefined();
  });
});
