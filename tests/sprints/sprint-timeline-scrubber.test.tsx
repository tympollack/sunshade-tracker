import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  SprintTimelineScrubber,
  SprintHistoricalBanner,
  TimelineSnapshotPoint,
} from '@/components/sprints/SprintTimelineScrubber';

describe('TASK-TRK-TIMELINE-SCRUBBER-UI: SprintTimelineScrubber Component', () => {
  const mockSnapshots: TimelineSnapshotPoint[] = [
    {
      id: 'snap-baseline-1',
      snapshot_type: 'commitment_baseline',
      captured_at: '2026-10-01T09:00:00Z',
      committed_points: 30,
      remaining_points: 30,
    },
    {
      id: 'snap-rollup-1',
      snapshot_type: 'daily_rollup',
      captured_at: '2026-10-05T00:00:00Z',
      committed_points: 32,
      remaining_points: 24,
    },
    {
      id: 'snap-rollup-2',
      snapshot_type: 'daily_rollup',
      captured_at: '2026-10-10T00:00:00Z',
      committed_points: 35,
      remaining_points: 12,
    },
  ];

  it('renders zero-state message when snapshots array is empty', () => {
    render(
      <SprintTimelineScrubber
        sprintId="sprint-1"
        sprintName="Sprint Alpha"
        snapshots={[]}
      />
    );

    expect(screen.getByTestId('sprint-timeline-scrubber')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No historical snapshots captured yet')).toBeInTheDocument();
  });

  it('renders timeline track and ticks for all snapshots and live state', () => {
    render(
      <SprintTimelineScrubber
        sprintId="sprint-1"
        sprintName="Sprint Alpha"
        snapshots={mockSnapshots}
      />
    );

    expect(screen.getByTestId('timeline-track')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-tick-snap-baseline-1')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-tick-snap-rollup-1')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-tick-snap-rollup-2')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-tick-live')).toBeInTheDocument();
  });

  it('selects a snapshot when its tick is clicked and renders read-only historical banner', () => {
    const onSelectMock = vi.fn();

    render(
      <SprintTimelineScrubber
        sprintId="sprint-1"
        sprintName="Sprint Alpha"
        snapshots={mockSnapshots}
        onSelectSnapshot={onSelectMock}
      />
    );

    // Initial state is Live Board
    expect(screen.queryByTestId('timeline-scrubber-banner')).toBeNull();

    // Click on rollup 1
    fireEvent.click(screen.getByTestId('timeline-tick-snap-rollup-1'));

    expect(onSelectMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'snap-rollup-1' })
    );

    // Banner is rendered
    expect(screen.getByTestId('timeline-scrubber-banner')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-lock-indicator')).toHaveTextContent('Read-Only');
    expect(screen.getByText(/Viewing historical state from/i)).toBeInTheDocument();
  });

  it('navigates through snapshots using Prev and Next buttons', () => {
    const onSelectMock = vi.fn();

    render(
      <SprintTimelineScrubber
        sprintId="sprint-1"
        sprintName="Sprint Alpha"
        snapshots={mockSnapshots}
        onSelectSnapshot={onSelectMock}
        selectedSnapshotId="snap-rollup-1"
      />
    );

    const prevBtn = screen.getByTestId('timeline-prev-button');
    const nextBtn = screen.getByTestId('timeline-next-button');

    // Click Prev -> should jump to baseline (index 0)
    fireEvent.click(prevBtn);
    expect(onSelectMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'snap-baseline-1' })
    );

    // Click Next -> jumps back to rollup-1
    fireEvent.click(nextBtn);
    expect(onSelectMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'snap-rollup-1' })
    );
  });

  it('returns to live board when clicking return to live button or live state button', () => {
    const onSelectMock = vi.fn();

    render(
      <SprintTimelineScrubber
        sprintId="sprint-1"
        sprintName="Sprint Alpha"
        snapshots={mockSnapshots}
        selectedSnapshotId="snap-rollup-2"
        onSelectSnapshot={onSelectMock}
      />
    );

    // In historical mode
    expect(screen.getByTestId('timeline-scrubber-banner')).toBeInTheDocument();

    // Click Return to Live Board in banner
    fireEvent.click(screen.getByTestId('return-to-live-button'));
    expect(onSelectMock).toHaveBeenCalledWith(null);

    // Select historical snapshot again
    fireEvent.click(screen.getByTestId('timeline-tick-snap-baseline-1'));

    // Click ● Live State button in header
    fireEvent.click(screen.getByTestId('timeline-live-button'));
    expect(onSelectMock).toHaveBeenCalledWith(null);
  });

  it('triggers onOpenDiffModal when clicking compare to live button in banner', () => {
    const onDiffMock = vi.fn();

    render(
      <SprintTimelineScrubber
        sprintId="sprint-1"
        sprintName="Sprint Alpha"
        snapshots={mockSnapshots}
        selectedSnapshotId="snap-rollup-2"
        onOpenDiffModal={onDiffMock}
      />
    );

    const compareBtn = screen.getByTestId('inspect-historical-diff-button');
    expect(compareBtn).toBeInTheDocument();

    fireEvent.click(compareBtn);
    expect(onDiffMock).toHaveBeenCalledWith('snap-rollup-2', 'live');
  });

  it('updates selection when slider input is scrubbed', () => {
    const onSelectMock = vi.fn();

    render(
      <SprintTimelineScrubber
        sprintId="sprint-1"
        sprintName="Sprint Alpha"
        snapshots={mockSnapshots}
        onSelectSnapshot={onSelectMock}
      />
    );

    const slider = screen.getByTestId('timeline-slider');

    // Scrub slider to index 1 (snap-rollup-1)
    fireEvent.change(slider, { target: { value: '1' } });
    expect(onSelectMock).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'snap-rollup-1' })
    );

    // Scrub slider to last index (3 = live)
    fireEvent.change(slider, { target: { value: '3' } });
    expect(onSelectMock).toHaveBeenCalledWith(null);
  });

  it('SprintHistoricalBanner displays formatted date and correct type label', () => {
    const onReturnMock = vi.fn();
    const onInspectMock = vi.fn();

    render(
      <SprintHistoricalBanner
        snapshot={mockSnapshots[0]} // baseline
        onReturnToLive={onReturnMock}
        onInspectDiff={onInspectMock}
      />
    );

    expect(screen.getByText('Commitment Baseline')).toBeInTheDocument();
    expect(screen.getByTestId('timeline-lock-indicator')).toHaveTextContent('Read-Only');

    fireEvent.click(screen.getByTestId('return-to-live-button'));
    expect(onReturnMock).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByTestId('inspect-historical-diff-button'));
    expect(onInspectMock).toHaveBeenCalledTimes(1);
  });
});
