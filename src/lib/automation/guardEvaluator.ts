import type { ProjectSettings, TransitionGuard, TransitionGuardCondition } from '@/types/tracker';
import { matchesCondition, resolveFieldValue, isBlankValue } from './predicateEvaluator';

export interface TransitionGuardValidationResult {
  allowed: boolean;
  errors: string[];
}

export interface UnmetGuardRequirement {
  guardId: string;
  guardName?: string;
  targetStatus: string;
  targetStatusLabel: string;
  field: string;
  fieldKey: string;
  operator: string;
  message: string;
}

/**
 * Unwraps projectSettings in case a caller passes `{ settings: ProjectSettings }` or `TransitionGuard[]`.
 */
function normalizeSettingsInput(
  projectSettings?: ProjectSettings | { settings?: ProjectSettings } | TransitionGuard[] | null
): { settings: Partial<ProjectSettings>; guards: TransitionGuard[] } {
  if (!projectSettings) {
    return { settings: {}, guards: [] };
  }
  if (Array.isArray(projectSettings)) {
    return { settings: { transition_guards: projectSettings }, guards: projectSettings };
  }
  if (
    typeof projectSettings === 'object' &&
    'settings' in projectSettings &&
    projectSettings.settings &&
    typeof projectSettings.settings === 'object' &&
    !('transition_guards' in projectSettings)
  ) {
    const unwrapped = projectSettings.settings as Partial<ProjectSettings>;
    return {
      settings: unwrapped,
      guards: Array.isArray(unwrapped.transition_guards) ? unwrapped.transition_guards : [],
    };
  }
  const settingsObj = projectSettings as Partial<ProjectSettings>;
  return {
    settings: settingsObj,
    guards: Array.isArray(settingsObj.transition_guards) ? settingsObj.transition_guards : [],
  };
}

/**
 * Resolves mustache tokens in `target_status` (e.g., `{{settings.workflow.review_status}}`)
 * against the project's settings object.
 */
export function resolveGuardTargetStatus(
  targetStatus: string,
  projectSettings?: ProjectSettings | Record<string, any> | null
): string {
  if (!targetStatus || typeof targetStatus !== 'string') return '';
  const trimmed = targetStatus.trim();
  if (!trimmed.includes('{{')) return trimmed;

  const { settings } = normalizeSettingsInput(projectSettings as any);

  return trimmed.replace(/\{\{\s*([^}]+?)\s*\}\}/g, (_match, rawPath: string) => {
    let path = rawPath.trim();
    if (path.startsWith('settings.')) {
      path = path.slice('settings.'.length);
    }

    const parts = path.split('.');
    let current: any = settings;
    for (const part of parts) {
      if (current === null || current === undefined || typeof current !== 'object') {
        current = undefined;
        break;
      }
      current = current[part];
    }

    if (current !== undefined && current !== null && String(current).trim() !== '') {
      return String(current).trim();
    }

    // Fallback for common workflow status tokens when not explicitly nested under settings.workflow
    const lastSegment = parts[parts.length - 1];
    if (lastSegment && settings && typeof settings === 'object' && lastSegment in settings) {
      const topVal = (settings as any)[lastSegment];
      if (typeof topVal === 'string' && topVal.trim() !== '') {
        return topVal.trim();
      }
    }

    if (path === 'workflow.review_status') {
      const statuses = Array.isArray(settings?.statuses) ? settings.statuses : [];
      const reviewStatus = statuses.find((s: any) =>
        ['in_review', 'review', 'code_review', 'peer_review'].includes(String(s?.id || '').toLowerCase())
      );
      if (reviewStatus?.id) return reviewStatus.id;
      return 'in_review';
    }

    return '';
  });
}

/**
 * Merges an item with optional updates / metadata patches for guard evaluation.
 */
export function mergeItemStateForGuard(
  item: Record<string, any> | null | undefined,
  newStatus: string,
  patchOrMetadata?: Record<string, any> | null
): Record<string, any> {
  const baseItem = item && typeof item === 'object' ? item : {};
  const baseMetadata =
    baseItem.metadata && typeof baseItem.metadata === 'object' ? baseItem.metadata : {};

  if (!patchOrMetadata || typeof patchOrMetadata !== 'object') {
    return {
      ...baseItem,
      status: newStatus,
      metadata: { ...baseMetadata },
    };
  }

  const hasExplicitMetadataField =
    'metadata' in patchOrMetadata &&
    patchOrMetadata.metadata !== undefined &&
    typeof patchOrMetadata.metadata === 'object' &&
    patchOrMetadata.metadata !== null;

  const mergedMetadata = hasExplicitMetadataField
    ? { ...baseMetadata, ...patchOrMetadata.metadata }
    : { ...baseMetadata, ...patchOrMetadata };

  return {
    ...baseItem,
    ...(hasExplicitMetadataField ? patchOrMetadata : {}),
    status: newStatus,
    metadata: mergedMetadata,
  };
}

