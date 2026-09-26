'use client';

import React from 'react';
import {
  Calendar,
  List,
  FolderTree,
  Maximize2,
  Minimize2,
  EyeOff,
  Eye,
  Settings2,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  Clock,
} from 'lucide-react';
import { WorkItem, WorkItemNode, ProjectSettings, StatusDefinition, HierarchyLevel } from '@/types/tracker';
import { FilterMultiSelect, FilterOption } from '@/components/FilterMultiSelect';
import { PointModeSwitcher } from '@/components/PointModeSwitcher';
import { SprintProgressBar } from '@/components/sprint/SprintProgressBar';
import { SprintItemRow } from '@/components/SprintItemRow';
import { buildTree, getDescendantIds } from '@/lib/tree';
import { SchemaDeviation } from '@/lib/schema-deviation';
import {
  formatSprintDateRange,
  getSprintStatusBadge,
  isItemImmutableDueToCompletedSprint,
  calculateSprintLeafPoints,
  calculateSprintMacroPoints,
  getCompletedStatusSet,
  isItemCompleted,
} from '@/lib/sprint-utils';

export interface SprintViewContainerProps {
  items: WorkItem[];
  projectSettings: ProjectSettings;
  isReadOnly: boolean;
  pointMode: 'macro' | 'granular';
  handlePointModeChange: (mode: 'macro' | 'granular') => void;
  sprintViewMode: 'flat' | 'tree';
  setSprintViewMode: (mode: 'flat' | 'tree') => void;
  handleToggleCollapseAllSprints: () => void;
  collapsedSprints: Set<string>;
  toggleSprintCollapse: (sprint: string) => void;
  handleToggleHideCompletedSprints: () => void;
  hideCompletedSprints: boolean;
  hiddenCompletedSprintsCount: number;
  statusFilterOptions: FilterOption[];
  effectiveSprintStatuses: string[];
  setSprintSelectedStatuses: (val: string[] | null) => void;
  levelFilterOptions: FilterOption[];
  effectiveSprintLevels: string[];
  setSprintSelectedLevels: (val: string[] | null) => void;
  sprintSortBy: string;
  setSprintSortBy: (val: string) => void;
  setIsManageSprintsOpen: (open: boolean) => void;
  visibleSprints: string[];
  availableSprints: string[];
  filterSprintItems: (items: WorkItem[]) => WorkItem[];
  sprintComparator: (a: WorkItem, b: WorkItem) => number;
  selectedItemIds: Set<string>;
  handleToggleSelectItem: (id: string, e: React.MouseEvent, pool?: WorkItem[], isTreeRow?: boolean) => void;
  handleSelectAllInPool: (pool: WorkItem[]) => void;
  activeSprintPopover: string | null;
  setActiveSprintPopover: (sprint: string | null) => void;
  setEditingItem: (item: WorkItem) => void;
  getItemHierarchy: (item: WorkItem) => HierarchyLevel[];
  getItemStatuses: (item: WorkItem) => StatusDefinition[];
  deviations: SchemaDeviation[];
  setFocusedDeviationId: (id: string | null) => void;
  setIsReconciliationModalOpen: (open: boolean) => void;
  isAllProjects: boolean;
  allProjects: { id: string; slug: string; name: string }[];
  handleUpdateStatus: (itemId: string, newStatus: string) => Promise<void> | void;
  handleUpdateItemSprint: (itemId: string, sprintName: string | null) => Promise<void> | void;
}

