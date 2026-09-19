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

  return (
    <div
      className={`relative flex items-center space-x-2 min-w-[140px] sm:min-w-[180px] cursor-pointer select-none ${className}`}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => setIsHovered((prev) => !prev)}
      data-testid="sprint-progress-container"
    >
      {/* Stacked Multi-Segment Progress Bar */}
      <div
        className="flex-1 h-2.5 bg-slate-800 rounded-full overflow-hidden flex"
        data-testid="sprint-progress-bar"
      >
        {segments.length > 0 ? (
          segments.map((seg) => (
            <div
              key={seg.id}
              data-testid={`sprint-progress-segment-${seg.id}`}
              style={{
                width: `${seg.pct}%`,
                backgroundColor: seg.color,
              }}
              className="h-full transition-all duration-300 first:rounded-l-full last:rounded-r-full"
              title={`${seg.label}: ${seg.count} (${seg.pct}%)`}
            />
          ))
        ) : (
          <div
            className="h-full bg-slate-700 transition-all rounded-full"
            style={{ width: isCompletedSprint ? '100%' : '0%' }}
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
      {isHovered && segments.length > 0 && (
        <div
          data-testid="sprint-progress-breakdown"
          className="absolute right-0 bottom-full mb-2 z-40 p-2.5 rounded-xl bg-slate-900 border border-slate-700 shadow-2xl shadow-black/80 text-xs whitespace-nowrap min-w-[200px] animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider pb-1.5 mb-1.5 border-b border-slate-800 flex items-center justify-between gap-4">
            <span>Status Breakdown</span>
            <span className="font-mono text-emerald-400 font-bold">{progressPct}% Complete</span>
          </div>
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
        </div>
      )}
    </div>
  );
};
