// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FlowTelemetryRibbon } from '@/components/live/FlowTelemetryRibbon';
import { InFlightTelemetryPayload } from '@/lib/services/inFlightTelemetryService';
import { DEFAULT_LIVE_DASHBOARD_SETTINGS } from '@/types/tracker';

const SAMPLE_TELEMETRY: InFlightTelemetryPayload = {
  total_active_items: 14,
  total_active_units: 65,
  total_wip_capacity: 16,
  wip_saturation_ratio: 0.875, // 88% -> Queuing Risk
  stage_dwell_radar: [
    {
      item_id: 'item-1',
      external_ref_id: 'TRK-500',
      title: 'Stalled Review Card',
      project_id: 'proj-1',
      project_slug: 'trk',
      project_name: 'Tracker',
      stage: 'verification',
      status: 'in_review',
      dwell_ms: 172800000,
      dwell_hours: 48,
      stage_median_ms: 86400000,
      stage_median_hours: 24,
      dwell_ratio: 2.0,
      work_units: 8,
      unit_label: 'pts',
      flag_label: 'System Queue Stall',
    },
  ],
  scope_drift: {
    added_units: 6,
    dropped_units: 2,
    net_change: 4,
  },
  bottleneck_stage: 'verification',
  bottleneck_stage_units: 42,
  rolling_24h_completed_units: 18,
  rolling_24h_completed_items: 4,
  active_blockers: [
    {
      item_id: 'item-blocked-1',
      external_ref_id: 'TRK-901',
      title: 'Deploy Telemetry Pipeline',
      project_id: 'proj-1',
      project_slug: 'trk',
      project_name: 'Tracker',
      stage: 'execution',
      reason: 'CI / Verification pipeline failure',
    },
  ],
  stages: [
    {
      stage: 'execution',
      label: 'Active Execution',
      color: '#38BDF8',
      order: 1,
      item_count: 6,
      total_units: 23,
      median_dwell_ms: 36000000,
      median_dwell_hours: 10,
      items: [],
    },
    {
      stage: 'verification',
      label: 'Verification Gate',
      color: '#F59E0B',
      order: 2,
      item_count: 8,
      total_units: 42,
      median_dwell_ms: 86400000,
      median_dwell_hours: 24,
      items: [],
    },
  ],
  projects: [],
  in_flight_items: [],
  live_dashboard_settings: DEFAULT_LIVE_DASHBOARD_SETTINGS,
  synced_at: '2026-11-03T15:00:00.000Z',
};

describe('FlowTelemetryRibbon & Blocker Marquee (TASK-TRK-LIVE-HEALTH-RIBBON)', () => {
  it('renders all 4 systemic metric badges with non-punitive system terminology', () => {
    render(<FlowTelemetryRibbon telemetry={SAMPLE_TELEMETRY} />);

    // 1. WIP Saturation Index
    expect(screen.getByTestId('metric-wip-saturation')).toBeTruthy();
    expect(screen.getByText(/88% of Concurrency Limit/i)).toBeTruthy();
    expect(screen.getByTestId('wip-saturation-status-badge').textContent).toBe('Queuing Risk');

    // 2. Queue Flow Radar
    expect(screen.getByTestId('metric-queue-flow-radar')).toBeTruthy();
    expect(screen.getByText(/Bottleneck: Verification Gate · 42 units waiting/i)).toBeTruthy();

    // 3. Mid-Cycle Scope Inflow
    expect(screen.getByTestId('metric-scope-inflow')).toBeTruthy();
    expect(screen.getByText(/\+4 units net volatility/i)).toBeTruthy();

    // 4. Throughput Cadence
    expect(screen.getByTestId('metric-throughput-cadence')).toBeTruthy();
    expect(screen.getByText(/18 units completed/i)).toBeTruthy();
  });

  it('renders Optimal badge when WIP saturation is below queuing risk threshold', () => {
    render(
      <FlowTelemetryRibbon
        telemetry={{
          ...SAMPLE_TELEMETRY,
          wip_saturation_ratio: 0.5,
          active_blockers: [],
        }}
      />
    );
    expect(screen.getByTestId('wip-saturation-status-badge').textContent).toBe('Optimal');
    expect(screen.queryByTestId('ambient-blocker-marquee')).toBeNull();
  });

  it('renders collapsible Ambient Blocker Marquee and triggers deep-link callback on click', () => {
    const onSelectBlocker = vi.fn();
    render(
      <FlowTelemetryRibbon
        telemetry={SAMPLE_TELEMETRY}
        onSelectBlockerItem={onSelectBlocker}
      />
    );

    expect(screen.getByTestId('ambient-blocker-marquee')).toBeTruthy();
    const blockerBtn = screen.getByTestId('blocker-pill-TRK-901');
    expect(blockerBtn.textContent).toContain('#TRK-901');
    expect(blockerBtn.textContent).toContain('CI / Verification pipeline failure');

    fireEvent.click(blockerBtn);
    expect(onSelectBlocker).toHaveBeenCalledWith('TRK-901');

    // Collapse marquee
    const toggleBtn = screen.getByTestId('toggle-blocker-marquee-btn');
    fireEvent.click(toggleBtn);
    expect(screen.queryByTestId('blocker-pill-TRK-901')).toBeNull();
  });
});
