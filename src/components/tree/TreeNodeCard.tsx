'use client';

import React from 'react';
import {
  AlertTriangle,
  ChevronDown,
  GripVertical,
  Lock,
  Pencil,
  Plus,
} from 'lucide-react';
import { WorkItem, WorkItemNode, StatusDefinition, HierarchyLevel, ProjectSettings, getWorkMetricConfig } from '@/types/tracker';
import { SchemaDeviation } from '@/lib/schema-deviation';
import { CopyableRefId } from '@/components/CopyableRefId';
import { PointBadge } from '@/components/common/PointBadge';
import { CompactAssigneeCell, CompactStatusCell } from '@/components/common/CompactRowCells';
import { RowFieldCell } from '@/components/common/RowFieldCell';
import { ResolvedRowColumn, resolveEffectiveRowColumns } from '@/lib/row-columns';
import { getLevelBadgeClasses, getLevelBadgeStyle } from '@/components/TreeNode';

interface ValidChildType {
  type: string;
  label?: string;
}

interface TreeNodeCardProps {
  item: WorkItemNode;
  nodeIsImmutable: boolean;
  isBeingDragged: boolean;
  dropPosition: 'inside' | 'before' | 'after' | null;
  unmappedLevelDev?: SchemaDeviation;
  nestingDev?: SchemaDeviation;
  unmappedStatusDev?: SchemaDeviation;
  statusColor?: string | null;
  effectiveStatuses?: StatusDefinition[];
  sanitizedTitle: string;
  isCollapsed?: boolean;
  suppressInlineDescription?: boolean;
  isDescExpanded: boolean;
  setIsDescExpanded: React.Dispatch<React.SetStateAction<boolean>>;
  pointMode?: 'macro' | 'granular';
  isFilteredBySprint?: boolean;
  members?: Array<{ id: string; name: string }>;
  validChildTypes: ValidChildType[];
  isCreatingChild: boolean;
  setIsCreatingChild: React.Dispatch<React.SetStateAction<boolean>>;
  setChildError: React.Dispatch<React.SetStateAction<string | null>>;
  onDragStartNode?: (e: React.DragEvent, item: WorkItemNode) => void;
  onDragEndNode?: () => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: (e: React.DragEvent) => void;
  onDrop: (e: React.DragEvent) => void;
  onEditItem?: (item: WorkItem) => void;
  onOpenReconciliation?: (deviation?: SchemaDeviation) => void;
  onUpdateAssignee?: (itemId: string, newAssignee: string | null) => Promise<void> | void;
  onUpdateStatus?: (itemId: string, newStatus: string) => Promise<void> | void;
  onCreateChild?: (parentId: string, title: string, itemType: string) => Promise<void> | void;
  unit?: string;
  projectSettings?: ProjectSettings;
  metricKey?: string;
  hierarchy?: HierarchyLevel[];
  visibleColumns?: ResolvedRowColumn[];
  allProjects?: Array<{ id: string; slug?: string; name: string; settings?: any }>;
}

