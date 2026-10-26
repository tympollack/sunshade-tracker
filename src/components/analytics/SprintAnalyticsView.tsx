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

export interface SprintAnalyticsViewProps {
  isLoading?: boolean;
  isValidating?: boolean;
  isRefreshing?: boolean;
  kpiMetrics?: KpiMetrics;
  burndownData?: BurndownDataPoint[];
  churnData?: ScopeChurnData;
  cfdData?: CfdDataPoint[];
  monteCarlo?: MonteCarloSimulationResult | null;
  projectSlug: string;
  selectedSprintId: string;
  simulationVelocities?: number[];
  forecastStartDate: string;
  isCustomDateRange?: boolean;
}

function SprintAnalyticsViewContent({
  isValidating = false,
  isRefreshing = false,
  kpiMetrics,
  burndownData = [],
  churnData,
  cfdData = [],
  monteCarlo = null,
  projectSlug,
  selectedSprintId,
  simulationVelocities = [],
  forecastStartDate,
  isCustomDateRange = false,
}: Omit<SprintAnalyticsViewProps, 'isLoading'>) {
  const effectiveMetrics: KpiMetrics = kpiMetrics ?? {
    rollingVelocity: 0,
    sayDoRatio: 0,
    scopeVolatility: 0,
    remainingPoints: 0,
  };

  const effectiveChurnData: ScopeChurnData = churnData ?? {
    baselineCommitted: 0,
    addedPoints: 0,
    droppedPoints: 0,
    finalDelivered: 0,
  };

  return (
    <div className="space-y-6" data-testid="sprint-analytics-view">
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
          isLoading={false}
          isValidating={isValidating || isRefreshing}
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
  kpiMetrics,
  burndownData = [],
  churnData,
  cfdData = [],
  monteCarlo = null,
  projectSlug,
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
    </Suspense>
  );
}

export default SprintAnalyticsView;
