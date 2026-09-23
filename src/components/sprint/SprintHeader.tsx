'use client';

import React, { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Clock, Layers, Network } from 'lucide-react';
import { WorkItem, SprintDefinition, StatusDefinition } from '@/types/tracker';
import { SprintProgressBar } from '@/components/sprint/SprintProgressBar';
import {
  calculateSprintLeafPoints,
  calculateSprintMacroPoints,
  getSprintStatusBadge,
  formatSprintDateRange,
  getCompletedStatusSet,
  isItemCompleted,
} from '@/lib/sprint-utils';

export interface SprintHeaderProps {
  sprintName: string;
  items: WorkItem[];
  pointMode?: 'macro' | 'granular';
  sprintDef?: SprintDefinition;
  statuses?: StatusDefinition[];
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isAllSelected?: boolean;
  isSomeSelected?: boolean;
  onToggleSelectAll?: () => void;
  isReadOnly?: boolean;
  className?: string;
  onProgressPopoverOpenChange?: (open: boolean) => void;
}

const DEFAULT_STATUSES: StatusDefinition[] = [
  { id: 'todo', label: 'To Do', color: '#94a3b8', order: 1 },
  { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
  { id: 'in_review', label: 'In Review', color: '#fbbf24', order: 3 },
  { id: 'done', label: 'Done', color: '#34d399', order: 4 },
];

/**
 * Sprint swimlane header component displaying sprint metadata, progress bar,
 * and point capacity calculated according to active pointMode (FEAT-TRK-LEAF-NODE-SUM-CALC).
 */
export const SprintHeader: React.FC<SprintHeaderProps> = ({
  sprintName,
  items,
  pointMode = 'granular',
  sprintDef,
  statuses,
  isCollapsed = false,
  onToggleCollapse,
  isAllSelected = false,
  isSomeSelected = false,
  onToggleSelectAll,
  isReadOnly = false,
  className = '',
  onProgressPopoverOpenChange,
}) => {
  const [isProgressPopoverOpen, setIsProgressPopoverOpen] = useState(false);

  const handleProgressOpenChange = (open: boolean) => {
    setIsProgressPopoverOpen(open);
    onProgressPopoverOpenChange?.(open);
  };

  const leafPoints = calculateSprintLeafPoints(items);
  const macroPoints = calculateSprintMacroPoints(items);

  // Dynamic status schema resolution
  const effectiveStatuses = useMemo(() => {
    const list = statuses && statuses.length > 0 ? [...statuses] : [...DEFAULT_STATUSES];
    const knownIds = new Set(list.map((s) => s.id.toLowerCase()));
    for (const it of items) {
      const st = (it.status || '').toLowerCase().trim();
      if (st && !knownIds.has(st)) {
        list.push({
          id: st,
          label: st.charAt(0).toUpperCase() + st.slice(1).replace(/_/g, ' '),
          color: '#64748b',
          order: list.length + 1,
        });
        knownIds.add(st);
      }
    }
    return list;
  }, [statuses, items]);

  const totalItemsCount = items.length;

  // Segment breakdown per status
  const statusBreakdown = useMemo(() => {
    if (totalItemsCount === 0) return [];
    return effectiveStatuses
      .map((st) => {
        const count = items.filter(
          (it) => (it.status || '').toLowerCase().trim() === st.id.toLowerCase()
        ).length;
        const pct = totalItemsCount > 0 ? Math.round((count / totalItemsCount) * 100) : 0;
        return {
          id: st.id,
          label: st.label,
          color: st.color,
          count,
          pct,
        };
      })
      .filter((seg) => seg.count > 0);
  }, [effectiveStatuses, items, totalItemsCount]);

  const completionSet = useMemo(
    () => getCompletedStatusSet(effectiveStatuses),
    [effectiveStatuses]
  );

  const completedItems = items.filter((it) => isItemCompleted(it.status, completionSet));

  const isCompletedSprint = sprintDef?.status === 'completed';
  const progressPct =
    items.length > 0
      ? Math.round((completedItems.length / items.length) * 100)
      : isCompletedSprint
      ? 100
      : 0;

  const badge = getSprintStatusBadge(sprintDef?.status);

  // Derive points display string
  const displayPoints = pointMode === 'macro' ? macroPoints : leafPoints;
  const pointsLabel =
    pointMode === 'macro'
      ? `${displayPoints} pts roadmap capacity`
      : `${displayPoints} pts true burn`;

  return (
    <div
      data-testid={`sprint-header-${sprintName}`}
      className={`px-4 py-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-slate-950/40 rounded-t-xl select-none relative has-[[data-testid=sprint-progress-breakdown]]:!z-30 ${
        isProgressPopoverOpen ? '!z-30' : 'z-10'
      } ${className}`}
    >
      <div className="flex items-center space-x-3 min-w-0">
        {onToggleCollapse && (
          <button
            type="button"
            onClick={onToggleCollapse}
            className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer shrink-0"
            data-testid={`collapse-toggle-${sprintName}`}
            aria-label={isCollapsed ? `Expand ${sprintName}` : `Collapse ${sprintName}`}
          >
            {isCollapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        )}

        {/* Bulk select checkbox */}
        {!isReadOnly && onToggleSelectAll && (
          <input
            type="checkbox"
            checked={isAllSelected}
            ref={(el) => {
              if (el) el.indeterminate = isSomeSelected;
            }}
            onChange={onToggleSelectAll}
            className="rounded border-slate-700 bg-slate-900 text-emerald-500 focus:ring-emerald-500/20 w-3.5 h-3.5 cursor-pointer shrink-0"
            title={isAllSelected ? 'Deselect all in sprint' : 'Select all in sprint'}
            data-testid={`select-all-${sprintName}`}
          />
        )}

        <h4 className="font-semibold text-sm text-slate-200 tracking-wide truncate max-w-xs sm:max-w-md">
          {sprintName}
        </h4>

        {/* Status Badge */}
        <span
          className={`text-[10px] px-2 py-0.5 rounded-full font-medium border capitalize ${badge.bg} ${badge.text} ${badge.border} shrink-0`}
        >
          {badge.label}
        </span>

        {/* Date Range Badge */}
        {sprintDef && (sprintDef.start_date || sprintDef.end_date) && (
          <span className="text-xs text-slate-400 flex items-center space-x-1 font-mono shrink-0 hidden sm:inline-flex">
            <Clock className="w-3 h-3 text-slate-500" />
            <span>{formatSprintDateRange(sprintDef.start_date, sprintDef.end_date)}</span>
          </span>
        )}

        {/* Item count & points badge */}
        <span
          data-testid="header-metrics"
          className="text-xs px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300 font-mono font-medium shrink-0 flex items-center space-x-1"
        >
          <span>
            {items.length} {items.length === 1 ? 'item' : 'items'}
          </span>
          {displayPoints > 0 && (
            <span
              data-testid="sprint-header-points"
              title={pointsLabel}
              className={`flex items-center space-x-1 ${
                pointMode === 'macro' ? 'text-slate-300' : 'text-emerald-300'
              }`}
            >
              <span>·</span>
              <span>{pointsLabel}</span>
            </span>
          )}
        </span>
      </div>

      <div className="flex items-center shrink-0">
        {/* Multi-Status Stacked Progress Bar & Hover/Tap Breakdown (FEAT-TRK-PROGRESS-BAR-STATUS-COLORS) */}
        <SprintProgressBar
          progressPct={progressPct}
          segments={statusBreakdown}
          isCompletedSprint={isCompletedSprint}
          goal={sprintDef?.goal || undefined}
          onOpenChange={handleProgressOpenChange}
          completedStatusIds={completionSet}
        />
      </div>
    </div>
  );
};

