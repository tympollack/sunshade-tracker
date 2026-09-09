'use client';

import React, { useState, useEffect } from 'react';
import {
  Calendar,
  X,
  Plus,
  Trash2,
  Edit2,
  CheckCircle2,
  PlayCircle,
  Clock,
  AlertCircle,
  Save,
} from 'lucide-react';
import { SprintDefinition, WorkItem } from '@/types/tracker';
import {
  formatSprintDateRange,
  getSprintStatusBadge,
  compareSprints,
} from '@/lib/sprint-utils';

interface ManageSprintsModalProps {
  isOpen: boolean;
  onClose: () => void;
  sprints: SprintDefinition[];
  onSaveSprints: (updatedSprints: SprintDefinition[]) => Promise<void>;
  items?: WorkItem[];
}

export const ManageSprintsModal: React.FC<ManageSprintsModalProps> = ({
  isOpen,
  onClose,
  sprints,
  onSaveSprints,
  items = [],
}) => {
  const [localSprints, setLocalSprints] = useState<SprintDefinition[]>([]);
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state for add / edit
  const [formName, setFormName] = useState('');
  const [formStartDate, setFormStartDate] = useState('');
  const [formEndDate, setFormEndDate] = useState('');
  const [formGoal, setFormGoal] = useState('');
  const [formStatus, setFormStatus] = useState<'planned' | 'active' | 'completed'>('planned');

  useEffect(() => {
    if (isOpen) {
      setLocalSprints([...sprints]);
      setIsAdding(false);
      setEditingId(null);
      setError(null);
    }
  }, [isOpen, sprints]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (isAdding || editingId) {
          setIsAdding(false);
          setEditingId(null);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isAdding, editingId, onClose]);

  if (!isOpen) return null;

  const resetForm = () => {
    setFormName('');
    setFormStartDate('');
    setFormEndDate('');
    setFormGoal('');
    setFormStatus('planned');
    setIsAdding(false);
    setEditingId(null);
  };

  const handleStartAdd = () => {
    resetForm();
    setIsAdding(true);
  };

  const handleStartEdit = (sprint: SprintDefinition) => {
    setIsAdding(false);
    setEditingId(sprint.id);
    setFormName(sprint.name);
    setFormStartDate(sprint.start_date || '');
    setFormEndDate(sprint.end_date || '');
    setFormGoal(sprint.goal || '');
    setFormStatus(sprint.status);
  };

  const handleSaveSprintForm = () => {
    const trimmedName = formName.trim();
    if (!trimmedName) {
      setError('Sprint name is required');
      return;
    }

    if (formStartDate && formEndDate && formStartDate > formEndDate) {
      setError('Start date cannot be after end date');
      return;
    }

    setError(null);

    if (editingId) {
      setLocalSprints((prev) =>
        prev.map((s) => {
          if (s.id === editingId) {
            return {
              ...s,
              name: trimmedName,
              start_date: formStartDate || null,
              end_date: formEndDate || null,
              goal: formGoal.trim() || null,
              status: formStatus,
              is_current: formStatus === 'active' ? true : s.is_current,
            };
          }
          if (formStatus === 'active') {
            return { ...s, is_current: false };
          }
          return s;
        })
      );
    } else {
      const newSprint: SprintDefinition = {
        id: crypto.randomUUID ? crypto.randomUUID() : `sprint_${Date.now()}`,
        name: trimmedName,
        start_date: formStartDate || null,
        end_date: formEndDate || null,
        goal: formGoal.trim() || null,
        status: formStatus,
        is_current: formStatus === 'active',
      };

      setLocalSprints((prev) => {
        const next = formStatus === 'active' ? prev.map((s) => ({ ...s, is_current: false })) : [...prev];
        return [...next, newSprint];
      });
    }

    resetForm();
  };

  const handleSetActive = (sprintId: string) => {
    setLocalSprints((prev) =>
      prev.map((s) => ({
        ...s,
        status: s.id === sprintId ? 'active' : s.status === 'active' ? 'planned' : s.status,
        is_current: s.id === sprintId,
      }))
    );
  };

  const handleSetCompleted = (sprintId: string) => {
    setLocalSprints((prev) =>
      prev.map((s) => (s.id === sprintId ? { ...s, status: 'completed', is_current: false } : s))
    );
  };

  const handleDelete = (sprintId: string) => {
    const target = localSprints.find((s) => s.id === sprintId);
    if (!target) return;

    const assignedCount = items.filter((it) => it.metadata?.sprint === target.name).length;
    if (
      assignedCount > 0 &&
      !window.confirm(
        `Sprint "${target.name}" has ${assignedCount} assigned item(s). Deleting the sprint definition will leave those items in backlog. Continue?`
      )
    ) {
      return;
    }

    setLocalSprints((prev) => prev.filter((s) => s.id !== sprintId));
  };

  const handleCommitAll = async () => {
    setIsSaving(true);
    setError(null);
    try {
      await onSaveSprints(localSprints);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to save sprints to project settings');
    } finally {
      setIsSaving(false);
    }
  };

  // Sort sprints for display
  const sortedLocalSprints = [...localSprints].sort((a, b) => compareSprints(a, b));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="manage-sprints-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-fade-in"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl max-w-2xl w-full overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/60">
          <div className="flex items-center space-x-3">
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <h3 id="manage-sprints-title" className="text-base font-semibold text-white">
                Manage Sprints
              </h3>
              <p className="text-xs text-slate-400">
                Define sprint cycles, dates, goals, and active iterations
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 custom-scrollbar">
          {error && (
            <div className="p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
          )}

          {/* Add / Edit Form */}
          {(isAdding || editingId) && (
            <div className="p-4 rounded-xl bg-slate-950/80 border border-slate-700/80 space-y-4">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-emerald-400">
                  {editingId ? 'Edit Sprint' : 'Create New Sprint'}
                </h4>
                <button
                  type="button"
                  onClick={resetForm}
                  className="text-xs text-slate-400 hover:text-slate-200"
                >
                  Cancel
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300">
                    Sprint Name <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Sprint 2026-Q4"
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300">Status</label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="planned">Planned</option>
                    <option value="active">Active</option>
                    <option value="completed">Completed</option>
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300">Start Date</label>
                  <input
                    type="date"
                    value={formStartDate}
                    onChange={(e) => setFormStartDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] font-medium text-slate-300">End Date</label>
                  <input
                    type="date"
                    value={formEndDate}
                    onChange={(e) => setFormEndDate(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div className="space-y-1 md:col-span-2">
                  <label className="text-[11px] font-medium text-slate-300">Sprint Goal</label>
                  <textarea
                    rows={2}
                    value={formGoal}
                    onChange={(e) => setFormGoal(e.target.value)}
                    placeholder="Key delivery objective or sprint focus..."
                    className="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500 resize-none"
                  />
                </div>
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={resetForm}
                  className="px-3 py-1.5 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveSprintForm}
                  className="px-3.5 py-1.5 rounded-lg text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 transition-colors flex items-center space-x-1.5 shadow-sm"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingId ? 'Update Sprint' : 'Add Sprint'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Sprints List Header & Add Button */}
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-slate-400">
              Configured Sprints ({localSprints.length})
            </div>
            {!isAdding && !editingId && (
              <button
                type="button"
                onClick={handleStartAdd}
                className="px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-400 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors flex items-center space-x-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>New Sprint</span>
              </button>
            )}
          </div>

          {/* Sprints List */}
          {sortedLocalSprints.length === 0 ? (
            <div className="text-center py-8 text-xs text-slate-500 italic border border-dashed border-slate-800 rounded-xl">
              No sprints configured yet. Click "New Sprint" above to define your first iteration cycle.
            </div>
          ) : (
            <div className="space-y-2.5 divide-y divide-slate-800/40">
              {sortedLocalSprints.map((sprint) => {
                const badge = getSprintStatusBadge(sprint.status);
                const dateRangeStr = formatSprintDateRange(sprint.start_date, sprint.end_date);
                const assignedCount = items.filter((it) => it.metadata?.sprint === sprint.name).length;

                return (
                  <div
                    key={sprint.id}
                    className="pt-2.5 first:pt-0 flex flex-col md:flex-row md:items-center justify-between gap-3 p-3 rounded-xl bg-slate-950/40 border border-slate-800/80 hover:border-slate-700/80 transition-colors"
                  >
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center space-x-2.5 flex-wrap">
                        <span className="font-semibold text-sm text-white">{sprint.name}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded-full font-medium border ${badge.bg} ${badge.text} ${badge.border}`}
                        >
                          {badge.label}
                        </span>
                        {sprint.is_current && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full font-medium bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                            Current Focus
                          </span>
                        )}
                        <span className="text-[10px] font-mono text-slate-400 px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800">
                          {assignedCount} {assignedCount === 1 ? 'item' : 'items'}
                        </span>
                      </div>

                      {dateRangeStr && (
                        <div className="flex items-center space-x-1.5 text-xs text-slate-400">
                          <Clock className="w-3 h-3 text-slate-500" />
                          <span>{dateRangeStr}</span>
                        </div>
                      )}

                      {sprint.goal && (
                        <p className="text-xs text-slate-400 italic line-clamp-2">
                          "{sprint.goal}"
                        </p>
                      )}
                    </div>

                    <div className="flex items-center space-x-1.5 shrink-0 self-end md:self-center">
                      {sprint.status !== 'active' && (
                        <button
                          type="button"
                          onClick={() => handleSetActive(sprint.id)}
                          className="px-2 py-1 rounded text-xs font-medium text-emerald-400 hover:bg-emerald-500/10 border border-transparent hover:border-emerald-500/30 transition-colors"
                          title="Make Active Sprint"
                          aria-label={`Set ${sprint.name} Active`}
                        >
                          Set Active
                        </button>
                      )}
                      {sprint.status !== 'completed' && (
                        <button
                          type="button"
                          onClick={() => handleSetCompleted(sprint.id)}
                          className="px-2 py-1 rounded text-xs font-medium text-purple-400 hover:bg-purple-500/10 border border-transparent hover:border-purple-500/30 transition-colors"
                          title="Complete Sprint"
                          aria-label={`Complete ${sprint.name}`}
                        >
                          Complete
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => handleStartEdit(sprint)}
                        className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                        title="Edit Sprint"
                        aria-label={`Edit ${sprint.name}`}
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDelete(sprint.id)}
                        className="p-1.5 rounded text-slate-400 hover:text-rose-400 hover:bg-slate-800 transition-colors"
                        title="Delete Sprint"
                        aria-label={`Delete ${sprint.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-800 bg-slate-950/60 flex items-center justify-end space-x-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCommitAll}
            disabled={isSaving}
            className="px-4 py-2 text-xs font-medium text-white bg-emerald-600 hover:bg-emerald-500 rounded-lg transition-colors flex items-center space-x-1.5 shadow-sm disabled:opacity-50"
          >
            {isSaving ? (
              <span>Saving...</span>
            ) : (
              <>
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>Save Sprints</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
