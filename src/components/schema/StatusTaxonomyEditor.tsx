'use client';

import React, { useMemo } from 'react';
import { Activity, Gauge, Layers, Sliders } from 'lucide-react';
import {
  LifecycleStage,
  ProjectSettings,
  StatusDefinition,
  WorkMetricConfig,
  getWorkMetricConfig,
  normalizeCustomField,
} from '@/types/tracker';

export interface StatusTaxonomyEditorProps {
  settings: ProjectSettings;
  onChange: (updatedSettings: ProjectSettings) => void;
  readOnly?: boolean;
}

export const LIFECYCLE_CATEGORY_OPTIONS: Array<{
  value: LifecycleStage;
  label: string;
  badgeColor: string;
}> = [
  {
    value: 'unstarted',
    label: 'Backlog',
    badgeColor: 'text-slate-300 bg-slate-900 border-slate-700',
  },
  {
    value: 'execution',
    label: 'Execution',
    badgeColor: 'text-sky-300 bg-sky-950/50 border-sky-700/60',
  },
  {
    value: 'verification',
    label: 'Verification',
    badgeColor: 'text-amber-300 bg-amber-950/50 border-amber-700/60',
  },
  {
    value: 'staging',
    label: 'Staging',
    badgeColor: 'text-purple-300 bg-purple-950/50 border-purple-700/60',
  },
  {
    value: 'terminal',
    label: 'Terminal',
    badgeColor: 'text-emerald-300 bg-emerald-950/50 border-emerald-700/60',
  },
];

/**
 * Infers default fallback lifecycle category for a status definition when
 * `status.lifecycle_category` is not explicitly configured.
 */
export function inferFallbackLifecycleCategory(
  status: StatusDefinition,
  settings?: ProjectSettings | null
): LifecycleStage {
  if (status.lifecycle_category) {
    return status.lifecycle_category;
  }
  if (status.is_completed) {
    return 'terminal';
  }
  const idLower = String(status.id || '').toLowerCase().trim();
  const completedList = (
    settings?.completed_statuses ||
    settings?.sprint_metrics?.completed_statuses ||
    []
  ).map((s) => String(s).toLowerCase().trim());
  if (completedList.includes(idLower)) {
    return 'terminal';
  }

  const unstartedList = (
    settings?.unstarted_statuses ||
    settings?.sprint_metrics?.unstarted_statuses ||
    []
  ).map((s) => String(s).toLowerCase().trim());
  if (unstartedList.includes(idLower)) {
    return 'unstarted';
  }

  const inProgressList = (
    settings?.in_progress_statuses ||
    settings?.sprint_metrics?.in_progress_statuses ||
    []
  ).map((s) => String(s).toLowerCase().trim());
  if (inProgressList.includes(idLower)) {
    return 'execution';
  }

  return 'unstarted';
}

