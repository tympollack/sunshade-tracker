'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Eye,
  Calendar,
  ChevronUp,
  ChevronDown,
  ChevronsLeftRight,
  Maximize2,
  Minimize2,
  Plus,
  RefreshCw,
} from 'lucide-react';
import { WorkItem, ProjectSettings, StatusDefinition, HierarchyLevel } from '@/types/tracker';
import { FilterMultiSelect, FilterOption } from '@/components/FilterMultiSelect';
import { PointModeSwitcher } from '@/components/PointModeSwitcher';
import { KanbanCard } from '@/components/board/KanbanCard';
import { isItemImmutableDueToCompletedSprint } from '@/lib/sprint-utils';

export interface BoardViewContainerProps {
  hiddenBoardItems: WorkItem[];
  dismissedBoardDeviationBanner: boolean;
  setDismissedBoardDeviationBanner: (val: boolean) => void;
  onOpenReconciliation: () => void;
  isReadOnly: boolean;
  loading: boolean;
  tenantSlug: string;
  projectSlug: string;
  // Filters
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
  // Height & Collapse
  boardHeightMode: 'compact' | 'standard' | 'full';
  setBoardHeightMode: (mode: 'compact' | 'standard' | 'full') => void;
  collapsedColumnsUp: Set<string>;
  toggleCollapseUp: (colId: string) => void;
  collapsedColumnsSideways: Set<string>;
  toggleCollapseSideways: (colId: string) => void;
  collapseAllColumns: () => void;
  expandAllColumns: () => void;
  // Drag and Scroll
  boardScrollRef: React.RefObject<HTMLDivElement | null>;
  handleBoardWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  displayedStatuses: StatusDefinition[];
  columnCounts: Record<string, number>;
  columnsItemsMap: Record<string, WorkItem[]>;
  // Quick Add Inline
  quickAddColId: string | null;
  setQuickAddColId: (id: string | null) => void;
  quickAddTitle: string;
  setQuickAddTitle: (title: string) => void;
  isCreatingQuickItem: boolean;
  handleCreateQuickInlineItem: (colId: string) => Promise<void>;
  // Dragging states
  draggedItemId: string | null;
  dragOverTarget: { colId: string; index: number } | null;
  childCountMap: Map<string, number>;
  pointsRollupMap: Map<string, number>;
  getItemHierarchy: (item: WorkItem) => HierarchyLevel[];
  allProjects: { id: string; slug: string; name: string }[];
  isAllProjects: boolean;
  setEditingItem: (item: WorkItem) => void;
  setDeleteConfirmItem: (item: WorkItem) => void;
  handleUpdateStatus: (itemId: string, newStatus: string) => Promise<void> | void;
  handleUpdateType: (itemId: string, newType: string) => Promise<void> | void;
  getItemStatuses: (item: WorkItem) => StatusDefinition[];
  handleDragStart: (e: React.DragEvent, item: WorkItem) => void;
  handleDragEnd: () => void;
  handleDragOverCard: (e: React.DragEvent, colId: string, index: number) => void;
  handleDrop: (e: React.DragEvent, colId: string, index: number) => void;
  handleDropOnColEnd: (e: React.DragEvent, colId: string) => void;
  unmappedItems: WorkItem[];
  draggedItem: WorkItem | null;
}

