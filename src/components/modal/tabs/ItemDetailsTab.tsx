'use client';

import React from 'react';
import {
  Lock,
  AlertCircle,
  Loader2,
  Tag,
  Plus,
  X,
} from 'lucide-react';
import { WorkItem, ProjectSettings, StatusDefinition } from '@/types/tracker';
import { GitHubBadge } from '@/components/GitHubBadge';
import { isGitHubMetadataKey } from '@/lib/github-metadata';
import { normalizeAssignee } from '@/lib/assignee-utils';

export interface ItemDetailsTabProps {
  item: WorkItem;
  title: string;
  onTitleChange: (v: string) => void;
  description: string;
  onDescriptionChange: (v: string) => void;
  status: string;
  onStatusChange: (v: string) => void;
  itemType: string;
  onItemTypeChange: (v: string) => void;
  parentId: string;
  onParentIdChange: (v: string) => void;
  assignee: string;
  onAssigneeChange: (v: string) => void;
  externalRef: string;
  onExternalRefChange: (v: string) => void;
  selectedProjectId: string;
  onSelectedProjectIdChange: (v: string) => void;
  projects?: Array<{ id: string; slug: string; name: string }>;
  effectiveProjectSettings: ProjectSettings;
  allowedParentTypes: string[];
  eligibleParents: WorkItem[];
  isLoadingParents: boolean;
  myDisplayName: string;
  canonicalUserHandle?: string;
  memberNames: string[];
  isAllProjects?: boolean;
  metadata: Record<string, any>;
  metaDrafts: Record<string, string>;
  metaErrors: Record<string, string | null>;
  onUpdateMetaField: (key: string, val: string) => void;
  onRemoveMetaField: (key: string) => void;
  showAddMeta: boolean;
  onToggleAddMeta: () => void;
  newMetaKey: string;
  onNewMetaKeyChange: (v: string) => void;
  newMetaVal: string;
  onNewMetaValChange: (v: string) => void;
  onAddMetaField: () => void;
  isLocked: boolean;
  isReadOnly: boolean;
  saveError: string | null;
  modalPrUrl?: string | null;
  modalCommitHash?: string | null;
  modalRepo?: string | null;
  modalOwner?: string | null;
}

