'use client';

import React from 'react';
import { GitPullRequest, Plus, Minus, CheckCircle, Target } from 'lucide-react';

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
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 h-[420px] flex flex-col animate-pulse">
        <div className="h-5 bg-slate-800 rounded w-56 mb-4" />
        <div className="flex-1 bg-slate-800/40 rounded-lg" />
      </div>
    );
  }

  const baseline = Math.max(0, data?.baselineCommitted || 0);
  const added = Math.max(0, data?.addedPoints || 0);
  const dropped = Math.max(0, data?.droppedPoints || 0);
  const delivered = Math.max(0, data?.finalDelivered || 0);

  const peak = Math.max(10, baseline + added, delivered);
  const netTarget = Math.max(0, baseline + added - dropped);

  // Height percentages relative to peak
  const baselineHeightPct = Math.round((baseline / peak) * 100);
  const addedHeightPct = Math.round((added / peak) * 100);
  const droppedHeightPct = Math.round((dropped / peak) * 100);
  const deliveredHeightPct = Math.round((delivered / peak) * 100);

  // Floating bottom offsets for waterfall steps
  const addedBottomPct = baselineHeightPct;
  const droppedBottomPct = Math.max(0, baselineHeightPct + addedHeightPct - droppedHeightPct);

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col justify-between h-[420px] shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <GitPullRequest className="w-4 h-4 text-purple-400" />
            Scope Churn Waterfall
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Baseline commitment, in-sprint scope creep, drops, and final delivered points
          </p>
        </div>

        {baseline > 0 && (
          <div className="text-xs text-slate-400 font-mono">
            Net Scope: <span className="text-slate-200 font-bold">{netTarget} pts</span>
          </div>
        )}
      </div>

      {/* Waterfall Visualization Canvas */}
      <div className="flex-1 flex items-end justify-around gap-4 px-4 pb-4 pt-8 border-b border-slate-800/80 relative">
        {/* Baseline Bar */}
        <div className="flex flex-col items-center flex-1 h-full justify-end group">
          <span className="text-xs font-bold text-blue-400 font-mono mb-2">
            {baseline} pts
          </span>
          <div
            className="w-full max-w-[64px] bg-gradient-to-t from-blue-700/80 to-blue-500/80 border border-blue-400/50 rounded-t-md transition-all group-hover:brightness-110 shadow-lg"
            style={{ height: `${Math.max(8, baselineHeightPct)}%` }}
          />
        </div>

        {/* (+) Added Scope Bar (Floating) */}
        <div className="flex flex-col items-center flex-1 h-full justify-end relative group">
          {added > 0 ? (
            <>
              <span
                className="absolute text-xs font-bold text-amber-400 font-mono mb-2"
                style={{ bottom: `${addedBottomPct + addedHeightPct}%` }}
              >
                +{added} pts
              </span>
              <div
                className="absolute w-full max-w-[64px] bg-gradient-to-t from-amber-600/80 to-amber-400/80 border border-amber-300/50 rounded-md transition-all group-hover:brightness-110 shadow-lg"
                style={{
                  height: `${Math.max(6, addedHeightPct)}%`,
                  bottom: `${addedBottomPct}%`,
                }}
              />
            </>
          ) : (
            <div className="text-xs text-slate-500 italic mb-4">0 added</div>
          )}
        </div>

        {/* (-) Dropped Scope Bar (Floating) */}
        <div className="flex flex-col items-center flex-1 h-full justify-end relative group">
          {dropped > 0 ? (
            <>
              <span
                className="absolute text-xs font-bold text-red-400 font-mono mb-2"
                style={{ bottom: `${droppedBottomPct + droppedHeightPct}%` }}
              >
                -{dropped} pts
              </span>
              <div
                className="absolute w-full max-w-[64px] bg-gradient-to-t from-red-600/80 to-red-400/80 border border-red-300/50 rounded-md transition-all group-hover:brightness-110 shadow-lg"
                style={{
                  height: `${Math.max(6, droppedHeightPct)}%`,
                  bottom: `${droppedBottomPct}%`,
                }}
              />
            </>
          ) : (
            <div className="text-xs text-slate-500 italic mb-4">0 dropped</div>
          )}
        </div>

        {/* (=) Final Delivered Points Bar */}
        <div className="flex flex-col items-center flex-1 h-full justify-end group">
          <span className="text-xs font-bold text-emerald-400 font-mono mb-2">
            {delivered} pts
          </span>
          <div
            className="w-full max-w-[64px] bg-gradient-to-t from-emerald-700/80 to-emerald-500/80 border border-emerald-400/50 rounded-t-md transition-all group-hover:brightness-110 shadow-lg"
            style={{ height: `${Math.max(8, deliveredHeightPct)}%` }}
          />
        </div>
      </div>

      {/* Step Labels Footer */}
      <div className="flex items-center justify-around gap-4 pt-3 text-xs text-slate-300 text-center font-medium">
        <div className="flex-1 flex flex-col items-center">
          <div className="flex items-center gap-1 text-blue-400 font-semibold mb-0.5">
            <Target className="w-3.5 h-3.5" /> Baseline
          </div>
          <span className="text-[11px] text-slate-400">Day 1 Commitment</span>
        </div>

        <div className="flex-1 flex flex-col items-center">
          <div className="flex items-center gap-1 text-amber-400 font-semibold mb-0.5">
            <Plus className="w-3.5 h-3.5" /> Added Creep
          </div>
          <span className="text-[11px] text-slate-400">Injected Scope</span>
        </div>

        <div className="flex-1 flex flex-col items-center">
          <div className="flex items-center gap-1 text-red-400 font-semibold mb-0.5">
            <Minus className="w-3.5 h-3.5" /> Dropped
          </div>
          <span className="text-[11px] text-slate-400">Backlog Return</span>
        </div>

        <div className="flex-1 flex flex-col items-center">
          <div className="flex items-center gap-1 text-emerald-400 font-semibold mb-0.5">
            <CheckCircle className="w-3.5 h-3.5" /> Delivered
          </div>
          <span className="text-[11px] text-slate-400">
            {baseline > 0 ? `${Math.round((delivered / baseline) * 100)}% of plan` : 'Completed'}
          </span>
        </div>
      </div>
    </div>
  );
}
