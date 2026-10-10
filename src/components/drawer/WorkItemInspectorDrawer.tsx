'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  X,
  ExternalLink,
  Copy,
  Check,
  Calendar,
  User,
  Hash,
  GitBranch,
  Layers,
  Save,
  Tag,
  Sliders,
  CheckSquare,
} from 'lucide-react';
import {
  WorkItem,
  StatusDefinition,
  ProjectSettings,
  CustomMetadataFieldDefinition,
  CustomFieldType,
} from '@/types/tracker';
import { CopyableRefId } from '@/components/CopyableRefId';
import { normalizeAssignee } from '@/lib/assignee-utils';

export interface FieldVariance {
  delta: number;
  percentDiff: number | null;
  status: 'over' | 'under' | 'equal';
  targetKey: string;
  targetValue: number;
  actualValue: number;
}

export function formatFieldLabel(key: string): string {
  return key
    .replace(/[_-]+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function coerceBoolean(val: any): boolean {
  if (typeof val === 'boolean') return val;
  if (typeof val === 'string') {
    const s = val.trim().toLowerCase();
    return s === 'true' || s === '1' || s === 'yes';
  }
  if (typeof val === 'number') return val !== 0;
  return false;
}

export function inferFieldDefinitionFromKey(key: string): CustomMetadataFieldDefinition {
  const normalized = key.toLowerCase();
  let type: CustomFieldType = 'string';
  let options: string[] | undefined = undefined;

  if (
    normalized.endsWith('_date') ||
    normalized.startsWith('date_') ||
    normalized === 'date' ||
    normalized === 'due_date' ||
    normalized === 'target_date' ||
    normalized === 'completed_at'
  ) {
    type = 'date';
  } else if (
    normalized.startsWith('is_') ||
    normalized.startsWith('has_') ||
    normalized.startsWith('should_')
  ) {
    type = 'boolean';
  } else if (
    normalized === 'priority' ||
    normalized === 'severity' ||
    normalized === 'risk' ||
    normalized === 'source_type'
  ) {
    type = 'enum';
    if (normalized === 'priority') {
      options = ['High', 'Medium', 'Low', 'Critical', 'P0', 'P1', 'P2', 'P3', 'P4'];
    } else if (normalized === 'severity') {
      options = ['critical', 'high', 'medium', 'low'];
    } else if (normalized === 'risk') {
      options = ['high', 'medium', 'low'];
    } else if (normalized === 'source_type') {
      options = ['github', 'linear', 'jira', 'manual'];
    }
  } else if (
    normalized === 'story_points' ||
    normalized === 'points' ||
    normalized === 'complexity' ||
    normalized.includes('hours') ||
    normalized.includes('cost') ||
    normalized.includes('budget') ||
    normalized.includes('points') ||
    normalized.includes('score') ||
    normalized.includes('amount') ||
    normalized.includes('variance')
  ) {
    type = 'number';
  }

  return {
    key,
    label: formatFieldLabel(key),
    type,
    options,
  };
}

export function resolveCustomMetadataFields(
  projectSettings?: ProjectSettings | null,
  customMetadataFieldsProp?: CustomMetadataFieldDefinition[]
): CustomMetadataFieldDefinition[] {
  let fields: CustomMetadataFieldDefinition[] = [];
  if (customMetadataFieldsProp && customMetadataFieldsProp.length > 0) {
    fields = customMetadataFieldsProp;
  } else if (projectSettings?.custom_metadata_fields && projectSettings.custom_metadata_fields.length > 0) {
    fields = projectSettings.custom_metadata_fields;
  } else if (projectSettings?.custom_fields && projectSettings.custom_fields.length > 0) {
    fields = projectSettings.custom_fields.map((fieldKey) => inferFieldDefinitionFromKey(fieldKey));
  }

  return fields.map((field) => {
    if (!field.type) {
      const inferred = inferFieldDefinitionFromKey(field.key);
      return {
        ...field,
        type: inferred.type,
        options: field.options || inferred.options,
      };
    }
    return field;
  });
}

export function calculateFieldVariance(
  actualValue: number | null | undefined,
  targetValue: number | null | undefined,
  targetKey: string
): FieldVariance | null {
  if (
    actualValue === null ||
    actualValue === undefined ||
    actualValue === ('' as any) ||
    isNaN(Number(actualValue)) ||
    targetValue === null ||
    targetValue === undefined ||
    targetValue === ('' as any) ||
    isNaN(Number(targetValue))
  ) {
    return null;
  }

  const actual = Number(actualValue);
  const target = Number(targetValue);
  const rawDelta = actual - target;

  let status: 'over' | 'under' | 'equal' = 'equal';
  if (rawDelta > 0.00001) status = 'over';
  else if (rawDelta < -0.00001) status = 'under';
  else status = 'equal';

  const delta = Math.round(rawDelta * 10000) / 10000;

  let percentDiff: number | null = null;
  if (target !== 0) {
    percentDiff = Math.round((rawDelta / target) * 100);
  }

  return {
    delta,
    percentDiff,
    status,
    targetKey,
    targetValue: target,
    actualValue: actual,
  };
}

export function findTargetFieldKey(
  field: CustomMetadataFieldDefinition,
  allFields: CustomMetadataFieldDefinition[],
  metadata: Record<string, any>
): string | null {
  if (field.target_field) {
    return field.target_field;
  }

  const reversePair = allFields.find((f) => f.actual_field === field.key);
  if (reversePair) {
    return reversePair.key;
  }

  const key = field.key.toLowerCase();
  if (key.startsWith('actual_') || key.startsWith('actual')) {
    const suffix = key.replace(/^actual_?/, '');

    if (suffix === 'cost' || suffix === 'spend') {
      const budgetKey =
        allFields.find((f) => f.key.toLowerCase() === 'budget')?.key ||
        (metadata['budget'] !== undefined ? 'budget' : null);
      if (budgetKey) return budgetKey;
    }

    if (suffix === 'points') {
      const ptsKey =
        allFields.find(
          (f) => f.key.toLowerCase() === 'story_points' || f.key.toLowerCase() === 'points'
        )?.key ||
        (metadata['story_points'] !== undefined
          ? 'story_points'
          : metadata['points'] !== undefined
          ? 'points'
          : null);
      if (ptsKey) return ptsKey;
    }

    const candidates = [
      `planned_${suffix}`,
      `target_${suffix}`,
      `budget_${suffix}`,
      `estimated_${suffix}`,
      `estimate_${suffix}`,
      suffix,
    ];

    for (const cand of candidates) {
      const matchInFields = allFields.find((f) => f.key.toLowerCase() === cand.toLowerCase());
      if (matchInFields) return matchInFields.key;
      if (metadata[cand] !== undefined) return cand;
    }
  }

  return null;
}

export function VarianceBadge({
  variance,
  actualKey,
}: {
  variance: FieldVariance;
  actualKey?: string;
}) {
  const { delta, percentDiff, status } = variance;
  const sign = delta > 0 ? '+' : '';
  const percentText =
    percentDiff !== null ? ` (${percentDiff > 0 ? '+' : ''}${percentDiff}%)` : '';
  const text = `${sign}${delta}${percentText}`;

  const colorStyles =
    status === 'over'
      ? 'bg-amber-950/70 border-amber-800/60 text-amber-300'
      : status === 'under'
      ? 'bg-emerald-950/70 border-emerald-800/60 text-emerald-300'
      : 'bg-slate-800 border-slate-700 text-slate-300';

  return (
    <span
      data-testid={actualKey ? `variance-badge-${actualKey}` : `variance-badge-${variance.targetKey}`}
      data-target-field={variance.targetKey}
      className={`text-[10px] font-mono px-1.5 py-0.5 rounded border font-medium shrink-0 inline-flex items-center ${colorStyles}`}
      title={`Variance vs ${variance.targetKey}: ${text}`}
    >
      {text}
    </span>
  );
}

function getFieldIcon(field: CustomMetadataFieldDefinition) {
  switch (field.type) {
    case 'number':
      return <Hash className="w-3.5 h-3.5" />;
    case 'date':
      return <Calendar className="w-3.5 h-3.5" />;
    case 'boolean':
      return <CheckSquare className="w-3.5 h-3.5" />;
    case 'enum':
      return <Sliders className="w-3.5 h-3.5" />;
    case 'string':
    default:
      return <Tag className="w-3.5 h-3.5" />;
  }
}

export interface WorkItemInspectorDrawerProps {
  item: WorkItem | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateItem?: (
    id: string,
    updates: Partial<WorkItem> & { metadata?: Record<string, any> }
  ) => Promise<void> | void;
  onExpandFull?: (item: WorkItem) => void;
  availableStatuses?: StatusDefinition[];
  availableSprints?: string[];
  availableAssignees?: string[];
  allItems?: WorkItem[];
  isReadOnly?: boolean;
  tenantSlug: string;
  projectSlug?: string;
  projectSettings?: ProjectSettings | null;
  customMetadataFields?: CustomMetadataFieldDefinition[];
}

export function WorkItemInspectorDrawer({
  item,
  isOpen,
  onClose,
  onUpdateItem,
  onExpandFull,
  availableStatuses = [],
  availableSprints = [],
  availableAssignees = [],
  allItems = [],
  isReadOnly = false,
  tenantSlug,
  projectSlug,
  projectSettings,
  customMetadataFields,
}: WorkItemInspectorDrawerProps) {
  const [copiedLink, setCopiedLink] = useState(false);
  const [title, setTitle] = useState(item?.title || '');
  const [description, setDescription] = useState(item?.description || '');
  const [status, setStatus] = useState(item?.status || '');
  const [assignee, setAssignee] = useState(normalizeAssignee(item?.assignee) || '');
  const [points, setPoints] = useState<number | ''>(
    item?.metadata?.story_points ?? item?.metadata?.points ?? ''
  );
  const [sprint, setSprint] = useState(item?.metadata?.sprint || '');
  const [parentId, setParentId] = useState(item?.parent_id || '');
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const resolvedFields = useMemo(
    () => resolveCustomMetadataFields(projectSettings, customMetadataFields),
    [projectSettings, customMetadataFields]
  );
  const hasExplicitPointsField = useMemo(
    () => resolvedFields.some((f) => f.key === 'story_points' || f.key === 'points'),
    [resolvedFields]
  );
  const [localMeta, setLocalMeta] = useState<Record<string, any>>({});
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const latestMetadataRef = useRef<Record<string, any>>({});

  useEffect(() => {
    if (item) {
      setTitle(item.title || '');
      setDescription(item.description || '');
      setStatus(item.status || '');
      setAssignee(normalizeAssignee(item.assignee) || '');
      const pts = item.metadata?.story_points ?? item.metadata?.points;
      setPoints(pts !== undefined && pts !== null ? Number(pts) : '');
      setSprint(item.metadata?.sprint || '');
      setParentId(item.parent_id || '');
      setErrorMessage(null);
      const meta = item.metadata ? { ...item.metadata } : {};
      setLocalMeta(meta);
      latestMetadataRef.current = meta;
    }
  }, [item]);

  if (!isOpen || !item) {
    return null;
  }

  const handleCopyLink = async () => {
    try {
      const url = new URL(window.location.href);
      url.searchParams.set('item', item.external_ref_id || item.id);
      await navigator.clipboard.writeText(url.toString());
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2000);
    } catch {}
  };

  const handleFieldChange = async (
    updates: Partial<WorkItem> & { metadata?: Record<string, any> }
  ) => {
    if (isReadOnly || !onUpdateItem || !item) return;

    if (updates.metadata) {
      latestMetadataRef.current = {
        ...latestMetadataRef.current,
        ...updates.metadata,
      };
    }

    const payload = {
      ...updates,
      ...(updates.metadata ? { metadata: { ...latestMetadataRef.current } } : {}),
    };

    try {
      setIsSaving(true);
      setErrorMessage(null);
      await onUpdateItem(item.id, payload);
    } catch (err: any) {
      setErrorMessage(err.message || 'Failed to update field');
      setTitle(item.title || '');
      setDescription(item.description || '');
      setStatus(item.status || '');
      setAssignee(normalizeAssignee(item.assignee) || '');
      const pts = item.metadata?.story_points ?? item.metadata?.points;
      setPoints(pts !== undefined && pts !== null ? Number(pts) : '');
      setSprint(item.metadata?.sprint || '');
      setParentId(item.parent_id || '');
      const rollback = item.metadata ? { ...item.metadata } : {};
      setLocalMeta(rollback);
      latestMetadataRef.current = rollback;
    } finally {
      setIsSaving(false);
    }
  };

  const handleStatusChange = (newStatus: string) => {
    setStatus(newStatus);
    handleFieldChange({ status: newStatus });
  };

  const handleAssigneeChange = (newAssignee: string) => {
    const canonical = normalizeAssignee(newAssignee) || '';
    setAssignee(canonical);
    handleFieldChange({ assignee: canonical || null });
  };

  const handlePointsBlur = () => {
    const num = points === '' ? null : Number(points);
    const originalPoints = item.metadata?.story_points ?? item.metadata?.points;
    if (
      num ===
      (originalPoints !== undefined && originalPoints !== null ? Number(originalPoints) : null)
    ) {
      return;
    }
    const updatedMetadata = {
      ...(item.metadata || {}),
      ...localMeta,
      ...latestMetadataRef.current,
      story_points: num,
      points: num,
    };
    setLocalMeta(updatedMetadata);
    handleFieldChange({ metadata: updatedMetadata });
  };

  const handleCustomFieldChange = (key: string, value: any) => {
    setLocalMeta((prev) => ({ ...prev, [key]: value }));
  };

  const handleCustomFieldCommit = (key: string, value: any) => {
    const nextMeta = {
      ...(item?.metadata || {}),
      ...localMeta,
      ...latestMetadataRef.current,
      [key]: value,
    };
    if (key === 'story_points' || key === 'points') {
      nextMeta.story_points = value;
      nextMeta.points = value;
      setPoints(value !== null && value !== undefined && value !== '' ? Number(value) : '');
    }
    setLocalMeta(nextMeta);
    handleFieldChange({ metadata: nextMeta });
  };

  const handleSprintChange = (newSprint: string) => {
    setSprint(newSprint);
    const updatedMetadata = {
      ...(item.metadata || {}),
      ...localMeta,
      ...latestMetadataRef.current,
      sprint: newSprint || null,
    };
    setLocalMeta(updatedMetadata);
    handleFieldChange({ metadata: updatedMetadata });
  };

  const handleParentChange = (newParent: string) => {
    setParentId(newParent);
    handleFieldChange({ parent_id: newParent || null });
  };

  const handleDescriptionBlur = () => {
    if (description !== item.description) {
      handleFieldChange({ description });
    }
  };

  const handleTitleBlur = () => {
    if (title !== item.title && title.trim()) {
      handleFieldChange({ title: title.trim() });
    }
  };

  return (
    <div
      data-testid="work-item-inspector-drawer"
      className="flex flex-col h-full w-full bg-slate-900/95 text-slate-100 divide-y divide-slate-800"
    >
      {/* ── Header: Ref, Link, Full Page, Close ── */}
      <div className="flex items-center justify-between p-3.5 bg-slate-950/60 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <CopyableRefId
            id={item.external_ref_id || item.id}
            displayId={item.external_ref_id || item.id.slice(0, 8)}
            className="text-xs font-mono font-semibold text-emerald-400"
          />
          <span className="text-xs px-2 py-0.5 rounded uppercase tracking-wider bg-slate-800 text-slate-300 font-mono text-[10px]">
            {item.item_type}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Copy Link */}
          <button
            type="button"
            onClick={handleCopyLink}
            aria-label="Copy Link"
            title="Copy deep link to item"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            {copiedLink ? (
              <Check className="w-4 h-4 text-emerald-400" />
            ) : (
              <Copy className="w-4 h-4" />
            )}
          </button>

          {/* Full Page / Modal Expand */}
          {onExpandFull && (
            <button
              type="button"
              onClick={() => onExpandFull(item)}
              aria-label="Full Page Expand"
              title="Open full item dialog"
              className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
            </button>
          )}

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Inspector"
            title="Close drawer (Esc)"
            className="p-1.5 rounded-md text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors ml-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* ── Main Body: Scrollable properties & triage ── */}
      <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 space-y-4">
        {errorMessage && (
          <div
            data-testid="inspector-error-banner"
            className="p-2.5 rounded bg-red-950/60 border border-red-800/60 text-xs text-red-300 flex items-center justify-between"
          >
            <span>{errorMessage}</span>
            <button
              type="button"
              onClick={() => setErrorMessage(null)}
              className="ml-2 text-red-400 hover:text-red-200"
            >
              ✕
            </button>
          </div>
        )}

        {/* Title Input */}
        <div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={handleTitleBlur}
            disabled={isReadOnly}
            aria-label="Work Item Title"
            placeholder="Work item title..."
            className="w-full bg-transparent font-semibold text-base text-slate-100 hover:bg-slate-800/40 focus:bg-slate-800/60 focus:outline-hidden px-2 py-1 -ml-2 rounded border border-transparent focus:border-slate-700 transition-all"
          />
        </div>

        {/* Property Triage Grid */}
        <div className="bg-slate-950/40 rounded-lg border border-slate-800/80 p-3 space-y-2.5 text-xs">
          {/* Status Picker */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Layers className="w-3.5 h-3.5" />
              <span>Status</span>
            </span>
            <select
              value={status}
              onChange={(e) => handleStatusChange(e.target.value)}
              disabled={isReadOnly}
              aria-label="Status"
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-hidden focus:border-emerald-500"
            >
              {availableStatuses.length > 0 ? (
                availableStatuses.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))
              ) : (
                <>
                  <option value="not_started">Not Started</option>
                  <option value="in_progress">In Progress</option>
                  <option value="completed">Completed</option>
                </>
              )}
            </select>
          </div>

          {/* Assignee Select */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-400">
              <User className="w-3.5 h-3.5" />
              <span>Assignee</span>
            </span>
            <select
              value={normalizeAssignee(assignee) || ''}
              onChange={(e) => handleAssigneeChange(e.target.value)}
              disabled={isReadOnly}
              aria-label="Assignee"
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-hidden focus:border-emerald-500"
            >
              <option value="">Unassigned</option>
              {availableAssignees.map((a) => (
                <option key={a} value={normalizeAssignee(a) || a}>
                  {a}
                </option>
              ))}
            </select>
          </div>

          {/* Story Points (rendered whenever not defined as a separate custom schema property) */}
          {!hasExplicitPointsField && (
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Hash className="w-3.5 h-3.5" />
                <span>Story Points</span>
              </span>
              <input
                type="number"
                min="0"
                step="1"
                value={points}
                onChange={(e) =>
                  setPoints(e.target.value === '' ? '' : Number(e.target.value))
                }
                onBlur={handlePointsBlur}
                disabled={isReadOnly}
                aria-label="Story Points"
                placeholder="0"
                className="w-16 text-right bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-hidden focus:border-emerald-500 font-mono"
              />
            </div>
          )}

          {/* Sprint Select */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-400">
              <Calendar className="w-3.5 h-3.5" />
              <span>Sprint</span>
            </span>
            <select
              value={sprint}
              onChange={(e) => handleSprintChange(e.target.value)}
              disabled={isReadOnly}
              aria-label="Sprint"
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-hidden focus:border-emerald-500 max-w-[200px] truncate"
            >
              <option value="">No Sprint (Backlog)</option>
              {availableSprints.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>

          {/* Parent Item Select */}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-slate-400">
              <GitBranch className="w-3.5 h-3.5" />
              <span>Parent Item</span>
            </span>
            <select
              value={parentId}
              onChange={(e) => handleParentChange(e.target.value)}
              disabled={isReadOnly}
              aria-label="Parent Item"
              className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-hidden focus:border-emerald-500 max-w-[200px] truncate"
            >
              <option value="">None (Root Item)</option>
              {allItems
                .filter((i) => i.id !== item.id)
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.external_ref_id || p.id.slice(0, 6)}] {p.title}
                  </option>
                ))}
            </select>
          </div>

          {/* Dynamic Custom Fields from Project Schema Settings */}
          {resolvedFields.length > 0 && (
            <div className="pt-2.5 border-t border-slate-800/80 space-y-2.5" data-testid="dynamic-custom-fields-section">
              <div className="flex items-center justify-between text-[11px] font-medium text-slate-400">
                <span className="uppercase tracking-wider font-mono text-[10px]">Custom Properties</span>
                <span className="text-[10px] text-slate-500 font-mono">{resolvedFields.length}</span>
              </div>
              {resolvedFields.map((field) => {
                const fieldLabel = field.label || formatFieldLabel(field.key);
                const val = localMeta[field.key];

                // Number field & variance calculation
                if (field.type === 'number') {
                  const targetKey = findTargetFieldKey(field, resolvedFields, localMeta);
                  let variance: FieldVariance | null = null;
                  if (targetKey) {
                    const targetVal = localMeta[targetKey] ?? item.metadata?.[targetKey];
                    const actualVal = val ?? item.metadata?.[field.key];
                    variance = calculateFieldVariance(actualVal, targetVal, targetKey);
                  }

                  return (
                    <div key={field.key} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-slate-400 shrink-0">
                        {getFieldIcon(field)}
                        <span>{fieldLabel}</span>
                      </span>
                      <div className="flex items-center gap-1.5 justify-end">
                        {variance && <VarianceBadge variance={variance} actualKey={field.key} />}
                        <input
                          type="number"
                          step="any"
                          value={val !== undefined && val !== null ? val : ''}
                          onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                          onBlur={() => {
                            const raw = localMeta[field.key];
                            const original = item.metadata?.[field.key];
                            const num =
                              raw === '' || raw === undefined || raw === null ? null : Number(raw);
                            if (num === (original !== undefined && original !== null ? Number(original) : null)) {
                              return;
                            }
                            handleCustomFieldCommit(field.key, num);
                          }}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              (e.target as HTMLInputElement).blur();
                            }
                          }}
                          disabled={isReadOnly}
                          aria-label={fieldLabel}
                          data-testid={`custom-field-${field.key}`}
                          placeholder={field.placeholder || '0'}
                          className="w-16 text-right bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-hidden focus:border-emerald-500 font-mono"
                        />
                        {field.unit && (
                          <span className="text-[10px] text-slate-400 font-mono select-none">
                            {field.unit}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                }

                // Boolean field
                if (field.type === 'boolean') {
                  const boolChecked = coerceBoolean(val);
                  return (
                    <div key={field.key} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        {getFieldIcon(field)}
                        <span>{fieldLabel}</span>
                      </span>
                      <label className="relative inline-flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={boolChecked}
                          onChange={(e) => {
                            handleCustomFieldChange(field.key, e.target.checked);
                            handleCustomFieldCommit(field.key, e.target.checked);
                          }}
                          disabled={isReadOnly}
                          aria-label={fieldLabel}
                          data-testid={`custom-field-${field.key}`}
                          className="rounded bg-slate-800 border-slate-700 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-slate-900 h-4 w-4 cursor-pointer"
                        />
                        <span className="ml-2 text-xs text-slate-300 font-mono">
                          {boolChecked ? 'Yes' : 'No'}
                        </span>
                      </label>
                    </div>
                  );
                }

                // Enum field
                if (field.type === 'enum') {
                  const options = field.options || [];
                  return (
                    <div key={field.key} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        {getFieldIcon(field)}
                        <span>{fieldLabel}</span>
                      </span>
                      <select
                        value={val !== undefined && val !== null ? String(val) : ''}
                        onChange={(e) => {
                          const nextVal = e.target.value;
                          handleCustomFieldChange(field.key, nextVal);
                          handleCustomFieldCommit(field.key, nextVal || null);
                        }}
                        disabled={isReadOnly}
                        aria-label={fieldLabel}
                        data-testid={`custom-field-${field.key}`}
                        className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-hidden focus:border-emerald-500 max-w-[180px] truncate"
                      >
                        <option value="">Select...</option>
                        {options.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                        {val && !options.includes(String(val)) && (
                          <option value={String(val)}>{String(val)}</option>
                        )}
                      </select>
                    </div>
                  );
                }

                // Date field
                if (field.type === 'date') {
                  const dateStr = typeof val === 'string' ? val.split('T')[0] : '';
                  return (
                    <div key={field.key} className="flex items-center justify-between gap-2">
                      <span className="flex items-center gap-1.5 text-slate-400">
                        {getFieldIcon(field)}
                        <span>{fieldLabel}</span>
                      </span>
                      <input
                        type="date"
                        value={dateStr}
                        onChange={(e) => {
                          const nextVal = e.target.value;
                          handleCustomFieldChange(field.key, nextVal);
                          handleCustomFieldCommit(field.key, nextVal || null);
                        }}
                        disabled={isReadOnly}
                        aria-label={fieldLabel}
                        data-testid={`custom-field-${field.key}`}
                        className="bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-hidden focus:border-emerald-500 font-mono text-slate-200"
                      />
                    </div>
                  );
                }

                // String field (default)
                return (
                  <div key={field.key} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5 text-slate-400">
                      {getFieldIcon(field)}
                      <span>{fieldLabel}</span>
                    </span>
                    <input
                      type="text"
                      value={val !== undefined && val !== null ? String(val) : ''}
                      onChange={(e) => handleCustomFieldChange(field.key, e.target.value)}
                      onBlur={() => {
                        const raw = localMeta[field.key];
                        const original = item.metadata?.[field.key];
                        let str: any =
                          raw === '' || raw === undefined || raw === null
                            ? null
                            : String(raw).trim();
                        if (typeof original === 'number' && str !== null && !isNaN(Number(str))) {
                          str = Number(str);
                        }
                        if (str === (original ?? null)) {
                          return;
                        }
                        handleCustomFieldCommit(field.key, str);
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      disabled={isReadOnly}
                      aria-label={fieldLabel}
                      data-testid={`custom-field-${field.key}`}
                      placeholder={field.placeholder || `Enter ${fieldLabel.toLowerCase()}...`}
                      className="w-32 text-right bg-slate-800 border border-slate-700 text-slate-200 rounded px-2 py-1 text-xs focus:outline-hidden focus:border-emerald-500 truncate"
                    />
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Description Markdown Editor */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-400 flex items-center justify-between">
            <span>Description</span>
            {isSaving && (
              <span className="text-[10px] text-amber-400 animate-pulse">
                Saving...
              </span>
            )}
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            onBlur={handleDescriptionBlur}
            disabled={isReadOnly}
            aria-label="Description"
            rows={8}
            placeholder="Add detailed markdown description..."
            className="w-full bg-slate-950/60 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-hidden focus:border-slate-700 font-sans leading-relaxed custom-scrollbar resize-y"
          />
        </div>
      </div>
    </div>
  );
}
