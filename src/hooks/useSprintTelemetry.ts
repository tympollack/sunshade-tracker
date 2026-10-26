'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { KpiMetrics } from '@/components/analytics/KpiMetricCards';
import { BurndownDataPoint } from '@/components/analytics/BurndownChart';
import { ScopeChurnData } from '@/components/analytics/ScopeChurnWaterfall';
import { CfdDataPoint } from '@/lib/analytics/flow-diagnostics';
import { MonteCarloSimulationResult, runMonteCarloSimulation } from '@/lib/analytics/monte-carlo';
import { calculateRollingVelocity, calculateSayDoRatio, calculateSprintVolatility } from '@/lib/analytics/velocity-forecaster';

export interface UseSprintTelemetryOptions {
  tenantSlug: string;
  projectSlug: string;
  selectedSprintId?: string;
  startDate: string;
  endDate: string;
  isSprintDiscoveryPending?: boolean;
}

export interface UseSprintTelemetryResult {
  isLoading: boolean;
  isRefreshing: boolean;
  isValidating: boolean;
  isCfdLoading: boolean;
  cfdError: string | null;
  kpiMetrics: KpiMetrics;
  burndownData: BurndownDataPoint[];
  churnData: ScopeChurnData;
  cfdData: CfdDataPoint[];
  monteCarlo: MonteCarloSimulationResult | null;
  simulationVelocities: number[];
  forecastStartDate: string;
  refetch: () => Promise<void>;
}

export function useSprintTelemetry({
  tenantSlug,
  projectSlug,
  selectedSprintId = '',
  startDate,
  endDate,
  isSprintDiscoveryPending = false,
}: UseSprintTelemetryOptions): UseSprintTelemetryResult {
  const [telemetryLoaded, setTelemetryLoaded] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // When project or tenant changes, reset loaded state to ensure skeleton shows
  useEffect(() => {
    setTelemetryLoaded(false);
  }, [tenantSlug, projectSlug]);

  const isLoading = isSprintDiscoveryPending || !telemetryLoaded;

  // Pure initial states with zero fake numbers
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
  const [isCfdLoading, setIsCfdLoading] = useState(false);
  const [cfdError, setCfdError] = useState<string | null>(null);
  const [monteCarlo, setMonteCarlo] = useState<MonteCarloSimulationResult | null>(null);

  const forecastStartDate = useMemo(() => new Date().toISOString().split('T')[0], []);

  const fetchTelemetry = useCallback(async () => {
    if (isSprintDiscoveryPending) {
      return;
    }

    setIsRefreshing(true);
    try {
      // 1. Fetch Sprint Health & Metrics (propagating custom date bounds)
      const sprintQuery = selectedSprintId ? `&sprint_id=${encodeURIComponent(selectedSprintId)}` : '';
      const dateParams = `&startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`;
      const sprintRes = await fetch(
        `/api/v1/sprints/analytics?tenant_slug=${encodeURIComponent(tenantSlug)}&project_slug=${encodeURIComponent(projectSlug)}${sprintQuery}${dateParams}`
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
      setIsCfdLoading(true);
      setCfdError(null);
      try {
        const cfdRes = await fetch(
          `/api/v1/projects/${encodeURIComponent(projectSlug)}/analytics/cfd?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}&tenant_slug=${encodeURIComponent(tenantSlug)}`
        );
        if (cfdRes.ok) {
          const cfdJson = await cfdRes.json();
          if (Array.isArray(cfdJson.series)) {
            setCfdData(cfdJson.series);
          } else {
            setCfdData([]);
          }
        } else {
          const errData = await cfdRes.json().catch(() => ({}));
          setCfdError(errData.error || `Failed to fetch CFD telemetry (${cfdRes.status})`);
        }
      } catch (err: any) {
        setCfdError(err.message || 'Network error fetching CFD telemetry');
      } finally {
        setIsCfdLoading(false);
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
      setTelemetryLoaded(true);
      setIsRefreshing(false);
    }
  }, [tenantSlug, projectSlug, selectedSprintId, startDate, endDate, forecastStartDate, isSprintDiscoveryPending]);

  useEffect(() => {
    if (!isSprintDiscoveryPending) {
      fetchTelemetry();
    }
  }, [fetchTelemetry, isSprintDiscoveryPending]);

  return {
    isLoading,
    isRefreshing,
    isValidating: isRefreshing,
    isCfdLoading,
    cfdError,
    kpiMetrics,
    burndownData,
    churnData,
    cfdData,
    monteCarlo,
    simulationVelocities,
    forecastStartDate,
    refetch: fetchTelemetry,
  };
}

export default useSprintTelemetry;
