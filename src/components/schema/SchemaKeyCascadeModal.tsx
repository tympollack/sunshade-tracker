'use client';

import React, { useState, useEffect } from 'react';
import { AlertTriangle, ArrowRight, Loader2, Layers, CheckCircle2, X } from 'lucide-react';
import { ProjectSettings, StatusDefinition, HierarchyLevel, WorkItem } from '@/types/tracker';

export interface OrphanStatusEntry {
  oldStatus: StatusDefinition;
  items: WorkItem[];
}

export interface OrphanHierarchyEntry {
  oldHierarchy: HierarchyLevel;
  items: WorkItem[];
}

export interface SchemaKeyCascadeModalProps {
  isOpen: boolean;
  onClose: () => void;
  orphanStatuses: OrphanStatusEntry[];
  orphanHierarchies: OrphanHierarchyEntry[];
  newSettings: ProjectSettings;
  onConfirmCascade: (remapPlan: {
    statusRemaps: Record<string, string>;
    hierarchyRemaps: Record<string, string>;
  }) => Promise<void> | void;
  isMigrating?: boolean;
}

export function SchemaKeyCascadeModal({
  isOpen,
  onClose,
  orphanStatuses = [],
  orphanHierarchies = [],
  newSettings,
  onConfirmCascade,
  isMigrating = false,
}: SchemaKeyCascadeModalProps) {
  const [statusRemaps, setStatusRemaps] = useState<Record<string, string>>({});
  const [hierarchyRemaps, setHierarchyRemaps] = useState<Record<string, string>>({});

  // Initialize defaults on open or when inputs change
  useEffect(() => {
    if (isOpen) {
      const initialStatusRemaps: Record<string, string> = {};
      const fallbackStatus = newSettings.statuses?.[0]?.id || '';
      orphanStatuses.forEach((entry) => {
        initialStatusRemaps[entry.oldStatus.id] = fallbackStatus;
      });
      setStatusRemaps(initialStatusRemaps);

      const initialHierarchyRemaps: Record<string, string> = {};
      const fallbackHierarchy = newSettings.hierarchy?.[0]?.type || '';
      orphanHierarchies.forEach((entry) => {
        initialHierarchyRemaps[entry.oldHierarchy.type] = fallbackHierarchy;
      });
      setHierarchyRemaps(initialHierarchyRemaps);
    }
  }, [isOpen, orphanStatuses, orphanHierarchies, newSettings]);

  if (!isOpen) return null;

  const totalAffectedItems =
    orphanStatuses.reduce((acc, curr) => acc + curr.items.length, 0) +
    orphanHierarchies.reduce((acc, curr) => acc + curr.items.length, 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onConfirmCascade({
      statusRemaps,
      hierarchyRemaps,
    });
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cascade-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="w-full max-w-xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950">
          <div className="flex items-center space-x-2.5">
            <div className="p-2 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-400">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="cascade-modal-title" className="text-sm font-bold text-white">
                Schema Key Cascade Migration
              </h3>
              <p className="text-xs text-slate-400">
                {totalAffectedItems} {totalAffectedItems === 1 ? 'record' : 'records'} require remapping to new schema keys
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={isMigrating}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
            aria-label="Close dialog"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6 overflow-y-auto custom-scrollbar flex-1">
          <div className="p-3.5 rounded-xl bg-amber-950/20 border border-amber-900/40 text-amber-200/90 text-xs leading-relaxed">
            The changes you are saving alter or remove keys that active work items currently depend on.
            Select a target replacement from the new schema for each affected key before persisting the schema.
          </div>

          {/* Status Remaps */}
          {orphanStatuses.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Removed Statuses ({orphanStatuses.length})
              </h4>
              <div className="space-y-2">
                {orphanStatuses.map((entry) => (
                  <div
                    key={entry.oldStatus.id}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className="font-semibold text-white">{entry.oldStatus.label}</span>
                        <code className="text-[10px] text-slate-500 font-mono">({entry.oldStatus.id})</code>
                      </div>
                      <span className="text-[11px] text-amber-400 font-mono">
                        {entry.items.length} {entry.items.length === 1 ? 'item' : 'items'} affected
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500 hidden sm:block" />
                      <select
                        value={statusRemaps[entry.oldStatus.id] || ''}
                        onChange={(e) =>
                          setStatusRemaps((prev) => ({
                            ...prev,
                            [entry.oldStatus.id]: e.target.value,
                          }))
                        }
                        disabled={isMigrating}
                        data-testid={`remap-status-${entry.oldStatus.id}`}
                        className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-emerald-300 font-medium focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        {newSettings.statuses.map((st) => (
                          <option key={st.id} value={st.id}>
                            {st.label} ({st.id})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Hierarchy Remaps */}
          {orphanHierarchies.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Removed Hierarchy Levels ({orphanHierarchies.length})
              </h4>
              <div className="space-y-2">
                {orphanHierarchies.map((entry) => (
                  <div
                    key={entry.oldHierarchy.type}
                    className="p-3 rounded-xl bg-slate-950 border border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
                  >
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className="font-semibold text-white">{entry.oldHierarchy.label}</span>
                        <code className="text-[10px] text-slate-500 font-mono">({entry.oldHierarchy.type})</code>
                      </div>
                      <span className="text-[11px] text-amber-400 font-mono">
                        {entry.items.length} {entry.items.length === 1 ? 'item' : 'items'} affected
                      </span>
                    </div>

                    <div className="flex items-center space-x-2 shrink-0">
                      <ArrowRight className="w-3.5 h-3.5 text-slate-500 hidden sm:block" />
                      <select
                        value={hierarchyRemaps[entry.oldHierarchy.type] || ''}
                        onChange={(e) =>
                          setHierarchyRemaps((prev) => ({
                            ...prev,
                            [entry.oldHierarchy.type]: e.target.value,
                          }))
                        }
                        disabled={isMigrating}
                        data-testid={`remap-hierarchy-${entry.oldHierarchy.type}`}
                        className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-emerald-300 font-medium focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        {newSettings.hierarchy.map((h) => (
                          <option key={h.type} value={h.type}>
                            {h.label} ({h.type})
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-800 flex items-center justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              disabled={isMigrating}
              className="px-4 py-2 text-xs font-semibold rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isMigrating}
              data-testid="confirm-cascade-migration-button"
              className="px-5 py-2 text-xs font-semibold rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors flex items-center space-x-1.5 shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {isMigrating ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Migrating &amp; Saving...</span>
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Migrate &amp; Save Schema</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
