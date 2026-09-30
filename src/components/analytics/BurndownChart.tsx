'use client';

import React from 'react';
import { TrendingDown } from 'lucide-react';

export interface BurndownDataPoint {
  date: string;
  idealRemaining: number;
  actualRemaining: number;
  dailyVelocity?: number;
  contributorBreakdown?: Record<string, number>;
  hasScopeCreep?: boolean;
}

interface BurndownChartProps {
  data: BurndownDataPoint[];
  isLoading?: boolean;
}

export function BurndownChart({ data, isLoading = false }: BurndownChartProps) {
  if (isLoading) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 h-96 flex flex-col animate-pulse">
        <div className="h-5 bg-slate-800 rounded w-48 mb-4" />
        <div className="flex-1 bg-slate-800/40 rounded-lg" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 h-96 flex flex-col items-center justify-center text-center">
        <TrendingDown className="w-10 h-10 text-slate-600 mb-3" />
        <h3 className="text-sm font-semibold text-slate-300">No Burndown Data</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Snapshots will appear as daily midnight rollups record sprint burn progress.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 flex flex-col justify-between h-96">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-cyan-400" />
            Sprint Burndown & Velocity
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Ideal linear burn trajectory vs actual remaining story points
          </p>
        </div>
      </div>
      <div className="flex-1 w-full relative flex items-center justify-center text-slate-400 text-xs">
        {/* Placeholder SVG or full chart will render here */}
        <span>Burndown chart loaded ({data.length} snapshots)</span>
      </div>
    </div>
  );
}
