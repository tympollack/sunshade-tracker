'use client';

import React, { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ChevronRight,
  Plus,
  User,
  GripVertical,
  Lock,
  Pencil,
} from 'lucide-react';
import { WorkItem, WorkItemNode, StatusDefinition, HierarchyLevel } from '@/types/tracker';
import { SchemaDeviation } from '@/lib/schema-deviation';

export interface TreeNodeProps {
  item: WorkItemNode;
  getStatusColor?: (status: string) => string;
  deviations?: SchemaDeviation[];
  onOpenReconciliation?: (deviation?: SchemaDeviation) => void;

  // STORY-TRK-HIERARCHY-UX interactive props
  statuses?: StatusDefinition[];
  hierarchy?: HierarchyLevel[];
  getItemStatuses?: (item: WorkItemNode) => StatusDefinition[];
  getItemHierarchy?: (item: WorkItemNode) => HierarchyLevel[];
  isFilteredBySprint?: boolean;
  members?: Array<{ id: string; name: string }>;
  isImmutable?: boolean | ((item: WorkItemNode) => boolean);
  collapsedNodeIds?: Set<string>;
  onToggleCollapse?: (nodeId: string) => void;
  onUpdateStatus?: (itemId: string, newStatus: string) => Promise<void> | void;
  onUpdateAssignee?: (itemId: string, newAssignee: string | null) => Promise<void> | void;
  onCreateChild?: (parentId: string, title: string, itemType: string) => Promise<void> | void;
  onReparentItem?: (
    draggedId: string,
    targetId: string | null,
    position: 'inside' | 'before' | 'after'
  ) => Promise<void> | void;
  onEditItem?: (item: WorkItem) => void;
  isDraggingItemId?: string | null;
  onDragStartNode?: (e: React.DragEvent, item: WorkItemNode) => void;
  onDragEndNode?: () => void;

  // UI tree lines guide props (TASK-TRK-HIER-TREE-LINES-UI)
  isLastChild?: boolean;
  ancestorRails?: boolean[];
}

