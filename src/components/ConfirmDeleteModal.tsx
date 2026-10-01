'use client';

import React, { useState } from 'react';
import { Modal } from '@digitalcanopy/ui';
import { Trash2, AlertTriangle, Loader2, Hash } from 'lucide-react';

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
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isDeleting) onClose();
      }}
      title="Delete Work Item"
      subtitle="This action cannot be undone."
      icon={
        <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400">
          <AlertTriangle className="w-5 h-5" />
        </div>
      }
      size="sm"
      footer={
        <div className="flex items-center justify-end space-x-2.5">
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
      }
    >
      <div className="space-y-4">
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
      </div>
    </Modal>
  );
}
