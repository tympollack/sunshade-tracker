'use client';

import React, { useState } from 'react';
import {
  Calendar,
  CheckCircle2,
  User,
  Hash,
  Trash2,
  X,
  ChevronDown,
} from 'lucide-react';
import { StatusDefinition } from '@/types/tracker';

interface BulkActionsToolbarProps {
  selectedCount: number;
  availableSprints: string[];
  statuses: StatusDefinition[];
  members?: Array<{ id: string; name: string }>;
  onMoveToSprint: (targetSprint: string) => void;
  onSetStatus: (targetStatus: string) => void;
  onAssignMember: (targetAssignee: string | null) => void;
  onAdjustPoints: (points: number) => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
  isApplying?: boolean;
}

export const BulkActionsToolbar: React.FC<BulkActionsToolbarProps> = ({
  selectedCount,
  availableSprints,
  statuses,
  members = [],
  onMoveToSprint,
  onSetStatus,
  onAssignMember,
  onAdjustPoints,
  onDeleteSelected,
  onClearSelection,
  isApplying = false,
}) => {
  const [isPointsOpen, setIsPointsOpen] = useState(false);
  const [pointsInput, setPointsInput] = useState<string>('');

  if (selectedCount === 0) return null;

  const handleApplyPoints = () => {
    const num = Number(pointsInput);
    if (!isNaN(num) && pointsInput.trim() !== '') {
      onAdjustPoints(num);
      setIsPointsOpen(false);
      setPointsInput('');
    }
  };

  return (
    <div
      role="region"
      aria-label="Bulk actions toolbar"
      className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 bg-slate-900/95 border border-slate-700/90 shadow-2xl shadow-black/80 rounded-2xl px-5 py-3 flex flex-wrap items-center gap-3 backdrop-blur-md animate-fade-in max-w-[95vw]"
    >
      {/* Selection Counter */}
      <div className="flex items-center space-x-2 shrink-0">
        <span className="text-xs font-bold text-white bg-slate-800 border border-slate-700 px-3 py-1 rounded-full shadow-inner font-mono">
          {selectedCount} {selectedCount === 1 ? 'item' : 'items'} selected
        </span>
      </div>

      <div className="h-5 w-px bg-slate-800 shrink-0 hidden sm:block" />

      {/* Action: Move to Sprint */}
      <div className="relative inline-flex items-center">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onMoveToSprint(e.target.value);
          }}
          disabled={isApplying}
          className="bg-slate-950 hover:bg-slate-800 text-xs font-medium text-emerald-400 border border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50 transition-colors"
          title="Move selected items to a sprint or backlog"
        >
          <option value="" disabled>
            Move Sprint →
          </option>
          <option value="__none__">Backlog (Unassigned)</option>
          {availableSprints.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {/* Action: Set Status */}
      <div className="relative inline-flex items-center">
        <select
          value=""
          onChange={(e) => {
            if (e.target.value) onSetStatus(e.target.value);
          }}
          disabled={isApplying}
          className="bg-slate-950 hover:bg-slate-800 text-xs font-medium text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50 transition-colors"
          title="Set status for selected items"
        >
          <option value="" disabled>
            Set Status →
          </option>
          {statuses.map((st) => (
            <option key={st.id} value={st.id}>
              {st.label}
            </option>
          ))}
        </select>
      </div>

      {/* Action: Assign Member */}
      {members.length > 0 ? (
        <div className="relative inline-flex items-center">
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) {
                onAssignMember(e.target.value === '__unassigned__' ? null : e.target.value);
              }
            }}
            disabled={isApplying}
            className="bg-slate-950 hover:bg-slate-800 text-xs font-medium text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50 transition-colors"
            title="Assign member to selected items"
          >
            <option value="" disabled>
              Assign →
            </option>
            <option value="__unassigned__">Unassigned</option>
            {members.map((m) => (
              <option key={m.id} value={m.name || m.id}>
                {m.name || m.id}
              </option>
            ))}
          </select>
        </div>
      ) : null}

      {/* Action: Adjust Story Points Popover */}
      <div className="relative inline-flex items-center">
        {!isPointsOpen ? (
          <button
            type="button"
            onClick={() => setIsPointsOpen(true)}
            disabled={isApplying}
            className="bg-slate-950 hover:bg-slate-800 text-xs font-medium text-slate-200 border border-slate-700 rounded-lg px-2.5 py-1.5 flex items-center space-x-1.5 transition-colors disabled:opacity-50"
            title="Set story points for selected items"
          >
            <Hash className="w-3.5 h-3.5 text-slate-400" />
            <span>Points</span>
          </button>
        ) : (
          <div className="flex items-center space-x-1 bg-slate-950 border border-slate-700 rounded-lg p-1 animate-fade-in">
            <input
              type="number"
              min="0"
              max="999"
              placeholder="Pts"
              value={pointsInput}
              onChange={(e) => setPointsInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleApplyPoints();
                if (e.key === 'Escape') setIsPointsOpen(false);
              }}
              className="w-14 bg-slate-900 text-xs text-white px-2 py-0.5 rounded border border-slate-700 focus:outline-none focus:border-emerald-500 font-mono text-center"
              autoFocus
            />
            <button
              type="button"
              onClick={handleApplyPoints}
              className="px-2 py-0.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
            >
              Set
            </button>
            <button
              type="button"
              onClick={() => setIsPointsOpen(false)}
              className="p-0.5 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Action: Delete */}
      <button
        type="button"
        onClick={onDeleteSelected}
        disabled={isApplying}
        className="bg-rose-500/10 hover:bg-rose-500/20 text-xs font-medium text-rose-300 border border-rose-500/30 rounded-lg px-2.5 py-1.5 flex items-center space-x-1.5 transition-colors disabled:opacity-50"
        title="Soft delete selected items"
      >
        <Trash2 className="w-3.5 h-3.5 text-rose-400" />
        <span>Delete</span>
      </button>

      <div className="h-5 w-px bg-slate-800 shrink-0 hidden sm:block" />

      {/* Deselect / Cancel */}
      <button
        type="button"
        onClick={onClearSelection}
        aria-label="Dismiss bulk selection"
        data-testid="bulk-actions-dismiss"
        className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
        title="Deselect all items"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
};
