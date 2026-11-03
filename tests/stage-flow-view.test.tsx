// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StageFlowView } from '@/components/live/StageFlowView';
import { InFlightTelemetryPayload, EnrichedInFlightItem } from '@/lib/services/inFlightTelemetryService';
import { DEFAULT_LIVE_DASHBOARD_SETTINGS } from '@/types/tracker';

function makeEnrichedItem(overrides: Partial<EnrichedInFlightItem>): EnrichedInFlightItem {
  return {
    id: overrides.id || 'item-1',
    tenant_id: 'tenant-1',
    project_id: 'proj-alpha',
    external_ref_id: overrides.external_ref_id || 'REF-101',
    item_type: 'task',
    status: overrides.status || 'in_review',
    title: overrides.title || 'Implement Stage Flow View',
    order_index: 1000,
    assignee: overrides.assignee || 'Tymz',
    metadata: overrides.metadata || { priority: 'High' },
    created_at: '2026-11-01T00:00:00.000Z',
    updated_at: '2026-11-03T12:00:00.000Z',
    deleted_at: null,
    lifecycle_stage: overrides.lifecycle_stage || 'verification',
    project_slug: overrides.project_slug || 'alpha',
    project_name: overrides.project_name || 'Alpha',
    status_label: overrides.status_label || 'Review',
    status_color: '#f59e0b',
    work_units: overrides.work_units ?? 3,
    unit_label: overrides.unit_label || 'pts',
    dwell_ms: overrides.dwell_ms ?? 50.4 * 3600 * 1000,
    dwell_hours: overrides.dwell_hours ?? 50.4, // 2.1d
    is_stagnant: overrides.is_stagnant ?? false,
    is_blocked: overrides.is_blocked ?? false,
  };
}

const SAMPLE_TELEMETRY: InFlightTelemetryPayload = {
  total_active_items: 2,
  total_active_units: 1503,
  total_wip_capacity: 16,
  wip_saturation_ratio: 0.125,
  stage_dwell_radar: [],
  scope_drift: { added_units: 0, dropped_units: 0, net_change: 0 },
  bottleneck_stage: 'verification',
  bottleneck_stage_units: 1503,
  rolling_24h_completed_units: 0,
  rolling_24h_completed_items: 0,
  active_blockers: [],
  stages: [
    {
      stage: 'execution',
      label: 'Active Execution',
      color: '#38BDF8',
      order: 1,
      item_count: 1,
      total_units: 1500,
      median_dwell_ms: 14400000,
      median_dwell_hours: 4,
      items: [
        makeEnrichedItem({
          id: 'item-exec',
          external_ref_id: 'EDIT-202',
          title: 'Write Q4 Manifesto',
          lifecycle_stage: 'execution',
          project_name: 'Editorial',
          status_label: 'Drafting',
          work_units: 1500,
          unit_label: 'words',
          dwell_hours: 4,
          is_stagnant: false,
        }),
      ],
    },
    {
      stage: 'verification',
      label: 'Verification & Review',
      color: '#F59E0B',
      order: 2,
      item_count: 1,
      total_units: 3,
      median_dwell_ms: 86400000,
      median_dwell_hours: 24,
      items: [
        makeEnrichedItem({
          id: 'item-verif',
          external_ref_id: 'REF-101',
          title: 'Peer Review Flow Engine',
          lifecycle_stage: 'verification',
          project_name: 'Alpha',
          status_label: 'Review',
          work_units: 3,
          unit_label: 'pts',
          dwell_hours: 50.4, // 2.1d
          is_stagnant: true,
        }),
      ],
    },
    {
      stage: 'staging',
      label: 'Pre-Delivery / Staged',
      color: '#A855F7',
      order: 3,
      item_count: 0,
      total_units: 0,
      median_dwell_ms: 0,
      median_dwell_hours: 0,
      items: [],
    },
  ],
  projects: [],
  in_flight_items: [],
  live_dashboard_settings: DEFAULT_LIVE_DASHBOARD_SETTINGS,
  synced_at: '2026-11-03T15:00:00.000Z',
};

describe('StageFlowView (TASK-TRK-STAGE-FLOW-VIEW)', () => {
  it('renders dynamic lifecycle columns with item counts and work unit sums', () => {
    render(<StageFlowView telemetry={SAMPLE_TELEMETRY} />);

    expect(screen.getByTestId('stage-column-execution')).toBeTruthy();
    expect(screen.getByTestId('stage-column-verification')).toBeTruthy();
    expect(screen.getByTestId('stage-column-staging')).toBeTruthy();

    expect(screen.getByTestId('stage-count-execution').textContent).toBe('1 item');
    expect(screen.getByTestId('stage-units-execution').textContent).toBe('1500 units');

    expect(screen.getByTestId('stage-empty-staging')).toBeTruthy();
  });

  it('renders dense 3-line cards with project pill, ref ID, work units, dwell badge, and systemic aging warning', () => {
    render(<StageFlowView telemetry={SAMPLE_TELEMETRY} />);

    // Editorial card
    expect(screen.getByTestId('card-unit-badge-EDIT-202').textContent).toBe('1,500 words');
    expect(screen.getByTestId('card-dwell-badge-EDIT-202').textContent).toContain('4h in drafting');
    expect(screen.queryByTestId('flow-stall-badge-EDIT-202')).toBeNull();

    // Stagnant verification card
    expect(screen.getByText('[Proj: Alpha]')).toBeTruthy();
    expect(screen.getByText('#REF-101')).toBeTruthy();
    expect(screen.getByTestId('card-unit-badge-REF-101').textContent).toBe('3 pts');
    expect(screen.getByTestId('card-dwell-badge-REF-101').textContent).toContain('2.1d in review');

    // Amber pulse ring & blameless support label
    const stallBadge = screen.getByTestId('flow-stall-badge-REF-101');
    expect(stallBadge.textContent).toContain('Flow Stall: Needs Peer Review / Triage');
  });

  it('updates URL search parameter ?item=[ref_id] and invokes onSelectItem when card is clicked', () => {
    const onSelect = vi.fn();
    render(<StageFlowView telemetry={SAMPLE_TELEMETRY} onSelectItem={onSelect} />);

    const card = screen.getByTestId('stage-card-REF-101');
    fireEvent.click(card);

    expect(onSelect).toHaveBeenCalledTimes(1);
    expect(window.location.search).toContain('item=REF-101');
  });
});
