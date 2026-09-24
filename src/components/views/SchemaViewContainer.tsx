'use client';

import React from 'react';
import { Eye, AlertTriangle, Archive } from 'lucide-react';
import { ProjectSettings, StatusDefinition } from '@/types/tracker';
import { JsonSchemaEditor } from '@/components/JsonSchemaEditor';
import { getDefaultLevelHex } from '@/lib/hierarchy-colors';

export interface SchemaViewContainerProps {
  isReadOnly: boolean;
  isAllProjects: boolean;
  allProjects: { id: string; slug: string; name: string }[];
  selectedSchemaProjectSlug: string | null;
  setSelectedSchemaProjectSlug: (slug: string) => void;
  activeSchemaSettings: ProjectSettings;
  handleSaveSchema: (newSettings: ProjectSettings) => Promise<void>;
  isSavingSchema: boolean;
  setIsArchiveModalOpen: (open: boolean) => void;
}

export function SchemaViewContainer(props: SchemaViewContainerProps) {
  const {
    isReadOnly,
    isAllProjects,
    allProjects,
    selectedSchemaProjectSlug,
    setSelectedSchemaProjectSlug,
    activeSchemaSettings,
    handleSaveSchema,
    isSavingSchema,
    setIsArchiveModalOpen,
  } = props;

  return (
    <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white">Dynamic JSON Schema Settings</h3>
        <p className="text-xs text-slate-400">
          Stored in <code className="text-emerald-300">tracker.projects.settings</code>. Defines
          hierarchy levels, allowed parent relations, column statuses, and custom metadata fields.
        </p>
      </div>

      {isReadOnly && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 flex items-center space-x-2">
          <Eye className="w-4 h-4 text-amber-400 shrink-0" />
          <span>You are viewing this project schema in read-only mode. Workspace schema modifications require member or owner privileges.</span>
        </div>
      )}

      {isAllProjects && allProjects.length > 0 && (
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold text-white">Configuring Schema for Project:</span>
            <p className="text-[11px] text-slate-400">
              In workspace overview, select which project schema to inspect or modify.
            </p>
          </div>
          <select
            value={selectedSchemaProjectSlug || allProjects[0]?.slug}
            onChange={(e) => setSelectedSchemaProjectSlug(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-emerald-300 font-medium focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            {allProjects.map((p) => (
              <option key={p.id} value={p.slug}>
                {p.name} ({p.slug})
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider">
              Hierarchy Levels
            </h4>
            <span className="text-[10px] text-slate-500">{isReadOnly ? 'Read-only' : 'Click swatch to pick'}</span>
          </div>
          <div className="space-y-1 text-xs">
            {activeSchemaSettings.hierarchy.map((h, idx) => {
              const currentHex = h.color || getDefaultLevelHex(h.level);
              return (
                <div
                  key={h.type}
                  className="flex items-center justify-between py-1 border-b border-slate-900 last:border-0"
                >
                  <div className="flex items-center space-x-2">
                    <label className={`relative inline-flex items-center justify-center group ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}>
                      <input
                        type="color"
                        value={currentHex}
                        disabled={isReadOnly}
                        onChange={(e) => {
                          if (isReadOnly) return;
                          const newHierarchy = [...activeSchemaSettings.hierarchy];
                          newHierarchy[idx] = { ...newHierarchy[idx], color: e.target.value };
                          const newSettings = { ...activeSchemaSettings, hierarchy: newHierarchy };
                          handleSaveSchema(newSettings);
                        }}
                        className={`opacity-0 absolute inset-0 w-full h-full ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
                      />
                      <span
                        className="w-3.5 h-3.5 rounded border border-white/20 shadow-sm transition-transform group-hover:scale-110"
                        style={{ backgroundColor: currentHex }}
                        title={`Change color for ${h.label} (${currentHex})`}
                      />
                    </label>
                    <span className="font-medium text-slate-200">{h.label}</span>
                    <span className="text-[10px] font-mono text-slate-500">(lvl {h.level})</span>
                  </div>
                  <div className="flex items-center space-x-2">
                    <span className="text-[11px] font-mono text-slate-400">{currentHex}</span>
                    <span className="text-[10px] font-mono text-emerald-400/90 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/40">
                      [{h.allowed_parents.join(', ') || 'root'}]
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider">
              Project Statuses
            </h4>
            <span className="text-[10px] text-slate-500">{isReadOnly ? 'Read-only' : 'Click swatch to pick'}</span>
          </div>
          <div className="space-y-1 text-xs">
            {activeSchemaSettings.statuses.map((s: StatusDefinition, idx: number) => (
              <div
                key={s.id}
                className="flex items-center justify-between py-1 border-b border-slate-900 last:border-0"
              >
                <div className="flex items-center space-x-2">
                  <label className={`relative inline-flex items-center justify-center group ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}>
                    <input
                      type="color"
                      value={s.color}
                      disabled={isReadOnly}
                      onChange={(e) => {
                        if (isReadOnly) return;
                        const newStatuses = [...activeSchemaSettings.statuses];
                        newStatuses[idx] = { ...newStatuses[idx], color: e.target.value };
                        const newSettings = { ...activeSchemaSettings, statuses: newStatuses };
                        handleSaveSchema(newSettings);
                      }}
                      className={`opacity-0 absolute inset-0 w-full h-full ${isReadOnly ? 'cursor-default' : 'cursor-pointer'}`}
                    />
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm transition-transform group-hover:scale-110"
                      style={{ backgroundColor: s.color }}
                      title={`Change color for ${s.label} (${s.color})`}
                    />
                  </label>
                  <span className="text-slate-300">{s.label}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-mono text-slate-400">{s.color}</span>
                  <span className="font-mono text-slate-500">{s.id}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
          <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider">
            Custom Fields
          </h4>
          <div className="flex flex-wrap gap-1">
            {(activeSchemaSettings.custom_fields || []).map((f: string) => (
              <span
                key={f}
                className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300"
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider">
              JSON Schema Definition &amp; Editor
            </h4>
            <p className="text-[11px] text-slate-500">
              Collapse/expand JSON tree branches, click any color swatch next to hex values to open a color picker, or switch to raw JSON to edit directly.
            </p>
          </div>
        </div>
        <JsonSchemaEditor
          settings={activeSchemaSettings}
          onSave={handleSaveSchema}
          isSaving={isSavingSchema}
          readOnly={isReadOnly}
        />
      </div>

      {/* Danger Zone: Archive Project */}
      {!isAllProjects && !isReadOnly && (
        <div className="p-5 rounded-xl bg-red-950/20 border border-red-900/40 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-red-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span>Danger Zone: Archive Project</span>
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                Archiving this project removes it from active project switchers, overview boards, and searches. All work items in this project are safely soft-deleted and preserved. You can restore this project at any time from Workspace Settings.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsArchiveModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 hover:text-red-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors self-start sm:self-center shrink-0"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archive Project…</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
