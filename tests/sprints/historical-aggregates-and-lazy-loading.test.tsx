import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { SprintViewContainer } from '@/components/views/SprintViewContainer';
import { SprintDefinition, ProjectSettings } from '@/types/tracker';

describe('Historical Sprint Aggregates & Lazy-Loading (TRK-24)', () => {
  const sampleSettings: ProjectSettings = {
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

  const completedSprintWithFrozenSummary: SprintDefinition = {
    id: 'sprint-2026-q2',
    name: 'Sprint 2026-Q2',
    status: 'completed',
    is_active: false,
    committed_points: 35,
    metadata: {
      summary: {
        total_tasks: 12,
        completed_tasks: 10,
        committed_points: 35,
        completed_points: 30,
        velocity: 30,
        closed_at: '2026-06-30T23:59:59.000Z',
      },
    },
  };

  it('renders points, total items, progress, and (Frozen) badge directly from summary without child items in state', () => {
    render(
      <SprintViewContainer
        items={[]} // Zero items loaded in memory (cold-partitioned)
        projectSettings={sampleSettings}
        isReadOnly={false}
        pointMode="granular"
        handlePointModeChange={vi.fn()}
        sprintViewMode="flat"
        setSprintViewMode={vi.fn()}
        handleToggleCollapseAllSprints={vi.fn()}
        collapsedSprints={new Set(['Sprint 2026-Q2'])}
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
        setIsManageSprintsOpen={vi.fn()}
        visibleSprints={['Sprint 2026-Q2']}
        availableSprints={['Sprint 2026-Q2']}
        availableSprintDefs={[completedSprintWithFrozenSummary]}
        filterSprintItems={(list) => list}
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

    // Verify summary values rendered
    const pointsEl = screen.getByTestId('sprint-points-Sprint 2026-Q2');
    expect(pointsEl.textContent).toContain('12 items');
    expect(pointsEl.textContent).toContain('35 pts');
    expect(pointsEl.textContent).toContain('(Frozen)');

    // Verify (Frozen) badge
    expect(screen.getByTestId('sprint-frozen-badge-Sprint 2026-Q2')).toBeDefined();
  });

  it('renders on-demand load card when expanded and triggers onLazyLoadSprint when button is clicked', async () => {
    const onLazyLoadSprint = vi.fn().mockResolvedValue(undefined);

    render(
      <SprintViewContainer
        items={[]}
        projectSettings={sampleSettings}
        isReadOnly={false}
        pointMode="granular"
        handlePointModeChange={vi.fn()}
        sprintViewMode="flat"
        setSprintViewMode={vi.fn()}
        handleToggleCollapseAllSprints={vi.fn()}
        collapsedSprints={new Set()} // Expanded!
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
        setIsManageSprintsOpen={vi.fn()}
        visibleSprints={['Sprint 2026-Q2']}
        availableSprints={['Sprint 2026-Q2']}
        availableSprintDefs={[completedSprintWithFrozenSummary]}
        filterSprintItems={(list) => list}
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
        onLazyLoadSprint={onLazyLoadSprint}
      />
    );

    expect(screen.getByTestId('sprint-lazy-card-Sprint 2026-Q2')).toBeDefined();
    const loadBtn = screen.getByTestId('lazy-load-btn-Sprint 2026-Q2');
    expect(loadBtn.textContent).toContain('Load 12 Work Items');

    await act(async () => {
      fireEvent.click(loadBtn);
    });
    expect(onLazyLoadSprint).toHaveBeenCalledWith('sprint-2026-q2');
  });

  it('automatically triggers onLazyLoadSprint when expanding a collapsed historical sprint with no items in state', async () => {
    const onLazyLoadSprint = vi.fn().mockResolvedValue(undefined);
    const toggleSprintCollapse = vi.fn();

    render(
      <SprintViewContainer
        items={[]}
        projectSettings={sampleSettings}
        isReadOnly={false}
        pointMode="granular"
        handlePointModeChange={vi.fn()}
        sprintViewMode="flat"
        setSprintViewMode={vi.fn()}
        handleToggleCollapseAllSprints={vi.fn()}
        collapsedSprints={new Set(['Sprint 2026-Q2'])} // Initially collapsed
        toggleSprintCollapse={toggleSprintCollapse}
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
        setIsManageSprintsOpen={vi.fn()}
        visibleSprints={['Sprint 2026-Q2']}
        availableSprints={['Sprint 2026-Q2']}
        availableSprintDefs={[completedSprintWithFrozenSummary]}
        filterSprintItems={(list) => list}
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
        onLazyLoadSprint={onLazyLoadSprint}
      />
    );

    const collapseToggle = screen.getByTestId('collapse-toggle-Sprint 2026-Q2');
    await act(async () => {
      fireEvent.click(collapseToggle);
    });

    expect(toggleSprintCollapse).toHaveBeenCalledWith('Sprint 2026-Q2');
    expect(onLazyLoadSprint).toHaveBeenCalledWith('sprint-2026-q2');
  });
});
