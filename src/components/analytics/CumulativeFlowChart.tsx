'use client';

import React from 'react';
import { AreaChart } from 'lucide-react';
import { CfdDataPoint } from '@/lib/analytics/flow-diagnostics';

interface CumulativeFlowChartProps {
  data: CfdDataPoint[];
  isLoading?: boolean;
}

export function CumulativeFlowChart({ data, isLoading = false }: CumulativeFlowChartProps) {
  if (isLoading) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 h-96 flex flex-col animate-pulse">
        <div className="h-5 bg-slate-800 rounded w-48 mb-4" />
        <div className="flex-1 bg-slate-800/40 rounded-lg" />
      </div>
    );
  }

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 flex flex-col justify-between h-96">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <AreaChart className="w-4 h-4 text-emerald-400" />
            Cumulative Flow Diagram (CFD)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            WIP inventory, bottleneck discovery, and delivery flow progression
          </p>
        </div>
      </div>
      <div className="flex-1 w-full relative flex items-center justify-center text-slate-400 text-xs">
        <span>CFD chart loaded ({data.length} dates)</span>
      </div>
    </div>
  );
}
