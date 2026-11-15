'use client';

import React from 'react';
import { AlertTriangle } from 'lucide-react';
import { Tooltip } from './Tooltip';

export interface ScopeVolatilityCardProps {
  scopeVolatility: number;
  isSubWindow?: boolean;
  windowStartDate?: string;
  windowEndDate?: string;
  periodVolatilityPct?: number;
  periodAddedPoints?: number;
  periodDroppedPoints?: number;
  periodStartingScope?: number;
  baselineScopeVolatility?: number;
}

const SHORT_MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export function formatShortWindowDate(dateStr?: string): string {
  if (!dateStr) return '';
  const clean = dateStr.slice(0, 10);
  const parts = clean.split('-');
  if (parts.length !== 3) return dateStr;
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(monthIdx) || monthIdx < 0 || monthIdx > 11 || isNaN(day)) return dateStr;
  return `${SHORT_MONTHS[monthIdx]} ${day}`;
}

export function ScopeVolatilityCard({
  scopeVolatility,
  isSubWindow = false,
  windowStartDate,
  windowEndDate,
  periodVolatilityPct,
  periodAddedPoints,
  periodDroppedPoints,
  baselineScopeVolatility,
}: ScopeVolatilityCardProps) {
  const hasActiveWindow = Boolean(
    isSubWindow || (windowStartDate && windowEndDate && periodVolatilityPct !== undefined)
  );

  const effectiveVolatility =
    hasActiveWindow && typeof periodVolatilityPct === 'number'
      ? periodVolatilityPct
      : scopeVolatility;

  const isHighVolatility = Math.abs(effectiveVolatility) > 20;

  const formattedVolatility = hasActiveWindow
    ? `${effectiveVolatility >= 0 ? '+' : ''}${Number.isInteger(effectiveVolatility) ? `${effectiveVolatility}.0` : effectiveVolatility.toFixed(1)}%`
    : `${effectiveVolatility > 0 ? `+${effectiveVolatility}` : `${effectiveVolatility}`}%`;

  const baselineVal =
    typeof baselineScopeVolatility === 'number' ? baselineScopeVolatility : scopeVolatility;

  const shortRange =
    windowStartDate && windowEndDate
      ? `${formatShortWindowDate(windowStartDate)} – ${formatShortWindowDate(windowEndDate)}`
      : null;

  return (
    <div
      className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition-all shadow-sm"
      data-testid="scope-volatility-card"
    >
      <div className="flex items-center justify-between text-slate-400 mb-2">
        <span className="text-xs font-medium uppercase tracking-wider">Scope Volatility</span>
        <Tooltip
          content="Percentage change in total sprint scope after Day 1 activation: (+Added - Dropped) / Baseline * 100"
          data-testid="tooltip-volatility-icon"
        >
          <div className="p-2 rounded-lg bg-amber-950/40 text-amber-400 border border-amber-800/40 cursor-help">
            <AlertTriangle className="w-4 h-4" />
          </div>
        </Tooltip>
      </div>

      <div className="flex items-baseline gap-2 flex-wrap">
        <span
          className="text-3xl font-bold text-slate-100 font-mono tracking-tight"
          data-testid="scope-volatility-value"
        >
          {formattedVolatility}
        </span>
        {hasActiveWindow && (typeof periodAddedPoints === 'number' || typeof periodDroppedPoints === 'number') && (
          <span
            className="text-xs font-mono text-slate-400"
            data-testid="scope-volatility-drift"
          >
            (+{periodAddedPoints ?? 0} / -{periodDroppedPoints ?? 0} pts)
          </span>
        )}
      </div>

      {hasActiveWindow && windowStartDate && windowEndDate && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5">
          <span
            className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-mono bg-sky-950/60 text-sky-300 border border-sky-800/50"
            data-testid="scope-volatility-window-badge"
          >
            [Window: {windowStartDate} – {windowEndDate}]
          </span>
          {shortRange && (
            <span className="text-[11px] text-slate-400 font-mono">
              Window: {shortRange}
            </span>
          )}
        </div>
      )}

      <div className="mt-3 text-xs text-slate-400">
        <span className={isHighVolatility ? 'text-amber-400 font-medium' : 'text-slate-400'}>
          {effectiveVolatility === 0
            ? 'Zero mid-sprint churn'
            : effectiveVolatility > 0
            ? 'Mid-flight scope injection'
            : 'Mid-flight scope reduced'}
        </span>
        {hasActiveWindow && (
          <div
            className="mt-1 text-[11px] text-slate-500 font-mono"
            data-testid="scope-volatility-baseline-caption"
          >
            Full sprint baseline: {baselineVal > 0 ? `+${baselineVal}` : `${baselineVal}`}%
          </div>
        )}
      </div>
    </div>
  );
}
