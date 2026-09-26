'use client';

import React, { useState } from 'react';
import {
  Calendar,
  Filter,
  ChevronDown,
  ChevronRight,
  RotateCcw,
} from 'lucide-react';
import { WorkItem, ProjectSettings } from '@/types/tracker';
import { FilterMultiSelect, FilterOption } from '@/components/FilterMultiSelect';
import { PointModeSwitcher } from '@/components/PointModeSwitcher';

export interface ProjectToolbarProps {
  statusFilterOptions: FilterOption[];
  effectiveSelectedStatuses: string[];
  setSelectedStatuses: (val: string[] | null) => void;
  levelFilterOptions: FilterOption[];
  effectiveSelectedLevels: string[];
  setSelectedLevels: (val: string[] | null) => void;
  selectedSprint: string;
  setSelectedSprint: (val: string) => void;
  availableSprints: string[];
  items: WorkItem[];
  projectSettings: ProjectSettings;
  pointMode: 'macro' | 'granular';
  handlePointModeChange: (mode: 'macro' | 'granular') => void;
  collapseAllColumns: () => void;
  expandAllColumns: () => void;
}

/**
 * Sticky ProjectToolbar component with frosted glass backdrop, tap-to-collapse filter drawer,
 * active filter counter pill, and quick column collapse/expand controls (TRK-16, TRK-20).
 */
