import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SprintHeader } from '@/components/sprint/SprintHeader';
import { SprintProgressBar } from '@/components/sprint/SprintProgressBar';
import { SprintPlanningView } from '@/components/sprint/SprintPlanningView';
import { WorkItem, StatusDefinition } from '@/types/tracker';

const customStatuses: StatusDefinition[] = [
  { id: 'backlog', label: 'Backlog', color: '#94a3b8', order: 1 },
  { id: 'in_dev', label: 'In Development', color: '#38bdf8', order: 2 },
  { id: 'qa_review', label: 'QA Review', color: '#fbbf24', order: 3 },
  { id: 'shipped', label: 'Shipped to Prod', color: '#a855f7', order: 4 },
];

const mockItems: WorkItem[] = [
  { id: '1', tenant_id: 't', project_id: 'p', title: 'Task 1', item_type: 'task', status: 'backlog', order_index: 1000, metadata: {}, created_at: '', updated_at: '' },
  { id: '2', tenant_id: 't', project_id: 'p', title: 'Task 2', item_type: 'task', status: 'in_dev', order_index: 2000, metadata: {}, created_at: '', updated_at: '' },
  { id: '3', tenant_id: 't', project_id: 'p', title: 'Task 3', item_type: 'task', status: 'qa_review', order_index: 3000, metadata: {}, created_at: '', updated_at: '' },
  { id: '4', tenant_id: 't', project_id: 'p', title: 'Task 4', item_type: 'task', status: 'shipped', order_index: 4000, metadata: {}, created_at: '', updated_at: '' },
];

