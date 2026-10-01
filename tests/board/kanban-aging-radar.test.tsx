import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { KanbanCard } from '@/components/board/KanbanCard';
import { WorkItem, HierarchyLevel } from '@/types/tracker';

describe('TASK-TRK-UI-AGING-RADAR: KanbanCard aging badges and anomaly highlights', () => {
  const defaultHierarchy: HierarchyLevel[] = [
    { type: 'project', label: 'Project', level: 1, allowed_parents: [] },
    { type: 'task', label: 'Task', level: 2, allowed_parents: ['project'] },
  ];

  it('renders amber clock badge when cycle_time exceeds 1.5x median in progress', () => {
    const item: WorkItem = {
      id: 'task-aging-1',
      tenant_id: 'tenant-1',
      project_id: 'proj-1',
      title: 'Long Running Optimization',
      item_type: 'task',
      status: 'in_progress',
      order_index: 1000,
      created_at: '2026-09-20T00:00:00.000Z',
      updated_at: '2026-09-28T00:00:00.000Z',
      metadata: {
        cycle_time_days: 8,
        median_cycle_time: 5, // 1.5x is 7.5d -> 8d is > 1.5x
      },
    };

    render(
      <KanbanCard
        item={item}
        itemHierarchy={defaultHierarchy}
        medianCycleTime={5}
      />
    );

    const agingBadge = screen.getByTestId('card-aging-badge-task-aging-1');
    expect(agingBadge).toBeInTheDocument();
    expect(agingBadge).toHaveTextContent('8d in progress');

    const card = screen.getByTestId('kanban-card-task-aging-1');
    expect(card.className).toContain('border-amber-500/40');
  });

  it('renders red border and Stalled Review pill when cycle_time exceeds 2.5x median', () => {
    const item: WorkItem = {
      id: 'task-stalled-1',
      tenant_id: 'tenant-1',
      project_id: 'proj-1',
      title: 'Stalled Card Review',
      item_type: 'task',
      status: 'in_progress',
      order_index: 2000,
      created_at: '2026-09-14T00:00:00.000Z',
      updated_at: '2026-09-28T00:00:00.000Z',
      metadata: {
        cycle_time_days: 14,
        median_cycle_time: 5, // 2.5x is 12.5d -> 14d is > 2.5x
      },
    };

    render(
      <KanbanCard
        item={item}
        itemHierarchy={defaultHierarchy}
        medianCycleTime={5}
      />
    );

    const stalledBadge = screen.getByTestId('card-stalled-badge-task-stalled-1');
    expect(stalledBadge).toBeInTheDocument();
    expect(stalledBadge).toHaveTextContent('Stalled Review');

    const card = screen.getByTestId('kanban-card-task-stalled-1');
    expect(card.className).toContain('border-red-500/50');
  });

  it('does not render anomaly highlights when within normal cycle time limits', () => {
    const item: WorkItem = {
      id: 'task-normal-1',
      tenant_id: 'tenant-1',
      project_id: 'proj-1',
      title: 'Normal Paced Task',
      item_type: 'task',
      status: 'in_progress',
      order_index: 3000,
      created_at: '2026-09-24T00:00:00.000Z',
      updated_at: '2026-09-28T00:00:00.000Z',
      metadata: {
        cycle_time_days: 4,
        median_cycle_time: 5,
      },
    };

    render(
      <KanbanCard
        item={item}
        itemHierarchy={defaultHierarchy}
        medianCycleTime={5}
      />
    );

    expect(screen.queryByTestId('card-aging-badge-task-normal-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('card-stalled-badge-task-normal-1')).not.toBeInTheDocument();

    const card = screen.getByTestId('kanban-card-task-normal-1');
    expect(card.className).not.toContain('border-amber-500/40');
    expect(card.className).not.toContain('border-red-500/50');
  });

  it('calculates elapsed WIP days from created_at as fallback when cycle_time_days is absent', () => {
    // 9 days ago
    const nineDaysAgo = new Date(Date.now() - 9 * 24 * 60 * 60 * 1000).toISOString();
    const item: WorkItem = {
      id: 'task-fallback-1',
      tenant_id: 'tenant-1',
      project_id: 'proj-1',
      title: 'Task Without Explicit Cycle Time',
      item_type: 'task',
      status: 'in_progress',
      order_index: 4000,
      created_at: nineDaysAgo,
      updated_at: nineDaysAgo,
      metadata: {},
    };

    render(
      <KanbanCard
        item={item}
        itemHierarchy={defaultHierarchy}
        medianCycleTime={5}
      />
    );

    // 9 days > 1.5 * 5 = 7.5 days -> renders aging badge
    const agingBadge = screen.getByTestId('card-aging-badge-task-fallback-1');
    expect(agingBadge).toBeInTheDocument();
    expect(agingBadge).toHaveTextContent('9d in progress');
  });

  it('does not falsely flag item as stalled when old backlog item was recently updated to in_progress', () => {
    // Created 45 days ago in backlog, but moved to in_progress today (updated_at 1 hour ago)
    const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000).toISOString();
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();

    const item: WorkItem = {
      id: 'task-recent-wip',
      tenant_id: 'tenant-1',
      project_id: 'proj-1',
      title: 'Old Ticket Moved to WIP Today',
      item_type: 'task',
      status: 'in_progress',
      order_index: 5000,
      created_at: fortyFiveDaysAgo,
      updated_at: oneHourAgo,
      metadata: {},
    };

    render(
      <KanbanCard
        item={item}
        itemHierarchy={defaultHierarchy}
        medianCycleTime={5}
      />
    );

    // Should NOT have aging or stalled badges because elapsed in_progress WIP time is 0 days (< 5 days median)
    expect(screen.queryByTestId('card-aging-badge-task-recent-wip')).not.toBeInTheDocument();
    expect(screen.queryByTestId('card-stalled-badge-task-recent-wip')).not.toBeInTheDocument();

    const card = screen.getByTestId('kanban-card-task-recent-wip');
    expect(card.className).not.toContain('border-amber-500/40');
    expect(card.className).not.toContain('border-red-500/50');
  });
});
