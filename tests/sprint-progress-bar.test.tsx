import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SprintHeader } from '@/components/sprint/SprintHeader';
import { SprintProgressBar } from '@/components/sprint/SprintProgressBar';
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
});
