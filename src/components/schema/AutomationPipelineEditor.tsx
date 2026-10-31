'use client';

import React, { useState, useMemo } from 'react';
import {
  Zap,
  Plus,
  Trash2,
  ChevronDown,
  ChevronRight,
  Filter,
  Play,
  Calendar,
  Send,
  Layers,
  Sparkles,
  Sliders,
  Check,
} from 'lucide-react';
import type {
  ProjectSettings,
  AutomationRule,
  AutomationRuleCondition,
  AutomationAction,
  StatusDefinition,
  HierarchyLevel,
} from '@/types/tracker';
import { TokenCatalogPopover } from './TokenCatalogPopover';

export const EVENT_TYPES = [
  {
    value: 'status_transition',
    label: 'Status Transition',
    description: 'When an item transitions between statuses',
  },
  {
    value: 'item_created',
    label: 'Item Ingested / Created',
    description: 'When a new work item is ingested or created',
  },
  {
    value: 'deployment_completed',
    label: 'CI/CD Deployment Succeeded',
    description: 'When GitHub/Vercel deployment succeeds',
  },
  {
    value: 'observability_alert',
    label: 'Observability Alert Received',
    description: 'When Sentry or Axiom alert arrives',
  },
];

export const FILTER_OPERATORS = [
  { value: '$eq', label: 'Equals ($eq)', requiresValue: true },
  { value: '$ne', label: 'Not Equals ($ne)', requiresValue: true },
  { value: '$gt', label: 'Greater Than ($gt)', requiresValue: true },
  { value: '$lt', label: 'Less Than ($lt)', requiresValue: true },
  { value: '$is_null', label: 'Is Empty / Null ($is_null)', requiresValue: false },
  { value: '$is_not_null', label: 'Is Not Empty ($is_not_null)', requiresValue: false },
  { value: '$in', label: 'In List ($in)', requiresValue: true, placeholder: 'val1, val2' },
];

export const ACTION_TYPES = [
  {
    value: 'calculate_calendar_slot',
    label: 'Calculate Calendar Slot / Cadence',
    description: 'Computes release cadence, target weekday, and collision checks',
  },
  {
    value: 'patch_metadata',
    label: 'Patch Metadata',
    description: 'Updates work item metadata fields with values or interpolated tokens',
  },
  {
    value: 'expand_children_template',
    label: 'Expand Child Task Template',
    description: 'Spawns predefined hierarchy subtasks from project templates',
  },
  {
    value: 'dispatch_webhook',
    label: 'Dispatch Outgoing Webhook',
    description: 'Sends HMAC-signed event payload to external webhook URL',
  },
];

export const WEEKDAYS = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
];

export interface AutomationPipelineEditorProps {
  settings: ProjectSettings;
  onChange: (updatedSettings: ProjectSettings) => void;
  readOnly?: boolean;
}