export function ProjectToolbar({
  statusFilterOptions = [],
  effectiveSelectedStatuses = [],
  setSelectedStatuses,
  levelFilterOptions = [],
  effectiveSelectedLevels = [],
  setSelectedLevels,
  selectedSprint = 'all',
  setSelectedSprint,
  availableSprints = [],
  items = [],
  projectSettings,
  pointMode = 'granular',
  handlePointModeChange,
  collapseAllColumns,
  expandAllColumns,
}: ProjectToolbarProps) {
  const [isCollapsed, setIsCollapsed] = useState(false);

  const statusesCount = projectSettings?.statuses?.length || 0;
  const hierarchyCount = projectSettings?.hierarchy?.length || 0;
  const isStatusFiltered = statusesCount > 0 && (effectiveSelectedStatuses?.length || 0) < statusesCount;
  const isLevelFiltered = hierarchyCount > 0 && (effectiveSelectedLevels?.length || 0) < hierarchyCount;
  const isSprintFiltered = selectedSprint !== 'all';
  const hasActiveFilters = isStatusFiltered || isLevelFiltered || isSprintFiltered;

  let activeFilterCount = 0;
  if (isStatusFiltered) activeFilterCount++;
  if (isLevelFiltered) activeFilterCount++;
  if (isSprintFiltered) activeFilterCount++;

  const handleResetFilters = () => {
    setSelectedStatuses(null);
    setSelectedLevels(null);
    setSelectedSprint('all');
  };

  return (
    <div
      data-testid="board-filter-toolbar"
      style={{ top: 'var(--navbar-height, 0px)' }}
      className="sticky z-30 backdrop-blur-md bg-[#090d16]/85 border-y border-slate-800/60 py-2 -mx-4 px-4 sm:mx-0 sm:px-3 sm:rounded-xl transition-all shadow-sm space-y-2 overflow-x-auto no-scrollbar w-full touch-pan-x"
    >
      {/* Collapsed Single-Line Micro-Bar View */}
      {isCollapsed ? (
        <div className="flex items-center justify-between gap-3 min-w-0 py-0.5">
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setIsCollapsed(false)}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
              data-testid="filter-collapse-toggle-btn"
              title="Expand filter bar"
            >
              <Filter className="w-3.5 h-3.5 text-emerald-400" />
              <span>Filters</span>
              {activeFilterCount > 0 && (
                <span
                  data-testid="active-filter-counter-pill"
                  className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                >
                  {activeFilterCount}
                </span>
              )}
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
            </button>

            {hasActiveFilters && (
              <div className="flex items-center gap-1.5 text-xs text-slate-400">
                <span className="text-[11px] text-slate-500">Active:</span>
                {isStatusFiltered && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300">
                    {effectiveSelectedStatuses.length} Statuses
                  </span>
                )}
                {isLevelFiltered && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300">
                    {effectiveSelectedLevels.length} Levels
                  </span>
                )}
                {isSprintFiltered && (
                  <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-[10px] text-slate-300 truncate max-w-[120px]">
                    {selectedSprint === '__none__' ? 'Backlog' : selectedSprint}
                  </span>
                )}
                <button
                  type="button"
                  onClick={handleResetFilters}
                  className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium px-1.5 py-0.5 rounded hover:bg-slate-800 transition-colors ml-1"
                >
                  Reset
                </button>
              </div>
            )}
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <PointModeSwitcher mode={pointMode} onChange={handlePointModeChange} />
            <div className="flex items-center space-x-1 bg-slate-900/90 border border-slate-800 p-0.5 rounded-lg text-xs shrink-0 whitespace-nowrap min-h-[32px]">
              <button
                onClick={collapseAllColumns}
                className="px-2 py-1 text-[11px] text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
                title="Collapse all columns sideways"
              >
                Collapse
              </button>
              <button
                onClick={expandAllColumns}
                className="px-2 py-1 text-[11px] text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
                title="Expand all columns"
              >
                Expand
              </button>
            </div>
          </div>
        </div>
      ) : (
        /* Full Expanded Filter Drawer View */
        <div className="flex items-center gap-2 shrink-0 sm:flex-wrap sm:justify-between w-full">
          <div className="flex items-center gap-2 shrink-0">
            {/* Collapse toggle button */}
            <button
              type="button"
              onClick={() => setIsCollapsed(true)}
              className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer shrink-0 min-h-[36px]"
              data-testid="filter-collapse-toggle-btn"
              title="Collapse filter bar into single-line micro-bar"
            >
              <Filter className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">Filters</span>
              {activeFilterCount > 0 && (
                <span
                  data-testid="active-filter-counter-pill"
                  className="px-1.5 py-0.2 text-[10px] font-bold rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                >
                  {activeFilterCount}
                </span>
              )}
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
            </button>

            <FilterMultiSelect
              label="Status"
              options={statusFilterOptions}
              selectedIds={effectiveSelectedStatuses}
              onChange={setSelectedStatuses}
            />
            <FilterMultiSelect
              label="Level"
              options={levelFilterOptions}
              selectedIds={effectiveSelectedLevels}
              onChange={setSelectedLevels}
            />
            <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs shrink-0 whitespace-nowrap min-h-[36px]">
              <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <span className="text-[11px] font-medium text-slate-400 shrink-0">Sprint:</span>
              <select
                value={selectedSprint}
                onChange={(e) => setSelectedSprint(e.target.value)}
                className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer shrink-0"
              >
                <option value="all" className="bg-slate-900 text-slate-200">All Sprints</option>
                <option value="__none__" className="bg-slate-900 text-slate-200">Backlog (No Sprint)</option>
                {availableSprints.map((s) => {
                  const count = items.filter((it) => it.metadata?.sprint === s).length;
                  const pts = items.filter((it) => it.metadata?.sprint === s).reduce((acc, it) => {
                    const p = Number(it.metadata?.story_points ?? it.metadata?.points ?? it.metadata?.estimate);
                    return acc + (isNaN(p) ? 0 : p);
                  }, 0);
                  return (
                    <option key={s} value={s} className="bg-slate-900 text-slate-200">
                      {s} ({count} {count === 1 ? 'item' : 'items'}{pts > 0 ? ` · ${pts} pts` : ''})
                    </option>
                  );
                })}
              </select>
            </div>
            <PointModeSwitcher mode={pointMode} onChange={handlePointModeChange} />
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleResetFilters}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium px-2 py-1 rounded hover:bg-slate-800 transition-colors shrink-0 whitespace-nowrap min-h-[36px] flex items-center space-x-1 cursor-pointer"
              >
                <RotateCcw className="w-3 h-3 mr-1" />
                <span>Reset</span>
              </button>
            )}
          </div>

          <div className="flex items-center space-x-3 shrink-0">
            {/* Quick Collapse / Expand Columns */}
            <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-xs shrink-0 whitespace-nowrap min-h-[36px]">
              <button
                onClick={collapseAllColumns}
                className="px-2 py-1 text-[11px] text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
                title="Collapse all columns sideways"
              >
                Collapse
              </button>
              <button
                onClick={expandAllColumns}
                className="px-2 py-1 text-[11px] text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors cursor-pointer"
                title="Expand all columns"
              >
                Expand
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
