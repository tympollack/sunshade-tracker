'use client';

import { useState, useEffect, useRef } from 'react';
import {
  X,
  Trash2,
  Save,
  User,
  Hash,
  Layers,
  GitFork,
  Calendar,
  AlertCircle,
  Plus,
  Tag,
} from 'lucide-react';
import { WorkItem, ProjectSettings, StatusDefinition } from '@/types/tracker';
import { getHierarchyLevelColor } from '@/lib/hierarchy-colors';

interface WorkItemModalProps {
  item: WorkItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<WorkItem>) => Promise<void> | void;
  onDelete: (id: string) => Promise<void> | void;
  projectSettings: ProjectSettings;
  allItems: WorkItem[];
  currentUser?: { full_name?: string; email?: string };
  workspaceMembers?: { full_name: string; email?: string }[];
}

export function WorkItemModal({
  item,
  isOpen,
  onClose,
  onSave,
  onDelete,
  projectSettings,
  allItems,
  currentUser,
  workspaceMembers = [],
}: WorkItemModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('');
  const [itemType, setItemType] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [assignee, setAssignee] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [metadata, setMetadata] = useState<Record<string, any>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [newMetaKey, setNewMetaKey] = useState('');
  const [newMetaVal, setNewMetaVal] = useState('');
  const [showAddMeta, setShowAddMeta] = useState(false);

  // Sync form state when item changes
  useEffect(() => {
    if (item) {
      setTitle(item.title || '');
      setDescription(item.description || '');
      setStatus(item.status || projectSettings.statuses[0]?.id || 'backlog');
      setItemType(item.item_type || projectSettings.hierarchy[0]?.type || 'task');
      setParentId(item.parent_id || '');
      setAssignee(item.assignee || '');
      setExternalRef(item.external_ref_id || '');
      setMetadata(item.metadata ? { ...item.metadata } : {});
      setShowAddMeta(false);
    }
  }, [item, projectSettings]);

  // Handle ESC key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        handleSave();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, title, description, status, itemType, parentId, assignee, externalRef, metadata]);

  if (!isOpen || !item) return null;

  // Determine allowed parents based on selected itemType
  const currentHierarchyConfig = projectSettings.hierarchy.find((h) => h.type === itemType);
  const allowedParentTypes = currentHierarchyConfig?.allowed_parents || [];
  const eligibleParents = allItems.filter(
    (other) => other.id !== item.id && allowedParentTypes.includes(other.item_type)
  );

  // Derive assignee options
  const myDisplayName = currentUser?.full_name
    ? `Me (${currentUser.full_name})`
    : currentUser?.email
    ? `Me (${currentUser.email.split('@')[0]})`
    : 'Me';

  const memberNames = Array.from(
    new Set([
      ...workspaceMembers.map((m) => m.full_name).filter(Boolean),
      ...allItems
        .map((i) => i.assignee)
        .filter((a): a is string => typeof a === 'string' && a.length > 0 && !a.startsWith('Me (')),
    ])
  );

  const levelColor = getHierarchyLevelColor(itemType, projectSettings.hierarchy);

  const handleSave = async () => {
    if (!title.trim()) return;
    setIsSaving(true);
    try {
      await onSave(item.id, {
        title: title.trim(),
        description: description.trim() || null,
        status,
        item_type: itemType,
        parent_id: parentId || null,
        assignee: assignee || null,
        external_ref_id: externalRef.trim() || null,
        metadata,
      });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    if (confirm(`Delete "${item.title}"? This cannot be undone.`)) {
      await onDelete(item.id);
      onClose();
    }
  };

  const handleAddMetaField = () => {
    if (!newMetaKey.trim()) return;
    setMetadata((prev) => ({
      ...prev,
      [newMetaKey.trim()]: newMetaVal.trim(),
    }));
    setNewMetaKey('');
    setNewMetaVal('');
    setShowAddMeta(false);
  };

  const handleRemoveMetaField = (key: string) => {
    setMetadata((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between bg-slate-950/50">
          <div className="flex items-center space-x-3">
            <span
              className={`text-xs uppercase font-mono px-2.5 py-1 rounded-md border font-semibold ${levelColor.badgeBg} ${levelColor.badgeText} ${levelColor.badgeBorder}`}
            >
              {itemType}
            </span>
            {item.external_ref_id && (
              <span className="text-xs font-mono text-slate-400 flex items-center space-x-1">
                <Hash className="w-3 h-3 text-slate-500" />
                <span>{item.external_ref_id}</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors"
              title="Delete work item"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {/* Title */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Title
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="Work item title..."
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 leading-relaxed transition-colors"
              placeholder="Detailed description, context, or acceptance criteria..."
            />
          </div>

          {/* Core Properties Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Status */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
              >
                {projectSettings.statuses.map((st: StatusDefinition) => (
                  <option key={st.id} value={st.id}>
                    {st.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Hierarchy Level / Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Hierarchy Level
              </label>
              <select
                value={itemType}
                onChange={(e) => {
                  setItemType(e.target.value);
                  // Reset parent if current parent doesn't match new allowed parents
                  const newCfg = projectSettings.hierarchy.find((h) => h.type === e.target.value);
                  const allowed = newCfg?.allowed_parents || [];
                  const parentItem = allItems.find((i) => i.id === parentId);
                  if (parentItem && !allowed.includes(parentItem.item_type)) {
                    setParentId('');
                  }
                }}
                className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
              >
                {projectSettings.hierarchy.map((h) => (
                  <option key={h.type} value={h.type}>
                    {h.label} (Level {h.level})
                  </option>
                ))}
              </select>
            </div>

            {/* Assignee */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Assignee
              </label>
              <div className="relative">
                <select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Unassigned</option>
                  <option value={myDisplayName}>{myDisplayName}</option>
                  {memberNames
                    .filter((name) => name !== myDisplayName)
                    .map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* External Ref ID */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                External Ref ID
              </label>
              <input
                type="text"
                value={externalRef}
                onChange={(e) => setExternalRef(e.target.value)}
                placeholder="e.g. TASK-101"
                className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            {/* Parent Item */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Parent Item{' '}
                {allowedParentTypes.length > 0 && (
                  <span className="text-slate-500 normal-case font-mono">
                    (Allowed: {allowedParentTypes.join(', ')})
                  </span>
                )}
              </label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
              >
                <option value="">None (Top Level)</option>
                {eligibleParents.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.item_type}] {p.external_ref_id ? `(${p.external_ref_id}) ` : ''}
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Metadata Section */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Tag className="w-3.5 h-3.5 text-slate-500" />
                <span>Custom Metadata Fields</span>
              </label>
              <button
                type="button"
                onClick={() => setShowAddMeta(!showAddMeta)}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center space-x-1 font-medium transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>Add Field</span>
              </button>
            </div>

            {/* Metadata Tags */}
            <div className="flex flex-wrap gap-2">
              {Object.entries(metadata).length === 0 ? (
                <span className="text-xs text-slate-600 italic">No metadata attributes defined.</span>
              ) : (
                Object.entries(metadata).map(([k, v]) => (
                  <div
                    key={k}
                    className="flex items-center space-x-1.5 px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 group"
                  >
                    <span className="text-slate-500">{k}:</span>
                    <span className="text-emerald-300">{String(v)}</span>
                    <button
                      type="button"
                      onClick={() => handleRemoveMetaField(k)}
                      className="text-slate-600 hover:text-red-400 ml-1 transition-colors"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                ))
              )}
            </div>

            {/* Add Field Inputs */}
            {showAddMeta && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 animate-in fade-in">
                <input
                  type="text"
                  placeholder="Key (e.g. priority)"
                  value={newMetaKey}
                  onChange={(e) => setNewMetaKey(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500 w-36"
                />
                <input
                  type="text"
                  placeholder="Value (e.g. High)"
                  value={newMetaVal}
                  onChange={(e) => setNewMetaVal(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500 flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddMetaField}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  Add
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between">
          <span className="text-[11px] text-slate-500 font-mono">
            Press <kbd className="px-1.5 py-0.5 rounded bg-slate-800 text-slate-400">Ctrl+Enter</kbd> to save
          </span>
          <div className="flex items-center space-x-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-medium rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving || !title.trim()}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center space-x-1.5 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