export function SprintViewContainer(props: SprintViewContainerProps) {
  const {
    items,
    projectSettings,
    isReadOnly,
    pointMode,
    handlePointModeChange,
    sprintViewMode,
    setSprintViewMode,
    handleToggleCollapseAllSprints,
    collapsedSprints,
    toggleSprintCollapse,
    handleToggleHideCompletedSprints,
    hideCompletedSprints,
    hiddenCompletedSprintsCount,
    statusFilterOptions,
    effectiveSprintStatuses,
    setSprintSelectedStatuses,
    levelFilterOptions,
    effectiveSprintLevels,
    setSprintSelectedLevels,
    sprintSortBy,
    setSprintSortBy,
    setIsManageSprintsOpen,
    visibleSprints,
    availableSprints,
    filterSprintItems,
    sprintComparator,
    selectedItemIds,
    handleToggleSelectItem,
    handleSelectAllInPool,
    activeSprintPopover,
    setActiveSprintPopover,
    setEditingItem,
    getItemHierarchy,
    getItemStatuses,
    deviations,
    setFocusedDeviationId,
    setIsReconciliationModalOpen,
    isAllProjects,
    allProjects,
    handleUpdateStatus,
    handleUpdateItemSprint,
  } = props;

  const completionSet = getCompletedStatusSet(projectSettings?.statuses);

  return (
    <div className="space-y-6">
      {/* Header & Overview */}
      <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center space-x-2">
            <Calendar className="w-5 h-5 text-emerald-400" />
            <h3 className="text-lg font-semibold text-white">Sprint &amp; Story Planning</h3>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Manage sprint allocations, story points, and sprint backlogs across your projects. Configured in project settings.
          </p>
        </div>

        <div className="flex items-center flex-wrap gap-3">
          {/* Flat vs Hierarchy Mode Toggle */}
          <div className="flex items-center bg-slate-950 border border-slate-800 rounded-lg p-0.5">
            <button
              type="button"
              onClick={() => setSprintViewMode('flat')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                sprintViewMode === 'flat'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              data-testid="sprint-view-mode-flat"
            >
              <List className="w-3.5 h-3.5" />
              <span>Flat</span>
            </button>
            <button
              type="button"
              onClick={() => setSprintViewMode('tree')}
              className={`flex items-center space-x-1 px-2.5 py-1 rounded text-xs font-medium transition-colors ${
                sprintViewMode === 'tree'
                  ? 'bg-slate-800 text-white shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
              data-testid="sprint-view-mode-tree"
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>Hierarchy</span>
            </button>
          </div>

          {/* Expand / Collapse All Toggle */}
          <button
            type="button"
            onClick={handleToggleCollapseAllSprints}
            className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 hover:border-slate-700 text-xs text-slate-300 hover:text-white transition-colors flex items-center space-x-1.5 cursor-pointer"
            data-testid="sprint-toggle-all-collapse"
          >
            {collapsedSprints.size === (visibleSprints.length + 1) ? (
              <>
                <Maximize2 className="w-3.5 h-3.5" />
                <span>Expand All</span>
              </>
            ) : (
              <>
                <Minimize2 className="w-3.5 h-3.5" />
                <span>Collapse All</span>
              </>
            )}
          </button>

          {/* Hide Completed Sprints Toggle */}
          <button
            type="button"
            onClick={handleToggleHideCompletedSprints}
            className={`px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors flex items-center space-x-1.5 cursor-pointer ${
              hideCompletedSprints
                ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300 hover:bg-emerald-500/20'
                : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
            }`}
            data-testid="sprint-hide-completed-toggle"
            title={hideCompletedSprints ? 'Show completed sprints' : 'Hide completed sprints'}
          >
            {hideCompletedSprints ? (
              <EyeOff className="w-3.5 h-3.5" />
            ) : (
              <Eye className="w-3.5 h-3.5" />
            )}
            <span>Hide Completed Sprints</span>
            {hideCompletedSprints && hiddenCompletedSprintsCount > 0 && (
              <span
                className="text-[10px] text-emerald-400 font-mono ml-0.5"
                data-testid="sprint-hidden-completed-count"
              >
                ({hiddenCompletedSprintsCount} completed sprint{hiddenCompletedSprintsCount === 1 ? '' : 's'} hidden)
              </span>
            )}
          </button>

          <FilterMultiSelect
            label="Status"
            options={statusFilterOptions}
            selectedIds={effectiveSprintStatuses}
            onChange={setSprintSelectedStatuses}
          />
          <FilterMultiSelect
            label="Level"
            options={levelFilterOptions}
            selectedIds={effectiveSprintLevels}
            onChange={setSprintSelectedLevels}
          />
          <div className="flex items-center space-x-1.5">
            <span className="text-xs text-slate-400">Sort:</span>
            <select
              value={sprintSortBy}
              onChange={(e) => setSprintSortBy(e.target.value)}
              className="text-xs bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
              data-testid="sprint-sort-by"
            >
              <option value="order_index">Manual (Order)</option>
              <option value="points_desc">Points (High to Low)</option>
              <option value="points_asc">Points (Low to High)</option>
              <option value="title_asc">Title (A to Z)</option>
              <option value="title_desc">Title (Z to A)</option>
            </select>
          </div>
          {((effectiveSprintStatuses.length < projectSettings.statuses.length) ||
            (effectiveSprintLevels.length < projectSettings.hierarchy.length) ||
            sprintSortBy !== 'order_index') && (
            <button
              type="button"
              onClick={() => {
                setSprintSelectedStatuses(null);
                setSprintSelectedLevels(null);
                setSprintSortBy('order_index');
              }}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium px-2 py-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
              data-testid="sprint-reset-filters-btn"
            >
              Reset
            </button>
          )}

          {/* Manage Sprints Button */}
          {!isReadOnly && (
            <button
              type="button"
              onClick={() => setIsManageSprintsOpen(true)}
              className="px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-xs text-emerald-300 hover:text-emerald-200 transition-colors flex items-center space-x-1.5 font-medium cursor-pointer"
              data-testid="open-manage-sprints-btn"
            >
              <Settings2 className="w-3.5 h-3.5" />
              <span>Manage Sprints</span>
            </button>
          )}

          <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 flex items-center space-x-2">
            <span className="text-slate-500">Total Items:</span>
            <span className="font-mono font-bold text-white">{items.length}</span>
          </div>
          <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 flex items-center space-x-2">
            <span className="text-slate-500">Planned Sprints:</span>
            <span className="font-mono font-bold text-emerald-400">
              {visibleSprints.length}
            </span>
          </div>
          <PointModeSwitcher mode={pointMode} onChange={handlePointModeChange} />
        </div>
      </div>

      {/* Sprint Groups */}
      <div className="space-y-6">
        {visibleSprints.length === 0 && availableSprints.length > 0 && (
          <div
            className="p-8 text-center rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-slate-400 text-sm"
            data-testid="all-sprints-hidden-banner"
          >
            All completed sprints are hidden ({hiddenCompletedSprintsCount} hidden).
          </div>
        )}
        {(visibleSprints.length === 0 ? (availableSprints.length === 0 ? ['Sprint 1'] : []) : visibleSprints).map((sprintName) => {
          const rawSprintItems = items.filter((it) => it.metadata?.sprint === sprintName);
          const sprintItems = filterSprintItems(rawSprintItems);
          const leafPoints = calculateSprintLeafPoints(sprintItems);
          const macroPoints = calculateSprintMacroPoints(sprintItems);
          const effectivePoints = pointMode === 'macro' ? macroPoints : leafPoints;
          const totalPoints = effectivePoints;
          const completedItems = sprintItems.filter((it) =>
            isItemCompleted(it.status, completionSet)
          );
          const sprintDef = projectSettings.sprint_settings?.sprints?.find(
            (s: any) => s.name === sprintName || s.id === sprintName
          );
          const isCompletedSprint = sprintDef?.status === 'completed';
          const progressPct =
            sprintItems.length > 0
              ? Math.round((completedItems.length / sprintItems.length) * 100)
              : isCompletedSprint
              ? 100
              : 0;
          const isCurrent = sprintDef?.is_current ?? (availableSprints[0] === sprintName);
          const isCollapsed = collapsedSprints.has(sprintName);
          const allSprintSelected =
            sprintItems.length > 0 && sprintItems.every((it) => selectedItemIds.has(it.id));
          const someSprintSelected =
            !allSprintSelected && sprintItems.some((it) => selectedItemIds.has(it.id));

          // Tree renderer for hierarchy mode
          const renderSprintTreeNode = (node: WorkItemNode, depth = 0): React.ReactNode => {
            const childCount = (node.children || []).length;
            const getSubtreePoints = (n: WorkItemNode): number => {
              const children = n.children || [];
              if (children.length === 0) {
                return Number(n.metadata?.story_points ?? n.metadata?.points ?? n.metadata?.estimate ?? 0) || 0;
              }
              let sum = 0;
              for (const c of children) {
                sum += getSubtreePoints(c);
              }
              return sum;
            };
            const rollupPoints = childCount > 0 ? getSubtreePoints(node) : 0;
            const isImmutable = isItemImmutableDueToCompletedSprint(node, projectSettings) || isReadOnly;
            const descendantIds = getDescendantIds(items, node.id);
            const selectedDescendantsCount = descendantIds.filter((id) => selectedItemIds.has(id)).length;
            const isNodeSelected = selectedItemIds.has(node.id);
            const isNodeIndeterminate = !isNodeSelected && selectedDescendantsCount > 0;

            return (
              <React.Fragment key={node.id}>
                <SprintItemRow
                  item={node}
                  depth={depth}
                  isSelected={isNodeSelected}
                  isIndeterminate={isNodeIndeterminate}
                  onToggleSelect={(id, e) => handleToggleSelectItem(id, e, sprintItems, true)}
                  isImmutable={isImmutable}
                  onEditItem={setEditingItem}
                  getItemHierarchy={getItemHierarchy}
                  getItemStatuses={getItemStatuses}
                  deviations={deviations}
                  onOpenReconciliation={(dev) => {
                    setFocusedDeviationId(dev?.id || null);
                    setIsReconciliationModalOpen(true);
                  }}
                  isAllProjects={isAllProjects}
                  allProjects={allProjects}
                  onUpdateStatus={handleUpdateStatus}
                  onUpdateSprint={(id, sp) => handleUpdateItemSprint(id, sp)}
                  availableSprints={availableSprints}
                  currentSprintName={sprintName}
                  isTreeMode={true}
                  childCount={childCount}
                  rollupPoints={rollupPoints}
                  pointMode={pointMode}
                />
                {(node.children || []).map((child) => renderSprintTreeNode(child, depth + 1))}
              </React.Fragment>
            );
          };

          return (
            <div
              key={sprintName}
              className={`rounded-xl bg-slate-900/40 border border-slate-800/80 shadow-sm relative hover:z-20 has-[[data-testid=sprint-progress-breakdown]]:!z-30 ${
                activeSprintPopover === sprintName ? '!z-30' : 'z-10'
              } ${isCollapsed ? 'rounded-xl' : ''}`}
              data-testid={`sprint-swimlane-${sprintName}`}
            >
              {/* Sprint Header */}
              <div
                className={`p-4 bg-slate-950/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3 relative has-[[data-testid=sprint-progress-breakdown]]:!z-30 ${
                  activeSprintPopover === sprintName ? '!z-30' : 'z-10'
                } ${isCollapsed ? 'rounded-xl border-b-0' : 'rounded-t-xl'}`}
              >
                <div className="flex items-center space-x-3 flex-wrap gap-y-2">
                  <button
                    type="button"
                    onClick={() => toggleSprintCollapse(sprintName)}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors cursor-pointer"
                    data-testid={`collapse-toggle-${sprintName}`}
                    aria-label={isCollapsed ? `Expand ${sprintName}` : `Collapse ${sprintName}`}
                  >
                    {isCollapsed ? (
                      <ChevronRight className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => handleSelectAllInPool(sprintItems)}
                      className="p-1 text-slate-500 hover:text-white transition-colors cursor-pointer"
                      title={allSprintSelected ? 'Deselect all in sprint' : 'Select all in sprint'}
                      aria-label={
                        allSprintSelected
                          ? `Deselect all in ${sprintName}`
                          : `Select all in ${sprintName}`
                      }
                      data-testid={`select-all-${sprintName}`}
                    >
                      {allSprintSelected ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400" />
                      ) : someSprintSelected ? (
                        <div className="w-4 h-4 rounded border border-emerald-500/50 bg-emerald-950 flex items-center justify-center">
                          <span className="w-2 h-0.5 bg-emerald-400" />
                        </div>
                      ) : (
                        <Square className="w-4 h-4 text-slate-600 hover:text-slate-400" />
                      )}
                    </button>
                  )}

                  <span
                    className={`w-2.5 h-2.5 rounded-full ${
                      sprintDef?.status === 'completed'
                        ? 'bg-purple-400'
                        : sprintDef?.status === 'active' || isCurrent
                        ? 'bg-emerald-400'
                        : 'bg-slate-500'
                    }`}
                  />

                  <h4 className="text-base font-semibold text-white">
                    <span>{sprintName}</span>
                  </h4>

                  {(() => {
                    const canonicalStatus = sprintDef?.status || (isCurrent ? 'active' : 'planned');
                    const badge = getSprintStatusBadge(canonicalStatus);
                    return (
                      <span
                        data-testid={`sprint-status-badge-${sprintName}`}
                        className={`text-[10px] px-2 py-0.5 rounded-full font-medium border capitalize ${badge.bg} ${badge.text} ${badge.border}`}
                      >
                        {canonicalStatus}
                      </span>
                    );
                  })()}

                  {sprintDef && (sprintDef.start_date || sprintDef.end_date) && (
                    <span className="text-xs text-slate-400 flex items-center space-x-1 font-mono">
                      <Clock className="w-3 h-3 text-slate-500" />
                      <span>{formatSprintDateRange(sprintDef.start_date, sprintDef.end_date)}</span>
                    </span>
                  )}

                  <span
                    className="text-xs px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300 font-mono font-medium"
                    data-testid={`sprint-points-${sprintName}`}
                  >
                    {sprintItems.length} {sprintItems.length === 1 ? 'item' : 'items'}
                    {totalPoints > 0 ? ` · ${totalPoints} pts ${pointMode === 'macro' ? 'roadmap capacity' : 'true burn'}` : ''}
                  </span>
                </div>

                <div className="flex items-center">
                  {(() => {
                    const segs = projectSettings.statuses
                      .map((st) => {
                        const count = sprintItems.filter(
                          (it) => (it.status || '').toLowerCase().trim() === st.id.toLowerCase()
                        ).length;
                        const pct = sprintItems.length > 0 ? Math.round((count / sprintItems.length) * 100) : 0;
                        return { id: st.id, label: st.label, color: st.color, count, pct };
                      })
                      .filter((s) => s.count > 0);

                    return (
                      <SprintProgressBar
                        progressPct={progressPct}
                        segments={segs}
                        isCompletedSprint={isCompletedSprint}
                        goal={sprintDef?.goal || undefined}
                        onOpenChange={(isOpen) =>
                          setActiveSprintPopover(isOpen ? sprintName : null)
                        }
                        completedStatusIds={completionSet}
                      />
                    );
                  })()}
                </div>
              </div>

              {!isCollapsed && (
                <div className="divide-y divide-slate-800/50">
                  {sprintItems.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500 italic">
                      No stories or tasks in {sprintName}. Allocate backlog items below.
                    </div>
                  ) : sprintViewMode === 'tree' ? (
                    buildTree(sprintItems, null, 0, new Set(), sprintComparator).map((node) => renderSprintTreeNode(node))
                  ) : (
                    sprintItems.map((item) => {
                      const isImmutable =
                        isItemImmutableDueToCompletedSprint(item, projectSettings) || isReadOnly;
                      return (
                        <SprintItemRow
                          key={item.id}
                          item={item}
                          isSelected={selectedItemIds.has(item.id)}
                          onToggleSelect={(id, e) =>
                            handleToggleSelectItem(id, e, sprintItems)
                          }
                          isImmutable={isImmutable}
                          onEditItem={setEditingItem}
                          getItemHierarchy={getItemHierarchy}
                          getItemStatuses={getItemStatuses}
                          deviations={deviations}
                          onOpenReconciliation={(dev) => {
                            setFocusedDeviationId(dev?.id || null);
                            setIsReconciliationModalOpen(true);
                          }}
                          isAllProjects={isAllProjects}
                          allProjects={allProjects}
                          onUpdateStatus={handleUpdateStatus}
                          onUpdateSprint={handleUpdateItemSprint}
                          availableSprints={availableSprints}
                          currentSprintName={sprintName}
                          isTreeMode={false}
                        />
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })}

        {/* Unplanned Backlog Swimlane */}
        {(() => {
          const rawBacklogItems = items.filter(
            (it) =>
              !it.metadata?.sprint ||
              String(it.metadata.sprint).trim().toLowerCase() === 'unplanned' ||
              String(it.metadata.sprint).trim() === ''
          );
          const backlogItems = filterSprintItems(rawBacklogItems);
          const backlogLeafPoints = calculateSprintLeafPoints(backlogItems);
          const backlogMacroPoints = calculateSprintMacroPoints(backlogItems);
          const effectiveBacklogPoints = pointMode === 'macro' ? backlogMacroPoints : backlogLeafPoints;
          const backlogPoints = effectiveBacklogPoints;
          const isBacklogCollapsed = collapsedSprints.has('__backlog__');
          const allBacklogSelected =
            backlogItems.length > 0 &&
            backlogItems.every((it) => selectedItemIds.has(it.id));
          const someBacklogSelected =
            !allBacklogSelected && backlogItems.some((it) => selectedItemIds.has(it.id));

          const renderBacklogTreeNode = (node: WorkItemNode, depth = 0): React.ReactNode => {
            const childCount = (node.children || []).length;
            const getSubtreePoints = (n: WorkItemNode): number => {
              const children = n.children || [];
              if (children.length === 0) {
                return Number(n.metadata?.story_points ?? n.metadata?.points ?? n.metadata?.estimate ?? 0) || 0;
              }
              let sum = 0;
              for (const c of children) {
                sum += getSubtreePoints(c);
              }
              return sum;
            };
            const rollupPoints = childCount > 0 ? getSubtreePoints(node) : 0;
            const isImmutable = isItemImmutableDueToCompletedSprint(node, projectSettings) || isReadOnly;
            const descendantIds = getDescendantIds(items, node.id);
            const selectedDescendantsCount = descendantIds.filter((id) => selectedItemIds.has(id)).length;
            const isNodeSelected = selectedItemIds.has(node.id);
            const isNodeIndeterminate = !isNodeSelected && selectedDescendantsCount > 0;

            return (
              <React.Fragment key={node.id}>
                <SprintItemRow
                  item={node}
                  depth={depth}
                  isSelected={isNodeSelected}
                  isIndeterminate={isNodeIndeterminate}
                  onToggleSelect={(id, e) => handleToggleSelectItem(id, e, backlogItems, true)}
                  isImmutable={isImmutable}
                  onEditItem={setEditingItem}
                  getItemHierarchy={getItemHierarchy}
                  getItemStatuses={getItemStatuses}
                  deviations={deviations}
                  onOpenReconciliation={(dev) => {
                    setFocusedDeviationId(dev?.id || null);
                    setIsReconciliationModalOpen(true);
                  }}
                  isAllProjects={isAllProjects}
                  allProjects={allProjects}
                  onUpdateStatus={handleUpdateStatus}
                  onUpdateSprint={handleUpdateItemSprint}
                  availableSprints={availableSprints}
                  currentSprintName="__none__"
                  isTreeMode={true}
                  childCount={childCount}
                  rollupPoints={rollupPoints}
                  pointMode={pointMode}
                />
                {(node.children || []).map((child) => renderBacklogTreeNode(child, depth + 1))}
              </React.Fragment>
            );
          };

          return (
            <div
              className="rounded-xl bg-slate-900/40 border border-slate-800/80 overflow-hidden shadow-sm"
              data-testid="backlog-swimlane"
            >
              <div className="p-4 bg-slate-950/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center space-x-3">
                  <button
                    type="button"
                    onClick={() => toggleSprintCollapse('__backlog__')}
                    className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800/50 transition-colors cursor-pointer"
                    data-testid="collapse-toggle-backlog"
                    aria-label={isBacklogCollapsed ? 'Expand Backlog' : 'Collapse Backlog'}
                  >
                    {isBacklogCollapsed ? (
                      <ChevronRight className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>

                  {!isReadOnly && (
                    <button
                      type="button"
                      onClick={() => handleSelectAllInPool(backlogItems)}
                      className="p-1 text-slate-500 hover:text-white transition-colors cursor-pointer"
                      title={allBacklogSelected ? 'Deselect all in backlog' : 'Select all in backlog'}
                      aria-label={allBacklogSelected ? 'Deselect all in backlog' : 'Select all in backlog'}
                      data-testid="select-all-backlog"
                    >
                      {allBacklogSelected ? (
                        <CheckSquare className="w-4 h-4 text-emerald-400" />
                      ) : someBacklogSelected ? (
                        <div className="w-4 h-4 rounded border border-emerald-500/50 bg-emerald-950 flex items-center justify-center">
                          <span className="w-2 h-0.5 bg-emerald-400" />
                        </div>
                      ) : (
                        <Square className="w-4 h-4 text-slate-600 hover:text-slate-400" />
                      )}
                    </button>
                  )}

                  <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                  <h4 className="text-base font-semibold text-white">
                    Unplanned Backlog
                  </h4>
                  <span
                    className="text-xs px-2.5 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-300 font-mono font-medium"
                    data-testid="backlog-points"
                  >
                    {backlogItems.length} {backlogItems.length === 1 ? 'item' : 'items'}
                    {backlogPoints > 0
                      ? ` · ${backlogPoints} pts ${pointMode === 'macro' ? 'roadmap capacity' : 'true burn'}`
                      : ''}
                  </span>
                </div>
              </div>

              {!isBacklogCollapsed && (
                <div className="divide-y divide-slate-800/50">
                  {backlogItems.length === 0 ? (
                    <div className="p-6 text-center text-xs text-slate-500 italic">
                      Backlog is empty! All items are assigned to active sprints.
                    </div>
                  ) : sprintViewMode === 'tree' ? (
                    buildTree(backlogItems, null, 0, new Set(), sprintComparator).map((node) => renderBacklogTreeNode(node))
                  ) : (
                    backlogItems.map((item) => {
                      const isImmutable =
                        isItemImmutableDueToCompletedSprint(item, projectSettings) || isReadOnly;
                      return (
                        <SprintItemRow
                          key={item.id}
                          item={item}
                          isSelected={selectedItemIds.has(item.id)}
                          onToggleSelect={(id, e) =>
                            handleToggleSelectItem(id, e, backlogItems)
                          }
                          isImmutable={isImmutable}
                          onEditItem={setEditingItem}
                          getItemHierarchy={getItemHierarchy}
                          getItemStatuses={getItemStatuses}
                          deviations={deviations}
                          onOpenReconciliation={(dev) => {
                            setFocusedDeviationId(dev?.id || null);
                            setIsReconciliationModalOpen(true);
                          }}
                          isAllProjects={isAllProjects}
                          allProjects={allProjects}
                          onUpdateStatus={handleUpdateStatus}
                          onUpdateSprint={handleUpdateItemSprint}
                          availableSprints={availableSprints}
                          currentSprintName="__none__"
                          isTreeMode={false}
                        />
                      );
                    })
                  )}
                </div>
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}
