'use client';

import React, { useEffect } from 'react';
import { AlertTriangle, X, CheckCircle2 } from 'lucide-react';
import { WorkItem } from '@/types/tracker';

interface CascadeCompletionModalProps {
  isOpen: boolean;
  parentItem: WorkItem | null;
  unfinishedChildren: WorkItem[];
  targetStatus: string;
  targetStatusLabel?: string;
  onCompleteParentAnyway: () => void;
  onCompleteAllChildren: () => void;
  onCancel: () => void;
}

export const CascadeCompletionModal: React.FC<CascadeCompletionModalProps> = ({
  isOpen,
  parentItem,
  unfinishedChildren,
  targetStatus,
  targetStatusLabel = 'Complete',
  onCompleteParentAnyway,
  onCompleteAllChildren,
  onCancel,
}) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onCancel]);

  if (!isOpen || !parentItem) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cascade-completion-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <h3 id="cascade-completion-title" className="text-base font-semibold text-white">
                Unfinished Child Tasks
              </h3>
              <p className="text-xs text-slate-400">
                Parent item has open children that have not been completed
              </p>
            </div>
          </div>
          <button
            onClick={onCancel}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-4">
          <p className="text-sm text-slate-300 leading-relaxed">
            You are moving <span className="font-semibold text-white">"{parentItem.title}"</span> to{' '}
            <span className="font-semibold text-emerald-400">{targetStatusLabel}</span>, but it still has{' '}
            <span className="font-bold text-amber-300">{unfinishedChildren.length}</span> unfinished child task(s):
          </p>

          {/* Child tasks list */}
          <div className="max-h-56 overflow-y-auto border border-slate-800/80 rounded-lg divide-y divide-slate-800/60 bg-slate-950/40">
            {unfinishedChildren.map((child) => (
              <div key={child.id} className="p-3 flex items-center justify-between space-x-3 text-xs">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center space-x-2 mb-1">
                    <span className="font-mono text-[11px] text-slate-400 bg-slate-800 px-1.5 py-0.5 rounded">
                      {child.external_ref_id || child.id.slice(0, 8)}
                    </span>
                    <span className="text-[10px] uppercase tracking-wider font-semibold text-sky-400 bg-sky-950/50 border border-sky-800/50 px-1.5 py-0.5 rounded">
                      {child.item_type}
                    </span>
                  </div>
                  <p className="text-slate-200 truncate font-medium">{child.title}</p>
                </div>
                <div className="shrink-0 text-right">
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-300 border border-slate-700">
                    {child.status.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-center"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onCompleteParentAnyway}
            className="px-4 py-2 text-xs font-medium text-slate-200 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-center"
          >
            Complete parent anyway
          </button>
          <button
            type="button"
            onClick={onCompleteAllChildren}
            className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center justify-center space-x-1.5 shadow-sm shadow-emerald-950"
          >
            <CheckCircle2 className="w-3.5 h-3.5" />
            <span>Complete all children too</span>
          </button>
        </div>
      </div>
    </div>
  );
};
