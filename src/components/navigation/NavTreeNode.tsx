'use client';

import React from 'react';
import { ChevronDown, ChevronRight, Calendar, Folder, FileText, CheckCircle2, Settings } from 'lucide-react';
import { PivotTreeNode, TreeFilterScope } from '@/hooks/usePivotTree';
import { WorkItem } from '@/types/tracker';

export interface NavTreeNodeProps {
  node: PivotTreeNode;
  depth?: number;
  isExpanded: boolean;
  onToggle: (id: string) => void;
  activeScope?: TreeFilterScope;
  onSelectScope?: (scope: TreeFilterScope) => void;
  onSelectItem?: (item: WorkItem) => void;
  onSelectSprint?: (sprintName: string) => void;
  expandedNodes: Set<string>;
}

export function NavTreeNode({
  node,
  depth = 0,
  isExpanded,
  onToggle,
  activeScope,
  onSelectScope,
  onSelectItem,
  onSelectSprint,
  expandedNodes,
}: NavTreeNodeProps) {
  const hasChildren = node.children && node.children.length > 0;

  // Determine whether this node is currently active in filter scope
  const isSelected = Boolean(
    (node.type === 'sprint' && activeScope?.sprintName === node.sprintName && !activeScope?.projectSlug && !activeScope?.itemId) ||
    (node.type === 'project' && activeScope?.projectSlug === node.projectSlug && !activeScope?.itemId) ||
    (node.type === 'item' && activeScope?.itemId === node.item?.id)
  );

  const handleClickRow = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.type === 'item' && node.item) {
      if (onSelectItem) {
        onSelectItem(node.item);
      }
      if (onSelectScope) {
        onSelectScope({
          sprintName: node.sprintName,
          projectSlug: node.projectSlug,
          itemId: node.item.id,
        });
      }
    } else if (node.type === 'sprint') {
      if (onSelectScope) {
        onSelectScope({
          sprintName: node.sprintName,
          projectSlug: node.projectSlug,
        });
      }
      if (hasChildren) {
        onToggle(node.id);
      }
    } else if (node.type === 'project') {
      if (onSelectScope) {
        onSelectScope({
          sprintName: node.sprintName,
          projectSlug: node.projectSlug,
        });
      }
      if (hasChildren) {
        onToggle(node.id);
      }
    }
  };

  const handleToggleIcon = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (hasChildren) {
      onToggle(node.id);
    }
  };

  const renderIcon = () => {
    if (node.type === 'sprint') {
      return <Calendar className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
    }
    if (node.type === 'project') {
      return <Folder className="w-3.5 h-3.5 text-blue-400 shrink-0" />;
    }
    if (node.status === 'done' || node.status === 'completed' || node.status === 'shipped') {
      return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
    }
    return <FileText className="w-3.5 h-3.5 text-slate-400 shrink-0" />;
  };

  return (
    <div className="flex flex-col select-none group/node">
      {/* Node Row */}
      <div
        role="treeitem"
        aria-expanded={hasChildren ? isExpanded : undefined}
        aria-selected={isSelected}
        onClick={handleClickRow}
        className={`flex items-center gap-1.5 py-1 px-1.5 rounded-md text-xs cursor-pointer transition-colors min-w-0 ${
          isSelected
            ? 'bg-emerald-500/15 text-emerald-300 font-medium border border-emerald-500/30'
            : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
        }`}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        {/* Disclosure Toggle Arrow */}
        <button
          type="button"
          onClick={handleToggleIcon}
          className={`p-0.5 rounded hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 transition-colors shrink-0 ${
            !hasChildren ? 'opacity-0 cursor-default pointer-events-none' : ''
          }`}
          aria-label={isExpanded ? 'Collapse' : 'Expand'}
        >
          {isExpanded ? (
            <ChevronDown className="w-3.5 h-3.5" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5" />
          )}
        </button>

        {/* Node Type Icon */}
        {renderIcon()}

        {/* Node Title with Truncation */}
        <span className="truncate min-w-0 flex-1 font-mono tracking-tight text-[11px]" title={node.title}>
          {node.title}
        </span>

        {/* Sprint Status Badge */}
        {node.badge && (
          <span
            className={`text-[9px] font-medium px-1.5 py-0.2 rounded shrink-0 uppercase tracking-wider ${
              node.badge === 'Active'
                ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                : node.badge === 'Planned'
                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                : 'bg-slate-800 text-slate-400'
            }`}
          >
            {node.badge}
          </span>
        )}

        {/* Nested Child Count Badge */}
        {node.childCount > 0 && node.type !== 'item' && (
          <span
            className="text-[10px] text-slate-500 bg-slate-900 px-1 py-0.2 rounded border border-slate-800 shrink-0 font-mono"
            title={`${node.childCount} items`}
          >
            {node.childCount}
          </span>
        )}

        {/* Story Point Rollup Badge */}
        {node.rollupPoints > 0 && (
          <span
            className="text-[10px] font-medium text-emerald-400/90 bg-emerald-950/40 px-1 py-0.2 rounded border border-emerald-800/40 shrink-0 font-mono"
            title={`${node.rollupPoints} story points`}
          >
            {node.rollupPoints} pts
          </span>
        )}

        {/* Sprint Lifecycle Inspector Trigger */}
        {node.type === 'sprint' && onSelectSprint && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelectSprint(node.sprintName || node.title);
            }}
            className="p-0.5 rounded text-slate-500 hover:text-amber-300 hover:bg-slate-800 shrink-0 transition-colors"
            title="Open Sprint Lifecycle Settings"
            aria-label="Sprint Settings"
          >
            <Settings className="w-3 h-3" />
          </button>
        )}
      </div>

      {/* Children branches with continuous guideline */}
      {hasChildren && isExpanded && (
        <div
          role="group"
          className="flex flex-col relative ml-1 border-l border-slate-800/80 my-0.5"
        >
          {node.children.map((child) => (
            <NavTreeNode
              key={child.id}
              node={child}
              depth={depth + 1}
              isExpanded={expandedNodes.has(child.id)}
              onToggle={onToggle}
              activeScope={activeScope}
              onSelectScope={onSelectScope}
              onSelectItem={onSelectItem}
              onSelectSprint={onSelectSprint}
              expandedNodes={expandedNodes}
            />
          ))}
        </div>
      )}
    </div>
  );
}
