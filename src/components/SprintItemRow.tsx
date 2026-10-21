'use client';

import React from 'react';
import {
  CheckSquare,
  MinusSquare,
  Square,
  Lock,
  User,
  Pencil,
  AlertTriangle,
} from 'lucide-react';
import { WorkItem, HierarchyLevel, StatusDefinition } from '@/types/tracker';
import { getHierarchyLevelColor } from '@/lib/hierarchy-colors';
import { GitHubBadge } from '@/components/GitHubBadge';
import { extractGitHubMetadata } from '@/lib/github-metadata';
import { SchemaDeviation } from '@/lib/schema-deviation';
import { CopyableRefId } from '@/components/CopyableRefId';
import { SprintStatusSelect } from '@/components/sprint/SprintStatusSelect';

export interface SprintItemRowProps {
  item: WorkItem;
  depth?: number;
  isSelected: boolean;
  isIndeterminate?: boolean;
  onToggleSelect: (itemId: string, e: React.MouseEvent) => void;
  isImmutable: boolean;
  onEditItem: (item: WorkItem) => void;
  getItemHierarchy: (item: WorkItem) => HierarchyLevel[];
  getItemStatuses: (item: WorkItem) => StatusDefinition[];
  deviations?: SchemaDeviation[];
  onOpenReconciliation?: (dev: SchemaDeviation) => void;
  isAllProjects?: boolean;
  allProjects?: Array<{ id: string; name: string; slug?: string; settings?: any }>;
  projectSettings?: any;
  onUpdateStatus?: (itemId: string, status: string) => void;
  onUpdateSprint?: (itemId: string, sprint: string) => void;
  availableSprints?: string[];
  currentSprintName?: string;
  isTreeMode?: boolean;
  childCount?: number;
  rollupPoints?: number;
  pointMode?: 'macro' | 'granular';
}

