'use client';

import React, { useState, useEffect, useMemo } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  GitFork,
  Layers,
  Loader2,
  RefreshCw,
  Sliders,
  Unlink,
  X,
} from 'lucide-react';
import { ProjectSettings, HierarchyLevel, StatusDefinition } from '@/types/tracker';
import { SchemaDeviation, summarizeDeviations, DeviationSummary } from '@/lib/schema-deviation';
import { getDefaultLevelHex } from '@/lib/hierarchy-colors';

export interface ProjectLike {
  id: string;
  slug: string;
  name?: string;
  settings?: ProjectSettings;
}

export interface SchemaReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviations: SchemaDeviation[];
  projectSettings: ProjectSettings;
  projectIdOrSlug?: string;
  tenantSlug: string;
  onReconciled: () => Promise<void> | void;
  focusDeviationId?: string | null;
  allProjects?: ProjectLike[];
  isPortfolio?: boolean;
}

interface ProjectGroup {
  projectId: string;
  projectSlug: string;
  projectName: string;
  settings: ProjectSettings;
  deviations: SchemaDeviation[];
  levelDeviations: SchemaDeviation[];
  statusDeviations: SchemaDeviation[];
  nestingDeviations: SchemaDeviation[];
  summary: DeviationSummary;
}

const MAX_BULK_ITEMS = 100;

/**
 * Sends batch updates in chunks no larger than MAX_BULK_ITEMS (100 items)
 * and returns summary of succeeded/failed counts and any errors.
 */
