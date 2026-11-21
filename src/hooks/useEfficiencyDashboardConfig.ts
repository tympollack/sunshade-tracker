'use client';

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import type {
  DashboardSurface,
  EfficiencyDashboardSchema,
  EfficiencyDefaultViews,
  EfficiencyWidgetKind,
  ResolvedEfficiencyDashboardConfig,
  ResolvedEfficiencyWidget,
} from '@/types/efficiency-dashboard';
import type { LiveDashboardSettings } from '@/types/tracker';
import {
  clearSurfaceOverride,
  extractSurfaceSchema,
  getSurfaceWidgets,
  isDashboardWidgetVisible,
  isSurfaceCustomized,
  reorderWidgetInOverride,
  resolveEfficiencyDashboardConfig,
  toggleWidgetInOverride,
  updateDefaultViewInOverride,
} from '@/lib/efficiency-dashboard-schema';

export function getEfficiencyDashboardStorageKey(tenantSlug: string = 'default'): string {
  const clean = (tenantSlug || 'default').replace(/^@/, '').trim() || 'default';
  return `sunshade_efficiency_dashboard_prefs_${clean}`;
}

export interface UseEfficiencyDashboardConfigOptions {
  tenantSlug?: string;
  surface: DashboardSurface;
  workspaceSchema?: Partial<EfficiencyDashboardSchema> | null;
  liveDashboardSettings?: Partial<LiveDashboardSettings> | null;
  initialUserOverrides?: Partial<EfficiencyDashboardSchema> | null;
  syncToProfile?: boolean;
  onWorkspaceSchemaSaved?: (schema: EfficiencyDashboardSchema) => void;
}

export interface UseEfficiencyDashboardConfigResult {
  resolved: ResolvedEfficiencyDashboardConfig;
  workspaceBaseline: ResolvedEfficiencyDashboardConfig;
  userOverrides: Partial<EfficiencyDashboardSchema> | null;
  isCustomized: boolean;
  isSurfaceCustomized: boolean;
  getWidgets: (
    kind?: EfficiencyWidgetKind,
    opts?: { visibleOnly?: boolean; surface?: DashboardSurface }
  ) => ResolvedEfficiencyWidget[];
  isWidgetVisible: (widgetId: string) => boolean;
  toggleWidget: (widgetId: string) => void;
  moveWidget: (
    kind: EfficiencyWidgetKind,
    widgetId: string,
    direction: 'up' | 'down',
    targetSurface?: DashboardSurface
  ) => void;
  updateDefaultView: <S extends DashboardSurface>(
    targetSurface: S,
    updates: Partial<EfficiencyDefaultViews[S]>
  ) => void;
  resetSurface: (targetSurface?: DashboardSurface) => void;
  resetAll: () => void;
  isSavingWorkspaceDefault: boolean;
  workspaceSaveError: string | null;
  saveAsWorkspaceDefault: (targetSurface?: DashboardSurface) => Promise<boolean>;
}

function readStoredOverrides(storageKey: string): Partial<EfficiencyDashboardSchema> | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Partial<EfficiencyDashboardSchema>;
    }
  } catch {
    // Ignore malformed localStorage
  }
  return null;
}

