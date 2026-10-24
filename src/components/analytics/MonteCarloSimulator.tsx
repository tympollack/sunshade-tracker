'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Calendar, Sparkles } from 'lucide-react';
import {
  MonteCarloSimulationResult,
  MonteCarloCadenceUnit,
  CADENCE_OPTIONS,
  convertSprintsToCadence,
  generateMonteCarloCacheKey,
  getCachedMonteCarlo,
  setCachedMonteCarlo,
  runMonteCarloSimulation,
  MonteCarloSimulationInput,
} from '@/lib/analytics/monte-carlo';

export interface MonteCarloSimulatorProps {
  simulation?: MonteCarloSimulationResult | null;
  isLoading?: boolean;
  isCalculating?: boolean;
  projectId?: string;
  sprintId?: string;
  remainingStoryPoints?: number;
  historicalVelocities?: number[];
  iterations?: number;
  sprintLengthDays?: number;
  startDate?: Date | string;
  onCadenceChange?: (unit: MonteCarloCadenceUnit) => void;
}

const LOCAL_STORAGE_CADENCE_KEY = 'trk_mc_cadence_unit';

export function MonteCarloSimulator({
  simulation: propSimulation,
  isLoading = false,
  isCalculating: propIsCalculating = false,
  projectId,
  sprintId,
  remainingStoryPoints,
  historicalVelocities = [],
  iterations = 1000,
  sprintLengthDays = 14,
  startDate,
  onCadenceChange,
}: MonteCarloSimulatorProps) {
  const [cadenceUnit, setCadenceUnit] = useState<MonteCarloCadenceUnit>('sprint');
  const [internalIsCalculating, setInternalIsCalculating] = useState(false);
  const [simResult, setSimResult] = useState<MonteCarloSimulationResult | null>(propSimulation ?? null);

  const effectiveRemainingPts = remainingStoryPoints ?? propSimulation?.remainingStoryPoints ?? 0;
  const effectiveSprintLength = propSimulation?.sprintLengthDays ?? sprintLengthDays;

  // Sync propSimulation changes to local state
  useEffect(() => {
    if (propSimulation) {
      setSimResult(propSimulation);
    }
  }, [propSimulation]);

  // Load user preference from localStorage on mount
  useEffect(() => {
    try {
      const savedUnit = localStorage.getItem(LOCAL_STORAGE_CADENCE_KEY) as MonteCarloCadenceUnit | null;
      if (savedUnit && CADENCE_OPTIONS.some((opt) => opt.unit === savedUnit)) {
        setCadenceUnit(savedUnit);
        onCadenceChange?.(savedUnit);
      }
    } catch {
      // Ignore localStorage access issues in sandbox
    }
  }, [onCadenceChange]);

  // Generate deterministic cache key with full simulation input space
  const cacheKey = useMemo(() => {
    return generateMonteCarloCacheKey({
      projectId,
      sprintId,
      targetPts: effectiveRemainingPts,
      cadenceUnit,
      trialCount: iterations,
      historicalVelocities,
      sprintLengthDays: effectiveSprintLength,
      startDate,
    });
  }, [
    projectId,
    sprintId,
    effectiveRemainingPts,
    cadenceUnit,
    iterations,
    historicalVelocities,
    effectiveSprintLength,
    startDate,
  ]);

  // Effect to resolve simulation using Prop -> Cache -> Background Web Worker / Async Chunker
  const activeCalcRef = useRef<number | null>(null);

  useEffect(() => {
    // 1. If prop simulation is provided and matches target points, prioritize it over stale cache
    if (propSimulation && propSimulation.remainingStoryPoints === effectiveRemainingPts) {
      setSimResult(propSimulation);
      setCachedMonteCarlo(cacheKey, propSimulation);
      setInternalIsCalculating(false);
      return;
    }

    // 2. Check local browser cache next (instant 0ms)
    const cached = getCachedMonteCarlo(cacheKey);
    if (cached) {
      setSimResult(cached);
      setInternalIsCalculating(false);
      return;
    }

    // 3. If zero remaining points or no valid velocities, don't execute
    const hasProgress = historicalVelocities.some((v) => v > 0);
    if (effectiveRemainingPts <= 0 || !hasProgress) {
      setSimResult(propSimulation ?? null);
      setInternalIsCalculating(false);
      return;
    }

    // 4. Offload trial computation to Web Worker or async timer chunking
    setInternalIsCalculating(true);
    let cancelled = false;

    if (activeCalcRef.current) {
      clearTimeout(activeCalcRef.current);
    }

    const inputPayload: MonteCarloSimulationInput = {
      remainingStoryPoints: effectiveRemainingPts,
      historicalVelocities,
      iterations,
      sprintLengthDays: effectiveSprintLength,
      startDate,
      cadenceUnit,
    };

    // Attempt Web Worker execution if available in browser
    if (typeof window !== 'undefined' && typeof Worker !== 'undefined') {
      try {
        const worker = new Worker(new URL('../../workers/monteCarlo.worker.ts', import.meta.url));
        worker.onmessage = (event: MessageEvent<MonteCarloSimulationResult & { error?: string }>) => {
          worker.terminate();
          if (!cancelled) {
            const computed = event.data?.error ? runMonteCarloSimulation(inputPayload) : event.data;
            setCachedMonteCarlo(cacheKey, computed);
            setSimResult(computed);
            setInternalIsCalculating(false);
          }
        };
        worker.onerror = () => {
          worker.terminate();
          if (!cancelled) {
            const computed = runMonteCarloSimulation(inputPayload);
            setCachedMonteCarlo(cacheKey, computed);
            setSimResult(computed);
            setInternalIsCalculating(false);
          }
        };
        worker.postMessage(inputPayload);
        return () => {
          cancelled = true;
          worker.terminate();
        };
      } catch {
        // Fall back to timer chunking
      }
    }

    // Fallback: asynchronous timer chunker (compatible with SSR and headless test suites)
    activeCalcRef.current = window.setTimeout(() => {
      try {
        const computed = runMonteCarloSimulation(inputPayload);
        if (!cancelled) {
          setCachedMonteCarlo(cacheKey, computed);
          setSimResult(computed);
        }
      } finally {
        if (!cancelled) {
          setInternalIsCalculating(false);
        }
      }
    }, 0);

    return () => {
      cancelled = true;
      if (activeCalcRef.current) {
        clearTimeout(activeCalcRef.current);
      }
    };
  }, [
    cacheKey,
    propSimulation,
    effectiveRemainingPts,
    historicalVelocities,
    iterations,
    effectiveSprintLength,
    startDate,
    cadenceUnit,
  ]);

  const handleCadenceChange = (newUnit: MonteCarloCadenceUnit) => {
    setCadenceUnit(newUnit);
    try {
      localStorage.setItem(LOCAL_STORAGE_CADENCE_KEY, newUnit);
    } catch {
      // Ignore
    }
    onCadenceChange?.(newUnit);
  };

  const isCalculating = propIsCalculating || internalIsCalculating;

  // Render initial loading skeleton container when entire section is fetching data
  if (isLoading) {
    return (
      <section
        aria-label="Monte Carlo Milestone Simulator"
        className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm"
        data-testid="mc-simulator-loading"
      >
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-lg bg-cyan-950/60 text-cyan-400 border border-cyan-800/50">
              <Sparkles className="w-4 h-4 animate-spin" />
            </div>
            <div className="space-y-1">
              <div className="h-4 w-48 bg-slate-800 rounded animate-pulse" />
              <div className="h-3 w-64 bg-slate-800/60 rounded animate-pulse" />
            </div>
          </div>
          <div className="h-6 w-28 bg-slate-800 rounded animate-pulse" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          {[1, 2, 3].map((idx) => (
            <div
              key={idx}
              className="rounded-lg border border-slate-800/80 bg-slate-900/60 p-4 space-y-3 animate-pulse min-h-[108px] flex flex-col justify-between"
              data-testid="mc-skeleton-card"
            >
              <div className="h-3 w-28 bg-slate-800 rounded" />
              <div className="h-7 w-20 bg-slate-800 rounded mt-2" />
              <div className="h-3.5 w-24 bg-slate-800/70 rounded mt-1" />
            </div>
          ))}
        </div>
      </section>
    );
  }

  const p50Display = simResult
    ? convertSprintsToCadence(simResult.percentiles.p50, cadenceUnit, effectiveSprintLength)
    : { label: '--', value: 0, unit: cadenceUnit };
  const p85Display = simResult
    ? convertSprintsToCadence(simResult.percentiles.p85, cadenceUnit, effectiveSprintLength)
    : { label: '--', value: 0, unit: cadenceUnit };
  const p95Display = simResult
    ? convertSprintsToCadence(simResult.percentiles.p95, cadenceUnit, effectiveSprintLength)
    : { label: '--', value: 0, unit: cadenceUnit };

  return (
    <section
      aria-label="Monte Carlo Milestone Simulator"
      className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm"
      data-testid="mc-simulator-container"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-cyan-950/60 text-cyan-400 border border-cyan-800/50">
            <Sparkles className={`w-4 h-4 ${isCalculating ? 'animate-spin' : ''}`} />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">
              Monte Carlo Milestone Simulator
            </h3>
            <p className="text-xs text-slate-400 flex items-center gap-1.5" data-testid="mc-header-status">
              {isCalculating ? (
                <span className="inline-flex items-center gap-1.5 text-cyan-400 font-medium animate-pulse" data-testid="mc-calculating-badge">
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-ping inline-block" />
                  Simulating {iterations.toLocaleString()} runs...
                </span>
              ) : simResult ? (
                <>
                  Probabilistic completion forecasting over {simResult.iterations.toLocaleString()} trials (Completed in {simResult.executionTimeMs}ms)
                  {!simResult.deliveredWithinHorizon && simResult.censoredTrials > 0 && (
                    <span className="text-amber-400 ml-2">({simResult.censoredTrials} trials exceeded 500 sprints)</span>
                  )}
                </>
              ) : (
                'Probabilistic completion forecasting'
              )}
            </p>
          </div>
        </div>

        {/* Right Controls: Cadence Selector & Target Pts */}
        <div className="flex flex-wrap items-center gap-3 ml-auto">
          <div className="flex items-center gap-1.5 bg-slate-800/80 border border-slate-700/80 rounded-lg px-2.5 py-1 text-xs">
            <label htmlFor="mc-cadence-select" className="text-slate-400 font-medium">
              Cadence:
            </label>
            <select
              id="mc-cadence-select"
              value={cadenceUnit}
              onChange={(e) => handleCadenceChange(e.target.value as MonteCarloCadenceUnit)}
              className="bg-transparent text-slate-200 text-xs font-semibold focus:outline-none cursor-pointer"
              data-testid="mc-cadence-selector"
            >
              {CADENCE_OPTIONS.map((opt) => (
                <option key={opt.unit} value={opt.unit} className="bg-slate-800 text-slate-100">
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div className="text-xs text-slate-400 font-mono whitespace-nowrap">
            Target: {effectiveRemainingPts} remaining pts
          </div>
        </div>
      </div>

      {/* Confidence Panels: Shimmer Skeletons during Execution vs Rendered Results */}
      {isCalculating || !simResult ? (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4" data-testid="mc-skeleton-grid">
          {[
            { label: '50% Confidence (Aggressive)' },
            { label: '85% Confidence (Commitment)' },
            { label: '95% Confidence (Conservative)' },
          ].map((_, idx) => (
            <div
              key={idx}
              className="rounded-lg border border-slate-800/80 bg-slate-900/60 p-4 space-y-3 animate-pulse min-h-[108px] flex flex-col justify-between"
              data-testid="mc-skeleton-card"
            >
              <div className="h-3 w-28 bg-slate-800 rounded" />
              <div className="h-7 w-20 bg-slate-800 rounded mt-2" />
              <div className="h-3.5 w-24 bg-slate-800/70 rounded mt-1" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 transition-opacity duration-200" data-testid="mc-results-grid">
          {/* 50% Confidence Card */}
          <div className="min-h-[108px] bg-slate-800/50 border border-slate-700/60 rounded-lg p-4 flex flex-col justify-between" data-testid="mc-p50-card">
            <div className="text-xs text-slate-400 font-medium">50% Confidence (Aggressive)</div>
            <div className="text-xl font-bold text-emerald-400 font-mono mt-1" data-testid="mc-p50-value">
              {p50Display.label}
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1" data-testid="mc-p50-date">
              <Calendar className="w-3 h-3 text-slate-500" />
              {simResult.projectedDates.p50 ? simResult.projectedDates.p50.split('T')[0] : 'Exceeds horizon'}
            </div>
          </div>

          {/* 85% Confidence Card */}
          <div className="min-h-[108px] bg-slate-800/50 border border-slate-700/60 rounded-lg p-4 flex flex-col justify-between" data-testid="mc-p85-card">
            <div className="text-xs text-slate-400 font-medium">85% Confidence (Commitment)</div>
            <div className="text-xl font-bold text-cyan-400 font-mono mt-1" data-testid="mc-p85-value">
              {p85Display.label}
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1" data-testid="mc-p85-date">
              <Calendar className="w-3 h-3 text-slate-500" />
              {simResult.projectedDates.p85 ? simResult.projectedDates.p85.split('T')[0] : 'Exceeds horizon'}
            </div>
          </div>

          {/* 95% Confidence Card */}
          <div className="min-h-[108px] bg-slate-800/50 border border-slate-700/60 rounded-lg p-4 flex flex-col justify-between" data-testid="mc-p95-card">
            <div className="text-xs text-slate-400 font-medium">95% Confidence (Conservative)</div>
            <div className="text-xl font-bold text-amber-400 font-mono mt-1" data-testid="mc-p95-value">
              {p95Display.label}
            </div>
            <div className="text-xs text-slate-400 mt-1 flex items-center gap-1" data-testid="mc-p95-date">
              <Calendar className="w-3 h-3 text-slate-500" />
              {simResult.projectedDates.p95 ? simResult.projectedDates.p95.split('T')[0] : 'Exceeds horizon'}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
