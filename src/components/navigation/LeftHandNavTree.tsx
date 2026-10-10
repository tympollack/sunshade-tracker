'use client';

import React, { useMemo } from 'react';
import {
  Calendar,
  FolderTree,
  Folder,
  Layers,
  ChevronsUpDown,
  ChevronsDownUp,
  X,
  Plus,
} from 'lucide-react';
import { WorkItem, SprintDefinition, ProjectSettings, getWorkMetricConfig } from '@/types/tracker';
import { usePivotTree, PivotMode, TreeFilterScope } from '@/hooks/usePivotTree';
import { WorkspaceSwitcher, Workspace } from '@/components/WorkspaceSwitcher';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
import { NavTreeNode } from './NavTreeNode';

export interface WorkspaceItem {
  id: string;
  slug: string;
  name: string;
  tier: string;
  api_key_preview?: string | null;
  role?: string;
  projects?: { id: string; slug: string; name: string }[];
}

export interface LeftHandNavTreeProps {
  items: WorkItem[];
  projects: Array<{ id: string; slug: string; name: string }>;
  sprints?: SprintDefinition[];
  tenantSlug: string;
  allWorkspaces?: WorkspaceItem[];
  currentProjectSlug?: string;
  projectSettings?: ProjectSettings;
  onArchiveProject?: () => void;
  isReadOnly?: boolean;
  isCollapsed?: boolean;
  onToggleCollapse?: () => void;
  onScopeFilter?: (scope: TreeFilterScope) => void;
  onSelectItem?: (item: WorkItem) => void;
  onSelectSprint?: (sprintName: string) => void;
  onNewSprint?: () => void;
  className?: string;
}

