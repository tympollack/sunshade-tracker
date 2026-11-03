'use client';

import React, { useState } from 'react';
import {
  Activity,
  AlertOctagon,
  ChevronDown,
  ChevronUp,
  Gauge,
  GitPullRequestDraft,
  Radar,
  TrendingUp,
  Zap,
} from 'lucide-react';
import { InFlightTelemetryPayload, SystemicBlockerEntry } from '@/lib/services/inFlightTelemetryService';

export interface FlowTelemetryRibbonProps {
  telemetry: InFlightTelemetryPayload;
  onSelectBlockerItem?: (itemRefOrId: string) => void;
}

const STAGE_DISPLAY_NAMES: Record<string, string> = {
  execution: 'Active Execution',
  verification: 'Verification Gate',
  staging: 'Pre-Delivery / Staged',
  unstarted: 'Backlog',
  terminal: 'Completed',
};

export function FlowTelemetryRibbon({
  telemetry,
  onSelectBlockerItem,
}: FlowTelemetryRibbonProps) {
  const [blockersCollapsed, setBlockersCollapsed] = useState(false);

  const saturationPct = Math.round((telemetry.wip_saturation_ratio || 0) * 100);
  const clampedBarPct = Math.min(100, Math.max(0, saturationPct));
  const isQueuingRisk = saturationPct >= 85;
  const isApproaching = saturationPct >= 70 && saturationPct < 85;

  // Resolve bottleneck stage label & units
  const bottleneckStageKey = telemetry.bottleneck_stage;
  const matchedStageBucket = bottleneckStageKey
    ? telemetry.stages.find((s) => s.stage === bottleneckStageKey)
    : null;
  const bottleneckLabel = matchedStageBucket?.label ||
    (bottleneckStageKey ? STAGE_DISPLAY_NAMES[bottleneckStageKey] || bottleneckStageKey : 'Balanced Flow');
  const bottleneckUnits = telemetry.bottleneck_stage_units || 0;

  // Also check which stage has the longest median dwell time if bottleneckStageKey is null
  const longestDwellStage = [...(telemetry.stages || [])].sort(
    (a, b) => b.median_dwell_ms - a.median_dwell_ms
  )[0];

  const netDrift = telemetry.scope_drift?.net_change || 0;
  const addedUnits = telemetry.scope_drift?.added_units || 0;
  const droppedUnits = telemetry.scope_drift?.dropped_units || 0;

  const blockers: SystemicBlockerEntry[] = telemetry.active_blockers || [];

  const handleBlockerClick = (blocker: SystemicBlockerEntry) => {
    const ref = blocker.external_ref_id || blocker.item_id;
    if (onSelectBlockerItem) {
      onSelectBlockerItem(ref);
      return;
    }
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('item', ref);
      window.history.replaceState(null, '', url.pathname + url.search);
      window.dispatchEvent(new PopStateEvent('popstate'));
    }
  };

  return (
    <section
      data-testid="flow-telemetry-ribbon"
      aria-label="Systemic Flow Health Telemetry Ribbon"
      className="w-full space-y-2.5"
    >
      {/* Ambient Blocker Marquee (renders when active items have systemic blockers or CI failures) */}
      {blockers.length > 0 && (
        <div
          data-testid="ambient-blocker-marquee"
          role="region"
          aria-label="Active Systemic Blockers"
          className="rounded-xl bg-amber-950/60 border border-amber-500/40 backdrop-blur-md shadow-lg overflow-hidden transition-all"
        >
          <div className="px-3.5 py-2 flex items-center justify-between gap-2 bg-amber-500/10">
            <div className="flex items-center space-x-2 min-w-0">
              <span className="relative flex h-2.5 w-2.5 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-amber-500" />
              </span>
              <AlertOctagon className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="text-xs font-bold uppercase tracking-wider text-amber-200 truncate">
                Systemic Flow Impediment Radar ({blockers.length} Active)
              </span>
            </div>

            <button
              type="button"
              data-testid="toggle-blocker-marquee-btn"
              onClick={() => setBlockersCollapsed((prev) => !prev)}
              aria-expanded={!blockersCollapsed}
              className="flex items-center space-x-1 px-2 py-0.5 rounded bg-amber-950/80 hover:bg-amber-900/80 border border-amber-500/30 text-[11px] font-mono text-amber-200 transition-colors cursor-pointer shrink-0"
            >
              <span>{blockersCollapsed ? 'Expand' : 'Collapse'}</span>
              {blockersCollapsed ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronUp className="w-3.5 h-3.5" />
              )}
            </button>
          </div>

          {!blockersCollapsed && (
            <div className="px-3.5 py-2.5 flex flex-wrap items-center gap-2 border-t border-amber-500/20">
              {blockers.map((blocker) => {
                const refTag = blocker.external_ref_id || blocker.item_id;
                return (
                  <button
                    key={blocker.item_id}
                    type="button"
                    data-testid={`blocker-pill-${refTag}`}
                    onClick={() => handleBlockerClick(blocker)}
                    className="group flex items-center space-x-2 px-2.5 py-1 rounded-lg bg-slate-950/90 hover:bg-slate-900 border border-amber-500/40 hover:border-amber-400 text-xs transition-all cursor-pointer text-left"
                  >
                    <span className="font-mono font-semibold text-amber-300 group-hover:underline">
                      #{refTag}
                    </span>
                    <span className="text-slate-200 font-medium truncate max-w-[200px]">
                      {blocker.title}
                    </span>
                    <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-200 border border-amber-500/30">
                      {blocker.reason}
                    </span>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 4 Systemic Metric Badges Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
        {/* 1. WIP Saturation Index */}
        <div
          data-testid="metric-wip-saturation"
          className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/90 backdrop-blur-md flex flex-col justify-between space-y-2 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-300">
              <Gauge className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>WIP Saturation Index</span>
            </div>
            <span
              data-testid="wip-saturation-status-badge"
              className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                isQueuingRisk
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : isApproaching
                  ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
              }`}
            >
              {isQueuingRisk ? 'Queuing Risk' : 'Optimal'}
            </span>
          </div>

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <span className="text-sm font-bold font-mono text-white">
                {saturationPct}% of Concurrency Limit
              </span>
              <span className="text-[11px] font-mono text-slate-400">
                {telemetry.total_active_items}/{telemetry.total_wip_capacity} items
              </span>
            </div>

            <div className="w-full h-1.5 rounded-full bg-slate-950 overflow-hidden border border-slate-800">
              <div
                className={`h-full transition-all duration-300 ${
                  isQueuingRisk
                    ? 'bg-amber-400'
                    : isApproaching
                    ? 'bg-cyan-400'
                    : 'bg-emerald-400'
                }`}
                style={{ width: `${clampedBarPct}%` }}
              />
            </div>
          </div>
        </div>

        {/* 2. Queue Flow Radar */}
        <div
          data-testid="metric-queue-flow-radar"
          className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/90 backdrop-blur-md flex flex-col justify-between space-y-2 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-300">
              <Radar className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Queue Flow Radar</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-950 text-slate-400 border border-slate-800">
              {telemetry.stage_dwell_radar.length > 0
                ? `${telemetry.stage_dwell_radar.length} stalled`
                : 'Flowing'}
            </span>
          </div>

          <div>
            <div className="text-sm font-bold text-white truncate">
              {bottleneckStageKey
                ? `Bottleneck: ${bottleneckLabel} · ${bottleneckUnits} units waiting`
                : 'No Active Stage Bottleneck'}
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
              {longestDwellStage && longestDwellStage.median_dwell_hours > 0
                ? `Median Stage Dwell: ${longestDwellStage.median_dwell_hours}h (${longestDwellStage.label})`
                : `Total Active Volume: ${telemetry.total_active_units} units`}
            </div>
          </div>
        </div>

        {/* 3. Mid-Cycle Scope Inflow */}
        <div
          data-testid="metric-scope-inflow"
          className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/90 backdrop-blur-md flex flex-col justify-between space-y-2 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-300">
              <GitPullRequestDraft className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <span>Mid-Cycle Scope Inflow</span>
            </div>
            <span
              className={`text-[10px] font-mono font-semibold px-2 py-0.5 rounded-full border ${
                netDrift > 0
                  ? 'bg-amber-500/15 text-amber-300 border-amber-500/40'
                  : 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40'
              }`}
            >
              {netDrift === 0 ? 'Stable Scope' : 'Scope Shift'}
            </span>
          </div>

          <div>
            <div className="text-sm font-bold font-mono text-white">
              {netDrift > 0 ? `+${netDrift}` : netDrift} units net volatility
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
              +{addedUnits} added · -{droppedUnits} dropped since lock
            </div>
          </div>
        </div>

        {/* 4. Throughput Cadence */}
        <div
          data-testid="metric-throughput-cadence"
          className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800/90 backdrop-blur-md flex flex-col justify-between space-y-2 shadow-sm"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center space-x-1.5 text-xs font-semibold text-slate-300">
              <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span>Throughput Cadence</span>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/40">
              Rolling 24h
            </span>
          </div>

          <div>
            <div className="text-sm font-bold font-mono text-white flex items-baseline gap-1.5">
              <span>{telemetry.rolling_24h_completed_units} units completed</span>
            </div>
            <div className="text-[11px] font-mono text-slate-400 mt-0.5">
              {telemetry.rolling_24h_completed_items} deliverable
              {telemetry.rolling_24h_completed_items === 1 ? '' : 's'} cleared in last 24h
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
