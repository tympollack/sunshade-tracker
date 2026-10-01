'use client';

import React, { use, useState, useEffect, useCallback } from 'react';
import { AnalyticsHeader, SprintOption } from '@/components/analytics/AnalyticsHeader';
import { KpiMetricCards, KpiMetrics } from '@/components/analytics/KpiMetricCards';
import { BurndownChart, BurndownDataPoint } from '@/components/analytics/BurndownChart';
import { ScopeChurnWaterfall, ScopeChurnData } from '@/components/analytics/ScopeChurnWaterfall';
import { CumulativeFlowChart } from '@/components/analytics/CumulativeFlowChart';
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
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Telemetry Data States
  const [kpiMetrics, setKpiMetrics] = useState<KpiMetrics>({
    rollingVelocity: 0,
    sayDoRatio: 0,
    scopeVolatility: 0,
    remainingPoints: 0,
  });
  const [burndownData, setBurndownData] = useState<BurndownDataPoint[]>([]);
  const [churnData, setChurnData] = useState<ScopeChurnData>({
    baselineCommitted: 0,
    addedPoints: 0,
    droppedPoints: 0,
    finalDelivered: 0,
  });
  const [cfdData, setCfdData] = useState<CfdDataPoint[]>([]);
  const [monteCarlo, setMonteCarlo] = useState<MonteCarloSimulationResult | null>(null);

  // Load project sprints & initial data (merging DB sprints and project settings)
  const loadSprintList = useCallback(async () => {
    try {
      const mergedOptions: SprintOption[] = [];

      // 1. Fetch from project settings
      const res = await fetch(`/api/v1/projects?tenant_slug=${tenantSlug}`);
      if (res.ok) {
        const projects = await res.json();
        const currentProject = (projects || []).find(
          (p: any) => p.slug === projectSlug || p.id === projectSlug
        );

        if (currentProject) {
          const projectSprints: any[] = currentProject.settings?.sprint_settings?.sprints || [];
          for (const s of projectSprints) {
            mergedOptions.push({
              id: s.id || s.name,
              name: s.name,
              is_active: Boolean(s.is_active || s.status === 'active' || s.is_current),
              status: s.status,
            });
          }
        }
      }

      // 2. Supplement/merge from sprint analytics route (which queries DB sprints)
      try {
        const sprintListRes = await fetch(
          `/api/v1/sprints/analytics?tenant_slug=${tenantSlug}&project_slug=${projectSlug}`
        );
        if (sprintListRes.ok) {
          const dbSprintData = await sprintListRes.json();
          const dbSprints: any[] = dbSprintData.sprints || [];
          for (const s of dbSprints) {
            const exists = mergedOptions.some(
              (opt) => opt.id === s.id || opt.name === s.name
            );
            if (!exists) {
              mergedOptions.push({
                id: s.id || s.name,
                name: s.name,
                is_active: Boolean(s.is_active || s.status === 'active' || s.is_current),
                status: s.status,
              });
            }
          }
        }
      } catch (err) {
        console.warn('[Analytics] Supplementing sprints from DB skipped:', err);
      }

      setSprints(mergedOptions);
      const active = mergedOptions.find((s) => s.is_active) || mergedOptions[0];
      if (active && !selectedSprintId) {
        setSelectedSprintId(active.id);
      }
    } catch (err) {
      console.error('[Analytics] Failed to fetch project sprints:', err);
    }
  }, [tenantSlug, projectSlug, selectedSprintId]);

  // Fetch telemetry endpoints
  const fetchTelemetry = useCallback(async () => {
    setIsRefreshing(true);
    try {
      // 1. Fetch Sprint Health & Metrics
      let sprintQuery = selectedSprintId ? `&sprint_id=${encodeURIComponent(selectedSprintId)}` : '';
      const sprintRes = await fetch(
        `/api/v1/sprints/analytics?tenant_slug=${tenantSlug}&project_slug=${projectSlug}${sprintQuery}`
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
          reportedSayDo = sprintData.commitmentReliabilityPercent / 100;
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
          )}&tenant_slug=${encodeURIComponent(tenantSlug)}`
        );
        if (snapRes.ok) {
          const snapJson = await snapRes.json();
          if (Array.isArray(snapJson.burndownData)) {
            setBurndownData(snapJson.burndownData);
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
      const simulationVelocities =
        historicalVelocities.length > 0
          ? historicalVelocities
          : rollingVelocity > 0
          ? [rollingVelocity]
          : [];

      const hasPositiveVelocity = simulationVelocities.some((v) => v > 0);

      if (remainingPts > 0 && hasPositiveVelocity) {
        const simulation = runMonteCarloSimulation({
          remainingStoryPoints: remainingPts,
          historicalVelocities: simulationVelocities,
          iterations: 1000,
          sprintLengthDays: 14,
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
        onSelectSprint={(id) => setSelectedSprintId(id)}
        startDate={startDate}
        endDate={endDate}
        onChangeStartDate={(d) => setStartDate(d)}
        onChangeEndDate={(d) => setEndDate(d)}
        onRefresh={fetchTelemetry}
        isRefreshing={isRefreshing}
      />

      {/* Main Content Dashboard */}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* KPI Metric Cards */}
        <section aria-label="Sprint Key Performance Indicators">
          <KpiMetricCards metrics={kpiMetrics} isLoading={isLoading} />
        </section>

        {/* Analytics Visualizations Grid */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Burndown Slot */}
          <div className="w-full">
            <BurndownChart data={burndownData} isLoading={isLoading} />
          </div>

          {/* Scope Churn Waterfall Slot */}
          <div className="w-full">
            <ScopeChurnWaterfall data={churnData} isLoading={isLoading} />
          </div>
        </section>

        {/* Cumulative Flow Diagram Slot */}
        <section className="w-full">
          <CumulativeFlowChart data={cfdData} isLoading={isLoading} />
        </section>

        {/* Monte Carlo Release Forecasting */}
        {monteCarlo && (
          <section className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-lg bg-cyan-950/60 text-cyan-400 border border-cyan-800/50">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-100">
                    Monte Carlo Milestone Simulator
                  </h3>
                  <p className="text-xs text-slate-400">
                    Probabilistic completion forecasting over {monteCarlo.iterations.toLocaleString()} trials ({monteCarlo.executionTimeMs}ms)
                    {!monteCarlo.deliveredWithinHorizon && monteCarlo.censoredTrials > 0 && (
                      <span className="text-amber-400 ml-2">({monteCarlo.censoredTrials} trials exceeded 500 sprints)</span>
                    )}
                  </p>
                </div>
              </div>
              <div className="text-xs text-slate-400 font-mono">
                Target: {monteCarlo.remainingStoryPoints} remaining pts
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3">
                <div className="text-xs text-slate-400 font-medium">50% Confidence (Aggressive)</div>
                <div className="text-xl font-bold text-emerald-400 font-mono mt-1">
                  {monteCarlo.percentiles.p50 !== null ? `${monteCarlo.percentiles.p50} sprints` : '> 500 sprints'}
                </div>
                <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  {monteCarlo.projectedDates.p50 ? monteCarlo.projectedDates.p50.split('T')[0] : 'Exceeds horizon'}
                </div>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3">
                <div className="text-xs text-slate-400 font-medium">85% Confidence (Commitment)</div>
                <div className="text-xl font-bold text-cyan-400 font-mono mt-1">
                  {monteCarlo.percentiles.p85 !== null ? `${monteCarlo.percentiles.p85} sprints` : '> 500 sprints'}
                </div>
                <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  {monteCarlo.projectedDates.p85 ? monteCarlo.projectedDates.p85.split('T')[0] : 'Exceeds horizon'}
                </div>
              </div>

              <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3">
                <div className="text-xs text-slate-400 font-medium">95% Confidence (Conservative)</div>
                <div className="text-xl font-bold text-amber-400 font-mono mt-1">
                  {monteCarlo.percentiles.p95 !== null ? `${monteCarlo.percentiles.p95} sprints` : '> 500 sprints'}
                </div>
                <div className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-slate-500" />
                  {monteCarlo.projectedDates.p95 ? monteCarlo.projectedDates.p95.split('T')[0] : 'Exceeds horizon'}
                </div>
              </div>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
