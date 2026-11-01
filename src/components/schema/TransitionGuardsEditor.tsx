'use client';

import React, { useState, useMemo } from 'react';
import {
  ShieldAlert,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
  CheckCircle2,
  Sliders,
  Layers,
  HelpCircle,
} from 'lucide-react';
import type {
  ProjectSettings,
  TransitionGuard,
  TransitionGuardCondition,
  StatusDefinition,
} from '@/types/tracker';
import { TokenCatalogPopover } from './TokenCatalogPopover';

export const GUARD_OPERATORS = [
  { value: '$is_not_null', label: 'Must not be empty', code: '$is_not_null', requiresValue: false },
  { value: '$is_null', label: 'Must be empty', code: '$is_null', requiresValue: false },
  { value: '$eq', label: 'Must equal', code: '$eq', requiresValue: true },
  { value: '$ne', label: 'Must not equal', code: '$ne', requiresValue: true },
  { value: '$in', label: 'Must be in list', code: '$in', requiresValue: true, placeholder: 'val1, val2' },
  { value: '$regex', label: 'Must match pattern', code: '$regex', requiresValue: true, placeholder: 'Regex pattern (e.g. ^https://)' },
  { value: '$gt', label: 'Greater than', code: '$gt', requiresValue: true },
  { value: '$lt', label: 'Less than', code: '$lt', requiresValue: true },
];

export interface TransitionGuardsEditorProps {
  settings: ProjectSettings;
  onChange: (updatedSettings: ProjectSettings) => void;
  readOnly?: boolean;
}