async function runChunkedBulkUpdates(
  itemIds: string[],
  updates: Record<string, any>,
  tenantSlug: string
): Promise<{ succeededCount: number; failedCount: number; errors: string[] }> {
  let succeededCount = 0;
  let failedCount = 0;
  const errors: string[] = [];

  for (let i = 0; i < itemIds.length; i += MAX_BULK_ITEMS) {
    const chunk = itemIds.slice(i, i + MAX_BULK_ITEMS);
    try {
      const res = await fetch('/api/v1/items/bulk', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-slug': tenantSlug,
        },
        body: JSON.stringify({
          ids: chunk,
          updates,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        errors.push(errData.error || `Bulk update failed with status ${res.status}`);
        failedCount += chunk.length;
      } else {
        succeededCount += chunk.length;
      }
    } catch (err: any) {
      errors.push(err.message || 'Network error during bulk update');
      failedCount += chunk.length;
    }
  }

  return { succeededCount, failedCount, errors };
}

export function SchemaReconciliationModal({
  isOpen,
  onClose,
  deviations,
  projectSettings,
  projectIdOrSlug,
  tenantSlug,
  onReconciled,
  focusDeviationId,
  allProjects,
  isPortfolio = false,
}: SchemaReconciliationModalProps) {
  const [activeSection, setActiveSection] = useState<'levels' | 'statuses' | 'nesting'>('levels');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Filter projects in portfolio mode
  const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('all');

  // Remap selection state keyed by group and type
  const [remapTargets, setRemapTargets] = useState<Record<string, string>>({});

  // Group deviations by project to isolate settings and mutations
  const projectGroups = useMemo<ProjectGroup[]>(() => {
    if (!deviations || deviations.length === 0) return [];

    if (isPortfolio && allProjects && allProjects.length > 0) {
      const pMap = new Map<string, ProjectLike>();
      for (const p of allProjects) {
        pMap.set(p.id, p);
        pMap.set(p.slug, p);
      }

      const groupsByProjKey = new Map<string, { project: ProjectLike; devs: SchemaDeviation[] }>();

      for (const d of deviations) {
        const pKey = d.projectSlug || d.projectId || projectIdOrSlug || allProjects[0].slug;
        const matchedProj = pMap.get(pKey) || allProjects[0];
        const groupKey = matchedProj.slug || matchedProj.id;
        if (!groupsByProjKey.has(groupKey)) {
          groupsByProjKey.set(groupKey, { project: matchedProj, devs: [] });
        }
        groupsByProjKey.get(groupKey)!.devs.push(d);
      }

      const result: ProjectGroup[] = [];
      for (const { project, devs } of groupsByProjKey.values()) {
        const lvlDevs = devs.filter((d) => d.deviationType === 'unmapped_level');
        const stDevs = devs.filter((d) => d.deviationType === 'unmapped_status');
        const nestDevs = devs.filter((d) => d.deviationType === 'nesting_conflict');
        result.push({
          projectId: project.id,
          projectSlug: project.slug,
          projectName: project.name || project.slug,
          settings: project.settings || projectSettings,
          deviations: devs,
          levelDeviations: lvlDevs,
          statusDeviations: stDevs,
          nestingDeviations: nestDevs,
          summary: summarizeDeviations(devs),
        });
      }
      return result;
    }

    // Default: Single project mode
    const lvlDevs = deviations.filter((d) => d.deviationType === 'unmapped_level');
    const stDevs = deviations.filter((d) => d.deviationType === 'unmapped_status');
    const nestDevs = deviations.filter((d) => d.deviationType === 'nesting_conflict');
    return [
      {
        projectId: projectIdOrSlug || 'default',
        projectSlug: projectIdOrSlug || 'default',
        projectName: projectIdOrSlug || 'Project',
        settings: projectSettings,
        deviations,
        levelDeviations: lvlDevs,
        statusDeviations: stDevs,
        nestingDeviations: nestDevs,
        summary: summarizeDeviations(deviations),
      },
    ];
  }, [deviations, isPortfolio, allProjects, projectSettings, projectIdOrSlug]);

  const filteredGroups = useMemo(() => {
    if (selectedProjectFilter === 'all') return projectGroups;
    return projectGroups.filter(
      (g) => g.projectSlug === selectedProjectFilter || g.projectId === selectedProjectFilter
    );
  }, [projectGroups, selectedProjectFilter]);

  const levelDeviationsCount = useMemo(
    () => deviations.filter((d) => d.deviationType === 'unmapped_level').length,
    [deviations]
  );
  const statusDeviationsCount = useMemo(
    () => deviations.filter((d) => d.deviationType === 'unmapped_status').length,
    [deviations]
  );
  const nestingDeviationsCount = useMemo(
    () => deviations.filter((d) => d.deviationType === 'nesting_conflict').length,
    [deviations]
  );

  // Auto-switch to active tab with deviations when opening
  useEffect(() => {
    if (levelDeviationsCount > 0) {
      setActiveSection('levels');
    } else if (statusDeviationsCount > 0) {
      setActiveSection('statuses');
    } else if (nestingDeviationsCount > 0) {
      setActiveSection('nesting');
    }
  }, [levelDeviationsCount, statusDeviationsCount, nestingDeviationsCount]);

  // Focus deviation: Navigate directly to the corresponding section and project
  useEffect(() => {
    if (!focusDeviationId || !isOpen) return;
    const targetDev = deviations.find(
      (d) => d.id === focusDeviationId || d.itemId === focusDeviationId
    );
    if (!targetDev) return;

    if (targetDev.deviationType === 'unmapped_level') {
      setActiveSection('levels');
    } else if (targetDev.deviationType === 'unmapped_status') {
      setActiveSection('statuses');
    } else if (targetDev.deviationType === 'nesting_conflict') {
      setActiveSection('nesting');
    }

    if (isPortfolio && (targetDev.projectSlug || targetDev.projectId)) {
      setSelectedProjectFilter(targetDev.projectSlug || targetDev.projectId!);
    }
  }, [focusDeviationId, isOpen, deviations, isPortfolio]);

  // Handle Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isOpen && !isSubmitting && e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isSubmitting, onClose]);

  if (!isOpen) return null;

  const clearAlerts = () => {
    setActionError(null);
    setSuccessMessage(null);
  };

  // ─── ACTION 1: 1-Click Extend Project Hierarchy ─────────────────────────
  const handleExtendHierarchy = async (
    unmappedType: string,
    targetIdentifier: string,
    targetSettings: ProjectSettings
  ) => {
    const identifier = targetIdentifier || projectIdOrSlug;
    if (!identifier) {
      setActionError('Project identifier is required to update schema settings.');
      return;
    }
    clearAlerts();
    setIsSubmitting(true);

    try {
      const currentHierarchy: HierarchyLevel[] = targetSettings.hierarchy || [];
      // Sort hierarchy by level to reliably locate the deepest level regardless of array order
      const sortedHierarchy = [...currentHierarchy].sort((a, b) => a.level - b.level);
      const deepestExistingLevel =
        sortedHierarchy.length > 0 ? sortedHierarchy[sortedHierarchy.length - 1] : null;
      const highestLevel = deepestExistingLevel ? deepestExistingLevel.level : 0;
      const allowedParents = deepestExistingLevel ? [deepestExistingLevel.type] : [];

      const formattedLabel = unmappedType.charAt(0).toUpperCase() + unmappedType.slice(1);
      const nextLevelNum = highestLevel + 1;

      const newLevel: HierarchyLevel = {
        type: unmappedType,
        label: formattedLabel,
        level: nextLevelNum,
        allowed_parents: allowedParents,
        color: getDefaultLevelHex(nextLevelNum),
      };

      const updatedSettings: ProjectSettings = {
        ...targetSettings,
        hierarchy: [...currentHierarchy, newLevel],
      };

      const res = await fetch(`/api/v1/projects/${encodeURIComponent(identifier)}/settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-slug': tenantSlug,
        },
        body: JSON.stringify({ settings: updatedSettings }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to update project hierarchy (${res.status})`);
      }

      setSuccessMessage(`Successfully added '${unmappedType}' to project hierarchy!`);
      await onReconciled();
    } catch (err: any) {
      setActionError(err.message || 'Error updating hierarchy settings');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── ACTION 2: Batch Remap Item Types with Chunking ──────────────────────
  const handleBatchRemapType = async (itemIds: string[], targetType: string) => {
    if (itemIds.length === 0 || !targetType) return;
    clearAlerts();
    setIsSubmitting(true);

    try {
      const { succeededCount, failedCount, errors } = await runChunkedBulkUpdates(
        itemIds,
        { item_type: targetType },
        tenantSlug
      );

      if (failedCount === 0) {
        setSuccessMessage(`Remapped ${succeededCount} item(s) to '${targetType}'!`);
      } else if (succeededCount > 0) {
        setActionError(
          `Remapped ${succeededCount} item(s), but ${failedCount} item(s) failed: ${errors[0]}`
        );
      } else {
        throw new Error(errors[0] || 'Failed to remap item types');
      }

      if (succeededCount > 0) {
        await onReconciled();
      }
    } catch (err: any) {
      setActionError(err.message || 'Error remapping item types');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── ACTION 3: 1-Click Extend Statuses ──────────────────────────────────
  const handleExtendStatuses = async (
    unmappedStatus: string,
    targetIdentifier: string,
    targetSettings: ProjectSettings
  ) => {
    const identifier = targetIdentifier || projectIdOrSlug;
    if (!identifier) {
      setActionError('Project identifier is required to update schema settings.');
      return;
    }
    clearAlerts();
    setIsSubmitting(true);

    try {
      const currentStatuses: StatusDefinition[] = targetSettings.statuses || [];
      const highestOrder = currentStatuses.reduce(
        (max, s) => (s.order > max ? s.order : max),
        0
      );

      const formattedLabel = unmappedStatus
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      const newStatus: StatusDefinition = {
        id: unmappedStatus,
        label: formattedLabel,
        color: '#94a3b8',
        order: highestOrder + 1000,
      };

      const updatedSettings: ProjectSettings = {
        ...targetSettings,
        statuses: [...currentStatuses, newStatus],
      };

      const res = await fetch(`/api/v1/projects/${encodeURIComponent(identifier)}/settings`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-slug': tenantSlug,
        },
        body: JSON.stringify({ settings: updatedSettings }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to update project statuses (${res.status})`);
      }

      setSuccessMessage(`Successfully added status '${unmappedStatus}' to project!`);
      await onReconciled();
    } catch (err: any) {
      setActionError(err.message || 'Error updating status settings');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── ACTION 4: Batch Remap Statuses with Chunking ─────────────────────────
  const handleBatchRemapStatus = async (itemIds: string[], targetStatus: string) => {
    if (itemIds.length === 0 || !targetStatus) return;
    clearAlerts();
    setIsSubmitting(true);

    try {
      const { succeededCount, failedCount, errors } = await runChunkedBulkUpdates(
        itemIds,
        { status: targetStatus },
        tenantSlug
      );

      if (failedCount === 0) {
        setSuccessMessage(`Remapped ${succeededCount} item(s) to status '${targetStatus}'!`);
      } else if (succeededCount > 0) {
        setActionError(
          `Remapped ${succeededCount} item(s), but ${failedCount} item(s) failed: ${errors[0]}`
        );
      } else {
        throw new Error(errors[0] || 'Failed to remap item statuses');
      }

      if (succeededCount > 0) {
        await onReconciled();
      }
    } catch (err: any) {
      setActionError(err.message || 'Error remapping item statuses');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── ACTION 5: Detach Incompatible Parent ────────────────────────────────
  const handleDetachParent = async (itemId: string) => {
    clearAlerts();
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/v1/items', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-slug': tenantSlug,
        },
        body: JSON.stringify({
          id: itemId,
          parent_id: null,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to detach parent (${res.status})`);
      }

      setSuccessMessage('Parent detached successfully!');
      await onReconciled();
    } catch (err: any) {
      setActionError(err.message || 'Error detaching parent');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => !isSubmitting && onClose()}
      data-testid="schema-reconciliation-modal"
    >
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white flex items-center gap-2">
                Schema Reconciliation
                <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono">
                  {deviations.length} issue{deviations.length !== 1 ? 's' : ''}
                </span>
              </h2>
              <p className="text-xs text-slate-400">
                Resolve items that deviate from project hierarchy, status definitions, or nesting rules.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isSubmitting}
            className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Portfolio Project Selector (when in portfolio mode and multiple projects exist) */}
        {isPortfolio && (projectGroups.length > 1 || (allProjects && allProjects.length > 1)) && (
          <div className="flex items-center space-x-1.5 px-6 py-2 border-b border-slate-800/80 bg-slate-950/30 overflow-x-auto text-xs">
            <span className="text-slate-400 text-[11px] font-medium mr-1 shrink-0">Project:</span>
            <button
              type="button"
              onClick={() => {
                clearAlerts();
                setSelectedProjectFilter('all');
              }}
              className={`px-2.5 py-1 rounded-md transition-colors shrink-0 ${
                selectedProjectFilter === 'all'
                  ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                  : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-transparent'
              }`}
            >
              All Projects ({deviations.length})
            </button>
            {projectGroups.map((g) => (
              <button
                key={g.projectSlug}
                type="button"
                onClick={() => {
                  clearAlerts();
                  setSelectedProjectFilter(g.projectSlug);
                }}
                className={`px-2.5 py-1 rounded-md transition-colors shrink-0 ${
                  selectedProjectFilter === g.projectSlug
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40 font-semibold'
                    : 'bg-slate-800/60 text-slate-400 hover:text-slate-200 border border-transparent'
                }`}
              >
                {g.projectName} ({g.deviations.length})
              </button>
            ))}
          </div>
        )}

        {/* Section Tabs */}
        <div className="flex items-center space-x-2 px-6 pt-3 border-b border-slate-800 bg-slate-900/50">
          <button
            onClick={() => {
              clearAlerts();
              setActiveSection('levels');
            }}
            className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeSection === 'levels'
                ? 'border-emerald-400 text-emerald-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>Unmapped Levels ({levelDeviationsCount})</span>
          </button>

          <button
            onClick={() => {
              clearAlerts();
              setActiveSection('statuses');
            }}
            className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeSection === 'statuses'
                ? 'border-emerald-400 text-emerald-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-3.5 h-3.5" />
            <span>Unmapped Statuses ({statusDeviationsCount})</span>
          </button>

          <button
            onClick={() => {
              clearAlerts();
              setActiveSection('nesting');
            }}
            className={`flex items-center space-x-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors ${
              activeSection === 'nesting'
                ? 'border-emerald-400 text-emerald-400 font-semibold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <GitFork className="w-3.5 h-3.5" />
            <span>Nesting Conflicts ({nestingDeviationsCount})</span>
          </button>
        </div>

        {/* Alert banners */}
        {actionError && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-rose-950/40 border border-rose-800/60 text-xs text-rose-300 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{actionError}</span>
          </div>
        )}

        {successMessage && (
          <div className="mx-6 mt-4 p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-300 flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMessage}</span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          {deviations.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <CheckCircle2 className="w-12 h-12 text-emerald-400 mx-auto" />
              <p className="text-sm font-medium text-white">All items conform to the project schema!</p>
              <p className="text-xs text-slate-400">
                No unmapped hierarchy levels, unknown statuses, or nesting conflicts detected.
              </p>
            </div>
          ) : activeSection === 'levels' ? (
            /* ── SECTION: UNMAPPED HIERARCHY LEVELS ── */
            <div className="space-y-6">
              {filteredGroups.every((g) => g.levelDeviations.length === 0) ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  No unmapped hierarchy levels detected.
                </div>
              ) : (
                filteredGroups.map((group) => {
                  if (group.levelDeviations.length === 0) return null;

                  const defaultTarget =
                    group.settings.hierarchy?.[group.settings.hierarchy.length - 1]?.type || '';
                  const remapLevelTarget =
                    remapTargets[`lvl_${group.projectSlug}`] || defaultTarget;

                  return (
                    <div key={group.projectSlug} className="space-y-3">
                      {isPortfolio && (
                        <div className="flex items-center space-x-2 pb-1 border-b border-slate-800">
                          <span className="text-xs font-semibold text-slate-200">
                            Project: {group.projectName}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            {group.projectSlug}
                          </span>
                        </div>
                      )}

                      {group.summary.unmappedLevels.map((lvl) => {
                        const matchingItems = group.levelDeviations.filter(
                          (d) => d.currentValue === lvl
                        );
                        const hasFocusedItem = matchingItems.some(
                          (m) => m.id === focusDeviationId || m.itemId === focusDeviationId
                        );

                        return (
                          <div
                            key={lvl}
                            className={`p-4 rounded-xl bg-slate-950/60 border transition-all space-y-3 ${
                              hasFocusedItem
                                ? 'border-amber-400/80 ring-1 ring-amber-400/50 shadow-lg shadow-amber-950/30'
                                : 'border-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  {lvl}
                                </span>
                                <span className="text-xs text-slate-300">
                                  found on <strong className="text-white">{matchingItems.length}</strong>{' '}
                                  item{matchingItems.length !== 1 ? 's' : ''}
                                </span>
                              </div>

                              {/* 1-Click Extend Project Hierarchy */}
                              <button
                                type="button"
                                onClick={() =>
                                  handleExtendHierarchy(lvl, group.projectSlug, group.settings)
                                }
                                disabled={isSubmitting}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow"
                                data-testid={`extend-hierarchy-btn-${lvl}`}
                              >
                                {isSubmitting ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Layers className="w-3.5 h-3.5" />
                                )}
                                <span>Extend Hierarchy (Add &quot;{lvl}&quot;)</span>
                              </button>
                            </div>

                            {/* Items affected list preview */}
                            <div className="max-h-32 overflow-y-auto space-y-1.5 pl-2 border-l-2 border-slate-800">
                              {matchingItems.map((item) => {
                                const isItemFocused =
                                  item.id === focusDeviationId || item.itemId === focusDeviationId;
                                return (
                                  <div
                                    key={item.itemId}
                                    className={`text-xs flex items-center justify-between p-1 rounded transition-colors ${
                                      isItemFocused
                                        ? 'bg-amber-500/20 text-amber-200 font-semibold'
                                        : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                  >
                                    <span className="truncate max-w-[340px]">
                                      {item.itemRef ? `[${item.itemRef}] ` : ''}
                                      {item.itemTitle}
                                    </span>
                                    <span className="text-[10px] font-mono text-slate-500">
                                      {item.itemId.slice(0, 8)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            {/* Batch Remap Option */}
                            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400">Or remap items to:</span>
                                <select
                                  value={remapLevelTarget}
                                  onChange={(e) =>
                                    setRemapTargets((prev) => ({
                                      ...prev,
                                      [`lvl_${group.projectSlug}`]: e.target.value,
                                    }))
                                  }
                                  className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 font-mono text-xs focus:outline-none focus:border-emerald-500"
                                >
                                  {group.settings.hierarchy.map((h) => (
                                    <option key={h.type} value={h.type}>
                                      {h.label} ({h.type})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  handleBatchRemapType(
                                    matchingItems.map((m) => m.itemId),
                                    remapLevelTarget
                                  )
                                }
                                disabled={isSubmitting || !remapLevelTarget}
                                className="px-3 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                                data-testid="batch-remap-level-btn"
                              >
                                Remap {matchingItems.length} item{matchingItems.length !== 1 ? 's' : ''}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          ) : activeSection === 'statuses' ? (
            /* ── SECTION: UNMAPPED STATUSES ── */
            <div className="space-y-6">
              {filteredGroups.every((g) => g.statusDeviations.length === 0) ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  No unmapped statuses detected.
                </div>
              ) : (
                filteredGroups.map((group) => {
                  if (group.statusDeviations.length === 0) return null;

                  const defaultTarget = group.settings.statuses?.[0]?.id || '';
                  const remapStatusTarget =
                    remapTargets[`st_${group.projectSlug}`] || defaultTarget;

                  return (
                    <div key={group.projectSlug} className="space-y-3">
                      {isPortfolio && (
                        <div className="flex items-center space-x-2 pb-1 border-b border-slate-800">
                          <span className="text-xs font-semibold text-slate-200">
                            Project: {group.projectName}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            {group.projectSlug}
                          </span>
                        </div>
                      )}

                      {group.summary.unmappedStatuses.map((st) => {
                        const matchingItems = group.statusDeviations.filter(
                          (d) => d.currentValue === st
                        );
                        const hasFocusedItem = matchingItems.some(
                          (m) => m.id === focusDeviationId || m.itemId === focusDeviationId
                        );

                        return (
                          <div
                            key={st}
                            className={`p-4 rounded-xl bg-slate-950/60 border transition-all space-y-3 ${
                              hasFocusedItem
                                ? 'border-amber-400/80 ring-1 ring-amber-400/50 shadow-lg shadow-amber-950/30'
                                : 'border-slate-800'
                            }`}
                          >
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div className="flex items-center space-x-2">
                                <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  {st}
                                </span>
                                <span className="text-xs text-slate-300">
                                  found on <strong className="text-white">{matchingItems.length}</strong>{' '}
                                  item{matchingItems.length !== 1 ? 's' : ''}
                                </span>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  handleExtendStatuses(st, group.projectSlug, group.settings)
                                }
                                disabled={isSubmitting}
                                className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer shadow"
                                data-testid={`extend-status-btn-${st}`}
                              >
                                {isSubmitting ? (
                                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                ) : (
                                  <Sliders className="w-3.5 h-3.5" />
                                )}
                                <span>Extend Statuses (Add &quot;{st}&quot;)</span>
                              </button>
                            </div>

                            <div className="max-h-32 overflow-y-auto space-y-1.5 pl-2 border-l-2 border-slate-800">
                              {matchingItems.map((item) => {
                                const isItemFocused =
                                  item.id === focusDeviationId || item.itemId === focusDeviationId;
                                return (
                                  <div
                                    key={item.itemId}
                                    className={`text-xs flex items-center justify-between p-1 rounded transition-colors ${
                                      isItemFocused
                                        ? 'bg-amber-500/20 text-amber-200 font-semibold'
                                        : 'text-slate-400 hover:text-slate-200'
                                    }`}
                                  >
                                    <span className="truncate max-w-[340px]">
                                      {item.itemRef ? `[${item.itemRef}] ` : ''}
                                      {item.itemTitle}
                                    </span>
                                    <span className="text-[10px] font-mono text-slate-500">
                                      {item.itemId.slice(0, 8)}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>

                            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-xs">
                              <div className="flex items-center gap-2">
                                <span className="text-slate-400">Or remap items to:</span>
                                <select
                                  value={remapStatusTarget}
                                  onChange={(e) =>
                                    setRemapTargets((prev) => ({
                                      ...prev,
                                      [`st_${group.projectSlug}`]: e.target.value,
                                    }))
                                  }
                                  className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 font-mono text-xs focus:outline-none focus:border-emerald-500"
                                >
                                  {group.settings.statuses.map((s) => (
                                    <option key={s.id} value={s.id}>
                                      {s.label} ({s.id})
                                    </option>
                                  ))}
                                </select>
                              </div>

                              <button
                                type="button"
                                onClick={() =>
                                  handleBatchRemapStatus(
                                    matchingItems.map((m) => m.itemId),
                                    remapStatusTarget
                                  )
                                }
                                disabled={isSubmitting || !remapStatusTarget}
                                className="px-3 py-1 text-xs rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 transition-colors disabled:opacity-50 cursor-pointer"
                                data-testid="batch-remap-status-btn"
                              >
                                Remap {matchingItems.length} item{matchingItems.length !== 1 ? 's' : ''}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            /* ── SECTION: NESTING CONFLICTS ── */
            <div className="space-y-6">
              {filteredGroups.every((g) => g.nestingDeviations.length === 0) ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  No nesting conflicts detected.
                </div>
              ) : (
                filteredGroups.map((group) => {
                  if (group.nestingDeviations.length === 0) return null;

                  return (
                    <div key={group.projectSlug} className="space-y-3">
                      {isPortfolio && (
                        <div className="flex items-center space-x-2 pb-1 border-b border-slate-800">
                          <span className="text-xs font-semibold text-slate-200">
                            Project: {group.projectName}
                          </span>
                          <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">
                            {group.projectSlug}
                          </span>
                        </div>
                      )}

                      {group.nestingDeviations.map((dev) => {
                        const isDevFocused =
                          dev.id === focusDeviationId || dev.itemId === focusDeviationId;
                        return (
                          <div
                            key={dev.id}
                            className={`p-4 rounded-xl bg-slate-950/60 border space-y-2.5 transition-all ${
                              isDevFocused
                                ? 'border-rose-500 ring-1 ring-rose-400/50 shadow-lg shadow-rose-950/30'
                                : 'border-rose-900/30'
                            }`}
                          >
                            <div className="flex items-center justify-between flex-wrap gap-2">
                              <div>
                                <div className="text-xs font-semibold text-white">
                                  {dev.itemRef ? `[${dev.itemRef}] ` : ''}
                                  {dev.itemTitle}
                                </div>
                                <p className="text-xs text-rose-400 mt-0.5">{dev.message}</p>
                              </div>

                              <button
                                type="button"
                                onClick={() => handleDetachParent(dev.itemId)}
                                disabled={isSubmitting}
                                className="px-3 py-1.5 text-xs font-medium rounded-lg bg-rose-950/60 hover:bg-rose-900/80 text-rose-300 border border-rose-800/60 transition-colors flex items-center gap-1.5 disabled:opacity-50 cursor-pointer"
                                data-testid="detach-parent-btn"
                              >
                                <Unlink className="w-3.5 h-3.5" />
                                <span>Detach Parent</span>
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-slate-800 bg-slate-950/40 flex items-center justify-between">
          <button
            type="button"
            onClick={async () => {
              clearAlerts();
              await onReconciled();
            }}
            disabled={isSubmitting}
            className="text-xs text-slate-400 hover:text-white flex items-center gap-1 transition-colors"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Recheck Schema</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-medium rounded-lg bg-slate-800 hover:bg-slate-700 text-white transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
