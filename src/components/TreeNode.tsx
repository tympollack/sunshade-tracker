'use client';

import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { WorkItem, WorkItemNode, StatusDefinition, HierarchyLevel } from '@/types/tracker';
import { SchemaDeviation } from '@/lib/schema-deviation';
import { TreeNodeCard } from '@/components/tree/TreeNodeCard';
import { TreeNodeBranchRails, TreeNodeBranchConnector } from '@/components/tree/TreeNodeBranchRails';
import { TreeNodeQuickChildForm } from '@/components/tree/TreeNodeQuickChildForm';

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
  pointMode?: 'macro' | 'granular';
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

export const INDENT_STEP = 20;

export function sanitizeTitle(title: string): string {
  if (!title) return '';
  return title
    .replace(/\\\[/g, '[')
    .replace(/\\\]/g, ']')
    .replace(/\\([_*\\[\]()#+-.!`])/g, '$1');
}

export function getLevelBadgeClasses(itemType: string, isUnmapped: boolean): string {
  if (isUnmapped) {
    return 'bg-amber-950/80 text-amber-300 border border-amber-500/40 text-[10px] font-mono uppercase px-2 py-0.5 rounded shrink-0';
  }
  const type = (itemType || '').toLowerCase();
  switch (type) {
    case 'epic':
      return 'bg-purple-950/60 text-purple-300 border border-purple-800/60 text-[10px] font-bold uppercase font-mono px-2 py-0.5 rounded shrink-0';
    case 'story':
      return 'bg-sky-950/60 text-sky-300 border border-sky-800/60 text-[10px] font-semibold uppercase font-mono px-2 py-0.5 rounded shrink-0';
    case 'task':
      return 'bg-slate-800/80 text-slate-300 border border-slate-700 text-[10px] uppercase font-mono px-2 py-0.5 rounded shrink-0';
    case 'subtask':
      return 'bg-slate-900 text-slate-400 border border-slate-800 text-[9px] uppercase font-mono tracking-wider px-2 py-0.5 rounded shrink-0';
    default:
      return 'bg-slate-800 text-slate-300 border border-slate-700 text-[10px] uppercase font-mono px-2 py-0.5 rounded shrink-0';
  }
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
  pointMode,
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
  const [isDescExpanded, setIsDescExpanded] = useState(false);
  const [isCreatingChild, setIsCreatingChild] = useState(false);
  const [childTitle, setChildTitle] = useState('');
  const [isSubmittingChild, setIsSubmittingChild] = useState(false);
  const [childError, setChildError] = useState<string | null>(null);
  const [dropPosition, setDropPosition] = useState<'inside' | 'before' | 'after' | null>(null);
  const dragLeaveTimerRef = React.useRef<NodeJS.Timeout | null>(null);

  React.useEffect(() => {
    return () => {
      if (dragLeaveTimerRef.current) {
        clearTimeout(dragLeaveTimerRef.current);
      }
    };
  }, []);

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
  const sanitizedTitle = sanitizeTitle(item.title);

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

    if (dragLeaveTimerRef.current) {
      clearTimeout(dragLeaveTimerRef.current);
      dragLeaveTimerRef.current = null;
    }

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

    // Expanded drop hitboxes (at least 16px vertical drop corridors or up to 25% height)
    const threshold = Math.min(Math.max(16, height * 0.25), height * 0.4);

    if (offsetY < threshold) {
      setDropPosition('before');
    } else if (offsetY > height - threshold) {
      setDropPosition('after');
    } else {
      setDropPosition('inside');
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragLeaveTimerRef.current) {
      clearTimeout(dragLeaveTimerRef.current);
    }
    dragLeaveTimerRef.current = setTimeout(() => {
      setDropPosition(null);
    }, 50);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (dragLeaveTimerRef.current) {
      clearTimeout(dragLeaveTimerRef.current);
      dragLeaveTimerRef.current = null;
    }
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
          className="absolute inset-x-0 -top-0.5 h-0.5 bg-emerald-400 pointer-events-none z-30 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
          style={{ marginLeft: `${item.depth * INDENT_STEP + INDENT_STEP}px` }}
        />
      )}

      {/* Node Content Container with ancestor guide rails */}
      <div className="relative flex flex-col">
        <TreeNodeBranchRails
          ancestorRails={ancestorRails}
          isLastChild={isLastChild}
          depth={item.depth}
        />

        <div
          className="flex items-center gap-3 transition-all group"
          style={{ marginLeft: `${item.depth * INDENT_STEP}px` }}
        >
          <TreeNodeBranchConnector isLastChild={isLastChild} depth={item.depth} />

          {/* Branch Collapse Chevron Button */}
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggleCollapse?.(item.id)}
              data-testid={`collapse-toggle-${item.id}`}
              aria-label={isCollapsed ? `Expand ${item.title}` : `Collapse ${item.title}`}
              className="w-5 h-5 flex items-center justify-center p-0.5 rounded text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors shrink-0 cursor-pointer"
            >
              {isCollapsed ? (
                <ChevronRight className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          ) : (
            <div className="w-5 h-5 shrink-0" />
          )}

          {/* Card Component */}
          <TreeNodeCard
            item={item}
            nodeIsImmutable={nodeIsImmutable}
            isBeingDragged={isBeingDragged}
            dropPosition={dropPosition}
            unmappedLevelDev={unmappedLevelDev}
            nestingDev={nestingDev}
            unmappedStatusDev={unmappedStatusDev}
            statusColor={statusColor}
            effectiveStatuses={effectiveStatuses}
            sanitizedTitle={sanitizedTitle}
            isDescExpanded={isDescExpanded}
            setIsDescExpanded={setIsDescExpanded}
            pointMode={pointMode}
            isFilteredBySprint={isFilteredBySprint}
            members={members}
            validChildTypes={validChildTypes}
            isCreatingChild={isCreatingChild}
            setIsCreatingChild={setIsCreatingChild}
            setChildError={setChildError}
            onDragStartNode={onDragStartNode}
            onDragEndNode={onDragEndNode}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onEditItem={onEditItem}
            onOpenReconciliation={onOpenReconciliation}
            onUpdateAssignee={onUpdateAssignee}
            onUpdateStatus={onUpdateStatus}
            onCreateChild={onCreateChild}
          />
        </div>

        {/* Insertion line indicator below node */}
        {dropPosition === 'after' && (
          <div
            data-testid="drop-indicator-after"
            className="absolute inset-x-0 -bottom-0.5 h-0.5 bg-emerald-400 pointer-events-none z-30 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
            style={{ marginLeft: `${item.depth * INDENT_STEP + INDENT_STEP}px` }}
          />
        )}

        {/* Inline Child Creation Form */}
        {isCreatingChild && (
          <TreeNodeQuickChildForm
            depth={item.depth}
            childTitle={childTitle}
            childType={childType}
            validChildTypes={validChildTypes}
            isSubmitting={isSubmittingChild}
            error={childError}
            onTitleChange={setChildTitle}
            onTypeChange={setChildType}
            onSubmit={handleChildSubmit}
            onCancel={() => {
              setIsCreatingChild(false);
              setChildError(null);
            }}
          />
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
                pointMode={pointMode}
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
