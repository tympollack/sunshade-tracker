import { useState, useCallback, useMemo } from 'react';
import { ProjectSettings, HierarchyLevel, StatusDefinition } from '@/types/tracker';
import { getDefaultLevelHex } from '@/lib/hierarchy-colors';

export const HexColorRegex = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

export const DEFAULT_PROJECT_SETTINGS: ProjectSettings = {
  schema_version: '1.0',
  hierarchy: [
    { type: 'project', label: 'Project', level: 1, allowed_parents: [], color: '#c084fc' },
    { type: 'epic', label: 'Epic', level: 2, allowed_parents: ['project'], color: '#38bdf8' },
    { type: 'story', label: 'Story', level: 3, allowed_parents: ['epic'], color: '#34d399' },
    { type: 'task', label: 'Task', level: 4, allowed_parents: ['story', 'epic'], color: '#fbbf24' },
  ],
  statuses: [
    { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
    { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
    { id: 'planned', label: 'Planned', color: '#a855f7', order: 3 },
    { id: 'complete', label: 'Complete', color: '#22c55e', order: 4, is_completed: true },
  ],
  custom_fields: ['priority', 'complexity', 'timeline', 'commit_hash', 'source_type'],
};

/**
 * Normalizes any raw, potentially malformed or partial project settings object.
 * Guarantees that:
 * 1. hierarchy and statuses arrays are valid and non-empty.
 * 2. aliases (e.g. name/key for type or id) are resolved.
 * 3. baseline statuses ('not_started' and 'complete') always exist.
 * 4. all types and ids are defined strings, preventing `TypeError: toLowerCase on undefined`.
 */
export function normalizeProjectSettings(rawSettings: unknown): ProjectSettings {
  if (!rawSettings || typeof rawSettings !== 'object' || Array.isArray(rawSettings)) {
    return JSON.parse(JSON.stringify(DEFAULT_PROJECT_SETTINGS));
  }

  const raw = rawSettings as Record<string, any>;
  const baseClone: ProjectSettings = JSON.parse(JSON.stringify(DEFAULT_PROJECT_SETTINGS));

  // 1. Schema Version
  const schema_version =
    typeof raw.schema_version === 'string' && raw.schema_version.trim()
      ? raw.schema_version.trim()
      : '1.0';

  // 2. Hierarchy Normalization
  let normalizedHierarchy: HierarchyLevel[] = [];
  if (Array.isArray(raw.hierarchy) && raw.hierarchy.length > 0) {
    normalizedHierarchy = raw.hierarchy
      .filter((h) => h && typeof h === 'object')
      .map((h: any, idx: number): HierarchyLevel => {
        const typeRaw = h.type ?? h.key ?? h.id ?? h.name;
        const type =
          typeof typeRaw === 'string' && typeRaw.trim()
            ? typeRaw.trim()
            : `level_${idx + 1}`;

        const labelRaw = h.label ?? h.name ?? h.type;
        const label =
          typeof labelRaw === 'string' && labelRaw.trim()
            ? labelRaw.trim()
            : type.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

        const level =
          typeof h.level === 'number' && !isNaN(h.level) && h.level > 0
            ? Math.floor(h.level)
            : idx + 1;

        const allowed_parents = Array.isArray(h.allowed_parents)
          ? h.allowed_parents
              .filter((p: any) => typeof p === 'string' && p.trim())
              .map((p: string) => p.trim())
          : [];

        const color =
          typeof h.color === 'string' && HexColorRegex.test(h.color.trim())
            ? h.color.trim()
            : getDefaultLevelHex(level);

        return {
          type,
          label,
          level,
          allowed_parents,
          color,
        };
      });
  }

  if (normalizedHierarchy.length === 0) {
    normalizedHierarchy = baseClone.hierarchy;
  }

  // 3. Statuses Normalization
  let normalizedStatuses: StatusDefinition[] = [];
  if (Array.isArray(raw.statuses) && raw.statuses.length > 0) {
    normalizedStatuses = raw.statuses
      .filter((s) => s && typeof s === 'object')
      .map((s: any, idx: number): StatusDefinition => {
        const idRaw = s.id ?? s.key ?? s.status ?? s.name;
        const id =
          typeof idRaw === 'string' && idRaw.trim()
            ? idRaw.trim()
            : `status_${idx + 1}`;

        const labelRaw = s.label ?? s.name ?? s.id;
        const label =
          typeof labelRaw === 'string' && labelRaw.trim()
            ? labelRaw.trim()
            : id.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());

        const color =
          typeof s.color === 'string' && HexColorRegex.test(s.color.trim())
            ? s.color.trim()
            : '#94a3b8';

        const order =
          typeof s.order === 'number' && !isNaN(s.order)
            ? Math.floor(s.order)
            : idx + 1;

        const is_completed =
          typeof s.is_completed === 'boolean'
            ? s.is_completed
            : id === 'complete' || id === 'done' || id === 'closed';

        return {
          id,
          label,
          color,
          order,
          ...(is_completed ? { is_completed: true } : {}),
        };
      });
  }

  if (normalizedStatuses.length === 0) {
    normalizedStatuses = baseClone.statuses;
  }

  // 4. Baseline Status Guard: ensure 'not_started' and 'complete' exist
  const hasNotStarted = normalizedStatuses.some(
    (s) => s.id.toLowerCase() === 'not_started'
  );
  if (!hasNotStarted) {
    const minOrder = normalizedStatuses.reduce(
      (min, s) => (s.order < min ? s.order : min),
      normalizedStatuses[0]?.order ?? 1
    );
    normalizedStatuses.unshift({
      id: 'not_started',
      label: 'Not Started',
      color: '#94a3b8',
      order: Math.max(1, minOrder - 1),
    });
  }

  const hasComplete = normalizedStatuses.some(
    (s) => s.id.toLowerCase() === 'complete' || s.is_completed
  );
  if (!hasComplete) {
    const maxOrder = normalizedStatuses.reduce(
      (max, s) => (s.order > max ? s.order : max),
      normalizedStatuses[0]?.order ?? 1
    );
    normalizedStatuses.push({
      id: 'complete',
      label: 'Complete',
      color: '#22c55e',
      order: maxOrder + 1,
      is_completed: true,
    });
  }

  // 5. Custom Fields
  let normalizedCustomFields: string[] = [];
  if (Array.isArray(raw.custom_fields)) {
    normalizedCustomFields = raw.custom_fields
      .map((f: any) => {
        if (typeof f === 'string') return f.trim();
        if (f && typeof f === 'object' && typeof f.key === 'string') return f.key.trim();
        return '';
      })
      .filter(Boolean);
  } else {
    normalizedCustomFields = baseClone.custom_fields;
  }

  return {
    ...raw,
    schema_version,
    hierarchy: normalizedHierarchy,
    statuses: normalizedStatuses,
    custom_fields: normalizedCustomFields,
  };
}

export interface UseProjectSettingsOptions {
  initialSettings?: unknown;
}

export function useProjectSettings(options: UseProjectSettingsOptions = {}) {
  const [settings, setSettingsState] = useState<ProjectSettings>(() =>
    normalizeProjectSettings(options.initialSettings)
  );

  const setSettings = useCallback((newSettings: unknown) => {
    setSettingsState(normalizeProjectSettings(newSettings));
  }, []);

  const resetToDefault = useCallback(() => {
    setSettingsState(JSON.parse(JSON.stringify(DEFAULT_PROJECT_SETTINGS)));
  }, []);

  return useMemo(
    () => ({
      settings,
      setSettings,
      resetToDefault,
    }),
    [settings, setSettings, resetToDefault]
  );
}