export function useEfficiencyDashboardConfig({
  tenantSlug = 'default',
  surface,
  workspaceSchema,
  liveDashboardSettings,
  initialUserOverrides,
  syncToProfile = false,
  onWorkspaceSchemaSaved,
}: UseEfficiencyDashboardConfigOptions): UseEfficiencyDashboardConfigResult {
  const storageKey = getEfficiencyDashboardStorageKey(tenantSlug);
  const [userOverrides, setUserOverrides] = useState<Partial<EfficiencyDashboardSchema> | null>(
    () => readStoredOverrides(storageKey) ?? initialUserOverrides ?? null
  );
  const [localWorkspaceSchema, setLocalWorkspaceSchema] = useState<
    Partial<EfficiencyDashboardSchema> | null | undefined
  >(workspaceSchema);
  const [isSavingWorkspaceDefault, setIsSavingWorkspaceDefault] = useState(false);
  const [workspaceSaveError, setWorkspaceSaveError] = useState<string | null>(null);

  useEffect(() => {
    setLocalWorkspaceSchema(workspaceSchema);
  }, [workspaceSchema]);

  // Rehydrate from localStorage when tenantSlug changes
  useEffect(() => {
    const stored = readStoredOverrides(storageKey);
    if (stored) {
      setUserOverrides(stored);
    } else if (initialUserOverrides) {
      setUserOverrides(initialUserOverrides);
    } else {
      setUserOverrides(null);
    }
  }, [storageKey, initialUserOverrides]);

  const userOverridesRef = useRef(userOverrides);
  userOverridesRef.current = userOverrides;

  const workspaceBaseline = useMemo(
    () =>
      resolveEfficiencyDashboardConfig({
        workspaceSettings: localWorkspaceSchema,
        liveDashboardSettings,
      }),
    [localWorkspaceSchema, liveDashboardSettings]
  );

  const resolved = useMemo(
    () =>
      resolveEfficiencyDashboardConfig({
        workspaceSettings: localWorkspaceSchema,
        liveDashboardSettings,
        userOverrides,
      }),
    [localWorkspaceSchema, liveDashboardSettings, userOverrides]
  );

  const persistUserOverrides = useCallback(
    (next: EfficiencyDashboardSchema | null) => {
      setUserOverrides(next);
      if (typeof window !== 'undefined') {
        try {
          if (next === null) {
            localStorage.removeItem(storageKey);
          } else {
            localStorage.setItem(storageKey, JSON.stringify(next));
          }
        } catch {
          // Ignore storage quota errors
        }
      }
      if (syncToProfile && typeof fetch === 'function') {
        fetch('/api/v1/tenants/me', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ efficiency_dashboard_preferences: next }),
        }).catch(() => {});
      }
    },
    [storageKey, syncToProfile]
  );

  const toggleWidget = useCallback(
    (widgetId: string) => {
      const next = toggleWidgetInOverride(userOverridesRef.current, resolved, widgetId);
      persistUserOverrides(next);
    },
    [resolved, persistUserOverrides]
  );

  const moveWidget = useCallback(
    (
      kind: EfficiencyWidgetKind,
      widgetId: string,
      direction: 'up' | 'down',
      targetSurface: DashboardSurface = surface
    ) => {
      const next = reorderWidgetInOverride(
        userOverridesRef.current,
        resolved,
        targetSurface,
        kind,
        widgetId,
        direction
      );
      persistUserOverrides(next);
    },
    [resolved, surface, persistUserOverrides]
  );

  const updateDefaultView = useCallback(
    <S extends DashboardSurface>(
      targetSurface: S,
      updates: Partial<EfficiencyDefaultViews[S]>
    ) => {
      const next = updateDefaultViewInOverride(userOverridesRef.current, targetSurface, updates);
      persistUserOverrides(next);
    },
    [persistUserOverrides]
  );

  const resetSurface = useCallback(
    (targetSurface: DashboardSurface = surface) => {
      const next = clearSurfaceOverride(userOverridesRef.current, targetSurface);
      persistUserOverrides(next);
    },
    [surface, persistUserOverrides]
  );

  const resetAll = useCallback(() => {
    persistUserOverrides(null);
  }, [persistUserOverrides]);

  const saveAsWorkspaceDefault = useCallback(
    async (targetSurface: DashboardSurface = surface): Promise<boolean> => {
      setIsSavingWorkspaceDefault(true);
      setWorkspaceSaveError(null);
      try {
        const surfaceSchema = extractSurfaceSchema(resolved, targetSurface);
        const { updateEfficiencyDashboardSchemaAction } = await import(
          '@/app/actions/settingsActions'
        );
        const result = await updateEfficiencyDashboardSchemaAction(tenantSlug, surfaceSchema);
        if (!result.success) {
          setWorkspaceSaveError(result.error || 'Failed to save workspace default');
          return false;
        }
        setLocalWorkspaceSchema(result.schema);
        onWorkspaceSchemaSaved?.(result.schema);
        return true;
      } catch (err: any) {
        setWorkspaceSaveError(err?.message || 'Failed to save workspace default');
        return false;
      } finally {
        setIsSavingWorkspaceDefault(false);
      }
    },
    [resolved, surface, tenantSlug, onWorkspaceSchemaSaved]
  );

  const getWidgets = useCallback(
    (
      kind?: EfficiencyWidgetKind,
      opts?: { visibleOnly?: boolean; surface?: DashboardSurface }
    ) => getSurfaceWidgets(resolved, opts?.surface ?? surface, kind, opts),
    [resolved, surface]
  );

  const isWidgetVisible = useCallback(
    (widgetId: string) => isDashboardWidgetVisible(resolved, widgetId),
    [resolved]
  );

  const surfaceCustomized = useMemo(
    () => isSurfaceCustomized(resolved, workspaceBaseline, surface),
    [resolved, workspaceBaseline, surface]
  );

  return {
    resolved,
    workspaceBaseline,
    userOverrides,
    isCustomized: resolved.is_customized,
    isSurfaceCustomized: surfaceCustomized,
    getWidgets,
    isWidgetVisible,
    toggleWidget,
    moveWidget,
    updateDefaultView,
    resetSurface,
    resetAll,
    isSavingWorkspaceDefault,
    workspaceSaveError,
    saveAsWorkspaceDefault,
  };
}
