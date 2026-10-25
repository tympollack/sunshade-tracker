'use client';

import React, { use, useState, useEffect, useCallback, useMemo } from 'react';
import { AnalyticsHeader, SprintOption } from '@/components/analytics/AnalyticsHeader';
import { SprintAnalyticsView } from '@/components/analytics/SprintAnalyticsView';
import { KpiMetricCards, KpiMetrics } from '@/components/analytics/KpiMetricCards';
import { BurndownChart, BurndownDataPoint } from '@/components/analytics/BurndownChart';
import { ScopeChurnWaterfall, ScopeChurnData } from '@/components/analytics/ScopeChurnWaterfall';
import { CumulativeFlowChart } from '@/components/analytics/CumulativeFlowChart';
import { MonteCarloSimulator } from '@/components/analytics/MonteCarloSimulator';
import { CfdDataPoint } from '@/lib/analytics/flow-diagnostics';
import { calculateRollingVelocity, calculateSayDoRatio, calculateSprintVolatility } from '@/lib/analytics/velocity-forecaster';
import { runMonteCarloSimulation, MonteCarloSimulationResult } from '@/lib/analytics/monte-carlo';
import { Calendar, Sparkles } from 'lucide-react';

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
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

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

  // Telemetry Data States
  const [kpiMetrics, setKpiMetrics] = useState<KpiMetrics>({
    rollingVelocity: 0,
    sayDoRatio: 0,
    scopeVolatility: 0,
    remainingPoints: 0,
  });
  const [simulationVelocities, setSimulationVelocities] = useState<number[]>([]);
  const [burndownData, setBurndownData] = useState<BurndownDataPoint[]>([]);
  const [churnData, setChurnData] = useState<ScopeChurnData>({
    baselineCommitted: 0,
    addedPoints: 0,
    droppedPoints: 0,
    finalDelivered: 0,
  });
  const [cfdData, setCfdData] = useState<CfdDataPoint[]>([]);
  const [monteCarlo, setMonteCarlo] = useState<MonteCarloSimulationResult | null>(null);
  // Anchor remaining-work forecast to current date so projections do not land in the past
  const forecastStartDate = useMemo(() => new Date().toISOString().split('T')[0], []);

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
  }, [tenantSlug, projectSlug]);

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

  // Fetch telemetry endpoints
  const fetchTelemetry = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // 1. Fetch Sprint Health & Metrics (propagating custom date bounds)
      let sprintQuery = selectedSprintId ? `&sprint_id=${encodeURIComponent(selectedSprintId)}` : '';
      const dateParams = `&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
      const sprintRes = await fetch(
        `/api/v1/sprints/analytics?tenant_slug=${tenantSlug}&project_slug=${projectSlug}${sprintQuery}${dateParams}`
      );

      let committedPts = 0;
      let deliveredPts = 0;
      let remainingPts = 0;
      let addedPts = 0;
      let droppedPts = 0;
      let historicalVelocities: number[] = [];
      let reportedRollingVelocity: number | undefined;
      let reportedSayDo: number | undefined;
      let reportedVolatility: number | undefined;

      if (sprintRes.ok) {
        const sprintData = await sprintRes.json();
        // Support both camelCase SprintHealthReport and legacy snake_case formats
        committedPts = sprintData.committedPoints ?? sprintData.committed_points ?? 0;
        deliveredPts = sprintData.completedPoints ?? sprintData.completed_points ?? 0;
        remainingPts = sprintData.remainingPoints ?? sprintData.remaining_points ?? 0;
        addedPts = sprintData.pointsAddedMidSprint ?? sprintData.churn_added_points ?? 0;
        droppedPts = sprintData.churn_dropped_points ?? sprintData.pointsDroppedMidSprint ?? 0;

        if (typeof sprintData.rollingVelocity === 'number') {
          reportedRollingVelocity = sprintData.rollingVelocity;
        } else if (typeof sprintData.rolling_velocity === 'number') {
          reportedRollingVelocity = sprintData.rolling_velocity;
        }

        if (typeof sprintData.commitmentReliabilityPercent === 'number') {
          reportedSayDo = sprintData.commitmentReliabilityPercent;
        }

        if (typeof sprintData.scopeCreepPercent === 'number') {
          reportedVolatility = sprintData.scopeCreepPercent;
        }

        const histList = sprintData.historicalSprints || sprintData.historical_sprints;
        if (Array.isArray(histList) && histList.length > 0) {
          historicalVelocities = histList.map(
            (h: any) => h.completed_points ?? h.completedPoints ?? 0
          );
        }
      }

      // Compute pure metrics with fallback to utility engines
      const rollingVelocity =
        reportedRollingVelocity !== undefined
          ? reportedRollingVelocity
          : calculateRollingVelocity(historicalVelocities);
      const sayDo =
        reportedSayDo !== undefined
          ? reportedSayDo
          : calculateSayDoRatio(committedPts, deliveredPts);
      const volatility =
        reportedVolatility !== undefined
          ? reportedVolatility
          : calculateSprintVolatility(committedPts, addedPts, droppedPts);

      setKpiMetrics({
        rollingVelocity,
        sayDoRatio: sayDo,
        scopeVolatility: volatility,
        remainingPoints: remainingPts,
        committedPoints: committedPts,
        deliveredPoints: deliveredPts,
      });

      setChurnData({
        baselineCommitted: committedPts,
        addedPoints: addedPts,
        droppedPoints: droppedPts,
        finalDelivered: deliveredPts,
      });

      // 2. Fetch Burndown Snapshots for selected sprint
      if (selectedSprintId) {
        const snapRes = await fetch(
          `/api/v1/projects/${encodeURIComponent(projectSlug)}/analytics/snapshots?sprint_id=${encodeURIComponent(
            selectedSprintId
          )}&tenant_slug=${encodeURIComponent(tenantSlug)}${dateParams}`
        );
        if (snapRes.ok) {
          const snapJson = await snapRes.json();
          if (Array.isArray(snapJson.burndownData)) {
            const filteredBurndown = snapJson.burndownData.filter((b: any) => {
              if (!b.date) return true;
              return b.date >= startDate && b.date <= endDate;
            });
            setBurndownData(filteredBurndown);
          } else {
            setBurndownData([]);
          }
        } else {
          setBurndownData([]);
        }
      } else {
        setBurndownData([]);
      }

      // 3. Fetch CFD series
      const cfdRes = await fetch(
        `/api/v1/projects/${encodeURIComponent(projectSlug)}/analytics/cfd?startDate=${startDate}&endDate=${endDate}&tenant_slug=${encodeURIComponent(tenantSlug)}`
      );
      if (cfdRes.ok) {
        const cfdJson = await cfdRes.json();
        if (Array.isArray(cfdJson.series)) {
          setCfdData(cfdJson.series);
        }
      }

      // 4. Run Monte Carlo simulation for milestone projection (zero fake data fallback)
      const simVelocities =
        historicalVelocities.length > 0
          ? historicalVelocities
          : rollingVelocity > 0
          ? [rollingVelocity]
          : [];
      setSimulationVelocities(simVelocities);

      const hasPositiveVelocity = simVelocities.some((v) => v > 0);

      if (remainingPts > 0 && hasPositiveVelocity) {
        const simulation = runMonteCarloSimulation({
          remainingStoryPoints: remainingPts,
          historicalVelocities: simVelocities,
          iterations: 1000,
          sprintLengthDays: 14,
          startDate: forecastStartDate,
        });
        setMonteCarlo(simulation);
      } else {
        setMonteCarlo(null);
      }
    } catch (err) {
      console.error('[Analytics] Error loading telemetry:', err);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [tenantSlug, projectSlug, selectedSprintId, startDate, endDate]);

  useEffect(() => {
    loadSprintList();
  }, [loadSprintList]);

  useEffect(() => {
    fetchTelemetry();
  }, [fetchTelemetry]);

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
