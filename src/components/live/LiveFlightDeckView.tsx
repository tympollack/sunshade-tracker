'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  computeInFlightTelemetry,
  EnrichedInFlightItem,
  InFlightTelemetryPayload,
} from '@/lib/services/inFlightTelemetryCore';
import { LiveDashboardSettings, ProjectSettings, WorkItem } from '@/types/tracker';
import {
  LiveDashboardToolbar,
  LivePivotMode,
  PollingCadenceMs,
} from './LiveDashboardToolbar';
import { FlowTelemetryRibbon } from './FlowTelemetryRibbon';
import { StageFlowView } from './StageFlowView';
import { ProjectSwimlaneView } from './ProjectSwimlaneView';
import type { EfficiencyDashboardSchema } from '@/types/efficiency-dashboard';
import { useEfficiencyDashboardConfig } from '@/hooks/useEfficiencyDashboardConfig';
import { CustomizeDashboardDrawer } from '@/components/efficiency/CustomizeDashboardDrawer';

export interface LiveFlightDeckViewProps {
  tenantSlug: string;
  items: WorkItem[];
  projects: Array<{ id: string; slug: string; name: string; settings?: ProjectSettings }>;
  liveDashboardSettings?: Partial<LiveDashboardSettings> | null;
  efficiencyDashboardSettings?: Partial<EfficiencyDashboardSchema> | null;
  userDashboardPreferences?: Partial<EfficiencyDashboardSchema> | null;
  profileLoaded?: boolean;
  canSaveWorkspaceDefault?: boolean;
  syncToProfile?: boolean;
  initialPivot?: string | null;
  selectedItemRef?: string | null;
  onSelectItem?: (item: WorkItem) => void;
  isKioskMode: boolean;
  onToggleKioskMode: () => void;
}

