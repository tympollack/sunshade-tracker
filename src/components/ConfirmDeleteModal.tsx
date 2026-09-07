'use client';

import React, { useState, useEffect } from 'react';
import { Trash2, AlertTriangle, Loader2, X, Hash } from 'lucide-react';

interface ConfirmDeleteModalProps {
  isOpen: boolean;
  itemTitle: string;
  itemRef?: string | null;
  onConfirm: () => Promise<void> | void;
  onClose: () => void;
}

export function ConfirmDeleteModal({
  isOpen,
  itemTitle,
  itemRef,
  onConfirm,
  onClose,
}: ConfirmDeleteModalProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isDeleting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isDeleting, onClose]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    setIsDeleting(true);
    try {
      await onConfirm();
      onClose();
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={() => !isDeleting && onClose()}
    >
      <div
        className="w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 space-y-4">
          <div className="flex items-start justify-between">
            <div className="flex items-center space-x-3">
              <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-white">Delete Work Item</h3>
                <p className="text-xs text-slate-400">This action cannot be undone.</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="p-1 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors disabled:opacity-50"
              title="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 bg-slate-950/80 border border-slate-800/80 rounded-xl space-y-1">
            {itemRef && (
              <span className="text-[11px] font-mono text-slate-400 flex items-center space-x-1">
                <Hash className="w-3 h-3 text-slate-500" />
                <span>{itemRef}</span>
              </span>
            )}
            <p className="text-xs font-medium text-slate-200 line-clamp-2 leading-relaxed">
              {itemTitle}
            </p>
          </div>

          <p className="text-xs text-slate-400 leading-relaxed">
            Are you sure you want to delete this work item? Any child relationships or local assignments will be updated immediately.
          </p>

          <div className="flex items-center justify-end space-x-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isDeleting}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirm}
              disabled={isDeleting}
              className="px-4 py-2 rounded-xl text-xs font-medium bg-red-600 hover:bg-red-500 text-white flex items-center space-x-1.5 transition-colors disabled:opacity-50 shadow-lg shadow-red-600/20"
            >
              {isDeleting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Deleting...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Delete Item</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
