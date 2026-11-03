'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  computeInFlightTelemetry,
  EnrichedInFlightItem,
  InFlightTelemetryPayload,
} from '@/lib/services/inFlightTelemetryService';
import { LiveDashboardSettings, ProjectSettings, WorkItem } from '@/types/tracker';
import {
  LiveDashboardToolbar,
  LivePivotMode,
  PollingCadenceMs,
} from './LiveDashboardToolbar';
import { FlowTelemetryRibbon } from './FlowTelemetryRibbon';
import { StageFlowView } from './StageFlowView';
import { ProjectSwimlaneView } from './ProjectSwimlaneView';

export interface LiveFlightDeckViewProps {
  tenantSlug: string;
  items: WorkItem[];
  projects: Array<{ id: string; slug: string; name: string; settings?: ProjectSettings }>;
  liveDashboardSettings?: Partial<LiveDashboardSettings> | null;
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
  initialPivot,
  selectedItemRef,
  onSelectItem,
  isKioskMode,
  onToggleKioskMode,
}: LiveFlightDeckViewProps) {
  // Determine initial pivot from URL ?pivot= or workspace default
  const [activePivot, setActivePivot] = useState<LivePivotMode>(() => {
    if (initialPivot === 'project_swimlanes' || initialPivot === 'stage_flow') {
      return initialPivot;
    }
    if (typeof window !== 'undefined') {
      const p = new URLSearchParams(window.location.search).get('pivot');
      if (p === 'project_swimlanes' || p === 'stage_flow') return p;
    }
    return liveDashboardSettings?.default_pivot === 'project_swimlanes'
      ? 'project_swimlanes'
      : 'stage_flow';
  });

  const [pollingCadenceMs, setPollingCadenceMs] = useState<PollingCadenceMs>(() => {
    const raw = liveDashboardSettings?.default_refresh_interval_ms;
    if (raw === 30000 || raw === 60000 || raw === 120000 || raw === 0) {
      return raw;
    }
    return 60000;
  });

  // Sync workspace-configured defaults when tenantInfo loads asynchronously
  const hasHydratedRemoteSettingsRef = useRef(Boolean(liveDashboardSettings));
  useEffect(() => {
    if (!liveDashboardSettings || hasHydratedRemoteSettingsRef.current) return;
    hasHydratedRemoteSettingsRef.current = true;

    const urlPivot =
      typeof window !== 'undefined'
        ? new URLSearchParams(window.location.search).get('pivot')
        : null;
    if (
      !initialPivot &&
      urlPivot !== 'project_swimlanes' &&
      urlPivot !== 'stage_flow' &&
      (liveDashboardSettings.default_pivot === 'project_swimlanes' ||
        liveDashboardSettings.default_pivot === 'stage_flow')
    ) {
      setActivePivot(liveDashboardSettings.default_pivot);
    }

    const rawInterval = liveDashboardSettings.default_refresh_interval_ms;
    if (
      rawInterval === 30000 ||
      rawInterval === 60000 ||
      rawInterval === 120000 ||
      rawInterval === 0
    ) {
      setPollingCadenceMs(rawInterval);
    }
  }, [liveDashboardSettings, initialPivot]);

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
        onPivotChange={setActivePivot}
        pollingCadenceMs={pollingCadenceMs}
        onPollingCadenceChange={setPollingCadenceMs}
        isKioskMode={isKioskMode}
        onToggleKioskMode={onToggleKioskMode}
        lastSyncedAt={effectiveTelemetry.synced_at}
        isSyncing={isSyncing}
        onManualRefresh={() => pollDeltaTelemetry(true)}
      />

      {/* Ambient Flow Health Telemetry Ribbon & Blocker Marquee */}
      <FlowTelemetryRibbon
        telemetry={effectiveTelemetry}
        onSelectBlockerItem={handleSelectBlockerByRef}
      />

      {/* Dual-Pivot Canvas */}
      {activePivot === 'stage_flow' ? (
        <StageFlowView
          telemetry={effectiveTelemetry}
          selectedItemRef={selectedItemRef}
          onSelectItem={handleSelectEnrichedItem}
        />
      ) : (
        <ProjectSwimlaneView
          telemetry={effectiveTelemetry}
          selectedItemRef={selectedItemRef}
          onSelectItem={handleSelectEnrichedItem}
        />
      )}
    </div>
  );
}
