// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { LiveDashboardToolbar } from '@/components/live/LiveDashboardToolbar';
import { LiveFlightDeckView } from '@/components/live/LiveFlightDeckView';
import { WorkspaceShell } from '@/components/layout/WorkspaceShell';
import { ProjectSettings, WorkItem } from '@/types/tracker';

const SAMPLE_PROJECT_SETTINGS: ProjectSettings = {
  schema_version: '1.0',
  wip_limit: 6,
  work_unit_field: 'story_points',
  hierarchy: [{ type: 'task', label: 'Task', level: 1, allowed_parents: [] }],
  statuses: [
    { id: 'coding', label: 'Coding', color: '#38bdf8', order: 1, lifecycle_category: 'execution' },
    { id: 'review', label: 'Review', color: '#f59e0b', order: 2, lifecycle_category: 'verification' },
  ],
  custom_fields: [],
};

const SAMPLE_ITEMS: WorkItem[] = [
  {
    id: 'item-1',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    external_ref_id: 'TRK-777',
    item_type: 'task',
    status: 'coding',
    title: 'Wire Kiosk Mode & Toolbar',
    order_index: 1000,
    assignee: 'Tymz',
    metadata: { story_points: 5, priority: 'High' },
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-03T12:00:00.000Z',
    deleted_at: null,
  },
];

describe('LiveDashboardToolbar & 100dvh Kiosk Mode (TASK-TRK-LIVE-TOOLBAR-KIOSK)', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.replaceState(null, '', '/sunshade/all?tab=live');
  });

  it('switches segmented pivot controls and updates ?pivot= URL search parameter', () => {
    const onPivotChange = vi.fn();
    render(
      <LiveDashboardToolbar
        activePivot="stage_flow"
        onPivotChange={onPivotChange}
        pollingCadenceMs={60000}
        onPollingCadenceChange={vi.fn()}
        isKioskMode={false}
        onToggleKioskMode={vi.fn()}
      />
    );

    const swimlanesBtn = screen.getByTestId('pivot-btn-project-swimlanes');
    fireEvent.click(swimlanesBtn);

    expect(onPivotChange).toHaveBeenCalledWith('project_swimlanes');
    expect(window.location.search).toContain('pivot=project_swimlanes');
  });

  it('renders polling cadence options Live (30s), Balanced (60s), Eco (120s), Paused', () => {
    const onCadenceChange = vi.fn();
    render(
      <LiveDashboardToolbar
        activePivot="stage_flow"
        onPivotChange={vi.fn()}
        pollingCadenceMs={60000}
        onPollingCadenceChange={onCadenceChange}
        isKioskMode={false}
        onToggleKioskMode={vi.fn()}
      />
    );

    const select = screen.getByTestId('live-polling-cadence-select') as HTMLSelectElement;
    const labels = Array.from(select.options).map((o) => o.textContent);
    expect(labels).toEqual(['Live (30s)', 'Balanced (60s)', 'Eco (120s)', 'Paused']);

    fireEvent.change(select, { target: { value: '30000' } });
    expect(onCadenceChange).toHaveBeenCalledWith(30000);
  });

  it('preserves active card selection when switching between Stage Flow and Project Lanes', () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ status: 304, ok: false }));
    const onSelectItem = vi.fn();

    render(
      <LiveFlightDeckView
        tenantSlug="sunshade"
        items={SAMPLE_ITEMS}
        projects={[{ id: 'proj-1', slug: 'trk', name: 'Tracker', settings: SAMPLE_PROJECT_SETTINGS }]}
        selectedItemRef="TRK-777"
        onSelectItem={onSelectItem}
        isKioskMode={false}
        onToggleKioskMode={vi.fn()}
      />
    );

    // Stage flow view is active initially and TRK-777 card is rendered
    expect(screen.getByTestId('stage-flow-view')).toBeTruthy();
    expect(screen.getByTestId('stage-card-TRK-777')).toBeTruthy();

    // Switch to Project Swimlanes
    fireEvent.click(screen.getByTestId('pivot-btn-project-swimlanes'));
    expect(screen.getByTestId('project-swimlane-view')).toBeTruthy();
    const swimlaneCard = screen.getByTestId('swimlane-card-TRK-777');
    expect(swimlaneCard.className).toContain('border-cyan-400');
  });

  it('unmounts LHN sidebar and top workspace header in WorkspaceShell when isKioskMode is true', () => {
    const { rerender } = render(
      <WorkspaceShell
        isKioskMode={false}
        header={<div>Header Content</div>}
        leftPane={<div>Sidebar Content</div>}
        centerPane={<div>Live Deck Canvas</div>}
      />
    );

    expect(screen.getByTestId('workspace-header')).toBeTruthy();
    expect(screen.getByTestId('workspace-lhn')).toBeTruthy();

    rerender(
      <WorkspaceShell
        isKioskMode={true}
        header={<div>Header Content</div>}
        leftPane={<div>Sidebar Content</div>}
        centerPane={<div>Live Deck Canvas</div>}
      />
    );

    expect(screen.queryByTestId('workspace-header')).toBeNull();
    expect(screen.queryByTestId('workspace-lhn')).toBeNull();
  });
});