export function ItemDetailsTab({
  item,
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  status,
  onStatusChange,
  itemType,
  onItemTypeChange,
  parentId,
  onParentIdChange,
  assignee,
  onAssigneeChange,
  externalRef,
  onExternalRefChange,
  selectedProjectId,
  onSelectedProjectIdChange,
  projects = [],
  effectiveProjectSettings,
  allowedParentTypes,
  eligibleParents,
  isLoadingParents,
  myDisplayName,
  canonicalUserHandle,
  memberNames,
  isAllProjects = false,
  metadata,
  metaDrafts,
  metaErrors,
  onUpdateMetaField,
  onRemoveMetaField,
  showAddMeta,
  onToggleAddMeta,
  newMetaKey,
  onNewMetaKeyChange,
  newMetaVal,
  onNewMetaValChange,
  onAddMetaField,
  isLocked,
  isReadOnly,
  saveError,
  modalPrUrl,
  modalCommitHash,
  modalRepo,
  modalOwner,
}: ItemDetailsTabProps) {
  return (
    <>
      {isLocked && (
        <div
          className={`p-3 rounded-xl text-xs flex items-center space-x-2 animate-in fade-in ${
            isReadOnly
              ? 'bg-sky-950/70 border border-sky-800/60 text-sky-300'
              : 'bg-purple-950/70 border border-purple-800/60 text-purple-300'
          }`}
        >
          <Lock className={`w-4 h-4 shrink-0 ${isReadOnly ? 'text-sky-400' : 'text-purple-400'}`} />
          <span>
            {isReadOnly
              ? 'This workspace is currently in read-only guest mode. Sign in to edit items.'
              : `This item was completed in closed sprint "${item?.metadata?.sprint}" and is immutable (read-only).`}
          </span>
        </div>
      )}

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
          onChange={(e) => onTitleChange(e.target.value)}
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
          onChange={(e) => onDescriptionChange(e.target.value)}
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
            onChange={(e) => onStatusChange(e.target.value)}
            className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
          >
            {effectiveProjectSettings.statuses.map((st: StatusDefinition) => (
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
            onChange={(e) => onItemTypeChange(e.target.value)}
            className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
          >
            {effectiveProjectSettings.hierarchy.map((h) => (
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
              value={normalizeAssignee(assignee) || ''}
              onChange={(e) => onAssigneeChange(normalizeAssignee(e.target.value) || '')}
              data-testid="item-assignee-select"
              className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
            >
              <option value="">Unassigned</option>
              {canonicalUserHandle && (
                <option value={canonicalUserHandle}>
                  {myDisplayName || `${canonicalUserHandle} (You)`}
                </option>
              )}
              {memberNames
                .filter((name) => normalizeAssignee(name) !== canonicalUserHandle)
                .map((name) => {
                  const canonical = normalizeAssignee(name) || name;
                  return (
                    <option key={canonical} value={canonical}>
                      {canonical}
                    </option>
                  );
                })}
            </select>
          </div>
        </div>

        {/* Sprint */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            Sprint
          </label>
          <select
            value={metadata.sprint || ''}
            onChange={(e) => onUpdateMetaField('sprint', e.target.value)}
            data-testid="item-sprint-select"
            className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-mono"
          >
            <option value="">No Sprint (Backlog / Unplanned)</option>
            {(effectiveProjectSettings.sprint_settings?.sprints || []).map((s) => (
              <option key={s.id || s.name} value={s.name}>
                {s.name} ({s.status})
              </option>
            ))}
            {metadata.sprint &&
              !(effectiveProjectSettings.sprint_settings?.sprints || []).some((s) => s.name === metadata.sprint) && (
                <option value={metadata.sprint}>{metadata.sprint} (Custom / Inactive)</option>
              )}
          </select>
        </div>

        {/* External Ref ID */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
            External Ref ID
          </label>
          <input
            type="text"
            value={externalRef}
            onChange={(e) => onExternalRefChange(e.target.value)}
            placeholder="e.g. TASK-101"
            className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-mono"
          />
        </div>

        {/* Project Reassignment */}
        {projects && projects.length > 0 && (
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center justify-between">
              <span>Project</span>
              {selectedProjectId && selectedProjectId !== item?.project_id && (
                <span className="text-[10px] text-amber-400 font-normal">
                  Reassigning project cascades to all child items
                </span>
              )}
            </label>
            <select
              value={selectedProjectId}
              onChange={(e) => onSelectedProjectIdChange(e.target.value)}
              data-testid="item-project-select"
              className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {isAllProjects && !selectedProjectId && (
                <option value="" disabled>
                  -- Select Target Project --
                </option>
              )}
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.slug})
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Parent Item */}
        <div className="space-y-1.5 sm:col-span-2">
          <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center justify-between">
            <span>
              Parent Item{' '}
              {allowedParentTypes.length > 0 && (
                <span className="text-slate-500 normal-case font-mono">
                  (Allowed: {allowedParentTypes.join(', ')})
                </span>
              )}
            </span>
            {isLoadingParents && (
              <span className="text-[11px] text-emerald-400 flex items-center space-x-1 lowercase font-normal">
                <Loader2 className="w-3 h-3 animate-spin" />
                <span>loading parents...</span>
              </span>
            )}
          </label>
          <select
            value={parentId}
            onChange={(e) => onParentIdChange(e.target.value)}
            disabled={isLoadingParents}
            className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500 disabled:opacity-60"
            data-testid="item-parent-select"
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
            onClick={onToggleAddMeta}
            className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center space-x-1 font-medium transition-colors"
          >
            <Plus className="w-3 h-3" />
            <span>Add Field</span>
          </button>
        </div>

        {/* Suggested Fields */}
        {effectiveProjectSettings.custom_fields && effectiveProjectSettings.custom_fields.length > 0 && (
          <div className="flex items-center flex-wrap gap-1.5 pt-1">
            <span className="text-[10px] text-slate-500 font-mono">Suggested fields:</span>
            {effectiveProjectSettings.custom_fields
              .filter((f) => !(f in metadata))
              .map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => onUpdateMetaField(f, '')}
                  className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-emerald-400 transition-colors flex items-center space-x-1"
                  title={`Add ${f} field`}
                >
                  <Plus className="w-2.5 h-2.5" />
                  <span>{f}</span>
                </button>
              ))}
          </div>
        )}

        {/* Fields List */}
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
                      onClick={() => onRemoveMetaField(k)}
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
                        onChange={(e) => onUpdateMetaField(k, e.target.value)}
                        className="px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-emerald-300 font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
                      >
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </select>
                    ) : isMultiline ? (
                      <textarea
                        rows={isObjectOrArray ? 4 : 3}
                        value={draftVal}
                        onChange={(e) => onUpdateMetaField(k, e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-emerald-300 font-mono focus:outline-none focus:border-emerald-500 custom-scrollbar resize-y leading-relaxed"
                        placeholder={`Enter ${k}...`}
                      />
                    ) : (
                      <input
                        type={typeof v === 'number' ? 'number' : 'text'}
                        value={draftVal}
                        onChange={(e) => onUpdateMetaField(k, e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-emerald-300 font-mono focus:outline-none focus:border-emerald-500"
                        placeholder={`Enter ${k}...`}
                      />
                    )}
                    {error && (
                      <span className="text-[11px] text-red-400 font-mono flex items-center space-x-1">
                        <span>⚠ {error}</span>
                      </span>
                    )}
                    {isGitHubMetadataKey(k) && draftVal && (
                      <div className="pt-0.5">
                        <GitHubBadge
                          type={k.toLowerCase().includes('commit') || k.toLowerCase() === 'sha' ? 'commit' : 'pr'}
                          value={draftVal}
                          prUrl={modalPrUrl || undefined}
                          repo={modalRepo || undefined}
                          owner={modalOwner || undefined}
                          compact
                        />
                      </div>
                    )}
                  </div>

                  <button
                    type="button"
                    onClick={() => onRemoveMetaField(k)}
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
              onChange={(e) => onNewMetaKeyChange(e.target.value)}
              className="px-2.5 py-1 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500 w-36"
            />
            <input
              type="text"
              placeholder="Value (e.g. High)"
              value={newMetaVal}
              onChange={(e) => onNewMetaValChange(e.target.value)}
              className="px-2.5 py-1 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500 flex-1"
            />
            <button
              type="button"
              onClick={onAddMetaField}
              disabled={!newMetaKey.trim()}
              className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
            >
              Add
            </button>
          </div>
        )}
      </div>
    </>
  );
}
