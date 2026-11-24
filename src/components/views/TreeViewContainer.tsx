'use client';

import React from 'react';
import { WorkItem, WorkItemNode, ProjectSettings, StatusDefinition, HierarchyLevel, SprintDefinition, getWorkMetricConfig } from '@/types/tracker';
import { FilterMultiSelect, FilterOption } from '@/components/FilterMultiSelect';
import { PointModeSwitcher } from '@/components/PointModeSwitcher';
import { TreeNode, TreeChildDraft } from '@/components/TreeNode';
import { StickyTreeProjectHeader } from '@/components/tree/StickyTreeProjectHeader';
import { RowColumnsPicker } from '@/components/common/RowColumnsPicker';
import { RowColumnHeader } from '@/components/common/RowColumnHeader';
import { useRowColumns } from '@/hooks/useRowColumns';
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
  isAllProjects?: boolean;
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
  availableSprintDefs?: SprintDefinition[];
  tenantSlug?: string;
  projectSlug?: string;
  allProjects?: Array<{ id: string; slug?: string; name: string; settings?: any }>;
}

export function TreeViewContainer(props: TreeViewContainerProps) {
  const {
    handleExpandAllTreeNodes,
    handleCollapseAllTreeNodes,
    selectedSprint,
    setSelectedSprint,
    availableSprints,
    availableSprintDefs = [],
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
    isAllProjects = false,
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
    tenantSlug = 'default',
    projectSlug = 'default',
    allProjects = [],
  } = props;

  const rowColumns = useRowColumns(projectSettings, 'tree', projectSlug, items, tenantSlug);
  const [childDrafts, setChildDrafts] = React.useState<Record<string, TreeChildDraft>>({});

  const handleChangeChildDraft = React.useCallback(
    (
      parentId: string,
      updater: (prev: TreeChildDraft | undefined) => TreeChildDraft | undefined
    ) => {
      setChildDrafts((prev) => {
        const nextDraft = updater(prev[parentId]);
        if (!nextDraft) {
          if (!(parentId in prev)) return prev;
          const copy = { ...prev };
          delete copy[parentId];
          return copy;
        }
        return { ...prev, [parentId]: nextDraft };
      });
    },
    []
  );

  const projectGroups = React.useMemo(() => {
    if (treeItems.length === 0) return [];
    const resolveProj = (projectId?: string | null) =>
      allProjects.find((p) => p.id === projectId || p.slug === projectId);

    if (isAllProjects) {
      const groups: Array<{
        key: string;
        projectId: string | null | undefined;
        projectName: string;
        nodes: WorkItemNode[];
        rollupPoints: number;
      }> = [];
      const occurrenceByProject = new Map<string, number>();

      treeItems.forEach((node) => {
        const prevGroup = groups[groups.length - 1];
        if (prevGroup && prevGroup.projectId === node.project_id) {
          prevGroup.nodes.push(node);
          prevGroup.rollupPoints += node.rollupPoints ?? 0;
        } else {
          const proj = resolveProj(node.project_id);
          const projKey = node.project_id || 'unknown';
          const occ = (occurrenceByProject.get(projKey) || 0) + 1;
          occurrenceByProject.set(projKey, occ);
          groups.push({
            key: `${projKey}#${occ}`,
            projectId: node.project_id,
            projectName: proj?.name || 'Project',
            nodes: [node],
            rollupPoints: node.rollupPoints ?? 0,
          });
        }
      });
      return groups;
    }

    const currentProject = allProjects.find(
      (p) => p.slug === projectSlug || p.id === projectSlug
    );
    if (currentProject) {
      return [
        {
          key: currentProject.id,
          projectId: currentProject.id,
          projectName: currentProject.name,
          nodes: treeItems,
          rollupPoints: treeItems.reduce((sum, n) => sum + (n.rollupPoints ?? 0), 0),
        },
      ];
    }

    return [
      {
        key: 'default-group',
        projectId: null,
        projectName: '',
        nodes: treeItems,
        rollupPoints: 0,
      },
    ];
  }, [treeItems, isAllProjects, allProjects, projectSlug]);

  const showStickyProjectHeaders =
    isAllProjects ||
    Boolean(allProjects.find((p) => p.slug === projectSlug || p.id === projectSlug));

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
              {isAllProjects && (
                <>
                  <option value="project_asc">Project (A to Z)</option>
                  <option value="project_desc">Project (Z to A)</option>
                </>
              )}
            </select>
          </div>
          <PointModeSwitcher mode={pointMode} onChange={handlePointModeChange} />
          <RowColumnsPicker
            view="tree"
            availableColumns={rowColumns.availableColumns}
            effectiveColumns={rowColumns.effectiveColumns}
            activeKeys={rowColumns.activeKeys}
            isCustomized={rowColumns.isCustomized}
            onToggleColumn={rowColumns.toggleColumn}
            onMoveColumn={rowColumns.moveColumn}
            onResetToSchema={rowColumns.resetToSchema}
          />
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

      <div className="pt-2 max-w-full overflow-x-auto custom-scrollbar pb-2 touch-pan-x touch-pan-y touch-pinch-zoom md:overflow-x-clip" data-testid="tree-scroll-container">
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

          {!loading && items.length > 0 && treeItems.length > 0 && (
            <RowColumnHeader
              columns={rowColumns.effectiveColumns}
              actionsWidthClass="w-14"
              leftIndentPaddingClass="pl-8"
              testId="tree-column-header"
              className="rounded-lg border border-slate-800/70"
            />
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
            projectGroups.map((group) => (
              <section
                key={group.key}
                data-testid={
                  showStickyProjectHeaders
                    ? `tree-project-group-${group.projectId || 'unknown'}`
                    : undefined
                }
                className="space-y-1"
              >
                {showStickyProjectHeaders && (
                  <StickyTreeProjectHeader
                    projectId={group.projectId}
                    projectName={group.projectName}
                    itemCount={group.nodes.length}
                    rollupPoints={group.rollupPoints}
                    unitLabel={
                      getWorkMetricConfig(
                        (group.nodes[0] && getItemProjectSettings(group.nodes[0])) || projectSettings
                      ).unit_label || 'pts'
                    }
                  />
                )}
                {group.nodes.map((rootNode, idx) => (
                  <TreeNode
                    key={rootNode.id}
                    item={rootNode}
                    isLastChild={idx === group.nodes.length - 1}
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
                    isImmutable={(it) =>
                      isReadOnly ||
                      isItemImmutableDueToCompletedSprint(
                        it,
                        getItemProjectSettings(it),
                        availableSprintDefs
                      )
                    }
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
                    unit={
                      getWorkMetricConfig(getItemProjectSettings(rootNode) || projectSettings)
                        .unit_label || 'pts'
                    }
                    projectSettings={getItemProjectSettings(rootNode) || projectSettings}
                    visibleColumns={rowColumns.effectiveColumns}
                    allProjects={allProjects}
                    stickyTopOffset={showStickyProjectHeaders ? 'top-9' : 'top-0'}
                    childDrafts={childDrafts}
                    onChangeChildDraft={handleChangeChildDraft}
                  />
                ))}
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
