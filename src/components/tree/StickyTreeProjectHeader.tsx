'use client';

import React from 'react';
import { Folder } from 'lucide-react';

export interface StickyTreeProjectHeaderProps {
  projectId: string | null | undefined;
  projectName: string;
  itemCount?: number;
  rollupPoints?: number;
  unitLabel?: string;
  className?: string;
}

/**
 * Sticky project context banner rendered above project sections in tree views
 * so users retain project orientation while scrolling deep item hierarchies.
 */
export function StickyTreeProjectHeader({
  projectId,
  projectName,
  itemCount,
  rollupPoints,
  unitLabel = 'pts',
  className = '',
}: StickyTreeProjectHeaderProps) {
  return (
    <div
      data-testid={`tree-project-header-${projectId || 'unknown'}`}
      className={`sticky top-0 z-20 flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg bg-slate-900/95 backdrop-blur-md border border-slate-800/90 text-xs font-semibold text-slate-200 shadow-sm ${className}`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <Folder className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="truncate">{projectName || 'Project'}</span>
      </span>
      <span className="flex items-center gap-2 shrink-0 text-[11px] font-mono font-normal text-slate-400">
        {itemCount !== undefined && (
          <span>
            {itemCount} {itemCount === 1 ? 'root' : 'roots'}
          </span>
        )}
        {rollupPoints !== undefined && rollupPoints > 0 && (
          <span className="text-emerald-400/90">
            Σ {rollupPoints} {unitLabel}
          </span>
        )}
      </span>
    </div>
  );
}
