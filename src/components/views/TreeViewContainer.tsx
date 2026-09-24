'use client';

import React from 'react';
import { WorkItem, WorkItemNode, ProjectSettings, StatusDefinition, HierarchyLevel } from '@/types/tracker';
import { FilterMultiSelect, FilterOption } from '@/components/FilterMultiSelect';
import { PointModeSwitcher } from '@/components/PointModeSwitcher';
import { TreeNode } from '@/components/TreeNode';
import { SchemaDeviation } from '@/lib/schema-deviation';
import { isItemImmutableDueToCompletedSprint } from '@/lib/sprint-utils';

export interface TreeViewContainerProps {
  handleExpandAllTreeNodes: () => void;
  handleCollapseAllTreeNodes: () => void;
  selectedSprint: string;
  setSelectedSprint: (val: string) => void;
  availableSprints: string[];
  statusFilterOptions: FilterOption[];
  effectiveTreeStatuses: string[];
  setTreeSelectedStatuses: (val: string[] | null) => void;
  levelFilterOptions: FilterOption[];
  effectiveTreeLevels: string[];
  setTreeSelectedLevels: (val: string[] | null) => void;
  assigneeFilterOptions: FilterOption[];
  effectiveTreeAssignees: string[];
  setTreeSelectedAssignees: (val: string[] | null) => void;
  treeSortBy: string;
  setTreeSortBy: (val: string) => void;
  pointMode: 'macro' | 'granular';
  handlePointModeChange: (mode: 'macro' | 'granular') => void;
  treeFilteredItems: WorkItem[];
  projectSettings: ProjectSettings;
  isReadOnly: boolean;
  loading: boolean;
  items: WorkItem[];
  treeItems: WorkItemNode[];
  isTreeRootOver: boolean;
  setIsTreeRootOver: (val: boolean) => void;
  treeDraggedItemId: string | null;
  setTreeDraggedItemId: (id: string | null) => void;
  handleTreeReparent: (draggedId: string, targetId: string | null, position: 'before' | 'after' | 'inside') => Promise<void>;
  getStatusColor: (statusName: string, itemStatuses?: StatusDefinition[]) => string;
  deviations: SchemaDeviation[];
  onOpenReconciliation: (dev?: SchemaDeviation) => void;
  getItemStatuses: (item: WorkItem) => StatusDefinition[];
  getItemHierarchy: (item: WorkItem) => HierarchyLevel[];
  workspaceMembers: { user_id: string; full_name: string; email?: string }[];
  getItemProjectSettings: (item: WorkItem) => ProjectSettings;
  collapsedTreeNodes: Set<string>;
  handleToggleCollapseTreeNode: (nodeId: string) => void;
  handleUpdateStatus: (itemId: string, newStatus: string) => Promise<void> | void;
  handleTreeUpdateAssignee: (itemId: string, assignee: string | null) => Promise<void> | void;
  handleTreeCreateChild: (parentId: string, title: string, itemType: string) => Promise<void> | void;
  setEditingItem: (item: WorkItem) => void;
}

