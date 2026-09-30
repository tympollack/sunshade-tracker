'use client';

import React, { useState } from 'react';
import { TrendingDown, AlertTriangle } from 'lucide-react';

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

const CONTRIBUTOR_COLORS = [
  '#38bdf8', // cyan
  '#a855f7', // purple
  '#ec4899', // pink
  '#10b981', // emerald
  '#f59e0b', // amber
  '#6366f1', // indigo
];

export function BurndownChart({ data, isLoading = false }: BurndownChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 h-[420px] flex flex-col animate-pulse">
        <div className="h-5 bg-slate-800 rounded w-48 mb-4" />
        <div className="flex-1 bg-slate-800/40 rounded-lg" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 h-[420px] flex flex-col items-center justify-center text-center">
        <TrendingDown className="w-10 h-10 text-slate-600 mb-3" />
        <h3 className="text-sm font-semibold text-slate-300">No Burndown Snapshots</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Snapshots will appear as daily midnight rollups record sprint burn progress.
        </p>
      </div>
    );
  }

  // Dimensions & Scale Calculations
  const svgWidth = 800;
  const svgHeight = 360;
  const padding = { top: 35, right: 30, bottom: 50, left: 55 };
  const plotWidth = svgWidth - padding.left - padding.right;
  const plotHeight = svgHeight - padding.top - padding.bottom;

  // Max value calculation
  const maxPointValue = Math.max(
    10,
    ...data.map((d) => Math.max(d.idealRemaining, d.actualRemaining)),
    ...data.map((d) => d.dailyVelocity || 0)
  );
  const yCeiling = Math.ceil(maxPointValue / 5) * 5;

  const getX = (index: number) => {
    if (data.length <= 1) return padding.left + plotWidth / 2;
    return padding.left + (index / (data.length - 1)) * plotWidth;
  };

  const getY = (val: number) => {
    return padding.top + (1 - val / yCeiling) * plotHeight;
  };

  // Lines calculation
  const idealPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)},${getY(d.idealRemaining)}`)
    .join(' ');

  const actualPath = data
    .map((d, i) => `${i === 0 ? 'M' : 'L'} ${getX(i)},${getY(d.actualRemaining)}`)
    .join(' ');

  // Detect upward scope addition spikes
  const scopeSpikes = data.map((d, i) => {
    if (d.hasScopeCreep) return true;
    if (i > 0 && d.actualRemaining > data[i - 1].actualRemaining) {
      return true;
    }
    return false;
  });

  // Unique contributors for legend
  const allContributors = Array.from(
    new Set(
      data.flatMap((d) => Object.keys(d.contributorBreakdown || {}))
    )
  );

  const activePoint = hoveredIndex !== null ? data[hoveredIndex] : null;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col justify-between h-[420px] shadow-sm relative">
      {/* Header and Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <TrendingDown className="w-4 h-4 text-cyan-400" />
            Sprint Burndown & Daily Velocity
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            Ideal burn trajectory vs actual remaining story points with contributor stacks
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-4 text-xs text-slate-400">
          <div className="flex items-center gap-1.5">
            <span className="w-3.5 h-0.5 bg-slate-400 border-b border-dashed border-slate-400" />
            <span>Ideal Burn</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-3 h-1 bg-cyan-400 rounded-full" />
            <span className="text-cyan-400 font-medium">Actual Burn</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 bg-purple-500 rounded" />
            <span>Completed Stacks</span>
          </div>
        </div>
      </div>

      {/* SVG Chart Container */}
      <div className="relative flex-1 w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-full select-none"
          preserveAspectRatio="xMidYMid meet"
        >
          {/* Background Grid Lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
            const y = padding.top + pct * plotHeight;
            const val = Math.round(yCeiling * (1 - pct));
            return (
              <g key={idx}>
                <line
                  x1={padding.left}
                  y1={y}
                  x2={svgWidth - padding.right}
                  y2={y}
                  stroke="#334155"
                  strokeDasharray="3 3"
                  strokeWidth="1"
                />
                <text
                  x={padding.left - 8}
                  y={y + 4}
                  textAnchor="end"
                  fill="#64748b"
                  fontSize="11"
                  fontFamily="monospace"
                >
                  {val}
                </text>
              </g>
            );
          })}

          {/* Date Axis Labels */}
          {data.map((d, i) => {
            const x = getX(i);
            const dateLabel = d.date.includes('-')
              ? d.date.split('-').slice(1).join('/')
              : d.date;
            return (
              <text
                key={i}
                x={x}
                y={svgHeight - padding.bottom + 20}
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="11"
                fontFamily="sans-serif"
              >
                {dateLabel}
              </text>
            );
          })}

          {/* Layer 2: Contributor Stacked Bars */}
          {data.map((d, i) => {
            const x = getX(i);
            const barWidth = Math.min(28, Math.max(10, (plotWidth / data.length) * 0.45));
            const barX = x - barWidth / 2;
            const baseY = padding.top + plotHeight;

            let accumulatedHeight = 0;
            const contributors = Object.entries(d.contributorBreakdown || {});

            if (contributors.length === 0 && (d.dailyVelocity || 0) > 0) {
              const barH = ((d.dailyVelocity || 0) / yCeiling) * plotHeight;
              return (
                <rect
                  key={`bar-${i}`}
                  x={barX}
                  y={baseY - barH}
                  width={barWidth}
                  height={barH}
                  fill="#8b5cf6"
                  opacity="0.75"
                  rx="2"
                />
              );
            }

            return (
              <g key={`bar-group-${i}`}>
                {contributors.map(([contributor, pts], cIdx) => {
                  const segHeight = (pts / yCeiling) * plotHeight;
                  const segY = baseY - accumulatedHeight - segHeight;
                  accumulatedHeight += segHeight;
                  const color = CONTRIBUTOR_COLORS[cIdx % CONTRIBUTOR_COLORS.length];

                  return (
                    <rect
                      key={cIdx}
                      x={barX}
                      y={segY}
                      width={barWidth}
                      height={segHeight}
                      fill={color}
                      opacity="0.8"
                      rx="1"
                    />
                  );
                })}
              </g>
            );
          })}

          {/* Layer 1: Ideal Burn Line (Dashed) */}
          <path
            d={idealPath}
            fill="none"
            stroke="#64748b"
            strokeWidth="2"
            strokeDasharray="5 5"
          />

          {/* Layer 1: Actual Burn Line (Solid Cyan) */}
          <path
            d={actualPath}
            fill="none"
            stroke="#38bdf8"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Data Points on Actual Burn Line */}
          {data.map((d, i) => {
            const x = getX(i);
            const y = getY(d.actualRemaining);
            const isHovered = hoveredIndex === i;
            const isSpike = scopeSpikes[i];

            return (
              <g key={`node-${i}`} className="cursor-pointer">
                {/* Scope Addition Alert Marker */}
                {isSpike && (
                  <g transform={`translate(${x}, ${y - 18})`}>
                    <circle r="7" fill="#ef4444" opacity="0.9" />
                    <text
                      y="3.5"
                      textAnchor="middle"
                      fill="#ffffff"
                      fontSize="9"
                      fontWeight="bold"
                    >
                      !
                    </text>
                  </g>
                )}

                {/* Outer halo on hover */}
                {isHovered && (
                  <circle
                    cx={x}
                    cy={y}
                    r="8"
                    fill="#38bdf8"
                    opacity="0.3"
                  />
                )}

                {/* Point Node */}
                <circle
                  cx={x}
                  cy={y}
                  r={isHovered ? '5' : '3.5'}
                  fill={isSpike ? '#ef4444' : '#0284c7'}
                  stroke="#38bdf8"
                  strokeWidth="2"
                />

                {/* Invisible hover trigger zone */}
                <rect
                  x={x - 20}
                  y={padding.top}
                  width="40"
                  height={plotHeight}
                  fill="transparent"
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              </g>
            );
          })}
        </svg>

        {/* Floating Tooltip */}
        {activePoint && hoveredIndex !== null && (
          <div
            className="absolute top-4 pointer-events-none bg-slate-900 border border-slate-700/80 rounded-lg p-3 shadow-xl text-xs z-20 backdrop-blur"
            style={{
              left: `${Math.min(
                Math.max(10, (getX(hoveredIndex) / svgWidth) * 100),
                75
              )}%`,
            }}
          >
            <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1 mb-1.5 flex items-center justify-between gap-3">
              <span>{activePoint.date}</span>
              {scopeSpikes[hoveredIndex] && (
                <span className="text-[10px] text-amber-400 flex items-center gap-1 font-mono">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  Scope Spike
                </span>
              )}
            </div>

            <div className="space-y-1 text-slate-300">
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Remaining:</span>
                <span className="font-bold text-cyan-400 font-mono">
                  {activePoint.actualRemaining} pts
                </span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-slate-400">Ideal Burn:</span>
                <span className="font-medium text-slate-400 font-mono">
                  {activePoint.idealRemaining} pts
                </span>
              </div>
              {(activePoint.dailyVelocity || 0) > 0 && (
                <div className="flex justify-between gap-4">
                  <span className="text-slate-400">Daily Velocity:</span>
                  <span className="font-bold text-emerald-400 font-mono">
                    +{activePoint.dailyVelocity} pts
                  </span>
                </div>
              )}

              {/* Contributor attribution */}
              {activePoint.contributorBreakdown &&
                Object.keys(activePoint.contributorBreakdown).length > 0 && (
                  <div className="mt-2 pt-1 border-t border-slate-800 text-[11px]">
                    <span className="text-slate-400 block mb-1">Contributors:</span>
                    {Object.entries(activePoint.contributorBreakdown).map(
                      ([user, pts], idx) => (
                        <div key={user} className="flex justify-between text-slate-300">
                          <span
                            className="truncate max-w-[120px]"
                            style={{
                              color:
                                CONTRIBUTOR_COLORS[idx % CONTRIBUTOR_COLORS.length],
                            }}
                          >
                            {user}:
                          </span>
                          <span className="font-mono font-medium">+{pts} pts</span>
                        </div>
                      )
                    )}
                  </div>
                )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