export function BoardViewContainer(props: BoardViewContainerProps) {
  const {
    hiddenBoardItems,
    dismissedBoardDeviationBanner,
    setDismissedBoardDeviationBanner,
    onOpenReconciliation,
    isReadOnly,
    loading,
    tenantSlug,
    projectSlug,
    statusFilterOptions,
    effectiveSelectedStatuses,
    setSelectedStatuses,
    levelFilterOptions,
    effectiveSelectedLevels,
    setSelectedLevels,
    selectedSprint,
    setSelectedSprint,
    availableSprints,
    items,
    projectSettings,
    pointMode,
    handlePointModeChange,
    boardHeightMode,
    setBoardHeightMode,
    collapsedColumnsUp,
    toggleCollapseUp,
    collapsedColumnsSideways,
    toggleCollapseSideways,
    collapseAllColumns,
    expandAllColumns,
    boardScrollRef,
    handleBoardWheel,
    displayedStatuses,
    columnCounts,
    columnsItemsMap,
    quickAddColId,
    setQuickAddColId,
    quickAddTitle,
    setQuickAddTitle,
    isCreatingQuickItem,
    handleCreateQuickInlineItem,
    draggedItemId,
    dragOverTarget,
    childCountMap,
    pointsRollupMap,
    getItemHierarchy,
    allProjects,
    isAllProjects,
    setEditingItem,
    setDeleteConfirmItem,
    handleUpdateStatus,
    handleUpdateType,
    getItemStatuses,
    handleDragStart,
    handleDragEnd,
    handleDragOverCard,
    handleDrop,
    handleDropOnColEnd,
    unmappedItems,
    draggedItem,
  } = props;

  return (
    <div className="space-y-4">
      {/* Schema Deviations Banner on Board */}
      {hiddenBoardItems.length > 0 && !dismissedBoardDeviationBanner && (
        <div
          className="p-3.5 rounded-xl bg-amber-950/40 border border-amber-500/40 text-amber-200 text-xs flex flex-wrap items-center justify-between gap-3 shadow-md"
          data-testid="board-deviation-banner"
        >
          <div className="flex items-center space-x-2.5 min-w-0 flex-1">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong className="text-amber-100">Schema Deviations Detected:</strong>{' '}
              {hiddenBoardItems.length} item{hiddenBoardItems.length !== 1 ? 's are' : ' is'} hidden from board columns because{' '}
              {hiddenBoardItems.length !== 1 ? 'their hierarchy levels or statuses are' : 'its hierarchy level or status is'} not defined in the project schema.
            </span>
          </div>
          <div className="flex items-center space-x-2 shrink-0">
            <button
              type="button"
              onClick={onOpenReconciliation}
              className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-colors shadow cursor-pointer"
              data-testid="reconcile-deviations-banner-btn"
            >
              Review &amp; Reconcile
            </button>
            <button
              type="button"
              onClick={() => setDismissedBoardDeviationBanner(true)}
              className="text-amber-400/80 hover:text-amber-200 p-1 transition-colors cursor-pointer"
              title="Dismiss for now"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Guest Read-Only Banner */}
      {!loading && isReadOnly && (
        <div className="p-4 rounded-xl bg-sky-950/20 border border-sky-800/30 flex flex-wrap items-center justify-between gap-3 text-xs text-sky-200">
          <div className="flex items-center space-x-2.5">
            <Eye className="w-4 h-4 text-sky-400 shrink-0" />
            <span>
              You are browsing this workspace in <strong>read-only guest mode</strong>. Work items and hierarchy can be explored freely.
            </span>
          </div>
          <Link
            href={`/login?next=/${tenantSlug}/${projectSlug}`}
            className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs transition-colors shrink-0"
          >
            Sign In to Make Changes
          </Link>
        </div>
      )}

      {/* Board Controls Toolbar */}
      <div
        data-testid="board-filter-toolbar"
        className="flex items-center gap-2 overflow-x-auto no-scrollbar w-full py-1 -mx-4 px-4 touch-pan-x sm:mx-0 sm:px-1 sm:flex-wrap sm:justify-between"
      >
        <div className="flex items-center gap-2 shrink-0">
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
          {(effectiveSelectedStatuses.length < projectSettings.statuses.length ||
            effectiveSelectedLevels.length < projectSettings.hierarchy.length ||
            selectedSprint !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSelectedStatuses(null);
                setSelectedLevels(null);
                setSelectedSprint('all');
              }}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium px-2 py-1 rounded hover:bg-slate-800 transition-colors shrink-0 whitespace-nowrap min-h-[36px] flex items-center"
            >
              Reset Filters
            </button>
          )}
        </div>

        <div className="flex items-center space-x-3 shrink-0">
          {/* Board Height Presets */}
          <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-xs shrink-0 whitespace-nowrap min-h-[36px]">
            <span className="text-[10px] uppercase font-semibold text-slate-500 px-2">Height:</span>
            {(['compact', 'standard', 'full'] as const).map((h) => (
              <button
                key={h}
                onClick={() => setBoardHeightMode(h)}
                className={`px-2.5 py-1 rounded-md text-[11px] font-medium capitalize transition-colors ${
                  boardHeightMode === h
                    ? 'bg-slate-800 text-white shadow-sm'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                {h}
              </button>
            ))}
          </div>

          {/* Quick Collapse / Expand Columns */}
          <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-xs shrink-0 whitespace-nowrap min-h-[36px]">
            <button
              onClick={collapseAllColumns}
              className="px-2 py-1 text-[11px] text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
              title="Collapse all columns sideways"
            >
              Collapse
            </button>
            <button
              onClick={expandAllColumns}
              className="px-2 py-1 text-[11px] text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
              title="Expand all columns"
            >
              Expand
            </button>
          </div>
        </div>
      </div>

      {/* Board Columns Canvas */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-96 rounded-xl bg-slate-900/40 border border-slate-800/80 animate-pulse" />
          ))}
        </div>
      ) : (
        <div
          ref={boardScrollRef}
          onWheel={handleBoardWheel}
          className={`board-scroll-container flex flex-col md:flex-row items-stretch gap-4 overflow-x-hidden md:overflow-x-auto pb-4 custom-scrollbar select-none ${
            boardHeightMode === 'compact'
              ? 'h-auto md:h-[460px] md:min-h-[460px]'
              : boardHeightMode === 'full'
              ? 'h-auto md:h-[calc(100vh-140px)] md:min-h-[500px]'
              : 'h-auto md:h-[calc(100vh-200px)] md:min-h-[420px]'
          }`}
        >
          {displayedStatuses.map((col) => {
            const colItems = columnsItemsMap[col.id] || [];
            const isCollapsedSideways = collapsedColumnsSideways.has(col.id);
            const isCollapsedUp = collapsedColumnsUp.has(col.id);

            if (isCollapsedSideways) {
              return (
                <div
                  key={col.id}
                  onClick={() => toggleCollapseSideways(col.id)}
                  className="w-12 min-w-[48px] max-w-[48px] shrink-0 bg-slate-900/30 border border-slate-800/60 hover:border-slate-700/80 rounded-xl flex flex-col items-center py-4 cursor-pointer transition-colors group h-full"
                  title={`Expand ${col.label} (${colItems.length})`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full mb-3 shrink-0"
                    style={{ backgroundColor: col.color || '#94a3b8' }}
                  />
                  <span className="[writing-mode:vertical-rl] rotate-180 text-xs font-semibold tracking-wider uppercase text-slate-400 group-hover:text-slate-200 transition-colors my-auto select-none">
                    {col.label}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono mt-3 shrink-0">
                    {colItems.length}
                  </span>
                </div>
              );
            }

            return (
              <div
                key={col.id}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => handleDropOnColEnd(e, col.id)}
                className={`w-full md:w-80 md:min-w-[320px] md:max-w-[320px] shrink-0 bg-slate-900/40 border border-slate-800/80 rounded-xl flex flex-col transition-all shadow-sm ${
                  isCollapsedUp ? 'h-auto' : 'h-full'
                }`}
              >
                {/* Column Header */}
                <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between shrink-0 bg-slate-950/40 rounded-t-xl">
                  <div className="flex items-center space-x-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: col.color || '#94a3b8' }}
                    />
                    <span className="font-semibold text-xs tracking-wider uppercase text-slate-300 truncate">
                      {col.label}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono shrink-0">
                      {colItems.length}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1 shrink-0">
                    {!isReadOnly && (
                      <button
                        type="button"
                        onClick={() => {
                          setQuickAddColId(quickAddColId === col.id ? null : col.id);
                          setQuickAddTitle('');
                        }}
                        className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                        title={`Add item to ${col.label}`}
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => toggleCollapseUp(col.id)}
                      className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                      title="Collapse column upward"
                    >
                      {isCollapsedUp ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleCollapseSideways(col.id)}
                      className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
                      title="Collapse column sideways"
                    >
                      <ChevronsLeftRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Inline Quick Add Input */}
                {quickAddColId === col.id && !isReadOnly && (
                  <div className="p-3 border-b border-slate-800/80 bg-slate-950/60 animate-in fade-in">
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        handleCreateQuickInlineItem(col.id);
                      }}
                      className="space-y-2"
                    >
                      <input
                        type="text"
                        placeholder="Item title..."
                        value={quickAddTitle}
                        onChange={(e) => setQuickAddTitle(e.target.value)}
                        autoFocus
                        disabled={isCreatingQuickItem}
                        className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                      />
                      <div className="flex items-center justify-end space-x-2">
                        <button
                          type="button"
                          onClick={() => {
                            setQuickAddColId(null);
                            setQuickAddTitle('');
                          }}
                          className="px-2 py-1 text-[11px] text-slate-400 hover:text-white"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={!quickAddTitle.trim() || isCreatingQuickItem}
                          className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-medium disabled:opacity-50"
                        >
                          {isCreatingQuickItem ? 'Adding...' : 'Add'}
                        </button>
                      </div>
                    </form>
                  </div>
                )}

                {/* Cards Container */}
                {!isCollapsedUp && (
                  <div className="board-column-scroll p-3 space-y-3 flex-1 overflow-y-visible max-h-none md:overflow-y-auto md:max-h-full min-h-0 custom-scrollbar">
                    {colItems.length === 0 ? (
                      <div className="h-28 flex items-center justify-center border-2 border-dashed border-slate-800/60 rounded-lg text-slate-600 text-xs select-none">
                        No items
                      </div>
                    ) : (
                      colItems.map((item, index) => {
                        const itemHierarchy = getItemHierarchy(item);
                        const isBeingDragged = draggedItemId === item.id;
                        const isDragTarget =
                          dragOverTarget?.colId === col.id && dragOverTarget?.index === index;
                        const isCardImmutable = isItemImmutableDueToCompletedSprint(item, projectSettings);

                        return (
                          <div key={item.id} className="relative">
                            {/* Insertion Indicator line */}
                            {isDragTarget && (
                              <div className="h-1 bg-emerald-400 rounded-full my-1 shadow-lg shadow-emerald-400/50 animate-pulse" />
                            )}

                            <KanbanCard
                              item={item}
                              childCount={childCountMap.get(item.id) || 0}
                              rollupPoints={pointsRollupMap.get(item.id) || 0}
                              pointMode={pointMode}
                              itemHierarchy={itemHierarchy}
                              allProjects={allProjects}
                              isAllProjects={isAllProjects}
                              isCardImmutable={isCardImmutable}
                              isReadOnly={isReadOnly}
                              isBeingDragged={isBeingDragged}
                              onEditItem={setEditingItem}
                              onDeleteItem={setDeleteConfirmItem}
                              onUpdateStatus={handleUpdateStatus}
                              onUpdateType={handleUpdateType}
                              getItemStatuses={getItemStatuses}
                              onDragStart={handleDragStart}
                              onDragEnd={handleDragEnd}
                              onDragOver={(e) => handleDragOverCard(e, col.id, index)}
                              onDrop={(e) => {
                                e.stopPropagation();
                                handleDrop(e, col.id, index);
                              }}
                            />
                          </div>
                        );
                      })
                    )}
                  </div>
                )}
              </div>
            );
          })}

          {/* Uncategorized Fallback Column */}
          {unmappedItems.length > 0 && (
            <div className="w-full md:w-80 md:min-w-[320px] md:max-w-[320px] shrink-0 bg-slate-900/40 border border-amber-500/40 rounded-xl flex flex-col h-full shadow-sm">
              <div className="px-4 py-3 border-b border-amber-500/30 flex items-center justify-between shrink-0 bg-amber-500/10 rounded-t-xl">
                <div className="flex items-center space-x-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                  <span className="font-semibold text-xs tracking-wider uppercase text-amber-300">
                    Uncategorized
                  </span>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono">
                    {unmappedItems.length}
                  </span>
                </div>
                <span className="text-[10px] text-amber-400/80 italic">Unmapped status</span>
              </div>

              <div className="board-column-scroll p-3 space-y-3 flex-1 overflow-y-visible max-h-none md:overflow-y-auto md:max-h-full min-h-0 custom-scrollbar">
                {unmappedItems.map((item) => (
                  <KanbanCard
                    key={item.id}
                    item={item}
                    childCount={childCountMap.get(item.id) || 0}
                    rollupPoints={pointsRollupMap.get(item.id) || 0}
                    pointMode={pointMode}
                    itemHierarchy={getItemHierarchy(item)}
                    allProjects={allProjects}
                    isAllProjects={isAllProjects}
                    isCardImmutable={isItemImmutableDueToCompletedSprint(item, projectSettings)}
                    isReadOnly={isReadOnly}
                    onEditItem={setEditingItem}
                    onDeleteItem={setDeleteConfirmItem}
                    onUpdateStatus={handleUpdateStatus}
                    onUpdateType={handleUpdateType}
                    getItemStatuses={getItemStatuses}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
