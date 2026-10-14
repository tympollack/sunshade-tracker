'use client';

import React from 'react';
import {
  ChevronDown,
  Clock,
  AlertCircle,
  GripVertical,
  Lock,
  Pencil,
  Trash2,
  User,
  Eye,
} from 'lucide-react';
import { WorkItem, HierarchyLevel, StatusDefinition, Project, ProjectSettings, getWorkMetricConfig } from '@/types/tracker';
import { CopyableRefId } from '@/components/CopyableRefId';
import { GitHubBadge } from '@/components/GitHubBadge';
import { extractGitHubMetadata } from '@/lib/github-metadata';
import { getHierarchyLevelColor } from '@/lib/hierarchy-colors';
import { DualPointBadge } from '@/components/DualPointBadge';
import { SpYieldBadge } from '@/components/board/SpYieldBadge';

function formatCardTimestamp(dateString?: string): string | null {
  if (!dateString) return null;
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return null;
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);
  if (diffSec < 60) return 'just now';
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHour = Math.floor(diffMin / 60);
  if (diffHour < 24) return `${diffHour}h ago`;
  const diffDay = Math.floor(diffHour / 24);
  if (diffDay < 7) return `${diffDay}d ago`;
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

export interface KanbanCardProps {
  item: WorkItem & { child_count?: number; points_rollup?: number };
  childCount?: number;
  rollupPoints?: number;
  pointMode?: 'macro' | 'granular';
  medianCycleTime?: number;
  itemHierarchy: HierarchyLevel[];
  allProjects?: any[];
  isAllProjects?: boolean;
  projectSettings?: ProjectSettings;
  isCardImmutable?: boolean;
  isReadOnly?: boolean;
  isBeingDragged?: boolean;
  compact?: boolean;
  onEditItem?: (item: WorkItem) => void;
  onDeleteItem?: (item: WorkItem) => void;
  onUpdateStatus?: (itemId: string, newStatus: string) => void;
  onUpdateType?: (itemId: string, newType: string) => void;
  getItemStatuses?: (item: WorkItem) => StatusDefinition[];
  onDragStart?: (e: React.DragEvent, item: WorkItem) => void;
  onDragEnd?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

/**
 * Kanban board card component rendering work item details, hierarchy level selector,
 * drag-and-drop handles, and dual intrinsic vs. rollup point badges (FEAT-TRK-DUAL-POINT-BADGE-UI).
 */
export const KanbanCard: React.FC<KanbanCardProps> = ({
  item,
  childCount: propChildCount,
  rollupPoints: propRollupPoints,
  pointMode = 'granular',
  medianCycleTime: propMedianCycleTime,
  itemHierarchy,
  allProjects = [],
  isAllProjects = false,
  projectSettings,
  isCardImmutable = false,
  isReadOnly = false,
  isBeingDragged = false,
  compact = true,
  onEditItem,
  onDeleteItem,
  onUpdateStatus,
  onUpdateType,
  getItemStatuses,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
}) => {
  const [isDescExpanded, setIsDescExpanded] = React.useState(false);
  const lvlColor = getHierarchyLevelColor(item.item_type, itemHierarchy);

  const effectiveChildCount =
    propChildCount !== undefined
      ? propChildCount
      : item.child_count !== undefined
      ? item.child_count
      : 0;

  const effectiveRollupPoints =
    propRollupPoints !== undefined
      ? propRollupPoints
      : item.points_rollup !== undefined
      ? item.points_rollup
      : 0;

  const workMetric = getWorkMetricConfig(projectSettings);
  const rawPoints =
    item.metadata?.[workMetric.field_key] ??
    (workMetric.field_key === 'story_points'
      ? (item.metadata?.points ?? item.metadata?.estimate)
      : undefined);
  const storyPoints = rawPoints !== undefined ? Number(rawPoints) : undefined;

  const statuses = getItemStatuses ? getItemStatuses(item) : [];

  // Aging / cycle time anomaly radar logic (TASK-TRK-UI-AGING-RADAR)
  const rawCycleTime = item.metadata?.cycle_time_days;
  const inProgressTimestamp =
    item.metadata?.started_at ||
    item.metadata?.in_progress_at ||
    item.metadata?.wip_started_at ||
    item.created_at;

  const computedCycleTime =
    rawCycleTime !== undefined
      ? Number(rawCycleTime)
      : item.status === 'in_progress' && inProgressTimestamp
      ? Math.max(
          0,
          Math.floor((Date.now() - new Date(inProgressTimestamp).getTime()) / (1000 * 60 * 60 * 24))
        )
      : undefined;
  const cycleTimeDays = computedCycleTime;
  const medianCycleTime =
    propMedianCycleTime ??
    (item.metadata?.median_cycle_time ? Number(item.metadata?.median_cycle_time) : 5);

  const isSevereStalled =
    cycleTimeDays !== undefined && !isNaN(cycleTimeDays) && cycleTimeDays > 2.5 * medianCycleTime;
  const isAgingInProgress =
    cycleTimeDays !== undefined &&
    !isNaN(cycleTimeDays) &&
    cycleTimeDays > 1.5 * medianCycleTime &&
    item.status === 'in_progress';

  // Explicit or computed flags (TASK-TRK-CARD-FLAG-BADGES & PR-82 review comment 2)
  const normalizedFlags = React.useMemo(() => {
    const set = new Set<string>();
    const extract = (val: unknown) => {
      if (typeof val === 'string') {
        val.split(',').forEach((f) => {
          const trimmed = f.trim().toLowerCase();
          if (trimmed) set.add(trimmed);
        });
      } else if (Array.isArray(val)) {
        val.forEach((f) => {
          if (typeof f === 'string' && f.trim()) {
            set.add(f.trim().toLowerCase());
          }
        });
      }
    };
    extract(item.metadata?.flag);
    extract(item.metadata?.flags);
    return set;
  }, [item.metadata?.flag, item.metadata?.flags]);

  const hasFlag = (f: string) => normalizedFlags.has(f.toLowerCase().trim());

  const isStalled = isSevereStalled || hasFlag('stall') || hasFlag('stalled');
  const isAging = (!isStalled && isAgingInProgress) || hasFlag('aging');
  const isReview = hasFlag('review') || hasFlag('in_review') || Boolean(item.metadata?.needs_review);

  if (compact) {
    return (
      <div
        draggable={!isCardImmutable && !isReadOnly && Boolean(onDragStart)}
        onDragStart={(e) => onDragStart?.(e, item)}
        onDragEnd={onDragEnd}
        onDragOver={onDragOver}
        onDrop={onDrop}
        onClick={(e) => {
          const target = e.target as HTMLElement;
          if (target.closest('button, select, input, a')) return;
          onEditItem?.(item);
        }}
        onDoubleClick={() => onEditItem?.(item)}
        data-testid={`kanban-card-${item.id}`}
        className={`p-2.5 rounded-lg border bg-slate-900/90 hover:bg-slate-900 cursor-pointer transition-all flex flex-col justify-between min-h-[76px] max-h-[88px] shadow-sm group hover:border-slate-700 ${
          isCardImmutable || isReadOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
        } ${
          isBeingDragged
            ? 'opacity-40 border-dashed border-emerald-500'
            : isStalled
            ? 'border-red-500/50 hover:border-red-500/70 border-l-4 border-l-red-500'
            : isAging
            ? 'border-amber-500/40 hover:border-amber-500/60 border-l-4 border-l-amber-500'
            : isReview
            ? 'border-purple-500/40 hover:border-purple-500/60 border-l-4 border-l-purple-500'
            : 'border-slate-800'
        }`}
      >
        {/* Line 1: Identity & Points */}
        <div className="flex items-center justify-between text-xs gap-2 min-w-0 w-full mb-2">
          <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap sm:flex-nowrap">
            <GripVertical className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -ml-1" />

            {/* Static Level Badge */}
            <div className="relative inline-flex items-center shrink-0">
              <span
                style={{
                  backgroundColor: '#090d16',
                  color: lvlColor.hex,
                  borderColor: `${lvlColor.hex}50`,
                }}
                className="text-[10px] font-mono font-semibold rounded px-1.5 py-0.5 border shadow-sm shrink-0"
                title={`Hierarchy level: ${itemHierarchy.find((h) => h.type === item.item_type)?.label || item.item_type}`}
              >
                {itemHierarchy.find((h) => h.type === item.item_type)?.label || item.item_type}
              </span>
            </div>

            {/* Work Item Reference ID */}
            {item.external_ref_id ? (
              <CopyableRefId
                id={item.external_ref_id}
                showHash
                className="text-[10px] font-mono shrink-0 truncate max-w-[140px] text-slate-400"
              />
            ) : (
              <CopyableRefId
                id={item.id}
                displayId={item.id.slice(0, 8)}
                showHash
                className="text-[10px] font-mono shrink-0 text-slate-400"
                title="Click to copy UUID"
              />
            )}

            {isAllProjects && (
              <span
                className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/50 font-sans truncate max-w-[80px] shrink-0"
                title={allProjects.find((p) => p.id === item.project_id)?.name || item.project_id}
              >
                {allProjects.find((p) => p.id === item.project_id)?.name || 'Project'}
              </span>
            )}
          </div>

          <div className="flex items-center space-x-1 shrink-0 ml-auto">
            {/* Dual Point Badge */}
            <DualPointBadge
              storyPoints={storyPoints}
              rollupPoints={effectiveRollupPoints}
              childCount={effectiveChildCount}
              pointMode={pointMode}
              unit={workMetric.unit_label || 'pts'}
              className="shrink-0"
            />

            {(item.metadata?.yield_amount !== undefined || item.metadata?.sp_yield !== undefined) && (
              <SpYieldBadge
                storyPoints={storyPoints}
                yieldAmount={
                  item.metadata?.yield_amount !== undefined
                    ? Number(item.metadata?.yield_amount)
                    : item.metadata?.sp_yield !== undefined
                    ? Number(item.metadata?.sp_yield)
                    : undefined
                }
                feeAmount={item.metadata?.fee_amount !== undefined ? Number(item.metadata?.fee_amount) : 0}
                className="shrink-0"
              />
            )}

            {/* Compact Flag Badges (TASK-TRK-CARD-FLAG-BADGES & PR-82 review comment 3) */}
            {isStalled && (
              <span
                className="w-5 h-5 flex items-center justify-center rounded bg-red-950/80 text-red-400 border border-red-800/60 shrink-0"
                title={
                  isSevereStalled && cycleTimeDays !== undefined
                    ? `Cycle time (${cycleTimeDays}d) exceeds 2.5x project median (${medianCycleTime}d)`
                    : 'Stalled Review'
                }
                data-testid={`card-stalled-badge-${item.id}`}
              >
                <AlertCircle className="w-3.5 h-3.5 text-red-400" />
                <span className="sr-only">Stalled Review</span>
              </span>
            )}

            {!isStalled && isAging && (
              <span
                className="w-5 h-5 flex items-center justify-center rounded bg-amber-950/80 text-amber-400 border border-amber-800/60 shrink-0"
                title={
                  isAgingInProgress && cycleTimeDays !== undefined
                    ? `Cycle time (${cycleTimeDays}d) exceeds 1.5x project median (${medianCycleTime}d)`
                    : 'Aging in progress'
                }
                data-testid={`card-aging-badge-${item.id}`}
              >
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="sr-only">
                  {cycleTimeDays !== undefined ? `${cycleTimeDays}d in progress` : 'Aging in progress'}
                </span>
              </span>
            )}

            {isReview && (
              <span
                className="w-5 h-5 flex items-center justify-center rounded bg-purple-950/80 text-purple-400 border border-purple-800/60 shrink-0"
                title="Needs Review"
                data-testid={`card-review-badge-${item.id}`}
              >
                <Eye className="w-3.5 h-3.5 text-purple-400" />
                <span className="sr-only">Needs Review</span>
              </span>
            )}

            {isCardImmutable && (
              <span
                className="flex items-center space-x-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/50 shrink-0 font-sans"
                title="Completed item in closed sprint (immutable)"
              >
                <Lock className="w-2.5 h-2.5 text-purple-400" />
                <span>Locked</span>
              </span>
            )}
          </div>
        </div>

        {/* Line 2: Title */}
        <div className="min-w-0">
          <a
            href={
              typeof window !== 'undefined'
                ? (() => {
                    try {
                      const sp = new URLSearchParams(window.location.search);
                      sp.set('item', item.external_ref_id || item.id);
                      return `?${sp.toString()}`;
                    } catch {
                      return `?item=${encodeURIComponent(item.external_ref_id || item.id)}`;
                    }
                  })()
                : `?item=${encodeURIComponent(item.external_ref_id || item.id)}`
            }
            data-testid={`kanban-card-link-${item.id}`}
            onClick={(e) => {
              if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
              e.preventDefault();
              onEditItem?.(item);
            }}
            title={item.title}
            className="text-xs font-medium text-slate-100 hover:text-emerald-400 block leading-tight break-words line-clamp-2 transition-colors cursor-pointer"
          >
            {item.title}
          </a>
        </div>

        {/* Line 3: Context & Ownership */}
        <div className="flex items-center text-[11px] text-slate-400 gap-2 min-w-0">
          <div className="flex items-center space-x-1.5 min-w-0 truncate">
            <User className="w-3 h-3 text-slate-500 shrink-0" />
            <span className="font-mono truncate text-slate-400 max-w-[90px]">
              {item.assignee || 'unassigned'}
            </span>
            {item.metadata?.priority && (
              <span className="text-[10px] text-slate-400 shrink-0">
                · {String(item.metadata.priority)}
              </span>
            )}
            {effectiveChildCount > 0 && (
              <span className="text-[10px] text-slate-500 font-mono shrink-0">
                · ({effectiveChildCount} {effectiveChildCount === 1 ? 'task' : 'tasks'})
              </span>
            )}
          </div>
          {item.created_at && (
            <span
              data-testid={`card-timestamp-${item.id}`}
              title={`Created ${new Date(item.created_at).toLocaleString()}`}
              className="text-[10px] text-slate-500 font-mono whitespace-nowrap shrink-0 ml-auto"
            >
              {formatCardTimestamp(item.created_at)}
            </span>
          )}
        </div>
      </div>
    );
  }

  return (
    <div
      draggable={!isCardImmutable && !isReadOnly && Boolean(onDragStart)}
      onDragStart={(e) => onDragStart?.(e, item)}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDoubleClick={() => onEditItem?.(item)}
      data-testid={`kanban-card-${item.id}`}
      className={`p-3.5 rounded-xl bg-slate-950 border transition-all space-y-2.5 shadow-sm group hover:border-slate-700 max-h-[380px] overflow-y-auto overscroll-contain custom-scrollbar ${
        isCardImmutable || isReadOnly ? 'cursor-default' : 'cursor-grab active:cursor-grabbing'
      } ${
        isBeingDragged
          ? 'opacity-40 border-dashed border-emerald-500'
          : isStalled
          ? 'border-red-500/50 hover:border-red-500/70 border-l-4 border-l-red-500'
          : isAging
          ? 'border-amber-500/40 hover:border-amber-500/60 border-l-4 border-l-amber-500'
          : isReview
          ? 'border-purple-500/40 hover:border-purple-500/60 border-l-4 border-l-purple-500'
          : 'border-slate-800/90'
      }`}
    >
      {/* Card Top: Level Selector Badge, Reference ID, Dual Point Badge, Project Badge, Edit & Delete */}
      <div className="flex items-center justify-between text-xs gap-2 min-w-0 w-full mb-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap sm:flex-nowrap">
          <GripVertical className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -ml-1" />

          {/* Quick Level Selector */}
          <div className="relative inline-flex items-center shrink-0">
            <select
              value={item.item_type}
              disabled={isCardImmutable || isReadOnly}
              onChange={(e) => {
                e.stopPropagation();
                onUpdateType?.(item.id, e.target.value);
              }}
              onClick={(e) => e.stopPropagation()}
              style={{
                backgroundColor: '#090d16',
                color: lvlColor.hex,
                borderColor: `${lvlColor.hex}50`,
              }}
              className="appearance-none text-[10px] font-mono font-semibold rounded pl-2 pr-5 py-0.5 border focus:outline-none cursor-pointer transition-colors shadow-sm shrink-0"
              title="Change hierarchy level"
            >
              {itemHierarchy.map((h) => (
                <option
                  key={h.type}
                  value={h.type}
                  className="bg-slate-900 text-white font-sans"
                >
                  {h.label}
                </option>
              ))}
            </select>
            <ChevronDown
              className="w-2.5 h-2.5 absolute right-1.5 pointer-events-none"
              style={{ color: lvlColor.hex }}
            />
          </div>

          {/* Work Item Reference ID */}
          {item.external_ref_id ? (
            <CopyableRefId
              id={item.external_ref_id}
              showHash
              className="text-[10px] font-mono shrink-0 truncate max-w-[140px]"
            />
          ) : (
            <CopyableRefId
              id={item.id}
              displayId={item.id.slice(0, 8)}
              showHash
              className="text-[10px] font-mono shrink-0"
              title="Click to copy UUID"
            />
          )}

          {/* Dual Point Badge */}
          <DualPointBadge
            storyPoints={storyPoints}
            rollupPoints={effectiveRollupPoints}
            childCount={effectiveChildCount}
            pointMode={pointMode}
            unit={workMetric.unit_label || 'pts'}
            className="shrink-0"
          />

          {(item.metadata?.yield_amount !== undefined || item.metadata?.sp_yield !== undefined) && (
            <SpYieldBadge
              storyPoints={storyPoints}
              yieldAmount={
                item.metadata?.yield_amount !== undefined
                  ? Number(item.metadata?.yield_amount)
                  : item.metadata?.sp_yield !== undefined
                  ? Number(item.metadata?.sp_yield)
                  : undefined
              }
              feeAmount={item.metadata?.fee_amount !== undefined ? Number(item.metadata?.fee_amount) : 0}
              className="shrink-0"
            />
          )}

          {isAllProjects && (
            <span
              className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/50 font-sans truncate max-w-[90px] shrink-0"
              title={allProjects.find((p) => p.id === item.project_id)?.name || item.project_id}
            >
              {allProjects.find((p) => p.id === item.project_id)?.name || 'Project'}
            </span>
          )}
        </div>

        <div className="flex items-center space-x-1 shrink-0 ml-auto">
          {/* Compact Flag Badges (TASK-TRK-CARD-FLAG-BADGES & PR-82 review comment 3) */}
          {isStalled && (
            <span
              className="w-5 h-5 flex items-center justify-center rounded bg-red-950/80 text-red-400 border border-red-800/60 shrink-0"
              title={
                isSevereStalled && cycleTimeDays !== undefined
                  ? `Cycle time (${cycleTimeDays}d) exceeds 2.5x project median (${medianCycleTime}d)`
                  : 'Stalled Review'
              }
              data-testid={`card-stalled-badge-${item.id}`}
            >
              <AlertCircle className="w-3.5 h-3.5 text-red-400" />
              <span className="sr-only">Stalled Review</span>
            </span>
          )}

          {!isStalled && isAging && (
            <span
              className="w-5 h-5 flex items-center justify-center rounded bg-amber-950/80 text-amber-400 border border-amber-800/60 shrink-0"
              title={
                isAgingInProgress && cycleTimeDays !== undefined
                  ? `Cycle time (${cycleTimeDays}d) exceeds 1.5x project median (${medianCycleTime}d)`
                  : 'Aging in progress'
              }
              data-testid={`card-aging-badge-${item.id}`}
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span className="sr-only">
                {cycleTimeDays !== undefined ? `${cycleTimeDays}d in progress` : 'Aging in progress'}
              </span>
            </span>
          )}

          {isReview && (
            <span
              className="w-5 h-5 flex items-center justify-center rounded bg-purple-950/80 text-purple-400 border border-purple-800/60 shrink-0"
              title="Needs Review"
              data-testid={`card-review-badge-${item.id}`}
            >
              <Eye className="w-3.5 h-3.5 text-purple-400" />
              <span className="sr-only">Needs Review</span>
            </span>
          )}

          {isCardImmutable && (
            <span
              className="flex items-center space-x-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/50 shrink-0 font-sans"
              title="Completed item in closed sprint (immutable)"
            >
              <Lock className="w-2.5 h-2.5 text-purple-400" />
              <span>Locked</span>
            </span>
          )}
          {onEditItem && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onEditItem(item);
              }}
              className="p-1 rounded text-slate-600 hover:text-white hover:bg-slate-900 transition-all opacity-0 group-hover:opacity-100"
              title="Edit work item"
              data-testid={`edit-item-btn-${item.id}`}
            >
              <Pencil className="w-3 h-3" />
            </button>
          )}
          {!isCardImmutable && onDeleteItem && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onDeleteItem(item);
              }}
              className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-slate-900 transition-all opacity-0 group-hover:opacity-100"
              title="Delete item"
              data-testid={`delete-item-btn-${item.id}`}
            >
              <Trash2 className="w-3 h-3" />
            </button>
          )}
        </div>
      </div>

      {/* Card Title & Description Toggle */}
      <div className="flex items-start justify-between gap-1.5 min-w-0">
        <a
          href={
            typeof window !== 'undefined'
              ? (() => {
                  try {
                    const sp = new URLSearchParams(window.location.search);
                    sp.set('item', item.external_ref_id || item.id);
                    return `?${sp.toString()}`;
                  } catch {
                    return `?item=${encodeURIComponent(item.external_ref_id || item.id)}`;
                  }
                })()
              : `?item=${encodeURIComponent(item.external_ref_id || item.id)}`
          }
          data-testid={`kanban-card-link-${item.id}`}
          onClick={(e) => {
            if (e.metaKey || e.ctrlKey || e.shiftKey || e.button === 1) return;
            e.preventDefault();
            onEditItem?.(item);
          }}
          className="text-sm font-medium text-slate-100 leading-snug min-w-0 flex-1 break-words line-clamp-2 hover:text-emerald-400 transition-colors cursor-pointer"
        >
          {item.title}
        </a>
        {item.description && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setIsDescExpanded((prev) => !prev);
            }}
            aria-expanded={isDescExpanded}
            aria-label={isDescExpanded ? 'Collapse description' : 'Expand description'}
            data-testid={`card-expand-desc-btn-${item.id}`}
            title={item.description}
            className="p-1 -mr-1 -mt-0.5 text-slate-500 hover:text-slate-300 rounded transition-colors shrink-0 cursor-pointer hover:bg-slate-900 touch-manipulation"
          >
            <ChevronDown
              className={`w-3.5 h-3.5 transition-transform duration-200 ${
                isDescExpanded ? 'rotate-180' : ''
              }`}
            />
          </button>
        )}
      </div>

      {/* Card Description */}
      {item.description && (
        <p
          title={item.description}
          data-testid={`card-description-${item.id}`}
          onClick={(e) => e.stopPropagation()}
          className={`text-xs text-slate-400 leading-relaxed transition-all break-words ${
            isDescExpanded ? 'line-clamp-none' : 'line-clamp-2'
          }`}
        >
          {item.description}
        </p>
      )}

      {/* Metadata tags */}
      {item.metadata && Object.keys(item.metadata).length > 0 && (() => {
        const parentProject = allProjects?.find((p) => p.id === item.project_id || p.slug === item.project_id);
        const parentGithubRepo = parentProject?.settings?.github_repo || parentProject?.settings?.github_repository;
        const { prUrl, commitHash, isGitHubField, repo, owner } = extractGitHubMetadata(item.metadata, parentGithubRepo);
        const nonGitHubEntries = Object.entries(item.metadata).filter(([k]) => {
          if (isGitHubField(k)) return false;
          // Filter out points/sprint already rendered in headers/badges to keep card clean
          if (['story_points', 'points', 'estimate'].includes(k)) return false;
          return true;
        });
        const hasAnyDisplay = prUrl || commitHash || nonGitHubEntries.length > 0;
        if (!hasAnyDisplay) return null;

        return (
          <div className="flex flex-wrap gap-1 pt-0.5">
            {prUrl && (
              <GitHubBadge
                type="pr"
                value={prUrl}
                repo={repo}
                owner={owner}
              />
            )}
            {commitHash && (
              <GitHubBadge
                type="commit"
                value={commitHash}
                prUrl={prUrl}
                repo={repo}
                owner={owner}
              />
            )}
            {nonGitHubEntries.map(([k, v]) => {
              const rawVal = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
              const displayVal = rawVal.replace(/\s+/g, ' ').trim();
              const truncated = displayVal.length > 28 ? displayVal.slice(0, 28) + '...' : displayVal;
              return (
                <span
                  key={k}
                  title={`${k}: ${rawVal}`}
                  className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800/60 font-mono max-w-full truncate inline-block"
                >
                  <span className="text-slate-500">{k}:</span> {truncated}
                </span>
              );
            })}
          </div>
        );
      })()}

      {/* Card Bottom: Assignee, Timestamp & Quick Status Select */}
      <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-xs text-slate-400 gap-2">
        <div className="flex items-center space-x-1.5 min-w-0 flex-1">
          <User className="w-3 h-3 text-slate-500 shrink-0" />
          <span className="text-[11px] font-mono truncate text-slate-400 max-w-[100px]">
            {item.assignee || 'unassigned'}
          </span>
          {item.created_at && (
            <span
              data-testid={`card-timestamp-${item.id}`}
              title={`Created ${new Date(item.created_at).toLocaleString()}`}
              className="text-[10px] text-slate-500 font-mono whitespace-nowrap shrink-0"
            >
              · {formatCardTimestamp(item.created_at)}
            </span>
          )}
        </div>
        {statuses.length > 0 && onUpdateStatus && (
          <select
            value={item.status}
            onChange={(e) => {
              e.stopPropagation();
              onUpdateStatus(item.id, e.target.value);
            }}
            onClick={(e) => e.stopPropagation()}
            disabled={isCardImmutable || isReadOnly}
            className="text-[10px] bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-300 focus:outline-none hover:border-slate-700 cursor-pointer"
          >
            {statuses.map((st) => (
              <option key={st.id} value={st.id}>
                → {st.label}
              </option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
};

