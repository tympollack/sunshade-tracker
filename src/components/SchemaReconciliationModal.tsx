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
import { SchemaDeviation, summarizeDeviations } from '@/lib/schema-deviation';
import { getDefaultLevelHex } from '@/lib/hierarchy-colors';

export interface SchemaReconciliationModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviations: SchemaDeviation[];
  projectSettings: ProjectSettings;
  projectIdOrSlug?: string;
  tenantSlug: string;
  onReconciled: () => Promise<void> | void;
  focusDeviationId?: string | null;
}

export function SchemaReconciliationModal({
  isOpen,
  onClose,
  deviations,
  projectSettings,
  projectIdOrSlug,
  tenantSlug,
  onReconciled,
}: SchemaReconciliationModalProps) {
  const [activeSection, setActiveSection] = useState<'levels' | 'statuses' | 'nesting'>('levels');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Selected remap targets
  const [remapLevelTarget, setRemapLevelTarget] = useState<string>('');
  const [remapStatusTarget, setRemapStatusTarget] = useState<string>('');

  const summary = useMemo(() => summarizeDeviations(deviations), [deviations]);

  const levelDeviations = useMemo(
    () => deviations.filter((d) => d.deviationType === 'unmapped_level'),
    [deviations]
  );
  const statusDeviations = useMemo(
    () => deviations.filter((d) => d.deviationType === 'unmapped_status'),
    [deviations]
  );
  const nestingDeviations = useMemo(
    () => deviations.filter((d) => d.deviationType === 'nesting_conflict'),
    [deviations]
  );

  // Auto-switch to active tab with deviations
  useEffect(() => {
    if (levelDeviations.length > 0) {
      setActiveSection('levels');
    } else if (statusDeviations.length > 0) {
      setActiveSection('statuses');
    } else if (nestingDeviations.length > 0) {
      setActiveSection('nesting');
    }
  }, [levelDeviations.length, statusDeviations.length, nestingDeviations.length]);

  // Set default remap targets
  useEffect(() => {
    if (!remapLevelTarget && projectSettings.hierarchy?.length) {
      setRemapLevelTarget(projectSettings.hierarchy[projectSettings.hierarchy.length - 1].type);
    }
    if (!remapStatusTarget && projectSettings.statuses?.length) {
      setRemapStatusTarget(projectSettings.statuses[0].id);
    }
  }, [projectSettings, remapLevelTarget, remapStatusTarget]);

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
  const handleExtendHierarchy = async (unmappedType: string) => {
    if (!projectIdOrSlug) {
      setActionError('Project ID or slug is required to update schema settings.');
      return;
    }
    clearAlerts();
    setIsSubmitting(true);

    try {
      const currentHierarchy: HierarchyLevel[] = projectSettings.hierarchy || [];
      const highestLevel = currentHierarchy.reduce(
        (max, h) => (h.level > max ? h.level : max),
        0
      );
      const lowestExistingType = currentHierarchy.length > 0
        ? currentHierarchy[currentHierarchy.length - 1].type
        : '';

      const formattedLabel = unmappedType.charAt(0).toUpperCase() + unmappedType.slice(1);
      const nextLevelNum = highestLevel + 1;

      const newLevel: HierarchyLevel = {
        type: unmappedType.toLowerCase(),
        label: formattedLabel,
        level: nextLevelNum,
        allowed_parents: lowestExistingType ? [lowestExistingType] : [],
        color: getDefaultLevelHex(nextLevelNum),
      };

      const updatedSettings: ProjectSettings = {
        ...projectSettings,
        hierarchy: [...currentHierarchy, newLevel],
      };

      const res = await fetch(`/api/v1/projects/${encodeURIComponent(projectIdOrSlug)}/settings`, {
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

  // ─── ACTION 2: Batch Remap Item Types ───────────────────────────────────
  const handleBatchRemapType = async (itemIds: string[], targetType: string) => {
    if (itemIds.length === 0 || !targetType) return;
    clearAlerts();
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/v1/items/bulk', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-slug': tenantSlug,
        },
        body: JSON.stringify({
          ids: itemIds,
          updates: { item_type: targetType },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to remap item types (${res.status})`);
      }

      setSuccessMessage(`Remapped ${itemIds.length} item(s) to '${targetType}'!`);
      await onReconciled();
    } catch (err: any) {
      setActionError(err.message || 'Error remapping item types');
    } finally {
      setIsSubmitting(false);
    }
  };

  // ─── ACTION 3: 1-Click Extend Statuses ──────────────────────────────────
  const handleExtendStatuses = async (unmappedStatus: string) => {
    if (!projectIdOrSlug) {
      setActionError('Project ID or slug is required to update schema settings.');
      return;
    }
    clearAlerts();
    setIsSubmitting(true);

    try {
      const currentStatuses: StatusDefinition[] = projectSettings.statuses || [];
      const highestOrder = currentStatuses.reduce(
        (max, s) => (s.order > max ? s.order : max),
        0
      );

      const formattedLabel = unmappedStatus
        .split('_')
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ');

      const newStatus: StatusDefinition = {
        id: unmappedStatus.toLowerCase(),
        label: formattedLabel,
        color: '#94a3b8',
        order: highestOrder + 1000,
      };

      const updatedSettings: ProjectSettings = {
        ...projectSettings,
        statuses: [...currentStatuses, newStatus],
      };

      const res = await fetch(`/api/v1/projects/${encodeURIComponent(projectIdOrSlug)}/settings`, {
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

  // ─── ACTION 4: Batch Remap Statuses ─────────────────────────────────────
  const handleBatchRemapStatus = async (itemIds: string[], targetStatus: string) => {
    if (itemIds.length === 0 || !targetStatus) return;
    clearAlerts();
    setIsSubmitting(true);

    try {
      const res = await fetch('/api/v1/items/bulk', {
        method: 'PATCH',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-slug': tenantSlug,
        },
        body: JSON.stringify({
          ids: itemIds,
          updates: { status: targetStatus },
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to remap statuses (${res.status})`);
      }

      setSuccessMessage(`Remapped ${itemIds.length} item(s) to status '${targetStatus}'!`);
      await onReconciled();
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
            <span>Unmapped Levels ({levelDeviations.length})</span>
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
            <span>Unmapped Statuses ({statusDeviations.length})</span>
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
            <span>Nesting Conflicts ({nestingDeviations.length})</span>
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
        <div className="p-6 overflow-y-auto space-y-4 flex-1">
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
            <div className="space-y-4">
              {levelDeviations.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  No unmapped hierarchy levels detected.
                </div>
              ) : (
                summary.unmappedLevels.map((lvl) => {
                  const matchingItems = levelDeviations.filter((d) => d.currentValue === lvl);
                  return (
                    <div
                      key={lvl}
                      className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {lvl}
                          </span>
                          <span className="text-xs text-slate-300">
                            found on <strong className="text-white">{matchingItems.length}</strong> item{matchingItems.length !== 1 ? 's' : ''}
                          </span>
                        </div>

                        {/* 1-Click Extend Project Hierarchy */}
                        <button
                          type="button"
                          onClick={() => handleExtendHierarchy(lvl)}
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
                        {matchingItems.map((item) => (
                          <div
                            key={item.itemId}
                            className="text-xs flex items-center justify-between text-slate-400 hover:text-slate-200"
                          >
                            <span className="truncate max-w-[340px]">
                              {item.itemRef ? `[${item.itemRef}] ` : ''}
                              {item.itemTitle}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">{item.itemId.slice(0, 8)}</span>
                          </div>
                        ))}
                      </div>

                      {/* Batch Remap Option */}
                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Or remap items to:</span>
                          <select
                            value={remapLevelTarget}
                            onChange={(e) => setRemapLevelTarget(e.target.value)}
                            className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 font-mono text-xs focus:outline-none focus:border-emerald-500"
                          >
                            {projectSettings.hierarchy.map((h) => (
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
                })
              )}
            </div>
          ) : activeSection === 'statuses' ? (
            /* ── SECTION: UNMAPPED STATUSES ── */
            <div className="space-y-4">
              {statusDeviations.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  No unmapped statuses detected.
                </div>
              ) : (
                summary.unmappedStatuses.map((st) => {
                  const matchingItems = statusDeviations.filter((d) => d.currentValue === st);
                  return (
                    <div
                      key={st}
                      className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3"
                    >
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center space-x-2">
                          <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                            {st}
                          </span>
                          <span className="text-xs text-slate-300">
                            found on <strong className="text-white">{matchingItems.length}</strong> item{matchingItems.length !== 1 ? 's' : ''}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => handleExtendStatuses(st)}
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
                        {matchingItems.map((item) => (
                          <div
                            key={item.itemId}
                            className="text-xs flex items-center justify-between text-slate-400 hover:text-slate-200"
                          >
                            <span className="truncate max-w-[340px]">
                              {item.itemRef ? `[${item.itemRef}] ` : ''}
                              {item.itemTitle}
                            </span>
                            <span className="text-[10px] font-mono text-slate-500">{item.itemId.slice(0, 8)}</span>
                          </div>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between flex-wrap gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <span className="text-slate-400">Or remap items to:</span>
                          <select
                            value={remapStatusTarget}
                            onChange={(e) => setRemapStatusTarget(e.target.value)}
                            className="px-2.5 py-1 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 font-mono text-xs focus:outline-none focus:border-emerald-500"
                          >
                            {projectSettings.statuses.map((s) => (
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
                })
              )}
            </div>
          ) : (
            /* ── SECTION: NESTING CONFLICTS ── */
            <div className="space-y-4">
              {nestingDeviations.length === 0 ? (
                <div className="text-center py-8 text-xs text-slate-500">
                  No nesting conflicts detected.
                </div>
              ) : (
                nestingDeviations.map((dev) => (
                  <div
                    key={dev.id}
                    className="p-4 rounded-xl bg-slate-950/60 border border-rose-900/30 space-y-2.5"
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
                ))
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
