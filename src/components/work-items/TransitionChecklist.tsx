'use client';

import React, { useMemo } from 'react';
import {
  CheckCircle2,
  AlertCircle,
  ShieldAlert,
  MinusCircle,
  Sliders,
  Check,
} from 'lucide-react';
import type {
  WorkItem,
  ProjectSettings,
  TransitionGuard,
  TransitionGuardCondition,
  CustomFieldDefinition,
} from '@/types/tracker';
import {
  evaluateGuardWhenClause,
  resolveGuardTargetStatus,
  matchesCondition,
  resolveFieldValue,
  isBlankValue,
} from '@/lib/automation/guardEvaluator';
import { normalizeCustomFields } from '@/types/tracker';

export interface TransitionChecklistProps {
  item: Partial<WorkItem> | Record<string, any> | null | undefined;
  projectSettings?: ProjectSettings | null;
  targetStatus?: string;
  onUpdateField?: (fieldKey: string, value: any) => void;
  readOnly?: boolean;
  className?: string;
}

/**
 * Schema-introspecting checklist that dynamically inspects active project TransitionGuards
 * and custom fields. Evaluates live 'when' applicability rules, displays exemption states,
 * shows real-time pass/fail condition indicators, and provides contextual metadata input controls.
 * Zero domain-specific terms are hardcoded.
 */