export function TreeNode({
  item,
  getStatusColor,
  deviations = [],
  onOpenReconciliation,
  statuses = [],
  hierarchy = [],
  getItemStatuses,
  getItemHierarchy,
  isFilteredBySprint = false,
  members = [],
  isImmutable = false,
  collapsedNodeIds,
  onToggleCollapse,
  onUpdateStatus,
  onUpdateAssignee,
  onCreateChild,
  onReparentItem,
  onEditItem,
  isDraggingItemId,
  onDragStartNode,
  onDragEndNode,
  isLastChild = false,
  ancestorRails = [],
}: TreeNodeProps) {
  const nodeIsImmutable =
    typeof isImmutable === 'function' ? isImmutable(item) : Boolean(isImmutable);
  const [isCreatingChild, setIsCreatingChild] = useState(false);
  const [childTitle, setChildTitle] = useState('');
  const [isSubmittingChild, setIsSubmittingChild] = useState(false);
  const [childError, setChildError] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'inside' | 'before' | 'after' | null>(null);

  const effectiveStatuses = getItemStatuses ? getItemStatuses(item) : statuses;
  const effectiveHierarchy = getItemHierarchy ? getItemHierarchy(item) : hierarchy;

  const statusColor = getStatusColor ? getStatusColor(item.status) : null;
  const itemDeviations = deviations.filter((d) => d.itemId === item.id);
  const unmappedLevelDev = itemDeviations.find((d) => d.deviationType === 'unmapped_level');
  const unmappedStatusDev = itemDeviations.find((d) => d.deviationType === 'unmapped_status');
  const nestingDev = itemDeviations.find((d) => d.deviationType === 'nesting_conflict');

  const hasChildren = Boolean(item.children && item.children.length > 0);
  const isCollapsed = Boolean(collapsedNodeIds?.has(item.id));
  const isBeingDragged = isDraggingItemId === item.id;

  // Determine valid child item types from hierarchy rules
  const validChildTypes = React.useMemo(() => {
    if (!effectiveHierarchy || effectiveHierarchy.length === 0) {
      return [{ type: 'task', label: 'Task' }];
    }
    return effectiveHierarchy.filter((h) =>
      (h.allowed_parents || []).includes(item.item_type)
    );
  }, [effectiveHierarchy, item.item_type]);

  const [childType, setChildType] = useState(() => validChildTypes[0]?.type || 'task');

  React.useEffect(() => {
    if (validChildTypes.length > 0 && !validChildTypes.some((t) => t.type === childType)) {
      setChildType(validChildTypes[0].type);
    }
  }, [validChildTypes, childType]);

  // Quick Child Submission
  const handleChildSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!childTitle.trim() || isSubmittingChild) return;

    setChildError(null);
    setIsSubmittingChild(true);
    try {
      if (onCreateChild) {
        await onCreateChild(item.id, childTitle.trim(), childType);
      }
      setChildTitle('');
      setIsCreatingChild(false);
    } catch (err: any) {
      setChildError(err?.message || 'Failed to create child item');
    } finally {
      setIsSubmittingChild(false);
    }
  };

  // Drag and drop event handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isBeingDragged) return;

    if (e.dataTransfer) {
      e.dataTransfer.dropEffect = 'move';
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const rawClientY =
      typeof e.clientY === 'number' && !isNaN(e.clientY)
        ? e.clientY
        : typeof (e.nativeEvent as any)?.clientY === 'number' && !isNaN((e.nativeEvent as any).clientY)
        ? (e.nativeEvent as any).clientY
        : undefined;

    if (rawClientY === undefined) {
      setDropPosition('inside');
      return;
    }

    const offsetY = rawClientY - rect.top;
    const height = rect.height || 1;

    if (offsetY < height * 0.25) {
      setDropPosition('before');
    } else if (offsetY > height * 0.75) {
      setDropPosition('after');
    } else {
      setDropPosition('inside');
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDropPosition(null);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const draggedId = e.dataTransfer.getData('text/plain') || isDraggingItemId;
    const currentPos = dropPosition || 'inside';
    setDropPosition(null);

    if (!draggedId || draggedId === item.id) return;
    if (onReparentItem) {
      await onReparentItem(draggedId, item.id, currentPos);
    }
  };

  return (
    <div className="relative flex flex-col" data-testid="tree-node">
      {/* Insertion line indicator above node */}
      {dropPosition === 'before' && (
        <div
          data-testid="drop-indicator-before"
          className="h-1 bg-emerald-400 rounded-full mx-4 my-0.5 shadow-lg shadow-emerald-400/50 animate-pulse"
          style={{ marginLeft: `${item.depth * 28 + 20}px` }}
        />
      )}

      {/* Node Content Container with ancestor guide rails */}
      <div className="relative flex flex-col">
        {/* Multi-level ancestor vertical guide rails (depth >= 2) */}
        {ancestorRails.map((hasRail, idx) => {
          if (!hasRail) return null;
          const colDepth = idx + 1;
          return (
            <div
              key={colDepth}
              data-testid={`ancestor-rail-${colDepth}`}
              className="absolute top-0 bottom-0 w-[2px] bg-slate-700 pointer-events-none"
              style={{ left: `${colDepth * 28}px` }}
            />
          );
        })}

        {/* Current depth sibling continuation spine for intermediate nodes (spans card row and inline child form) */}
        {!isLastChild && item.depth > 0 && (
          <div
            data-testid="branch-connector-continuation"
            className="absolute top-0 bottom-0 w-[2px] bg-slate-700 pointer-events-none"
            style={{ left: `${item.depth * 28}px` }}
          />
        )}

        <div
          className="flex items-center gap-3 transition-all group"
          style={{ marginLeft: `${item.depth * 28}px` }}
        >
          {/* Tree Branch Connector */}
          {item.depth > 0 && (
            <div
              data-testid="branch-connector"
              className="relative w-4 self-stretch flex-shrink-0 flex items-center"
            >
              {/* Top-half vertical spine down to 50% + horizontal branch into node */}
              <div
                className={`absolute top-0 bottom-1/2 left-0 w-full border-l-2 border-b-2 border-slate-700 ${
                  isLastChild ? 'rounded-bl-sm' : ''
                }`}
              />
            </div>
          )}

        {/* Branch Collapse Chevron Button */}
        {hasChildren ? (
          <button
            type="button"
            onClick={() => onToggleCollapse?.(item.id)}
            data-testid={`collapse-toggle-${item.id}`}
            aria-label={isCollapsed ? `Expand ${item.title}` : `Collapse ${item.title}`}
            className="p-1 rounded text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors shrink-0 cursor-pointer"
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        ) : (
          <div className="w-6 h-6 shrink-0" />
        )}

        {/* Card Component */}
        <div
          draggable={!nodeIsImmutable}
          onDragStart={(e) => {
            if (nodeIsImmutable) {
              e.preventDefault();
              return;
            }
            e.dataTransfer.setData('text/plain', item.id);
            onDragStartNode?.(e, item);
          }}
          onDragEnd={onDragEndNode}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onDoubleClick={() => onEditItem?.(item)}
          data-testid={`tree-node-card-${item.id}`}
          className={`flex-1 rounded-lg border p-3 my-1 transition-all shadow-sm relative ${
            isBeingDragged
              ? 'opacity-40 border-dashed border-emerald-500'
              : dropPosition === 'inside'
              ? 'border-2 border-dashed border-emerald-400 bg-emerald-950/25 shadow-emerald-500/10'
              : unmappedLevelDev || nestingDev
              ? 'border-amber-500/50 bg-amber-950/10'
              : 'border-slate-800 bg-slate-900/70 hover:border-slate-700'
          } ${nodeIsImmutable ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            {/* Left side: Drag Grip, Level Badge, Deviations, Title, Ref ID, Rollup Badges */}
            <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1">
              {!nodeIsImmutable && (
                <GripVertical className="w-3.5 h-3.5 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -ml-1" />
              )}

              {/* Level Badge */}
              <span
                className={`text-xs uppercase font-mono px-2 py-0.5 rounded shrink-0 ${
                  unmappedLevelDev
                    ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                    : 'bg-slate-800 text-slate-300'
                }`}
              >
                {item.item_type}
              </span>

              {/* Deviation Warning Badges */}
              {unmappedLevelDev && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenReconciliation?.(unmappedLevelDev);
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors cursor-pointer"
                  title={`${unmappedLevelDev.message} (Click to reconcile)`}
                  data-testid="unmapped-level-badge"
                >
                  <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>Unmapped Level</span>
                </button>
              )}

              {nestingDev && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenReconciliation?.(nestingDev);
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition-colors cursor-pointer"
                  title={`${nestingDev.message} (Click to reconcile)`}
                  data-testid="nesting-conflict-badge"
                >
                  <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                  <span>Nesting Conflict</span>
                </button>
              )}

              {/* Title & Ref ID */}
              <span
                onClick={() => onEditItem?.(item)}
                className="font-semibold text-slate-100 hover:text-white transition-colors cursor-pointer truncate"
              >
                {item.title}
              </span>

              {item.external_ref_id && (
                <span className="text-xs font-mono text-slate-500 shrink-0 font-medium">
                  [{item.external_ref_id}]
                </span>
              )}

              {/* Immutability Lock Badge */}
              {nodeIsImmutable && (
                <span
                  data-testid="immutable-lock-badge"
                  className="flex items-center space-x-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/50 shrink-0 font-sans"
                  title="Completed item in closed sprint (immutable)"
                >
                  <Lock className="w-3 h-3 text-purple-400" />
                  <span>Locked</span>
                </span>
              )}

              {/* Recursive Rollup Badges */}
              {item.descendantCount !== undefined && item.descendantCount > 0 && (
                <span
                  data-testid="tree-node-subtasks-badge"
                  className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-sky-950/70 text-sky-300 border border-sky-800/50 shrink-0"
                  title={
                    isFilteredBySprint
                      ? `${item.descendantCount} descendant item(s) (sprint filtered)`
                      : `${item.descendantCount} descendant item(s)`
                  }
                >
                  {item.descendantCount} {item.descendantCount === 1 ? 'subtask' : 'subtasks'}
                </span>
              )}

              {item.rollupPoints !== undefined && item.rollupPoints > 0 && (
                <span
                  data-testid="tree-node-rollup-points-badge"
                  className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800/50 shrink-0"
                  title={
                    isFilteredBySprint
                      ? `Subtree total: ${item.rollupPoints} pts (sprint filtered)`
                      : `Subtree total: ${item.rollupPoints} pts`
                  }
                >
                  {item.rollupPoints} pts rollup
                </span>
              )}
            </div>

            {/* Right side: Assignee, Status, Quick Child Button, Edit */}
            <div className="flex items-center gap-2 shrink-0">
              {/* Assignee Selector */}
              {members && members.length > 0 ? (
                <div className="relative inline-flex items-center">
                  <User className="w-3 h-3 text-slate-500 absolute left-2 pointer-events-none" />
                  <select
                    value={item.assignee || ''}
                    disabled={nodeIsImmutable}
                    onChange={(e) => onUpdateAssignee?.(item.id, e.target.value || null)}
                    className="text-xs bg-slate-950 border border-slate-800 rounded pl-6 pr-2 py-1 text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-mono"
                    title={nodeIsImmutable ? 'Item is locked in a closed sprint' : 'Assign member'}
                    data-testid={`assignee-select-${item.id}`}
                  >
                    <option value="">Unassigned</option>
                    {item.assignee && !members.some((m) => m.name === item.assignee) && (
                      <option value={item.assignee}>{item.assignee}</option>
                    )}
                    {members.map((m) => (
                      <option key={m.id} value={m.name}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="text-xs text-slate-400 flex items-center space-x-1 font-mono">
                  <User className="w-3 h-3 text-slate-500" />
                  <span>{item.assignee || 'Unassigned'}</span>
                </span>
              )}

              {/* Status Selector */}
              {effectiveStatuses && effectiveStatuses.length > 0 ? (
                <select
                  value={item.status}
                  disabled={nodeIsImmutable}
                  onChange={(e) => onUpdateStatus?.(item.id, e.target.value)}
                  className={`text-xs rounded px-2 py-1 font-mono focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    unmappedStatusDev ? 'border border-amber-500/60' : 'border border-slate-800'
                  }`}
                  style={
                    statusColor
                      ? {
                          backgroundColor: `${statusColor}20`,
                          color: statusColor,
                          border: unmappedStatusDev ? '1px solid #f59e0b' : `1px solid ${statusColor}40`,
                        }
                      : { backgroundColor: '#020617', color: '#cbd5e1' }
                  }
                  title={nodeIsImmutable ? 'Item is locked in a closed sprint' : 'Change status'}
                  data-testid={`status-select-${item.id}`}
                >
                  {effectiveStatuses.map((st) => (
                    <option
                      key={st.id}
                      value={st.id}
                      style={{ backgroundColor: '#020617', color: '#cbd5e1' }}
                    >
                      {st.label}
                    </option>
                  ))}
                </select>
              ) : (
                <span
                  className={`text-xs font-mono px-2 py-0.5 rounded flex-shrink-0 ${
                    !statusColor ? 'bg-slate-800 text-slate-300' : ''
                  } ${unmappedStatusDev ? 'border border-amber-500/60' : ''}`}
                  style={
                    statusColor
                      ? {
                          backgroundColor: `${statusColor}20`,
                          color: statusColor,
                          border: unmappedStatusDev ? '1px solid #f59e0b' : `1px solid ${statusColor}40`,
                        }
                      : undefined
                  }
                >
                  {item.status}
                </span>
              )}

              {unmappedStatusDev && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenReconciliation?.(unmappedStatusDev);
                  }}
                  className="text-amber-400 hover:text-amber-300 transition-colors cursor-pointer text-xs"
                  title={`${unmappedStatusDev.message} (Click to reconcile)`}
                  data-testid="unmapped-status-badge"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Quick Add Child Button */}
              {!nodeIsImmutable && onCreateChild && validChildTypes.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setIsCreatingChild(!isCreatingChild);
                    setChildError(null);
                  }}
                  className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                  title="Add child task"
                  data-testid={`add-child-btn-${item.id}`}
                >
                  <Plus className="w-3.5 h-3.5" />
                </button>
              )}

              {/* Edit Modal Button */}
              {onEditItem && (
                <button
                  type="button"
                  onClick={() => onEditItem(item)}
                  className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-all opacity-0 group-hover:opacity-100 focus:opacity-100 cursor-pointer"
                  title="Edit work item"
                  data-testid={`edit-item-btn-${item.id}`}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Insertion line indicator below node */}
      {dropPosition === 'after' && (
        <div
          data-testid="drop-indicator-after"
          className="h-1 bg-emerald-400 rounded-full mx-4 my-0.5 shadow-lg shadow-emerald-400/50 animate-pulse"
          style={{ marginLeft: `${item.depth * 28 + 20}px` }}
        />
      )}

      {/* Inline Child Creation Form */}
      {isCreatingChild && (
        <form
          onSubmit={handleChildSubmit}
          className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-slate-900 border border-emerald-500/40 my-1 shadow-lg"
          style={{ marginLeft: `${(item.depth + 1) * 28}px` }}
          data-testid="inline-create-child-form"
        >
          {childError && (
            <div
              className="text-xs text-rose-400 font-mono pl-1"
              data-testid="inline-create-child-error"
            >
              {childError}
            </div>
          )}
          <div className="flex items-center gap-2">
            <span className="text-xs text-emerald-400 font-mono shrink-0">Add child:</span>
            <select
              value={childType}
              onChange={(e) => setChildType(e.target.value)}
              disabled={isSubmittingChild}
              className="text-xs bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 shrink-0 cursor-pointer disabled:opacity-50"
              data-testid="inline-create-child-type-select"
            >
              {validChildTypes.map((t) => (
                <option key={t.type} value={t.type}>
                  {t.label || t.type}
                </option>
              ))}
            </select>
            <input
              type="text"
              autoFocus
              value={childTitle}
              onChange={(e) => setChildTitle(e.target.value)}
              disabled={isSubmittingChild}
              placeholder="Child item title..."
              className="flex-1 text-xs bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
              data-testid="inline-create-child-input"
            />
            <button
              type="submit"
              disabled={!childTitle.trim() || isSubmittingChild}
              className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-medium disabled:opacity-40 transition-colors cursor-pointer"
              data-testid="inline-create-child-submit"
            >
              {isSubmittingChild ? 'Creating...' : 'Create'}
            </button>
            <button
              type="button"
              disabled={isSubmittingChild}
              onClick={() => {
                setIsCreatingChild(false);
                setChildError(null);
              }}
              className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
          </div>
        </form>
      )}
      </div>

      {/* Render Nested Children (Collapsible) */}
      {!isCollapsed && item.children && item.children.length > 0 && (
        <div className="flex flex-col" data-testid={`children-container-${item.id}`}>
          {item.children.map((child, idx) => {
            const isLast = idx === (item.children?.length ?? 0) - 1;
            const nextAncestorRails =
              item.depth === 0
                ? []
                : [...ancestorRails, !isLastChild];

            return (
              <TreeNode
                key={child.id}
                item={child}
                isLastChild={isLast}
                ancestorRails={nextAncestorRails}
                getStatusColor={getStatusColor}
                deviations={deviations}
                onOpenReconciliation={onOpenReconciliation}
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
                isDraggingItemId={isDraggingItemId}
                onDragStartNode={onDragStartNode}
                onDragEndNode={onDragEndNode}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
