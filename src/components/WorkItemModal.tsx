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
  Copy,
  Check,
  Link2,
} from 'lucide-react';
import { WorkItem, ProjectSettings, StatusDefinition } from '@/types/tracker';
import { getHierarchyLevelColor } from '@/lib/hierarchy-colors';

interface WorkItemModalProps {
  item: WorkItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<WorkItem>) => Promise<void> | void;
  onDelete: (id: string) => Promise<boolean | void> | boolean | void;
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
  const [metaDrafts, setMetaDrafts] = useState<Record<string, string>>({});
  const [metaErrors, setMetaErrors] = useState<Record<string, string | null>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
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
      const rawMeta = item.metadata ? { ...item.metadata } : {};
      setMetadata(rawMeta);
      const drafts: Record<string, string> = {};
      Object.entries(rawMeta).forEach(([k, v]) => {
        drafts[k] = typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v ?? '');
      });
      setMetaDrafts(drafts);
      setMetaErrors({});
      setShowAddMeta(false);
      setSaveError(null);
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
  }, [isOpen, title, description, status, itemType, parentId, assignee, externalRef, metadata, metaErrors]);

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
    const hasErrors = Object.values(metaErrors).some(Boolean);
    if (hasErrors) {
      setSaveError('Please correct invalid metadata values before saving.');
      return;
    }
    setIsSaving(true);
    setSaveError(null);
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
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    try {
      const deleted = await onDelete(item.id);
      if (deleted !== false) {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddMetaField = () => {
    const key = newMetaKey.trim();
    if (!key) return;

    let parsedVal: any = newMetaVal.trim();
    if (parsedVal === 'true') parsedVal = true;
    else if (parsedVal === 'false') parsedVal = false;
    else if (parsedVal === 'null') parsedVal = null;
    else if (!isNaN(Number(parsedVal)) && parsedVal !== '') parsedVal = Number(parsedVal);
    else if (
      (parsedVal.startsWith('{') && parsedVal.endsWith('}')) ||
      (parsedVal.startsWith('[') && parsedVal.endsWith(']'))
    ) {
      try {
        parsedVal = JSON.parse(parsedVal);
      } catch {
        // preserve as string
      }
    }

    setMetadata((prev) => ({ ...prev, [key]: parsedVal }));
    setMetaDrafts((prev) => ({
      ...prev,
      [key]:
        typeof parsedVal === 'object' && parsedVal !== null
          ? JSON.stringify(parsedVal, null, 2)
          : String(parsedVal ?? ''),
    }));
    setMetaErrors((prev) => ({ ...prev, [key]: null }));
    setNewMetaKey('');
    setNewMetaVal('');
    setShowAddMeta(false);
  };

  const [copiedGetUrl, setCopiedGetUrl] = useState(false);

  const handleCopyGetUrl = async () => {
    if (!item) return;
    const url = `${window.location.origin}/api/v1/items?id=${item.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedGetUrl(true);
      setTimeout(() => setCopiedGetUrl(false), 2000);
    } catch (err) {
      console.error('Failed to copy GET URL', err);
    }
  };

  const handleUpdateMetaField = (key: string, rawText: string) => {
    setMetaDrafts((prev) => ({ ...prev, [key]: rawText }));

    const currentVal = metadata[key];
    const isOriginalObject = typeof currentVal === 'object' && currentVal !== null;
    const looksLikeJson = rawText.trim().startsWith('{') || rawText.trim().startsWith('[');

    if (isOriginalObject || looksLikeJson) {
      try {
        const parsed = JSON.parse(rawText);
        setMetadata((prev) => ({ ...prev, [key]: parsed }));
        setMetaErrors((prev) => ({ ...prev, [key]: null }));
      } catch {
        setMetaErrors((prev) => ({ ...prev, [key]: 'Invalid JSON format' }));
      }
      return;
    }

    if (typeof currentVal === 'number') {
      const trimmed = rawText.trim();
      if (trimmed === '') {
        setMetadata((prev) => ({ ...prev, [key]: 0 }));
        setMetaErrors((prev) => ({ ...prev, [key]: null }));
      } else {
        const num = Number(trimmed);
        if (isNaN(num)) {
          setMetaErrors((prev) => ({ ...prev, [key]: 'Must be a valid number' }));
        } else {
          setMetadata((prev) => ({ ...prev, [key]: num }));
          setMetaErrors((prev) => ({ ...prev, [key]: null }));
        }
      }
      return;
    }

    if (typeof currentVal === 'boolean') {
      const boolVal = rawText === 'true';
      setMetadata((prev) => ({ ...prev, [key]: boolVal }));
      setMetaErrors((prev) => ({ ...prev, [key]: null }));
      return;
    }

    // Default string
    setMetadata((prev) => ({ ...prev, [key]: rawText }));
    setMetaErrors((prev) => ({ ...prev, [key]: null }));
  };

  const handleRemoveMetaField = (key: string) => {
    setMetadata((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setMetaDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setMetaErrors((prev) => {
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
          <div className="flex items-center space-x-3 min-w-0">
            <span
              className={`text-xs uppercase font-mono px-2.5 py-1 rounded-md border font-semibold shrink-0 ${levelColor.badgeBg} ${levelColor.badgeText} ${levelColor.badgeBorder}`}
            >
              {itemType}
            </span>
            {item.external_ref_id && (
              <span className="text-xs font-mono text-slate-400 flex items-center space-x-1 shrink-0">
                <Hash className="w-3 h-3 text-slate-500" />
                <span>{item.external_ref_id}</span>
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            {/* Copy GET URL */}
            <button
              type="button"
              onClick={handleCopyGetUrl}
              className="px-2.5 py-1 rounded-lg text-xs font-mono bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 flex items-center space-x-1.5 transition-colors border border-slate-700/60 shadow-sm"
              title="Copy item GET API URL"
            >
              {copiedGetUrl ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied URL</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5 text-slate-400" />
                  <span>Copy GET URL</span>
                </>
              )}
            </button>

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
        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
          {saveError && (
            <div className="p-3 bg-red-950/70 border border-red-800/60 rounded-xl text-red-300 text-xs flex items-center space-x-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
              <span>{saveError}</span>
            </div>
          )}

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

            {/* Suggested Fields from Project Schema */}
            {projectSettings.custom_fields && projectSettings.custom_fields.length > 0 && (
              <div className="flex items-center flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] text-slate-500 font-mono">Suggested fields:</span>
                {projectSettings.custom_fields
                  .filter((f) => !(f in metadata))
                  .map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => handleUpdateMetaField(f, '')}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-emerald-400 transition-colors flex items-center space-x-1"
                      title={`Add ${f} field`}
                    >
                      <Plus className="w-2.5 h-2.5" />
                      <span>{f}</span>
                    </button>
                  ))}
              </div>
            )}

            {/* Editable Metadata Fields List */}
            <div className="space-y-2 pt-1">
              {Object.entries(metadata).length === 0 ? (
                <p className="text-xs text-slate-600 italic py-1">No custom metadata attributes defined.</p>
              ) : (
                Object.entries(metadata).map(([k, v]) => {
                  const draftVal =
                    metaDrafts[k] ??
                    (typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v ?? ''));
                  const isObjectOrArray = typeof v === 'object' && v !== null;
                  const isMultiline =
                    isObjectOrArray ||
                    (typeof v === 'string' && (v.includes('\n') || v.length > 60 || k === 'agent_prompt'));
                  const error = metaErrors[k];
                  const typeLabel = isObjectOrArray
                    ? Array.isArray(v)
                      ? 'array'
                      : 'object'
                    : typeof v;

                  return (
                    <div
                      key={k}
                      className={`flex flex-col sm:flex-row sm:items-start gap-2 p-2.5 rounded-xl bg-slate-950 border text-xs transition-colors ${
                        error ? 'border-red-500/60 bg-red-950/10' : 'border-slate-800 hover:border-slate-700/80'
                      }`}
                    >
                      <div className="flex items-center justify-between sm:w-36 shrink-0 pt-1">
                        <div className="flex flex-col min-w-0 pr-1">
                          <span className="font-mono text-slate-300 font-semibold truncate" title={k}>
                            {k}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">({typeLabel})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMetaField(k)}
                          className="sm:hidden text-slate-600 hover:text-red-400 transition-colors p-1"
                          title={`Remove ${k}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex-1 flex flex-col space-y-1">
                        {typeof v === 'boolean' ? (
                          <select
                            value={String(v)}
                            onChange={(e) => handleUpdateMetaField(k, e.target.value)}
                            className="px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-emerald-300 font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : isMultiline ? (
                          <textarea
                            rows={isObjectOrArray ? 4 : 3}
                            value={draftVal}
                            onChange={(e) => handleUpdateMetaField(k, e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-emerald-300 font-mono focus:outline-none focus:border-emerald-500 custom-scrollbar resize-y leading-relaxed"
                            placeholder={`Enter ${k}...`}
                          />
                        ) : (
                          <input
                            type={typeof v === 'number' ? 'number' : 'text'}
                            value={draftVal}
                            onChange={(e) => handleUpdateMetaField(k, e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-emerald-300 font-mono focus:outline-none focus:border-emerald-500"
                            placeholder={`Enter ${k}...`}
                          />
                        )}
                        {error && (
                          <span className="text-[11px] text-red-400 font-mono flex items-center space-x-1">
                            <span>⚠ {error}</span>
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveMetaField(k)}
                        className="hidden sm:inline-flex p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-slate-900 transition-colors shrink-0 mt-0.5"
                        title={`Remove ${k}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
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
                  disabled={!newMetaKey.trim()}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
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
