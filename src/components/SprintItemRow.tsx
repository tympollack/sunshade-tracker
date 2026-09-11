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
  allProjects?: { id: string; name: string }[];
  onUpdateStatus?: (itemId: string, status: string) => void;
  onUpdateSprint?: (itemId: string, sprint: string) => void;
  availableSprints?: string[];
  currentSprintName?: string;
  isTreeMode?: boolean;
  childCount?: number;
  rollupPoints?: number;
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
  onUpdateStatus,
  onUpdateSprint,
  availableSprints = [],
  currentSprintName,
  isTreeMode = false,
  childCount = 0,
  rollupPoints = 0,
}) => {
  const itemHierarchy = getItemHierarchy(item);
  const lvlColor = getHierarchyLevelColor(item.item_type, itemHierarchy);
  const points = item.metadata?.story_points ?? item.metadata?.points ?? item.metadata?.estimate;
  const itemDevs = deviations.filter((d) => d.itemId === item.id);
  const { prUrl, commitHash, repo, owner } = extractGitHubMetadata(item.metadata);

  return (
    <div
      onDoubleClick={() => onEditItem(item)}
      className={`p-3 transition-colors flex flex-wrap items-center justify-between gap-3 group relative ${
        isSelected
          ? 'bg-emerald-950/30 border-l-2 border-emerald-400'
          : 'hover:bg-slate-800/30'
      }`}
      style={isTreeMode && depth > 0 ? { marginLeft: `${depth * 24}px` } : undefined}
      data-testid="sprint-item-row"
    >
      {/* Tree Branch Connector */}
      {isTreeMode && depth > 0 && (
        <div
          data-testid="tree-branch-connector"
          className="w-3.5 h-6 border-b-2 border-l-2 border-slate-700 -mt-3.5 rounded-bl-sm shrink-0"
        />
      )}

      {/* Left Item Info */}
      <div className="flex items-center space-x-2.5 min-w-0 flex-1">
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
          className={`text-[10px] font-mono font-semibold rounded px-2 py-0.5 border shrink-0 ${lvlColor.badgeBg} ${lvlColor.badgeText} ${lvlColor.badgeBorder}`}
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
            className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors shrink-0 cursor-pointer"
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
            className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/50 font-sans truncate max-w-[100px]"
            title={allProjects.find((p) => p.id === item.project_id)?.name || item.project_id}
          >
            {allProjects.find((p) => p.id === item.project_id)?.name || 'Project'}
          </span>
        )}

        {/* External Ref Tag */}
        {item.external_ref_id && (
          <span className="text-xs font-mono text-slate-400 shrink-0 font-medium">
            {item.external_ref_id}
          </span>
        )}

        {/* GitHub Badges */}
        {prUrl && <GitHubBadge type="pr" compact value={prUrl} />}
        {commitHash && <GitHubBadge type="commit" compact value={commitHash} prUrl={prUrl} repo={repo} owner={owner} />}

        {/* Title */}
        <span
          className="text-sm font-medium text-slate-200 truncate cursor-pointer hover:text-white"
          onClick={() => onEditItem(item)}
        >
          {item.title}
        </span>

        {/* Immutability Lock Badge */}
        {isImmutable && (
          <span
            className="flex items-center space-x-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-300 border border-purple-800/50 shrink-0 font-sans"
            title="Completed item in closed sprint (immutable)"
            data-testid="immutable-lock-badge"
          >
            <Lock className="w-3 h-3 text-purple-400" />
            <span>Locked</span>
          </span>
        )}

        {/* Tree Rollup Badges */}
        {isTreeMode && childCount > 0 && (
          <span
            className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-sky-950/70 text-sky-300 border border-sky-800/50 shrink-0"
            title={`${childCount} child item(s)`}
            data-testid="tree-child-count-badge"
          >
            {childCount} {childCount === 1 ? 'subtask' : 'subtasks'}
          </span>
        )}
        {isTreeMode && rollupPoints > 0 && (
          <span
            className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-emerald-950/70 text-emerald-300 border border-emerald-800/50 shrink-0"
            title={`Branch rollup total: ${rollupPoints} pts`}
            data-testid="tree-rollup-points-badge"
          >
            {rollupPoints} pts rollup
          </span>
        )}
      </div>

      {/* Right Item Actions */}
      <div className="flex items-center space-x-2.5 shrink-0">
        {points !== undefined && (
          <span className="text-xs px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 font-mono select-none">
            {String(points)} pts
          </span>
        )}

        <span className="text-xs text-slate-400 flex items-center space-x-1 font-mono">
          <User className="w-3 h-3 text-slate-500" />
          <span>{item.assignee || 'Unassigned'}</span>
        </span>

        {/* Status Select with Hierarchy Color-Coding */}
        {(() => {
          const itemStatuses = getItemStatuses(item);
          const currentStatusObj = itemStatuses.find((st: StatusDefinition) => st.id === item.status);
          const statusColor = currentStatusObj?.color;

          return (
            <select
              value={item.status}
              onChange={(e) => onUpdateStatus?.(item.id, e.target.value)}
              disabled={isImmutable}
              className="text-xs rounded px-2 py-1 font-mono focus:outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border"
              style={
                statusColor
                  ? {
                      backgroundColor: `${statusColor}20`,
                      color: statusColor,
                      border: `1px solid ${statusColor}40`,
                    }
                  : { backgroundColor: '#020617', color: '#cbd5e1', border: '1px solid #1e293b' }
              }
              title={isImmutable ? 'Item is locked in a closed sprint' : 'Change status'}
              data-testid={`sprint-status-select-${item.id}`}
            >
              {itemStatuses.map((st: StatusDefinition) => (
                <option
                  key={st.id}
                  value={st.id}
                  style={{ backgroundColor: '#020617', color: '#cbd5e1' }}
                >
                  {st.label}
                </option>
              ))}
            </select>
          );
        })()}


        {/* Move / Reassign Sprint Select */}
        <select
          value={currentSprintName || item.metadata?.sprint || '__none__'}
          onChange={(e) => onUpdateSprint?.(item.id, e.target.value)}
          disabled={isImmutable}
          className="text-xs bg-slate-950 border border-slate-800 rounded px-2 py-1 text-emerald-400 font-medium focus:outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          title={isImmutable ? 'Item is locked in a closed sprint' : 'Move to another sprint or backlog'}
        >
          <option value="__none__">Backlog (Unassigned)</option>
          {availableSprints.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>

        <button
          type="button"
          onClick={() => onEditItem(item)}
          className="p-1 rounded text-slate-500 hover:text-white transition-colors"
          title="Edit work item"
        >
          <Pencil className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
};