describe('FEAT-TRK-PROGRESS-BAR-STATUS-COLORS: Dynamic multi-status progress bar & hover breakdown', () => {
  it('renders stacked multi-status progress bar with schema colors', () => {
    render(
      <SprintHeader
        sprintName="Sprint 2026-Q3"
        items={mockItems}
        statuses={customStatuses}
      />
    );

    const progressBar = screen.getByTestId('sprint-progress-bar');
    expect(progressBar).toBeInTheDocument();

    // Verify all 4 status segments are rendered with custom colors
    const segBacklog = screen.getByTestId('sprint-progress-segment-backlog');
    const segInDev = screen.getByTestId('sprint-progress-segment-in_dev');
    const segQa = screen.getByTestId('sprint-progress-segment-qa_review');
    const segShipped = screen.getByTestId('sprint-progress-segment-shipped');

    expect(segBacklog).toHaveStyle({ backgroundColor: 'rgb(148, 163, 184)' }); // #94a3b8
    expect(segInDev).toHaveStyle({ backgroundColor: 'rgb(56, 189, 248)' });    // #38bdf8
    expect(segQa).toHaveStyle({ backgroundColor: 'rgb(251, 191, 36)' });      // #fbbf24
    expect(segShipped).toHaveStyle({ backgroundColor: 'rgb(168, 85, 247)' });  // #a855f7

    // Overall complete % shows by default (shipped is 1 of 4 = 25% or 0% if shipped not in COMPLETED_STATUSES)
    const progressLabel = screen.getByTestId('header-progress');
    expect(progressLabel).toBeInTheDocument();

    // By default, full breakdown popover is hidden
    expect(screen.queryByTestId('sprint-progress-breakdown')).not.toBeInTheDocument();
  });

  it('calculates non-zero progressPct for sprints with custom terminal statuses such as shipped', () => {
    const shippedOnlyItems: WorkItem[] = [
      { id: '1', tenant_id: 't', project_id: 'p', title: 'Task 1', item_type: 'task', status: 'shipped', order_index: 1000, metadata: {}, created_at: '', updated_at: '' },
      { id: '2', tenant_id: 't', project_id: 'p', title: 'Task 2', item_type: 'task', status: 'shipped', order_index: 2000, metadata: {}, created_at: '', updated_at: '' },
    ];

    render(
      <SprintHeader
        sprintName="Sprint 2026-Shipped"
        items={shippedOnlyItems}
        statuses={customStatuses}
      />
    );

    const progressLabel = screen.getByTestId('header-progress');
    expect(progressLabel).toHaveTextContent('100%');
  });

  it('reveals detailed status breakdown on hover and tap', () => {
    render(
      <SprintProgressBar
        progressPct={25}
        segments={[
          { id: 'backlog', label: 'Backlog', color: '#94a3b8', count: 1, pct: 25 },
          { id: 'in_dev', label: 'In Development', color: '#38bdf8', count: 1, pct: 25 },
          { id: 'qa_review', label: 'QA Review', color: '#fbbf24', count: 1, pct: 25 },
          { id: 'shipped', label: 'Shipped to Prod', color: '#a855f7', count: 1, pct: 25 },
        ]}
      />
    );

    const container = screen.getByTestId('sprint-progress-container');

    // On hover: reveals breakdown
    fireEvent.mouseEnter(container);
    const breakdown = screen.getByTestId('sprint-progress-breakdown');
    expect(breakdown).toBeInTheDocument();
    expect(breakdown).toHaveTextContent('Backlog');
    expect(breakdown).toHaveTextContent('In Development');
    expect(breakdown).toHaveTextContent('QA Review');
    expect(breakdown).toHaveTextContent('Shipped to Prod');

    // On mouse leave: hides breakdown
    fireEvent.mouseLeave(container);
    expect(screen.queryByTestId('sprint-progress-breakdown')).not.toBeInTheDocument();

    // On click (tap on mobile): toggles breakdown open
    fireEvent.click(container);
    expect(screen.getByTestId('sprint-progress-breakdown')).toBeInTheDocument();

    // Verify context bubble is positioned downward to prevent showing underneath sprints above it
    expect(screen.getByTestId('sprint-progress-breakdown')).toHaveClass('top-full mt-2 z-50');

    // Tap again toggles closed
    fireEvent.click(container);
    expect(screen.queryByTestId('sprint-progress-breakdown')).not.toBeInTheDocument();
  });

  it('fills in progress bar at 100% with emerald color when completed sprint has 0 items', () => {
    render(
      <SprintProgressBar
        progressPct={100}
        segments={[]}
        isCompletedSprint={true}
      />
    );

    const progressLabel = screen.getByTestId('header-progress');
    expect(progressLabel).toHaveTextContent('100%');

    const filledBar = screen.getByTestId('sprint-progress-empty-or-completed');
    expect(filledBar).toHaveStyle({ width: '100%', backgroundColor: 'rgb(34, 197, 94)' });
    expect(filledBar).toHaveClass('bg-emerald-500');

    // On hover, displays 100% complete message
    const container = screen.getByTestId('sprint-progress-container');
    fireEvent.mouseEnter(container);
    const breakdown = screen.getByTestId('sprint-progress-breakdown');
    expect(breakdown).toHaveTextContent('100% Complete');
    expect(breakdown).toHaveTextContent('Completed sprint (no remaining items)');
  });

  it('renders full bar across in percentages of status with complete on left, ordered by highest to lowest %, and diagonal crossover', () => {
    render(
      <SprintProgressBar
        progressPct={40}
        segments={[
          { id: 'not_started', label: 'Not Started', color: '#94a3b8', count: 2, pct: 40 },
          { id: 'in_review', label: 'In Review', color: '#f59e0b', count: 1, pct: 20 },
          { id: 'complete', label: 'Complete', color: '#22c55e', count: 2, pct: 40 },
        ]}
      />
    );

    const filledBar = screen.getByTestId('sprint-progress-empty-or-completed');
    expect(filledBar).toHaveStyle({ width: '100%' });

    // Verify background image has complete on the left (0-40%), grey in middle (40-80%), orange at end (80-100%)
    // with diagonal (120deg) crossover stops
    expect(filledBar.style.backgroundImage).toContain('linear-gradient(120deg');
    expect(filledBar.style.backgroundImage).toContain('#22c55e 0%');
    expect(filledBar.style.backgroundImage).toContain('#22c55e 38.8%');
    expect(filledBar.style.backgroundImage).toContain('#94a3b8 41.2%');
    expect(filledBar.style.backgroundImage).toContain('#94a3b8 78.8%');
    expect(filledBar.style.backgroundImage).toContain('#f59e0b 81.2%');
    expect(filledBar.style.backgroundImage).toContain('#f59e0b 100%');
  });

  it('animates progress bar boundaries with ease-in-out when percentage or segments update', () => {
    const { rerender } = render(
      <SprintProgressBar
        progressPct={40}
        segments={[
          { id: 'not_started', label: 'Not Started', color: '#94a3b8', count: 2, pct: 40 },
          { id: 'in_review', label: 'In Review', color: '#f59e0b', count: 1, pct: 20 },
          { id: 'complete', label: 'Complete', color: '#22c55e', count: 2, pct: 40 },
        ]}
      />
    );

    const filledBar = screen.getByTestId('sprint-progress-empty-or-completed');
    expect(filledBar.className).toContain('transition-all duration-500 ease-in-out');

    // Re-render with updated progress (e.g. 60% complete, 20% not started, 20% in review)
    rerender(
      <SprintProgressBar
        progressPct={60}
        segments={[
          { id: 'not_started', label: 'Not Started', color: '#94a3b8', count: 1, pct: 20 },
          { id: 'in_review', label: 'In Review', color: '#f59e0b', count: 1, pct: 20 },
          { id: 'complete', label: 'Complete', color: '#22c55e', count: 3, pct: 60 },
        ]}
      />
    );

    // Header updates to 60%
    expect(screen.getByTestId('header-progress')).toHaveTextContent('60%');
    expect(filledBar.className).toContain('ease-in-out');
  });

  it('notifies onOpenChange, dismisses on outside click, and ignores clicks inside popover', () => {
    const onOpenChange = vi.fn();
    render(
      <div>
        <div data-testid="outside-element">Outside</div>
        <SprintProgressBar
          progressPct={50}
          segments={[{ id: 'done', label: 'Done', color: '#22c55e', count: 1, pct: 100 }]}
          onOpenChange={onOpenChange}
        />
      </div>
    );

    const container = screen.getByTestId('sprint-progress-container');

    // Click to open
    fireEvent.click(container);
    expect(onOpenChange).toHaveBeenLastCalledWith(true);
    const breakdown = screen.getByTestId('sprint-progress-breakdown');
    expect(breakdown).toBeInTheDocument();

    // Click inside the popover does NOT close it
    fireEvent.click(breakdown);
    expect(screen.getByTestId('sprint-progress-breakdown')).toBeInTheDocument();

    // Click outside dismisses popover
    fireEvent.mouseDown(screen.getByTestId('outside-element'));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
    expect(screen.queryByTestId('sprint-progress-breakdown')).not.toBeInTheDocument();
  });
});

