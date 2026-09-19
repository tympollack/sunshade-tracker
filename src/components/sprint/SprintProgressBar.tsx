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
  label?: string;
  className?: string;
}

export const SprintProgressBar: React.FC<SprintProgressBarProps> = ({
  progressPct,
  segments,
  isCompletedSprint = false,
  label,
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
      {label && (
        <span
          className="text-xs font-medium text-slate-300 tracking-wide truncate max-w-xs shrink-0"
          data-testid="progress-label"
        >
          {label}
        </span>
      )}

      {/* Frosted Acrylic Track (Frosted Glass / Liquid Capsule) */}
      <div
        className="flex-1 h-2.5 bg-white/[0.07] backdrop-blur-sm rounded-full border border-white/10 shadow-[inset_0_1px_3px_rgba(0,0,0,0.5)] overflow-hidden flex gap-1 relative"
        data-testid="sprint-progress-bar"
      >
        {/* Specular glass reflection sheen across track */}
        <div className="absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-white/25 to-transparent rounded-t-full pointer-events-none z-20" />

        {segments.length > 0 ? (
          segments.map((seg) => (
            <div
              key={seg.id}
              data-testid={`sprint-progress-segment-${seg.id}`}
              style={{
                width: `${seg.pct}%`,
                backgroundColor: seg.color,
              }}
              className="h-full rounded-full relative overflow-hidden transition-all duration-500 ease-out min-w-0"
            >
              {/* Directional gradient overlay */}
              <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-transparent to-black/25 pointer-events-none" />

              {/* Glass Specular Sheen */}
              <div className="absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-white/35 to-transparent rounded-t-full pointer-events-none" />
            </div>
          ))
        ) : (
          <div
            data-testid="sprint-progress-empty-or-completed"
            className={`h-full rounded-full relative overflow-hidden transition-all duration-500 ease-out ${
              isFilled100
                ? 'bg-emerald-500 bg-gradient-to-r from-emerald-500 to-teal-400 shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                : 'bg-transparent'
            }`}
            style={{
              width: isFilled100 ? '100%' : '0%',
              backgroundColor: isFilled100 ? '#22c55e' : undefined,
            }}
          >
            {isFilled100 && (
              <div className="absolute inset-x-0 top-0 h-[40%] bg-gradient-to-b from-white/35 to-transparent rounded-t-full pointer-events-none" />
            )}
          </div>
        )}
      </div>

      {/* Percentage text with tabular numbers */}
      <span
        className="text-xs font-mono font-semibold text-slate-100 tabular-nums w-9 text-right shrink-0"
        data-testid="header-progress"
      >
        {progressPct}%
      </span>

      {/* Hover / Tap Breakdown Popover (FEAT-TRK-PROGRESS-BAR-STATUS-COLORS) */}
      {isHovered && (
        <div
          data-testid="sprint-progress-breakdown"
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
