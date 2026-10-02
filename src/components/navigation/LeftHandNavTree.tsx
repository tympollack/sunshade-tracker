'use client';

import React, { useMemo } from 'react';
import {
  Calendar,
  FolderTree,
  ChevronsUpDown,
  ChevronsDownUp,
  X,
  Plus,
} from 'lucide-react';
import { WorkItem, SprintDefinition } from '@/types/tracker';
import { usePivotTree, PivotMode, TreeFilterScope } from '@/hooks/usePivotTree';
import { NavTreeNode } from './NavTreeNode';

export interface LeftHandNavTreeProps {
  items: WorkItem[];
  projects: Array<{ id: string; slug: string; name: string }>;
  sprints?: SprintDefinition[];
  tenantSlug: string;
  onScopeFilter?: (scope: TreeFilterScope) => void;
  onSelectItem?: (item: WorkItem) => void;
  onNewSprint?: () => void;
  className?: string;
}

export function LeftHandNavTree({
  items,
  projects,
  sprints = [],
  tenantSlug,
  onScopeFilter,
  onSelectItem,
  onNewSprint,
  className = '',
}: LeftHandNavTreeProps) {
  const {
    pivotMode,
    setPivotMode,
    treeNodes,
    activeScope,
    selectScope,
    clearScope,
    expandedNodes,
    toggleNode,
    expandAll,
    collapseAll,
  } = usePivotTree({
    items,
    projects,
    sprints,
    tenantSlug,
    onScopeFilter,
  });

  // Collect all expandable node IDs
  const allExpandableIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (nodes: typeof treeNodes) => {
      for (const n of nodes) {
        if (n.children && n.children.length > 0) {
          ids.push(n.id);
          walk(n.children);
        }
      }
    };
    walk(treeNodes);
    return ids;
  }, [treeNodes]);

  const hasActiveFilter = Boolean(
    activeScope.sprintName || activeScope.projectSlug || activeScope.itemId
  );

  return (
    <div
      data-testid="lhn-dual-pivot-tree"
      className={`flex flex-col h-full w-full bg-slate-950/80 text-slate-200 select-none ${className}`}
    >
      {/* ── Top Controls: Dual-Pivot Segmented Control ── */}
      <div className="p-2 border-b border-slate-800/80 flex flex-col gap-2 shrink-0">
        <div className="flex items-center justify-between">
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
            Hierarchy Pivot
          </span>
          {/* Cadence + Sprint button (ready for Task 5) */}
          {pivotMode === 'sprint' && onNewSprint && (
            <button
              type="button"
              onClick={onNewSprint}
              data-testid="lhn-new-sprint-btn"
              className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 transition-colors"
              title="Configure / Add new sprint"
            >
              <Plus className="w-3 h-3" />
              <span>Sprint</span>
            </button>
          )}
        </div>

        {/* Segmented Switch: Sprints (Cadence) vs Projects (Domain) */}
        <div
          role="tablist"
          aria-label="Pivot Mode"
          className="grid grid-cols-2 p-0.5 bg-slate-900 border border-slate-800 rounded-lg text-xs"
        >
          <button
            type="button"
            role="tab"
            aria-selected={pivotMode === 'sprint'}
            onClick={() => setPivotMode('sprint')}
            className={`flex items-center justify-center gap-1.5 py-1 px-2 rounded-md font-medium text-[11px] transition-all ${
              pivotMode === 'sprint'
                ? 'bg-slate-800 text-amber-300 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            <span>Sprints</span>
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={pivotMode === 'project'}
            onClick={() => setPivotMode('project')}
            className={`flex items-center justify-center gap-1.5 py-1 px-2 rounded-md font-medium text-[11px] transition-all ${
              pivotMode === 'project'
                ? 'bg-slate-800 text-blue-300 shadow-xs'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <FolderTree className="w-3.5 h-3.5" />
            <span>Projects</span>
          </button>
        </div>

        {/* Quick Toolbar: Expand / Collapse All & Active Filter Indicator */}
        <div className="flex items-center justify-between text-[10px] text-slate-500 px-0.5">
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => expandAll(allExpandableIds)}
              className="hover:text-slate-300 flex items-center gap-0.5 p-0.5"
              title="Expand All"
              aria-label="Expand All"
            >
              <ChevronsUpDown className="w-3 h-3" />
              <span>Expand</span>
            </button>
            <span>•</span>
            <button
              type="button"
              onClick={collapseAll}
              className="hover:text-slate-300 flex items-center gap-0.5 p-0.5"
              title="Collapse All"
              aria-label="Collapse All"
            >
              <ChevronsDownUp className="w-3 h-3" />
              <span>Collapse</span>
            </button>
          </div>

          {hasActiveFilter && (
            <button
              type="button"
              onClick={clearScope}
              className="flex items-center gap-0.5 text-red-400 hover:text-red-300 transition-colors"
              title="Clear Filter"
            >
              <span>Reset</span>
              <X className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* ── Active Scope Filter Banner (if filtered) ── */}
      {hasActiveFilter && (
        <div className="px-2 py-1 bg-emerald-950/40 border-b border-emerald-800/40 text-[10px] text-emerald-300 flex items-center justify-between shrink-0">
          <span className="truncate">
            Filtering:{' '}
            <strong>
              {activeScope.sprintName ||
                activeScope.projectSlug ||
                activeScope.itemId}
            </strong>
          </span>
          <button
            type="button"
            onClick={clearScope}
            className="hover:text-emerald-100 p-0.5"
            aria-label="Clear active filter"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* ── Recursive File-Tree Stage ── */}
      <div
        role="tree"
        aria-label="Work Items File Tree"
        className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5"
      >
        {treeNodes.length === 0 ? (
          <div className="text-center py-6 text-slate-500 text-xs">
            No items in workspace
          </div>
        ) : (
          treeNodes.map((node) => (
            <NavTreeNode
              key={node.id}
              node={node}
              depth={0}
              isExpanded={expandedNodes.has(node.id)}
              onToggle={toggleNode}
              activeScope={activeScope}
              onSelectScope={selectScope}
              onSelectItem={onSelectItem}
              expandedNodes={expandedNodes}
            />
          ))
        )}
      </div>
    </div>
  );
}
