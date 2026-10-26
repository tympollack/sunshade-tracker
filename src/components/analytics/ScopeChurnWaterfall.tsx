'use client';

import React from 'react';
import { GitPullRequest, Plus, Minus, CheckCircle, Target } from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
} from 'recharts';
import { Tooltip } from './Tooltip';

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

export function WaterfallCustomTooltip({ active, payload, coordinate }: any) {
  if (!active || !payload?.length) return null;
  const valuePayload = payload.find((p: any) => p.dataKey === 'value') || payload[0];
  const data = valuePayload?.payload || payload[0]?.payload;
  if (!data) return null;

  // Overflow & flipping safety: shift left when near the right boundary (e.g. Delivered bar)
  const isRightAnchored = data.name === 'Delivered' || (coordinate && coordinate.x > 320);

  return (
    <div
      data-testid="waterfall-custom-tooltip"
      style={isRightAnchored ? { transform: 'translateX(-115%)' } : undefined}
      className="rounded-lg border border-slate-700/80 bg-slate-900/95 p-2.5 text-xs shadow-2xl backdrop-blur-md max-w-[220px] pointer-events-none z-50 transition-transform duration-75"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5 mb-1.5">
        <span className="font-semibold text-slate-100">{data.name}</span>
        <span className="font-mono font-bold text-cyan-400">{data.value} pts</span>
      </div>
      <p className="text-[11px] text-slate-400 leading-tight">{data.description}</p>
    </div>
  );
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

  const baseline = typeof data?.baselineCommitted === 'number' && Number.isFinite(data.baselineCommitted)
    ? Math.max(0, data.baselineCommitted)
    : 0;
  const added = typeof data?.addedPoints === 'number' && Number.isFinite(data.addedPoints)
    ? Math.max(0, data.addedPoints)
    : 0;
  const dropped = typeof data?.droppedPoints === 'number' && Number.isFinite(data.droppedPoints)
    ? Math.max(0, data.droppedPoints)
    : 0;
  const delivered = typeof data?.finalDelivered === 'number' && Number.isFinite(data.finalDelivered)
    ? Math.max(0, data.finalDelivered)
    : 0;

  const netTarget = Math.max(0, baseline + added - dropped);
  const currentTotal = baseline + added;

  // Y-axis ceiling calculation with 15% headroom to prevent bar clipping/collapse
  const rawPeak = Math.max(delivered, currentTotal, netTarget, baseline);
  const peak = Math.max(10, Math.ceil(rawPeak * 1.15));

  // Height percentages relative to peak
  const baselineHeightPct = Math.round((baseline / peak) * 100);
  const addedHeightPct = Math.round((added / peak) * 100);
  const droppedHeightPct = Math.round((dropped / peak) * 100);
  const deliveredHeightPct = Math.round((delivered / peak) * 100);

  // Floating bottom offsets for waterfall steps
  const addedBottomPct = baselineHeightPct;
  const droppedBottomPct = dropped > 0 ? Math.max(0, Math.round((netTarget / peak) * 100)) : (addedBottomPct + addedHeightPct);

  // Stacked spacer bars data pipeline model
  const waterfallData = [
    {
      name: 'Baseline',
      spacer: 0,
      value: baseline,
      fill: '#0284c7', // Sky-600
      description: 'Total story points locked in when the sprint was formally activated',
    },
    {
      name: 'Added Creep',
      spacer: baseline,
      value: added,
      fill: '#d97706', // Amber-600
      description: 'Story points added to this sprint after kickoff via backlog drag or mid-flight creation',
    },
    {
      name: 'Dropped',
      spacer: dropped === 0 ? baseline + added : Math.max(0, baseline + added - dropped),
      value: dropped,
      fill: dropped > 0 ? '#e11d48' : 'transparent', // Rose-600
      description: 'Scope removed or deferred back to backlog during active sprint execution',
    },
    {
      name: 'Delivered',
      spacer: 0,
      value: delivered,
      fill: '#059669', // Emerald-600
      description: 'Total story points marked completed. Percentage reflects Delivered / Day 1 Baseline',
    },
  ];

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
          <Tooltip
            content="Current total sprint commitment (Baseline + Added Creep - Dropped)"
            data-testid="tooltip-net-scope-pill"
          >
            <div className="text-xs text-slate-400 font-mono cursor-help">
              Net Scope: <span className="text-slate-200 font-bold">{netTarget} pts</span>
            </div>
          </Tooltip>
        )}
      </div>

      {/* Waterfall Visualization Canvas */}
      <div className="w-full h-64 min-h-[250px] relative overflow-hidden flex-1 border-b border-slate-800/80">
        {/* Recharts Stacked Spacer Bar Chart */}
        <div className="absolute inset-0">
          <ResponsiveContainer width="100%" height="100%" initialDimension={{ width: 600, height: 250 }}>
            <BarChart
              data={waterfallData}
              margin={{ top: 0, right: 0, left: 0, bottom: 0 }}
            >
              <CartesianGrid strokeDasharray="2 2" stroke="#334155" vertical={false} />
              <XAxis dataKey="name" hide />
              <YAxis domain={[0, peak]} hide />
              <RechartsTooltip
                cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                offset={12}
                content={<WaterfallCustomTooltip />}
              />
              <Bar dataKey="spacer" stackId="waterfall" fill="transparent" isAnimationActive={false} maxBarSize={48} />
              <Bar
                dataKey="value"
                stackId="waterfall"
                isAnimationActive={process.env.NODE_ENV === 'test' ? false : true}
                radius={[4, 4, 0, 0]}
                maxBarSize={48}
              >
                {waterfallData.map((entry) => (
                  <Cell key={entry.name} fill={entry.value > 0 ? entry.fill : 'transparent'} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Subtle Horizontal Dashed Bridge Lines */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none z-10"
          preserveAspectRatio="none"
        >
          {baseline > 0 && (
            <line
              x1="12.5%"
              y1={`${Math.max(2, Math.min(98, 100 - baselineHeightPct))}%`}
              x2="37.5%"
              y2={`${Math.max(2, Math.min(98, 100 - baselineHeightPct))}%`}
              stroke="#475569"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              className="stroke-slate-600"
              data-testid="bridge-baseline-added"
            />
          )}
          {added > 0 && (
            <line
              x1="37.5%"
              y1={`${Math.max(2, Math.min(98, 100 - (addedBottomPct + addedHeightPct)))}%`}
              x2="62.5%"
              y2={`${Math.max(2, Math.min(98, 100 - (addedBottomPct + addedHeightPct)))}%`}
              stroke="#475569"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              className="stroke-slate-600"
              data-testid="bridge-added-dropped"
            />
          )}
          {(dropped > 0 || currentTotal > 0) && (
            <line
              x1="62.5%"
              y1={`${Math.max(2, Math.min(98, 100 - droppedBottomPct))}%`}
              x2="87.5%"
              y2={`${Math.max(2, Math.min(98, 100 - droppedBottomPct))}%`}
              stroke="#475569"
              strokeDasharray="2 2"
              strokeWidth="1.5"
              className="stroke-slate-600"
              data-testid="bridge-dropped-delivered"
            />
          )}
        </svg>

        {/* Value Callout Labels & Tooltip Hit Areas */}
        <div className="absolute inset-0 grid grid-cols-4 pointer-events-none z-20">
          {/* Baseline Bar */}
          <div className="flex flex-col items-center w-full h-full justify-end relative">
            <div
              className="absolute pointer-events-auto"
              style={{ bottom: `${baseline > 0 ? Math.max(4, baselineHeightPct) : 0}%` }}
            >
              <Tooltip
                content="Total story points locked in when the sprint was formally activated"
                side="top"
                sideOffset={6}
                collisionPadding={12}
                data-testid="tooltip-baseline-bar"
              >
                <span className="text-xs font-semibold text-slate-100 font-mono mb-2 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-700/60 shadow-sm cursor-help block">
                  {baseline} pts
                </span>
              </Tooltip>
            </div>
          </div>

          {/* (+) Added Scope Bar (Floating) */}
          <div className="flex flex-col items-center w-full h-full justify-end relative">
            {added > 0 ? (
              <div
                className="absolute pointer-events-auto"
                style={{ bottom: `${addedBottomPct + addedHeightPct}%` }}
              >
                <Tooltip
                  content="Story points added to this sprint after kickoff via backlog drag or mid-flight creation"
                  side="top"
                  sideOffset={6}
                  collisionPadding={12}
                  data-testid="tooltip-added-bar"
                >
                  <span className="text-xs font-semibold text-slate-100 font-mono mb-2 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-700/60 shadow-sm cursor-help block">
                    +{added} pts
                  </span>
                </Tooltip>
              </div>
            ) : (
              <div className="pointer-events-auto mb-4">
                <Tooltip
                  content="Story points added to this sprint after kickoff via backlog drag or mid-flight creation"
                  side="top"
                  sideOffset={6}
                  collisionPadding={12}
                  data-testid="tooltip-added-bar"
                >
                  <span className="text-xs text-slate-500 italic cursor-help block">
                    0 added
                  </span>
                </Tooltip>
              </div>
            )}
          </div>

          {/* (-) Dropped Scope Bar (Floating) */}
          <div className="flex flex-col items-center w-full h-full justify-end relative">
            {dropped > 0 ? (
              <div
                className="absolute pointer-events-auto"
                style={{ bottom: `${droppedBottomPct + droppedHeightPct}%` }}
              >
                <Tooltip
                  content="Scope removed or deferred back to backlog during active sprint execution"
                  side="top"
                  sideOffset={6}
                  collisionPadding={12}
                  data-testid="tooltip-dropped-bar"
                >
                  <span className="text-xs font-semibold text-slate-100 font-mono mb-2 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-700/60 shadow-sm cursor-help block">
                    -{dropped} pts
                  </span>
                </Tooltip>
              </div>
            ) : (
              <div className="pointer-events-auto mb-4">
                <Tooltip
                  content="Scope removed or deferred back to backlog during active sprint execution"
                  side="top"
                  sideOffset={6}
                  collisionPadding={12}
                  data-testid="tooltip-dropped-bar"
                >
                  <span className="text-xs text-slate-500 italic cursor-help block">
                    0 dropped
                  </span>
                </Tooltip>
              </div>
            )}
          </div>

          {/* (=) Final Delivered Points Bar */}
          <div className="flex flex-col items-center w-full h-full justify-end relative">
            <div
              className="absolute pointer-events-auto"
              style={{ bottom: `${delivered > 0 ? Math.max(4, deliveredHeightPct) : 0}%` }}
            >
              <Tooltip
                content="Total story points marked completed. Percentage reflects Delivered / Day 1 Baseline"
                side="top"
                sideOffset={6}
                collisionPadding={12}
                data-testid="tooltip-delivered-bar"
              >
                <span className="text-xs font-semibold text-slate-100 font-mono mb-2 bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-700/60 shadow-sm cursor-help block">
                  {delivered} pts
                </span>
              </Tooltip>
            </div>
          </div>
        </div>
      </div>

      {/* Step Labels Footer */}
      <div className="grid grid-cols-4 pt-3 text-xs text-slate-300 text-center font-medium">
        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1 text-blue-400 font-semibold mb-0.5">
            <Target className="w-3.5 h-3.5" /> Baseline
          </div>
          <Tooltip
            content="Total story points locked in when the sprint was formally activated"
            side="top"
            sideOffset={6}
            collisionPadding={12}
            data-testid="tooltip-baseline-footer"
          >
            <span className="text-[11px] text-slate-400 cursor-help">Day 1 Commitment</span>
          </Tooltip>
        </div>

        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1 text-amber-400 font-semibold mb-0.5">
            <Plus className="w-3.5 h-3.5" /> Added Creep
          </div>
          <Tooltip
            content="Story points added to this sprint after kickoff via backlog drag or mid-flight creation"
            side="top"
            sideOffset={6}
            collisionPadding={12}
            data-testid="tooltip-added-footer"
          >
            <span className="text-[11px] text-slate-400 cursor-help">Injected Scope</span>
          </Tooltip>
        </div>

        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1 text-red-400 font-semibold mb-0.5">
            <Minus className="w-3.5 h-3.5" /> Dropped
          </div>
          <Tooltip
            content="Scope removed or deferred back to backlog during active sprint execution"
            side="top"
            sideOffset={6}
            collisionPadding={12}
            data-testid="tooltip-dropped-footer"
          >
            <span className="text-[11px] text-slate-400 cursor-help">Backlog Return</span>
          </Tooltip>
        </div>

        <div className="flex flex-col items-center">
          <div className="flex items-center gap-1 text-emerald-400 font-semibold mb-0.5">
            <CheckCircle className="w-3.5 h-3.5" /> Delivered
          </div>
          <Tooltip
            content="Total story points marked completed. Percentage reflects Delivered / Day 1 Baseline"
            side="top"
            sideOffset={6}
            collisionPadding={12}
            data-testid="tooltip-delivered-footer"
          >
            <span className="text-[11px] text-slate-400 cursor-help">
              {baseline > 0 ? `${Math.round((delivered / baseline) * 100)}% of plan` : 'Completed'}
            </span>
          </Tooltip>
        </div>
      </div>
    </div>
  );
}
