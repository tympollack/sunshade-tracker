'use client';

import React from 'react';
import { Activity, Award, TrendingDown, TrendingUp, AlertTriangle, CheckCircle2, Clock } from 'lucide-react';

export interface KpiMetrics {
  rollingVelocity: number;
  velocityTrend?: 'up' | 'down' | 'stable';
  sayDoRatio: number;
  scopeVolatility: number;
  remainingPoints: number;
  committedPoints?: number;
}

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
              <div className="h-4 bg-slate-800 rounded w-28" />
              <div className="w-8 h-8 bg-slate-800 rounded-lg" />
            </div>
            <div>
              <div className="h-8 bg-slate-800 rounded w-20 mb-2" />
              <div className="h-3 bg-slate-800/80 rounded w-36" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  // Say/Do Ratio color badge logic
  const sayDo = metrics.sayDoRatio;
  let sayDoBadgeColor = 'text-red-400 bg-red-950/60 border-red-800/50';
  let SayDoIcon = AlertTriangle;

  if (sayDo >= 85) {
    sayDoBadgeColor = 'text-emerald-400 bg-emerald-950/60 border-emerald-800/50';
    SayDoIcon = CheckCircle2;
  } else if (sayDo >= 70) {
    sayDoBadgeColor = 'text-amber-400 bg-amber-950/60 border-amber-800/50';
    SayDoIcon = Clock;
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
          <div className="p-2 rounded-lg bg-cyan-950/40 text-cyan-400 border border-cyan-800/40">
            <Activity className="w-4 h-4" />
          </div>
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
      <div className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition-all shadow-sm">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">Commitment (Say/Do)</span>
          <div className="p-2 rounded-lg bg-purple-950/40 text-purple-400 border border-purple-800/40">
            <Award className="w-4 h-4" />
          </div>
        </div>
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-slate-100 font-mono tracking-tight">
            {sayDo}%
          </span>
        </div>
        <div className="mt-3">
          <span
            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${sayDoBadgeColor}`}
          >
            <SayDoIcon className="w-3 h-3" />
            {sayDo >= 85 ? 'Predictable' : sayDo >= 70 ? 'Moderate Drift' : 'Scope Volatile'}
          </span>
        </div>
      </div>

      {/* 3. Scope Volatility */}
      <div className="bg-slate-900/80 border border-slate-800 hover:border-slate-700/80 rounded-xl p-5 transition-all shadow-sm">
        <div className="flex items-center justify-between text-slate-400 mb-2">
          <span className="text-xs font-medium uppercase tracking-wider">Scope Volatility</span>
          <div className="p-2 rounded-lg bg-amber-950/40 text-amber-400 border border-amber-800/40">
            <AlertTriangle className="w-4 h-4" />
          </div>
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
          <div className="p-2 rounded-lg bg-blue-950/40 text-blue-400 border border-blue-800/40">
            <Clock className="w-4 h-4" />
          </div>
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
