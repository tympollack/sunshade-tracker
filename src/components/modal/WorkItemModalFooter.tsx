'use client';

import React from 'react';
import { Save } from 'lucide-react';
import { WorkItem } from '@/types/tracker';

export function formatModalTimestamp(isoString?: string | null): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

export interface WorkItemModalFooterProps {
  item: WorkItem | null;
  activeTab: 'details' | 'associated' | 'children' | 'activity';
  isSaving: boolean;
  isLocked: boolean;
  canSave: boolean;
  onClose: () => void;
  onSave: () => void;
  onSwitchToDetails: () => void;
}

export function WorkItemModalFooter({
  item,
  activeTab,
  isSaving,
  isLocked,
  canSave,
  onClose,
  onSave,
  onSwitchToDetails,
}: WorkItemModalFooterProps) {
  return (
    <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 text-[11px] text-slate-400 font-mono">
        {item?.created_at && (
          <span>
            Created: <span className="text-slate-300">{formatModalTimestamp(item.created_at)}</span>
          </span>
        )}
        {item?.updated_at && (
          <span>
            Updated: <span className="text-slate-300">{formatModalTimestamp(item.updated_at)}</span>
          </span>
        )}
      </div>
      <div className="flex items-center space-x-2.5 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-xs font-medium rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          Close
        </button>
        {activeTab === 'details' ? (
          <button
            type="button"
            onClick={onSave}
            disabled={isSaving || !canSave || isLocked}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center space-x-1.5 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={onSwitchToDetails}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-white flex items-center space-x-1.5 transition-colors"
          >
            <span>Edit Details</span>
          </button>
        )}
      </div>
    </div>
  );
}
