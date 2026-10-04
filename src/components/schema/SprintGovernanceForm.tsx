'use client';

import React from 'react';
import { Shield, Zap, Lock, Unlock, HelpCircle, Minus, Plus } from 'lucide-react';
import { MetricRules } from '@/types/tracker';
import { DEFAULT_METRIC_RULES } from '@/lib/services/sprintAnalyticsService';

export interface SprintGovernanceFormProps {
  metrics?: MetricRules;
  onChange: (metrics: MetricRules) => void;
  readOnly?: boolean;
}

export function SprintGovernanceForm({
  metrics,
  onChange,
  readOnly = false,
}: SprintGovernanceFormProps) {
  // Merge incoming metrics with default fallback values
  const velocityWindow = Math.min(
    10,
    Math.max(1, typeof metrics?.velocity_window === 'number' ? metrics.velocity_window : DEFAULT_METRIC_RULES.velocity_window)
  );

  const rawRunway = typeof metrics?.late_runway_threshold === 'number'
    ? metrics.late_runway_threshold
    : DEFAULT_METRIC_RULES.late_runway_threshold;
  const runwayPercent = Math.min(100, Math.max(10, Math.round(rawRunway <= 1 ? rawRunway * 100 : rawRunway)));

  const lateCapPoints = Math.max(
    0,
    typeof metrics?.late_runway_max_points === 'number'
      ? metrics.late_runway_max_points
      : DEFAULT_METRIC_RULES.late_runway_max_points
  );

  const healthyThreshold = Math.min(
    100,
    Math.max(
      0,
      typeof metrics?.reliability_healthy_threshold === 'number'
        ? metrics.reliability_healthy_threshold
        : DEFAULT_METRIC_RULES.reliability_healthy_threshold
    )
  );

  const enforceZeroSum =
    typeof metrics?.enforce_zero_sum === 'boolean'
      ? metrics.enforce_zero_sum
      : DEFAULT_METRIC_RULES.enforce_zero_sum;

  const isLockedEstimates =
    typeof metrics?.lock_estimates === 'boolean'
      ? metrics.lock_estimates
      : typeof metrics?.lock_estimates_in_active_sprint === 'boolean'
      ? metrics.lock_estimates_in_active_sprint
      : DEFAULT_METRIC_RULES.lock_estimates_in_active_sprint;

  const handleUpdate = (patch: Partial<MetricRules>) => {
    if (readOnly) return;
    const base = metrics || { ...DEFAULT_METRIC_RULES };
    const updated: MetricRules = {
      ...base,
      ...patch,
    };
    onChange(updated);
  };

  const setVelocityWindow = (val: number) => {
    const clamped = Math.min(10, Math.max(1, Math.round(val)));
    handleUpdate({ velocity_window: clamped });
  };

  const setRunwayPercent = (val: number) => {
    const clamped = Math.min(100, Math.max(10, Math.round(val)));
    handleUpdate({ late_runway_threshold: Number((clamped / 100).toFixed(2)) });
  };

  const setLateCap = (val: number) => {
    const clamped = Math.max(0, isNaN(val) ? 0 : Math.round(val));
    handleUpdate({ late_runway_max_points: clamped });
  };

  const setHealthyThreshold = (val: number) => {
    const clamped = Math.min(100, Math.max(0, isNaN(val) ? 85 : Math.round(val)));
    handleUpdate({ reliability_healthy_threshold: clamped });
  };

  const toggleZeroSum = () => {
    handleUpdate({ enforce_zero_sum: !enforceZeroSum });
  };

  const toggleLockEstimates = () => {
    const nextVal = !isLockedEstimates;
    handleUpdate({
      lock_estimates: nextVal,
      lock_estimates_in_active_sprint: nextVal,
    });
  };

  return (
    <div className="p-5 rounded-xl bg-slate-950 border border-slate-800 space-y-6 shadow-sm">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-900 pb-3">
        <div className="flex items-center space-x-2.5">
          <div className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400">
            <Shield className="w-4 h-4" />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
              Sprint Metric Rules (Governance)
              <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-slate-900 text-emerald-400 border border-emerald-900/40">
                sprint_metrics
              </span>
            </h4>
            <p className="text-xs text-slate-400">
              Configure telemetry thresholds, zero-sum swap protections, and sizing guardrails for active sprints.
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* 1. Velocity Window Stepper */}
        <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-300">
              <label htmlFor="input-velocity-window" className="flex items-center gap-1.5 cursor-pointer">
                <span>Velocity Window</span>
                <span title="Rolling window size in historical sprints (1-10)">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                </span>
              </label>
              <span className="text-[11px] font-mono text-emerald-400">
                {velocityWindow} {velocityWindow === 1 ? 'sprint' : 'sprints'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Number of past sprints averaged for rolling velocity.</p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              aria-label="Decrease velocity window"
              disabled={readOnly || velocityWindow <= 1}
              onClick={() => setVelocityWindow(velocityWindow - 1)}
              className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700/60 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              id="input-velocity-window"
              type="number"
              min={1}
              max={10}
              value={velocityWindow}
              disabled={readOnly}
              onChange={(e) => setVelocityWindow(parseInt(e.target.value, 10) || 1)}
              className="w-full text-center py-1 bg-slate-950 border border-slate-700 rounded-md text-emerald-300 text-xs font-mono font-bold focus:outline-none focus:border-emerald-500 disabled:opacity-50"
            />
            <button
              type="button"
              aria-label="Increase velocity window"
              disabled={readOnly || velocityWindow >= 10}
              onClick={() => setVelocityWindow(velocityWindow + 1)}
              className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700/60 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 2. Runway Percentage Slider / Input */}
        <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-300">
              <label htmlFor="input-runway-percent" className="flex items-center gap-1.5 cursor-pointer">
                <span>Runway Cutoff</span>
                <span title="Elapsed sprint percentage that triggers late inflow guardrails (10%-100%)">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                </span>
              </label>
              <span className="text-[11px] font-mono text-amber-400 font-semibold">{runwayPercent}%</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Sprint elapsed ratio before late-inflow limits trigger.</p>
          </div>

          <div className="space-y-2">
            <input
              id="input-runway-slider"
              type="range"
              min={10}
              max={100}
              step={5}
              value={runwayPercent}
              disabled={readOnly}
              onChange={(e) => setRunwayPercent(parseInt(e.target.value, 10))}
              aria-label="Runway Cutoff Slider"
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-amber-500 disabled:opacity-50"
            />
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span>10%</span>
              <input
                id="input-runway-percent"
                type="number"
                min={10}
                max={100}
                value={runwayPercent}
                disabled={readOnly}
                onChange={(e) => setRunwayPercent(parseInt(e.target.value, 10) || 10)}
                aria-label="Runway Cutoff Percentage"
                className="w-14 text-center py-0.5 bg-slate-950 border border-slate-700 rounded text-amber-300 text-xs font-mono font-bold focus:outline-none focus:border-amber-500"
              />
              <span>100%</span>
            </div>
          </div>
        </div>

        {/* 3. Late Cap Points Input */}
        <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-300">
              <label htmlFor="input-late-cap" className="flex items-center gap-1.5 cursor-pointer">
                <span>Late Inflow Cap</span>
                <span title="Max story points permissible for an inflow item without rejection">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                </span>
              </label>
              <span className="text-[11px] font-mono text-amber-300 font-semibold">{lateCapPoints} pts</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Maximum points allowed on late items without rejection.</p>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              aria-label="Decrease late inflow cap"
              disabled={readOnly || lateCapPoints <= 0}
              onClick={() => setLateCap(lateCapPoints - 1)}
              className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700/60 transition-colors"
            >
              <Minus className="w-3.5 h-3.5" />
            </button>
            <input
              id="input-late-cap"
              type="number"
              min={0}
              value={lateCapPoints}
              disabled={readOnly}
              onChange={(e) => setLateCap(Math.max(0, parseInt(e.target.value, 10) || 0))}
              className="w-full text-center py-1 bg-slate-950 border border-slate-700 rounded-md text-amber-300 text-xs font-mono font-bold focus:outline-none focus:border-amber-500 disabled:opacity-50"
            />
            <button
              type="button"
              aria-label="Increase late inflow cap"
              disabled={readOnly}
              onClick={() => setLateCap(lateCapPoints + 1)}
              className="p-1.5 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed border border-slate-700/60 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 4. Healthy Reliability Threshold % */}
        <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between text-xs font-medium text-slate-300">
              <label htmlFor="input-healthy-threshold" className="flex items-center gap-1.5 cursor-pointer">
                <span>Healthy Say/Do</span>
                <span title="Target Say/Do commitment reliability ratio to qualify as healthy green (0-100%)">
                  <HelpCircle className="w-3.5 h-3.5 text-slate-500" />
                </span>
              </label>
              <span className="text-[11px] font-mono text-emerald-400 font-semibold">&gt;={healthyThreshold}%</span>
            </div>
            <p className="text-[11px] text-slate-500 mt-1">Minimum Say/Do ratio for green sprint status.</p>
          </div>

          <div className="space-y-2">
            <input
              id="input-healthy-slider"
              type="range"
              min={0}
              max={100}
              step={5}
              value={healthyThreshold}
              disabled={readOnly}
              onChange={(e) => setHealthyThreshold(parseInt(e.target.value, 10))}
              aria-label="Healthy Say/Do Threshold Slider"
              className="w-full h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer accent-emerald-500 disabled:opacity-50"
            />
            <div className="flex items-center justify-between text-[10px] text-slate-500 font-mono">
              <span>0%</span>
              <input
                id="input-healthy-threshold"
                type="number"
                min={0}
                max={100}
                value={healthyThreshold}
                disabled={readOnly}
                onChange={(e) => setHealthyThreshold(parseInt(e.target.value, 10) || 0)}
                aria-label="Healthy Say/Do Threshold Percentage"
                className="w-14 text-center py-0.5 bg-slate-950 border border-slate-700 rounded text-emerald-300 text-xs font-mono font-bold focus:outline-none focus:border-emerald-500"
              />
              <span>100%</span>
            </div>
          </div>
        </div>
      </div>

      {/* Toggles: Zero-Sum Enforcement & Estimate Locking */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
        {/* enforce_zero_sum toggle */}
        <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Zap className={`w-4 h-4 ${enforceZeroSum ? 'text-amber-400' : 'text-slate-500'}`} />
              <span className="text-xs font-semibold text-slate-200">Zero-Sum Backlog Swaps</span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                  enforceZeroSum
                    ? 'bg-amber-950/60 text-amber-300 border border-amber-800/40'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {enforceZeroSum ? 'enabled' : 'disabled'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Require equivalent unstarted story point ejections when adding work to an active sprint.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={enforceZeroSum}
            aria-label="Toggle Zero-Sum Enforcement"
            disabled={readOnly}
            onClick={toggleZeroSum}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-emerald-500/50 disabled:opacity-50 disabled:cursor-not-allowed ${
              enforceZeroSum ? 'bg-emerald-500' : 'bg-slate-700'
            }`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                enforceZeroSum ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* lock_estimates toggle */}
        <div className="p-4 rounded-lg bg-slate-900/60 border border-slate-800 flex items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              {isLockedEstimates ? (
                <Lock className="w-4 h-4 text-sky-400" />
              ) : (
                <Unlock className="w-4 h-4 text-slate-500" />
              )}
              <span className="text-xs font-semibold text-slate-200">Lock Estimates in Active Sprints</span>
              <span
                className={`text-[10px] font-mono px-2 py-0.5 rounded font-semibold ${
                  isLockedEstimates
                    ? 'bg-sky-950/60 text-sky-300 border border-sky-800/40'
                    : 'bg-slate-800 text-slate-400'
                }`}
              >
                {isLockedEstimates ? 'locked' : 'unlocked'}
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Prevent mutating story points or point estimates once a sprint has been started.
            </p>
          </div>

          <button
            type="button"
            role="switch"
            aria-checked={isLockedEstimates}
            aria-label="Toggle Estimate Locking"
            disabled={readOnly}
            onClick={toggleLockEstimates}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-sky-500/50 disabled:opacity-50 disabled:cursor-not-allowed ${
              isLockedEstimates ? 'bg-sky-500' : 'bg-slate-700'
            }`}
          >
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-lg ring-0 transition duration-200 ease-in-out ${
                isLockedEstimates ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>
      </div>
    </div>
  );
}
