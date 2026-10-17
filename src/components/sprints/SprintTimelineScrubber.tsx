'use client';

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  History,
  Clock,
  Calendar,
  Lock,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  GitCompare,
  Eye,
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
} from 'lucide-react';

export interface TimelineSnapshotPoint {
  id: string;
  captured_at: string;
  snapshot_type: 'commitment_baseline' | 'daily_rollup' | string;
  committed_points?: number;
  remaining_points?: number;
  items_count?: number;
  items?: any[];
  name?: string;
  [key: string]: any;
}

export interface SprintTimelineScrubberProps {
  sprintId: string;
  sprintName?: string;
  startDate?: string;
  endDate?: string;
  snapshots: TimelineSnapshotPoint[];
  selectedSnapshotId?: string | null; // null or 'live' means live board
  onSelectSnapshot?: (snapshot: TimelineSnapshotPoint | null) => void; // null means live
  onOpenDiffModal?: (baseId: string, targetId: string) => void;
  isLoading?: boolean;
  className?: string;
}

export interface SprintHistoricalBannerProps {
  snapshot: TimelineSnapshotPoint;
  onReturnToLive: () => void;
  onInspectDiff?: () => void;
  className?: string;
}

/**
 * Floating / Top Banner for Historical Sprint State (Time Machine Mode)
 * Enforces visual read-only cue and 1-click restore to live board.
 */
export const SprintHistoricalBanner: React.FC<SprintHistoricalBannerProps> = ({
  snapshot,
  onReturnToLive,
  onInspectDiff,
  className = '',
}) => {
  const formattedDate = useMemo(() => {
    if (!snapshot.captured_at) return 'Historical Point';
    return new Date(snapshot.captured_at).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  }, [snapshot.captured_at]);

  const isBaseline = snapshot.snapshot_type === 'commitment_baseline';
  const typeLabel = isBaseline ? 'Commitment Baseline' : 'Daily Rollup';

  return (
    <div
      data-testid="timeline-scrubber-banner"
      className={`p-3.5 sm:p-4 rounded-xl bg-gradient-to-r from-amber-950/70 via-slate-900/90 to-amber-950/40 border border-amber-500/40 text-amber-200 text-xs shadow-lg backdrop-blur-md flex flex-wrap items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2 duration-200 ${className}`}
    >
      <div className="flex items-center space-x-3 min-w-0">
        <div className="p-2 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-400 shrink-0">
          <History className="w-4 h-4" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center space-x-2">
            <span
              data-testid="timeline-lock-indicator"
              className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1"
            >
              <Lock className="w-3 h-3" /> Read-Only
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              {typeLabel}
            </span>
          </div>
          <p className="text-xs sm:text-sm font-semibold text-white mt-0.5 truncate">
            Viewing historical state from <span className="text-amber-300">{formattedDate}</span> (Read-Only)
          </p>
        </div>
      </div>

      <div className="flex items-center space-x-2 shrink-0">
        {onInspectDiff && (
          <button
            type="button"
            data-testid="inspect-historical-diff-button"
            onClick={onInspectDiff}
            className="px-3 py-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 text-slate-200 hover:text-white border border-slate-700 font-mono text-xs font-medium transition-all flex items-center gap-1.5"
          >
            <GitCompare className="w-3.5 h-3.5 text-blue-400" />
            <span>Compare to Live</span>
          </button>
        )}
        <button
          type="button"
          data-testid="return-to-live-button"
          onClick={onReturnToLive}
          className="px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 font-mono text-xs font-bold transition-all shadow-md shadow-amber-900/30 flex items-center gap-1.5"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Return to Live Board</span>
        </button>
      </div>
    </div>
  );
};

/**
 * Interactive Timeline Scrubber ("Time Machine")
 * Allows users to scrub across historical snapshot dates, preview past backlog state,
 * and seamlessly launch delta diff inspections.
 */
