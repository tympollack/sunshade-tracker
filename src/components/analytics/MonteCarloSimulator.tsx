'use client';

import React, { useState, useEffect } from 'react';
import { Calendar, Sparkles } from 'lucide-react';
import {
  MonteCarloSimulationResult,
  MonteCarloCadenceUnit,
  CADENCE_OPTIONS,
  convertSprintsToCadence,
} from '@/lib/analytics/monte-carlo';

export interface MonteCarloSimulatorProps {
  simulation: MonteCarloSimulationResult | null;
  isLoading?: boolean;
  projectId?: string;
  sprintId?: string;
  remainingStoryPoints?: number;
  historicalVelocities?: number[];
  sprintLengthDays?: number;
  onCadenceChange?: (unit: MonteCarloCadenceUnit) => void;
}

const LOCAL_STORAGE_CADENCE_KEY = 'trk_mc_cadence_unit';

export function MonteCarloSimulator({
  simulation,
  isLoading = false,
  projectId,
  sprintId,
  remainingStoryPoints,
  historicalVelocities = [],
  sprintLengthDays = 14,
  onCadenceChange,
}: MonteCarloSimulatorProps) {
  const [cadenceUnit, setCadenceUnit] = useState<MonteCarloCadenceUnit>('sprint');

  // Load user preference from localStorage on mount
  useEffect(() => {
    try {
      const savedUnit = localStorage.getItem(LOCAL_STORAGE_CADENCE_KEY) as MonteCarloCadenceUnit | null;
      if (savedUnit && CADENCE_OPTIONS.some((opt) => opt.unit === savedUnit)) {
        setCadenceUnit(savedUnit);
        onCadenceChange?.(savedUnit);
      }
    } catch (e) {
      // LocalStorage access may fail in restricted sandbox / privacy mode
    }
  }, [onCadenceChange]);

  const handleCadenceChange = (newUnit: MonteCarloCadenceUnit) => {
    setCadenceUnit(newUnit);
    try {
      localStorage.setItem(LOCAL_STORAGE_CADENCE_KEY, newUnit);
    } catch (e) {
      // Ignore
    }
    onCadenceChange?.(newUnit);
  };

  const effectiveRemainingPts = remainingStoryPoints ?? simulation?.remainingStoryPoints ?? 0;
  const effectiveSprintLength = simulation?.sprintLengthDays ?? sprintLengthDays;

  // If loading or calculating, render skeleton cards
  if (isLoading || !simulation) {
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
                className="bg-slate-900/60 border border-slate-800 animate-pulse rounded-lg p-4 h-24 flex flex-col justify-between"
                data-testid="mc-skeleton-card"
              >
                <div className="h-3 w-32 bg-slate-800 rounded" />
                <div className="h-6 w-24 bg-slate-800/80 rounded" />
                <div className="h-3 w-28 bg-slate-800/50 rounded" />
              </div>
            ))}
          </div>
        </section>
      );
    }
    return null;
  }

  const p50Display = convertSprintsToCadence(simulation.percentiles.p50, cadenceUnit, effectiveSprintLength);
  const p85Display = convertSprintsToCadence(simulation.percentiles.p85, cadenceUnit, effectiveSprintLength);
  const p95Display = convertSprintsToCadence(simulation.percentiles.p95, cadenceUnit, effectiveSprintLength);

  return (
    <section
      aria-label="Monte Carlo Milestone Simulator"
      className="bg-slate-900/80 border border-slate-800 rounded-xl p-5 shadow-sm"
      data-testid="mc-simulator-container"
    >
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-lg bg-cyan-950/60 text-cyan-400 border border-cyan-800/50">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-100">
              Monte Carlo Milestone Simulator
            </h3>
            <p className="text-xs text-slate-400">
              Probabilistic completion forecasting over {simulation.iterations.toLocaleString()} trials ({simulation.executionTimeMs}ms)
              {!simulation.deliveredWithinHorizon && simulation.censoredTrials > 0 && (
                <span className="text-amber-400 ml-2">({simulation.censoredTrials} trials exceeded 500 sprints)</span>
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

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* 50% Confidence Card */}
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3" data-testid="mc-p50-card">
          <div className="text-xs text-slate-400 font-medium">50% Confidence (Aggressive)</div>
          <div className="text-xl font-bold text-emerald-400 font-mono mt-1" data-testid="mc-p50-value">
            {p50Display.label}
          </div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-1" data-testid="mc-p50-date">
            <Calendar className="w-3 h-3 text-slate-500" />
            {simulation.projectedDates.p50 ? simulation.projectedDates.p50.split('T')[0] : 'Exceeds horizon'}
          </div>
        </div>

        {/* 85% Confidence Card */}
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3" data-testid="mc-p85-card">
          <div className="text-xs text-slate-400 font-medium">85% Confidence (Commitment)</div>
          <div className="text-xl font-bold text-cyan-400 font-mono mt-1" data-testid="mc-p85-value">
            {p85Display.label}
          </div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-1" data-testid="mc-p85-date">
            <Calendar className="w-3 h-3 text-slate-500" />
            {simulation.projectedDates.p85 ? simulation.projectedDates.p85.split('T')[0] : 'Exceeds horizon'}
          </div>
        </div>

        {/* 95% Confidence Card */}
        <div className="bg-slate-800/50 border border-slate-700/60 rounded-lg p-3" data-testid="mc-p95-card">
          <div className="text-xs text-slate-400 font-medium">95% Confidence (Conservative)</div>
          <div className="text-xl font-bold text-amber-400 font-mono mt-1" data-testid="mc-p95-value">
            {p95Display.label}
          </div>
          <div className="text-xs text-slate-400 mt-1 flex items-center gap-1" data-testid="mc-p95-date">
            <Calendar className="w-3 h-3 text-slate-500" />
            {simulation.projectedDates.p95 ? simulation.projectedDates.p95.split('T')[0] : 'Exceeds horizon'}
          </div>
        </div>
      </div>
    </section>
  );
}
