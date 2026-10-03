'use client';

import React, { useState, useEffect } from 'react';
import {
  X,
  ExternalLink,
  Copy,
  Check,
  Calendar,
  User,
  Hash,
  GitBranch,
  Layers,
  Save,
} from 'lucide-react';
import { WorkItem, StatusDefinition } from '@/types/tracker';
import { CopyableRefId } from '@/components/CopyableRefId';
import { normalizeAssignee } from '@/lib/assignee-utils';

export interface WorkItemInspectorDrawerProps {
  item: WorkItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateItem?: (
    id: string,
    updates: Partial<WorkItem> & { metadata?: Record<string, any> }
  ) => Promise<void> | void;
  onExpandFull?: (item: WorkItem) => void;
  availableStatuses?: StatusDefinition[];
  availableSprints?: string[];
  availableAssignees?: string[];
  allItems?: WorkItem[];
  isReadOnly?: boolean;
  tenantSlug: string;
  projectSlug?: string;
}

export function WorkItemInspectorDrawer({
  item,
  isOpen,
  onClose,
  onUpdateItem,
  onExpandFull,
  availableStatuses = [],
  availableSprints = [],
  availableAssignees = [],
  allItems = [],
  isReadOnly = false,
  tenantSlug,
  projectSlug,
}: WorkItemInspectorDrawerProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [title, setTitle] = useState(item?.title || '');
  const [description, setDescription] = useState(item?.description || '');
  const [status, setStatus] = useState(item?.status || '');
  const [assignee, setAssignee] = useState(normalizeAssignee(item?.assignee) || '');
  const [points, setPoints] = useState<number | ''>(
    item?.metadata?.story_points ?? item?.metadata?.points ?? ''
  );
  const [sprint, setSprint] = useState(item?.metadata?.sprint || '');
  const [parentId, setParentId] = useState(item?.parent_id || '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (item) {
      setTitle(item.title || '');
      setDescription(item.description || '');
      setStatus(item.status || '');
      setAssignee(normalizeAssignee(item.assignee) || '');
      const pts = item.metadata?.story_points ?? item.metadata?.points;
      setPoints(pts !== undefined && pts !== null ? Number(pts) : '');
      setSprint(item.metadata?.sprint || '');
      setParentId(item.parent_id || '');
      setErrorMessage(null);
    }
  }, [item]);

  if (!isOpen || !item) {
    return null;
  }

  const handleCopyLink = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('item', item.external_ref_id || item.id);
      await navigator.clipboard.writeText(url.toString());
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  const handleFieldChange = async (
    updates: Partial<WorkItem> & { metadata?: Record<string, any> }
  ) => {
    if (isReadOnly || !onUpdateItem) return;
    try {
      setIsSaving(true);
      setErrorMessage(null);
      await onUpdateItem(item.id, updates);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update field');
      setTitle(item.title || '');
      setDescription(item.description || '');
      setStatus(item.status || '');
      setAssignee(normalizeAssignee(item.assignee) || '');
      const pts = item.metadata?.story_points ?? item.metadata?.points;
      setPoints(pts !== undefined && pts !== null ? Number(pts) : '');
      setSprint(item.metadata?.sprint || '');
      setParentId(item.parent_id || '');
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    handleFieldChange({ status: newStatus });
  };

  const handleAssigneeChange = (newAssignee: string) => {
    const canonical = normalizeAssignee(newAssignee) || '';
    setAssignee(canonical);
    handleFieldChange({ assignee: canonical || null });
  };

  const handlePointsBlur = () => {
    const num = points === '' ? null : Number(points);
    const updatedMetadata = {
      ...(item.metadata || {}),
      story_points: num,
      points: num,
    };
    handleFieldChange({ metadata: updatedMetadata });
  };

  const handleSprintChange = (newSprint: string) => {
    setSprint(newSprint);
    const updatedMetadata = {
      ...(item.metadata || {}),
      sprint: newSprint || null,
    };
    handleFieldChange({ metadata: updatedMetadata });
  };

  const handleParentChange = (newParent: string) => {
    setParentId(newParent);
    handleFieldChange({ parent_id: newParent || null });
  };

  const handleDescriptionBlur = () => {
    if (description !== item.description) {
      handleFieldChange({ description });
    }
  };

  const handleTitleBlur = () => {
    if (title !== item.title && title.trim()) {
      handleFieldChange({ title: title.trim() });
    }
  };

  return (
    <div
      data-testid="work-item-inspector-drawer"
      className="flex flex-col h-full w-full bg-slate-900/95 text-slate-100 divide-y divide-slate-800"
    >
      {/* ── Header: Ref, Link, Full Page, Close ── */}
      <div className="flex items-center justify-between p-3.5 bg-slate-950/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <CopyableRefId
            id={item.external_ref_id || item.id}
            displayId={item.external_ref_id || item.id.slice(0, 8)}
            className="text-xs font-mono font-semibold text-emerald-400"
          />
          <span className="text-xs px-2 py-0.5 rounded uppercase tracking-wider bg-slate-800 text-slate-300 font-mono text-[10px]">
            {item.item_type}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Copy Link */}
          <button
            type="button"
            onClick={handleCopyLink}
            aria-label="Copy Link"
            title="Copy deep link to item"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            {copiedLink ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>

          {/* Full Page / Modal Expand */}
          {onExpandFull && (
            <button
              type="button"
              onClick={() => onExpandFull(item)}
              aria-label="Full Page Expand"
              title="Open full item dialog"
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Inspector"
            title="Close drawer (Esc)"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Main Body: Scrollable properties & triage ── */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {errorMessage && (
          <div
            data-testid="inspector-error-banner"
            className="p-2.5 rounded bg-red-950/60 border border-red-800/60 text-xs text-red-300 flex items-center justify-between"
          >
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="ml-2 text-red-400 hover:text-red-200"
            >
              ✕
            </button>
          </div>
        )}

        {/* Title Input */}
        <div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            disabled={isReadOnly}
            aria-label="Work Item Title"
            placeholder="Work item title..."
            className="w-full bg-transparent font-semibold text-base text-slate-100 hover:bg-slate-800/40 focus:bg-slate-800/60 focus:outline-hidden px-2 py-1 -ml-2 rounded border border-transparent focus:border-slate-700 transition-all"
          />
        </div>

        {/* Property Triage Grid */}
        <div className="bg-slate-950/40 rounded-lg border border-slate-800/80 p-3 space-y-2.5 text-xs">
          {/* Status Picker */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Layers className="w-3.5 h-3.5" />
              <span>Status</span>
            </span>
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={isReadOnly}
              aria-label="Status"
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-hidden focus:border-emerald-500"
            >
              {availableStatuses.length > 0 ? (
                availableStatuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))
              ) : (
                <>
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </>
              )}
            </select>
          </div>

          {/* Assignee Select */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-400">
              <User className="w-3.5 h-3.5" />
              <span>Assignee</span>
            </span>
            <select
              value={normalizeAssignee(assignee) || ''}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              disabled={isReadOnly}
              aria-label="Assignee"
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-hidden focus:border-emerald-500"
            >
              <option value="">Unassigned</option>
              {availableAssignees.map((a) => (
                <option key={a} value={normalizeAssignee(a) || a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Story Points */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Hash className="w-3.5 h-3.5" />
              <span>Story Points</span>
            </span>
            <input
              type="number"
              min="0"
              step="1"
              value={points}
              onChange={(e) =>
                setPoints(e.target.value === '' ? '' : Number(e.target.value))
              }
              onBlur={handlePointsBlur}
              disabled={isReadOnly}
              aria-label="Story Points"
              placeholder="0"
              className="w-16 text-right bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-hidden focus:border-emerald-500 font-mono"
            />
          </div>

          {/* Sprint Select */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Calendar className="w-3.5 h-3.5" />
              <span>Sprint</span>
            </span>
            <select
              value={sprint}
              onChange={(e) => handleSprintChange(e.target.value)}
              disabled={isReadOnly}
              aria-label="Sprint"
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-hidden focus:border-emerald-500 max-w-[200px] truncate"
            >
              <option value="">No Sprint (Backlog)</option>
              {availableSprints.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Parent Item Select */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-400">
              <GitBranch className="w-3.5 h-3.5" />
              <span>Parent Item</span>
            </span>
            <select
              value={parentId}
              onChange={(e) => handleParentChange(e.target.value)}
              disabled={isReadOnly}
              aria-label="Parent Item"
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-hidden focus:border-emerald-500 max-w-[200px] truncate"
            >
              <option value="">None (Root Item)</option>
              {allItems
                .filter((i) => i.id !== item.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.external_ref_id || p.id.slice(0, 6)}] {p.title}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Description Markdown Editor */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400 flex items-center justify-between">
            <span>Description</span>
            {isSaving && (
              <span className="text-[10px] text-amber-400 animate-pulse">
                Saving...
              </span>
            )}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={handleDescriptionBlur}
            disabled={isReadOnly}
            aria-label="Description"
            rows={8}
            placeholder="Add detailed markdown description..."
            className="w-full bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-hidden focus:border-slate-700 font-sans leading-relaxed custom-scrollbar resize-y"
          />
        </div>
      </div>
    </div>
  );
}
