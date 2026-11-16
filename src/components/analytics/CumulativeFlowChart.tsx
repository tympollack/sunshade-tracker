'use client';

import React, { useState } from 'react';
import { AreaChart, HelpCircle, ChevronLeft, ChevronRight, RotateCcw, X, ArrowUpRight } from 'lucide-react';
import { CfdDataPoint } from '@/lib/analytics/flow-diagnostics';
import { useChartDateZoom, type ChunkWindowPreset } from '@/hooks/useChartDateZoom';

export type CfdTimeWindow = '14D' | '30D' | 'Sprint to Date' | 'Full Sprint';
export type CfdScopeMode = 'all' | 'wip_only';

export interface CumulativeFlowChartProps {
  data: CfdDataPoint[];
  isLoading?: boolean;
  isValidating?: boolean;
  error?: string | null;
  initialTimeWindow?: CfdTimeWindow;
  initialHideUnstarted?: boolean;
  dateFormat?: 'MMM DD' | 'MM/DD';
  sprintStartDate?: string | null;
  sprintEndDate?: string | null;
  today?: string;
  onApplyWindowToPage?: (startDate: string, endDate: string) => void;
}

/**
 * Slices a date-indexed telemetry series according to the selected range preset:
 * - 'Sprint to Date': clamps the series at min(sprintEndDate, todayISO) so unelapsed future dates do not compress active curves.
 * - 'Full Sprint': preserves the full sprint timeline up to sprintEndDate (including remaining runway).
 * - '14D' / '30D': takes the most recent 14 or 30 elapsed days up to the horizon ceiling.
 */
export function clampSeriesToHorizon<T extends { date: string }>(
  data: T[],
  timeWindow: CfdTimeWindow,
  options?: {
    sprintEndDate?: string | null;
    today?: string;
  }
): T[] {
  if (!data || data.length === 0) return [];
  const todayISO = (options?.today || new Date().toISOString()).split('T')[0];
  const sprintEndISO = options?.sprintEndDate ? options.sprintEndDate.split('T')[0] : null;
  const horizonEndISO = sprintEndISO && sprintEndISO < todayISO ? sprintEndISO : todayISO;

  if (timeWindow === 'Full Sprint') {
    if (sprintEndISO) {
      const withinSprint = data.filter((d) => !d.date || d.date <= sprintEndISO);
      return withinSprint.length > 0 ? withinSprint : data;
    }
    return data;
  }

  const clampedToDate = data.filter((d) => !d.date || d.date <= horizonEndISO);
  const effectiveSeries = clampedToDate.length > 0 ? clampedToDate : data;

  if (timeWindow === '14D' || timeWindow === '30D') {
    const windowDays = timeWindow === '14D' ? 14 : 30;
    const lastDateStr = effectiveSeries[effectiveSeries.length - 1]?.date;
    if (lastDateStr && /^\d{4}-\d{2}-\d{2}/.test(lastDateStr)) {
      const lastMs = new Date(`${lastDateStr.slice(0, 10)}T00:00:00.000Z`).getTime();
      if (!isNaN(lastMs)) {
        const cutoffISO = new Date(lastMs - (windowDays - 1) * 86400000)
          .toISOString()
          .slice(0, 10);
        const byCalendarWindow = effectiveSeries.filter(
          (d) => !d.date || d.date.slice(0, 10) >= cutoffISO
        );
        if (byCalendarWindow.length > 0) {
          return byCalendarWindow.slice(-windowDays);
        }
      }
    }
    return effectiveSeries.slice(-windowDays);
  }
  return effectiveSeries;
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

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function formatCfdDate(dateStr: string, format: 'MMM DD' | 'MM/DD' = 'MMM DD'): string {
  if (!dateStr) return '';
  if (dateStr.includes('-')) {
    const parts = dateStr.split('-');
    if (parts.length >= 3) {
      const m = parseInt(parts[1], 10);
      const d = parts[2];
      if (format === 'MM/DD') {
        return `${parts[1]}/${d}`;
      }
      const month = m >= 1 && m <= 12 ? MONTH_NAMES[m - 1] : parts[1];
      return `${month} ${d}`;
    }
    if (parts.length === 2) {
      const m = parseInt(parts[0], 10);
      const d = parts[1];
      if (format === 'MM/DD') {
        return `${parts[0]}/${d}`;
      }
      const month = m >= 1 && m <= 12 ? MONTH_NAMES[m - 1] : parts[0];
      return `${month} ${d}`;
    }
  }
  return dateStr;
}

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

    if ((distance < minSpacingThreshold && indices.length > 1) || indices.length >= maxTicks) {
      indices[indices.length - 1] = lastIdx;
    } else {
      indices.push(lastIdx);
    }
  }

  return indices;
}

