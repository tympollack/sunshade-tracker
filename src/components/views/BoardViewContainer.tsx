'use client';

import React from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  Eye,
  Calendar,
  Maximize2,
  Minimize2,
  RefreshCw,
} from 'lucide-react';
import { WorkItem, ProjectSettings, StatusDefinition, HierarchyLevel, SprintDefinition } from '@/types/tracker';
import { FilterMultiSelect, FilterOption } from '@/components/FilterMultiSelect';
import { PointModeSwitcher } from '@/components/PointModeSwitcher';
import { KanbanCard } from '@/components/board/KanbanCard';
import { BoardView } from '@/components/board/BoardView';
import { BoardColumn } from '@/components/board/BoardColumn';
import { ProjectToolbar } from '@/components/board/ProjectToolbar';
import { isItemImmutableDueToCompletedSprint, getCompletedStatusSet } from '@/lib/sprint-utils';
import { SprintTimelineScrubber, TimelineSnapshotPoint } from '@/components/sprints/SprintTimelineScrubber';

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
  availableSprintDefs?: SprintDefinition[];
  boardOrientation?: 'columns' | 'stack';
  onOrientationChange?: (mode: 'columns' | 'stack') => void;
  cardDensity?: 'compact' | 'detailed';
  onCardDensityChange?: (density: 'compact' | 'detailed') => void;
  getItemProjectSettings?: (item: WorkItem) => ProjectSettings;
  coldCount?: number;
  isLoadingColdArchive?: boolean;
  onLoadColdArchive?: () => Promise<void> | void;
  timelineSnapshots?: TimelineSnapshotPoint[];
  activeTimelineSnapshot?: TimelineSnapshotPoint | null;
  onSelectTimelineSnapshot?: (snap: TimelineSnapshotPoint | null) => void;
  onOpenDiffModal?: (baseId: string, targetId: string) => void;
  guardRejectedItemIds?: Set<string>;
}