describe('BUG-TRK-SPRINT-POPOVER-STACKING: Elevation over subsequent sprint headers and cards', () => {
  it('elevates SprintHeader stacking context to !z-30 when popover opens', () => {
    const onProgressPopoverOpenChange = vi.fn();
    render(
      <SprintHeader
        sprintName="Sprint 1"
        items={mockItems}
        statuses={customStatuses}
        onProgressPopoverOpenChange={onProgressPopoverOpenChange}
      />
    );

    const header = screen.getByTestId('sprint-header-Sprint 1');
    expect(header).toHaveClass('z-10');
    expect(header).toHaveClass('has-[[data-testid=sprint-progress-breakdown]]:!z-30');

    // Open progress popover
    const container = screen.getByTestId('sprint-progress-container');
    fireEvent.click(container);

    // Now header is dynamically elevated to !z-30
    expect(header).toHaveClass('!z-30');
    expect(onProgressPopoverOpenChange).toHaveBeenCalledWith(true);
  });

  it('elevates Sprint 1 swimlane to !z-30 over Sprint 2 in SprintPlanningView when progress popover is open', () => {
    const sprint1Item: WorkItem = {
      ...mockItems[0],
      id: 's1-1',
      metadata: { sprint: 'Sprint 1' },
    };
    const sprint2Item: WorkItem = {
      ...mockItems[1],
      id: 's2-1',
      metadata: { sprint: 'Sprint 2' },
    };

    render(
      <SprintPlanningView
        items={[sprint1Item, sprint2Item]}
        pointMode="granular"
        onPointModeChange={() => {}}
        availableSprints={['Sprint 1', 'Sprint 2']}
        projectSettings={{
          schema_version: '1.0.0',
          custom_fields: [],
          hierarchy: [],
          statuses: customStatuses,
          sprint_settings: {
            sprints: [
              { id: 'Sprint 1', name: 'Sprint 1', status: 'active' },
              { id: 'Sprint 2', name: 'Sprint 2', status: 'planned' },
            ],
          },
        }}
      />
    );

    const swimlane1 = screen.getByTestId('sprint-swimlane-Sprint 1');
    const swimlane2 = screen.getByTestId('sprint-swimlane-Sprint 2');

    // Initially both swimlanes sit at z-10
    expect(swimlane1).toHaveClass('z-10');
    expect(swimlane2).toHaveClass('z-10');

    // Open progress popover on Sprint 1
    const sprint1ProgressContainer = swimlane1.querySelector('[data-testid="sprint-progress-container"]');
    expect(sprint1ProgressContainer).not.toBeNull();
    fireEvent.click(sprint1ProgressContainer!);

    // Sprint 1 is elevated to !z-30 while Sprint 2 stays at z-10
    expect(swimlane1).toHaveClass('!z-30');
    expect(swimlane2).toHaveClass('z-10');

    // Clicking outside dismisses popover and restores Sprint 1 to z-10
    fireEvent.mouseDown(document.body);
    expect(swimlane1).toHaveClass('z-10');
    expect(swimlane2).toHaveClass('z-10');
  });
});
