'use client';

import React from 'react';
import { WorkItem } from '@/types/tracker';
import { GitHubBadge } from '@/components/GitHubBadge';
import { extractGitHubMetadata } from '@/lib/github-metadata';
import {
  ResolvedRowColumn,
  formatRowCellValue,
  getColumnTrackWidthClass,
  getResponsiveMdTrackWidthClass,
} from '@/lib/row-columns';

export interface RowFieldCellProps {
  item: WorkItem;
  column: ResolvedRowColumn;
  allProjects?: Array<{ id: string; slug?: string; name: string; settings?: any }>;
  projectSettings?: any;
  isImmutable?: boolean;
  onUpdateSprint?: (itemId: string, sprint: string) => void;
  availableSprints?: string[];
  currentSprintName?: string;
}

const BADGE_CLASSES: Record<string, string> = {
  danger: 'bg-rose-950/70 text-rose-300 border-rose-800/60',
  warning: 'bg-amber-950/70 text-amber-300 border-amber-800/60',
  info: 'bg-sky-950/70 text-sky-300 border-sky-800/60',
  success: 'bg-emerald-950/70 text-emerald-300 border-emerald-800/60',
  neutral: 'bg-slate-900 text-slate-300 border-slate-700/80',
};

/**
 * Renders a single configured static or dynamic field column cell inside Tree and Table rows.
 */
export const RowFieldCell: React.FC<RowFieldCellProps> = ({
  item,
  column,
  allProjects = [],
  projectSettings,
  isImmutable = false,
  onUpdateSprint,
  availableSprints = [],
  currentSprintName,
}) => {
  const widthClass = getColumnTrackWidthClass(column.width, column.key);

  // Interactive sprint reassignment select when handler is wired (Table/Sprint rows)
  if (column.key === 'sprint' && onUpdateSprint) {
    return (
      <div
        className={`${widthClass} shrink-0 flex items-center justify-end`}
        data-testid={`row-cell-sprint-${item.id}`}
      >
        <select
          value={currentSprintName || item.metadata?.sprint || '__none__'}
          onChange={(e) => onUpdateSprint(item.id, e.target.value)}
          disabled={isImmutable}
          className="w-full bg-slate-950 border border-slate-800 rounded py-0.5 px-1.5 text-xs text-emerald-400 font-medium focus:outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed max-w-[130px] truncate shrink-0"
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
      </div>
    );
  }

  // GitHub PR & Commit badges
  if (column.key === 'github') {
    const parentProject = allProjects.find(
      (p) => p.id === item.project_id || p.slug === item.project_id
    );
    const parentGithubRepo =
      parentProject?.settings?.github_repo ||
      parentProject?.settings?.github_repository ||
      projectSettings?.github_repo;
    const { prUrl, commitHash, repo, owner } = extractGitHubMetadata(
      item.metadata,
      parentGithubRepo
    );

    return (
      <div
        className={`${widthClass} shrink-0 max-sm:hidden flex items-center justify-end whitespace-nowrap`}
        data-testid={`row-cell-github-${item.id}`}
      >
        {prUrl || commitHash ? (
          <div className="shrink-0 flex max-sm:hidden items-center gap-1.5 whitespace-nowrap" data-testid="git-metadata-cluster">
            {prUrl && (
              <GitHubBadge
                type="pr"
                compact
                value={prUrl}
                repo={repo}
                owner={owner}
                className="shrink-0 inline-flex items-center text-xs whitespace-nowrap"
              />
            )}
            {commitHash && (
              <GitHubBadge
                type="commit"
                compact
                value={commitHash}
                prUrl={prUrl}
                repo={repo}
                owner={owner}
                className="shrink-0 inline-flex items-center text-xs whitespace-nowrap"
              />
            )}
          </div>
        ) : (
          <span className="text-[11px] text-slate-600 font-mono">—</span>
        )}
      </div>
    );
  }

  const formatted = formatRowCellValue(item, column, { allProjects });
  const mdWidthClass = getResponsiveMdTrackWidthClass(column.width, column.key);

  return (
    <div
      className={`w-auto ${mdWidthClass} shrink-0 flex items-center md:justify-end overflow-hidden`}
      data-testid={`row-cell-${column.key}-${item.id}`}
      title={formatted.rawText ? `${column.label}: ${formatted.rawText}` : `${column.label}: Empty`}
    >
      {formatted.empty ? (
        <span className="text-[11px] text-slate-600 font-mono select-none">—</span>
      ) : formatted.badgeVariant ? (
        <span
          className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded border truncate max-w-full ${
            BADGE_CLASSES[formatted.badgeVariant] || BADGE_CLASSES.neutral
          }`}
        >
          {formatted.displayText}
        </span>
      ) : (
        <span className="text-[11px] font-mono text-slate-300 truncate max-w-full">
          {formatted.displayText}
        </span>
      )}
    </div>
  );
};