export const SprintItemRow: React.FC<SprintItemRowProps> = ({
  item,
  depth = 0,
  isSelected,
  isIndeterminate = false,
  onToggleSelect,
  isImmutable,
  onEditItem,
  getItemHierarchy,
  getItemStatuses,
  deviations = [],
  onOpenReconciliation,
  isAllProjects = false,
  allProjects = [],
  projectSettings,
  onUpdateStatus,
  onUpdateSprint,
  availableSprints = [],
  currentSprintName,
  isTreeMode = false,
  childCount = 0,
  rollupPoints = 0,
  pointMode,
}) => {
  const itemHierarchy = getItemHierarchy(item);
  const lvlColor = getHierarchyLevelColor(item.item_type, itemHierarchy);
  const points = item.metadata?.story_points ?? item.metadata?.points ?? item.metadata?.estimate;
  const itemDevs = deviations.filter((d) => d.itemId === item.id);
  const parentProject = (allProjects as any[])?.find((p) => p.id === item.project_id || p.slug === item.project_id);
  const parentGithubRepo = parentProject?.settings?.github_repo || parentProject?.settings?.github_repository || projectSettings?.github_repo;
  const { prUrl, commitHash, repo, owner } = extractGitHubMetadata(item.metadata, parentGithubRepo);

  return (
    <div
      onDoubleClick={() => onEditItem(item)}
      className={`p-3 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-1.5 md:gap-3 group relative min-w-0 w-full ${
        isSelected
          ? 'bg-emerald-950/30 border-l-2 border-emerald-400'
          : 'hover:bg-slate-800/30'
      }`}
      style={
        isTreeMode && depth > 0
          ? {
              marginLeft: `${depth * 24}px`,
              width: `calc(100% - ${depth * 24}px)`,
              maxWidth: `calc(100% - ${depth * 24}px)`,
            }
          : undefined
      }
      data-testid="sprint-item-row"
    >
      {/* Primary Row (Tier 1 on mobile, left section on desktop) */}
      <div className="flex items-center justify-between w-full md:w-auto md:flex-1 min-w-0 gap-2">
        {/* Left Section: Selection checkbox, type indicator, ref, title, lock */}
        <div className="flex-1 min-w-0 flex items-center gap-2 overflow-hidden">
          {/* Tree Branch Connector */}
          {isTreeMode && depth > 0 && (
            <div
              data-testid="tree-branch-connector"
              className="w-3.5 h-6 border-b-2 border-l-2 border-slate-700 -mt-3.5 rounded-bl-sm shrink-0"
            />
          )}

          {/* Selection Checkbox */}
          <button
            type="button"
            onClick={(e) => onToggleSelect(item.id, e)}
            className="p-1 text-slate-500 hover:text-white transition-colors shrink-0 cursor-pointer"
            title={
              isSelected
                ? 'Deselect item'
                : isIndeterminate
                ? 'Some child tasks selected (click to select all)'
                : 'Select item (Shift+Click for range)'
            }
            aria-label={isSelected ? `Deselect ${item.title}` : `Select ${item.title}`}
            data-testid={`sprint-item-checkbox-${item.id}`}
          >
            <input
              type="checkbox"
              className="sr-only"
              checked={isSelected}
              ref={(el) => {
                if (el) el.indeterminate = Boolean(isIndeterminate);
              }}
              readOnly
              tabIndex={-1}
            />
            {isSelected ? (
              <CheckSquare className="w-4 h-4 text-emerald-400" />
            ) : isIndeterminate ? (
              <MinusSquare className="w-4 h-4 text-emerald-400" data-testid="indeterminate-checkbox" />
            ) : (
              <Square className="w-4 h-4 text-slate-600 group-hover:text-slate-400" />
            )}
          </button>

          {/* Level Badge */}
          <span
            title={item.item_type}
            className={`shrink-0 inline-flex items-center text-xs font-mono font-semibold rounded px-2 py-0.5 border whitespace-nowrap max-w-[130px] sm:max-w-[160px] truncate ${lvlColor.badgeBg} ${lvlColor.badgeText} ${lvlColor.badgeBorder}`}
          >
            {item.item_type}
          </span>

          {/* Deviation Warning Badge */}
          {itemDevs.length > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onOpenReconciliation?.(itemDevs[0]);
              }}
              className="shrink-0 inline-flex items-center gap-1 text-xs font-medium px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors cursor-pointer whitespace-nowrap"
              title={itemDevs.map((d) => d.message).join('\n') + ' (Click to reconcile)'}
              data-testid="sprint-item-deviation-badge"
            >
              <AlertTriangle className="w-2.5 h-2.5 text-amber-400" />
              <span>Deviation</span>
            </button>
          )}

          {/* Project Badge for All Projects mode */}
          {isAllProjects && (
            <span
              className="shrink-0 inline-flex items-center text-xs px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/50 font-sans truncate max-w-[80px] sm:max-w-[100px] whitespace-nowrap"
              title={allProjects.find((p) => p.id === item.project_id)?.name || item.project_id}
            >
              {allProjects.find((p) => p.id === item.project_id)?.name || 'Project'}
            </span>
          )}

          {/* External Ref Tag */}
          {item.external_ref_id && (
            <CopyableRefId
              id={item.external_ref_id}
              className="shrink-0 inline-flex items-center text-xs font-medium max-w-[70px] sm:max-w-none truncate whitespace-nowrap"
            />
          )}

          {/* Title */}
          <span
            className="text-sm font-medium text-slate-200 truncate min-w-0 min-w-[60px] sm:min-w-[100px] flex-1 cursor-pointer hover:text-white"
            onClick={() => onEditItem(item)}
            title={item.title}
          >
            {item.title}
          </span>

          {/* Immutability Lock Badge */}
          {isImmutable && (
            <span
              className="shrink-0 inline-flex items-center space-x-1 text-xs px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/50 font-sans whitespace-nowrap"
              title="Completed item in closed sprint (immutable)"
              data-testid="immutable-lock-badge"
            >
              <Lock className="w-3 h-3 text-purple-400" />
              <span>Locked</span>
            </span>
          )}
        </div>

        {/* Git Metadata Cluster */}
        {(prUrl || commitHash) && (
          <div
            className="shrink-0 flex items-center gap-1.5 whitespace-nowrap"
            data-testid="git-metadata-cluster"
          >
            {prUrl && <GitHubBadge type="pr" compact value={prUrl} repo={repo} owner={owner} className="shrink-0 inline-flex items-center text-xs whitespace-nowrap" />}
            {commitHash && <GitHubBadge type="commit" compact value={commitHash} prUrl={prUrl} repo={repo} owner={owner} className="shrink-0 inline-flex items-center text-xs whitespace-nowrap" />}
          </div>
        )}

        {/* Right group (Mobile Only): discreet (n) subtask count & edit icon button */}
        <div className="flex items-center space-x-1.5 shrink-0 md:hidden">
          {isTreeMode && childCount > 0 && (
            <span
              className="text-slate-400 text-xs font-mono shrink-0 whitespace-nowrap"
              title={`${childCount} child item(s)`}
              data-testid="sprint-child-count-mobile"
            >
              ({childCount})
            </span>
          )}
          <button
            type="button"
            onClick={() => onEditItem(item)}
            className="p-1 rounded text-slate-500 hover:text-white transition-colors"
            title="Edit work item"
            data-testid={`edit-item-mobile-${item.id}`}
          >
            <Pencil className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Secondary Row (Tier 2 - Mobile Only: pl-8 flex flex-wrap items-center gap-2 mt-1.5 pb-1; Desktop: standard horizontal inline flush right) */}
      <div
        className="pl-8 flex flex-wrap items-center gap-2 mt-1.5 pb-1 w-full md:w-auto md:mt-0 md:pb-0 md:pl-0 md:flex-nowrap md:shrink-0 md:ml-auto md:gap-2.5"
        data-testid="sprint-item-row-tier2"
      >
        {/* Desktop Subtasks Pill */}
        {isTreeMode && childCount > 0 && (
          <span
            className="hidden md:inline-flex shrink-0 items-center text-xs font-mono font-medium px-1.5 py-0.5 rounded bg-sky-950/70 text-sky-300 border border-sky-800/50 whitespace-nowrap"
            title={`${childCount} child item(s)`}
            data-testid="tree-child-count-badge"
          >
            {childCount} {childCount === 1 ? 'subtask' : 'subtasks'}
          </span>
        )}

        {/* Consolidated Point Badge */}
        {isTreeMode && rollupPoints > 0 ? (
          <span
            data-testid="tree-rollup-points-badge"
            className="shrink-0 inline-flex items-center text-xs font-mono font-medium px-1.5 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800/50 whitespace-nowrap select-none"
            title={
              points !== undefined
                ? `Intrinsic: ${points} pts | Rollup: ${rollupPoints} pts`
                : `Rollup: ${rollupPoints} pts`
            }
          >
            <span className="md:hidden">
              {pointMode === 'macro' && item.metadata?.story_points !== undefined
                ? `${item.metadata.story_points} pts`
                : `${rollupPoints} pts Σ`}
            </span>
            <span className="hidden md:inline">
              {pointMode === 'macro' && item.metadata?.story_points !== undefined
                ? `${item.metadata.story_points} pts intrinsic`
                : `${rollupPoints} pts rollup`}
            </span>
          </span>
        ) : points !== undefined ? (
          <span
            data-testid="sprint-points-badge"
            className="shrink-0 inline-flex items-center text-xs px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 font-mono select-none whitespace-nowrap"
          >
            {String(points)} pts
          </span>
        ) : null}

        {/* Assignee avatar/name pill */}
        <span className="text-xs text-slate-400 flex items-center space-x-1 font-mono shrink-0 bg-slate-950/40 px-1.5 py-0.5 rounded border border-slate-800/60 md:bg-transparent md:px-0 md:py-0 md:border-0 whitespace-nowrap">
          <User className="w-3 h-3 text-slate-500 shrink-0" />
          <span className="truncate max-w-[100px] md:max-w-none">{item.assignee || 'Unassigned'}</span>
        </span>

        {/* Status Select with Hierarchy Color-Coding */}
        <SprintStatusSelect
          itemId={item.id}
          status={item.status}
          statuses={getItemStatuses(item)}
          onChange={onUpdateStatus}
          disabled={isImmutable}
        />

        {/* Move / Reassign Sprint Select */}
        <select
          value={currentSprintName || item.metadata?.sprint || '__none__'}
          onChange={(e) => onUpdateSprint?.(item.id, e.target.value)}
          disabled={isImmutable}
          className="bg-slate-950 border border-slate-800 rounded py-0.5 px-1.5 text-xs md:py-1 md:px-3 md:text-sm text-emerald-400 font-medium focus:outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed max-w-[130px] truncate shrink-0"
          title={isImmutable ? 'Item is locked in a closed sprint' : 'Move to another sprint or backlog'}
          data-testid={`sprint-reassign-select-${item.id}`}
        >
          <option value="__none__">Backlog (Unassigned)</option>
          {availableSprints.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        {/* Desktop Edit Button */}
        <button
          type="button"
          onClick={() => onEditItem(item)}
          className="p-1 rounded text-slate-500 hover:text-white transition-colors hidden md:inline-flex shrink-0"
          title="Edit work item"
          data-testid={`edit-item-desktop-${item.id}`}
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
