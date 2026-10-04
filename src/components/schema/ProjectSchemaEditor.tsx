'use client';

import React from 'react';
import { Eye, GitBranch, ListFilter, Sliders } from 'lucide-react';
import { ProjectSettings, StatusDefinition, HierarchyLevel, WorkItem } from '@/types/tracker';
import { getDefaultLevelHex } from '@/lib/hierarchy-colors';
import { SprintGovernanceForm } from './SprintGovernanceForm';
import { TaxonomyConfigEditor } from './TaxonomyConfigEditor';

export interface ProjectSchemaEditorProps {
  settings: ProjectSettings;
  onChange: (updatedSettings: ProjectSettings) => void;
  activeItems?: WorkItem[];
  readOnly?: boolean;
}

export function ProjectSchemaEditor({
  settings,
  onChange,
  activeItems = [],
  readOnly = false,
}: ProjectSchemaEditorProps) {
  // Update a hierarchy level's color
  const handleHierarchyColorChange = (idx: number, newColor: string) => {
    if (readOnly) return;
    const newHierarchy = [...settings.hierarchy];
    newHierarchy[idx] = { ...newHierarchy[idx], color: newColor };
    onChange({ ...settings, hierarchy: newHierarchy });
  };

  // Update a status color
  const handleStatusColorChange = (idx: number, newColor: string) => {
    if (readOnly) return;
    const newStatuses = [...settings.statuses];
    newStatuses[idx] = { ...newStatuses[idx], color: newColor };
    onChange({ ...settings, statuses: newStatuses });
  };

  // Update GitHub repo
  const handleGithubRepoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) return;
    onChange({ ...settings, github_repo: e.target.value });
  };

  return (
    <div className="space-y-6">
      {readOnly && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 flex items-center space-x-2">
          <Eye className="w-4 h-4 text-amber-400 shrink-0" />
          <span>You are viewing this project schema in read-only mode. Workspace schema modifications require member or owner privileges.</span>
        </div>
      )}

      {/* 1. Sprint Metric Rules (Governance) Interactive Card */}
      <SprintGovernanceForm
        metrics={settings.sprint_metrics}
        onChange={(updatedMetrics) => {
          onChange({
            ...settings,
            sprint_metrics: updatedMetrics,
          });
        }}
        readOnly={readOnly}
      />

      {/* 2. Taxonomy & Status Lifecycle Bucket Editors */}
      <TaxonomyConfigEditor
        settings={settings}
        onChange={onChange}
        activeItems={activeItems}
        readOnly={readOnly}
      />

      {/* 3. Hierarchy Levels & Statuses Visual Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {/* Hierarchy Levels */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-900 pb-2">
            <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5 text-slate-400" />
              <span>Hierarchy Levels</span>
            </h4>
            <span className="text-[10px] text-slate-500 font-mono">
              {readOnly ? 'Read-only' : 'Click swatch to pick'}
            </span>
          </div>

          <div className="space-y-1.5 text-xs">
            {(settings.hierarchy || []).map((h: HierarchyLevel, idx: number) => {
              const currentHex = h.color || getDefaultLevelHex(h.level);
              return (
                <div
                  key={h.type}
                  className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-slate-900/40 border border-slate-900"
                >
                  <div className="flex items-center space-x-2.5">
                    <label
                      className={`relative inline-flex items-center justify-center group ${
                        readOnly ? 'cursor-default' : 'cursor-pointer'
                      }`}
                    >
                      <input
                        type="color"
                        value={currentHex}
                        disabled={readOnly}
                        onChange={(e) => handleHierarchyColorChange(idx, e.target.value)}
                        className={`opacity-0 absolute inset-0 w-full h-full ${
                          readOnly ? 'cursor-default' : 'cursor-pointer'
                        }`}
                      />
                      <span
                        className="w-4 h-4 rounded border border-white/20 shadow-sm transition-transform group-hover:scale-110"
                        style={{ backgroundColor: currentHex }}
                        title={`Change color for ${h.label} (${currentHex})`}
                      />
                    </label>
                    <span className="font-semibold text-slate-200">{h.label}</span>
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

        {/* Project Status Columns */}
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between border-b border-slate-900 pb-2">
            <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
              <ListFilter className="w-3.5 h-3.5 text-slate-400" />
              <span>Project Statuses</span>
            </h4>
            <span className="text-[10px] text-slate-500 font-mono">
              {readOnly ? 'Read-only' : 'Click swatch to pick'}
            </span>
          </div>

          <div className="space-y-1.5 text-xs max-h-[260px] overflow-y-auto">
            {(settings.statuses || []).map((s: StatusDefinition, idx: number) => (
              <div
                key={s.id}
                className="flex items-center justify-between py-1.5 px-2 rounded-lg bg-slate-900/40 border border-slate-900"
              >
                <div className="flex items-center space-x-2.5">
                  <label
                    className={`relative inline-flex items-center justify-center group ${
                      readOnly ? 'cursor-default' : 'cursor-pointer'
                    }`}
                  >
                    <input
                      type="color"
                      value={s.color}
                      disabled={readOnly}
                      onChange={(e) => handleStatusColorChange(idx, e.target.value)}
                      className={`opacity-0 absolute inset-0 w-full h-full ${
                        readOnly ? 'cursor-default' : 'cursor-pointer'
                      }`}
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-white/20 shadow-sm transition-transform group-hover:scale-110"
                      style={{ backgroundColor: s.color }}
                      title={`Change color for ${s.label} (${s.color})`}
                    />
                  </label>
                  <span className="text-slate-200 font-medium">{s.label}</span>
                </div>
                <div className="flex items-center space-x-2">
                  <span className="text-[11px] font-mono text-slate-400">{s.color}</span>
                  <span className="font-mono text-slate-500 text-[11px]">{s.id}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Custom Fields & GitHub Repo */}
        <div className="space-y-5">
          {/* Custom Fields */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
            <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider">
              Custom Fields
            </h4>
            <div className="flex flex-wrap gap-1.5">
              {(settings.custom_fields || []).map((f: string) => (
                <span
                  key={f}
                  className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300"
                >
                  {f}
                </span>
              ))}
              {(!settings.custom_fields || settings.custom_fields.length === 0) && (
                <span className="text-xs text-slate-500 italic">None defined</span>
              )}
            </div>
          </div>

          {/* GitHub Repository */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
                <GitBranch className="w-3.5 h-3.5 text-slate-400" />
                <span>GitHub Repository</span>
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">github_repo</span>
            </div>
            <div className="space-y-1">
              <input
                type="text"
                value={settings.github_repo || ''}
                disabled={readOnly}
                onChange={handleGithubRepoChange}
                placeholder="e.g. tympollack/sunshade-tracker"
                className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-emerald-300 text-xs font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50"
              />
              <p className="text-[10px] text-slate-500">
                Default repository for commits and PR mentions when not specified on work items.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
