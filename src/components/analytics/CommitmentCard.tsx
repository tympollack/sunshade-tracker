'use client';

import React from 'react';
import { Award, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { Tooltip } from './Tooltip';
import {
  calculateSayDoPercentage,
  formatSayDoPercentage,
  getSayDoBadge,
} from '@/lib/analytics/metric-calculators';

export interface CommitmentCardProps {
  committedPoints?: number;
  deliveredPoints?: number;
  sayDoRatio?: number;
  scopeVolatility?: number;
  volatilityThreshold?: number;
}

export function CommitmentCard({
  committedPoints,
  deliveredPoints,
  sayDoRatio,
  scopeVolatility = 0,
  volatilityThreshold = 20,
}: CommitmentCardProps) {
  // Determine raw percentage value
  let sayDoPct: number;
  if (typeof committedPoints === 'number' && typeof deliveredPoints === 'number' && committedPoints > 0) {
    sayDoPct = calculateSayDoPercentage(committedPoints, deliveredPoints);
  } else if (typeof sayDoRatio === 'number') {
    // If sayDoRatio was passed as a 0-2 decimal leak (e.g. 0.8859999999999999 or 1.8780000000000001),
    // normalize by multiplying by 100 when committedPoints suggests it was an unscaled ratio
    if (sayDoRatio > 0 && sayDoRatio <= 2.0 && committedPoints && committedPoints > 2) {
      sayDoPct = Math.round(sayDoRatio * 1000) / 10;
    } else {
      sayDoPct = sayDoRatio;
    }
  } else {
    sayDoPct = 0;
  }

  const formattedPct = formatSayDoPercentage(sayDoPct);
  const badge = getSayDoBadge(sayDoPct, scopeVolatility, volatilityThreshold);

  let BadgeIcon = CheckCircle2;
  if (badge.label === 'Over-Delivered') BadgeIcon = Award;
  else if (badge.label === 'Moderate Drift') BadgeIcon = Clock;
  else if (badge.label === 'Scope Volatile') BadgeIcon = AlertTriangle;

  return (
    <div className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition-all shadow-sm">
      <div className="flex items-center justify-between text-slate-400 mb-2">
        <span className="text-xs font-medium uppercase tracking-wider">Commitment (Say/Do)</span>
        <Tooltip
          content="Ratio of delivered points relative to Day 1 committed scope (Delivered / Committed * 100)"
          data-testid="tooltip-say-do-icon"
        >
          <div className="p-2 rounded-lg bg-purple-950/40 text-purple-400 border border-purple-800/40 cursor-help">
            <Award className="w-4 h-4" />
          </div>
        </Tooltip>
      </div>
      <div className="flex items-baseline gap-2">
        <span
          className="text-3xl font-bold text-slate-100 font-mono tracking-tight"
          data-testid="commitment-say-do-value"
        >
          {formattedPct}
        </span>
      </div>
      <div className="mt-3">
        <Tooltip
          content={
            badge.label === 'Scope Volatile'
              ? 'Triggers when net injected scope exceeds configured runway tolerance (current: >15%)'
              : 'Sprint commitment reliability classification'
          }
          data-testid="tooltip-commitment-badge"
        >
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border cursor-help ${badge.colorClasses}`}
            data-testid="commitment-badge"
          >
            <BadgeIcon className="w-3 h-3" />
            <span>{badge.label}</span>
          </span>
        </Tooltip>
      </div>
    </div>
  );
}