export function TreeNodeCard({
  item,
  nodeIsImmutable,
  isBeingDragged,
  dropPosition,
  unmappedLevelDev,
  nestingDev,
  unmappedStatusDev,
  statusColor,
  effectiveStatuses,
  sanitizedTitle,
  isCollapsed = false,
  suppressInlineDescription = false,
  isDescExpanded,
  setIsDescExpanded,
  pointMode,
  isFilteredBySprint = false,
  members = [],
  validChildTypes,
  isCreatingChild,
  setIsCreatingChild,
  setChildError,
  onDragStartNode,
  onDragEndNode,
  onDragOver,
  onDragLeave,
  onDrop,
  onEditItem,
  onOpenReconciliation,
  onUpdateAssignee,
  onUpdateStatus,
  onCreateChild,
  unit = 'pts',
  projectSettings,
  metricKey: propMetricKey,
  hierarchy,
  visibleColumns,
  allProjects = [],
}: TreeNodeCardProps) {
  const effectiveHierarchy =
    hierarchy && hierarchy.length > 0 ? hierarchy : projectSettings?.hierarchy || [];
  const effectiveColumns =
    visibleColumns ?? resolveEffectiveRowColumns(projectSettings, 'tree');
  const showRefId = effectiveColumns.some((c) => c.key === 'ref_id');
  const rightColumns = effectiveColumns.filter((c) => c.placement === 'right');
  const visibleColumnKeys = new Set(effectiveColumns.map((c) => c.key));
  const hoverPriority = !visibleColumnKeys.has('priority') ? item.metadata?.priority : undefined;
  const hoverSprint = !visibleColumnKeys.has('sprint') ? item.metadata?.sprint : undefined;
  const hasHoverSummaryMeta = Boolean(hoverPriority || hoverSprint);

  return (
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
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      onDoubleClick={() => onEditItem?.(item)}
      data-testid={`tree-node-card-${item.id}`}
      className={`flex-1 rounded-lg border my-1 transition-all shadow-sm relative min-w-0 max-w-full ${
        item.depth > 0 ? 'py-1.5 px-3 bg-slate-950/40 border-slate-800/80' : 'py-2.5 px-3 bg-slate-900/70 border-slate-800'
      } ${
        isBeingDragged
          ? 'opacity-30 border-dashed border-slate-700 bg-slate-900 shadow-md'
          : dropPosition === 'inside'
          ? 'border-2 border-dashed border-emerald-400 bg-emerald-950/35 ring-2 ring-emerald-400/60 shadow-lg shadow-emerald-500/20'
          : unmappedLevelDev || nestingDev
          ? 'border-amber-500/50 bg-amber-950/10'
          : 'hover:border-slate-700'
      } ${nodeIsImmutable ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'}`}
    >
      {dropPosition === 'inside' && (
        <div
          data-testid="drop-indicator-inside"
          className="absolute inset-0 border-2 border-dashed border-emerald-400 rounded-lg bg-emerald-950/30 flex items-center justify-center pointer-events-none z-10"
        >
          <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-emerald-900/90 text-emerald-200 border border-emerald-500/60 shadow">
            Nest inside
          </span>
        </div>
      )}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 md:gap-3 min-w-0 w-full">
        {/* Left side: Drag Grip, Level Badge, Deviations, Title, Ref ID, Lock, Subtasks */}
        <div
          className="flex items-center gap-2 md:gap-2.5 min-w-0 flex-1 overflow-hidden w-full md:w-auto"
          data-testid={`tree-node-left-zone-${item.id}`}
        >
          {!nodeIsImmutable && (
            <GripVertical className="w-3.5 h-3.5 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -ml-1" />
          )}

          {/* Level Badge */}
          <span
            data-testid={`level-badge-${item.item_type}`}
            title={item.item_type}
            style={getLevelBadgeStyle(item.item_type, Boolean(unmappedLevelDev), effectiveHierarchy)}
            className={`${getLevelBadgeClasses(item.item_type, Boolean(unmappedLevelDev), effectiveHierarchy)} shrink-0 text-center uppercase whitespace-nowrap max-w-[130px] sm:max-w-[160px] truncate`}
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
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors cursor-pointer shrink-0"
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
              className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition-colors cursor-pointer shrink-0"
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
            title={item.description ? `${sanitizedTitle} — ${item.description}` : sanitizedTitle}
            className="truncate font-medium text-slate-100 text-sm flex-1 min-w-0 min-w-[120px] flex-shrink hover:text-white transition-colors cursor-pointer"
          >
            {sanitizedTitle}
          </span>

          {item.description && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsDescExpanded((prev) => !prev);
              }}
              aria-expanded={isDescExpanded}
              aria-label={
                isDescExpanded
                  ? `Collapse description for ${sanitizedTitle}`
                  : `Expand description for ${sanitizedTitle}`
              }
              data-testid={`tree-expand-desc-btn-${item.id}`}
              title={item.description}
              className={`p-1 -my-1 text-slate-500 hover:text-slate-300 rounded transition-all shrink-0 cursor-pointer hover:bg-slate-800 touch-manipulation ${
                isDescExpanded
                  ? 'opacity-100'
                  : 'opacity-70 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus:opacity-100'
              }`}
            >
              <ChevronDown
                className={`w-3 h-3 transition-transform duration-200 ${
                  isDescExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>
          )}

          {showRefId && item.external_ref_id && (
            <span
              className="shrink-0 max-w-[140px] truncate central-stage-ref-id md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity"
              title={item.external_ref_id}
              data-testid={`tree-node-ref-id-${item.id}`}
            >
              <CopyableRefId
                id={item.external_ref_id}
                brackets
                className="text-slate-500 hover:text-slate-300 text-xs text-[11px] font-mono shrink-0 max-w-[140px] truncate"
              />
            </span>
          )}

          {/* Immutability Lock Badge (icon-only at rest, full pill on hover) */}
          {nodeIsImmutable && (
            <span
              data-testid="immutable-lock-badge"
              className="flex items-center space-x-1 text-[10px] px-1.5 md:px-1 md:group-hover:px-1.5 py-0.5 rounded bg-purple-950/60 md:bg-transparent md:group-hover:bg-purple-950/60 text-purple-300 border border-purple-800/50 md:border-transparent md:group-hover:border-purple-800/50 shrink-0 whitespace-nowrap font-sans transition-all"
              title="Completed item in closed sprint (immutable)"
            >
              <Lock className="w-3 h-3 text-purple-400/80" />
              <span className="md:hidden md:group-hover:inline">Locked</span>
            </span>
          )}

          {/* Recursive Rollup Badges (visible when collapsed; deferred to hover when expanded) */}
          {item.descendantCount !== undefined && item.descendantCount > 0 && (
            <span
              data-testid="tree-node-subtasks-badge"
              className={`text-slate-400 text-xs font-mono shrink-0 whitespace-nowrap transition-opacity ${
                isCollapsed
                  ? 'opacity-75 group-hover:opacity-100'
                  : 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'
              }`}
              title={
                isFilteredBySprint
                  ? `${item.descendantCount} descendant item(s) (sprint filtered)`
                  : `${item.descendantCount} descendant item(s)`
              }
            >
              ({item.descendantCount})
            </span>
          )}

          {/* Consolidated Hover Metadata Chip (unrendered sprint/priority surfaced on hover) */}
          {hasHoverSummaryMeta && (
            <span
              data-testid={`tree-hover-meta-summary-${item.id}`}
              className="hidden md:inline-flex items-center gap-1.5 text-[10px] font-mono text-slate-400 bg-slate-800/70 border border-slate-700/60 px-1.5 py-0.5 rounded shrink-0 whitespace-nowrap md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 transition-opacity"
            >
              {[hoverPriority ? String(hoverPriority) : null, hoverSprint ? String(hoverSprint) : null]
                .filter(Boolean)
                .join(' · ')}
            </span>
          )}
        </div>

        {/* Right section: Schema/User-Configured Static & Dynamic Columns + Actions */}
        <div
          className="flex flex-wrap md:flex-nowrap items-center gap-3 shrink-0 ml-auto w-full md:w-auto justify-between md:justify-end pt-1.5 md:pt-0 border-t border-slate-800/40 md:border-t-0"
          data-testid={`tree-node-right-zone-${item.id}`}
        >
          {rightColumns.map((col) => {
            if (col.key === 'points') {
              return (
                <div
                  key={col.key}
                  className="w-28 shrink-0 flex items-center justify-start md:justify-end text-right central-stage-track-rollup"
                  data-testid="col-rollup-points"
                >
                  {(() => {
                    const pointsRollup = (item as any).points_rollup;
                    const childCount =
                      (item as any).child_count !== undefined
                        ? (item as any).child_count
                        : item.children && item.children.length > 0
                        ? item.children.length
                        : item.descendantCount ?? 0;
                    const configuredKey =
                      propMetricKey ||
                      (projectSettings ? getWorkMetricConfig(projectSettings).field_key : undefined);
                    const rawIntrinsic = configuredKey
                      ? item.metadata?.[configuredKey] ??
                        (configuredKey === 'story_points'
                          ? item.metadata?.points ?? item.metadata?.estimate
                          : undefined)
                      : item.metadata?.story_points ??
                        item.metadata?.points ??
                        item.metadata?.estimate;
                    const intrinsicPoints =
                      rawIntrinsic !== undefined && !isNaN(Number(rawIntrinsic))
                        ? Number(rawIntrinsic)
                        : undefined;

                    if (pointsRollup !== undefined || pointMode !== undefined) {
                      const effectiveRollup =
                        pointsRollup !== undefined
                          ? pointsRollup
                          : item.rollupPoints !== undefined
                          ? item.rollupPoints
                          : 0;

                      return (
                        <span
                          data-testid="tree-node-rollup-points-badge"
                          className="whitespace-nowrap shrink-0"
                        >
                          <PointBadge
                            storyPoints={intrinsicPoints}
                            rollupPoints={effectiveRollup}
                            childCount={childCount}
                            pointMode={pointMode || 'granular'}
                            unit={unit}
                            className="whitespace-nowrap shrink-0"
                          />
                        </span>
                      );
                    }

                    if (item.rollupPoints !== undefined && item.rollupPoints > 0) {
                      return (
                        <span
                          data-testid="tree-node-rollup-points-badge"
                          className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800/50 shrink-0 whitespace-nowrap"
                          title={
                            isFilteredBySprint
                              ? `Subtree total: ${item.rollupPoints} ${unit} (sprint filtered)`
                              : `Subtree total: ${item.rollupPoints} ${unit}`
                          }
                        >
                          {item.rollupPoints} {unit} rollup
                        </span>
                      );
                    }

                    return null;
                  })()}
                </div>
              );
            }

            if (col.key === 'assignee') {
              return (
                <div
                  key={col.key}
                  className={`w-9 shrink-0 hidden md:flex items-center justify-center central-stage-track-assignee transition-opacity ${
                    !item.assignee
                      ? 'md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100'
                      : ''
                  }`}
                  data-testid="col-assignee"
                >
                  <CompactAssigneeCell
                    itemId={item.id}
                    assignee={item.assignee}
                    members={members}
                    onUpdateAssignee={onUpdateAssignee}
                    disabled={nodeIsImmutable}
                  />
                </div>
              );
            }

            if (col.key === 'status') {
              return (
                <div
                  key={col.key}
                  className="w-9 shrink-0 flex items-center justify-center gap-1 central-stage-track-status"
                  data-testid="col-status"
                >
                  <CompactStatusCell
                    itemId={item.id}
                    status={item.status}
                    statuses={effectiveStatuses}
                    statusColor={statusColor}
                    onUpdateStatus={onUpdateStatus}
                    disabled={nodeIsImmutable}
                    hasDeviation={Boolean(unmappedStatusDev)}
                  />

                  {unmappedStatusDev && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenReconciliation?.(unmappedStatusDev);
                      }}
                      className="text-amber-400 hover:text-amber-300 transition-colors cursor-pointer text-xs shrink-0"
                      title={`${unmappedStatusDev.message} (Click to reconcile)`}
                      data-testid="unmapped-status-badge"
                    >
                      <AlertTriangle className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              );
            }

            return (
              <RowFieldCell
                key={col.key}
                item={item}
                column={col}
                allProjects={allProjects}
                projectSettings={projectSettings}
                isImmutable={nodeIsImmutable}
              />
            );
          })}

          {/* Actions Track (Add Child, Edit) */}
          <div className="w-14 shrink-0 flex items-center justify-end gap-0.5 ml-auto md:ml-0" data-testid="col-actions">
            {!nodeIsImmutable && onCreateChild && validChildTypes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setIsCreatingChild(!isCreatingChild);
                  setChildError(null);
                }}
                className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-all opacity-70 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus:opacity-100 cursor-pointer"
                title="Add child task"
                data-testid={`add-child-btn-${item.id}`}
              >
                <Plus className="w-3.5 h-3.5" />
              </button>
            )}

            {onEditItem && (
              <button
                type="button"
                onClick={() => onEditItem(item)}
                className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-all opacity-70 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100 focus:opacity-100 cursor-pointer"
                title="Edit work item"
                data-testid={`edit-item-btn-${item.id}`}
              >
                <Pencil className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Inline Description Accordion */}
      {!suppressInlineDescription && item.description && isDescExpanded && (
        <div
          data-testid={`tree-node-description-${item.id}`}
          title={item.description}
          onClick={(e) => e.stopPropagation()}
          className="mt-2 pt-2 border-t border-slate-800/80 text-xs text-slate-400 leading-relaxed break-words"
        >
          {item.description}
        </div>
      )}
    </div>
  );
}
