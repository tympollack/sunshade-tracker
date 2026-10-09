import React from 'react';

export interface CalibrationBarProps {
  plannedHours: number;
  actualHours: number;
  className?: string;
  showLabels?: boolean;
  compact?: boolean;
}

export function CalibrationBar({
  plannedHours,
  actualHours,
  className = '',
  showLabels = false,
  compact = false,
}: CalibrationBarProps) {
  const maxHours = Math.max(plannedHours, actualHours, 1);
  const plannedPct = Math.min(100, Math.round((plannedHours / maxHours) * 100));
  const actualPct = Math.min(100, Math.round((actualHours / maxHours) * 100));

  // Determine variance state
  const isOverrun = plannedHours > 0 ? actualHours > plannedHours * 1.15 : actualHours > 0;
  const isUnder = plannedHours > 0 && actualHours < plannedHours * 0.85;

  const actualColorClass = isOverrun
    ? 'bg-amber-400'
    : isUnder
    ? 'bg-emerald-400'
    : 'bg-emerald-500';

  return (
    <div className={`flex flex-col gap-1 ${className}`} data-testid="calibration-bar">
      {/* Dual Progress Meter Container */}
      <div className={`w-full bg-slate-950/70 border border-slate-800/80 rounded-full overflow-hidden relative flex flex-col justify-center ${compact ? 'h-2' : 'h-2.5'}`}>
        {/* Planned Envelope Baseline (Sky background indicator) */}
        <div
          data-testid="planned-envelope-bar"
          className="absolute top-0 bottom-0 left-0 bg-sky-500/25 border-r border-sky-400/50 transition-all duration-300"
          style={{ width: `${plannedPct}%` }}
          title={`Planned: ${plannedHours.toFixed(1)} hrs`}
        />

        {/* Actual Effort Track */}
        <div
          data-testid="actual-effort-bar"
          className={`h-full rounded-full transition-all duration-300 ${actualColorClass} shadow-sm opacity-90`}
          style={{ width: `${actualPct}%` }}
          title={`Actual: ${actualHours.toFixed(1)} hrs`}
        />
      </div>

      {/* Optional Detail Labels */}
      {showLabels && (
        <div className="flex items-center justify-between text-[10px] font-mono text-slate-400 px-0.5">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400/60 inline-block" />
            <span>Plan: {plannedHours.toFixed(1)}h</span>
          </span>
          <span className="flex items-center gap-1">
            <span className={`w-1.5 h-1.5 rounded-full inline-block ${isOverrun ? 'bg-amber-400' : 'bg-emerald-400'}`} />
            <span className={isOverrun ? 'text-amber-400 font-medium' : 'text-slate-300'}>
              Act: {actualHours.toFixed(1)}h
            </span>
          </span>
        </div>
      )}
    </div>
  );
}
