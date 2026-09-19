'use client';

import React, { useState } from 'react';

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
  className?: string;
}

export const SprintProgressBar: React.FC<SprintProgressBarProps> = ({
  progressPct,
  segments,
  isCompletedSprint = false,
  className = '',
}) => {
  const [isHovered, setIsHovered] = useState(false);
  const isFilled100 = isCompletedSprint || progressPct === 100;

  return (
    <div
      className={`relative flex items-center space-x-2 min-w-[140px] sm:min-w-[180px] cursor-pointer select-none ${
        isHovered ? 'z-50' : 'z-10'
      } ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => setIsHovered((prev) => !prev)}
      data-testid="sprint-progress-container"
    >
      {/* Stacked Multi-Segment Progress Bar with Tactile Depth */}
      <div
        className="flex-1 h-3 bg-slate-950/90 rounded-full border border-slate-800/80 shadow-[inset_0_1.5px_3px_rgba(0,0,0,0.85)] overflow-hidden flex relative"
        data-testid="sprint-progress-bar"
      >
        {/* Subtle glass reflection highlight across the top half */}
        <div className="absolute inset-x-0 top-0 h-[45%] bg-gradient-to-b from-white/20 to-transparent pointer-events-none z-10 rounded-t-full" />

        {segments.length > 0 ? (
          segments.map((seg) => (
            <div
              key={seg.id}
              data-testid={`sprint-progress-segment-${seg.id}`}
              style={{
                width: `${seg.pct}%`,
                backgroundColor: seg.color,
              }}
              className="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full border-r border-black/25 last:border-r-0 relative"
            />
          ))
        ) : (
          <div
            data-testid="sprint-progress-empty-or-completed"
            className={`h-full transition-all rounded-full ${
              isFilled100
                ? 'bg-emerald-500 bg-gradient-to-r from-emerald-600 to-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.35)]'
                : 'bg-slate-800/60'
            }`}
            style={{
              width: isFilled100 ? '100%' : '0%',
              backgroundColor: isFilled100 ? '#22c55e' : undefined,
            }}
          />
        )}
      </div>

      {/* Complete % by default */}
      <span
        className="text-xs font-mono text-slate-300 w-9 text-right font-medium shrink-0"
        data-testid="header-progress"
      >
        {progressPct}%
      </span>

      {/* Hover / Tap Breakdown Popover (FEAT-TRK-PROGRESS-BAR-STATUS-COLORS) */}
      {isHovered && (
        <div
          data-testid="sprint-progress-breakdown"
          className="absolute right-0 top-full mt-2 z-50 p-2.5 rounded-xl bg-slate-900/95 backdrop-blur-md border border-slate-700/80 shadow-[0_12px_32px_rgba(0,0,0,0.85),0_0_0_1px_rgba(255,255,255,0.06)] text-xs whitespace-nowrap min-w-[200px] pointer-events-auto before:absolute before:-top-2 before:left-0 before:right-0 before:h-2 before:content-[''] animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider pb-1.5 mb-1.5 border-b border-slate-800 flex items-center justify-between gap-4">
            <span>Status Breakdown</span>
            <span className="font-mono text-emerald-400 font-bold">{progressPct}% Complete</span>
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
                    <span className="text-slate-300 font-medium">{seg.count}</span>
                    <span className="text-slate-500">({seg.pct}%)</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-[11px] text-slate-400 italic">
              {isCompletedSprint ? 'Completed sprint (no remaining items)' : 'No items allocated to sprint'}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
