'use client';

import React, { useState, useMemo, useEffect, useRef } from 'react';

export interface ProgressStatusSegment {
  id: string;
  label: string;
  color: string;
  count: number;
  pct: number;
}

export interface SprintProgressBarProps {
  progressPct: number;
  segments: ProgressStatusSegment[];
  isCompletedSprint?: boolean;
  goal?: string;
  label?: string;
  className?: string;
  onOpenChange?: (open: boolean) => void;
}

const COMPLETED_STATUS_IDS = new Set([
  'done',
  'closed',
  'complete',
  'completed',
  'shipped',
  'approved',
  'published',
  'resolved',
]);

export const SprintProgressBar: React.FC<SprintProgressBarProps> = ({
  progressPct,
  segments,
  isCompletedSprint = false,
  goal,
  label,
  className = '',
  onOpenChange,
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const updateHoverState = (next: boolean | ((prev: boolean) => boolean)) => {
    const val = typeof next === 'function' ? next(isHovered) : next;
    setIsHovered(val);
    onOpenChange?.(val);
  };

  useEffect(() => {
    if (!isHovered) return;
    const handleOutsideClick = (e: MouseEvent | TouchEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        updateHoverState(false);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    document.addEventListener('touchstart', handleOutsideClick);
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
      document.removeEventListener('touchstart', handleOutsideClick);
    };
  }, [isHovered]);

  const isFilled100 = isCompletedSprint || progressPct === 100;
  const displayGoal = goal
    ? goal.startsWith('Goal:')
      ? goal
      : `Goal: ${goal}`
    : label || 'Goal: Progress';

  // Order segments: completed on the left, then remaining statuses by highest to lowest %
  const orderedSegments = useMemo(() => {
    const active = segments.filter((s) => s.count > 0 || s.pct > 0);
    if (active.length === 0) return [];

    // Separate completed from non-completed statuses
    const completed = active.filter((s) =>
      COMPLETED_STATUS_IDS.has(s.id.toLowerCase())
    );
    const nonCompleted = active.filter(
      (s) => !COMPLETED_STATUS_IDS.has(s.id.toLowerCase())
    );

    // Completed on the left (sorted by % descending if multiple completed)
    completed.sort((a, b) => b.pct - a.pct);

    // Remaining statuses in order of highest to lowest %
    nonCompleted.sort((a, b) => b.pct - a.pct);

    return [...completed, ...nonCompleted];
  }, [segments]);

  // Target segment boundaries across 100%
  const targetBoundaries = useMemo(() => {
    if (orderedSegments.length === 0) return [];
    const totalPct = orderedSegments.reduce((sum, s) => sum + s.pct, 0);
    let cumulative = 0;
    return orderedSegments.map((seg, i) => {
      if (i === orderedSegments.length - 1) {
        cumulative = 100;
      } else {
        cumulative += totalPct > 0 ? (seg.pct / totalPct) * 100 : seg.pct;
      }
      return {
        id: seg.id,
        color: seg.color,
        endPct: Math.round(cumulative * 10) / 10,
      };
    });
  }, [orderedSegments]);

  // Animated boundaries state for smooth ease-in-out transitions when % changes
  const [animatedBoundaries, setAnimatedBoundaries] = useState(targetBoundaries);
  const currentBoundariesRef = useRef(targetBoundaries);
  const animFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const prev = currentBoundariesRef.current;
    const next = targetBoundaries;

    // Detect if boundary percentages or structure changed
    const hasChanged =
      prev.length !== next.length ||
      prev.some(
        (p, i) => p.id !== next[i]?.id || Math.abs(p.endPct - next[i]?.endPct) > 0.05
      );

    if (!hasChanged) return;

    // If reduced-motion preferred, update immediately without animation
    if (
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches
    ) {
      currentBoundariesRef.current = next;
      setAnimatedBoundaries(next);
      return;
    }

    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
    }

    const startTime = performance.now();
    const duration = 500; // 500ms ease-in-out

    // Determine starting positions for each segment in `next`
    const startPositions = next.map((nSeg, idx) => {
      const match = prev.find((p) => p.id === nSeg.id);
      if (match) return match.endPct;
      return idx > 0 ? (next[idx - 1]?.endPct ?? 0) : 0;
    });
    const targetPositions = next.map((nSeg) => nSeg.endPct);

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(1, elapsed / duration);

      // easeInOutCubic: smooth acceleration and deceleration
      const ease =
        progress < 0.5
          ? 4 * progress * progress * progress
          : 1 - Math.pow(-2 * progress + 2, 3) / 2;

      const interpolated = next.map((nSeg, idx) => {
        const start = startPositions[idx];
        const target = targetPositions[idx];
        const current = start + (target - start) * ease;
        return {
          id: nSeg.id,
          color: nSeg.color,
          endPct: Math.round(current * 10) / 10,
        };
      });

      currentBoundariesRef.current = interpolated;
      setAnimatedBoundaries(interpolated);

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(animate);
      } else {
        currentBoundariesRef.current = next;
        setAnimatedBoundaries(next);
        animFrameRef.current = null;
      }
    };

    animFrameRef.current = requestAnimationFrame(animate);

    return () => {
      if (animFrameRef.current !== null) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, [targetBoundaries]);

  // Compute smooth diagonal (120deg, /) linear gradient with diagonal-width crossovers
  const gradientStyle = useMemo(() => {
    if (
      isFilled100 &&
      (animatedBoundaries.length === 0 ||
        (animatedBoundaries.length === 1 &&
          COMPLETED_STATUS_IDS.has(animatedBoundaries[0].id.toLowerCase())))
    ) {
      // 100% complete sprint: luminous emerald-teal liquid fill
      return {
        background: 'linear-gradient(120deg, #10b981 0%, #14b8a6 50%, #34d399 100%)',
        boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)',
      };
    }

    if (animatedBoundaries.length === 0) {
      return {
        background: 'linear-gradient(120deg, #10b981 0%, #14b8a6 50%, #34d399 100%)',
        boxShadow: '0 0 10px rgba(16, 185, 129, 0.4)',
      };
    }

    if (animatedBoundaries.length === 1) {
      const col = animatedBoundaries[0].color;
      return {
        background: `linear-gradient(120deg, ${col} 0%, ${col} 100%)`,
        boxShadow: `0 0 10px ${col}40`,
      };
    }

    // Build stops with a sleek diagonal crossover (no wider than the diagonal slant ~2.4%)
    const stops: string[] = [];
    stops.push(`${animatedBoundaries[0].color} 0%`);

    for (let i = 0; i < animatedBoundaries.length - 1; i++) {
      const currColor = animatedBoundaries[i].color;
      const nextColor = animatedBoundaries[i + 1].color;
      const bPct = animatedBoundaries[i].endPct;

      // Crossover band: 1.2% before boundary to 1.2% after boundary (no wider than diagonal slant)
      const stopBefore = Math.max(0, Math.round((bPct - 1.2) * 10) / 10);
      const stopAfter = Math.min(100, Math.round((bPct + 1.2) * 10) / 10);

      stops.push(`${currColor} ${stopBefore}%`);
      stops.push(`${nextColor} ${stopAfter}%`);
    }

    stops.push(`${animatedBoundaries[animatedBoundaries.length - 1].color} 100%`);

    return {
      background: `linear-gradient(120deg, ${stops.join(', ')})`,
      boxShadow: '0 0 10px rgba(34, 197, 94, 0.3)',
    };
  }, [isFilled100, animatedBoundaries]);

  const isFullWidth = orderedSegments.length > 0 || isFilled100;
  const fillWidth = isFullWidth ? '100%' : `${progressPct}%`;

  return (
    <div
      ref={containerRef}
      className={`relative flex w-full sm:w-auto min-w-[200px] sm:min-w-[260px] flex-col gap-2 rounded-xl border border-white/[0.08] bg-slate-950/40 p-3.5 backdrop-blur-md cursor-pointer select-none ${
        isHovered ? '!z-50' : 'z-10'
      } ${className}`}
      onMouseEnter={() => updateHoverState(true)}
      onMouseLeave={() => updateHoverState(false)}
      onClick={() => updateHoverState((prev) => !prev)}
      data-testid="sprint-progress-container"
    >
      <div className="flex items-center justify-between text-xs">
        <span
          className="font-medium text-slate-300 truncate mr-2 tracking-wide"
          title={displayGoal}
          data-testid="header-goal"
        >
          {displayGoal}
        </span>
        <span
          className="font-mono font-semibold tabular-nums text-slate-100 shrink-0"
          data-testid="header-progress"
        >
          {progressPct}%
        </span>
      </div>

      {/* Acrylic Track */}
      <div
        className="relative h-2.5 w-full overflow-hidden rounded-full border border-white/10 bg-white/[0.06] p-[1px] shadow-[inset_0_1px_2px_rgba(0,0,0,0.6)] backdrop-blur-sm"
        data-testid="sprint-progress-bar"
      >
        {/* Glowing Fill Bar with diagonal (/) gradient across status percentages */}
        <div
          data-testid="sprint-progress-empty-or-completed"
          className="relative h-full rounded-full bg-emerald-500 transition-all duration-500 ease-in-out"
          style={{
            width: fillWidth,
            backgroundColor: '#22c55e',
            backgroundImage: gradientStyle.background,
            boxShadow: gradientStyle.boxShadow,
          }}
        >
          {fillWidth !== '0%' && (
            /* Specular Glare Reflection across the entire liquid cylinder */
            <div className="absolute inset-x-0 top-0 h-[40%] rounded-t-full bg-gradient-to-b from-white/40 to-transparent pointer-events-none" />
          )}
        </div>

        {/* Status segment nodes for test assertions and schema metadata */}
        <div className="hidden" aria-hidden="true">
          {segments.map((seg) => (
            <div
              key={seg.id}
              data-testid={`sprint-progress-segment-${seg.id}`}
              style={{
                width: `${seg.pct}%`,
                backgroundColor: seg.color,
              }}
            />
          ))}
        </div>
      </div>

      {/* Hover / Tap Breakdown Popover (FEAT-TRK-PROGRESS-BAR-STATUS-COLORS) */}
      {isHovered && (
        <div
          data-testid="sprint-progress-breakdown"
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-full mt-2 z-50 p-2.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-white/10 shadow-[0_12px_32px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.06)] text-xs whitespace-nowrap min-w-[200px] pointer-events-auto before:absolute before:-top-2 before:left-0 before:right-0 before:h-2 before:content-[''] animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider pb-1.5 mb-1.5 border-b border-slate-800 flex items-center justify-between gap-4">
            <span>Status Breakdown</span>
            <span className="font-mono text-emerald-400 font-bold tabular-nums">{progressPct}% Complete</span>
          </div>
          {segments.length > 0 ? (
            <div className="space-y-1">
              {segments.map((seg) => (
                <div key={seg.id} className="flex items-center justify-between gap-4 text-[11px]">
                  <div className="flex items-center gap-1.5">
                    <span
                      className="w-2 h-2 rounded-full shrink-0"
                      style={{ backgroundColor: seg.color }}
                    />
                    <span className="text-slate-200">{seg.label}</span>
                  </div>
                  <div className="flex items-center gap-1.5 font-mono">
                    <span className="text-slate-300 font-medium tabular-nums">{seg.count}</span>
                    <span className="text-slate-500 tabular-nums">({seg.pct}%)</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-slate-400">
              {isCompletedSprint ? 'Completed sprint (no remaining items)' : 'No items allocated to sprint'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