export const SprintTimelineScrubber: React.FC<SprintTimelineScrubberProps> = ({
  sprintId,
  sprintName = 'Sprint',
  startDate,
  endDate,
  snapshots = [],
  selectedSnapshotId: propSelectedSnapshotId,
  onSelectSnapshot,
  onOpenDiffModal,
  isLoading = false,
  className = '',
}) => {
  // Sort snapshots chronologically
  const sortedSnapshots = useMemo(() => {
    return [...snapshots].sort(
      (a, b) => new Date(a.captured_at).getTime() - new Date(b.captured_at).getTime()
    );
  }, [snapshots]);

  // Internal selection state (null = live board)
  const [internalSelectedId, setInternalSelectedId] = useState<string | null>(
    propSelectedSnapshotId !== undefined ? propSelectedSnapshotId : null
  );

  useEffect(() => {
    if (propSelectedSnapshotId !== undefined) {
      setInternalSelectedId(propSelectedSnapshotId);
    }
  }, [propSelectedSnapshotId]);

  // Current active snapshot object (null if live)
  const activeSnapshot = useMemo(() => {
    if (!internalSelectedId || internalSelectedId === 'live') return null;
    return sortedSnapshots.find((s) => s.id === internalSelectedId) || null;
  }, [internalSelectedId, sortedSnapshots]);

  // Discrete index in timeline: 0 to N-1 are snapshots, N is 'live'
  const activeIndex = useMemo(() => {
    if (!activeSnapshot) return sortedSnapshots.length; // Live is the final step
    const idx = sortedSnapshots.findIndex((s) => s.id === activeSnapshot.id);
    return idx >= 0 ? idx : sortedSnapshots.length;
  }, [activeSnapshot, sortedSnapshots]);

  const totalSteps = sortedSnapshots.length; // Max slider value = sortedSnapshots.length

  const handleSelectIndex = useCallback(
    (index: number) => {
      if (index >= sortedSnapshots.length) {
        setInternalSelectedId(null);
        onSelectSnapshot?.(null);
      } else {
        const target = sortedSnapshots[index];
        if (target) {
          setInternalSelectedId(target.id);
          onSelectSnapshot?.(target);
        }
      }
    },
    [sortedSnapshots, onSelectSnapshot]
  );

  const handlePrev = () => {
    if (activeIndex > 0) {
      handleSelectIndex(activeIndex - 1);
    }
  };

  const handleNext = () => {
    if (activeIndex < totalSteps) {
      handleSelectIndex(activeIndex + 1);
    }
  };

  const handleReturnToLive = () => {
    setInternalSelectedId(null);
    onSelectSnapshot?.(null);
  };

  const handleInspectDiff = () => {
    if (activeSnapshot && onOpenDiffModal) {
      onOpenDiffModal(activeSnapshot.id, 'live');
    }
  };

  const formatTickLabel = (snap: TimelineSnapshotPoint) => {
    if (!snap.captured_at) return snap.id;
    const d = new Date(snap.captured_at);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  return (
    <div
      data-testid="sprint-timeline-scrubber"
      className={`rounded-2xl bg-[#090d16] border border-slate-800/90 shadow-xl overflow-hidden p-4 sm:p-5 space-y-4 ${className}`}
    >
      {/* Historical State Banner when active */}
      {activeSnapshot && (
        <SprintHistoricalBanner
          snapshot={activeSnapshot}
          onReturnToLive={handleReturnToLive}
          onInspectDiff={onOpenDiffModal ? handleInspectDiff : undefined}
        />
      )}

      {/* Scrubber Control Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-xl bg-sky-500/10 border border-sky-500/30 text-sky-400">
            <Clock className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <span className="text-xs font-mono font-bold uppercase tracking-wider text-slate-300">
                Timeline Scrubber
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-400">
                Time Machine
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Scrub backwards to reconstruct historical sprint backlogs and inspect scope drift
            </p>
          </div>
        </div>

        {/* Stepper Buttons & Status */}
        <div className="flex items-center space-x-2 self-start sm:self-auto font-mono text-xs">
          <button
            type="button"
            data-testid="timeline-prev-button"
            onClick={handlePrev}
            disabled={activeIndex === 0 || sortedSnapshots.length === 0}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            title="Previous Snapshot"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            data-testid="timeline-next-button"
            onClick={handleNext}
            disabled={activeIndex >= totalSteps || sortedSnapshots.length === 0}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
            title="Next Snapshot"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <button
            type="button"
            data-testid="timeline-live-button"
            onClick={handleReturnToLive}
            className={`px-3 py-1.5 rounded-lg font-medium transition-all ${
              !activeSnapshot
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                : 'bg-slate-900 text-slate-400 hover:text-white border border-slate-800'
            }`}
          >
            ● Live State
          </button>
        </div>
      </div>

      {/* Zero-State when no snapshots exist */}
      {sortedSnapshots.length === 0 && !isLoading && (
        <div
          data-testid="timeline-empty-state"
          className="p-6 rounded-xl bg-slate-900/30 border border-dashed border-slate-800 text-center space-y-1.5 font-mono"
        >
          <Calendar className="w-6 h-6 text-slate-500 mx-auto" />
          <p className="text-xs text-slate-300 font-semibold">No historical snapshots captured yet</p>
          <p className="text-[11px] text-slate-500">
            Board is currently displaying real-time live work items. Daily rollups will appear here as snapshots are taken.
          </p>
        </div>
      )}

      {/* Interactive Slider Track */}
      {sortedSnapshots.length > 0 && (
        <div className="space-y-3 pt-2">
          {/* Slider input */}
          <div className="relative flex items-center">
            <input
              type="range"
              data-testid="timeline-slider"
              min={0}
              max={totalSteps}
              step={1}
              value={activeIndex}
              onChange={(e) => handleSelectIndex(Number(e.target.value))}
              aria-label="Sprint timeline snapshot selector"
              className="w-full h-2 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-500"
            />
          </div>

          {/* Timeline Ticks / Markers Bar */}
          <div data-testid="timeline-track" className="relative flex justify-between items-center text-[11px] font-mono pt-1">
            {sortedSnapshots.map((snap, idx) => {
              const isSelected = activeSnapshot?.id === snap.id;
              const isBaseline = snap.snapshot_type === 'commitment_baseline';

              return (
                <button
                  key={snap.id}
                  type="button"
                  data-testid={`timeline-tick-${snap.id}`}
                  onClick={() => handleSelectIndex(idx)}
                  className={`flex flex-col items-center group transition-colors focus:outline-none ${
                    isSelected ? 'text-sky-300 font-bold' : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <div
                    className={`w-2.5 h-2.5 rounded-full mb-1 transition-all ${
                      isSelected
                        ? 'bg-sky-400 ring-4 ring-sky-500/20 scale-125'
                        : isBaseline
                        ? 'bg-purple-400/80 group-hover:bg-purple-300'
                        : 'bg-slate-600 group-hover:bg-slate-400'
                    }`}
                  />
                  <span className="hidden sm:inline">
                    {isBaseline ? 'Baseline' : formatTickLabel(snap)}
                  </span>
                </button>
              );
            })}

            {/* Live End Tick */}
            <button
              type="button"
              data-testid="timeline-tick-live"
              onClick={() => handleSelectIndex(totalSteps)}
              className={`flex flex-col items-center group transition-colors focus:outline-none ${
                !activeSnapshot ? 'text-emerald-300 font-bold' : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div
                className={`w-2.5 h-2.5 rounded-full mb-1 transition-all ${
                  !activeSnapshot
                    ? 'bg-emerald-400 ring-4 ring-emerald-500/20 scale-125'
                    : 'bg-slate-600 group-hover:bg-slate-400'
                }`}
              />
              <span className="hidden sm:inline">Now (Live)</span>
            </button>
          </div>

          {/* Active Snapshot Telemetry Pill */}
          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
            <div className="flex items-center space-x-2">
              <span className="text-slate-400">Viewing:</span>
              {activeSnapshot ? (
                <>
                  <span className="text-white font-bold">
                    {activeSnapshot.snapshot_type === 'commitment_baseline'
                      ? 'Commitment Baseline'
                      : formatTickLabel(activeSnapshot)}
                  </span>
                  <span className="text-slate-500">
                    ({new Date(activeSnapshot.captured_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                  </span>
                </>
              ) : (
                <span className="text-emerald-400 font-bold">Live Board (Current Sprint Backlog)</span>
              )}
            </div>

            <div className="flex items-center space-x-3 text-slate-400">
              {activeSnapshot ? (
                <>
                  <span>
                    Committed:{' '}
                    <strong className="text-slate-200">{activeSnapshot.committed_points ?? 0} pts</strong>
                  </span>
                  <span>
                    Remaining:{' '}
                    <strong className="text-slate-200">{activeSnapshot.remaining_points ?? 0} pts</strong>
                  </span>
                </>
              ) : (
                <span>Interactive live mutations permitted</span>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
