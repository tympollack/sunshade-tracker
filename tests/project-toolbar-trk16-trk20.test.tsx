import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectToolbar } from '@/components/board/ProjectToolbar';
import { ProjectSettings, WorkItem } from '@/types/tracker';
import { KanbanCard } from '@/components/board/KanbanCard';

describe('TRK-16 and TRK-20: ProjectToolbar and KanbanCard polishing', () => {
  const mockSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [
      { type: 'story', label: 'Story', level: 1, allowed_parents: [] },
      { type: 'task', label: 'Task', level: 2, allowed_parents: ['story'] },
    ],
    statuses: [
      { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
      { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      { id: 'complete', label: 'Complete', color: '#22c55e', order: 3 },
    ],
    custom_fields: [],
  };

  const statusOptions = [
    { id: 'not_started', label: 'Not Started' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'complete', label: 'Complete' },
  ];

  const levelOptions = [
    { id: 'story', label: 'Story' },
    { id: 'task', label: 'Task' },
  ];

  it('TRK-16: renders ProjectToolbar with sticky top position and frosted glass styling', () => {
    const { container } = render(
      <ProjectToolbar
        statusFilterOptions={statusOptions}
        effectiveSelectedStatuses={['not_started', 'in_progress', 'complete']}
        setSelectedStatuses={vi.fn()}
        levelFilterOptions={levelOptions}
        effectiveSelectedLevels={['story', 'task']}
        setSelectedLevels={vi.fn()}
        selectedSprint="all"
        setSelectedSprint={vi.fn()}
        availableSprints={['Sprint 1']}
        items={[]}
        projectSettings={mockSettings}
        pointMode="macro"
        handlePointModeChange={vi.fn()}
        collapseAllColumns={vi.fn()}
        expandAllColumns={vi.fn()}
      />
    );

    const toolbar = container.querySelector('[data-testid="board-filter-toolbar"]');
    expect(toolbar).not.toBeNull();
    expect(toolbar?.className).toContain('sticky');
    expect(toolbar?.className).toContain('backdrop-blur-md');
  });

  it('TRK-16: renders collapse toggle button and folds into single-line micro-bar with active filter pill', () => {
    // 1 filter active (only 'in_progress' selected out of 3 statuses)
    const { rerender } = render(
      <ProjectToolbar
        statusFilterOptions={statusOptions}
        effectiveSelectedStatuses={['in_progress']}
        setSelectedStatuses={vi.fn()}
        levelFilterOptions={levelOptions}
        effectiveSelectedLevels={['story', 'task']}
        setSelectedLevels={vi.fn()}
        selectedSprint="all"
        setSelectedSprint={vi.fn()}
        availableSprints={['Sprint 1']}
        items={[]}
        projectSettings={mockSettings}
        pointMode="macro"
        handlePointModeChange={vi.fn()}
        collapseAllColumns={vi.fn()}
        expandAllColumns={vi.fn()}
      />
    );

    // Active filter pill should display "1"
    const pill = screen.getByTestId('active-filter-counter-pill');
    expect(pill.textContent).toBe('1');

    // Click collapse toggle button
    const toggleBtn = screen.getByTestId('filter-collapse-toggle-btn');
    fireEvent.click(toggleBtn);

    // Should now be collapsed into single-line micro-bar showing active indicators
    expect(screen.getByText('Active:')).toBeDefined();
    expect(screen.getByText('1 Statuses')).toBeDefined();

    // Re-clicking toggle button expands it back
    const expandBtn = screen.getByTestId('filter-collapse-toggle-btn');
    fireEvent.click(expandBtn);
    expect(screen.getByText('Sprint:')).toBeDefined();
  });

  it('TRK-20: ProjectToolbar does NOT render manual card height toggle buttons (compact/standard/full)', () => {
    render(
      <ProjectToolbar
        statusFilterOptions={statusOptions}
        effectiveSelectedStatuses={['not_started', 'in_progress', 'complete']}
        setSelectedStatuses={vi.fn()}
        levelFilterOptions={levelOptions}
        effectiveSelectedLevels={['story', 'task']}
        setSelectedLevels={vi.fn()}
        selectedSprint="all"
        setSelectedSprint={vi.fn()}
        availableSprints={[]}
        items={[]}
        projectSettings={mockSettings}
        pointMode="macro"
        handlePointModeChange={vi.fn()}
        collapseAllColumns={vi.fn()}
        expandAllColumns={vi.fn()}
      />
    );

    expect(screen.queryByText('Height:')).toBeNull();
    expect(screen.queryByText('compact')).toBeNull();
    expect(screen.queryByText('standard')).toBeNull();
  });

  it('TRK-20: KanbanCard enforces line-clamp-2 on title', () => {
    const item: WorkItem = {
      id: 'item-1',
      tenant_id: 't-1',
      project_id: 'p-1',
      item_type: 'task',
      status: 'not_started',
      title: 'This is a very long task title that needs to be cleanly clamped to two lines on the board canvas',
      order_index: 1000,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    render(
      <KanbanCard
        item={item}
        itemHierarchy={mockSettings.hierarchy}
      />
    );

    const titleEl = screen.getByText(item.title);
    expect(titleEl.className).toContain('line-clamp-2');
  });
});
