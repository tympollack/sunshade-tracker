'use client';

import React from 'react';
import { WorkItem, ProjectSettings, SprintDefinition } from '@/types/tracker';
import { SprintHeader } from '@/components/sprint/SprintHeader';
import { PointModeSwitcher } from '@/components/PointModeSwitcher';

export interface SprintPlanningViewProps {
  items: WorkItem[];
  pointMode: 'macro' | 'granular';
  onPointModeChange: (mode: 'macro' | 'granular') => void;
  projectSettings?: ProjectSettings;
  availableSprints?: string[];
  collapsedSprints?: Set<string>;
  onToggleCollapseSprint?: (sprintName: string) => void;
  selectedItemIds?: Set<string>;
  onToggleSelectItem?: (id: string, e: React.MouseEvent, list: WorkItem[], isTree?: boolean) => void;
  isReadOnly?: boolean;
  className?: string;
  renderSprintContent?: (sprintName: string, sprintItems: WorkItem[]) => React.ReactNode;
}

/**
 * Sprint planning view container integrating sprint swimlanes, SprintHeader components,
 * and PointModeSwitcher for macro roadmap vs. granular leaf execution views (FEAT-TRK-MACRO-VS-LEAF-VIEW-TOGGLE).
 */
export const SprintPlanningView: React.FC<SprintPlanningViewProps> = ({
  items,
  pointMode,
  onPointModeChange,
  projectSettings,
  availableSprints = [],
  collapsedSprints = new Set(),
  onToggleCollapseSprint,
  selectedItemIds = new Set(),
  onToggleSelectItem,
  isReadOnly = false,
  className = '',
  renderSprintContent,
}) => {
  const sprintDefs = projectSettings?.sprint_settings?.sprints || [];

  const effectiveSprints =
    availableSprints.length > 0
      ? availableSprints
      : sprintDefs.map((s) => s.name);

  return (
    <div data-testid="sprint-planning-view" className={`space-y-6 ${className}`}>
      {/* View Header Toolbar with Point Mode Switcher */}
      <div
        data-testid="sprint-planning-toolbar"
        className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl bg-slate-900/60 border border-slate-800"
      >
        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-300 font-semibold uppercase tracking-wider">
            Sprint Planning
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <span className="text-xs text-slate-400 font-medium">Point Mode:</span>
          <PointModeSwitcher mode={pointMode} onChange={onPointModeChange} />
        </div>
      </div>

      {/* Sprints Container */}
      <div className="space-y-4">
        {effectiveSprints.map((sprintName) => {
          const sprintItems = items.filter((it) => it.metadata?.sprint === sprintName);
          const sprintDef = sprintDefs.find((s) => s.name === sprintName || s.id === sprintName);
          const isCollapsed = collapsedSprints.has(sprintName);

          const isAllSelected =
            sprintItems.length > 0 && sprintItems.every((it) => selectedItemIds.has(it.id));
          const isSomeSelected =
            !isAllSelected && sprintItems.some((it) => selectedItemIds.has(it.id));

          return (
            <div
              key={sprintName}
              data-testid={`sprint-swimlane-${sprintName}`}
              className="rounded-xl border border-slate-800 bg-slate-900/20 overflow-hidden shadow-sm"
            >
              <SprintHeader
                sprintName={sprintName}
                items={sprintItems}
                pointMode={pointMode}
                sprintDef={sprintDef}
                isCollapsed={isCollapsed}
                onToggleCollapse={() => onToggleCollapseSprint?.(sprintName)}
                isAllSelected={isAllSelected}
                isSomeSelected={isSomeSelected}
                isReadOnly={isReadOnly}
              />

              {!isCollapsed && renderSprintContent && (
                <div className="p-3" data-testid={`sprint-body-${sprintName}`}>
                  {renderSprintContent(sprintName, sprintItems)}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