export function TransitionGuardsEditor({
  settings,
  onChange,
  readOnly = false,
}: TransitionGuardsEditorProps) {
  const guards = useMemo<TransitionGuard[]>(() => {
    return Array.isArray(settings.transition_guards) ? settings.transition_guards : [];
  }, [settings.transition_guards]);

  const [expandedGuardIds, setExpandedGuardIds] = useState<Record<string, boolean>>(() => {
    // Expand the first guard by default
    const initial: Record<string, boolean> = {};
    if (guards.length > 0 && guards[0].id) {
      initial[guards[0].id] = true;
    }
    return initial;
  });

  const availableStatuses = useMemo<StatusDefinition[]>(() => {
    return Array.isArray(settings.statuses) ? settings.statuses : [];
  }, [settings.statuses]);

  // Derived available field options
  const fieldOptions = useMemo(() => {
    const standard = [
      { value: 'status', label: 'Status (status)' },
      { value: 'assignee', label: 'Assignee (assignee)' },
      { value: 'title', label: 'Title (title)' },
      { value: 'item_type', label: 'Item Type (item_type)' },
      { value: 'external_ref_id', label: 'External Ref ID (external_ref_id)' },
      { value: 'description', label: 'Description (description)' },
    ];

    const customMeta: Array<{ value: string; label: string }> = [];
    const seen = new Set<string>();

    (settings.custom_fields || []).forEach((cf) => {
      const key = typeof cf === 'string' ? cf : cf?.key;
      if (key && !seen.has(key)) {
        seen.add(key);
        customMeta.push({
          value: `metadata.${key}`,
          label: `metadata.${key} (${typeof cf === 'object' && cf.label ? cf.label : key})`,
        });
      }
    });

    (settings.custom_metadata_fields || []).forEach((cf: any) => {
      const key = typeof cf === 'string' ? cf : cf?.key;
      if (key && !seen.has(key)) {
        seen.add(key);
        customMeta.push({
          value: `metadata.${key}`,
          label: `metadata.${key} (${cf?.label || key})`,
        });
      }
    });

    return { standard, customMeta };
  }, [settings.custom_fields, settings.custom_metadata_fields]);

  const toggleExpand = (id: string) => {
    setExpandedGuardIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleUpdateGuards = (updated: TransitionGuard[]) => {
    if (readOnly) return;
    onChange({
      ...settings,
      transition_guards: updated,
    });
  };

  const handleAddGuard = () => {
    if (readOnly) return;
    const defaultStatus = availableStatuses.find((s) => s.id === 'in_review')?.id || availableStatuses[0]?.id || 'in_review';
    const newGuardId = `guard-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const newGuard: TransitionGuard = {
      id: newGuardId,
      name: 'Require Review Criteria',
      enabled: true,
      target_status: defaultStatus,
      conditions: [
        {
          field: 'metadata.pr_url',
          operator: '$is_not_null',
          message: 'Pull Request URL is required before moving to this status.',
        },
      ],
    };

    const nextGuards = [...guards, newGuard];
    handleUpdateGuards(nextGuards);
    setExpandedGuardIds((prev) => ({ ...prev, [newGuardId]: true }));
  };

  const handleDeleteGuard = (guardId: string) => {
    if (readOnly) return;
    handleUpdateGuards(guards.filter((g) => g.id !== guardId));
  };

  const handleToggleEnabled = (guardId: string, currentEnabled?: boolean) => {
    if (readOnly) return;
    const nextGuards = guards.map((g) =>
      g.id === guardId ? { ...g, enabled: currentEnabled === false } : g
    );
    handleUpdateGuards(nextGuards);
  };

  const handleGuardChange = (guardId: string, updates: Partial<TransitionGuard>) => {
    if (readOnly) return;
    const nextGuards = guards.map((g) => (g.id === guardId ? { ...g, ...updates } : g));
    handleUpdateGuards(nextGuards);
  };

  const handleAddCondition = (guardId: string) => {
    if (readOnly) return;
    const defaultField = fieldOptions.customMeta[0]?.value || 'metadata.pr_url';
    const nextGuards = guards.map((g) => {
      if (g.id !== guardId) return g;
      const newCond: TransitionGuardCondition = {
        field: defaultField,
        operator: '$is_not_null',
        message: 'Field requirement not met.',
      };
      return {
        ...g,
        conditions: [...(g.conditions || []), newCond],
      };
    });
    handleUpdateGuards(nextGuards);
  };

  const handleUpdateCondition = (
    guardId: string,
    condIndex: number,
    updates: Partial<TransitionGuardCondition>
  ) => {
    if (readOnly) return;
    const nextGuards = guards.map((g) => {
      if (g.id !== guardId) return g;
      const conditions = [...(g.conditions || [])];
      conditions[condIndex] = {
        ...conditions[condIndex],
        ...updates,
      };
      return { ...g, conditions };
    });
    handleUpdateGuards(nextGuards);
  };

  const handleDeleteCondition = (guardId: string, condIndex: number) => {
    if (readOnly) return;
    const nextGuards = guards.map((g) => {
      if (g.id !== guardId) return g;
      const conditions = (g.conditions || []).filter((_, idx) => idx !== condIndex);
      return { ...g, conditions };
    });
    handleUpdateGuards(nextGuards);
  };

  return (
    <div
      data-testid="transition-guards-editor-section"
      className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 shadow-sm"
    >
      {/* Section Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-900 pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <ShieldAlert className="w-4 h-4 text-emerald-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
              Transition Guardrails
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
              {guards.length} {guards.length === 1 ? 'guard' : 'guards'} configured
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Enforce required fields, approval metadata, and preconditions before work items transition to specific workflow statuses.
          </p>
        </div>

        {!readOnly && (
          <button
            type="button"
            onClick={handleAddGuard}
            data-testid="add-transition-guard-button"
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/30 text-emerald-400 text-xs font-semibold transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Transition Guard</span>
          </button>
        )}
      </div>

      {/* Guard List / Empty State */}
      {guards.length === 0 ? (
        <div
          data-testid="transition-guards-empty-state"
          className="p-6 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-center space-y-3"
        >
          <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <ShieldAlert className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-300">No Transition Guards Configured</h4>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto mt-0.5">
              Work items can transition freely between columns without required metadata validation.
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={handleAddGuard}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Create First Guard</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {guards.map((guard, guardIdx) => {
            const isExpanded = expandedGuardIds[guard.id] ?? true;
            const targetStatusDef = availableStatuses.find((s) => s.id === guard.target_status);
            const isEnabled = guard.enabled !== false;

            return (
              <div
                key={guard.id || guardIdx}
                data-testid={`transition-guard-card-${guard.id || guardIdx}`}
                className={`rounded-xl border transition-all ${
                  isEnabled
                    ? 'border-slate-800 bg-slate-900/50 hover:border-slate-700'
                    : 'border-slate-850 bg-slate-950/60 opacity-80'
                }`}
              >
                {/* Accordion Card Header */}
                <div className="p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center space-x-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleExpand(guard.id)}
                      data-testid={`toggle-guard-expand-${guard.id}`}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                      title={isExpanded ? 'Collapse guard' : 'Expand guard'}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>

                    <div className="min-w-0 flex items-center space-x-2.5">
                      <span className="font-semibold text-xs text-slate-200 truncate">
                        {guard.name || `Transition Guard #${guardIdx + 1}`}
                      </span>

                      {/* Target Status Badge */}
                      <div className="flex items-center space-x-1 shrink-0">
                        <span className="text-[10px] text-slate-500 font-mono">→</span>
                        {targetStatusDef ? (
                          <span
                            data-testid={`target-status-badge-${guard.id}`}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium border"
                            style={{
                              backgroundColor: `${targetStatusDef.color}15`,
                              borderColor: `${targetStatusDef.color}40`,
                              color: targetStatusDef.color,
                            }}
                          >
                            <span
                              className="w-1.5 h-1.5 rounded-full mr-1"
                              style={{ backgroundColor: targetStatusDef.color }}
                            />
                            {targetStatusDef.label}
                          </span>
                        ) : (
                          <span
                            data-testid={`target-status-badge-${guard.id}`}
                            className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-slate-800 text-slate-300 border border-slate-700"
                          >
                            {guard.target_status || 'Any'}
                          </span>
                        )}
                      </div>

                      <span className="text-[10px] text-slate-500 font-mono hidden sm:inline-block">
                        ({(guard.conditions || []).length} {guard.conditions?.length === 1 ? 'condition' : 'conditions'})
                      </span>
                    </div>
                  </div>

                  {/* Actions & Enabled Switch */}
                  <div className="flex items-center space-x-3 shrink-0">
                    <label
                      className={`inline-flex items-center space-x-2 text-xs text-slate-400 select-none ${
                        readOnly ? 'cursor-default' : 'cursor-pointer'
                      }`}
                    >
                      <span className="text-[11px] hidden sm:inline">
                        {isEnabled ? 'Enabled' : 'Disabled'}
                      </span>
                      <input
                        type="checkbox"
                        disabled={readOnly}
                        checked={isEnabled}
                        onChange={() => handleToggleEnabled(guard.id, guard.enabled)}
                        data-testid={`toggle-guard-enabled-${guard.id}`}
                        className="sr-only"
                      />
                      <div
                        className={`w-8 h-4 rounded-full transition-colors relative ${
                          isEnabled ? 'bg-emerald-500' : 'bg-slate-700'
                        }`}
                      >
                        <div
                          className={`w-3 h-3 rounded-full bg-white absolute top-0.5 transition-transform ${
                            isEnabled ? 'left-4.5' : 'left-0.5'
                          }`}
                        />
                      </div>
                    </label>

                    {!readOnly && (
                      <button
                        type="button"
                        onClick={() => handleDeleteGuard(guard.id)}
                        data-testid={`delete-guard-${guard.id}`}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                        title="Delete guard"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Guard Details */}
                {isExpanded && (
                  <div className="p-4 border-t border-slate-900/80 bg-slate-950/70 space-y-4 animate-in fade-in-50">
                    {/* Top Row: Guard Name and Target Status */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      <div className="space-y-1">
                        <label
                          htmlFor={`guard-name-${guard.id}`}
                          className="text-[11px] font-medium text-slate-400 flex items-center justify-between"
                        >
                          <span>Guard Name</span>
                          <span className="text-[10px] text-slate-500 font-mono">id: {guard.id}</span>
                        </label>
                        <div className="relative flex items-center">
                          <input
                            id={`guard-name-${guard.id}`}
                            type="text"
                            disabled={readOnly}
                            value={guard.name || ''}
                            onChange={(e) => handleGuardChange(guard.id, { name: e.target.value })}
                            placeholder="e.g. Require PR & Commit for In Review"
                            data-testid={`guard-name-input-${guard.id}`}
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                          />
                        </div>
                      </div>

                      <div className="space-y-1">
                        <label
                          htmlFor={`guard-target-status-${guard.id}`}
                          className="text-[11px] font-medium text-slate-400"
                        >
                          Target Status / Column
                        </label>
                        <select
                          id={`guard-target-status-${guard.id}`}
                          disabled={readOnly}
                          value={guard.target_status || ''}
                          onChange={(e) => handleGuardChange(guard.id, { target_status: e.target.value })}
                          data-testid={`guard-target-status-select-${guard.id}`}
                          className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                        >
                          {availableStatuses.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label} ({s.id})
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Conditions Table */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                          Required Conditions
                        </span>
                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => handleAddCondition(guard.id)}
                            data-testid={`add-condition-${guard.id}`}
                            className="inline-flex items-center space-x-1 text-[11px] text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Add Condition</span>
                          </button>
                        )}
                      </div>

                      <div className="overflow-x-auto rounded-lg border border-slate-900">
                        <table className="w-full text-left text-xs">
                          <thead className="bg-slate-900/80 text-[10px] font-mono uppercase text-slate-400 border-b border-slate-900">
                            <tr>
                              <th className="py-2 px-3 w-1/4">Field</th>
                              <th className="py-2 px-3 w-1/4">Operator</th>
                              <th className="py-2 px-3 w-1/4">Comparison Value</th>
                              <th className="py-2 px-3">Rejection Toast Message</th>
                              {!readOnly && <th className="py-2 px-2 w-10 text-center"></th>}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-900/60 bg-slate-950">
                            {(guard.conditions || []).map((cond, condIdx) => {
                              const opMeta = GUARD_OPERATORS.find((o) => o.value === cond.operator);
                              const requiresVal = opMeta ? opMeta.requiresValue : true;

                              return (
                                <tr
                                  key={condIdx}
                                  data-testid={`condition-row-${guard.id}-${condIdx}`}
                                  className="hover:bg-slate-900/30 transition-colors"
                                >
                                  {/* Field Selector */}
                                  <td className="p-2">
                                    <select
                                      disabled={readOnly}
                                      value={cond.field}
                                      onChange={(e) =>
                                        handleUpdateCondition(guard.id, condIdx, { field: e.target.value })
                                      }
                                      data-testid={`condition-field-select-${guard.id}-${condIdx}`}
                                      className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                                    >
                                      <optgroup label="Standard Fields">
                                        {fieldOptions.standard.map((sf) => (
                                          <option key={sf.value} value={sf.value}>
                                            {sf.label}
                                          </option>
                                        ))}
                                      </optgroup>
                                      {fieldOptions.customMeta.length > 0 && (
                                        <optgroup label="Project Custom Metadata">
                                          {fieldOptions.customMeta.map((cf) => (
                                            <option key={cf.value} value={cf.value}>
                                              {cf.label}
                                            </option>
                                          ))}
                                        </optgroup>
                                      )}
                                      {!fieldOptions.standard.some((sf) => sf.value === cond.field) &&
                                        !fieldOptions.customMeta.some((cf) => cf.value === cond.field) && (
                                          <optgroup label="Custom Specified Path">
                                            <option value={cond.field}>{cond.field}</option>
                                          </optgroup>
                                        )}
                                    </select>
                                  </td>

                                  {/* Operator */}
                                  <td className="p-2">
                                    <select
                                      disabled={readOnly}
                                      value={cond.operator}
                                      onChange={(e) =>
                                        handleUpdateCondition(guard.id, condIdx, { operator: e.target.value })
                                      }
                                      data-testid={`condition-operator-select-${guard.id}-${condIdx}`}
                                      className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                                    >
                                      {GUARD_OPERATORS.map((op) => (
                                        <option key={op.value} value={op.value}>
                                          {op.label}
                                        </option>
                                      ))}
                                    </select>
                                  </td>

                                  {/* Comparison Value (Conditional) */}
                                  <td className="p-2">
                                    {requiresVal ? (
                                      <div className="flex items-center space-x-1">
                                        <input
                                          type="text"
                                          disabled={readOnly}
                                          value={cond.value !== undefined ? String(cond.value) : ''}
                                          onChange={(e) =>
                                            handleUpdateCondition(guard.id, condIdx, { value: e.target.value })
                                          }
                                          placeholder={opMeta?.placeholder || 'Value...'}
                                          data-testid={`condition-value-input-${guard.id}-${condIdx}`}
                                          className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 placeholder-slate-600 font-mono focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                                        />
                                        <TokenCatalogPopover
                                          settings={settings}
                                          iconOnly={true}
                                          disabled={readOnly}
                                          onSelectToken={(tok) => {
                                            const current = cond.value !== undefined ? String(cond.value) : '';
                                            handleUpdateCondition(guard.id, condIdx, { value: current + tok });
                                          }}
                                        />
                                      </div>
                                    ) : (
                                      <span className="text-[11px] text-slate-600 font-mono italic px-2">
                                        Not applicable
                                      </span>
                                    )}
                                  </td>

                                  {/* Rejection Toast Message */}
                                  <td className="p-2">
                                    <div className="flex items-center space-x-1">
                                      <input
                                        type="text"
                                        disabled={readOnly}
                                        value={cond.message || ''}
                                        onChange={(e) =>
                                          handleUpdateCondition(guard.id, condIdx, { message: e.target.value })
                                        }
                                        placeholder="User-friendly error message if rejected"
                                        data-testid={`condition-message-input-${guard.id}-${condIdx}`}
                                        className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
                                      />
                                      <TokenCatalogPopover
                                        settings={settings}
                                        iconOnly={true}
                                        disabled={readOnly}
                                        onSelectToken={(tok) => {
                                          const current = cond.message || '';
                                          handleUpdateCondition(guard.id, condIdx, { message: current + tok });
                                        }}
                                      />
                                    </div>
                                  </td>

                                  {/* Delete Condition Button */}
                                  {!readOnly && (
                                    <td className="p-2 text-center">
                                      <button
                                        type="button"
                                        onClick={() => handleDeleteCondition(guard.id, condIdx)}
                                        data-testid={`delete-condition-${guard.id}-${condIdx}`}
                                        className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-950/20 transition-colors"
                                        title="Remove condition"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </td>
                                  )}
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