export function TreeViewContainer(props: TreeViewContainerProps) {
  const {
    handleExpandAllTreeNodes,
    handleCollapseAllTreeNodes,
    selectedSprint,
    setSelectedSprint,
    availableSprints,
    statusFilterOptions,
    effectiveTreeStatuses,
    setTreeSelectedStatuses,
    levelFilterOptions,
    effectiveTreeLevels,
    setTreeSelectedLevels,
    assigneeFilterOptions,
    effectiveTreeAssignees,
    setTreeSelectedAssignees,
    treeSortBy,
    setTreeSortBy,
    pointMode,
    handlePointModeChange,
    treeFilteredItems,
    projectSettings,
    isReadOnly,
    loading,
    items,
    treeItems,
    isTreeRootOver,
    setIsTreeRootOver,
    treeDraggedItemId,
    setTreeDraggedItemId,
    handleTreeReparent,
    getStatusColor,
    deviations,
    onOpenReconciliation,
    getItemStatuses,
    getItemHierarchy,
    workspaceMembers,
    getItemProjectSettings,
    collapsedTreeNodes,
    handleToggleCollapseTreeNode,
    handleUpdateStatus,
    handleTreeUpdateAssignee,
    handleTreeCreateChild,
    setEditingItem,
  } = props;

  return (
    <div className="p-3 sm:p-4 md:p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-4 max-w-full">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-[240px] flex-1">
          <h3 className="text-lg font-semibold text-white">Hierarchical Tree Structure</h3>
          <p className="text-xs text-slate-400">
            Recursive tree representation showing parent-child links resolved from dynamic schema rules.
          </p>
        </div>
        <div className="flex items-center flex-wrap gap-2 sm:gap-3 min-w-0">
          <div className="flex items-center space-x-1.5 border-r border-slate-800 pr-3">
            <button
              type="button"
              onClick={handleExpandAllTreeNodes}
              className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              data-testid="tree-expand-all-btn"
            >
              Expand All
            </button>
            <button
              type="button"
              onClick={handleCollapseAllTreeNodes}
              className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              data-testid="tree-collapse-all-btn"
            >
              Collapse All
            </button>
          </div>
          <div className="flex items-center space-x-1.5">
            <span className="text-xs text-slate-400">Sprint:</span>
            <select
              value={selectedSprint}
              onChange={(e) => setSelectedSprint(e.target.value)}
              className="text-xs bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
              data-testid="tree-sprint-filter"
            >
              <option value="all">All Sprints</option>
              <option value="__none__">Backlog (Unassigned)</option>
              {availableSprints.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <FilterMultiSelect
            label="Status"
            options={statusFilterOptions}
            selectedIds={effectiveTreeStatuses}
            onChange={setTreeSelectedStatuses}
          />
          <FilterMultiSelect
            label="Level"
            options={levelFilterOptions}
            selectedIds={effectiveTreeLevels}
            onChange={setTreeSelectedLevels}
          />
          <FilterMultiSelect
            label="Assignee"
            options={assigneeFilterOptions}
            selectedIds={effectiveTreeAssignees}
            onChange={setTreeSelectedAssignees}
          />
          <div className="flex items-center space-x-1.5">
            <span className="text-xs text-slate-400">Sort:</span>
            <select
              value={treeSortBy}
              onChange={(e) => setTreeSortBy(e.target.value)}
              className="text-xs bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
              data-testid="tree-sort-by"
            >
              <option value="order_index">Manual (Order)</option>
              <option value="points_desc">Points (High to Low)</option>
              <option value="points_asc">Points (Low to High)</option>
              <option value="title_asc">Title (A to Z)</option>
              <option value="title_desc">Title (Z to A)</option>
            </select>
          </div>
          <PointModeSwitcher mode={pointMode} onChange={handlePointModeChange} />
          {(selectedSprint !== 'all' ||
            effectiveTreeStatuses.length < projectSettings.statuses.length ||
            effectiveTreeLevels.length < projectSettings.hierarchy.length ||
            effectiveTreeAssignees.length > 0 ||
            treeSortBy !== 'order_index') && (
            <button
              type="button"
              onClick={() => {
                setSelectedSprint('all');
                setTreeSelectedStatuses(null);
                setTreeSelectedLevels(null);
                setTreeSelectedAssignees(null);
                setTreeSortBy('order_index');
              }}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium px-2 py-1 rounded hover:bg-slate-800 transition-colors cursor-pointer"
              data-testid="tree-reset-filters-btn"
            >
              Reset
            </button>
          )}
          <span className="text-xs font-mono text-emerald-400 whitespace-nowrap shrink-0">
            Total Items: {treeFilteredItems.length}
          </span>
        </div>
      </div>

      <div className="pt-2 max-w-full overflow-x-auto custom-scrollbar pb-2 touch-pan-x" data-testid="tree-scroll-container">
        <div className="space-y-3 min-w-[600px] md:min-w-0 w-full">
          {/* Root Drop Zone for unnesting */}
          {!isReadOnly && (
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                setIsTreeRootOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setIsTreeRootOver(false);
              }}
              onDrop={async (e) => {
                e.preventDefault();
                setIsTreeRootOver(false);
                const draggedId = e.dataTransfer.getData('text/plain') || treeDraggedItemId;
                if (!draggedId) return;
                await handleTreeReparent(draggedId, null, 'inside');
              }}
              data-testid="tree-root-drop-zone"
              className={`p-3 rounded-lg border-2 border-dashed transition-all text-center text-xs font-medium cursor-pointer ${
                isTreeRootOver
                  ? 'border-emerald-400 bg-emerald-950/40 text-emerald-300 shadow-md shadow-emerald-500/10'
                  : treeDraggedItemId
                  ? 'border-slate-700 bg-slate-900/40 text-slate-400 hover:border-emerald-500/50 hover:text-slate-300'
                  : 'border-slate-800/60 bg-slate-950/30 text-slate-500'
              }`}
            >
              <span>
                {isTreeRootOver
                  ? 'Drop to move to root level (unnest)'
                  : 'Drag items here to unnest to root level'}
              </span>
            </div>
          )}

          {loading ? (
            Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-14 rounded-lg bg-slate-950 border border-slate-800 animate-pulse" />
            ))
          ) : items.length === 0 ? (
            <div className="text-center py-12 text-slate-500 text-sm">
              No items in project. Ingest work items using Gemini Spark or the quick add form.
            </div>
          ) : (
            treeItems.map((rootNode, idx) => (
              <TreeNode
                key={rootNode.id}
                item={rootNode}
                isLastChild={idx === treeItems.length - 1}
                ancestorRails={[]}
                getStatusColor={getStatusColor}
                deviations={deviations}
                onOpenReconciliation={(dev) => onOpenReconciliation(dev)}
                statuses={getItemStatuses(rootNode)}
                hierarchy={getItemHierarchy(rootNode)}
                getItemStatuses={getItemStatuses}
                getItemHierarchy={getItemHierarchy}
                isFilteredBySprint={selectedSprint !== 'all'}
                pointMode={pointMode}
                members={workspaceMembers.map((m) => ({ id: m.user_id, name: m.full_name }))}
                isImmutable={(it) => isReadOnly || isItemImmutableDueToCompletedSprint(it, getItemProjectSettings(it))}
                collapsedNodeIds={collapsedTreeNodes}
                onToggleCollapse={handleToggleCollapseTreeNode}
                onUpdateStatus={handleUpdateStatus}
                onUpdateAssignee={handleTreeUpdateAssignee}
                onCreateChild={handleTreeCreateChild}
                onReparentItem={handleTreeReparent}
                onEditItem={(item) => setEditingItem(item)}
                isDraggingItemId={treeDraggedItemId}
                onDragStartNode={(e, item) => !isReadOnly && setTreeDraggedItemId(item.id)}
                onDragEndNode={() => setTreeDraggedItemId(null)}
              />
            ))
          )}
        </div>
      </div>
    </div>
  );
}