export function BoardViewContainer(props: BoardViewContainerProps) {
  const {
    boardOrientation: propBoardOrientation,
    onOrientationChange: propOnOrientationChange,
    cardDensity: propCardDensity,
    onCardDensityChange: propOnCardDensityChange,
    hiddenBoardItems = [],
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
    availableSprintDefs = [],
    items,
    projectSettings,
    pointMode,
    handlePointModeChange,
    boardHeightMode,
    setBoardHeightMode,
    collapsedColumnsUp = new Set(),
    toggleCollapseUp,
    collapsedColumnsSideways = new Set(),
    toggleCollapseSideways,
    collapseAllColumns,
    expandAllColumns,
    boardScrollRef,
    handleBoardWheel,
    displayedStatuses = [],
    columnCounts = {},
    columnsItemsMap = {},
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
    unmappedItems = [],
    draggedItem,
    getItemProjectSettings,
    coldCount = 0,
    isLoadingColdArchive = false,
    onLoadColdArchive,
    timelineSnapshots = [],
    activeTimelineSnapshot = null,
    onSelectTimelineSnapshot,
    onOpenDiffModal,
    guardRejectedItemIds,
  } = props;

  const isEffectivelyReadOnly = isReadOnly || Boolean(activeTimelineSnapshot);

  const [internalOrientation, setInternalOrientation] = React.useState<'columns' | 'stack'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('sunshade_board_orientation');
        if (saved === 'columns' || saved === 'stack') return saved;
      } catch {}
    }
    return 'columns';
  });

  const effectiveOrientation = propBoardOrientation ?? internalOrientation;
  const handleOrientationChange = (mode: 'columns' | 'stack') => {
    if (propOnOrientationChange) {
      propOnOrientationChange(mode);
    } else {
      setInternalOrientation(mode);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('sunshade_board_orientation', mode);
        } catch {}
      }
    }
  };

  const [internalCardDensity, setInternalCardDensity] = React.useState<'compact' | 'detailed'>(() => {
    if (typeof window !== 'undefined') {
      try {
        const saved = localStorage.getItem('sunshade_board_card_density');
        if (saved === 'compact' || saved === 'detailed') return saved;
      } catch {}
    }
    return 'compact';
  });

  const effectiveCardDensity = propCardDensity ?? internalCardDensity;
  const handleCardDensityChange = (density: 'compact' | 'detailed') => {
    if (propOnCardDensityChange) {
      propOnCardDensityChange(density);
    } else {
      setInternalCardDensity(density);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem('sunshade_board_card_density', density);
        } catch {}
      }
    }
  };

  const completionSet = React.useMemo(() => {
    return getCompletedStatusSet(props.projectSettings?.statuses);
  }, [props.projectSettings?.statuses]);

  const targetColdColId = React.useMemo(() => {
    const found = displayedStatuses.find(
      (c) =>
        completionSet.has(c.id.toLowerCase().trim()) ||
        c.id === 'complete' ||
        c.label?.toLowerCase() === 'complete' ||
        Boolean(c.is_completed)
    );
    return found ? found.id : displayedStatuses[displayedStatuses.length - 1]?.id;
  }, [displayedStatuses, completionSet]);

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

      {/* Board Controls Toolbar (TRK-16, TRK-20) */}
      <div data-testid="board-filter-toolbar" className="overflow-x-auto no-scrollbar w-full py-1 -mx-4 px-4 touch-pan-x sm:mx-0 sm:px-0">
        <ProjectToolbar
          statusFilterOptions={statusFilterOptions}
          effectiveSelectedStatuses={effectiveSelectedStatuses}
          setSelectedStatuses={setSelectedStatuses}
          levelFilterOptions={levelFilterOptions}
          effectiveSelectedLevels={effectiveSelectedLevels}
          setSelectedLevels={setSelectedLevels}
          selectedSprint={selectedSprint}
          setSelectedSprint={setSelectedSprint}
          availableSprints={availableSprints}
          items={items}
          projectSettings={projectSettings}
          pointMode={pointMode}
          handlePointModeChange={handlePointModeChange}
          collapseAllColumns={collapseAllColumns}
          expandAllColumns={expandAllColumns}
          boardOrientation={effectiveOrientation}
          onOrientationChange={handleOrientationChange}
          cardDensity={effectiveCardDensity}
          onCardDensityChange={handleCardDensityChange}
        />
      </div>

      {/* Interactive Sprint Timeline Scrubber (Time Machine Mode) */}
      {selectedSprint && selectedSprint !== 'all' && timelineSnapshots && timelineSnapshots.length > 0 && (
        <SprintTimelineScrubber
          sprintId={selectedSprint}
          sprintName={selectedSprint}
          snapshots={timelineSnapshots}
          selectedSnapshotId={activeTimelineSnapshot?.id || null}
          onSelectSnapshot={onSelectTimelineSnapshot}
          onOpenDiffModal={onOpenDiffModal}
        />
      )}

      {/* Board Columns Canvas */}
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-96 rounded-xl bg-slate-900/40 border border-slate-800/80 animate-pulse" />
          ))}
        </div>
      ) : (
        <BoardView
          ref={boardScrollRef}
          onWheel={handleBoardWheel}
          orientation={effectiveOrientation}
          dataTestId="board-scroll-canvas"
          className={`board-scroll-container ${
            effectiveOrientation === 'stack'
              ? 'flex flex-col items-stretch gap-4 overflow-x-hidden overflow-y-visible h-auto pb-4'
              : `flex flex-col md:flex-row items-stretch gap-4 overflow-x-hidden md:overflow-x-auto pb-4 h-auto md:h-[calc(100dvh-var(--header-height)-var(--toolbar-height))] w-full overflow-y-visible md:overflow-y-hidden p-4 ${
                  boardHeightMode === 'compact'
                    ? 'h-auto md:h-[460px] md:min-h-[460px]'
                    : boardHeightMode === 'full'
                    ? 'h-auto md:h-[calc(100vh-140px)] md:min-h-[500px]'
                    : 'h-auto md:h-[calc(100vh-200px)] md:min-h-[420px]'
                }`
          } custom-scrollbar select-none`}
        >
          {displayedStatuses.map((col) => {
            const colItems = columnsItemsMap[col.id] || [];
            const isCollapsedSideways = effectiveOrientation === 'columns' && collapsedColumnsSideways.has(col.id);
            const isCollapsedUp = collapsedColumnsUp.has(col.id);
            const hasColdBanner = col.id === targetColdColId && coldCount > 0;
            const hasQuickAdd = quickAddColId === col.id && !isEffectivelyReadOnly;

            const columnBannerSlot =
              hasColdBanner || hasQuickAdd ? (
                <>
                  {hasColdBanner && (
                    <div
                      data-testid="cold-archive-banner"
                      className="mx-3 my-2 px-3 py-2 bg-slate-950/70 border border-slate-800/80 rounded-lg text-xs text-slate-400 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-1.5 shrink-0"
                    >
                      <span className="text-[11px] text-slate-400 font-medium">
                        Showing recent (last 14d)
                      </span>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onLoadColdArchive?.();
                        }}
                        disabled={isLoadingColdArchive}
                        data-testid="load-older-completed-btn"
                        className="text-[11px] text-sky-400 hover:text-sky-300 font-medium whitespace-nowrap disabled:opacity-50 transition-colors underline cursor-pointer"
                      >
                        {isLoadingColdArchive
                          ? 'Loading older tasks...'
                          : `Load older completed tasks (${coldCount} items)`}
                      </button>
                    </div>
                  )}

                  {hasQuickAdd && (
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
                </>
              ) : undefined;

            return (
              <BoardColumn
                key={col.id}
                column={col}
                itemCount={colItems.length}
                orientation={effectiveOrientation}
                isCollapsed={isCollapsedSideways}
                isCollapsedUp={isCollapsedUp}
                onToggleCollapse={() => toggleCollapseSideways(col.id)}
                onToggleCollapseUp={() => toggleCollapseUp(col.id)}
                onQuickAdd={
                  isEffectivelyReadOnly
                    ? undefined
                    : () => {
                        const opening = quickAddColId !== col.id;
                        setQuickAddColId(opening ? col.id : null);
                        setQuickAddTitle('');
                        if (opening && isCollapsedUp) {
                          toggleCollapseUp(col.id);
                        }
                      }
                }
                isReadOnly={isEffectivelyReadOnly}
                collapseButtonTestId={`column-collapse-sideways-btn-${col.id}`}
                onDragOver={(e) => {
                  e.preventDefault();
                  e.dataTransfer.dropEffect = 'move';
                }}
                onDrop={(e) => handleDropOnColEnd(e, col.id)}
                bannerSlot={columnBannerSlot}
              >
                {colItems.length === 0 ? (
                  <div
                    className={`flex items-center justify-center border-2 border-dashed border-slate-800/60 rounded-lg text-slate-600 text-xs select-none ${
                      effectiveOrientation === 'stack' ? 'h-24 col-span-full' : 'h-28'
                    }`}
                  >
                    No items
                  </div>
                ) : (
                  colItems.map((item, index) => {
                    const itemHierarchy = getItemHierarchy(item);
                    const isBeingDragged = draggedItemId === item.id;
                    const isDragTarget =
                      dragOverTarget?.colId === col.id && dragOverTarget?.index === index;
                    const itemProjectSettings = getItemProjectSettings ? getItemProjectSettings(item) : projectSettings;
                    const isCardImmutable = isItemImmutableDueToCompletedSprint(item, itemProjectSettings, availableSprintDefs);

                    return (
                      <div key={item.id} className="relative">
                        {/* Insertion Indicator line */}
                        {isDragTarget && (
                          <div className="h-1 bg-emerald-400 rounded-full my-1 shadow-lg shadow-emerald-400/50 animate-pulse" />
                        )}

                        <KanbanCard
                          item={item}
                          compact={effectiveCardDensity === 'compact'}
                          childCount={childCountMap.get(item.id) || 0}
                          rollupPoints={pointsRollupMap.get(item.id) || 0}
                          pointMode={pointMode}
                          projectSettings={itemProjectSettings}
                          itemHierarchy={itemHierarchy}
                          allProjects={allProjects}
                          isAllProjects={isAllProjects}
                          isCardImmutable={isCardImmutable}
                          isReadOnly={isEffectivelyReadOnly}
                          isBeingDragged={isBeingDragged}
                          isGuardRejected={Boolean(guardRejectedItemIds?.has(item.id))}
                          onEditItem={setEditingItem}
                          onDeleteItem={setDeleteConfirmItem}
                          onUpdateStatus={handleUpdateStatus}
                          onUpdateType={handleUpdateType}
                          getItemStatuses={getItemStatuses}
                          onDragStart={isEffectivelyReadOnly ? () => {} : handleDragStart}
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
              </BoardColumn>
            );
          })}

          {/* Uncategorized Fallback Column */}
          {unmappedItems.length > 0 && (
            <div
              className={`${
                effectiveOrientation === 'columns'
                  ? 'w-full md:w-80 md:min-w-[320px] md:max-w-[320px] h-full'
                  : 'w-full h-auto'
              } shrink-0 bg-slate-900/40 border border-amber-500/40 rounded-xl flex flex-col shadow-sm`}
            >
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

              <div
                className={
                  effectiveOrientation === 'stack'
                    ? 'board-column-scroll p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 custom-scrollbar'
                    : 'board-column-scroll p-3 space-y-3 flex-1 overflow-y-visible max-h-none md:overflow-y-auto md:max-h-full min-h-0 custom-scrollbar'
                }
              >
                {unmappedItems.map((item) => {
                  const itemProjectSettings = getItemProjectSettings ? getItemProjectSettings(item) : projectSettings;
                  return (
                    <KanbanCard
                      key={item.id}
                      item={item}
                      compact={effectiveCardDensity === 'compact'}
                      childCount={childCountMap.get(item.id) || 0}
                      rollupPoints={pointsRollupMap.get(item.id) || 0}
                      pointMode={pointMode}
                      projectSettings={itemProjectSettings}
                      itemHierarchy={getItemHierarchy(item)}
                      allProjects={allProjects}
                      isAllProjects={isAllProjects}
                      isCardImmutable={isItemImmutableDueToCompletedSprint(item, itemProjectSettings, availableSprintDefs)}
                      isReadOnly={isEffectivelyReadOnly}
                      isGuardRejected={Boolean(guardRejectedItemIds?.has(item.id))}
                      onEditItem={setEditingItem}
                      onDeleteItem={setDeleteConfirmItem}
                      onUpdateStatus={handleUpdateStatus}
                      onUpdateType={handleUpdateType}
                      getItemStatuses={getItemStatuses}
                    />
                  );
                })}
              </div>
            </div>
          )}
        </BoardView>
      )}
    </div>
  );
}
