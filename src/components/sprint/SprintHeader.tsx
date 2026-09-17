'use client';

import React from 'react';
import { ChevronDown, ChevronRight, Clock, Layers, Network } from 'lucide-react';
import { WorkItem, SprintDefinition } from '@/types/tracker';
import {
  calculateSprintLeafPoints,
  calculateSprintMacroPoints,
  getSprintStatusBadge,
  formatSprintDateRange,
} from '@/lib/sprint-utils';

export interface SprintHeaderProps {
  sprintName: string;
  items: WorkItem[];
  pointMode?: 'macro' | 'granular';
  sprintDef?: SprintDefinition;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  isAllSelected?: boolean;
  isSomeSelected?: boolean;
  onToggleSelectAll?: () => void;
  isReadOnly?: boolean;
  className?: string;
}

const COMPLETED_STATUSES = new Set(['done', 'closed', 'complete', 'completed']);

/**
 * Sprint swimlane header component displaying sprint metadata, progress bar,
 * and point capacity calculated according to active pointMode (FEAT-TRK-LEAF-NODE-SUM-CALC).
 */
export const SprintHeader: React.FC<SprintHeaderProps> = ({
  sprintName,
  items,
  pointMode = 'granular',
  sprintDef,
  isCollapsed = false,
  onToggleCollapse,
  isAllSelected = false,
  isSomeSelected = false,
  onToggleSelectAll,
  isReadOnly = false,
  className = '',
}) => {
  const leafPoints = calculateSprintLeafPoints(items);
  const macroPoints = calculateSprintMacroPoints(items);

  const completedItems = items.filter((it) => {
    const st = (it.status || '').toLowerCase().trim();
    return COMPLETED_STATUSES.has(st);
  });

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
      className={`px-4 py-3 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 shrink-0 bg-slate-950/40 rounded-t-xl select-none ${className}`}
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

      <div className="flex items-center space-x-4 shrink-0">
        {sprintDef?.goal && (
          <span
            className="text-xs text-slate-400 italic max-w-xs truncate hidden md:inline-block"
            title={sprintDef.goal}
            data-testid="header-goal"
          >
            Goal: {sprintDef.goal}
          </span>
        )}

        <div className="flex items-center space-x-2 min-w-[140px]">
          <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-500 transition-all rounded-full"
              style={{ width: `${progressPct}%` }}
            />
          </div>
          <span className="text-xs font-mono text-slate-400 w-9 text-right" data-testid="header-progress">
            {progressPct}%
          </span>
        </div>
      </div>
    </div>
  );
};

