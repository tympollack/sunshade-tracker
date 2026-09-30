'use client';

import React from 'react';
import { GitPullRequest } from 'lucide-react';

export interface ScopeChurnData {
  baselineCommitted: number;
  addedPoints: number;
  droppedPoints: number;
  finalDelivered: number;
}

interface ScopeChurnWaterfallProps {
  data?: ScopeChurnData;
  isLoading?: boolean;
}

export function ScopeChurnWaterfall({ data, isLoading = false }: ScopeChurnWaterfallProps) {
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
            <GitPullRequest className="w-4 h-4 text-purple-400" />
            Scope Churn Waterfall
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Committed baseline, in-sprint creep, drops, and final delivered points
          </p>
        </div>
      </div>
      <div className="flex-1 w-full relative flex items-center justify-center text-slate-400 text-xs">
        <span>Waterfall chart loaded</span>
      </div>
    </div>
  );
}
