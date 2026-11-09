import React from 'react';
import { Folder } from 'lucide-react';

export interface ProjectGroupDividerProps {
  projectId: string | null | undefined;
  projectName: string;
  points: number;
  unitLabel?: string;
  scopeLabel?: string;
}

/**
 * Sticky divider banner marking a project boundary in multi-project sprint views.
 */
export function ProjectGroupDivider({ projectId, projectName, points, unitLabel = 'pts', scopeLabel = 'in sprint' }: ProjectGroupDividerProps) {
  return (
    <div
      className="sticky top-12 z-10 bg-slate-900/90 backdrop-blur-sm border-y border-slate-800/80 px-3 py-1.5 text-xs text-slate-300 font-medium flex items-center justify-between"
      data-testid={`project-group-divider-${projectId || 'none'}`}
    >
      <span className="flex items-center space-x-1.5">
        <Folder className="w-3.5 h-3.5 text-slate-400" />
        <span>{projectName || 'Unknown Project'}</span>
      </span>
      <span className="text-slate-400">{points} {unitLabel} {scopeLabel}</span>
    </div>
  );
}
