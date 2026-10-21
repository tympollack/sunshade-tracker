'use client';

import React from 'react';
import { Skeleton } from '@digitalcanopy/ui';
import { Activity, Award, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';
import { Tooltip } from './Tooltip';

export interface KpiMetrics {
  rollingVelocity: number;
  velocityTrend?: 'up' | 'down' | 'stable';
  sayDoRatio: number;
  scopeVolatility: number;
  remainingPoints: number;
  committedPoints?: number;
  deliveredPoints?: number;
}

export { CommitmentCard } from './CommitmentCard';
import { CommitmentCard } from './CommitmentCard';

interface KpiMetricCardsProps {
  metrics: KpiMetrics;
  isLoading?: boolean;
}

export function KpiMetricCards({ metrics, isLoading = false }: KpiMetricCardsProps) {
  if (isLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 animate-pulse flex flex-col justify-between h-32"
          >
            <div className="flex items-center justify-between">
              <Skeleton variant="text" className="h-4 w-28" />
              <Skeleton variant="rectangular" className="w-8 h-8 rounded-lg" />
            </div>
            <div>
              <Skeleton variant="text" className="h-8 w-20 mb-2" />
              <Skeleton variant="text" className="h-3 w-36" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Volatility color logic
  const volatility = metrics.scopeVolatility;
  const isHighVolatility = Math.abs(volatility) > 20;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {/* 1. 3-Sprint Rolling Velocity */}
      <div className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition-all shadow-sm">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">3-Sprint Velocity</span>
          <Tooltip
            content="Weighted average (50/30/20) of completed story points across the last three closed sprints"
            data-testid="tooltip-velocity-icon"
          >
            <div className="p-2 rounded-lg bg-cyan-950/40 text-cyan-400 border border-cyan-800/40 cursor-help">
              <Activity className="w-4 h-4" />
            </div>
          </Tooltip>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-slate-100 font-mono tracking-tight">
            {metrics.rollingVelocity}
          </span>
          <span className="text-xs text-slate-400 font-medium">pts / sprint</span>
        </div>
        <div className="mt-3 flex items-center gap-1.5 text-xs text-slate-400">
          {metrics.velocityTrend === 'up' && (
            <span className="text-emerald-400 flex items-center gap-0.5 font-medium">
              <TrendingUp className="w-3.5 h-3.5" /> Trending upward
            </span>
          )}
          {metrics.velocityTrend === 'down' && (
            <span className="text-amber-400 flex items-center gap-0.5 font-medium">
              <TrendingDown className="w-3.5 h-3.5" /> Trending downward
            </span>
          )}
          {(!metrics.velocityTrend || metrics.velocityTrend === 'stable') && (
            <span className="text-slate-400 font-medium">Weighted 50/30/20 trailing</span>
          )}
        </div>
      </div>

      {/* 2. Commitment Reliability (Say/Do Ratio) */}
      <CommitmentCard
        committedPoints={metrics.committedPoints}
        deliveredPoints={metrics.deliveredPoints}
        sayDoRatio={metrics.sayDoRatio}
        scopeVolatility={metrics.scopeVolatility}
      />

      {/* 3. Scope Volatility */}
      <div className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition-all shadow-sm">
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
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-slate-100 font-mono tracking-tight">
            {volatility > 0 ? `+${volatility}` : `${volatility}`}%
          </span>
        </div>
        <div className="mt-3 text-xs text-slate-400">
          <span className={isHighVolatility ? 'text-amber-400 font-medium' : 'text-slate-400'}>
            {volatility === 0
              ? 'Zero mid-sprint churn'
              : volatility > 0
              ? 'Mid-flight scope injection'
              : 'Mid-flight scope reduced'}
          </span>
        </div>
      </div>

      {/* 4. Active Remaining Points */}
      <div className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition-all shadow-sm">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">Uncompleted Scope</span>
          <Tooltip
            content="Story points remaining across not_started, in_progress, and in_review tasks"
            data-testid="tooltip-uncompleted-icon"
          >
            <div className="p-2 rounded-lg bg-blue-950/40 text-blue-400 border border-blue-800/40 cursor-help">
              <Clock className="w-4 h-4" />
            </div>
          </Tooltip>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-cyan-400 font-mono tracking-tight">
            {metrics.remainingPoints}
          </span>
          <span className="text-xs text-slate-400 font-medium">pts left</span>
        </div>
        <div className="mt-3 text-xs text-slate-400">
          {typeof metrics.committedPoints === 'number' && metrics.committedPoints > 0 ? (
            <span>Committed: {metrics.committedPoints} pts</span>
          ) : (
            <span>Active sprint backlog</span>
          )}
        </div>
      </div>
    </div>
  );
}
