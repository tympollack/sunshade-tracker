'use client';

import React, { useMemo } from 'react';
import { Eye, GitBranch, ListFilter, Sliders, Gauge } from 'lucide-react';
import {
  ProjectSettings,
  StatusDefinition,
  HierarchyLevel,
  WorkItem,
  WorkMetricConfig,
  getWorkMetricConfig,
} from '@/types/tracker';
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
  // Active work metric configuration
  const currentMetricConfig = useMemo(() => getWorkMetricConfig(settings), [settings]);

  // Derived options for work metric field dropdown
  const fieldOptions = useMemo(() => {
    const defaultPresets = [
      { key: 'story_points', label: 'Story Points', unit_label: 'pts' },
      { key: 'ai_credits', label: 'AI Credits', unit_label: 'credits' },
      { key: 'hours', label: 'Hours', unit_label: 'hrs' },
      { key: 'complexity', label: 'Complexity', unit_label: 'cmp' },
    ];

    const seenKeys = new Set(defaultPresets.map((p) => p.key));
    const result = [...defaultPresets];

    const nonNumericStandardFields = new Set([
      'priority',
      'tags',
      'status',
      'assignee',
      'title',
      'description',
      'sprint',
      'sprint_id',
      'assignees',
      'color',
      'item_type',
    ]);

    (settings.custom_metadata_fields || []).forEach((f) => {
      // Skip non-numeric fields if type is specified
      if (
        f.type &&
        !['number', 'integer', 'float', 'numeric'].includes(f.type.toLowerCase())
      ) {
        return;
      }
      if (nonNumericStandardFields.has(f.key.toLowerCase())) {
        return;
      }
      if (!seenKeys.has(f.key)) {
        seenKeys.add(f.key);
        result.push({
          key: f.key,
          label: f.label || f.key,
          unit_label: f.unit || 'pts',
        });
      }
    });

    (settings.custom_fields || []).forEach((key) => {
      if (nonNumericStandardFields.has(key.toLowerCase())) {
        return;
      }
      if (!seenKeys.has(key)) {
        seenKeys.add(key);
        result.push({
          key,
          label: key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
          unit_label: 'pts',
        });
      }
    });

    if (currentMetricConfig.field_key && !seenKeys.has(currentMetricConfig.field_key)) {
      result.push({
        key: currentMetricConfig.field_key,
        label: currentMetricConfig.label || currentMetricConfig.field_key,
        unit_label: currentMetricConfig.unit_label || 'pts',
      });
    }

    return result;
  }, [
    settings.custom_metadata_fields,
    settings.custom_fields,
    currentMetricConfig.field_key,
    currentMetricConfig.label,
    currentMetricConfig.unit_label,
  ]);

  const handleMetricFieldChange = (newKey: string) => {
    if (readOnly) return;
    const matched = fieldOptions.find((o) => o.key === newKey);
    const newConfig: WorkMetricConfig = {
      field_key: newKey,
      label: matched?.label || newKey,
      unit_label: matched?.unit_label || 'pts',
    };
    onChange({
      ...settings,
      work_metric_config: newConfig,
      work_unit_field: newKey,
    });
  };

  const handleMetricLabelChange = (newLabel: string) => {
    if (readOnly) return;
    onChange({
      ...settings,
      work_metric_config: {
        ...currentMetricConfig,
        label: newLabel,
      },
      work_unit_field: currentMetricConfig.field_key,
    });
  };

  const handleMetricUnitChange = (newUnit: string) => {
    if (readOnly) return;
    onChange({
      ...settings,
      work_metric_config: {
        ...currentMetricConfig,
        unit_label: newUnit,
      },
      work_unit_field: currentMetricConfig.field_key,
    });
  };

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
        metrics={
          settings.sprint_metrics ||
          settings.metric_rules ||
          settings.sprint_settings?.metric_rules ||
          settings.sprint_settings?.metrics
        }
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
          {/* Work Estimation Metric Unit */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3">
            <div className="flex items-center justify-between border-b border-slate-900 pb-2">
              <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-slate-400" />
                <span>Work Metric & Estimation Unit</span>
              </h4>
              <span className="text-[10px] text-slate-500 font-mono">work_metric_config</span>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label htmlFor="work-metric-field-select" className="text-[11px] font-medium text-slate-400">
                  Metric Field Key
                </label>
                <select
                  id="work-metric-field-select"
                  aria-label="Work estimation metric field"
                  disabled={readOnly}
                  value={currentMetricConfig.field_key}
                  onChange={(e) => handleMetricFieldChange(e.target.value)}
                  className="w-full px-3 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-emerald-300 text-xs font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                >
                  {fieldOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label} ({opt.key})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label htmlFor="work-metric-label-input" className="text-[11px] font-medium text-slate-400">
                    Display Label
                  </label>
                  <input
                    id="work-metric-label-input"
                    type="text"
                    aria-label="Work metric display label"
                    value={currentMetricConfig.label || ''}
                    disabled={readOnly}
                    onChange={(e) => handleMetricLabelChange(e.target.value)}
                    placeholder="e.g. Story Points"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor="work-metric-unit-input" className="text-[11px] font-medium text-slate-400">
                    Unit Symbol / Suffix
                  </label>
                  <input
                    id="work-metric-unit-input"
                    type="text"
                    aria-label="Work metric unit suffix"
                    value={currentMetricConfig.unit_label || ''}
                    disabled={readOnly}
                    onChange={(e) => handleMetricUnitChange(e.target.value)}
                    placeholder="e.g. pts"
                    className="w-full px-2.5 py-1.5 bg-slate-900 border border-slate-700 rounded-lg text-slate-200 text-xs font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 text-[10px] text-slate-500">
                <span>Drives rollups, burn rates &amp; capacity.</span>
                <span className="font-mono text-emerald-400 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/40">
                  Preview: 5 {currentMetricConfig.unit_label || 'pts'}
                </span>
              </div>
            </div>
          </div>

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
