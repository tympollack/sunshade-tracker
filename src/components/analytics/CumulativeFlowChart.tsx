'use client';

import React, { useState } from 'react';
import { AreaChart, HelpCircle } from 'lucide-react';
import { CfdDataPoint } from '@/lib/analytics/flow-diagnostics';

interface CumulativeFlowChartProps {
  data: CfdDataPoint[];
  isLoading?: boolean;
}

interface StatusLayer {
  key: keyof Omit<CfdDataPoint, 'date'>;
  label: string;
  color: string;
  fillOpacity: number;
}

const STATUS_LAYERS: StatusLayer[] = [
  { key: 'complete', label: 'Complete', color: '#22c55e', fillOpacity: 0.75 },
  { key: 'in_review', label: 'In Review', color: '#a855f7', fillOpacity: 0.75 },
  { key: 'in_progress', label: 'In Progress', color: '#38bdf8', fillOpacity: 0.75 },
  { key: 'not_started', label: 'Not Started', color: '#64748b', fillOpacity: 0.55 },
  { key: 'unplanned', label: 'Unplanned Scope', color: '#f59e0b', fillOpacity: 0.8 },
];

/**
 * Dynamically calculates adaptive tick interval for X-axis labels
 * to chunk multi-day and multi-week ranges into clean, readable increments.
 *
 * @param totalPoints Total number of data points along the date axis
 * @param maxTicks Maximum recommended tick labels to display without crowding
 * @returns Step interval (e.g. 1, 2, 3, 5, 7, 14, 21, 30)
 */
export function calculateAdaptiveTickInterval(totalPoints: number, maxTicks: number = 8): number {
  if (totalPoints <= maxTicks) return 1;

  // Natural calendar chunk increments (in days):
  // 1d, 2d, 3d, 5d, 7d (1 week), 14d (2 weeks), 21d (3 weeks), 30d (~1 month)
  const candidateIntervals = [1, 2, 3, 5, 7, 14, 21, 30];

  for (const interval of candidateIntervals) {
    if (Math.ceil(totalPoints / interval) <= maxTicks) {
      return interval;
    }
  }

  return Math.max(1, Math.ceil(totalPoints / maxTicks));
}

/**
 * Calculates the tick indices to display along the X-axis.
 * Always ensures the final data point is labeled; if the final point
 * sits too close to the preceding interval tick, it replaces that tick
 * to avoid crowded, overlapping labels.
 *
 * @param dataLength Total number of data points
 * @param maxTicks Maximum recommended tick labels
 * @returns Array of 0-based data point indices to render as ticks
 */
export function getAdaptiveTickIndices(dataLength: number, maxTicks: number = 8): number[] {
  if (dataLength <= 0) return [];
  if (dataLength === 1) return [0];

  const interval = calculateAdaptiveTickInterval(dataLength, maxTicks);
  const indices: number[] = [];

  for (let i = 0; i < dataLength; i += interval) {
    indices.push(i);
  }

  const lastIdx = dataLength - 1;
  const lastSelected = indices[indices.length - 1];

  if (lastSelected !== lastIdx) {
    const distance = lastIdx - lastSelected;
    const minSpacingThreshold = Math.max(2, Math.ceil(interval / 2));

    if (distance < minSpacingThreshold && indices.length > 1) {
      indices[indices.length - 1] = lastIdx;
    } else {
      indices.push(lastIdx);
    }
  }

  return indices;
}

