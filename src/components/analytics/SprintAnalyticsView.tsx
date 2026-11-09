'use client';

import React, { Suspense } from 'react';
import { KpiMetricCards, KpiMetrics } from './KpiMetricCards';
import { BurndownChart, BurndownDataPoint } from './BurndownChart';
import { ScopeChurnWaterfall, ScopeChurnData } from './ScopeChurnWaterfall';
import { CumulativeFlowChart } from './CumulativeFlowChart';
import { MonteCarloSimulator } from './MonteCarloSimulator';
import { CfdDataPoint } from '@/lib/analytics/flow-diagnostics';
import { MonteCarloSimulationResult } from '@/lib/analytics/monte-carlo';
import { AnalyticsDashboardSkeleton } from './AnalyticsDashboardSkeleton';
import { PortfolioHealthMatrix } from './PortfolioHealthMatrix';
import { AnalyticsMetricFilters } from './AnalyticsMetricFilters';
import {
  ProjectTelemetry,
  StabilityFilter,
  computePortfolioTotals,
  isStabilityFilter,
  matchesStabilityFilter,
} from '@/lib/analytics/portfolio-aggregator';

const STABILITY_FILTER_PARAM = 'stabilityFilter';

export interface SprintAnalyticsViewProps {
  isLoading?: boolean;
  isValidating?: boolean;
  isRefreshing?: boolean;
  isCfdLoading?: boolean;
  cfdError?: string | null;
  kpiMetrics?: KpiMetrics;
  burndownData?: BurndownDataPoint[];
  churnData?: ScopeChurnData;
  cfdData?: CfdDataPoint[];
  monteCarlo?: MonteCarloSimulationResult | null;
  projectSlug: string;
  tenantSlug?: string;
  projectsTelemetry?: ProjectTelemetry[];
  selectedSprintId: string;
  simulationVelocities?: number[];
  forecastStartDate: string;
  isCustomDateRange?: boolean;
}

