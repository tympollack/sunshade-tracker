'use client';

import React, { use, useState, useEffect, useCallback } from 'react';
import { AnalyticsHeader, SprintOption } from '@/components/analytics/AnalyticsHeader';
import { SprintAnalyticsView } from '@/components/analytics/SprintAnalyticsView';
import { useSprintTelemetry } from '@/hooks/useSprintTelemetry';

interface PageProps {
  params: Promise<{
    tenantSlug: string;
    projectSlug: string;
  }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default function ProjectSprintAnalyticsPage(props: PageProps) {
  const { tenantSlug, projectSlug } = use(props.params);

  // Filter States
  const now = new Date();
  const defaultStart = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
  const defaultEnd = now.toISOString().split('T')[0];

  const [startDate, setStartDate] = useState(defaultStart);
  const [endDate, setEndDate] = useState(defaultEnd);
  const [sprints, setSprints] = useState<SprintOption[]>([]);
  const [selectedSprintId, setSelectedSprintId] = useState<string>('');
  const [isCustomDateRange, setIsCustomDateRange] = useState(false);

  // Synchronized Sprint Telemetry Data Hook
  const {
    isLoading,
    isRefreshing,
    kpiMetrics,
    burndownData,
    churnData,
    cfdData,
    monteCarlo,
    simulationVelocities,
    forecastStartDate,
    refetch: fetchTelemetry,
  } = useSprintTelemetry({
    tenantSlug,
    projectSlug,
    selectedSprintId,
    startDate,
    endDate,
  });

  // Sync state from URL query parameters on initial client mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      const urlSprintId = url.searchParams.get('sprintId');
      const isCustom = url.searchParams.get('custom') === 'true';
      const urlStart = url.searchParams.get('startDate');
      const urlEnd = url.searchParams.get('endDate');

      if (urlSprintId) {
        setSelectedSprintId(urlSprintId);
      }
      if (isCustom && (urlStart || urlEnd)) {
        setIsCustomDateRange(true);
        if (urlStart) setStartDate(urlStart);
        if (urlEnd) setEndDate(urlEnd);
      }
    } catch {
      // Ignore URL parsing errors
    }
  }, []);

  // Synchronize URL parameters shallowly
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      let modified = false;

      if (selectedSprintId && url.searchParams.get('sprintId') !== selectedSprintId) {
        url.searchParams.set('sprintId', selectedSprintId);
        modified = true;
      }
      if (isCustomDateRange) {
        if (url.searchParams.get('custom') !== 'true') {
          url.searchParams.set('custom', 'true');
          modified = true;
        }
        if (startDate && url.searchParams.get('startDate') !== startDate) {
          url.searchParams.set('startDate', startDate);
          modified = true;
        }
        if (endDate && url.searchParams.get('endDate') !== endDate) {
          url.searchParams.set('endDate', endDate);
          modified = true;
        }
      } else {
        if (url.searchParams.has('custom')) {
          url.searchParams.delete('custom');
          modified = true;
        }
        if (url.searchParams.has('startDate')) {
          url.searchParams.delete('startDate');
          modified = true;
        }
        if (url.searchParams.has('endDate')) {
          url.searchParams.delete('endDate');
          modified = true;
        }
      }

      if (modified) {
        window.history.replaceState(null, '', url.toString());
      }
    } catch {
      // Ignore
    }
  }, [selectedSprintId, isCustomDateRange, startDate, endDate]);

  // Load project sprints & initial data (merging DB sprints and project settings)
  const loadSprintList = useCallback(async () => {
    try {
      const mergedOptions: SprintOption[] = [];

      // 1. Fetch from project settings
      let currentProjectId: string | undefined;
      const res = await fetch(`/api/v1/projects?tenant_slug=${tenantSlug}`);
      if (res.ok) {
        const data = await res.json();
        const projectList: any[] = Array.isArray(data) ? data : data?.projects || [];
        const currentProject = projectList.find(
          (p: any) => p.slug === projectSlug || p.id === projectSlug
        );

        if (currentProject) {
          currentProjectId = currentProject.id;
          const projectSprints: any[] = currentProject.settings?.sprint_settings?.sprints || [];
          for (const s of projectSprints) {
            mergedOptions.push({
              id: s.id || s.name,
              name: s.name,
              is_active: Boolean(s.is_active || s.status === 'active' || s.is_current),
              status: s.status,
              start_date: s.start_date || s.startDate || null,
              end_date: s.end_date || s.endDate || null,
            });
          }
        }
      }

      // 2. Fetch canonical relational sprints from tracker.sprints table
      try {
        const queryParam = currentProjectId
          ? `project_id=${encodeURIComponent(currentProjectId)}`
          : `project_slug=${encodeURIComponent(projectSlug)}`;
        const sprintsRes = await fetch(`/api/v1/sprints?tenant_slug=${tenantSlug}&${queryParam}`);
        if (sprintsRes.ok) {
          const sData = await sprintsRes.json();
          for (const s of sData.sprints || []) {
            const existing = mergedOptions.find(
              (opt) => opt.id === s.id || opt.name === s.name
            );
            if (!existing) {
              mergedOptions.push({
                id: s.id || s.name,
                name: s.name,
                is_active: Boolean(s.is_active || s.status === 'active' || s.is_current),
                status: s.status,
                start_date: s.started_at || s.start_date || s.startDate || null,
                end_date: s.ends_at || s.end_date || s.endDate || null,
              });
            } else {
              // Fill canonical dates from relational record if settings omitted them
              if (!existing.start_date) {
                existing.start_date = s.started_at || s.start_date || s.startDate || null;
              }
              if (!existing.end_date) {
                existing.end_date = s.ends_at || s.end_date || s.endDate || null;
              }
            }
          }
        }
      } catch (err) {
        console.warn('[Analytics] Fetching from relational sprints route skipped:', err);
      }

      // 3. Supplement/merge from sprint analytics route (which queries DB sprints)
      try {
        const sprintListParam = currentProjectId
          ? `project_id=${encodeURIComponent(currentProjectId)}`
          : `project_slug=${encodeURIComponent(projectSlug)}`;
        const sprintListRes = await fetch(
          `/api/v1/sprints/analytics?tenant_slug=${tenantSlug}&${sprintListParam}`
        );
        if (sprintListRes.ok) {
          const dbSprintData = await sprintListRes.json();
          const dbSprints: any[] = dbSprintData.sprints || [];
          for (const s of dbSprints) {
            // Guard against cross-project sprint pollution
            if (currentProjectId && s.project_id && s.project_id !== currentProjectId) {
              continue;
            }
            const existing = mergedOptions.find(
              (opt) => opt.id === s.id || opt.name === s.name
            );
            if (!existing) {
              mergedOptions.push({
                id: s.id || s.name,
                name: s.name,
                is_active: Boolean(s.is_active || s.status === 'active' || s.is_current),
                status: s.status,
                start_date: s.started_at || s.start_date || s.startDate || null,
                end_date: s.ends_at || s.end_date || s.endDate || null,
              });
            } else {
              if (!existing.start_date) {
                existing.start_date = s.started_at || s.start_date || s.startDate || null;
              }
              if (!existing.end_date) {
                existing.end_date = s.ends_at || s.end_date || s.endDate || null;
              }
            }
          }
        }
      } catch (err) {
        console.warn('[Analytics] Supplementing sprints from DB skipped:', err);
      }

      setSprints(mergedOptions);
      if (mergedOptions.length > 0) {
        setSelectedSprintId((prev) => {
          let chosenId = prev;
          if (!prev || !mergedOptions.some((s) => s.id === prev || s.name === prev)) {
            const active = mergedOptions.find((s) => s.is_active) || mergedOptions[0];
            chosenId = active.id;
          }
          const chosenSprint = mergedOptions.find((s) => s.id === chosenId || s.name === chosenId);
          if (chosenSprint?.start_date && chosenSprint?.end_date) {
            setStartDate((currStart) => {
              if (!isCustomDateRange) return chosenSprint.start_date!.split('T')[0];
              return currStart;
            });
            setEndDate((currEnd) => {
              if (!isCustomDateRange) return chosenSprint.end_date!.split('T')[0];
              return currEnd;
            });
          }
          return chosenId;
        });
      }
    } catch (err) {
      console.error('[Analytics] Failed to fetch project sprints:', err);
    }
  }, [tenantSlug, projectSlug, isCustomDateRange]);

  // Synchronized Sprint & Date Range Handlers
  const handleSelectSprint = useCallback(
    (id: string) => {
      setSelectedSprintId(id);
      const targetSprint = sprints.find((s) => s.id === id || s.name === id);
      if (targetSprint?.start_date && targetSprint?.end_date) {
        setStartDate(targetSprint.start_date.split('T')[0]);
        setEndDate(targetSprint.end_date.split('T')[0]);
        setIsCustomDateRange(false);
      }
    },
    [sprints]
  );

  const handleChangeStartDate = useCallback((date: string) => {
    setStartDate(date);
    setIsCustomDateRange(true);
  }, []);

  const handleChangeEndDate = useCallback((date: string) => {
    setEndDate(date);
    setIsCustomDateRange(true);
  }, []);

  const handleResetToSprintDates = useCallback(() => {
    const targetSprint = sprints.find((s) => s.id === selectedSprintId || s.name === selectedSprintId);
    if (targetSprint?.start_date && targetSprint?.end_date) {
      setStartDate(targetSprint.start_date.split('T')[0]);
      setEndDate(targetSprint.end_date.split('T')[0]);
    } else {
      const now = new Date();
      setStartDate(new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]);
      setEndDate(now.toISOString().split('T')[0]);
    }
    setIsCustomDateRange(false);
  }, [sprints, selectedSprintId]);

  useEffect(() => {
    loadSprintList();
  }, [loadSprintList]);

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col">
      {/* Header Controls */}
      <AnalyticsHeader
        tenantSlug={tenantSlug}
        projectSlug={projectSlug}
        sprints={sprints}
        selectedSprintId={selectedSprintId}
        onSelectSprint={handleSelectSprint}
        startDate={startDate}
        endDate={endDate}
        onChangeStartDate={handleChangeStartDate}
        onChangeEndDate={handleChangeEndDate}
        onRefresh={fetchTelemetry}
        isRefreshing={isRefreshing}
        isCustomDateRange={isCustomDateRange}
        onResetToSprintDates={handleResetToSprintDates}
      />

      {/* Main Content Dashboard */}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-6">
        <SprintAnalyticsView
          isLoading={isLoading}
          kpiMetrics={kpiMetrics}
          burndownData={burndownData}
          churnData={churnData}
          cfdData={cfdData}
          monteCarlo={monteCarlo}
          projectSlug={projectSlug}
          selectedSprintId={selectedSprintId}
          simulationVelocities={simulationVelocities}
          forecastStartDate={forecastStartDate}
          isCustomDateRange={isCustomDateRange}
        />
      </main>
    </div>
  );
}