export function CumulativeFlowChart({ data, isLoading = false }: CumulativeFlowChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  if (isLoading) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 h-[420px] flex flex-col animate-pulse">
        <div className="h-5 bg-slate-800 rounded w-64 mb-4" />
        <div className="flex-1 bg-slate-800/40 rounded-lg" />
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 h-[420px] flex flex-col items-center justify-center text-center">
        <AreaChart className="w-10 h-10 text-slate-600 mb-3" />
        <h3 className="text-sm font-semibold text-slate-300">No Flow Telemetry Available</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Cumulative flow statistics build continuously as tasks transition across Kanban statuses.
        </p>
      </div>
    );
  }

  // Dimensions & Coordinate Scaling
  const svgWidth = 800;
  const svgHeight = 360;
  const padding = { top: 35, right: 30, bottom: 65, left: 55 };
  const plotWidth = svgWidth - padding.left - padding.right;
  const plotHeight = svgHeight - padding.top - padding.bottom;
  const tickIndicesSet = new Set(getAdaptiveTickIndices(data.length));

  // Calculate totals and maximum ceiling
  const totals = data.map(
    (d) => d.complete + d.in_review + d.in_progress + d.not_started + d.unplanned
  );
  const maxTotal = Math.max(10, ...totals);
  const yCeiling = Math.ceil(maxTotal / 5) * 5;

  const getX = (index: number) => {
    if (data.length <= 1) return padding.left + plotWidth / 2;
    return padding.left + (index / (data.length - 1)) * plotWidth;
  };

  const getY = (val: number) => {
    return padding.top + (1 - val / yCeiling) * plotHeight;
  };

  // Build stacked areas
  // For each layer k, we compute top values and bottom values across all dates
  const layerPaths = STATUS_LAYERS.map((layer, layerIdx) => {
    const topPoints: string[] = [];
    const bottomPoints: string[] = [];

    data.forEach((d, i) => {
      let cumulativeBottom = 0;
      for (let prevIdx = 0; prevIdx < layerIdx; prevIdx++) {
        cumulativeBottom += d[STATUS_LAYERS[prevIdx].key];
      }
      const cumulativeTop = cumulativeBottom + d[layer.key];

      const x = getX(i);
      topPoints.push(`${x},${getY(cumulativeTop)}`);
      bottomPoints.push(`${x},${getY(cumulativeBottom)}`);
    });

    const pathD = `M ${topPoints.join(' L ')} L ${bottomPoints.reverse().join(' L ')} Z`;
    return {
      layer,
      pathD,
    };
  });

  const activePoint = hoveredIndex !== null ? data[hoveredIndex] : null;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col justify-between h-[420px] shadow-sm relative">
      {/* Header and Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <AreaChart className="w-4 h-4 text-emerald-400" />
            Cumulative Flow Diagram (CFD)
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            WIP inventory, bottleneck discovery, and delivery flow progression
          </p>
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-300">
          {[...STATUS_LAYERS].reverse().map((layer) => (
            <div key={layer.key} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ backgroundColor: layer.color }}
              />
              <span>{layer.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* SVG Canvas */}
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
            if (!tickIndicesSet.has(i)) return null;
            const x = getX(i);
            const y = svgHeight - padding.bottom + 14;
            const dateLabel = d.date.includes('-')
              ? d.date.split('-').slice(1).join('/')
              : d.date;
            return (
              <g key={`x-tick-${i}`}>
                <line
                  x1={x}
                  y1={svgHeight - padding.bottom}
                  x2={x}
                  y2={svgHeight - padding.bottom + 4}
                  stroke="#475569"
                  strokeWidth="1"
                />
                <text
                  x={x}
                  y={y}
                  transform={`rotate(-45 ${x} ${y})`}
                  textAnchor="end"
                  fill="#94a3b8"
                  fontSize="11"
                  fontFamily="sans-serif"
                >
                  {dateLabel}
                </text>
              </g>
            );
          })}

          {/* Render Stacked Areas */}
          {layerPaths.map(({ layer, pathD }) => (
            <path
              key={layer.key}
              d={pathD}
              fill={layer.color}
              opacity={layer.fillOpacity}
              stroke={layer.color}
              strokeWidth="1"
            />
          ))}

          {/* Hover Column Triggers & Cursor Line */}
          {data.map((d, i) => {
            const x = getX(i);
            const isHovered = hoveredIndex === i;

            return (
              <g key={`col-${i}`}>
                {isHovered && (
                  <line
                    x1={x}
                    y1={padding.top}
                    x2={x}
                    y2={padding.top + plotHeight}
                    stroke="#f8fafc"
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    opacity="0.8"
                  />
                )}
                {/* Transparent hover trigger column */}
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
            <div className="font-semibold text-slate-200 border-b border-slate-800 pb-1 mb-1.5 flex items-center justify-between gap-4">
              <span>{activePoint.date}</span>
              <span className="text-slate-400 font-mono text-[11px]">
                Total: {totals[hoveredIndex]} items
              </span>
            </div>

            <div className="space-y-1">
              <div className="flex justify-between gap-4 text-emerald-400 font-medium">
                <span>Complete:</span>
                <span className="font-mono">{activePoint.complete}</span>
              </div>
              <div className="flex justify-between gap-4 text-purple-400">
                <span>In Review:</span>
                <span className="font-mono">{activePoint.in_review}</span>
              </div>
              <div className="flex justify-between gap-4 text-cyan-400">
                <span>In Progress:</span>
                <span className="font-mono">{activePoint.in_progress}</span>
              </div>
              <div className="flex justify-between gap-4 text-slate-400">
                <span>Not Started:</span>
                <span className="font-mono">{activePoint.not_started}</span>
              </div>
              {activePoint.unplanned > 0 && (
                <div className="flex justify-between gap-4 text-amber-400">
                  <span>Unplanned:</span>
                  <span className="font-mono">+{activePoint.unplanned}</span>
                </div>
              )}
              <div className="mt-1.5 pt-1 border-t border-slate-800 flex justify-between gap-4 text-slate-300 font-semibold">
                <span>Active WIP:</span>
                <span className="font-mono text-cyan-300">
                  {activePoint.in_progress + activePoint.in_review} items
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
