// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  ProjectSwimlaneView,
  SWIMLANE_COLLAPSE_STORAGE_KEY,
} from '@/components/live/ProjectSwimlaneView';
import {
  InFlightTelemetryPayload,
  EnrichedInFlightItem,
} from '@/lib/services/inFlightTelemetryService';
import { DEFAULT_LIVE_DASHBOARD_SETTINGS } from '@/types/tracker';

function makeItem(overrides: Partial<EnrichedInFlightItem>): EnrichedInFlightItem {
  return {
    id: overrides.id || 'item-1',
    tenant_id: 'tenant-1',
    project_id: overrides.project_id || 'proj-1',
    external_ref_id: overrides.external_ref_id || 'TRK-301',
    item_type: 'task',
    status: overrides.status || 'coding',
    title: overrides.title || 'Build Swimlane Accordions',
    order_index: 1000,
    assignee: 'Tymz',
    metadata: overrides.metadata || { agent_prompt: 'Execute swimlane task' },
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-03T12:00:00.000Z',
    deleted_at: null,
    lifecycle_stage: 'execution',
    project_slug: overrides.project_slug || 'tracker',
    project_name: overrides.project_name || 'SunShade Tracker',
    status_label: overrides.status_label || 'In Progress',
    status_color: '#38bdf8',
    work_units: overrides.work_units ?? 5,
    unit_label: overrides.unit_label || 'pts',
    dwell_ms: 7200000,
    dwell_hours: 2,
    is_stagnant: false,
    is_blocked: false,
  };
}

const SAMPLE_TELEMETRY: InFlightTelemetryPayload = {
  total_active_items: 4,
  total_active_units: 18,
  total_wip_capacity: 6,
  wip_saturation_ratio: 0.6667,
  stage_dwell_radar: [],
  scope_drift: { added_units: 0, dropped_units: 0, net_change: 0 },
  bottleneck_stage: 'execution',
  bottleneck_stage_units: 18,
  rolling_24h_completed_units: 0,
  rolling_24h_completed_items: 0,
  active_blockers: [],
  stages: [],
  projects: [
    {
      project_id: 'proj-1',
      project_slug: 'tracker',
      project_name: 'SunShade Tracker',
      active_item_count: 4,
      active_units: 18,
      unit_label: 'pts',
      wip_limit: 6,
      wip_saturation_ratio: 0.6667,
      health_status: 'healthy',
      items: [
        makeItem({
          id: 'item-1',
          external_ref_id: 'TRK-301',
          title: 'Build Swimlane Accordions',
          status_label: 'Coding',
          work_units: 5,
          metadata: { agent_prompt: 'Implement accordion rows' },
        }),
      ],
    },
  ],
  in_flight_items: [],
  live_dashboard_settings: DEFAULT_LIVE_DASHBOARD_SETTINGS,
  synced_at: '2026-11-03T15:00:00.000Z',
};

describe('ProjectSwimlaneView (TASK-TRK-PROJECT-SWIMLANE-VIEW)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders project accordion header with active item count, units, and concurrency pill', () => {
    render(<ProjectSwimlaneView telemetry={SAMPLE_TELEMETRY} />);

    expect(screen.getByTestId('project-swimlane-tracker')).toBeTruthy();
    expect(screen.getByTestId('swimlane-items-tracker').textContent).toBe('4 active items');
    expect(screen.getByTestId('swimlane-units-tracker').textContent).toBe('18 pts');
    expect(screen.getByTestId('swimlane-wip-pill-tracker').textContent).toContain(
      'WIP: 4/6 Limit · Healthy'
    );
  });

  it('renders native status badge, agent prompt badge, and deep-links card to RHN inspector', () => {
    const onSelect = vi.fn();
    render(<ProjectSwimlaneView telemetry={SAMPLE_TELEMETRY} onSelectItem={onSelect} />);

    expect(screen.getByTestId('swimlane-card-status-TRK-301').textContent).toContain('Coding');
    expect(screen.getByTestId('agent-prompt-badge-TRK-301')).toBeTruthy();

    fireEvent.click(screen.getByTestId('swimlane-card-TRK-301'));
    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain('item=TRK-301');
  });

  it('persists accordion collapsed state across renders in localStorage', () => {
    const { unmount } = render(<ProjectSwimlaneView telemetry={SAMPLE_TELEMETRY} />);

    expect(screen.getByTestId('swimlane-body-tracker')).toBeTruthy();

    // Collapse accordion
    fireEvent.click(screen.getByTestId('swimlane-toggle-tracker'));
    expect(screen.queryByTestId('swimlane-body-tracker')).toBeNull();

    const stored = JSON.parse(localStorage.getItem(SWIMLANE_COLLAPSE_STORAGE_KEY) || '[]');
    expect(stored).toContain('proj-1');

    unmount();

    // Re-mount and verify it initializes collapsed from localStorage
    render(<ProjectSwimlaneView telemetry={SAMPLE_TELEMETRY} />);
    expect(screen.queryByTestId('swimlane-body-tracker')).toBeNull();
  });
});
