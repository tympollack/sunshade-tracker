'use client';

import React from 'react';
import { DollarSign, TrendingUp } from 'lucide-react';

export interface SpYieldBadgeProps {
  storyPoints?: number;
  yieldAmount?: number;
  feeAmount?: number;
  label?: string;
  className?: string;
}

/**
 * SP Yield & Fee metric badge component (BUG-TRK-BOARD-UI-POLISH-SUITE).
 * Renders yield metric and cleanly wraps fee amounts onto a dedicated second line
 * using `flex flex-col items-start gap-0.5` to prevent horizontal overflow on mobile viewports.
 */
export const SpYieldBadge: React.FC<SpYieldBadgeProps> = ({
  storyPoints,
  yieldAmount,
  feeAmount = 0,
  label = 'SP Yield',
  className = '',
}) => {
  if (yieldAmount === undefined && storyPoints === undefined) return null;

  return (
    <div
      data-testid="sp-yield-badge"
      className={`inline-flex flex-col items-start gap-0.5 px-2 py-1 rounded bg-emerald-950/40 border border-emerald-800/50 text-[10px] font-mono shrink-0 ${className}`}
    >
      <div className="flex items-center space-x-1 text-emerald-300 font-semibold whitespace-nowrap">
        <TrendingUp className="w-3 h-3 text-emerald-400 shrink-0" />
        <span>{label}:</span>
        <span>
          {yieldAmount !== undefined
            ? `$${yieldAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : `${storyPoints} pts`}
        </span>
      </div>
      <div className="flex items-center space-x-1 text-slate-400 text-[9px] whitespace-nowrap">
        <DollarSign className="w-2.5 h-2.5 text-slate-500 shrink-0 -mr-0.5" />
        <span>Fee:</span>
        <span className="text-emerald-400/90 font-medium">
          ${feeAmount.toFixed(2)}
        </span>
      </div>
    </div>
  );
};

export default SpYieldBadge;