export function StatusTaxonomyEditor({
  settings,
  onChange,
  readOnly = false,
}: StatusTaxonomyEditorProps) {
  const currentWipLimit =
    typeof settings.wip_limit === 'number' && !isNaN(settings.wip_limit) && settings.wip_limit >= 1
      ? settings.wip_limit
      : 8;

  const currentMetricConfig = useMemo(() => getWorkMetricConfig(settings), [settings]);
  const currentWorkUnitField = settings.work_unit_field || currentMetricConfig.field_key || 'story_points';

  const workUnitOptions = useMemo(() => {
    const defaultOptions = [
      { key: 'story_points', label: 'Story Points (story_points)', unit_label: 'pts' },
      { key: 'target_words', label: 'Target Words (target_words)', unit_label: 'words' },
      { key: 'estimated_hours', label: 'Estimated Hours (estimated_hours)', unit_label: 'hrs' },
      { key: 'item_count', label: 'Item Count (item_count)', unit_label: 'items' },
    ];

    const seenKeys = new Set(defaultOptions.map((o) => o.key));
    const result = [...defaultOptions];

    const nonUnitStandardFields = new Set([
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
      'commit_hash',
      'source_type',
      'timeline',
    ]);

    (settings.custom_metadata_fields || []).forEach((f) => {
      if (!f || !f.key) return;
      if (nonUnitStandardFields.has(f.key.toLowerCase())) return;
      if (!seenKeys.has(f.key)) {
        seenKeys.add(f.key);
        result.push({
          key: f.key,
          label: `${f.label || f.key} (${f.key})`,
          unit_label: f.unit || 'units',
        });
      }
    });

    (settings.custom_fields || []).forEach((fieldItem) => {
      const def = normalizeCustomField(fieldItem);
      if (!def.key || nonUnitStandardFields.has(def.key.toLowerCase())) return;
      if (!seenKeys.has(def.key)) {
        seenKeys.add(def.key);
        result.push({
          key: def.key,
          label: `${def.label || def.key} (${def.key})`,
          unit_label: def.unit || 'units',
        });
      }
    });

    if (currentWorkUnitField && !seenKeys.has(currentWorkUnitField)) {
      result.push({
        key: currentWorkUnitField,
        label: `${currentWorkUnitField} (${currentWorkUnitField})`,
        unit_label: currentMetricConfig.unit_label || 'units',
      });
    }

    return result;
  }, [
    settings.custom_fields,
    settings.custom_metadata_fields,
    currentWorkUnitField,
    currentMetricConfig.unit_label,
  ]);

  const handleStatusNameChange = (idx: number, newLabel: string) => {
    if (readOnly) return;
    const newStatuses = [...(settings.statuses || [])];
    newStatuses[idx] = { ...newStatuses[idx], label: newLabel };
    onChange({ ...settings, statuses: newStatuses });
  };

  const handleStatusColorChange = (idx: number, newColor: string) => {
    if (readOnly) return;
    const newStatuses = [...(settings.statuses || [])];
    newStatuses[idx] = { ...newStatuses[idx], color: newColor };
    onChange({ ...settings, statuses: newStatuses });
  };

  const handleStatusLifecycleChange = (idx: number, category: LifecycleStage) => {
    if (readOnly) return;
    const newStatuses = [...(settings.statuses || [])];
    newStatuses[idx] = {
      ...newStatuses[idx],
      lifecycle_category: category,
      is_completed: category === 'terminal' ? true : newStatuses[idx].is_completed,
    };
    onChange({ ...settings, statuses: newStatuses });
  };

  const handleWipLimitChange = (newLimit: number) => {
    if (readOnly) return;
    const clamped = Math.max(1, Math.min(200, Math.floor(newLimit || 1)));
    onChange({
      ...settings,
      wip_limit: clamped,
    });
  };

  const handleWorkUnitFieldChange = (newFieldKey: string) => {
    if (readOnly) return;
    const matched = workUnitOptions.find((o) => o.key === newFieldKey);
    const cleanLabel = matched?.label.replace(/\s*\([^)]*\)$/, '') || newFieldKey;
    const newMetricConfig: WorkMetricConfig = {
      field_key: newFieldKey,
      label: cleanLabel,
      unit_label: matched?.unit_label || currentMetricConfig.unit_label || 'pts',
    };
    onChange({
      ...settings,
      work_unit_field: newFieldKey,
      work_metric_config: newMetricConfig,
    });
  };

  return (
    <div
      data-testid="status-taxonomy-editor"
      className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-5 shadow-sm"
    >
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-900 pb-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-sky-500/10 border border-sky-500/20 text-sky-400">
            <Activity className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
              In-Flight Lifecycle Category &amp; Concurrency Configurator
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-sky-400 border border-sky-900/40">
                statuses[].lifecycle_category &bull; wip_limit
              </span>
            </h4>
            <p className="text-xs text-slate-400">
              Map project statuses to canonical lifecycle stages (Execution, Verification, Staging, Terminal, Backlog) and configure blameless WIP concurrency caps.
            </p>
          </div>
        </div>
      </div>

      {/* Concurrency Cap & Work Unit Field Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Concurrency Limit Stepper */}
        <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="wip-concurrency-cap-input"
              className="text-xs font-semibold text-slate-200 flex items-center gap-1.5"
            >
              <Gauge className="w-3.5 h-3.5 text-sky-400" />
              <span>WIP Concurrency Cap</span>
            </label>
            <span className="text-[10px] font-mono text-slate-500">settings.wip_limit</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Maximum active in-flight items before systemic queuing risk alerts trigger on the live flight deck.
          </p>
          <div className="flex items-center space-x-2 pt-1">
            <button
              type="button"
              disabled={readOnly || currentWipLimit <= 1}
              aria-label="Decrease WIP concurrency cap"
              onClick={() => handleWipLimitChange(currentWipLimit - 1)}
              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-mono disabled:opacity-40 transition-colors"
            >
              -
            </button>
            <input
              id="wip-concurrency-cap-input"
              data-testid="wip-concurrency-cap-input"
              type="number"
              min={1}
              max={200}
              disabled={readOnly}
              value={currentWipLimit}
              onChange={(e) => handleWipLimitChange(parseInt(e.target.value, 10) || 8)}
              className="w-20 text-center px-2.5 py-1 bg-slate-950 border border-slate-700 rounded-lg text-sky-300 text-xs font-mono focus:outline-none focus:border-sky-500 disabled:opacity-50"
            />
            <button
              type="button"
              disabled={readOnly}
              aria-label="Increase WIP concurrency cap"
              onClick={() => handleWipLimitChange(currentWipLimit + 1)}
              className="px-2.5 py-1 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-200 text-xs font-mono disabled:opacity-40 transition-colors"
            >
              +
            </button>
            <span className="text-xs text-slate-400 font-mono">active units</span>
          </div>
        </div>

        {/* Work Unit Selector */}
        <div className="p-3.5 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="live-work-unit-field-select"
              className="text-xs font-semibold text-slate-200 flex items-center gap-1.5"
            >
              <Sliders className="w-3.5 h-3.5 text-emerald-400" />
              <span>Work Unit Field</span>
            </label>
            <span className="text-[10px] font-mono text-slate-500">settings.work_unit_field</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Field introspected from work item metadata to aggregate flow load across stages.
          </p>
          <div className="pt-1">
            <select
              id="live-work-unit-field-select"
              data-testid="live-work-unit-field-select"
              aria-label="Work Unit Field"
              disabled={readOnly}
              value={currentWorkUnitField}
              onChange={(e) => handleWorkUnitFieldChange(e.target.value)}
              className="w-full px-3 py-1.5 bg-slate-950 border border-slate-700 rounded-lg text-emerald-300 text-xs font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            >
              {workUnitOptions.map((opt) => (
                <option key={opt.key} value={opt.key}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Status Row Configuration Table */}
      <div className="space-y-2.5 pt-2 border-t border-slate-900">
        <div className="flex items-center justify-between">
          <h5 className="text-xs font-bold uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>Status Lifecycle Stage Mapping</span>
          </h5>
          <span className="text-[11px] text-slate-500 font-mono">
            {(settings.statuses || []).length} configured statuses
          </span>
        </div>

        <div className="space-y-2">
          {(settings.statuses || []).map((status: StatusDefinition, idx: number) => {
            const effectiveCategory = inferFallbackLifecycleCategory(status, settings);
            const isExplicit = Boolean(status.lifecycle_category);

            return (
              <div
                key={status.id}
                data-testid={`status-lifecycle-row-${status.id}`}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 py-2 px-3 rounded-lg bg-slate-900/40 border border-slate-800/80 hover:border-slate-700/80 transition-colors"
              >
                <div className="flex items-center space-x-2.5 min-w-0 flex-1">
                  <label
                    className={`relative inline-flex items-center justify-center shrink-0 group ${
                      readOnly ? 'cursor-default' : 'cursor-pointer'
                    }`}
                  >
                    <input
                      type="color"
                      aria-label={`Color for status ${status.label}`}
                      value={status.color || '#94a3b8'}
                      disabled={readOnly}
                      onChange={(e) => handleStatusColorChange(idx, e.target.value)}
                      className={`opacity-0 absolute inset-0 w-full h-full ${
                        readOnly ? 'cursor-default' : 'cursor-pointer'
                      }`}
                    />
                    <span
                      className="w-4 h-4 rounded-full border border-white/20 shadow-sm transition-transform group-hover:scale-110"
                      style={{ backgroundColor: status.color || '#94a3b8' }}
                    />
                  </label>

                  <input
                    type="text"
                    aria-label={`Label for status ${status.id}`}
                    value={status.label}
                    disabled={readOnly}
                    onChange={(e) => handleStatusNameChange(idx, e.target.value)}
                    className="bg-slate-950/70 border border-slate-800 rounded px-2 py-1 text-xs text-slate-200 font-medium focus:outline-none focus:border-sky-500 disabled:opacity-60 min-w-[120px]"
                  />

                  <span className="text-[11px] font-mono text-slate-500 truncate">
                    ({status.id})
                  </span>
                </div>

                <div className="flex items-center space-x-2 shrink-0">
                  {!isExplicit && (
                    <span className="text-[10px] font-mono text-slate-500">
                      default
                    </span>
                  )}
                  <label className="sr-only" htmlFor={`lifecycle-select-${status.id}`}>
                    Lifecycle Category for {status.label}
                  </label>
                  <select
                    id={`lifecycle-select-${status.id}`}
                    data-testid={`lifecycle-select-${status.id}`}
                    aria-label={`Lifecycle Category for ${status.label}`}
                    disabled={readOnly}
                    value={effectiveCategory}
                    onChange={(e) =>
                      handleStatusLifecycleChange(idx, e.target.value as LifecycleStage)
                    }
                    className="px-2.5 py-1 rounded-lg bg-slate-950 border border-slate-700 text-xs font-mono text-slate-200 focus:outline-none focus:border-sky-500 disabled:opacity-50"
                  >
                    {LIFECYCLE_CATEGORY_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label} ({opt.value})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