export function LiveFlightDeckView({
  tenantSlug,
  items,
  projects,
  liveDashboardSettings,
  efficiencyDashboardSettings,
  userDashboardPreferences,
  profileLoaded = false,
  canSaveWorkspaceDefault = false,
  syncToProfile = false,
  initialPivot,
  selectedItemRef,
  onSelectItem,
  isKioskMode,
  onToggleKioskMode,
}: LiveFlightDeckViewProps) {
  const dashboardConfig = useEfficiencyDashboardConfig({
    tenantSlug,
    surface: 'telemetry',
    workspaceSchema: efficiencyDashboardSettings,
    liveDashboardSettings,
    initialUserOverrides: userDashboardPreferences,
    profileLoaded,
    syncToProfile,
  });

  const configuredPivot = dashboardConfig.resolved.default_views.telemetry.defaultPivot;
  const configuredRefreshMs =
    dashboardConfig.resolved.default_views.telemetry.defaultRefreshIntervalMs;

  const [isCustomizerOpen, setIsCustomizerOpen] = useState(false);

  const hasUserSelectedPivotRef = useRef(false);
  const hasUserSelectedCadenceRef = useRef(false);

  // Determine initial pivot from URL ?pivot= or resolved dashboard schema
  const [activePivot, setActivePivot] = useState<LivePivotMode>(() => {
    if (initialPivot === 'project_swimlanes' || initialPivot === 'stage_flow') {
      return initialPivot;
    }
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('pivot');
      if (p === 'project_swimlanes' || p === 'stage_flow') return p;
    }
    return configuredPivot === 'project_swimlanes' ? 'project_swimlanes' : 'stage_flow';
  });

  const [pollingCadenceMs, setPollingCadenceMs] = useState<PollingCadenceMs>(() => {
    if (
      configuredRefreshMs === 30000 ||
      configuredRefreshMs === 60000 ||
      configuredRefreshMs === 120000 ||
      configuredRefreshMs === 0
    ) {
      return configuredRefreshMs;
    }
    return 60000;
  });

  // Sync resolved defaults whenever workspace settings or profile preferences finish loading,
  // unless user has explicitly interacted with the toolbar or URL ?pivot= overrides it.
  useEffect(() => {
    const urlPivot =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('pivot')
        : null;
    if (
      !hasUserSelectedPivotRef.current &&
      !initialPivot &&
      urlPivot !== 'project_swimlanes' &&
      urlPivot !== 'stage_flow' &&
      (configuredPivot === 'project_swimlanes' || configuredPivot === 'stage_flow')
    ) {
      setActivePivot(configuredPivot);
    }

    if (
      !hasUserSelectedCadenceRef.current &&
      (configuredRefreshMs === 30000 ||
        configuredRefreshMs === 60000 ||
        configuredRefreshMs === 120000 ||
        configuredRefreshMs === 0)
    ) {
      setPollingCadenceMs(configuredRefreshMs);
    }
  }, [configuredPivot, configuredRefreshMs, initialPivot]);

  const handleToolbarPivotChange = useCallback((pivot: LivePivotMode) => {
    hasUserSelectedPivotRef.current = true;
    setActivePivot(pivot);
  }, []);

  const handleToolbarCadenceChange = useCallback((cadence: PollingCadenceMs) => {
    hasUserSelectedCadenceRef.current = true;
    setPollingCadenceMs(cadence);
  }, []);

  // Compute baseline telemetry immediately from in-memory workspace items & projects
  const computedBaseline = useMemo<InFlightTelemetryPayload>(() => {
    return computeInFlightTelemetry({
      items,
      projects,
      liveDashboardSettings,
    });
  }, [items, projects, liveDashboardSettings]);

  const [remoteTelemetry, setRemoteTelemetry] = useState<InFlightTelemetryPayload | null>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const lastSyncedAtRef = useRef<string | null>(null);
  const lastEtagRef = useRef<string | null>(null);
  const activePivotRef = useRef<LivePivotMode>(activePivot);
  activePivotRef.current = activePivot;

  const effectiveTelemetry = remoteTelemetry || computedBaseline;

  // Keep remote telemetry refreshed if local items mutate via drawer edits
  useEffect(() => {
    setRemoteTelemetry(null);
  }, [items, projects]);

  const pollDeltaTelemetry = useCallback(
    async (forceFull = false) => {
      if (!tenantSlug) return;
      setIsSyncing(true);
      try {
        const params = new URLSearchParams();
        params.set('view', activePivotRef.current);
        if (!forceFull && lastSyncedAtRef.current) {
          params.set('since', lastSyncedAtRef.current);
        }

        const headers: Record<string, string> = {
          'x-tenant-slug': tenantSlug,
        };
        if (!forceFull && lastEtagRef.current) {
          headers['If-None-Match'] = lastEtagRef.current;
        }

        const res = await fetch(`/api/v1/telemetry/live?${params.toString()}`, {
          headers,
        });

        if (res.status === 304) {
          // Idle: no items mutated
          return;
        }

        if (res.ok) {
          const data = await res.json();
          if (data?.telemetry) {
            setRemoteTelemetry(data.telemetry);
            lastSyncedAtRef.current = data.synced_at || data.telemetry.synced_at;
          }
          const etag = res.headers.get('etag') || data?.etag;
          if (etag) {
            lastEtagRef.current = etag;
          }
        }
      } catch {
        // Fallback to local computedBaseline if network call fails
      } finally {
        setIsSyncing(false);
      }
    },
    [tenantSlug]
  );

  // Initial fetch + interval polling based on selected cadence (skipped when Paused)
  useEffect(() => {
    if (!pollingCadenceMs || pollingCadenceMs <= 0) return;
    pollDeltaTelemetry(false);
    const timer = setInterval(() => {
      pollDeltaTelemetry(false);
    }, pollingCadenceMs);
    return () => clearInterval(timer);
  }, [pollingCadenceMs, pollDeltaTelemetry]);

  const handleSelectEnrichedItem = useCallback(
    (enriched: EnrichedInFlightItem) => {
      if (onSelectItem) {
        const match =
          items.find((i) => i.id === enriched.id) || (enriched as unknown as WorkItem);
        onSelectItem(match);
      }
    },
    [items, onSelectItem]
  );

  const handleSelectBlockerByRef = useCallback(
    (refOrId: string) => {
      const clean = refOrId.trim().toLowerCase();
      const found =
        items.find(
          (i) =>
            i.id.toLowerCase() === clean ||
            (i.external_ref_id && i.external_ref_id.toLowerCase() === clean)
        ) ||
        effectiveTelemetry.in_flight_items.find(
          (i) =>
            i.id.toLowerCase() === clean ||
            (i.external_ref_id && i.external_ref_id.toLowerCase() === clean)
        );
      if (found && onSelectItem) {
        onSelectItem(found as WorkItem);
      }
    },
    [items, effectiveTelemetry.in_flight_items, onSelectItem]
  );

  return (
    <div
      data-testid="live-flight-deck-view"
      className={`w-full flex flex-col space-y-4 ${
        isKioskMode ? 'h-[100dvh] p-4 bg-[#090d16] overflow-y-auto' : 'min-h-0 flex-1'
      }`}
    >
      {/* Top Control Toolbar */}
      <LiveDashboardToolbar
        activePivot={activePivot}
        onPivotChange={handleToolbarPivotChange}
        pollingCadenceMs={pollingCadenceMs}
        onPollingCadenceChange={handleToolbarCadenceChange}
        isKioskMode={isKioskMode}
        onToggleKioskMode={onToggleKioskMode}
        lastSyncedAt={effectiveTelemetry.synced_at}
        isSyncing={isSyncing}
        onManualRefresh={() => pollDeltaTelemetry(true)}
        onOpenCustomizer={() => setIsCustomizerOpen(true)}
        isDashboardCustomized={dashboardConfig.isSurfaceCustomized}
      />

      {/* Schema-Driven Telemetry Modules & KPI Ribbon */}
      {(() => {
        const visibleKpiIds = dashboardConfig
          .getWidgets('kpi', { visibleOnly: true })
          .map((w) => w.id);
        const visibleModules = dashboardConfig.getWidgets('module', { visibleOnly: true });

        if (visibleModules.length === 0) {
          return (
            <div
              data-testid="telemetry-empty-modules"
              className="p-8 rounded-xl bg-slate-900/60 border border-dashed border-slate-800 text-center space-y-3"
            >
              <p className="text-sm font-semibold text-slate-300">
                All live telemetry modules are currently hidden.
              </p>
              <button
                type="button"
                onClick={() => setIsCustomizerOpen(true)}
                className="px-4 py-2 rounded-lg bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors cursor-pointer"
              >
                Open Customize Dashboard
              </button>
            </div>
          );
        }

        const marqueeIdx = visibleModules.findIndex((m) => m.id === 'tel_mod_blocker_marquee');
        const ribbonIdx = visibleModules.findIndex((m) => m.id === 'tel_mod_telemetry_ribbon');
        const canCombineRibbon = marqueeIdx !== -1 && ribbonIdx === marqueeIdx + 1;

        const elements: React.ReactNode[] = [];
        let renderedCombined = false;

        for (const mod of visibleModules) {
          if (mod.id === 'tel_mod_blocker_marquee' || mod.id === 'tel_mod_telemetry_ribbon') {
            if (canCombineRibbon) {
              if (!renderedCombined) {
                renderedCombined = true;
                elements.push(
                  <FlowTelemetryRibbon
                    key="combined-telemetry-ribbon"
                    telemetry={effectiveTelemetry}
                    onSelectBlockerItem={handleSelectBlockerByRef}
                    showBlockerMarquee={true}
                    showMetricCards={true}
                    visibleKpiIds={visibleKpiIds}
                  />
                );
              }
              continue;
            }

            if (mod.id === 'tel_mod_blocker_marquee') {
              elements.push(
                <FlowTelemetryRibbon
                  key={mod.id}
                  telemetry={effectiveTelemetry}
                  onSelectBlockerItem={handleSelectBlockerByRef}
                  showBlockerMarquee={true}
                  showMetricCards={false}
                />
              );
            } else {
              elements.push(
                <FlowTelemetryRibbon
                  key={mod.id}
                  telemetry={effectiveTelemetry}
                  onSelectBlockerItem={handleSelectBlockerByRef}
                  showBlockerMarquee={false}
                  showMetricCards={true}
                  visibleKpiIds={visibleKpiIds}
                />
              );
            }
          } else if (mod.id === 'tel_mod_pivot_canvas') {
            elements.push(
              activePivot === 'stage_flow' ? (
                <StageFlowView
                  key={mod.id}
                  telemetry={effectiveTelemetry}
                  selectedItemRef={selectedItemRef}
                  onSelectItem={handleSelectEnrichedItem}
                />
              ) : (
                <ProjectSwimlaneView
                  key={mod.id}
                  telemetry={effectiveTelemetry}
                  selectedItemRef={selectedItemRef}
                  onSelectItem={handleSelectEnrichedItem}
                />
              )
            );
          }
        }

        return elements;
      })()}

      <CustomizeDashboardDrawer
        isOpen={isCustomizerOpen}
        onClose={() => setIsCustomizerOpen(false)}
        activeSurface="telemetry"
        config={dashboardConfig}
        canSaveWorkspaceDefault={canSaveWorkspaceDefault}
        onDefaultViewApplied={(event) => {
          if (event.surface === 'telemetry') {
            if (event.isReset) {
              hasUserSelectedPivotRef.current = false;
              hasUserSelectedCadenceRef.current = false;
            }
            if (event.updates.defaultPivot) {
              if (!event.isReset) hasUserSelectedPivotRef.current = true;
              setActivePivot(event.updates.defaultPivot);
            }
            if (typeof event.updates.defaultRefreshIntervalMs === 'number') {
              if (!event.isReset) hasUserSelectedCadenceRef.current = true;
              setPollingCadenceMs(event.updates.defaultRefreshIntervalMs);
            }
          }
        }}
      />
    </div>
  );
}
