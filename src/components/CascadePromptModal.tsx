'use client';

import React, { useEffect } from 'react';
import { ArrowRightCircle, CheckCircle2, X } from 'lucide-react';
import { WorkItem } from '@/types/tracker';

interface CascadePromptModalProps {
  isOpen: boolean;
  type: 'advance_children_to_in_progress' | 'advance_parent_to_complete';
  targetItem: WorkItem | null;
  relatedItems: WorkItem[];
  onConfirm: () => void;
  onDecline: () => void;
  onCancel: () => void;
}

export const CascadePromptModal: React.FC<CascadePromptModalProps> = ({
  isOpen,
  type,
  targetItem,
  relatedItems,
  onConfirm,
  onDecline,
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

  if (!isOpen || !targetItem) return null;

  const isChildrenAdvance = type === 'advance_children_to_in_progress';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="cascade-prompt-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20">
              {isChildrenAdvance ? (
                <ArrowRightCircle className="w-5 h-5" />
              ) : (
                <CheckCircle2 className="w-5 h-5 text-emerald-400" />
              )}
            </div>
            <div>
              <h3 id="cascade-prompt-title" className="text-base font-semibold text-white">
                {isChildrenAdvance ? 'Start Child Tasks?' : 'All Child Tasks Complete'}
              </h3>
              <p className="text-xs text-slate-400">
                {isChildrenAdvance
                  ? 'Cascade In Progress status to unstarted child tasks'
                  : 'Optionally promote parent item to Complete'}
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
          {isChildrenAdvance ? (
            <>
              <p className="text-sm text-slate-300 leading-relaxed">
                You moved <span className="font-semibold text-white">"{targetItem.title}"</span> to{' '}
                <span className="font-semibold text-sky-400">In Progress</span>. Would you like to also move its{' '}
                <span className="font-bold text-sky-300">{relatedItems.length}</span> unstarted child task(s) to{' '}
                <span className="font-semibold text-sky-400">In Progress</span>?
              </p>
              <div className="max-h-48 overflow-y-auto border border-slate-800/80 rounded-lg divide-y divide-slate-800/60 bg-slate-950/40">
                {relatedItems.map((child) => (
                  <div key={child.id} className="p-2.5 flex items-center justify-between space-x-2 text-xs">
                    <div className="min-w-0 flex-1 truncate">
                      <span className="font-mono text-[10px] text-slate-400 mr-2">
                        {child.external_ref_id || child.id.slice(0, 8)}
                      </span>
                      <span className="text-slate-200">{child.title}</span>
                    </div>
                    <span className="px-2 py-0.5 rounded-full text-[10px] bg-slate-800 text-slate-400">
                      {child.status}
                    </span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <p className="text-sm text-slate-300 leading-relaxed">
              All child tasks under parent <span className="font-semibold text-white">"{targetItem.title}"</span> are now finished.
              Would you like to also advance <span className="font-semibold text-white">"{targetItem.title}"</span> to{' '}
              <span className="font-semibold text-emerald-400">Complete</span>?
            </p>
          )}
        </div>

        {/* Actions */}
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
            onClick={onDecline}
            className="px-4 py-2 text-xs font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-lg transition-colors text-center"
          >
            {isChildrenAdvance ? 'Parent only' : 'Keep parent status'}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`px-4 py-2 text-xs font-medium text-white rounded-lg transition-colors text-center ${
              isChildrenAdvance
                ? 'bg-sky-600 hover:bg-sky-500 shadow-sm shadow-sky-950'
                : 'bg-emerald-600 hover:bg-emerald-500 shadow-sm shadow-emerald-950'
            }`}
          >
            {isChildrenAdvance ? 'Update children too' : 'Move parent to Complete'}
          </button>
        </div>
      </div>
    </div>
  );
};
