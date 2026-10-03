'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  Calendar,
  Target,
  Clock,
  Hash,
  Activity,
  Trash2,
  Save,
  CheckCircle2,
} from 'lucide-react';
import { SprintDefinition } from '@/types/tracker';

export interface SprintInspectorDrawerProps {
  sprint: Partial<SprintDefinition> | null;
  isOpen: boolean;
  onClose: () => void;
  onSave?: (sprintData: Partial<SprintDefinition>) => Promise<void> | void;
  onDelete?: (sprintId: string) => Promise<void> | void;
  isReadOnly?: boolean;
  tenantSlug: string;
}

export function SprintInspectorDrawer({
  sprint,
  isOpen,
  onClose,
  onSave,
  onDelete,
  isReadOnly = false,
}: SprintInspectorDrawerProps) {
  const [name, setName] = useState('');
  const [goal, setGoal] = useState('');
  const [status, setStatus] = useState<'planned' | 'active' | 'completed' | 'unplanned'>('planned');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [committedPoints, setCommittedPoints] = useState<number | ''>('');
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNew = !sprint?.id || sprint.id === 'new';

  useEffect(() => {
    if (sprint) {
      setName(sprint.name || '');
      setGoal(sprint.goal || '');
      setStatus(sprint.status || (sprint.is_active ? 'active' : 'planned'));

      // Format ISO string to YYYY-MM-DD for date input
      const start = sprint.started_at || sprint.start_date;
      setStartDate(start ? String(start).slice(0, 10) : '');

      const end = sprint.ends_at || sprint.end_date;
      setEndDate(end ? String(end).slice(0, 10) : '');

      setCommittedPoints(
        sprint.committed_points !== undefined && sprint.committed_points !== null
          ? Number(sprint.committed_points)
          : ''
      );
      setError(null);
    }
  }, [sprint]);

  if (!isOpen || !sprint) {
    return null;
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('Sprint name is required');
      return;
    }
    if (!onSave) return;

    try {
      setIsSaving(true);
      setError(null);
      await onSave({
        ...sprint,
        name: name.trim(),
        goal: goal.trim() || null,
        status,
        is_active: status === 'active',
        started_at: startDate ? new Date(startDate).toISOString() : null,
        ends_at: endDate ? new Date(endDate).toISOString() : null,
        start_date: startDate || null,
        end_date: endDate || null,
        committed_points: committedPoints === '' ? 0 : Number(committedPoints),
      });
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save sprint');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!sprint.id || isNew || !onDelete) return;
    if (!confirm(`Are you sure you want to delete "${sprint.name}"?`)) return;

    try {
      setIsDeleting(true);
      setError(null);
      await onDelete(sprint.id);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to delete sprint');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div
      data-testid="sprint-inspector-drawer"
      className="flex flex-col h-full w-full bg-slate-900/95 text-slate-100 divide-y divide-slate-800"
    >
      {/* ── Header ── */}
      <div className="flex items-center justify-between p-3.5 bg-slate-950/60 shrink-0">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-amber-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-slate-200">
            {isNew ? 'New Sprint' : 'Sprint Settings'}
          </span>
          {status === 'active' && (
            <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 uppercase font-semibold">
              Active
            </span>
          )}
        </div>

        <button
          type="button"
          onClick={onClose}
          aria-label="Close Sprint Inspector"
          className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* ── Error Banner ── */}
      {error && (
        <div className="p-2.5 bg-red-950/60 text-red-300 text-xs border-b border-red-800/60">
          {error}
        </div>
      )}

      {/* ── Body: Form Controls ── */}
      <form onSubmit={handleSave} className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {/* Sprint Name */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
            <span>Sprint Name</span>
            <span className="text-amber-400">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={isReadOnly}
            required
            aria-label="Sprint Name"
            placeholder="e.g. Sprint 2026-Q4"
            className="w-full bg-slate-950/70 border border-slate-700/80 rounded-md px-3 py-1.5 text-xs text-slate-100 focus:outline-hidden focus:border-amber-400"
          />
        </div>

        {/* Sprint Goal */}
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-300 flex items-center gap-1.5">
            <Target className="w-3.5 h-3.5 text-slate-400" />
            <span>Sprint Goal</span>
          </label>
          <textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            disabled={isReadOnly}
            rows={3}
            aria-label="Sprint Goal"
            placeholder="What is the team's primary objective for this sprint cycle?"
            className="w-full bg-slate-950/70 border border-slate-700/80 rounded-md p-2.5 text-xs text-slate-100 focus:outline-hidden focus:border-amber-400 resize-none leading-relaxed"
          />
        </div>

        {/* Lifecycle Status & Committed Points Grid */}
        <div className="grid grid-cols-2 gap-3 bg-slate-950/40 p-3 rounded-lg border border-slate-800/80 text-xs">
          {/* Status */}
          <div className="space-y-1">
            <label className="text-[11px] text-slate-400 flex items-center gap-1">
              <Activity className="w-3.5 h-3.5" />
              <span>Status</span>
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as any)}
              disabled={isReadOnly}
              aria-label="Sprint Status"
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-hidden focus:border-amber-400"
            >
              <option value="planned">Planned</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
            </select>
          </div>

          {/* Committed Points */}
          <div className="space-y-1">
            <label className="text-[11px] text-slate-400 flex items-center gap-1">
              <Hash className="w-3.5 h-3.5" />
              <span>Committed Pts</span>
            </label>
            <input
              type="number"
              min="0"
              value={committedPoints}
              onChange={(e) =>
                setCommittedPoints(e.target.value === '' ? '' : Number(e.target.value))
              }
              disabled={isReadOnly}
              aria-label="Committed Story Points"
              placeholder="0"
              className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs text-right font-mono focus:outline-hidden focus:border-amber-400"
            />
          </div>
        </div>

        {/* Date Ranges */}
        <div className="space-y-2 bg-slate-950/40 p-3 rounded-lg border border-slate-800/80 text-xs">
          <span className="text-[11px] text-slate-400 flex items-center gap-1 font-medium">
            <Clock className="w-3.5 h-3.5" />
            <span>Timeline Cadence</span>
          </span>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 block mb-0.5">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                disabled={isReadOnly}
                aria-label="Sprint Start Date"
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-hidden focus:border-amber-400"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 block mb-0.5">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                disabled={isReadOnly}
                aria-label="Sprint End Date"
                className="w-full bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-hidden focus:border-amber-400"
              />
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          {!isNew && onDelete && !isReadOnly && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={isDeleting || isSaving}
              aria-label="Delete Sprint"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium text-red-400 hover:text-red-300 hover:bg-red-950/40 border border-red-900/40 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>{isDeleting ? 'Deleting...' : 'Delete'}</span>
            </button>
          )}

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded text-xs font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            {!isReadOnly && (
              <button
                type="submit"
                disabled={isSaving}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-amber-500 text-slate-950 hover:bg-amber-400 shadow transition-colors font-semibold disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : isNew ? 'Create Sprint' : 'Save Changes'}</span>
              </button>
            )}
          </div>
        </div>
      </form>
    </div>
  );
}
