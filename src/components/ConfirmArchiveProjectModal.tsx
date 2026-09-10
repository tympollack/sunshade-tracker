'use client';

import React from 'react';
import { AlertTriangle, Archive, Loader2, X } from 'lucide-react';

interface ConfirmArchiveProjectModalProps {
  isOpen: boolean;
  projectName: string;
  projectSlug: string;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  isArchiving?: boolean;
}

export function ConfirmArchiveProjectModal({
  isOpen,
  projectName,
  projectSlug,
  onClose,
  onConfirm,
  isArchiving = false,
}: ConfirmArchiveProjectModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in">
      <div className="w-full max-w-md rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
              <Archive className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-white">Archive Project</h3>
              <p className="text-xs text-slate-400">/{projectSlug}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isArchiving}
            className="p-1 rounded-lg text-slate-500 hover:text-slate-300 hover:bg-slate-800 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 space-y-1 text-xs text-amber-200/90">
          <div className="flex items-center space-x-1.5 font-semibold text-amber-300">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>Are you sure you want to archive this project?</span>
          </div>
          <p className="text-[11px] text-amber-300/80 leading-relaxed pl-5">
            <strong>{projectName}</strong> and all of its work items will be hidden from the active
            board and overview switchers.
          </p>
        </div>

        <p className="text-xs text-slate-400 leading-relaxed">
          No data will be permanently deleted. You can restore this project and all of its work items
          at any time from <strong>Workspace Settings → Archived Projects</strong>.
        </p>

        <div className="flex items-center justify-end space-x-3 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={isArchiving}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-300 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isArchiving}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-500 text-xs font-semibold text-white flex items-center space-x-1.5 transition-colors disabled:opacity-50"
          >
            {isArchiving ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Archiving…</span>
              </>
            ) : (
              <>
                <Archive className="w-3.5 h-3.5" />
                <span>Archive Project</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