function SprintAnalyticsViewContent({
  isValidating = false,
  isRefreshing = false,
  isCfdLoading = false,
  cfdError = null,
  kpiMetrics,
  burndownData = [],
  churnData,
  cfdData = [],
  monteCarlo = null,
  projectSlug,
  tenantSlug,
  projectsTelemetry = [],
  selectedSprintId,
  simulationVelocities = [],
  forecastStartDate,
  isCustomDateRange = false,
}: Omit<SprintAnalyticsViewProps, 'isLoading'>) {
  const isPortfolio = projectSlug === 'all' || projectSlug === 'portfolio';

  const [stabilityFilter, setStabilityFilterState] = React.useState<StabilityFilter>('all');

  // Restore filter from the URL on mount
  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const v = new URL(window.location.href).searchParams.get(STABILITY_FILTER_PARAM);
      if (isStabilityFilter(v)) setStabilityFilterState(v);
    } catch {
      // ignore malformed URLs
    }
  }, []);

  // Shallow URL sync (no navigation)
  const setStabilityFilter = React.useCallback((next: StabilityFilter) => {
    setStabilityFilterState(next);
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      if (next === 'all') url.searchParams.delete(STABILITY_FILTER_PARAM);
      else url.searchParams.set(STABILITY_FILTER_PARAM, next);
      window.history.replaceState(null, '', url.toString());
    } catch {
      // ignore
    }
  }, []);

  const filteredProjects = React.useMemo(
    () => projectsTelemetry.filter((p) => matchesStabilityFilter(p, stabilityFilter)),
    [projectsTelemetry, stabilityFilter]
  );

  // When a filter is active, roll KPIs up over the matching subset of projects only
  const isFiltered = isPortfolio && stabilityFilter !== 'all';
  const subsetTotals = React.useMemo(() => computePortfolioTotals(filteredProjects), [filteredProjects]);

  const baseMetrics: KpiMetrics = kpiMetrics ?? {
    rollingVelocity: 0,
    sayDoRatio: 0,
    scopeVolatility: 0,
    remainingPoints: 0,
  };
  const effectiveMetrics: KpiMetrics = isFiltered
    ? {
        ...baseMetrics,
        rollingVelocity: subsetTotals.rollingVelocity,
        sayDoRatio: subsetTotals.sayDoPct,
        scopeVolatility: subsetTotals.volatilityPct,
        remainingPoints: subsetTotals.remainingPts,
        committedPoints: subsetTotals.baselinePts,
        deliveredPoints: subsetTotals.deliveredPts,
      }
    : baseMetrics;

  const baseChurn: ScopeChurnData = churnData ?? {
    baselineCommitted: 0,
    addedPoints: 0,
    droppedPoints: 0,
    finalDelivered: 0,
  };
  const effectiveChurnData: ScopeChurnData = isFiltered
    ? {
        baselineCommitted: subsetTotals.baselinePts,
        addedPoints: subsetTotals.addedPts,
        droppedPoints: subsetTotals.droppedPts,
        finalDelivered: subsetTotals.deliveredPts,
      }
    : baseChurn;

  return (
    <div className="space-y-6" data-testid="sprint-analytics-view">
      {isPortfolio && (
        <AnalyticsMetricFilters value={stabilityFilter} onChange={setStabilityFilter} />
      )}

      {/* KPI Metric Cards */}
      <section aria-label="Sprint Key Performance Indicators">
        <KpiMetricCards metrics={effectiveMetrics} isLoading={false} />
        {isCustomDateRange && (
          <div className="mt-2 text-[11px] text-amber-400/80 flex items-center gap-1.5 px-1 font-mono">
            <span className="font-semibold uppercase tracking-wider">Note:</span>
            Sprint KPI metrics reflect the entire selected sprint; charts reflect the custom date window.
          </div>
        )}
      </section>

      {isPortfolio && tenantSlug && (
        <PortfolioHealthMatrix
          tenantSlug={tenantSlug}
          projects={filteredProjects}
          sprintId={selectedSprintId}
        />
      )}

      {/* Analytics Visualizations Grid */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Burndown Slot */}
        <div className="w-full">
          <BurndownChart data={burndownData} isLoading={false} />
        </div>

        {/* Scope Churn Waterfall Slot */}
        <div className="w-full">
          <ScopeChurnWaterfall data={effectiveChurnData} isLoading={false} />
        </div>
      </section>

      {/* Cumulative Flow Diagram Slot */}
      <section className="w-full">
        <CumulativeFlowChart
          data={cfdData}
          isLoading={isCfdLoading && (!cfdData || cfdData.length === 0)}
          isValidating={isValidating || isRefreshing || isCfdLoading}
          error={cfdError}
        />
      </section>

      {/* Monte Carlo Release Forecasting */}
      <MonteCarloSimulator
        simulation={monteCarlo}
        isLoading={false}
        projectId={projectSlug}
        sprintId={selectedSprintId}
        remainingStoryPoints={effectiveMetrics.remainingPoints}
        historicalVelocities={simulationVelocities}
        startDate={forecastStartDate}
        sprintLengthDays={14}
      />
    </div>
  );
}

export function SprintAnalyticsView({
  isLoading = false,
  isValidating = false,
  isRefreshing = false,
  isCfdLoading = false,
  cfdError = null,
  kpiMetrics,
  burndownData = [],
  churnData,
  cfdData = [],
  monteCarlo = null,
  projectSlug,
  tenantSlug,
  projectsTelemetry = [],
  selectedSprintId,
  simulationVelocities = [],
  forecastStartDate,
  isCustomDateRange = false,
}: SprintAnalyticsViewProps) {
  if (isLoading) {
    return <AnalyticsDashboardSkeleton />;
  }

  return (
    <Suspense fallback={<AnalyticsDashboardSkeleton />}>
      <SprintAnalyticsViewContent
        isValidating={isValidating}
        isRefreshing={isRefreshing}
        isCfdLoading={isCfdLoading}
        cfdError={cfdError}
        kpiMetrics={kpiMetrics}
        burndownData={burndownData}
        churnData={churnData}
        cfdData={cfdData}
        monteCarlo={monteCarlo}
        projectSlug={projectSlug}
        tenantSlug={tenantSlug}
        projectsTelemetry={projectsTelemetry}
        selectedSprintId={selectedSprintId}
        simulationVelocities={simulationVelocities}
        forecastStartDate={forecastStartDate}
        isCustomDateRange={isCustomDateRange}
      />
    </Suspense>
  );
}

export default SprintAnalyticsView;
