'use client';

import React from 'react';
import { WorkItemNode, WorkItem, StatusDefinition, HierarchyLevel } from '@/types/tracker';
import { SchemaDeviation } from '@/lib/schema-deviation';
import { TreeNode } from '@/components/TreeNode';
import { PointModeSwitcher } from '@/components/PointModeSwitcher';
import { FilterMultiSelect } from '@/components/FilterMultiSelect';

export interface HierarchyTreeProps {
  tree: WorkItemNode[];
  pointMode: 'macro' | 'granular';
  onPointModeChange: (mode: 'macro' | 'granular') => void;
  statuses?: StatusDefinition[];
  hierarchy?: HierarchyLevel[];
  getItemStatuses?: (item: WorkItemNode) => StatusDefinition[];
  getItemHierarchy?: (item: WorkItemNode) => HierarchyLevel[];
  isFilteredBySprint?: boolean;
  members?: Array<{ id: string; name: string }>;
  isImmutable?: boolean | ((item: WorkItemNode) => boolean);
  collapsedNodeIds?: Set<string>;
  onToggleCollapse?: (nodeId: string) => void;
  onExpandAll?: () => void;
  onCollapseAll?: () => void;
  onUpdateStatus?: (itemId: string, newStatus: string) => Promise<void> | void;
  onUpdateAssignee?: (itemId: string, newAssignee: string | null) => Promise<void> | void;
  onCreateChild?: (parentId: string, title: string, itemType: string) => Promise<void> | void;
  onReparentItem?: (
    draggedId: string,
    targetId: string | null,
    position: 'inside' | 'before' | 'after'
  ) => Promise<void> | void;
  onEditItem?: (item: WorkItem) => void;
  deviations?: SchemaDeviation[];
  onOpenReconciliation?: (deviation?: SchemaDeviation) => void;
  className?: string;
}

/**
 * Hierarchy Tree component integrating toolbar controls, PointModeSwitcher,
 * and recursive TreeNode rendering (FEAT-TRK-MACRO-VS-LEAF-VIEW-TOGGLE).
 */
export const HierarchyTree: React.FC<HierarchyTreeProps> = ({
  tree,
  pointMode,
  onPointModeChange,
  statuses = [],
  hierarchy = [],
  getItemStatuses,
  getItemHierarchy,
  isFilteredBySprint = false,
  members = [],
  isImmutable = false,
  collapsedNodeIds,
  onToggleCollapse,
  onExpandAll,
  onCollapseAll,
  onUpdateStatus,
  onUpdateAssignee,
  onCreateChild,
  onReparentItem,
  onEditItem,
  deviations = [],
  onOpenReconciliation,
  className = '',
}) => {
  return (
    <div data-testid="hierarchy-tree-view" className={`space-y-4 ${className}`}>
      {/* Top Tree Controls Toolbar */}
      <div
        data-testid="hierarchy-tree-toolbar"
        className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800"
      >
        <div className="flex items-center space-x-2">
          {onExpandAll && (
            <button
              type="button"
              onClick={onExpandAll}
              className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              data-testid="tree-expand-all-btn"
            >
              Expand All
            </button>
          )}
          {onCollapseAll && (
            <button
              type="button"
              onClick={onCollapseAll}
              className="text-xs px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
              data-testid="tree-collapse-all-btn"
            >
              Collapse All
            </button>
          )}
        </div>

        {/* Point Calculation Mode Switcher */}
        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-400 font-medium">Point Mode:</span>
          <PointModeSwitcher mode={pointMode} onChange={onPointModeChange} />
        </div>
      </div>

      {/* Tree Nodes List */}
      <div className="space-y-1">
        {tree.length === 0 ? (
          <div className="p-8 text-center text-slate-500 text-sm border border-dashed border-slate-800 rounded-xl">
            No work items match the active hierarchy filters.
          </div>
        ) : (
          tree.map((rootNode, index) => (
            <TreeNode
              key={rootNode.id}
              item={rootNode}
              pointMode={pointMode}
              statuses={statuses}
              hierarchy={hierarchy}
              getItemStatuses={getItemStatuses}
              getItemHierarchy={getItemHierarchy}
              isFilteredBySprint={isFilteredBySprint}
              members={members}
              isImmutable={isImmutable}
              collapsedNodeIds={collapsedNodeIds}
              onToggleCollapse={onToggleCollapse}
              onUpdateStatus={onUpdateStatus}
              onUpdateAssignee={onUpdateAssignee}
              onCreateChild={onCreateChild}
              onReparentItem={onReparentItem}
              onEditItem={onEditItem}
              deviations={deviations}
              onOpenReconciliation={onOpenReconciliation}
              isLastChild={index === tree.length - 1}
            />
          ))
        )}
      </div>
    </div>
  );
};

