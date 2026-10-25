'use client';

import React from 'react';

/**
 * Coordinated dashboard-wide loading skeleton view matching exact dimensions
 * of the Sprint Analytics dashboard to prevent layout shifts and eliminate
 * any flash of fallback or dummy defaults during telemetry loading.
 */
export function AnalyticsDashboardSkeleton() {
  return (
    <div
      data-testid="analytics-dashboard-skeleton"
      className="space-y-6 animate-pulse"
      aria-label="Loading sprint analytics dashboard"
    >
      {/* Top KPI Row: 4 pulse skeleton cards with header and large number placeholders */}
      <section
        aria-label="Loading KPI Metrics"
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4"
        data-testid="skeleton-kpi-row"
      >
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 flex flex-col justify-between h-32"
            data-testid="skeleton-kpi-card"
          >
            <div className="flex items-center justify-between">
              <div className="h-4 w-28 bg-slate-800 rounded" />
              <div className="w-8 h-8 rounded-lg bg-slate-800" />
            </div>
            <div>
              <div className="h-8 w-20 bg-slate-800 rounded mb-2" />
              <div className="h-3 w-36 bg-slate-800/60 rounded" />
            </div>
          </div>
        ))}
      </section>

      {/* Middle Row: 2 large chart skeleton cards (Burndown & Daily Velocity, Scope Churn Waterfall) */}
      <section
        aria-label="Loading Primary Charts"
        className="grid grid-cols-1 lg:grid-cols-2 gap-6"
        data-testid="skeleton-middle-charts-row"
      >
        {/* Burndown & Daily Velocity Skeleton Card */}
        <div
          className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 h-[420px] flex flex-col"
          data-testid="skeleton-burndown-card"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="h-5 bg-slate-800 rounded w-52" />
            <div className="h-4 w-24 bg-slate-800/60 rounded" />
          </div>
          <div className="flex-1 bg-slate-800/40 rounded-lg flex items-end justify-between p-4 gap-2">
            {[40, 65, 30, 80, 50, 70, 45, 60].map((h, idx) => (
              <div
                key={idx}
                className="flex-1 bg-slate-800/60 rounded-t"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
        </div>

        {/* Scope Churn Waterfall Skeleton Card */}
        <div
          className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 h-[420px] flex flex-col"
          data-testid="skeleton-waterfall-card"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="h-5 bg-slate-800 rounded w-56" />
            <div className="h-4 w-28 bg-slate-800/60 rounded" />
          </div>
          <div className="flex-1 bg-slate-800/40 rounded-lg flex items-end justify-around p-6 gap-6">
            <div className="w-14 bg-slate-800/70 rounded-t h-[60%]" />
            <div className="w-14 bg-slate-800/70 rounded-md h-[30%] mb-[30%]" />
            <div className="w-14 bg-slate-800/70 rounded-md h-[20%] mb-[40%]" />
            <div className="w-14 bg-slate-800/70 rounded-t h-[50%]" />
          </div>
          <div className="flex items-center justify-around pt-3 border-t border-slate-800/60 mt-2">
            {[1, 2, 3, 4].map((col) => (
              <div key={col} className="h-3 w-16 bg-slate-800/60 rounded" />
            ))}
          </div>
        </div>
      </section>

      {/* CFD Row: 1 wide chart skeleton card with range pill placeholders */}
      <section
        aria-label="Loading Cumulative Flow Diagram"
        className="w-full"
        data-testid="skeleton-cfd-row"
      >
        <div
          className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 h-[420px] flex flex-col"
          data-testid="skeleton-cfd-card"
        >
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="h-5 bg-slate-800 rounded w-64" />
            {/* Range pill placeholders [14D | 30D | Full Sprint] & WIP toggle */}
            <div className="flex items-center gap-2">
              <div className="h-7 w-20 bg-slate-800/80 rounded-lg" />
              <div className="h-7 w-14 bg-slate-800/80 rounded-lg" />
              <div className="h-7 w-14 bg-slate-800/80 rounded-lg" />
              <div className="h-7 w-24 bg-slate-800/80 rounded-lg" />
            </div>
          </div>
          <div className="flex-1 bg-slate-800/40 rounded-lg relative overflow-hidden flex flex-col justify-end p-4">
            <div className="w-full h-3/4 bg-slate-800/30 rounded-lg" />
          </div>
        </div>
      </section>

      {/* Bottom Row: Monte Carlo card skeleton */}
      <section
        aria-label="Loading Monte Carlo Simulator"
        className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm"
        data-testid="skeleton-monte-carlo-row"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-slate-800" />
            <div className="space-y-1">
              <div className="h-4 w-48 bg-slate-800 rounded" />
              <div className="h-3 w-40 bg-slate-800/60 rounded" />
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="h-7 w-28 bg-slate-800 rounded-lg" />
            <div className="h-4 w-28 bg-slate-800/60 rounded" />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="rounded-lg border border-slate-800/80 bg-slate-900/60 p-4 space-y-3 h-[104px] min-h-[108px] flex flex-col justify-between"
              data-testid="skeleton-mc-confidence-card"
            >
              <div className="h-3 w-28 bg-slate-800 rounded" />
              <div className="h-7 w-20 bg-slate-800 rounded mt-2" />
              <div className="h-3.5 w-24 bg-slate-800/70 rounded mt-1" />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

export default AnalyticsDashboardSkeleton;
