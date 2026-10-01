'use client';

import React, { useState } from 'react';
import { Modal } from '@digitalcanopy/ui';
import { Trash2, AlertTriangle, ChevronDown, ChevronUp, Loader2, Hash } from 'lucide-react';

export interface BulkDeleteItemSummary {
  id: string;
  external_ref_id?: string | null;
  title: string;
}

export interface BulkDeleteConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
  items: BulkDeleteItemSummary[];
  isDeleting?: boolean;
}

export function BulkDeleteConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  items,
  isDeleting = false,
}: BulkDeleteConfirmModalProps) {
  const [showItemList, setShowItemList] = useState(false);

  return (
    <Modal
      isOpen={isOpen}
      onClose={() => {
        if (!isDeleting) onClose();
      }}
      title="Delete Selected Work Items"
      subtitle={`${items.length} ${items.length === 1 ? 'item' : 'items'} will be soft-deleted.`}
      icon={
        <div className="p-2 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400">
          <Trash2 className="w-4 h-4" />
        </div>
      }
      size="md"
      footer={
        <div className="flex items-center justify-end space-x-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-stone-800 hover:bg-stone-700 text-stone-200 border border-stone-700 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isDeleting}
            className="px-4 py-2 rounded-xl text-xs font-medium bg-rose-600 hover:bg-rose-700 text-white flex items-center space-x-1.5 transition-colors disabled:opacity-50 shadow-lg shadow-rose-600/20"
          >
            {isDeleting ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Deleting ({items.length})...</span>
              </>
            ) : (
              <>
                <Trash2 className="w-3.5 h-3.5" />
                <span>Delete ({items.length})</span>
              </>
            )}
          </button>
        </div>
      }
    >
      <div className="space-y-4">
        {/* Warning Callout */}
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-start space-x-3 text-xs text-rose-300">
          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p className="font-semibold text-rose-200">
              Are you sure you want to delete {items.length} selected {items.length === 1 ? 'item' : 'items'}?
            </p>
            <p className="text-[11px] text-rose-300/80 leading-relaxed">
              Selected items will be soft-deleted. Unselected subtasks and associations remain intact, and all audit activity history is preserved.
            </p>
          </div>
        </div>

        {/* Expandable Selected Items List */}
        <div className="rounded-xl border border-stone-800 bg-stone-900/60 overflow-hidden">
          <button
            type="button"
            onClick={() => setShowItemList(!showItemList)}
            className="w-full px-3.5 py-2.5 flex items-center justify-between text-xs text-stone-300 hover:bg-stone-800/40 transition-colors"
          >
            <span className="font-medium text-stone-200">
              Selected Work Items ({items.length})
            </span>
            {showItemList ? (
              <ChevronUp className="w-4 h-4 text-stone-400" />
            ) : (
              <ChevronDown className="w-4 h-4 text-stone-400" />
            )}
          </button>

          {showItemList && (
            <div className="max-h-48 overflow-y-auto divide-y divide-stone-800/60 border-t border-stone-800">
              {items.map((item) => (
                <div key={item.id} className="px-3.5 py-2 flex items-center space-x-2 text-xs">
                  {item.external_ref_id && (
                    <span className="font-mono text-[10px] text-stone-400 bg-stone-800/80 px-1.5 py-0.5 rounded flex items-center space-x-1 shrink-0">
                      <Hash className="w-2.5 h-2.5 text-stone-500" />
                      <span>{item.external_ref_id}</span>
                    </span>
                  )}
                  <span className="text-stone-300 truncate">{item.title}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}