/**
 * Evaluates all active TransitionGuards configured for `newStatus` against `item`.
 * Returns `{ allowed: true, errors: [] }` when all conditions pass, or
 * `{ allowed: false, errors: string[] }` when one or more conditions fail.
 */
export function validateTransitionGuards(
  item: Record<string, any> | null | undefined,
  newStatus: string,
  projectSettings?: ProjectSettings | { settings?: ProjectSettings } | TransitionGuard[] | null,
  patchOrMetadata?: Record<string, any> | null
): TransitionGuardValidationResult {
  if (!newStatus || typeof newStatus !== 'string') {
    return { allowed: true, errors: [] };
  }

  const { settings, guards } = normalizeSettingsInput(projectSettings);
  if (!guards || guards.length === 0) {
    return { allowed: true, errors: [] };
  }

  const normalizedTarget = newStatus.trim();
  const candidateItem = mergeItemStateForGuard(item, normalizedTarget, patchOrMetadata);
  const errors: string[] = [];

  for (const guard of guards) {
    if (!guard || typeof guard !== 'object') continue;
    if (guard.enabled === false) continue;

    const resolvedTarget = resolveGuardTargetStatus(guard.target_status, settings);
    if (!resolvedTarget || resolvedTarget !== normalizedTarget) {
      continue;
    }

    const conditions: TransitionGuardCondition[] = Array.isArray(guard.conditions)
      ? guard.conditions
      : [];

    for (const condition of conditions) {
      if (!condition || typeof condition !== 'object' || !condition.field) continue;
      const passed = matchesCondition(candidateItem, condition);
      if (!passed) {
        const message =
          condition.message && String(condition.message).trim().length > 0
            ? String(condition.message).trim()
            : `Missing or invalid required field: ${condition.field}`;
        if (!errors.includes(message)) {
          errors.push(message);
        }
      }
    }
  }

  return {
    allowed: errors.length === 0,
    errors,
  };
}

/**
 * Returns unmet transition guard requirements for an item across all active guards
 * (or filtered to a specific targetStatus). Used by detail modals and drawers to render
 * proactive warning indicators when required transition fields are blank.
 */
export function getUnmetTransitionGuards(
  item: Record<string, any> | null | undefined,
  projectSettings?: ProjectSettings | { settings?: ProjectSettings } | null,
  targetStatusFilter?: string
): UnmetGuardRequirement[] {
  const { settings, guards } = normalizeSettingsInput(projectSettings);
  if (!guards || guards.length === 0 || !item) return [];

  const statuses = Array.isArray(settings.statuses) ? settings.statuses : [];
  const unmet: UnmetGuardRequirement[] = [];

  for (const guard of guards) {
    if (!guard || typeof guard !== 'object' || guard.enabled === false) continue;

    const resolvedTarget = resolveGuardTargetStatus(guard.target_status, settings);
    if (!resolvedTarget) continue;
    if (targetStatusFilter && resolvedTarget !== targetStatusFilter) continue;

    const statusDef = statuses.find((s: any) => s?.id === resolvedTarget);
    const targetStatusLabel = statusDef?.label || resolvedTarget;

    const conditions = Array.isArray(guard.conditions) ? guard.conditions : [];
    for (const condition of conditions) {
      if (!condition || typeof condition !== 'object' || !condition.field) continue;
      if (!matchesCondition(item, condition)) {
        const fieldKey = condition.field
          .trim()
          .replace(/^item\./, '')
          .replace(/^metadata\./, '');
        unmet.push({
          guardId: guard.id || `guard-${resolvedTarget}`,
          guardName: guard.name,
          targetStatus: resolvedTarget,
          targetStatusLabel,
          field: condition.field,
          fieldKey,
          operator: condition.operator,
          message:
            condition.message && String(condition.message).trim().length > 0
              ? String(condition.message).trim()
              : `${fieldKey} is required for ${targetStatusLabel}`,
        });
      }
    }
  }

  return unmet;
}

export { matchesCondition, resolveFieldValue, isBlankValue };