export function TransitionChecklist({
  item,
  projectSettings,
  targetStatus,
  onUpdateField,
  readOnly = false,
  className = '',
}: TransitionChecklistProps) {
  const currentItem = item || {};

  const customFieldsMap = useMemo<Map<string, CustomFieldDefinition>>(() => {
    const map = new Map<string, CustomFieldDefinition>();
    if (projectSettings?.custom_fields) {
      normalizeCustomFields(projectSettings.custom_fields).forEach((cf) => {
        if (cf.key) map.set(cf.key, cf);
      });
    }
    if (projectSettings?.custom_metadata_fields) {
      projectSettings.custom_metadata_fields.forEach((cf: any) => {
        if (cf && cf.key && !map.has(cf.key)) {
          map.set(cf.key, {
            key: cf.key,
            label: cf.label || cf.key,
            type: (cf.type as any) || 'string',
            options: cf.options,
            unit: cf.unit,
          });
        }
      });
    }
    return map;
  }, [projectSettings?.custom_fields, projectSettings?.custom_metadata_fields]);

  const activeGuards = useMemo<TransitionGuard[]>(() => {
    if (!projectSettings?.transition_guards || !Array.isArray(projectSettings.transition_guards)) {
      return [];
    }

    return projectSettings.transition_guards.filter((guard) => {
      if (!guard || guard.enabled === false) return false;
      if (targetStatus) {
        const resolvedTarget = resolveGuardTargetStatus(guard.target_status, projectSettings);
        return resolvedTarget === targetStatus;
      }
      return true;
    });
  }, [projectSettings, targetStatus]);

  if (!projectSettings || activeGuards.length === 0) {
    return null;
  }

  const statuses = Array.isArray(projectSettings?.statuses) ? projectSettings.statuses : [];

  return (
    <div
      data-testid="transition-checklist-panel"
      className={`rounded-xl border border-slate-800 bg-slate-950/80 p-3.5 space-y-3.5 ${className}`}
    >
      <div className="flex items-center justify-between border-b border-slate-900 pb-2">
        <div className="flex items-center space-x-2">
          <ShieldAlert className="w-4 h-4 text-emerald-400 shrink-0" />
          <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
            Transition Verification Checklist
          </h4>
        </div>
        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-900 text-slate-400 border border-slate-800">
          {activeGuards.length} {activeGuards.length === 1 ? 'guard' : 'guards'}
        </span>
      </div>

      <div className="space-y-3">
        {activeGuards.map((guard, guardIdx) => {
          const resolvedTarget = resolveGuardTargetStatus(guard.target_status, projectSettings);
          const targetStatusDef = statuses.find((s) => s.id === resolvedTarget);
          const statusLabel = targetStatusDef?.label || resolvedTarget;

          const hasWhen = Boolean(guard.when && Array.isArray(guard.when) && guard.when.length > 0);
          const isSubject = evaluateGuardWhenClause(guard, currentItem);

          const conditions = Array.isArray(guard.conditions) ? guard.conditions : [];

          return (
            <div
              key={guard.id || guardIdx}
              data-testid={`guard-checklist-${guard.id || guardIdx}`}
              className={`rounded-lg border p-3 space-y-2.5 transition-all ${
                !isSubject
                  ? 'border-slate-850 bg-slate-900/30 opacity-75'
                  : 'border-slate-800/90 bg-slate-900/50'
              }`}
            >
              {/* Guard Header with Exemption Badge */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center space-x-2 min-w-0">
                  <span className="text-xs font-semibold text-slate-200 truncate">
                    {guard.name || `Transition Rule (${statusLabel})`}
                  </span>
                  <span
                    data-testid={`guard-target-status-${guard.id}`}
                    className="text-[10px] font-medium px-2 py-0.5 rounded-full border shrink-0"
                    style={{
                      backgroundColor: targetStatusDef?.color ? `${targetStatusDef.color}15` : '#33415520',
                      borderColor: targetStatusDef?.color ? `${targetStatusDef.color}40` : '#47556940',
                      color: targetStatusDef?.color || '#94a3b8',
                    }}
                  >
                    → {statusLabel}
                  </span>
                </div>

                {/* Applicability / Exemption Flag */}
                {hasWhen && (
                  <div className="shrink-0">
                    {isSubject ? (
                      <span
                        data-testid={`guard-exemption-badge-${guard.id}`}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/60 border border-emerald-500/40 text-emerald-300"
                      >
                        Subject to Rule
                      </span>
                    ) : (
                      <span
                        data-testid={`guard-exemption-badge-${guard.id}`}
                        className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-medium bg-slate-800 text-slate-400 border border-slate-700"
                        title="Condition filters exempt this item from requirements"
                      >
                        Exempt from Rule
                      </span>
                    )}
                  </div>
                )}
              </div>

              {/* Requirement Items */}
              <ul className="space-y-2">
                {conditions.map((cond, condIdx) => {
                  const isMet = matchesCondition(currentItem, cond);
                  const fieldKey = cond.field
                    .trim()
                    .replace(/^item\./, '')
                    .replace(/^metadata\./, '');
                  const currentVal = resolveFieldValue(currentItem, cond.field);
                  const cfDef = customFieldsMap.get(fieldKey);

                  const isBooleanType =
                    cfDef?.type === 'boolean' ||
                    typeof cond.value === 'boolean' ||
                    fieldKey.startsWith('is_') ||
                    fieldKey.startsWith('has_') ||
                    fieldKey.startsWith('requires_');

                  const isNumberType =
                    cfDef?.type === 'number' ||
                    typeof cond.value === 'number' ||
                    ['$gt', '$gte', '$lt', '$lte'].includes(cond.operator);

                  const isEnumType =
                    (cfDef?.type === 'enum' || cond.operator === '$in') &&
                    Array.isArray(cfDef?.options || cond.value);

                  const enumOptions = cfDef?.options || (Array.isArray(cond.value) ? cond.value : []);

                  return (
                    <li
                      key={condIdx}
                      data-testid={`checklist-condition-${fieldKey}`}
                      className={`p-2.5 rounded-lg border text-xs space-y-1.5 transition-colors ${
                        !isSubject
                          ? 'border-slate-850 bg-slate-950/40 text-slate-500'
                          : isMet
                          ? 'border-emerald-900/40 bg-emerald-950/20 text-slate-200'
                          : 'border-amber-900/40 bg-amber-950/20 text-amber-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-start space-x-2">
                          <div className="mt-0.5 shrink-0">
                            {!isSubject ? (
                              <MinusCircle
                                data-testid={`checklist-item-exempt-${fieldKey}`}
                                className="w-3.5 h-3.5 text-slate-600"
                              />
                            ) : isMet ? (
                              <CheckCircle2
                                data-testid={`checklist-item-met-${fieldKey}`}
                                className="w-3.5 h-3.5 text-emerald-400"
                              />
                            ) : (
                              <AlertCircle
                                data-testid={`checklist-item-unmet-${fieldKey}`}
                                className="w-3.5 h-3.5 text-amber-400"
                              />
                            )}
                          </div>
                          <div>
                            <p
                              className={`text-xs font-medium leading-snug ${
                                !isSubject ? 'text-slate-500 line-through' : isMet ? 'text-slate-200' : 'text-amber-100 font-semibold'
                              }`}
                            >
                              {cond.message || `${fieldKey} requirement not met`}
                            </p>
                            <span className="text-[10px] font-mono opacity-70">
                              Field: {cond.field}
                            </span>
                          </div>
                        </div>

                        {/* Status Label */}
                        <div className="shrink-0 text-[10px] font-mono">
                          {!isSubject ? (
                            <span className="text-slate-500">Exempt</span>
                          ) : isMet ? (
                            <span className="text-emerald-400 font-semibold flex items-center space-x-0.5">
                              <Check className="w-3 h-3" />
                              <span>Satisfied</span>
                            </span>
                          ) : (
                            <span className="text-amber-400 font-semibold">Required</span>
                          )}
                        </div>
                      </div>

                      {/* Inline Dynamic Input Control (when editable and applicable) */}
                      {onUpdateField && !readOnly && isSubject && (
                        <div className="pt-1 mt-1 border-t border-slate-900/60 flex items-center gap-2">
                          {isBooleanType ? (
                            <label className="inline-flex items-center space-x-2 text-xs text-slate-300 cursor-pointer select-none">
                              <input
                                type="checkbox"
                                checked={Boolean(currentVal)}
                                onChange={(e) => onUpdateField(fieldKey, e.target.checked)}
                                data-testid={`checklist-input-${fieldKey}`}
                                className="w-4 h-4 rounded bg-slate-900 border-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900"
                              />
                              <span className="text-[11px] font-medium text-slate-300">
                                {cfDef?.label || fieldKey} (toggle to satisfy)
                              </span>
                            </label>
                          ) : isEnumType ? (
                            <select
                              value={currentVal !== undefined && currentVal !== null ? String(currentVal) : ''}
                              onChange={(e) => onUpdateField(fieldKey, e.target.value)}
                              data-testid={`checklist-input-${fieldKey}`}
                              className="w-full px-2 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 focus:outline-none focus:border-emerald-500"
                            >
                              <option value="">Select {cfDef?.label || fieldKey}...</option>
                              {enumOptions.map((opt: any) => {
                                const val = typeof opt === 'string' ? opt : opt?.value || opt?.key;
                                const lbl = typeof opt === 'string' ? opt : opt?.label || opt?.name || val;
                                return (
                                  <option key={val} value={val}>
                                    {lbl}
                                  </option>
                                );
                              })}
                            </select>
                          ) : isNumberType ? (
                            <input
                              type="number"
                              value={currentVal !== undefined && currentVal !== null ? String(currentVal) : ''}
                              onChange={(e) =>
                                onUpdateField(
                                  fieldKey,
                                  e.target.value === '' ? null : Number(e.target.value)
                                )
                              }
                              placeholder={`Enter numeric value for ${cfDef?.label || fieldKey}...`}
                              data-testid={`checklist-input-${fieldKey}`}
                              className="w-full px-2.5 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 placeholder-slate-600 font-mono focus:outline-none focus:border-emerald-500"
                            />
                          ) : (
                            <input
                              type="text"
                              value={currentVal !== undefined && currentVal !== null ? String(currentVal) : ''}
                              onChange={(e) => onUpdateField(fieldKey, e.target.value)}
                              placeholder={`Provide ${cfDef?.label || fieldKey}...`}
                              data-testid={`checklist-input-${fieldKey}`}
                              className="w-full px-2.5 py-1 bg-slate-900 border border-slate-800 rounded text-xs text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500"
                            />
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
