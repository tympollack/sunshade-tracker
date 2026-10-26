'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  AlertTriangle,
  Check,
  ChevronDown,
  GripVertical,
  Lock,
  Pencil,
  Plus,
  User,
} from 'lucide-react';
import { WorkItem, WorkItemNode, StatusDefinition, HierarchyLevel, ProjectSettings, getWorkMetricConfig } from '@/types/tracker';
import { SchemaDeviation } from '@/lib/schema-deviation';
import { CopyableRefId } from '@/components/CopyableRefId';
import { PointBadge } from '@/components/common/PointBadge';
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
}

function getStatusGlyph(status: string, effectiveStatuses?: StatusDefinition[]) {
  const norm = (status || '').toLowerCase().trim();
  const matched = effectiveStatuses?.find((s) => s.id === status || s.id.toLowerCase() === norm);
  const color = matched?.color;
  const label = matched?.label || status;

  switch (norm) {
    case 'complete':
    case 'done':
      return {
        bg: 'bg-emerald-950 text-emerald-400 border-emerald-800',
        label: label || 'Complete',
        icon: <Check className="w-3 h-3 text-emerald-400" />,
        style: undefined,
      };
    case 'in_review':
    case 'review':
      return {
        bg: 'bg-amber-950 text-amber-300 border-amber-800',
        label: label || 'In Review',
        icon: <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />,
        style: undefined,
      };
    case 'in_progress':
    case 'started':
      return {
        bg: 'bg-sky-950 text-sky-400 border-sky-800',
        label: label || 'In Progress',
        icon: <span className="w-2 h-2 rounded-full bg-sky-400" />,
        style: undefined,
      };
    case 'not_started':
    case 'planned':
      return {
        bg: 'bg-slate-900 text-slate-400 border-slate-700',
        label: label || 'Not Started',
        icon: <span className="w-2 h-2 rounded-full border border-slate-500" />,
        style: undefined,
      };
    default: {
      if (color) {
        return {
          bg: 'border',
          label: label,
          icon: <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />,
          style: {
            backgroundColor: `${color}20`,
            borderColor: `${color}60`,
            color: color,
          },
        };
      }
      return {
        bg: 'bg-slate-900 text-slate-400 border-slate-700',
        label: label || 'Not Started',
        icon: <span className="w-2 h-2 rounded-full border border-slate-500" />,
        style: undefined,
      };
    }
  }
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
  unit = 'pts',
  projectSettings,
  metricKey: propMetricKey,
  hierarchy,
}: TreeNodeCardProps) {
  const effectiveHierarchy =
    hierarchy && hierarchy.length > 0 ? hierarchy : projectSettings?.hierarchy || [];

  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [isAssigneeOpen, setIsAssigneeOpen] = useState(false);
  const statusTriggerRef = useRef<HTMLButtonElement | null>(null);
  const assigneeTriggerRef = useRef<HTMLButtonElement | null>(null);
  const statusMenuRef = useRef<HTMLDivElement | null>(null);
  const assigneeMenuRef = useRef<HTMLDivElement | null>(null);
  const [statusCoords, setStatusCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const [assigneeCoords, setAssigneeCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });

  const updateStatusPosition = useCallback(() => {
    if (statusTriggerRef.current) {
      const rect = statusTriggerRef.current.getBoundingClientRect();
      const menuWidth = 160;
      let left = rect.left;
      if (typeof window !== 'undefined' && left + menuWidth > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - menuWidth - 12);
      }

      const estimatedHeight = statusMenuRef.current?.offsetHeight || 180;
      const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
      const spaceBelow = windowHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;

      let top = rect.bottom + 4;
      if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
        top = Math.max(8, rect.top - estimatedHeight - 4);
      }

      setStatusCoords({
        top,
        left: Math.max(12, left),
      });
    }
  }, []);

  const updateAssigneePosition = useCallback(() => {
    if (assigneeTriggerRef.current) {
      const rect = assigneeTriggerRef.current.getBoundingClientRect();
      const menuWidth = 180;
      let left = rect.left;
      if (typeof window !== 'undefined' && left + menuWidth > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - menuWidth - 12);
      }

      const estimatedHeight = assigneeMenuRef.current?.offsetHeight || 220;
      const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
      const spaceBelow = windowHeight - rect.bottom - 8;
      const spaceAbove = rect.top - 8;

      let top = rect.bottom + 4;
      if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
        top = Math.max(8, rect.top - estimatedHeight - 4);
      }

      setAssigneeCoords({
        top,
        left: Math.max(12, left),
      });
    }
  }, []);

  useEffect(() => {
    if (!isStatusOpen) return;
    updateStatusPosition();
    const handleScrollResize = () => updateStatusPosition();
    const handleClickOutside = (e: MouseEvent) => {
      if (
        statusMenuRef.current &&
        !statusMenuRef.current.contains(e.target as Node) &&
        statusTriggerRef.current &&
        !statusTriggerRef.current.contains(e.target as Node)
      ) {
        setIsStatusOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsStatusOpen(false);
    };
    window.addEventListener('resize', handleScrollResize);
    window.addEventListener('scroll', handleScrollResize, true);
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', handleScrollResize);
      window.removeEventListener('scroll', handleScrollResize, true);
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isStatusOpen, updateStatusPosition]);

  useEffect(() => {
    if (!isAssigneeOpen) return;
    updateAssigneePosition();
    const handleScrollResize = () => updateAssigneePosition();
    const handleClickOutside = (e: MouseEvent) => {
      if (
        assigneeMenuRef.current &&
        !assigneeMenuRef.current.contains(e.target as Node) &&
        assigneeTriggerRef.current &&
        !assigneeTriggerRef.current.contains(e.target as Node)
      ) {
        setIsAssigneeOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsAssigneeOpen(false);
    };
    window.addEventListener('resize', handleScrollResize);
    window.addEventListener('scroll', handleScrollResize, true);
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', handleScrollResize);
      window.removeEventListener('scroll', handleScrollResize, true);
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAssigneeOpen, updateAssigneePosition]);

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
            <span
              className="shrink-0 max-w-[140px] truncate central-stage-ref-id"
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
          <div className="w-28 shrink-0 flex items-center justify-start md:justify-end text-right central-stage-track-rollup" data-testid="col-rollup-points">
            {(() => {
              const pointsRollup = (item as any).points_rollup;
              const childCount =
                (item as any).child_count !== undefined
                  ? (item as any).child_count
                  : (item.children && item.children.length > 0)
                  ? item.children.length
                  : (item.descendantCount ?? 0);
              const configuredKey = propMetricKey || (projectSettings ? getWorkMetricConfig(projectSettings).field_key : undefined);
              const rawIntrinsic = configuredKey
                ? (item.metadata?.[configuredKey] ?? (configuredKey === 'story_points' ? (item.metadata?.points ?? item.metadata?.estimate) : undefined))
                : (item.metadata?.story_points ?? item.metadata?.points ?? item.metadata?.estimate);
              const intrinsicPoints =
                rawIntrinsic !== undefined && !isNaN(Number(rawIntrinsic)) ? Number(rawIntrinsic) : undefined;

              if (pointsRollup !== undefined || pointMode !== undefined) {
                const effectiveRollup =
                  pointsRollup !== undefined
                    ? pointsRollup
                    : item.rollupPoints !== undefined
                    ? item.rollupPoints
                    : 0;

                return (
                  <span data-testid="tree-node-rollup-points-badge" className="whitespace-nowrap shrink-0">
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

          {/* Assignee Selector Track */}
          <div className="w-32 shrink-0 hidden md:flex items-center gap-1.5 truncate central-stage-track-assignee" data-testid="col-assignee">
            {/* Desktop wide text select */}
            {members && members.length > 0 ? (
              <div className="relative inline-flex items-center w-full central-stage-assignee-select">
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
              <span className="text-xs text-slate-400 flex items-center space-x-1 font-mono truncate central-stage-assignee-select">
                <User className="w-3 h-3 text-slate-500 shrink-0" />
                <span className="truncate">{item.assignee || 'Unassigned'}</span>
              </span>
            )}

            {/* Compact 22x22px Circular Avatar & Micro-Popover */}
            <button
              ref={assigneeTriggerRef}
              type="button"
              disabled={nodeIsImmutable}
              onClick={(e) => {
                e.stopPropagation();
                if (nodeIsImmutable) return;
                setIsAssigneeOpen((prev) => !prev);
              }}
              title={item.assignee || 'Unassigned'}
              data-testid={`assignee-avatar-btn-${item.id}`}
              className={`w-[22px] h-[22px] rounded-full shrink-0 flex items-center justify-center font-semibold text-[10px] border transition-all cursor-pointer central-stage-assignee-compact ${
                nodeIsImmutable
                  ? 'opacity-50 cursor-not-allowed bg-slate-900 border-slate-800 text-slate-500'
                  : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
              } ${item.assignee ? 'bg-slate-800 text-slate-200' : 'bg-slate-900 text-slate-500'} ${
                isAssigneeOpen ? 'ring-2 ring-emerald-400/60' : ''
              }`}
            >
              {item.assignee ? (
                <span>{item.assignee.trim().charAt(0).toUpperCase()}</span>
              ) : (
                <User className="w-3 h-3 text-slate-500" />
              )}
            </button>
          </div>

          {/* Status Selector Track */}
          <div className="w-36 shrink-0 flex items-center gap-1.5 flex-1 md:flex-initial max-w-[170px] md:max-w-none central-stage-track-status" data-testid="col-status">
            {/* Desktop wide text select */}
            {effectiveStatuses && effectiveStatuses.length > 0 ? (
              <select
                value={item.status}
                disabled={nodeIsImmutable}
                onChange={(e) => onUpdateStatus?.(item.id, e.target.value)}
                className={`w-full text-xs rounded px-2 py-1 font-mono focus:outline-none cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed truncate central-stage-status-select ${
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
                className={`text-xs font-mono px-2 py-0.5 rounded flex-shrink-0 central-stage-status-select ${
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

            {/* Compact 20x20px Status Indicator Glyph & Micro-Popover */}
            {(() => {
              const glyph = getStatusGlyph(item.status, effectiveStatuses);
              const statusLabel =
                effectiveStatuses?.find((s) => s.id === item.status)?.label || glyph.label;
              return (
                <button
                  ref={statusTriggerRef}
                  type="button"
                  disabled={nodeIsImmutable}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (nodeIsImmutable) return;
                    setIsStatusOpen((prev) => !prev);
                  }}
                  style={glyph.style}
                  title={nodeIsImmutable ? `${statusLabel} (Locked)` : `Status: ${statusLabel}`}
                  data-testid={`status-icon-btn-${item.id}`}
                  className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 border transition-all cursor-pointer central-stage-status-compact ${
                    glyph.bg
                  } ${
                    nodeIsImmutable
                      ? 'opacity-50 cursor-not-allowed'
                      : 'hover:ring-2 hover:ring-slate-500/40'
                  } ${isStatusOpen ? 'ring-2 ring-emerald-400/60' : ''}`}
                >
                  {glyph.icon}
                </button>
              );
            })()}

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

      {/* Portaled Assignee Micro-Popover (TASK-TRK-TREE-COMPACT-DROPDOWNS-TO-ICONS) */}
      {isAssigneeOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={assigneeMenuRef}
          data-testid={`assignee-popover-${item.id}`}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 bg-slate-900 border border-slate-800 rounded-lg p-1.5 shadow-2xl min-w-[180px] max-h-60 overflow-y-auto custom-scrollbar text-xs font-mono space-y-0.5 animate-in fade-in-0 zoom-in-95"
          style={{ top: `${assigneeCoords.top}px`, left: `${assigneeCoords.left}px` }}
        >
          <div className="px-2 py-1 text-[10px] text-slate-500 font-sans font-semibold uppercase tracking-wider border-b border-slate-800 mb-1">
            Assign Member
          </div>
          <button
            type="button"
            onClick={() => {
              onUpdateAssignee?.(item.id, null);
              setIsAssigneeOpen(false);
            }}
            className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer ${
              !item.assignee
                ? 'bg-slate-800 text-white font-semibold'
                : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
            }`}
            data-testid="assignee-option-unassigned"
          >
            <User className="w-3.5 h-3.5 text-slate-500" />
            <span className="truncate">Unassigned</span>
            {!item.assignee && <Check className="w-3 h-3 ml-auto text-emerald-400" />}
          </button>
          {members.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => {
                onUpdateAssignee?.(item.id, m.name);
                setIsAssigneeOpen(false);
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer ${
                item.assignee === m.name
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
              }`}
              data-testid={`assignee-option-${m.id}`}
            >
              <span className="w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[9px] font-bold flex items-center justify-center text-slate-300 shrink-0">
                {m.name.charAt(0).toUpperCase()}
              </span>
              <span className="truncate">{m.name}</span>
              {item.assignee === m.name && <Check className="w-3 h-3 ml-auto text-emerald-400" />}
            </button>
          ))}
        </div>,
        document.body
      )}

      {/* Portaled Status Micro-Popover (TASK-TRK-TREE-COMPACT-DROPDOWNS-TO-ICONS) */}
      {isStatusOpen && typeof document !== 'undefined' && createPortal(
        <div
          ref={statusMenuRef}
          data-testid={`status-popover-${item.id}`}
          onClick={(e) => e.stopPropagation()}
          className="fixed z-50 bg-slate-900 border border-slate-800 rounded-lg p-1.5 shadow-2xl min-w-[160px] max-h-60 overflow-y-auto custom-scrollbar text-xs font-mono space-y-0.5 animate-in fade-in-0 zoom-in-95"
          style={{ top: `${statusCoords.top}px`, left: `${statusCoords.left}px` }}
        >
          <div className="px-2 py-1 text-[10px] text-slate-500 font-sans font-semibold uppercase tracking-wider border-b border-slate-800 mb-1">
            Update Status
          </div>
          {(effectiveStatuses || []).map((st) => {
            const isSelected = item.status === st.id;
            return (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  onUpdateStatus?.(item.id, st.id);
                  setIsStatusOpen(false);
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
                data-testid={`status-option-${st.id}`}
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: st.color || '#94a3b8' }}
                />
                <span className="truncate">{st.label}</span>
                {isSelected && <Check className="w-3 h-3 ml-auto text-emerald-400" />}
              </button>
            );
          })}
        </div>,
        document.body
      )}
    </div>
  );
}
