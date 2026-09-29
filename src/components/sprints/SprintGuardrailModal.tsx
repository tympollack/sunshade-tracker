'use client';

import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  X,
  ArrowRightLeft,
  CheckCircle2,
  AlertTriangle,
  Lock,
  Layers,
} from 'lucide-react';
import { WorkItem } from '@/types/tracker';
import { isUnstartedStatus } from '@/lib/services/sprintGuardrailService';

export interface SprintGuardrailModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirmSwap: (ejectedItemIds: string[]) => void | Promise<void>;
  incomingItem: {
    id?: string;
    title: string;
    story_points?: number;
    external_ref_id?: string | null;
    item_type?: string;
    metadata?: Record<string, any>;
  };
  sprintName: string;
  requiredEjectionPoints: number;
  availableUnstartedItems: WorkItem[];
  isSubmitting?: boolean;
}

/**
 * Impassable Zero-Sum Barrier Modal (SprintGuardrailModal)
 * Intercepts drag-and-drop or sprint assignment operations when an active sprint exceeds capacity.
 * Enforces zero-sum trade-off swaps by requiring unstarted items totaling >= required points
 * to be atomically ejected back to the backlog.
 */
export const SprintGuardrailModal: React.FC<SprintGuardrailModalProps> = ({
  isOpen,
  onClose,
  onConfirmSwap,
  incomingItem,
  sprintName,
  requiredEjectionPoints,
  availableUnstartedItems = [],
  isSubmitting = false,
}) => {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Extract numeric points for incoming item
  const incomingPoints = useMemo(() => {
    const p =
      incomingItem.metadata?.story_points ??
      incomingItem.story_points ??
      incomingItem.metadata?.points ??
      0;
    const num = Number(p);
    return isNaN(num) || num < 0 ? 0 : num;
  }, [incomingItem]);

  // Filter candidate items to exclusively unstarted items
  const eligibleItems = useMemo(() => {
    return availableUnstartedItems.filter((it) => isUnstartedStatus(it.status));
  }, [availableUnstartedItems]);

  // Differential math: points selected vs required
  const selectedPoints = useMemo(() => {
    return eligibleItems.reduce((acc, it) => {
      if (selectedIds.has(it.id)) {
        const p = Number(it.metadata?.story_points ?? it.metadata?.points ?? 0);
        return acc + (isNaN(p) || p < 0 ? 0 : p);
      }
      return acc;
    }, 0);
  }, [eligibleItems, selectedIds]);

  const remainingNeeded = Math.max(0, requiredEjectionPoints - selectedPoints);
  const isSwapSatisfied = selectedPoints >= requiredEjectionPoints;

  const toggleItem = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleConfirm = async () => {
    if (!isSwapSatisfied || isSubmitting) return;
    await onConfirmSwap(Array.from(selectedIds));
  };

  if (!isOpen) return null;

  return (
    <div
      data-testid="sprint-guardrail-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-xl rounded-2xl bg-[#090d16] border border-red-500/30 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="p-5 border-b border-red-500/20 bg-gradient-to-r from-red-950/40 via-slate-900/50 to-transparent flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-400 shrink-0">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider bg-red-500/10 text-red-400 border border-red-500/30">
                  Zero-Sum Scope Guardrail
                </span>
                <span className="text-xs font-mono text-slate-500">
                  {sprintName}
                </span>
              </div>
              <h2 className="text-lg font-bold text-white mt-1">
                Sprint Capacity Barrier
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="guardrail-close-button"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 custom-scrollbar">
          {/* Canonical Impassable UI Message */}
          <div
            data-testid="guardrail-capacity-message"
            className="p-3.5 rounded-xl bg-slate-900/80 border border-red-500/20 text-slate-200 text-xs leading-relaxed"
          >
            <p className="font-medium text-slate-100">
              Capacity limit reached. To add this {incomingPoints}-point story, select unstarted items totaling at least {requiredEjectionPoints} points to eject back to the backlog.
            </p>
          </div>

          {/* Incoming Item Card */}
          <div className="p-3 rounded-xl bg-slate-900/40 border border-slate-800 flex items-center justify-between">
            <div className="min-w-0 pr-3">
              <div className="text-[10px] uppercase font-mono tracking-wider text-slate-400 flex items-center gap-1.5">
                <Layers className="w-3 h-3 text-emerald-400" />
                <span>Incoming Story</span>
                {incomingItem.external_ref_id && (
                  <span className="text-emerald-400 font-bold">
                    [{incomingItem.external_ref_id}]
                  </span>
                )}
              </div>
              <p className="text-sm font-semibold text-white truncate mt-0.5">
                {incomingItem.title}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <span className="px-2.5 py-1 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 font-mono text-xs font-bold">
                {incomingPoints} pts
              </span>
            </div>
          </div>

          {/* Differential Math Telemetry Panel */}
          <div className="grid grid-cols-3 gap-2.5 p-3 rounded-xl bg-slate-950 border border-slate-800/80 text-center font-mono">
            <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] text-slate-400 block uppercase">Required</span>
              <span className="text-base font-bold text-red-400" data-testid="points-required">
                {requiredEjectionPoints} pts
              </span>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] text-slate-400 block uppercase">Selected</span>
              <span
                className={`text-base font-bold ${
                  isSwapSatisfied ? 'text-emerald-400' : 'text-amber-400'
                }`}
                data-testid="points-selected"
              >
                {selectedPoints} pts
              </span>
            </div>
            <div className="p-2 rounded-lg bg-slate-900/60 border border-slate-800">
              <span className="text-[10px] text-slate-400 block uppercase">Deficit</span>
              <span
                className={`text-base font-bold ${
                  remainingNeeded === 0 ? 'text-emerald-400' : 'text-red-400'
                }`}
                data-testid="points-deficit"
              >
                {remainingNeeded} pts
              </span>
            </div>
          </div>

          {/* Ejection Item Multi-Select Picker */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
              <span>Select Unstarted Sprint Items to Eject ({eligibleItems.length})</span>
              <span className="text-[11px] text-slate-400 font-normal lowercase">
                {selectedIds.size} selected
              </span>
            </label>

            {eligibleItems.length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-900/30 border border-slate-800 text-center text-xs text-slate-400">
                <AlertTriangle className="w-5 h-5 mx-auto mb-1 text-amber-400" />
                No unstarted tasks exist in this sprint to trade off.
              </div>
            ) : (
              <div className="space-y-1.5 max-h-52 overflow-y-auto pr-1 custom-scrollbar">
                {eligibleItems.map((item) => {
                  const pts = Number(item.metadata?.story_points ?? item.metadata?.points ?? 0);
                  const isChecked = selectedIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      onClick={() => toggleItem(item.id)}
                      data-testid={`ejection-item-${item.id}`}
                      className={`p-2.5 rounded-xl border text-xs flex items-center justify-between cursor-pointer transition-colors ${
                        isChecked
                          ? 'bg-red-950/20 border-red-500/50 text-white'
                          : 'bg-slate-950 border-slate-800/80 hover:border-slate-700 text-slate-300'
                      }`}
                    >
                      <div className="flex items-center space-x-2.5 min-w-0 pr-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => {}} // handled by parent div
                          className="rounded border-slate-700 text-red-500 focus:ring-0 focus:ring-offset-0 bg-slate-900 cursor-pointer shrink-0"
                        />
                        <div className="truncate">
                          <span className="font-mono text-[10px] text-slate-400 mr-1.5">
                            {item.external_ref_id || item.id.slice(0, 8)}
                          </span>
                          <span className="font-medium text-white">{item.title}</span>
                        </div>
                      </div>
                      <span className="px-2 py-0.5 rounded-md bg-slate-900 border border-slate-800 text-slate-300 font-mono text-[11px] shrink-0 font-bold">
                        {pts} pts
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800/80 bg-slate-950/60 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-900 transition-colors"
          >
            Cancel
          </button>

          <button
            type="button"
            disabled={!isSwapSatisfied || isSubmitting}
            onClick={handleConfirm}
            data-testid="guardrail-confirm-swap-button"
            className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center space-x-1.5 transition-all ${
              isSwapSatisfied && !isSubmitting
                ? 'bg-red-500 hover:bg-red-600 text-white shadow-lg shadow-red-500/20 cursor-pointer'
                : 'bg-slate-800 text-slate-500 cursor-not-allowed'
            }`}
          >
            <ArrowRightLeft className="w-3.5 h-3.5" />
            <span>
              {isSubmitting
                ? 'Swapping Scope...'
                : isSwapSatisfied
                ? `Eject ${selectedIds.size} Items & Add Story`
                : `Need ${remainingNeeded} More Points to Swap`}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
