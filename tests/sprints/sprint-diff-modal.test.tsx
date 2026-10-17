import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SprintDiffModal, SprintSnapshotSummary } from '@/components/sprints/SprintDiffModal';
import { SnapshotDiffResult } from '@/lib/services/sprintDiffService';

describe('TASK-TRK-DIFF-INSPECTOR-UI: SprintDiffModal Component', () => {
  const mockSnapshots: SprintSnapshotSummary[] = [
    {
      id: 'snap-baseline-1',
      snapshot_type: 'commitment_baseline',
      captured_at: new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString(),
      committed_points: 30,
      remaining_points: 30,
    },
    {
      id: 'snap-rollup-7d',
      snapshot_type: 'daily_rollup',
      captured_at: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString(),
      committed_points: 32,
      remaining_points: 25,
    },
    {
      id: 'snap-rollup-24h',
      snapshot_type: 'daily_rollup',
      captured_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      committed_points: 35,
      remaining_points: 15,
    },
  ];

  const mockDiffResult: SnapshotDiffResult = {
    base_snapshot: {
      id: 'snap-baseline-1',
      name: 'Baseline',
      total_points: 30,
      total_items: 6,
    },
    target_snapshot: {
      id: 'live',
      name: 'Live Backlog',
      total_points: 35,
      total_items: 7,
      is_live: true,
    },
    injected: [
      {
        id: 'item-injected-1',
        title: 'Security Token Rotation Worker',
        status: 'in_progress',
        story_points: 5,
        external_ref_id: 'TASK-SEC-01',
        assignee_id: 'user-alice',
      },
      {
        id: 'item-injected-2',
        title: 'Hotfix OAuth Expiry Handling',
        status: 'not_started',
        story_points: 3,
        external_ref_id: 'TASK-AUTH-02',
      },
    ],
    ejected: [
      {
        id: 'item-ejected-1',
        title: 'Deprecated XML Serializer Removal',
        status: 'not_started',
        story_points: 2,
        external_ref_id: 'TASK-CHORE-03',
      },
    ],
    estimate_drift: [
      {
        item: {
          id: 'item-drift-1',
          title: 'Database Partition Migration',
          status: 'in_progress',
          story_points: 5,
          external_ref_id: 'TASK-DB-04',
        },
        base_points: 3,
        target_points: 5,
        delta: 2,
      },
    ],
    status_drift: [
      {
        item: {
          id: 'item-status-1',
          title: 'Kafka Consumer Group Rebalance',
          status: 'complete',
          story_points: 3,
          external_ref_id: 'TASK-KAFKA-05',
        },
        base_status: 'in_progress',
        target_status: 'complete',
      },
    ],
    net_points_delta: 8,
    churn_rate_pct: 26.7,
    injected_points: 8,
    ejected_points: 2,
    estimate_drift_points: 2,
  };

  const emptyDiffResult: SnapshotDiffResult = {
    base_snapshot: {
      id: 'snap-baseline-1',
      total_points: 30,
      total_items: 5,
    },
    target_snapshot: {
      id: 'snap-baseline-1',
      total_points: 30,
      total_items: 5,
    },
    injected: [],
    ejected: [],
    estimate_drift: [],
    status_drift: [],
    net_points_delta: 0,
    churn_rate_pct: 0,
    injected_points: 0,
    ejected_points: 0,
    estimate_drift_points: 0,
  };

  it('does not render anything when isOpen is false', () => {
    const { container } = render(
      <SprintDiffModal
        isOpen={false}
        onClose={vi.fn()}
        sprintId="sprint-101"
        sprintName="Sprint 101"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal dialog header, controls, and default selectors when open', () => {
    render(
      <SprintDiffModal
        isOpen={true}
        onClose={vi.fn()}
        sprintId="sprint-101"
        sprintName="Sprint Alpha"
        snapshots={mockSnapshots}
        initialDiff={mockDiffResult}
      />
    );

    expect(screen.getByTestId('sprint-diff-modal')).toBeInTheDocument();
    expect(screen.getByText('Snapshot Diff Inspector')).toBeInTheDocument();
    expect(screen.getByText('Sprint Alpha')).toBeInTheDocument();

    const baseSelect = screen.getByTestId('diff-base-select') as HTMLSelectElement;
    const targetSelect = screen.getByTestId('diff-target-select') as HTMLSelectElement;

    expect(baseSelect.value).toBe('baseline');
    expect(targetSelect.value).toBe('live');
  });

  it('displays summary KPI ribbon metrics correctly', () => {
    render(
      <SprintDiffModal
        isOpen={true}
        onClose={vi.fn()}
        sprintId="sprint-101"
        sprintName="Sprint Alpha"
        snapshots={mockSnapshots}
        initialDiff={mockDiffResult}
      />
    );

    const netDelta = screen.getByTestId('kpi-net-delta');
    expect(netDelta).toHaveTextContent('+8 pts');
    expect(netDelta).toHaveTextContent('26.7% churn rate');

    const injectedKpi = screen.getByTestId('kpi-injected');
    expect(injectedKpi).toHaveTextContent('+8 pts');
    expect(injectedKpi).toHaveTextContent('2 items added');

    const ejectedKpi = screen.getByTestId('kpi-ejected');
    expect(ejectedKpi).toHaveTextContent('-2 pts');
    expect(ejectedKpi).toHaveTextContent('1 item removed');

    const driftKpi = screen.getByTestId('kpi-estimate-drift');
    expect(driftKpi).toHaveTextContent('+2 pts');
    expect(driftKpi).toHaveTextContent('1 modified');
  });

  it('switches between categorized delta tabs and renders itemized lists', () => {
    render(
      <SprintDiffModal
        isOpen={true}
        onClose={vi.fn()}
        sprintId="sprint-101"
        sprintName="Sprint Alpha"
        snapshots={mockSnapshots}
        initialDiff={mockDiffResult}
      />
    );

    // Initial tab: Injected
    expect(screen.getByTestId('injected-list')).toBeInTheDocument();
    expect(screen.getByText('Security Token Rotation Worker')).toBeInTheDocument();
    expect(screen.getByText('[TASK-SEC-01]')).toBeInTheDocument();
    expect(screen.getByText('Hotfix OAuth Expiry Handling')).toBeInTheDocument();

    // Switch to Ejected tab
    fireEvent.click(screen.getByTestId('tab-ejected'));
    expect(screen.getByTestId('ejected-list')).toBeInTheDocument();
    expect(screen.getByText('Deprecated XML Serializer Removal')).toBeInTheDocument();
    expect(screen.getByText('[TASK-CHORE-03]')).toBeInTheDocument();

    // Switch to Estimate Drift tab
    fireEvent.click(screen.getByTestId('tab-estimate-drift'));
    expect(screen.getByTestId('estimate-drift-list')).toBeInTheDocument();
    expect(screen.getByText('Database Partition Migration')).toBeInTheDocument();
    expect(screen.getByText('3 pts → 5 pts')).toBeInTheDocument();

    // Switch to Status Drift tab
    fireEvent.click(screen.getByTestId('tab-status-drift'));
    expect(screen.getByTestId('status-drift-list')).toBeInTheDocument();
    expect(screen.getByText('Kafka Consumer Group Rebalance')).toBeInTheDocument();
    expect(screen.getByText('in_progress')).toBeInTheDocument();
    expect(screen.getByText('complete')).toBeInTheDocument();
  });

  it('renders clean empty zero-states across all tabs when diff is zero', () => {
    render(
      <SprintDiffModal
        isOpen={true}
        onClose={vi.fn()}
        sprintId="sprint-101"
        sprintName="Sprint Alpha"
        snapshots={mockSnapshots}
        initialDiff={emptyDiffResult}
      />
    );

    // Injected tab empty state
    expect(screen.getByTestId('empty-injected-state')).toBeInTheDocument();
    expect(screen.getByText('Zero Scope Injections')).toBeInTheDocument();

    // Ejected tab empty state
    fireEvent.click(screen.getByTestId('tab-ejected'));
    expect(screen.getByTestId('empty-ejected-state')).toBeInTheDocument();
    expect(screen.getByText('Zero Scope Ejections')).toBeInTheDocument();

    // Drift tab empty state
    fireEvent.click(screen.getByTestId('tab-estimate-drift'));
    expect(screen.getByTestId('empty-drift-state')).toBeInTheDocument();
    expect(screen.getByText('Zero Estimate Drift')).toBeInTheDocument();

    // Status tab empty state
    fireEvent.click(screen.getByTestId('tab-status-drift'));
    expect(screen.getByTestId('empty-status-state')).toBeInTheDocument();
    expect(screen.getByText('Zero Status Drift')).toBeInTheDocument();
  });

  it('handles preset buttons (Past 24 Hours, Past 7 Days, Baseline vs Now)', async () => {
    const fetchDiffMock = vi.fn().mockResolvedValue(mockDiffResult);

    render(
      <SprintDiffModal
        isOpen={true}
        onClose={vi.fn()}
        sprintId="sprint-101"
        sprintName="Sprint Alpha"
        snapshots={mockSnapshots}
        initialDiff={mockDiffResult}
        fetchDiffOverride={fetchDiffMock}
      />
    );

    const baseSelect = screen.getByTestId('diff-base-select') as HTMLSelectElement;

    // Click Past 24h
    fireEvent.click(screen.getByTestId('preset-past-24h'));
    expect(baseSelect.value).toBe('snap-rollup-24h');

    // Click Past 7d
    fireEvent.click(screen.getByTestId('preset-past-7d'));
    expect(baseSelect.value).toBe('snap-rollup-7d');

    // Click Baseline vs Now
    fireEvent.click(screen.getByTestId('preset-baseline-now'));
    expect(baseSelect.value).toBe('baseline');
  });

  it('calls onClose when clicking close button or footer close button', () => {
    const onCloseMock = vi.fn();
    render(
      <SprintDiffModal
        isOpen={true}
        onClose={onCloseMock}
        sprintId="sprint-101"
        sprintName="Sprint Alpha"
        snapshots={mockSnapshots}
        initialDiff={mockDiffResult}
      />
    );

    fireEvent.click(screen.getByTestId('diff-close-button'));
    expect(onCloseMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByText('Close Inspector'));
    expect(onCloseMock).toHaveBeenCalledTimes(2);
  });
});
