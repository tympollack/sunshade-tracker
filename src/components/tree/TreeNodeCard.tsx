'use client';

import React from 'react';
import {
  AlertTriangle,
  ChevronDown,
  GripVertical,
  Lock,
  Pencil,
  Plus,
  User,
} from 'lucide-react';
import { WorkItem, WorkItemNode, StatusDefinition } from '@/types/tracker';
import { SchemaDeviation } from '@/lib/schema-deviation';
import { CopyableRefId } from '@/components/CopyableRefId';
import { DualPointBadge } from '@/components/DualPointBadge';
import { getLevelBadgeClasses } from '@/components/TreeNode';

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
}: TreeNodeCardProps) {
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
          className="flex items-center gap-2 min-w-0 flex-1 overflow-hidden w-full md:w-auto"
          data-testid={`tree-node-left-zone-${item.id}`}
        >
          {!nodeIsImmutable && (
            <GripVertical className="w-3.5 h-3.5 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -ml-1" />
          )}

          {/* Level Badge */}
          <span
            data-testid={`level-badge-${item.item_type}`}
            className={`${getLevelBadgeClasses(item.item_type, Boolean(unmappedLevelDev))} w-14 shrink-0 text-center uppercase`}
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
            className="font-medium text-slate-100 hover:text-white transition-colors cursor-pointer truncate min-w-0 flex-shrink flex-1"
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
              className="p-1 -my-1 text-slate-500 hover:text-slate-300 rounded transition-colors shrink-0 cursor-pointer hover:bg-slate-800 touch-manipulation"
            >
              <ChevronDown
                className={`w-3 h-3 transition-transform duration-200 ${
                  isDescExpanded ? 'rotate-180' : ''
                }`}
              />
            </button>
          )}

          {item.external_ref_id && (
            <CopyableRefId
              id={item.external_ref_id}
              brackets
              className="text-slate-500 hover:text-slate-300 text-xs font-mono shrink-0 whitespace-nowrap"
            />
          )}

          {/* Immutability Lock Badge */}
          {nodeIsImmutable && (
            <span
              data-testid="immutable-lock-badge"
              className="flex items-center space-x-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/50 shrink-0 whitespace-nowrap font-sans"
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
              className="text-slate-400 text-xs font-mono shrink-0 whitespace-nowrap"
              title={
                isFilteredBySprint
                  ? `${item.descendantCount} descendant item(s) (sprint filtered)`
                  : `${item.descendantCount} descendant item(s)`
              }
            >
              ({item.descendantCount})
            </span>
          )}
        </div>

        {/* Right section: Rollup Points, Assignee (desktop), Status, Actions */}
        <div
          className="flex items-center gap-3 shrink-0 ml-auto w-full md:w-auto justify-between md:justify-end pt-1.5 md:pt-0 border-t border-slate-800/40 md:border-t-0"
          data-testid={`tree-node-right-zone-${item.id}`}
        >
          {/* Rollup / Points Track */}
          <div className="w-28 shrink-0 flex items-center justify-start md:justify-end text-right" data-testid="col-rollup-points">
            {(() => {
              const pointsRollup = (item as any).points_rollup;
              const childCount =
                (item as any).child_count !== undefined
                  ? (item as any).child_count
                  : (item.children && item.children.length > 0)
                  ? item.children.length
                  : (item.descendantCount ?? 0);
              const rawIntrinsic =
                item.metadata?.story_points ?? item.metadata?.points ?? item.metadata?.estimate;
              const intrinsicPoints =
                rawIntrinsic !== undefined ? Number(rawIntrinsic) : undefined;

              if (pointsRollup !== undefined || pointMode !== undefined) {
                const effectiveRollup =
                  pointsRollup !== undefined
                    ? pointsRollup
                    : item.rollupPoints !== undefined
                    ? item.rollupPoints
                    : 0;

                return (
                  <span data-testid="tree-node-rollup-points-badge" className="whitespace-nowrap shrink-0">
                    <DualPointBadge
                      storyPoints={intrinsicPoints}
                      rollupPoints={effectiveRollup}
                      childCount={childCount}
                      pointMode={pointMode || 'granular'}
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
                        ? `Subtree total: ${item.rollupPoints} pts (sprint filtered)`
                        : `Subtree total: ${item.rollupPoints} pts`
                    }
                  >
                    {item.rollupPoints} pts rollup
                  </span>
                );
              }

              return null;
            })()}
          </div>

          {/* Assignee Selector Track */}
          <div className="w-32 shrink-0 hidden md:flex items-center truncate" data-testid="col-assignee">
            {members && members.length > 0 ? (
              <div className="relative inline-flex items-center w-full">
                <User className="w-3 h-3 text-slate-500 absolute left-2 pointer-events-none" />
                <select
                  value={item.assignee || ''}
                  disabled={nodeIsImmutable}
                  onChange={(e) => onUpdateAssignee?.(item.id, e.target.value || null)}
                  className="w-full text-xs bg-slate-950 border border-slate-800 rounded pl-6 pr-2 py-1 text-slate-300 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed font-mono truncate"
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
              <span className="text-xs text-slate-400 flex items-center space-x-1 font-mono truncate">
                <User className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="truncate">{item.assignee || 'Unassigned'}</span>
              </span>
            )}
          </div>

          {/* Status Selector Track */}
          <div className="w-36 shrink-0 flex items-center gap-1.5 flex-1 md:flex-initial max-w-[170px] md:max-w-none" data-testid="col-status">
            {effectiveStatuses && effectiveStatuses.length > 0 ? (
              <select
                value={item.status}
                disabled={nodeIsImmutable}
                onChange={(e) => onUpdateStatus?.(item.id, e.target.value)}
                className={`w-full text-xs rounded px-2 py-1 font-mono focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed truncate ${
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
                className="text-amber-400 hover:text-amber-300 transition-colors cursor-pointer text-xs shrink-0"
                title={`${unmappedStatusDev.message} (Click to reconcile)`}
                data-testid="unmapped-status-badge"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Actions Track (Add Child, Edit) */}
          <div className="w-14 shrink-0 flex items-center justify-end gap-0.5 ml-auto md:ml-0" data-testid="col-actions">
            {!nodeIsImmutable && onCreateChild && validChildTypes.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setIsCreatingChild(!isCreatingChild);
                  setChildError(null);
                }}
                className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-all opacity-70 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 cursor-pointer"
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
                className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-all opacity-70 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 cursor-pointer"
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
      {item.description && isDescExpanded && (
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
