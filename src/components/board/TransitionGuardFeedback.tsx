'use client';

import React from 'react';
import { AlertTriangle, ShieldAlert, X, Plus } from 'lucide-react';
import type { ProjectSettings, WorkItem } from '@/types/tracker';
import { getUnmetTransitionGuards, type UnmetGuardRequirement } from '@/lib/automation/guardEvaluator';

export interface GuardRejectionToastProps {
  message: string | null;
  errors?: string[];
  onDismiss?: () => void;
}

/**
 * High-contrast toast notification rendered when a status transition or Kanban drag-and-drop
 * is rejected by a project TransitionGuard (`GUARD_REJECTED`).
 */
export function GuardRejectionToast({ message, errors, onDismiss }: GuardRejectionToastProps) {
  if (!message) return null;

  return (
    <div
      role="alert"
      aria-live="assertive"
      data-testid="guard-rejection-toast"
      className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[60] max-w-lg w-[calc(100%-2rem)] sm:w-auto px-4 py-3 rounded-xl bg-rose-950 text-rose-50 border-2 border-rose-500 shadow-2xl shadow-rose-950/80 text-xs flex items-start space-x-3 animate-in fade-in slide-in-from-bottom-2 duration-200"
    >
      <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-rose-100 leading-snug break-words">{message}</p>
        {Array.isArray(errors) && errors.length > 1 && (
          <ul className="mt-1 space-y-0.5 list-disc list-inside text-[11px] text-rose-200/90">
            {errors.map((err, idx) => (
              <li key={idx}>{err}</li>
            ))}
          </ul>
        )}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss guard notification"
          data-testid="dismiss-guard-toast-btn"
          className="text-rose-300 hover:text-white p-0.5 rounded transition-colors shrink-0 cursor-pointer"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export interface TransitionGuardWarningBannerProps {
  item: Partial<WorkItem> | Record<string, any> | null | undefined;
  projectSettings?: ProjectSettings | null;
  selectedStatus?: string;
  onQuickAddField?: (fieldKey: string) => void;
  existingMetadataKeys?: Record<string, any>;
  testId?: string;
}

/**
 * Proactive warning banner displayed in card detail modals and inspector drawers
 * when required transition guard fields are blank.
 */
export function TransitionGuardWarningBanner({
  item,
  projectSettings,
  selectedStatus,
  onQuickAddField,
  existingMetadataKeys,
  testId = 'transition-guard-warning',
}: TransitionGuardWarningBannerProps) {
  const unmet = React.useMemo(
    () => getUnmetTransitionGuards(item, projectSettings),
    [item, projectSettings]
  );

  if (unmet.length === 0) return null;

  const isSelectedStatusBlocked = Boolean(
    selectedStatus && unmet.some((u) => u.targetStatus === selectedStatus)
  );

  return (
    <div
      role="region"
      aria-label="Transition Guard Requirements Warning"
      data-testid={testId}
      className={`p-3 rounded-xl border text-xs space-y-1.5 animate-in fade-in ${
        isSelectedStatusBlocked
          ? 'bg-rose-950/60 border-rose-500/70 text-rose-200'
          : 'bg-amber-950/50 border-amber-500/60 text-amber-200'
      }`}
    >
      <div className="flex items-center space-x-2 font-semibold">
        <AlertTriangle
          className={`w-4 h-4 shrink-0 ${
            isSelectedStatusBlocked ? 'text-rose-400' : 'text-amber-400'
          }`}
        />
        <span>
          {isSelectedStatusBlocked
            ? `Cannot transition to selected status — unmet transition guard requirements`
            : `Unmet transition guard requirements`}
        </span>
      </div>
      <ul className="space-y-1 pl-6">
        {unmet.map((req: UnmetGuardRequirement, idx: number) => {
          const canAddField =
            onQuickAddField &&
            existingMetadataKeys &&
            !(req.fieldKey in existingMetadataKeys);
          return (
            <li
              key={`${req.guardId}-${req.field}-${idx}`}
              data-testid={`guard-unmet-item-${req.fieldKey}`}
              className="flex flex-wrap items-center justify-between gap-2 text-[11px]"
            >
              <span>
                <strong className="font-mono text-amber-100">{req.targetStatusLabel}:</strong>{' '}
                {req.message}{' '}
                <span className="font-mono opacity-80">({req.fieldKey})</span>
              </span>
              {canAddField && (
                <button
                  type="button"
                  onClick={() => onQuickAddField(req.fieldKey)}
                  data-testid={`guard-quick-add-${req.fieldKey}`}
                  className="px-2 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 font-mono text-[10px] inline-flex items-center space-x-1 transition-colors cursor-pointer"
                >
                  <Plus className="w-2.5 h-2.5" />
                  <span>Add {req.fieldKey}</span>
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
