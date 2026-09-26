'use client';

import React from 'react';
import {
  ChevronDown,
  GripVertical,
  Lock,
  Pencil,
  Trash2,
  User,
} from 'lucide-react';
import { WorkItem, HierarchyLevel, StatusDefinition, Project } from '@/types/tracker';
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
  itemHierarchy: HierarchyLevel[];
  allProjects?: any[];
  isAllProjects?: boolean;
  isCardImmutable?: boolean;
  isReadOnly?: boolean;
  isBeingDragged?: boolean;
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
  itemHierarchy,
  allProjects = [],
  isAllProjects = false,
  isCardImmutable = false,
  isReadOnly = false,
  isBeingDragged = false,
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

  const rawPoints =
    item.metadata?.story_points ?? item.metadata?.points ?? item.metadata?.estimate;
  const storyPoints = rawPoints !== undefined ? Number(rawPoints) : undefined;

  const statuses = getItemStatuses ? getItemStatuses(item) : [];

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
          href={typeof window !== 'undefined' ? (() => { try { const sp = new URLSearchParams(window.location.search); sp.set('item', item.external_ref_id || item.id); return `?${sp.toString()}`; } catch { return `?item=${encodeURIComponent(item.external_ref_id || item.id)}`; } })() : `?item=${encodeURIComponent(item.external_ref_id || item.id)}`}
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