export function AutomationPipelineEditor({
  settings,
  onChange,
  readOnly = false,
}: AutomationPipelineEditorProps) {
  const rules = useMemo<AutomationRule[]>(() => {
    return Array.isArray(settings.automations) ? settings.automations : [];
  }, [settings.automations]);

  const [expandedRuleIds, setExpandedRuleIds] = useState<Record<string, boolean>>(() => {
    const initial: Record<string, boolean> = {};
    if (rules.length > 0 && rules[0].id) {
      initial[rules[0].id] = true;
    }
    return initial;
  });

  const availableStatuses = useMemo<StatusDefinition[]>(() => {
    return Array.isArray(settings.statuses) ? settings.statuses : [];
  }, [settings.statuses]);

  const availableHierarchy = useMemo<HierarchyLevel[]>(() => {
    return Array.isArray(settings.hierarchy) ? settings.hierarchy : [];
  }, [settings.hierarchy]);

  // Derived available field options
  const fieldOptions = useMemo(() => {
    const standard = [
      { value: 'status', label: 'Status (status)' },
      { value: 'item_type', label: 'Item Type (item_type)' },
      { value: 'priority', label: 'Priority (priority)' },
      { value: 'assignee', label: 'Assignee (assignee)' },
      { value: 'title', label: 'Title (title)' },
      { value: 'external_ref_id', label: 'External Ref ID (external_ref_id)' },
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

    return { standard, customMeta };
  }, [settings.custom_fields]);

  // Available templates from settings
  const templateOptions = useMemo<string[]>(() => {
    if (!settings.templates) return [];
    if (Array.isArray(settings.templates)) {
      return settings.templates.map((t: any) => t.id || t.name).filter(Boolean);
    }
    if (typeof settings.templates === 'object') {
      return Object.keys(settings.templates);
    }
    return [];
  }, [settings.templates]);

  const toggleExpand = (id: string) => {
    setExpandedRuleIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const handleUpdateRules = (updated: AutomationRule[]) => {
    if (readOnly) return;
    onChange({
      ...settings,
      automations: updated,
    });
  };

  const handleAddRule = () => {
    if (readOnly) return;
    const newRuleId = `auto-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
    const newRule: AutomationRule = {
      id: newRuleId,
      name: 'New Automation Rule',
      enabled: true,
      trigger: {
        event: 'status_transition',
        status: availableStatuses[0]?.id || 'in_progress',
      },
      conditions: [],
      actions: [
        {
          type: 'patch_metadata',
          metadata: {
            automated: 'true',
          },
        },
      ],
    };

    const nextRules = [...rules, newRule];
    handleUpdateRules(nextRules);
    setExpandedRuleIds((prev) => ({ ...prev, [newRuleId]: true }));
  };

  const handleDeleteRule = (ruleId: string) => {
    if (readOnly) return;
    handleUpdateRules(rules.filter((r) => r.id !== ruleId));
  };

  const handleToggleEnabled = (ruleId: string, currentEnabled?: boolean) => {
    if (readOnly) return;
    const nextRules = rules.map((r) =>
      r.id === ruleId ? { ...r, enabled: currentEnabled === false } : r
    );
    handleUpdateRules(nextRules);
  };

  const handleRuleChange = (ruleId: string, updates: Partial<AutomationRule>) => {
    if (readOnly) return;
    const nextRules = rules.map((r) => (r.id === ruleId ? { ...r, ...updates } : r));
    handleUpdateRules(nextRules);
  };

  const handleTriggerChange = (ruleId: string, triggerUpdates: Record<string, any>) => {
    if (readOnly) return;
    const nextRules = rules.map((r) => {
      if (r.id !== ruleId) return r;
      return {
        ...r,
        trigger: {
          ...r.trigger,
          ...triggerUpdates,
        },
      };
    });
    handleUpdateRules(nextRules);
  };

  const handleAddCondition = (ruleId: string) => {
    if (readOnly) return;
    const defaultField = fieldOptions.standard[0]?.value || 'status';
    const nextRules = rules.map((r) => {
      if (r.id !== ruleId) return r;
      const conditions = [...(r.conditions || [])];
      const newCond: AutomationRuleCondition = {
        field: defaultField,
        operator: '$eq',
        value: '',
        logic: conditions.length > 0 ? 'AND' : undefined,
      };
      return {
        ...r,
        conditions: [...conditions, newCond],
      };
    });
    handleUpdateRules(nextRules);
  };

  const handleUpdateCondition = (
    ruleId: string,
    condIdx: number,
    updates: Partial<AutomationRuleCondition>
  ) => {
    if (readOnly) return;
    const nextRules = rules.map((r) => {
      if (r.id !== ruleId) return r;
      const conditions = [...(r.conditions || [])];
      conditions[condIdx] = { ...conditions[condIdx], ...updates };
      return { ...r, conditions };
    });
    handleUpdateRules(nextRules);
  };

  const handleDeleteCondition = (ruleId: string, condIdx: number) => {
    if (readOnly) return;
    const nextRules = rules.map((r) => {
      if (r.id !== ruleId) return r;
      const conditions = (r.conditions || []).filter((_, idx) => idx !== condIdx);
      return { ...r, conditions };
    });
    handleUpdateRules(nextRules);
  };

  const handleAddAction = (ruleId: string) => {
    if (readOnly) return;
    const nextRules = rules.map((r) => {
      if (r.id !== ruleId) return r;
      const currentActions = Array.isArray(r.actions)
        ? r.actions
        : r.action
        ? [r.action]
        : [];
      const newAction: AutomationAction = {
        type: 'patch_metadata',
        metadata: {},
      };
      return {
        ...r,
        actions: [...currentActions, newAction],
      };
    });
    handleUpdateRules(nextRules);
  };

  const handleUpdateAction = (ruleId: string, actIdx: number, updatedAction: AutomationAction) => {
    if (readOnly) return;
    const nextRules = rules.map((r) => {
      if (r.id !== ruleId) return r;
      const actions = Array.isArray(r.actions)
        ? [...r.actions]
        : r.action
        ? [r.action]
        : [];
      actions[actIdx] = updatedAction;
      return {
        ...r,
        actions,
        action: actions[0],
      };
    });
    handleUpdateRules(nextRules);
  };

  const handleDeleteAction = (ruleId: string, actIdx: number) => {
    if (readOnly) return;
    const nextRules = rules.map((r) => {
      if (r.id !== ruleId) return r;
      const actions = (Array.isArray(r.actions) ? r.actions : r.action ? [r.action] : []).filter(
        (_, idx) => idx !== actIdx
      );
      return {
        ...r,
        actions,
        action: actions[0],
      };
    });
    handleUpdateRules(nextRules);
  };

  return (
    <div
      data-testid="automation-pipeline-editor-section"
      className="p-5 rounded-2xl bg-slate-950 border border-slate-800 space-y-4 shadow-sm"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-900 pb-3">
        <div>
          <div className="flex items-center space-x-2">
            <Zap className="w-4 h-4 text-amber-400" />
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-200">
              Automation Pipelines
            </h3>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
              {rules.length} {rules.length === 1 ? 'rule' : 'rules'} configured
            </span>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Construct event-driven workflow automations chaining Triggers, Condition Filters, Context Aggregators, and Execution Actions.
          </p>
        </div>

        {!readOnly && (
          <button
            type="button"
            onClick={handleAddRule}
            data-testid="add-automation-rule-button"
            className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-400 text-xs font-semibold transition-colors shrink-0"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Automation Rule</span>
          </button>
        )}
      </div>

      {/* Rules List / Empty State */}
      {rules.length === 0 ? (
        <div
          data-testid="automations-empty-state"
          className="p-6 rounded-xl border border-dashed border-slate-800 bg-slate-900/30 text-center space-y-3"
        >
          <div className="w-10 h-10 rounded-full bg-slate-900 border border-slate-800 flex items-center justify-center mx-auto text-slate-500">
            <Zap className="w-5 h-5 text-slate-400" />
          </div>
          <div>
            <h4 className="text-xs font-semibold text-slate-300">No Automations Configured</h4>
            <p className="text-[11px] text-slate-500 max-w-md mx-auto mt-0.5">
              Automations run asynchronously on status transitions, ingest events, deployments, and alerts.
            </p>
          </div>
          {!readOnly && (
            <button
              type="button"
              onClick={handleAddRule}
              className="inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-700 text-slate-300 hover:text-white text-xs font-medium transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-amber-400" />
              <span>Create First Rule</span>
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((rule, ruleIdx) => {
            const isExpanded = expandedRuleIds[rule.id || `r-${ruleIdx}`] ?? true;
            const isEnabled = rule.enabled !== false;
            const ruleId = rule.id || `r-${ruleIdx}`;
            const actionsList: AutomationAction[] = Array.isArray(rule.actions)
              ? rule.actions
              : rule.action
              ? [rule.action]
              : [];

            const eventType = rule.trigger?.event || rule.trigger?.type || 'status_transition';

            return (
              <div
                key={ruleId}
                data-testid={`automation-rule-card-${ruleId}`}
                className={`rounded-xl border transition-all ${
                  isEnabled
                    ? 'border-slate-800 bg-slate-900/40 hover:border-slate-700'
                    : 'border-slate-850 bg-slate-950/60 opacity-80'
                }`}
              >
                {/* Header Row */}
                <div className="p-3.5 flex items-center justify-between gap-3">
                  <div className="flex items-center space-x-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => toggleExpand(ruleId)}
                      data-testid={`toggle-rule-expand-${ruleId}`}
                      className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                      title={isExpanded ? 'Collapse rule' : 'Expand rule'}
                    >
                      {isExpanded ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </button>

                    <div className="min-w-0 flex items-center space-x-2.5">
                      <span className="font-semibold text-xs text-slate-200 truncate">
                        {rule.name || `Rule #${ruleIdx + 1}`}
                      </span>

                      {/* Event Type Badge */}
                      <span
                        data-testid={`rule-event-badge-${ruleId}`}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/10 text-amber-300 border border-amber-500/30 shrink-0"
                      >
                        {eventType}
                      </span>

                      <span className="text-[10px] text-slate-500 font-mono hidden sm:inline-block">
                        ({(rule.conditions || []).length} filters, {actionsList.length} actions)
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
                        onChange={() => handleToggleEnabled(ruleId, rule.enabled)}
                        data-testid={`toggle-rule-enabled-${ruleId}`}
                        className="sr-only"
                      />
                      <div
                        className={`w-8 h-4 rounded-full transition-colors relative ${
                          isEnabled ? 'bg-amber-500' : 'bg-slate-700'
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
                        onClick={() => handleDeleteRule(rule.id || ruleId)}
                        data-testid={`delete-rule-${ruleId}`}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-950/30 transition-colors"
                        title="Delete rule"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Expanded Rule Pipeline Details */}
                {isExpanded && (
                  <div className="p-4 border-t border-slate-900/80 bg-slate-950/70 space-y-5 animate-in fade-in-50">
                    {/* Rule Name Input */}
                    <div className="space-y-1">
                      <label
                        htmlFor={`rule-name-${ruleId}`}
                        className="text-[11px] font-medium text-slate-400 flex items-center justify-between"
                      >
                        <span>Rule Name</span>
                        <span className="text-[10px] text-slate-500 font-mono">id: {rule.id}</span>
                      </label>
                      <input
                        id={`rule-name-${ruleId}`}
                        type="text"
                        disabled={readOnly}
                        value={rule.name || ''}
                        onChange={(e) => handleRuleChange(rule.id || ruleId, { name: e.target.value })}
                        placeholder="e.g. Expand QA Checklist on In Review"
                        data-testid={`rule-name-input-${ruleId}`}
                        className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-amber-500 disabled:opacity-50"
                      />
                    </div>

                    {/* BLOCK 1: Trigger Block ("When...") */}
                    <div
                      data-testid={`trigger-block-${ruleId}`}
                      className="p-3.5 rounded-xl border border-sky-900/40 bg-sky-950/20 space-y-3"
                    >
                      <div className="flex items-center space-x-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-sky-500/20 text-sky-300 border border-sky-500/30">
                          When (Trigger)
                        </span>
                        <span className="text-xs text-slate-300 font-medium">
                          Select the event that initiates this automation pipeline
                        </span>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <label
                            htmlFor={`trigger-event-${ruleId}`}
                            className="text-[11px] font-medium text-slate-400"
                          >
                            Event Type
                          </label>
                          <select
                            id={`trigger-event-${ruleId}`}
                            disabled={readOnly}
                            value={eventType}
                            onChange={(e) =>
                              handleTriggerChange(rule.id || ruleId, {
                                event: e.target.value,
                                type: e.target.value,
                              })
                            }
                            data-testid={`trigger-event-select-${ruleId}`}
                            className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-sky-500 disabled:opacity-50"
                          >
                            {EVENT_TYPES.map((ev) => (
                              <option key={ev.value} value={ev.value}>
                                {ev.label} ({ev.value})
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Status Matcher for status_transition */}
                        {eventType === 'status_transition' && (
                          <div className="space-y-1">
                            <label
                              htmlFor={`trigger-status-${ruleId}`}
                              className="text-[11px] font-medium text-slate-400"
                            >
                              When status changes to...
                            </label>
                            <select
                              id={`trigger-status-${ruleId}`}
                              disabled={readOnly}
                              value={rule.trigger?.status || ''}
                              onChange={(e) =>
                                handleTriggerChange(rule.id || ruleId, { status: e.target.value })
                              }
                              data-testid={`trigger-status-select-${ruleId}`}
                              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-sky-500 disabled:opacity-50"
                            >
                              <option value="">Any Status</option>
                              {availableStatuses.map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.label} ({s.id})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}

                        {/* Item Type Matcher for item_created */}
                        {eventType === 'item_created' && (
                          <div className="space-y-1">
                            <label
                              htmlFor={`trigger-item-type-${ruleId}`}
                              className="text-[11px] font-medium text-slate-400"
                            >
                              For Item Type
                            </label>
                            <select
                              id={`trigger-item-type-${ruleId}`}
                              disabled={readOnly}
                              value={rule.trigger?.item_type || ''}
                              onChange={(e) =>
                                handleTriggerChange(rule.id || ruleId, { item_type: e.target.value })
                              }
                              data-testid={`trigger-item-type-select-${ruleId}`}
                              className="w-full px-3 py-1.5 bg-slate-900 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-sky-500 disabled:opacity-50"
                            >
                              <option value="">Any Hierarchy Level</option>
                              {availableHierarchy.map((h) => (
                                <option key={h.type} value={h.type}>
                                  {h.label} ({h.type})
                                </option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* BLOCK 2: Conditions Block ("Only if...") */}
                    <div
                      data-testid={`conditions-block-${ruleId}`}
                      className="p-3.5 rounded-xl border border-purple-900/40 bg-purple-950/20 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-purple-500/20 text-purple-300 border border-purple-500/30">
                            Only If (Filter Conditions)
                          </span>
                          <span className="text-xs text-slate-300 font-medium">
                            Chain field conditions with AND / OR evaluation
                          </span>
                        </div>

                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => handleAddCondition(rule.id || ruleId)}
                            data-testid={`add-condition-${ruleId}`}
                            className="inline-flex items-center space-x-1 text-xs text-purple-400 hover:text-purple-300 font-medium transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Condition</span>
                          </button>
                        )}
                      </div>

                      {(rule.conditions || []).length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-1">
                          No filter conditions — this rule evaluates unconditionally for all matching trigger events.
                        </p>
                      ) : (
                        <div className="space-y-2">
                          {(rule.conditions || []).map((cond, condIdx) => {
                            const opMeta = FILTER_OPERATORS.find((o) => o.value === cond.operator);
                            const requiresVal = opMeta ? opMeta.requiresValue : true;

                            return (
                              <div
                                key={condIdx}
                                data-testid={`rule-condition-row-${ruleId}-${condIdx}`}
                                className="flex flex-col sm:flex-row sm:items-center gap-2 p-2 rounded-lg bg-slate-900/70 border border-slate-800"
                              >
                                {/* Combinator (AND/OR) */}
                                {condIdx > 0 && (
                                  <select
                                    disabled={readOnly}
                                    value={cond.logic || 'AND'}
                                    onChange={(e) =>
                                      handleUpdateCondition(rule.id || ruleId, condIdx, {
                                        logic: e.target.value as 'AND' | 'OR',
                                      })
                                    }
                                    data-testid={`condition-logic-select-${ruleId}-${condIdx}`}
                                    className="px-2 py-1 bg-slate-950 border border-slate-700 rounded text-[11px] font-mono text-purple-300 focus:outline-none shrink-0"
                                  >
                                    <option value="AND">AND</option>
                                    <option value="OR">OR</option>
                                  </select>
                                )}

                                {/* Field */}
                                <select
                                  disabled={readOnly}
                                  value={cond.field}
                                  onChange={(e) =>
                                    handleUpdateCondition(rule.id || ruleId, condIdx, { field: e.target.value })
                                  }
                                  data-testid={`condition-field-select-${ruleId}-${condIdx}`}
                                  className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-purple-500 sm:w-1/3"
                                >
                                  <optgroup label="Standard Fields">
                                    {fieldOptions.standard.map((sf) => (
                                      <option key={sf.value} value={sf.value}>
                                        {sf.label}
                                      </option>
                                    ))}
                                  </optgroup>
                                  {fieldOptions.customMeta.length > 0 && (
                                    <optgroup label="Project Metadata">
                                      {fieldOptions.customMeta.map((cf) => (
                                        <option key={cf.value} value={cf.value}>
                                          {cf.label}
                                        </option>
                                      ))}
                                    </optgroup>
                                  )}
                                </select>

                                {/* Operator */}
                                <select
                                  disabled={readOnly}
                                  value={cond.operator}
                                  onChange={(e) =>
                                    handleUpdateCondition(rule.id || ruleId, condIdx, { operator: e.target.value })
                                  }
                                  data-testid={`condition-operator-select-${ruleId}-${condIdx}`}
                                  className="px-2 py-1 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-purple-500 sm:w-1/4"
                                >
                                  {FILTER_OPERATORS.map((op) => (
                                    <option key={op.value} value={op.value}>
                                      {op.label}
                                    </option>
                                  ))}
                                </select>

                                {/* Value with TokenCatalogPopover */}
                                {requiresVal ? (
                                  <div className="flex items-center space-x-1 flex-1">
                                    <input
                                      type="text"
                                      disabled={readOnly}
                                      value={cond.value !== undefined ? String(cond.value) : ''}
                                      onChange={(e) =>
                                        handleUpdateCondition(rule.id || ruleId, condIdx, { value: e.target.value })
                                      }
                                      placeholder={opMeta?.placeholder || 'Value or token...'}
                                      data-testid={`condition-value-input-${ruleId}-${condIdx}`}
                                      className="w-full px-2 py-1 bg-slate-950 border border-slate-800 rounded text-xs text-slate-200 font-mono placeholder-slate-600 focus:outline-none focus:border-purple-500"
                                    />
                                    <TokenCatalogPopover
                                      settings={settings}
                                      iconOnly={true}
                                      onSelectToken={(tok) => {
                                        const current = cond.value !== undefined ? String(cond.value) : '';
                                        handleUpdateCondition(rule.id || ruleId, condIdx, { value: current + tok });
                                      }}
                                    />
                                  </div>
                                ) : (
                                  <span className="text-[11px] text-slate-600 font-mono italic px-2 flex-1">
                                    N/A
                                  </span>
                                )}

                                {!readOnly && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteCondition(rule.id || ruleId, condIdx)}
                                    data-testid={`delete-condition-${ruleId}-${condIdx}`}
                                    className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-red-950/20 transition-colors shrink-0"
                                    title="Remove filter condition"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* BLOCK 3: Actions Block ("Then do...") */}
                    <div
                      data-testid={`actions-block-${ruleId}`}
                      className="p-3.5 rounded-xl border border-emerald-900/40 bg-emerald-950/20 space-y-3"
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            Then Do (Action Blocks)
                          </span>
                          <span className="text-xs text-slate-300 font-medium">
                            Execute task templates, metadata patches, cadence calculations, or webhooks
                          </span>
                        </div>

                        {!readOnly && (
                          <button
                            type="button"
                            onClick={() => handleAddAction(rule.id || ruleId)}
                            data-testid={`add-action-${ruleId}`}
                            className="inline-flex items-center space-x-1 text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors"
                          >
                            <Plus className="w-3.5 h-3.5" />
                            <span>Add Action</span>
                          </button>
                        )}
                      </div>

                      {actionsList.length === 0 ? (
                        <p className="text-xs text-slate-500 italic py-1">
                          No actions configured for this rule.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {actionsList.map((action, actIdx) => (
                            <div
                              key={actIdx}
                              data-testid={`action-row-${ruleId}-${actIdx}`}
                              className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 space-y-3"
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-2 w-full max-w-sm">
                                  <label
                                    htmlFor={`action-type-${ruleId}-${actIdx}`}
                                    className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider shrink-0"
                                  >
                                    Action #{actIdx + 1}:
                                  </label>
                                  <select
                                    id={`action-type-${ruleId}-${actIdx}`}
                                    disabled={readOnly}
                                    value={action.type}
                                    onChange={(e) => {
                                      const nextType = e.target.value;
                                      let baseAction: AutomationAction = { type: nextType as any };
                                      if (nextType === 'calculate_calendar_slot') {
                                        baseAction = {
                                          type: 'calculate_calendar_slot',
                                          cadence_days: 7,
                                          weekday: 'Monday',
                                          utc_time: '14:00',
                                          collision_statuses: ['in_progress', 'in_review'],
                                        };
                                      } else if (nextType === 'patch_metadata') {
                                        baseAction = {
                                          type: 'patch_metadata',
                                          metadata: {},
                                        };
                                      } else if (nextType === 'expand_children_template') {
                                        baseAction = {
                                          type: 'expand_children_template',
                                          template_id: templateOptions[0] || 'default_template',
                                        };
                                      } else if (nextType === 'dispatch_webhook') {
                                        baseAction = {
                                          type: 'dispatch_webhook',
                                          url: 'https://',
                                          include_parent_context: true,
                                        };
                                      }
                                      handleUpdateAction(rule.id || ruleId, actIdx, baseAction);
                                    }}
                                    data-testid={`action-type-select-${ruleId}-${actIdx}`}
                                    className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-emerald-300 font-medium focus:outline-none focus:border-emerald-500"
                                  >
                                    {ACTION_TYPES.map((at) => (
                                      <option key={at.value} value={at.value}>
                                        {at.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>

                                {!readOnly && (
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteAction(rule.id || ruleId, actIdx)}
                                    data-testid={`delete-action-${ruleId}-${actIdx}`}
                                    className="p-1 rounded text-slate-500 hover:text-red-400 hover:bg-red-950/20 transition-colors"
                                    title="Delete action"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>

                              {/* Form Controls for Specific Action Types */}

                              {/* 1. Calculate Calendar Slot / Cadence */}
                              {(action.type === 'calculate_calendar_slot' ||
                                action.type === 'calculate_cadence') && (
                                <div
                                  data-testid={`action-calendar-config-${ruleId}-${actIdx}`}
                                  className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5 pt-1"
                                >
                                  <div className="space-y-1">
                                    <label
                                      htmlFor={`cadence-days-${ruleId}-${actIdx}`}
                                      className="text-[10px] font-medium text-slate-400"
                                    >
                                      Cadence Days
                                    </label>
                                    <input
                                      id={`cadence-days-${ruleId}-${actIdx}`}
                                      type="number"
                                      disabled={readOnly}
                                      min={1}
                                      value={(action as any).cadence_days ?? 7}
                                      onChange={(e) =>
                                        handleUpdateAction(rule.id || ruleId, actIdx, {
                                          ...action,
                                          cadence_days: parseInt(e.target.value, 10) || 7,
                                        })
                                      }
                                      data-testid={`cadence-days-input-${ruleId}-${actIdx}`}
                                      className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <label
                                      htmlFor={`cadence-weekday-${ruleId}-${actIdx}`}
                                      className="text-[10px] font-medium text-slate-400"
                                    >
                                      Scheduled Weekday
                                    </label>
                                    <select
                                      id={`cadence-weekday-${ruleId}-${actIdx}`}
                                      disabled={readOnly}
                                      value={(action as any).weekday || 'Monday'}
                                      onChange={(e) =>
                                        handleUpdateAction(rule.id || ruleId, actIdx, {
                                          ...action,
                                          weekday: e.target.value,
                                        })
                                      }
                                      data-testid={`cadence-weekday-select-${ruleId}-${actIdx}`}
                                      className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                                    >
                                      {WEEKDAYS.map((wd) => (
                                        <option key={wd} value={wd}>
                                          {wd}
                                        </option>
                                      ))}
                                    </select>
                                  </div>

                                  <div className="space-y-1">
                                    <label
                                      htmlFor={`cadence-utc-time-${ruleId}-${actIdx}`}
                                      className="text-[10px] font-medium text-slate-400"
                                    >
                                      Target UTC Time
                                    </label>
                                    <input
                                      id={`cadence-utc-time-${ruleId}-${actIdx}`}
                                      type="text"
                                      disabled={readOnly}
                                      value={(action as any).utc_time || '14:00'}
                                      onChange={(e) =>
                                        handleUpdateAction(rule.id || ruleId, actIdx, {
                                          ...action,
                                          utc_time: e.target.value,
                                        })
                                      }
                                      placeholder="14:00"
                                      data-testid={`cadence-utc-time-input-${ruleId}-${actIdx}`}
                                      className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                                    />
                                  </div>

                                  <div className="space-y-1">
                                    <label
                                      htmlFor={`cadence-collision-${ruleId}-${actIdx}`}
                                      className="text-[10px] font-medium text-slate-400"
                                    >
                                      Collision Statuses
                                    </label>
                                    <select
                                      id={`cadence-collision-${ruleId}-${actIdx}`}
                                      disabled={readOnly}
                                      multiple
                                      value={(action as any).collision_statuses || ['in_progress', 'in_review']}
                                      onChange={(e) => {
                                        const selected = Array.from(e.target.selectedOptions, (opt) => opt.value);
                                        handleUpdateAction(rule.id || ruleId, actIdx, {
                                          ...action,
                                          collision_statuses: selected,
                                        });
                                      }}
                                      data-testid={`cadence-collision-select-${ruleId}-${actIdx}`}
                                      className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500 h-16"
                                    >
                                      {availableStatuses.map((s) => (
                                        <option key={s.id} value={s.id}>
                                          {s.label} ({s.id})
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>
                              )}

                              {/* 2. Patch Metadata */}
                              {(action.type === 'patch_metadata' || action.type === 'patch_item') && (
                                <div
                                  data-testid={`action-patch-metadata-${ruleId}-${actIdx}`}
                                  className="space-y-2 pt-1"
                                >
                                  <div className="flex items-center justify-between">
                                    <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                                      Key-Value Patch Dictionary
                                    </span>
                                    {!readOnly && (
                                      <button
                                        type="button"
                                        onClick={() => {
                                          const meta = { ...((action as any).metadata || {}) };
                                          const newKey = `custom_${Object.keys(meta).length + 1}`;
                                          meta[newKey] = '';
                                          handleUpdateAction(rule.id || ruleId, actIdx, {
                                            ...action,
                                            metadata: meta,
                                          });
                                        }}
                                        data-testid={`add-metadata-key-${ruleId}-${actIdx}`}
                                        className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium inline-flex items-center gap-1"
                                      >
                                        <Plus className="w-3 h-3" />
                                        <span>Add Field</span>
                                      </button>
                                    )}
                                  </div>

                                  <div className="space-y-1.5">
                                    {Object.entries((action as any).metadata || {}).map(([key, val], metaIdx) => (
                                      <div
                                        key={metaIdx}
                                        data-testid={`metadata-row-${ruleId}-${actIdx}-${metaIdx}`}
                                        className="flex items-center space-x-2"
                                      >
                                        <input
                                          type="text"
                                          disabled={readOnly}
                                          value={key}
                                          onChange={(e) => {
                                            const newKey = e.target.value;
                                            const meta = { ...((action as any).metadata || {}) };
                                            delete meta[key];
                                            meta[newKey] = val;
                                            handleUpdateAction(rule.id || ruleId, actIdx, {
                                              ...action,
                                              metadata: meta,
                                            });
                                          }}
                                          placeholder="key"
                                          data-testid={`metadata-key-input-${ruleId}-${actIdx}-${metaIdx}`}
                                          className="w-1/3 px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                                        />
                                        <div className="flex items-center space-x-1 flex-1">
                                          <input
                                            type="text"
                                            disabled={readOnly}
                                            value={val !== undefined ? String(val) : ''}
                                            onChange={(e) => {
                                              const meta = { ...((action as any).metadata || {}) };
                                              meta[key] = e.target.value;
                                              handleUpdateAction(rule.id || ruleId, actIdx, {
                                                ...action,
                                                metadata: meta,
                                              });
                                            }}
                                            placeholder="value or {{token}}"
                                            data-testid={`metadata-val-input-${ruleId}-${actIdx}-${metaIdx}`}
                                            className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                                          />
                                          <TokenCatalogPopover
                                            settings={settings}
                                            iconOnly={true}
                                            onSelectToken={(tok) => {
                                              const meta = { ...((action as any).metadata || {}) };
                                              meta[key] = (meta[key] || '') + tok;
                                              handleUpdateAction(rule.id || ruleId, actIdx, {
                                                ...action,
                                                metadata: meta,
                                              });
                                            }}
                                          />
                                        </div>
                                        {!readOnly && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const meta = { ...((action as any).metadata || {}) };
                                              delete meta[key];
                                              handleUpdateAction(rule.id || ruleId, actIdx, {
                                                ...action,
                                                metadata: meta,
                                              });
                                            }}
                                            data-testid={`delete-metadata-row-${ruleId}-${actIdx}-${metaIdx}`}
                                            className="p-1 rounded text-slate-600 hover:text-red-400"
                                          >
                                            <Trash2 className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {/* 3. Expand Child Task Template */}
                              {action.type === 'expand_children_template' && (
                                <div
                                  data-testid={`action-expand-template-${ruleId}-${actIdx}`}
                                  className="space-y-1 pt-1"
                                >
                                  <label
                                    htmlFor={`template-id-select-${ruleId}-${actIdx}`}
                                    className="text-[10px] font-medium text-slate-400"
                                  >
                                    Template Identifier (from project settings)
                                  </label>
                                  {templateOptions.length > 0 ? (
                                    <select
                                      id={`template-id-select-${ruleId}-${actIdx}`}
                                      disabled={readOnly}
                                      value={(action as any).template_id || ''}
                                      onChange={(e) =>
                                        handleUpdateAction(rule.id || ruleId, actIdx, {
                                          ...action,
                                          template_id: e.target.value,
                                        })
                                      }
                                      data-testid={`template-id-select-${ruleId}-${actIdx}`}
                                      className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                                    >
                                      {templateOptions.map((tid) => (
                                        <option key={tid} value={tid}>
                                          {tid}
                                        </option>
                                      ))}
                                    </select>
                                  ) : (
                                    <input
                                      id={`template-id-input-${ruleId}-${actIdx}`}
                                      type="text"
                                      disabled={readOnly}
                                      value={(action as any).template_id || ''}
                                      onChange={(e) =>
                                        handleUpdateAction(rule.id || ruleId, actIdx, {
                                          ...action,
                                          template_id: e.target.value,
                                        })
                                      }
                                      placeholder="e.g. qa_verification_template"
                                      data-testid={`template-id-input-${ruleId}-${actIdx}`}
                                      className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                                    />
                                  )}
                                </div>
                              )}

                              {/* 4. Dispatch Outgoing Webhook */}
                              {action.type === 'dispatch_webhook' && (
                                <div
                                  data-testid={`action-dispatch-webhook-${ruleId}-${actIdx}`}
                                  className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1"
                                >
                                  <div className="space-y-1 sm:col-span-2">
                                    <label
                                      htmlFor={`webhook-url-${ruleId}-${actIdx}`}
                                      className="text-[10px] font-medium text-slate-400"
                                    >
                                      Webhook Endpoint URL
                                    </label>
                                    <div className="flex items-center space-x-1">
                                      <input
                                        id={`webhook-url-${ruleId}-${actIdx}`}
                                        type="url"
                                        disabled={readOnly}
                                        value={(action as any).url || ''}
                                        onChange={(e) =>
                                          handleUpdateAction(rule.id || ruleId, actIdx, {
                                            ...action,
                                            url: e.target.value,
                                          })
                                        }
                                        placeholder="https://hooks.slack.com/services/..."
                                        data-testid={`webhook-url-input-${ruleId}-${actIdx}`}
                                        className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                                      />
                                      <TokenCatalogPopover
                                        settings={settings}
                                        iconOnly={true}
                                        onSelectToken={(tok) => {
                                          const current = (action as any).url || '';
                                          handleUpdateAction(rule.id || ruleId, actIdx, {
                                            ...action,
                                            url: current + tok,
                                          });
                                        }}
                                      />
                                    </div>
                                  </div>

                                  <div className="space-y-1">
                                    <label
                                      htmlFor={`webhook-secret-${ruleId}-${actIdx}`}
                                      className="text-[10px] font-medium text-slate-400"
                                    >
                                      HMAC Secret Token (optional)
                                    </label>
                                    <input
                                      id={`webhook-secret-${ruleId}-${actIdx}`}
                                      type="password"
                                      disabled={readOnly}
                                      value={(action as any).secret || ''}
                                      onChange={(e) =>
                                        handleUpdateAction(rule.id || ruleId, actIdx, {
                                          ...action,
                                          secret: e.target.value,
                                        })
                                      }
                                      placeholder="Secret for HMAC SHA-256 header"
                                      data-testid={`webhook-secret-input-${ruleId}-${actIdx}`}
                                      className="w-full px-2 py-1 bg-slate-950 border border-slate-700 rounded text-xs text-slate-200 font-mono focus:outline-none focus:border-emerald-500"
                                    />
                                  </div>

                                  <div className="flex items-center space-x-2 pt-4">
                                    <input
                                      id={`webhook-parent-ctx-${ruleId}-${actIdx}`}
                                      type="checkbox"
                                      disabled={readOnly}
                                      checked={(action as any).include_parent_context !== false}
                                      onChange={(e) =>
                                        handleUpdateAction(rule.id || ruleId, actIdx, {
                                          ...action,
                                          include_parent_context: e.target.checked,
                                        })
                                      }
                                      data-testid={`webhook-parent-ctx-toggle-${ruleId}-${actIdx}`}
                                      className="rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-0"
                                    />
                                    <label
                                      htmlFor={`webhook-parent-ctx-${ruleId}-${actIdx}`}
                                      className="text-xs text-slate-300 select-none cursor-pointer"
                                    >
                                      Include Parent Context in Payload
                                    </label>
                                  </div>
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
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