const LOCAL_STORAGE_HIDE_UNSTARTED_KEY = 'trk_cfd_hide_unstarted';

export function CumulativeFlowChart({
  data,
  isLoading = false,
  isValidating = false,
  error = null,
  initialTimeWindow = 'Sprint to Date',
  initialHideUnstarted = false,
  dateFormat = 'MMM DD',
  sprintStartDate = null,
  sprintEndDate = null,
  today,
  onApplyWindowToPage,
}: CumulativeFlowChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [timeWindow, setTimeWindow] = useState<CfdTimeWindow>(initialTimeWindow);
  const [hiddenLayers, setHiddenLayers] = useState<Set<string>>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem(LOCAL_STORAGE_HIDE_UNSTARTED_KEY);
        if (saved !== null) {
          return saved === 'true' ? new Set(['not_started']) : new Set();
        }
      } catch {
        // Ignore
      }
    }
    return initialHideUnstarted ? new Set(['not_started']) : new Set();
  });

  const isHideUnstarted = hiddenLayers.has('not_started');

  const toggleScopeMode = (mode: CfdScopeMode) => {
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (mode === 'wip_only') {
        next.add('not_started');
        try {
          localStorage.setItem(LOCAL_STORAGE_HIDE_UNSTARTED_KEY, 'true');
        } catch {}
      } else {
        next.delete('not_started');
        try {
          localStorage.setItem(LOCAL_STORAGE_HIDE_UNSTARTED_KEY, 'false');
        } catch {}
      }
      return next;
    });
  };

  const toggleLayer = (layerKey: string) => {
    setHiddenLayers((prev) => {
      const next = new Set(prev);
      if (next.has(layerKey)) {
        next.delete(layerKey);
        if (layerKey === 'not_started') {
          try {
            localStorage.setItem(LOCAL_STORAGE_HIDE_UNSTARTED_KEY, 'false');
          } catch {}
        }
      } else {
        next.add(layerKey);
        if (layerKey === 'not_started') {
          try {
            localStorage.setItem(LOCAL_STORAGE_HIDE_UNSTARTED_KEY, 'true');
          } catch {}
        }
      }
      return next;
    });
  };

  // Slices the telemetry series based on selected quick-filter preset:
  // - 'Sprint to Date' (default): clamps at min(sprint.end_date, today) so future unelapsed dates do not compress active curves.
  // - '14D' and '30D': filter down to the most recent 14 or 30 elapsed days.
  // - 'Full Sprint': preserves the entire timeline series up to sprint.end_date.
  const presetData = React.useMemo(() => {
    return clampSeriesToHorizon(data, timeWindow, { sprintEndDate, today });
  }, [data, timeWindow, sprintEndDate, today]);

  const zoom = useChartDateZoom({
    data: presetData,
    sprintStartDate,
    sprintEndDate,
    today,
  });

  const displayData = zoom.visibleData;

  // Calculate brush overlay bounds when dragging (placed before early returns to preserve React hook order)
  const brushIndices = React.useMemo(() => {
    if (!zoom.isDragging || !zoom.refAreaLeft || !zoom.refAreaRight) return null;
    const leftIdx = displayData.findIndex((d) => d.date === zoom.refAreaLeft);
    const rightIdx = displayData.findIndex((d) => d.date === zoom.refAreaRight);
    if (leftIdx === -1 || rightIdx === -1) return null;
    return {
      startIdx: Math.min(leftIdx, rightIdx),
      endIdx: Math.max(leftIdx, rightIdx),
    };
  }, [zoom.isDragging, zoom.refAreaLeft, zoom.refAreaRight, displayData]);

  const pinnedDataIndex = React.useMemo(() => {
    if (!zoom.pinnedPoint) return -1;
    const byDate = displayData.findIndex((d) => d.date === zoom.pinnedPoint!.date);
    if (byDate !== -1) return byDate;
    return zoom.pinnedPoint.index < displayData.length ? zoom.pinnedPoint.index : -1;
  }, [zoom.pinnedPoint, displayData]);

  // Show skeleton on initial load, or when validating without pre-existing data
  const hasData = Boolean(displayData && displayData.length > 0);
  if ((isLoading && !hasData) || (isValidating && !hasData)) {
    return (
      <div
        data-testid="cfd-loading-skeleton"
        className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 h-[420px] flex flex-col animate-pulse"
      >
        <div className="h-5 bg-slate-800 rounded w-64 mb-4" />
        <div className="flex-1 bg-slate-800/40 rounded-lg" />
      </div>
    );
  }

  // Show error state if telemetry fetch failed and no cached data exists
  if (error && (!displayData || displayData.length === 0)) {
    return (
      <div
        data-testid="cfd-error-state"
        className="bg-slate-900/80 border border-red-900/40 rounded-xl p-6 h-[420px] flex flex-col items-center justify-center text-center"
      >
        <AreaChart className="w-10 h-10 text-rose-500/70 mb-3" />
        <h3 className="text-sm font-semibold text-rose-200">Unable to Load Flow Telemetry</h3>
        <p className="text-xs text-rose-400/80 mt-1 max-w-sm">
          {error}
        </p>
      </div>
    );
  }

  if (!displayData || displayData.length === 0) {
    return (
      <div
        data-testid="cfd-empty-state"
        className="bg-slate-900/80 border border-slate-800 rounded-xl p-6 h-[420px] flex flex-col items-center justify-center text-center"
      >
        <AreaChart className="w-10 h-10 text-slate-600 mb-3" />
        <h3 className="text-sm font-semibold text-slate-300">No Flow Telemetry Available</h3>
        <p className="text-xs text-slate-500 mt-1 max-w-sm">
          Cumulative flow statistics build continuously as tasks transition across Kanban statuses.
        </p>
      </div>
    );
  }

  // Filter active layers based on hiddenLayers toggle state
  const activeLayers = STATUS_LAYERS.filter((layer) => !hiddenLayers.has(layer.key));

  // Dimensions & Coordinate Scaling
  const svgWidth = 800;
  const svgHeight = 360;
  const padding = { top: 35, right: 30, bottom: 65, left: 55 };
  const plotWidth = svgWidth - padding.left - padding.right;
  const plotHeight = svgHeight - padding.top - padding.bottom;
  const tickIndicesSet = new Set(getAdaptiveTickIndices(displayData.length));

  // Calculate totals and maximum ceiling based strictly on active visible layers
  const totals = displayData.map((d) =>
    activeLayers.reduce((sum, layer) => sum + (d[layer.key] || 0), 0)
  );
  const maxTotal = Math.max(10, ...totals);
  const yCeiling = Math.ceil((maxTotal + 5) / 5) * 5;

  const getX = (index: number) => {
    if (displayData.length <= 1) return padding.left + plotWidth / 2;
    return padding.left + (index / (displayData.length - 1)) * plotWidth;
  };

  const getY = (val: number) => {
    return padding.top + (1 - val / yCeiling) * plotHeight;
  };

  // Build stacked areas for active layers
  const layerPaths = activeLayers.map((layer, layerIdx) => {
    const topPoints: string[] = [];
    const bottomPoints: string[] = [];

    displayData.forEach((d, i) => {
      let cumulativeBottom = 0;
      for (let prevIdx = 0; prevIdx < layerIdx; prevIdx++) {
        cumulativeBottom += d[activeLayers[prevIdx].key];
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

  const activePoint = hoveredIndex !== null && hoveredIndex < displayData.length ? displayData[hoveredIndex] : null;

  return (
    <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 flex flex-col justify-between h-[420px] shadow-sm relative">
      {/* Header and Controls */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-2">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <AreaChart className="w-4 h-4 text-emerald-400 shrink-0" />
            <span className="truncate">Cumulative Flow Diagram (CFD)</span>
            {error && hasData && (
              <span
                data-testid="cfd-refresh-error-pill"
                className="text-[10px] font-normal px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-400 border border-rose-500/30 shrink-0"
                title={error}
              >
                Sync Failed: {error}
              </span>
            )}
          </h2>
          <p className="text-xs text-slate-400 mt-0.5">
            WIP inventory, bottleneck discovery, and delivery flow progression
          </p>
        </div>

        {/* Right Controls: Zoom Nav, Scope Toggle, Range Filter & Pinned Legend */}
        <div className="flex flex-wrap items-center gap-3 ml-auto">
          {/* Active Zoom Stepper & Promotion Controls */}
          {zoom.isZoomed && zoom.zoomedRange && (
            <div
              className="flex items-center gap-1.5 bg-sky-950/50 border border-sky-700/60 px-2 py-0.5 rounded-lg text-xs"
              data-testid="cfd-zoom-controls"
            >
              <button
                type="button"
                onClick={zoom.stepPrev}
                disabled={!zoom.canStepPrev}
                className="px-1.5 py-0.5 rounded text-sky-300 hover:bg-sky-900/60 disabled:opacity-40 disabled:cursor-not-allowed font-mono flex items-center gap-0.5"
                data-testid="cfd-zoom-prev"
                title="Previous window"
              >
                <ChevronLeft className="w-3 h-3" />
                <span>Prev</span>
              </button>
              <span
                className="font-mono text-sky-200 font-semibold px-1 whitespace-nowrap"
                data-testid="cfd-zoom-range-label"
              >
                {formatCfdDate(zoom.zoomedRange.startDate, dateFormat)} –{' '}
                {formatCfdDate(zoom.zoomedRange.endDate, dateFormat)}
              </span>
              <button
                type="button"
                onClick={zoom.stepNext}
                disabled={!zoom.canStepNext}
                className="px-1.5 py-0.5 rounded text-sky-300 hover:bg-sky-900/60 disabled:opacity-40 disabled:cursor-not-allowed font-mono flex items-center gap-0.5"
                data-testid="cfd-zoom-next"
                title="Next window"
              >
                <span>Next</span>
                <ChevronRight className="w-3 h-3" />
              </button>
              <button
                type="button"
                onClick={() => {
                  zoom.resetZoom();
                  setHoveredIndex(null);
                }}
                className="ml-1 px-1.5 py-0.5 rounded bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium flex items-center gap-1"
                data-testid="cfd-zoom-reset"
                title="Reset Zoom (Esc)"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset Zoom</span>
              </button>
              <button
                type="button"
                onClick={() =>
                  onApplyWindowToPage?.(
                    zoom.zoomedRange!.startDate,
                    zoom.zoomedRange!.endDate
                  )
                }
                className="ml-0.5 px-2 py-0.5 rounded bg-cyan-600/20 hover:bg-cyan-600/30 text-cyan-300 border border-cyan-500/40 font-medium flex items-center gap-1 whitespace-nowrap"
                data-testid="cfd-apply-window-to-page"
                title="Promote zoomed window to page-wide date filters"
              >
                <span>Apply Window to Page</span>
                <ArrowUpRight className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Segmented Scope Toggle: All Scope vs WIP & Delivery Only */}
          <div
            className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60"
            role="group"
            aria-label="CFD scope toggle"
          >
            <button
              type="button"
              onClick={() => toggleScopeMode('all')}
              className={`px-2 py-0.5 text-xs font-medium rounded-md transition-colors ${
                !isHideUnstarted
                  ? 'bg-slate-700 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              data-testid="cfd-scope-all"
            >
              All Scope
            </button>
            <button
              type="button"
              onClick={() => toggleScopeMode('wip_only')}
              className={`px-2 py-0.5 text-xs font-medium rounded-md transition-colors ${
                isHideUnstarted
                  ? 'bg-cyan-700/80 text-white shadow-sm font-semibold'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
              }`}
              data-testid="cfd-scope-wip-only"
            >
              WIP & Delivery Only
            </button>
          </div>

          {/* Quick-Select Range Filter */}
          <div
            className="flex items-center bg-slate-800/80 p-0.5 rounded-lg border border-slate-700/60"
            role="group"
            aria-label="CFD time window filter"
          >
            {(['14D', '30D', 'Sprint to Date', 'Full Sprint'] as const).map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  setTimeWindow(preset);
                  zoom.resetZoom();
                  setHoveredIndex(null);
                  if (preset === 'Full Sprint' && sprintStartDate && sprintEndDate) {
                    const spStart = sprintStartDate.slice(0, 10);
                    const spEnd = sprintEndDate.slice(0, 10);
                    const firstDate = data[0]?.date?.slice(0, 10);
                    const lastDate = data[data.length - 1]?.date?.slice(0, 10);
                    if ((firstDate && firstDate > spStart) || (lastDate && lastDate < spEnd)) {
                      onApplyWindowToPage?.(spStart, spEnd);
                    }
                  }
                }}
                className={`px-2 py-0.5 text-xs font-mono font-medium rounded-md transition-colors ${
                  timeWindow === preset && !zoom.isZoomed
                    ? 'bg-slate-700 text-white shadow-sm font-semibold'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800'
                }`}
                data-testid={`cfd-window-${preset.toLowerCase().replace(/\s+/g, '-')}`}
              >
                {preset}
              </button>
            ))}
          </div>

          {/* Legend: Clickable toggles pinned to top right */}
          <div className="flex flex-wrap items-center justify-end gap-2.5 text-xs text-slate-300">
            {[...STATUS_LAYERS].reverse().map((layer) => {
              const isHidden = hiddenLayers.has(layer.key);
              return (
                <button
                  key={layer.key}
                  type="button"
                  onClick={() => toggleLayer(layer.key)}
                  className={`flex items-center gap-1.5 whitespace-nowrap cursor-pointer transition-all ${
                    isHidden
                      ? 'opacity-40 line-through text-slate-500 hover:opacity-60'
                      : 'hover:text-white'
                  }`}
                  data-testid={`cfd-legend-${layer.key}`}
                  title={`Click to ${isHidden ? 'show' : 'hide'} ${layer.label}`}
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-sm shrink-0 transition-opacity ${
                      isHidden ? 'opacity-40' : ''
                    }`}
                    style={{ backgroundColor: layer.color }}
                  />
                  <span>{layer.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* SVG Canvas */}
      <div className="relative flex-1 w-full overflow-hidden">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          className="w-full h-full select-none"
          preserveAspectRatio="xMidYMid meet"
          onMouseUp={() => zoom.onMouseUp()}
          onMouseLeave={() => {
            setHoveredIndex(null);
            if (zoom.isDragging) zoom.onMouseUp();
          }}
          onDoubleClick={() => {
            if (zoom.isZoomed) {
              zoom.resetZoom();
              setHoveredIndex(null);
            }
          }}
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
          {displayData.map((d, i) => {
            if (!tickIndicesSet.has(i)) return null;
            const x = getX(i);
            const y = svgHeight - padding.bottom + 14;
            const dateLabel = formatCfdDate(d.date, dateFormat);
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

          {/* Brush Selection ReferenceArea while dragging */}
          {brushIndices && (
            <g
              className="recharts-layer recharts-reference-area"
              data-testid="cfd-brush-reference-area"
            >
              <rect
                data-testid="cfd-brush-selection"
                className="recharts-reference-area-rect"
                x={getX(brushIndices.startIdx)}
                y={padding.top}
                width={Math.max(4, getX(brushIndices.endIdx) - getX(brushIndices.startIdx))}
                height={plotHeight}
                fill="#38bdf8"
                fillOpacity={0.14}
                stroke="#38bdf8"
                strokeOpacity={0.3}
              />
            </g>
          )}

          {/* Hover Column Triggers & Cursor Line */}
          {displayData.map((d, i) => {
            const x = getX(i);
            const isHovered = hoveredIndex === i;
            const isPinned = pinnedDataIndex === i;

            return (
              <g key={`col-${i}`}>
                {(isHovered || isPinned) && (
                  <line
                    x1={x}
                    y1={padding.top}
                    x2={x}
                    y2={padding.top + plotHeight}
                    stroke={isPinned ? '#38bdf8' : '#f8fafc'}
                    strokeWidth="1.5"
                    strokeDasharray="4 4"
                    opacity="0.8"
                  />
                )}
                {/* Transparent hover & brush trigger column */}
                <rect
                  x={x - 20}
                  y={padding.top}
                  width="40"
                  height={plotHeight}
                  fill="transparent"
                  className="cursor-crosshair"
                  data-testid={`cfd-hover-column-${i}`}
                  onMouseEnter={() => {
                    setHoveredIndex(i);
                    zoom.onMouseMove(d.date);
                  }}
                  onMouseMove={() => zoom.onMouseMove(d.date)}
                  onMouseLeave={() => setHoveredIndex(null)}
                  onMouseDown={() => zoom.onMouseDown(d.date)}
                  onMouseUp={() => zoom.onMouseUp()}
                  onClick={() => zoom.onPointClick(d.date, i)}
                />
              </g>
            );
          })}
        </svg>

        {/* Click-to-Pin Chunk Drill-Down Popover (1W / 2W / 4W) */}
        {zoom.pinnedPoint && (
          <div
            data-testid="cfd-chunk-popover"
            className="absolute top-3 z-30 bg-slate-900/95 border border-sky-700/70 rounded-lg px-3 py-2 shadow-2xl text-xs backdrop-blur-md flex items-center gap-2"
            style={{
              left: `${Math.min(
                Math.max(8, ((pinnedDataIndex >= 0 ? getX(pinnedDataIndex) : svgWidth / 2) / svgWidth) * 100),
                62
              )}%`,
            }}
          >
            <span className="text-slate-300 font-medium whitespace-nowrap">
              Zoom around{' '}
              <span className="font-mono text-sky-300 font-semibold">
                {formatCfdDate(zoom.pinnedPoint.date, dateFormat)}
              </span>
              :
            </span>
            <div className="flex items-center gap-1">
              {(['1W', '2W', '4W'] as ChunkWindowPreset[]).map((chunk) => (
                <button
                  key={chunk}
                  type="button"
                  onClick={() => {
                    zoom.zoomAroundDate(zoom.pinnedPoint!.date, chunk);
                    setHoveredIndex(null);
                  }}
                  className="px-2 py-0.5 rounded bg-sky-500/15 hover:bg-sky-500/30 text-sky-300 border border-sky-500/30 font-mono font-semibold transition-colors cursor-pointer"
                  data-testid={`cfd-chunk-${chunk.toLowerCase()}`}
                >
                  {chunk}
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={zoom.dismissPinnedPoint}
              className="p-0.5 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800"
              data-testid="cfd-chunk-close"
              aria-label="Close zoom options"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

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
              <span className="text-slate-400 font-mono text-[11px]" data-testid="cfd-tooltip-total">
                {hiddenLayers.size > 0 ? 'Visible Total:' : 'Total:'} {totals[hoveredIndex]} items
              </span>
            </div>

            <div className="space-y-1">
              {activeLayers.map((layer) => {
                const count = activePoint[layer.key] || 0;
                let textColor = 'text-slate-300';
                if (layer.key === 'complete') textColor = 'text-emerald-400 font-medium';
                else if (layer.key === 'in_review') textColor = 'text-purple-400';
                else if (layer.key === 'in_progress') textColor = 'text-cyan-400';
                else if (layer.key === 'not_started') textColor = 'text-slate-400';
                else if (layer.key === 'unplanned') textColor = 'text-amber-400';

                return (
                  <div key={layer.key} className={`flex justify-between gap-4 ${textColor}`}>
                    <span>{layer.label}:</span>
                    <span className="font-mono">{layer.key === 'unplanned' && count > 0 ? `+${count}` : count}</span>
                  </div>
                );
              })}

              {hiddenLayers.size > 0 && (
                <div className="pt-1 mt-1 border-t border-slate-800/60 space-y-0.5">
                  <div className="text-[10px] uppercase font-semibold text-slate-500">Hidden from Chart</div>
                  {STATUS_LAYERS.filter((l) => hiddenLayers.has(l.key)).map((layer) => {
                    const count = activePoint[layer.key] || 0;
                    return (
                      <div key={layer.key} className="flex justify-between gap-4 text-slate-500 line-through text-[11px]">
                        <span>{layer.label}:</span>
                        <span className="font-mono">{count}</span>
                      </div>
                    );
                  })}
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