export function LeftHandNavTree({
  items,
  projects,
  sprints = [],
  tenantSlug,
  allWorkspaces,
  currentProjectSlug,
  projectSettings,
  onArchiveProject,
  isReadOnly = false,
  isCollapsed = false,
  onToggleCollapse,
  onScopeFilter,
  onSelectItem,
  onSelectSprint,
  onNewSprint,
  className = '',
}: LeftHandNavTreeProps) {
  const {
    pivotMode,
    setPivotMode,
    treeNodes,
    activeScope,
    selectScope,
    clearScope,
    expandedNodes,
    toggleNode,
    expandAll,
    collapseAll,
  } = usePivotTree({
    items,
    projects,
    sprints,
    tenantSlug,
    scopedProjectSlug: currentProjectSlug,
    projectSettings,
    onScopeFilter,
  });

  // Active Workspace info
  const workspacesList: Workspace[] = useMemo(() => {
    if (allWorkspaces && allWorkspaces.length > 0) {
      return allWorkspaces.map((w) => ({
        id: w.id,
        slug: w.slug,
        name: w.name,
        tier: w.tier,
        role: w.role,
        projects: w.projects,
      }));
    }
    return [
      {
        id: tenantSlug,
        slug: tenantSlug,
        name: tenantSlug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        tier: 'free',
      },
    ];
  }, [allWorkspaces, tenantSlug]);

  const activeWorkspace = useMemo(() => {
    return workspacesList.find((w) => w.slug === tenantSlug) ?? workspacesList[0];
  }, [workspacesList, tenantSlug]);

  const activeWorkspaceName = activeWorkspace?.name || tenantSlug;

  const workspaceInitials = useMemo(() => {
    return (
      (activeWorkspaceName || '?')
        .split(' ')
        .slice(0, 2)
        .map((w) => w[0])
        .join('')
        .toUpperCase() || 'WS'
    );
  }, [activeWorkspaceName]);

  // Active Project info
  const isPortfolio = currentProjectSlug === 'portfolio';
  const isOverview =
    (currentProjectSlug === 'all' || currentProjectSlug === 'portfolio') &&
    !projects.some((p) => p.slug === currentProjectSlug);

  const activeProject = useMemo(() => {
    if (isOverview) {
      return {
        id: currentProjectSlug || 'all',
        slug: currentProjectSlug || 'all',
        name: isPortfolio ? 'Portfolio Overview' : 'All Projects',
      };
    }
    return projects.find((p) => p.slug === currentProjectSlug) ?? projects[0];
  }, [projects, currentProjectSlug, isOverview, isPortfolio]);

  const activeProjectName =
    activeProject?.name || (isPortfolio ? 'Portfolio Overview' : 'All Projects');

  // Collect all expandable node IDs
  const allExpandableIds = useMemo(() => {
    const ids: string[] = [];
    const walk = (nodes: typeof treeNodes) => {
      for (const n of nodes) {
        if (n.children && n.children.length > 0) {
          ids.push(n.id);
          walk(n.children);
        }
      }
    };
    walk(treeNodes);
    return ids;
  }, [treeNodes]);

  const hasActiveFilter = Boolean(
    activeScope.sprintName || activeScope.projectSlug || activeScope.itemId
  );

  return (
    <div
      data-testid="lhn-dual-pivot-tree"
      className={`flex flex-col h-full w-full bg-slate-950/80 text-slate-200 select-none ${className}`}
    >
      {/* ── 1. Scope Header: Stacked Card (Expanded) vs Compact Initial Square (Collapsed) ── */}
      {isCollapsed ? (
        <div
          data-testid="lhn-collapsed-scope"
          className="py-2.5 px-1 border-b border-slate-800/80 flex items-center justify-center shrink-0"
        >
          <button
            type="button"
            onClick={onToggleCollapse}
            data-testid="lhn-collapsed-workspace-badge"
            className="w-8 h-8 rounded bg-emerald-950 text-emerald-400 font-bold flex items-center justify-center mx-auto text-xs cursor-pointer border border-emerald-500/30 transition-transform hover:scale-105"
            title={`${activeWorkspaceName} / ${activeProjectName}`}
            aria-label={`${activeWorkspaceName} / ${activeProjectName}`}
          >
            {workspaceInitials}
          </button>
        </div>
      ) : (
        <div
          data-testid="lhn-scope-header"
          className="p-2 border-b border-slate-800/80 bg-slate-900/30 shrink-0"
        >
          {/* Unified Scope Switcher Row: [PE] PYM Energy / Awesomany ▾ */}
          <div
            data-testid="lhn-unified-scope-row"
            className="flex items-center gap-1 px-1.5 py-1 rounded-lg bg-slate-900/90 border border-slate-800 text-xs text-slate-200 min-w-0 w-full overflow-hidden"
          >
            {/* Workspace switcher (compact) */}
            <WorkspaceSwitcher
              currentTenantSlug={tenantSlug}
              workspaces={workspacesList}
              variant="compact"
            />

            {/* Separator */}
            <span className="text-slate-600 shrink-0 font-light select-none">/</span>

            {/* Project switcher (compact) */}
            {projects.length > 0 && (
              <ProjectSwitcher
                tenantSlug={tenantSlug}
                currentProjectSlug={currentProjectSlug || projects[0]?.slug || 'all'}
                projects={projects}
                onArchiveCurrentProject={onArchiveProject}
                isReadOnly={isReadOnly}
                variant="compact"
              />
            )}
          </div>
        </div>
      )}

      {/* ── 2. Pivot Mode Switcher: Segmented Control (Expanded) vs Centered Toggle Icon (Collapsed) ── */}
      {isCollapsed ? (
        <div
          data-testid="lhn-collapsed-pivot-section"
          className="py-2 px-1 border-b border-slate-800/80 flex flex-col items-center justify-center shrink-0"
        >
          <button
            type="button"
            onClick={() => setPivotMode((prev) => (prev === 'sprint' ? 'project' : 'sprint'))}
            data-testid="lhn-collapsed-pivot-toggle"
            aria-label={
              pivotMode === 'sprint'
                ? 'Pivot: Sprints (Click to switch)'
                : 'Pivot: Projects (Click to switch)'
            }
            title={
              pivotMode === 'sprint'
                ? 'Pivot: Sprints (Click to switch)'
                : 'Pivot: Projects (Click to switch)'
            }
            className="w-8 h-8 mx-auto flex items-center justify-center rounded hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-colors"
          >
            {pivotMode === 'sprint' ? (
              <Calendar className="w-4 h-4 text-amber-400" />
            ) : (
              <FolderTree className="w-4 h-4 text-blue-400" />
            )}
          </button>
        </div>
      ) : (
        <div className="p-2 border-b border-slate-800/80 flex flex-col gap-2 shrink-0">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Hierarchy Pivot
            </span>
            {/* Cadence + Sprint button */}
            {pivotMode === 'sprint' && onNewSprint && (
              <button
                type="button"
                onClick={onNewSprint}
                data-testid="lhn-new-sprint-btn"
                className="flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-300 hover:bg-amber-500/20 border border-amber-500/30 transition-colors"
                title="Configure / Add new sprint"
              >
                <Plus className="w-3 h-3" />
                <span>Sprint</span>
              </button>
            )}
          </div>

          {/* Segmented Switch: Sprints (Cadence) vs Projects (Domain) */}
          <div
            role="tablist"
            aria-label="Pivot Mode"
            className="grid grid-cols-2 p-0.5 bg-slate-900 border border-slate-800 rounded-lg text-xs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={pivotMode === 'sprint'}
              onClick={() => setPivotMode('sprint')}
              className={`flex items-center justify-center gap-1.5 py-1 px-2 rounded-md font-medium text-[11px] transition-all ${
                pivotMode === 'sprint'
                  ? 'bg-slate-800 text-amber-300 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Sprints</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={pivotMode === 'project'}
              onClick={() => setPivotMode('project')}
              className={`flex items-center justify-center gap-1.5 py-1 px-2 rounded-md font-medium text-[11px] transition-all ${
                pivotMode === 'project'
                  ? 'bg-slate-800 text-blue-300 shadow-xs'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <FolderTree className="w-3.5 h-3.5" />
              <span>Projects</span>
            </button>
          </div>

          {/* Quick Toolbar: Expand / Collapse All & Active Filter Indicator */}
          <div className="flex items-center justify-between text-[10px] text-slate-500 px-0.5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => expandAll(allExpandableIds)}
                className="hover:text-slate-300 flex items-center gap-0.5 p-0.5"
                title="Expand All"
                aria-label="Expand All"
              >
                <ChevronsUpDown className="w-3 h-3" />
                <span>Expand</span>
              </button>
              <span>•</span>
              <button
                type="button"
                onClick={collapseAll}
                className="hover:text-slate-300 flex items-center gap-0.5 p-0.5"
                title="Collapse All"
                aria-label="Collapse All"
              >
                <ChevronsDownUp className="w-3 h-3" />
                <span>Collapse</span>
              </button>
            </div>

            {hasActiveFilter && (
              <button
                type="button"
                onClick={clearScope}
                className="flex items-center gap-0.5 text-red-400 hover:text-red-300 transition-colors"
                title="Clear Filter"
              >
                <span>Reset</span>
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── 3. Tree Content: Recursive Tree (Expanded) vs Centered Root Icon Stack (Collapsed) ── */}
      {isCollapsed ? (
        <div
          role="toolbar"
          aria-label="Collapsed navigation rail"
          data-testid="lhn-collapsed-rail"
          className="flex-1 min-h-0 overflow-y-auto custom-scrollbar py-2 px-1 flex flex-col items-center gap-1.5"
        >
          {treeNodes.map((node) => {
            const isSelected = Boolean(
              (node.type === 'sprint' &&
                activeScope.sprintName === node.sprintName &&
                (!activeScope.projectSlug || activeScope.projectSlug === node.projectSlug) &&
                (!activeScope.projectId || activeScope.projectId === node.projectId) &&
                !activeScope.itemId) ||
              (node.type === 'project' &&
                ((activeScope.projectId && activeScope.projectId === node.projectId) ||
                  (activeScope.projectSlug && activeScope.projectSlug === node.projectSlug)) &&
                !activeScope.itemId)
            );

            const itemCount = node.childCount;
            const tooltipText = `${node.title} (${itemCount} item${itemCount !== 1 ? 's' : ''})`;

            return (
              <button
                key={node.id}
                type="button"
                onClick={() => {
                  selectScope({
                    sprintName: node.sprintName,
                    projectSlug: node.projectSlug,
                    projectId: node.projectId,
                    itemId: node.item?.id,
                  });
                  if (node.item && onSelectItem) {
                    onSelectItem(node.item);
                  }
                }}
                data-testid={`lhn-collapsed-root-${node.id}`}
                title={tooltipText}
                aria-label={tooltipText}
                className={`relative w-8 h-8 rounded-lg flex items-center justify-center transition-all ${
                  isSelected
                    ? 'bg-emerald-950/80 text-emerald-400 border border-emerald-500/40'
                    : 'hover:bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {node.type === 'sprint' ? (
                  <Calendar className="w-4 h-4" />
                ) : node.type === 'project' ? (
                  <FolderTree className="w-4 h-4" />
                ) : (
                  <Layers className="w-4 h-4" />
                )}
                {itemCount > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[14px] h-[14px] px-0.5 rounded-full bg-slate-800 border border-slate-700 text-[8px] font-mono text-slate-300 flex items-center justify-center pointer-events-none">
                    {itemCount > 99 ? '99+' : itemCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
        <>
          {/* Active Scope Filter Banner (if filtered) */}
          {hasActiveFilter && (
            <div className="px-2 py-1 bg-emerald-950/40 border-b border-emerald-800/40 text-[10px] text-emerald-300 flex items-center justify-between shrink-0">
              <span className="truncate">
                Filtering:{' '}
                <strong>
                  {activeScope.sprintName ||
                    activeScope.projectSlug ||
                    activeScope.itemId}
                </strong>
              </span>
              <button
                type="button"
                onClick={clearScope}
                className="hover:text-emerald-100 p-0.5"
                aria-label="Clear active filter"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          )}

          {/* Recursive File-Tree Stage */}
          <div
            role="tree"
            aria-label="Work Items File Tree"
            className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5"
          >
            {treeNodes.length === 0 ? (
              <div className="text-center py-6 text-slate-500 text-xs">
                No items in workspace
              </div>
            ) : (
              treeNodes.map((node) => (
                <NavTreeNode
                  key={node.id}
                  node={node}
                  depth={0}
                  isExpanded={expandedNodes.has(node.id)}
                  onToggle={toggleNode}
                  activeScope={activeScope}
                  onSelectScope={selectScope}
                  onSelectItem={onSelectItem}
                  onSelectSprint={onSelectSprint}
                  expandedNodes={expandedNodes}
                  unit={getWorkMetricConfig(projectSettings).unit_label || 'pts'}
                />
              ))
            )}
          </div>
        </>
      )}
    </div>
  );
}
