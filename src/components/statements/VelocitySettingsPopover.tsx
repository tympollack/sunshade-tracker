'use client';

import React, { useState, useEffect } from 'react';
import { Settings, X, Check, Loader2, Sparkles, Sliders, RotateCcw } from 'lucide-react';
import type { VelocitySettingsConfig, VelocitySettingsResult } from '@/app/actions/settingsActions';

export interface VelocitySettingsProject {
  id: string;
  name: string;
  slug: string;
  currentRatio: number;
  isCustom: boolean;
}

export interface VelocitySettingsPopoverProps {
  tenantSlug: string;
  defaultRatio: number;
  projects?: VelocitySettingsProject[];
  onRatioSimulate?: (simulatedRatio: number | null) => void;
  onSettingsSaved?: (newDefaultRatio: number) => void;
  onSave?: (tenantSlug: string, config: VelocitySettingsConfig) => Promise<VelocitySettingsResult>;
  className?: string;
}

const EMPTY_PROJECTS: VelocitySettingsProject[] = [];

export function VelocitySettingsPopover({
  tenantSlug,
  defaultRatio = 2.0,
  projects = EMPTY_PROJECTS,
  onRatioSimulate,
  onSettingsSaved,
  onSave,
  className = '',
}: VelocitySettingsPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [baselineRatio, setBaselineRatio] = useState(defaultRatio);
  const [isSimulating, setIsSimulating] = useState(false);

  // Per-project override state
  const [projectOverrides, setProjectOverrides] = useState<
    Record<string, { inherit: boolean; ratio: number }>
  >({});

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    setBaselineRatio(defaultRatio);
  }, [defaultRatio]);

  // Initialize project overrides from props
  useEffect(() => {
    if (!projects || projects.length === 0) return;
    const initialMap: Record<string, { inherit: boolean; ratio: number }> = {};
    for (const p of projects) {
      initialMap[p.id] = {
        inherit: !p.isCustom,
        ratio: p.currentRatio || defaultRatio,
      };
    }
    setProjectOverrides(initialMap);
  }, [projects, defaultRatio]);

  const handleBaselineChange = (val: number) => {
    const clamped = Math.max(0.5, Math.min(8.0, Math.round(val * 4) / 4));
    setBaselineRatio(clamped);
    if (isSimulating) {
      onRatioSimulate?.(clamped);
    }
  };

  const handleSimulateToggle = (checked: boolean) => {
    setIsSimulating(checked);
    if (checked) {
      onRatioSimulate?.(baselineRatio);
    } else {
      onRatioSimulate?.(null);
    }
  };

  const handleProjectInheritToggle = (projId: string, inherit: boolean) => {
    setProjectOverrides((prev) => ({
      ...prev,
      [projId]: {
        inherit,
        ratio: prev[projId]?.ratio || baselineRatio,
      },
    }));
  };

  const handleProjectRatioChange = (projId: string, val: number) => {
    const clamped = Math.max(0.5, Math.min(8.0, Math.round(val * 4) / 4));
    setProjectOverrides((prev) => ({
      ...prev,
      [projId]: {
        inherit: false,
        ratio: clamped,
      },
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(false);

    try {
      const overridesList = Object.entries(projectOverrides).map(([projectId, conf]) => ({
        projectId,
        velocityRatio: conf.inherit ? null : conf.ratio,
      }));

      let res: VelocitySettingsResult;
      if (onSave) {
        res = await onSave(tenantSlug, {
          defaultHoursPerPoint: baselineRatio,
          projectOverrides: overridesList,
        });
      } else {
        const { updateVelocitySettingsAction } = await import('@/app/actions/settingsActions');
        res = await updateVelocitySettingsAction(tenantSlug, {
          defaultHoursPerPoint: baselineRatio,
          projectOverrides: overridesList,
        });
      }

      if (!res.success) {
        throw new Error(res.error || 'Failed to persist velocity settings.');
      }

      setSaveSuccess(true);
      onSettingsSaved?.(baselineRatio);
      if (isSimulating) {
        handleSimulateToggle(false);
      }

      setTimeout(() => {
        setSaveSuccess(false);
        setIsOpen(false);
      }, 1200);
    } catch (err: any) {
      setSaveError(err.message || 'Error updating settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={`relative inline-block ${className}`}>
      {/* Toolbar Trigger Button: Target Velocity: [ 2.0 hrs/pt ⚙ ] */}
      <button
        type="button"
        data-testid="velocity-settings-trigger"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium border border-slate-700/60 transition-colors cursor-pointer"
        title="Configure target velocity conversion ratio (hrs/point)"
      >
        <span className="text-slate-400 font-normal">Target Velocity:</span>
        <span className="font-mono font-bold text-emerald-400">
          {baselineRatio.toFixed(1)} hrs/pt
        </span>
        <Settings className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
        {isSimulating && (
          <span className="px-1.5 py-0.2 rounded text-[10px] font-mono font-semibold bg-amber-500/20 text-amber-300 border border-amber-500/40 ml-1">
            SIM
          </span>
        )}
      </button>

      {/* Popover / Configuration Modal */}
      {isOpen && (
        <div
          data-testid="velocity-settings-popover"
          className="absolute right-0 mt-2 w-96 max-w-[calc(100vw-2rem)] rounded-2xl bg-slate-900 border border-slate-800 shadow-2xl p-5 z-50 animate-in fade-in zoom-in-95 duration-150 space-y-4 text-xs"
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-slate-800/80 pb-3">
            <div className="flex items-center space-x-2">
              <Sliders className="w-4 h-4 text-emerald-400" />
              <h4 className="font-bold text-white text-sm">Velocity Calibration</h4>
            </div>
            <button
              type="button"
              data-testid="close-velocity-popover"
              onClick={() => setIsOpen(false)}
              className="text-slate-400 hover:text-white transition-colors cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Workspace Baseline Stepper & Slider */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-medium text-slate-300">Workspace Baseline (hrs/pt):</span>
              <span className="font-mono text-emerald-400 font-bold text-sm" data-testid="current-baseline-value">
                {baselineRatio.toFixed(2)}
              </span>
            </div>

            <div className="flex items-center space-x-3">
              <button
                type="button"
                onClick={() => handleBaselineChange(baselineRatio - 0.25)}
                disabled={baselineRatio <= 0.5}
                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-mono text-base font-bold text-slate-200 flex items-center justify-center cursor-pointer"
              >
                -
              </button>

              <input
                type="range"
                min="0.5"
                max="8.0"
                step="0.25"
                value={baselineRatio}
                data-testid="baseline-ratio-slider"
                onChange={(e) => handleBaselineChange(parseFloat(e.target.value))}
                className="flex-1 accent-emerald-500 cursor-pointer"
              />

              <button
                type="button"
                onClick={() => handleBaselineChange(baselineRatio + 0.25)}
                disabled={baselineRatio >= 8.0}
                className="w-7 h-7 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed font-mono text-base font-bold text-slate-200 flex items-center justify-center cursor-pointer"
              >
                +
              </button>
            </div>
            <p className="text-[11px] text-slate-500">
              Standard story-point envelope multiplier across all un-overridden workspace projects.
            </p>
          </div>

          {/* Live Simulation Mode Toggle */}
          <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800/80 flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <div>
                <span className="font-medium text-slate-200 block text-xs">Simulate Ratio Live</span>
                <span className="text-[10px] text-slate-400 block">Preview planned hours and variance pills immediately</span>
              </div>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                data-testid="simulate-ratio-toggle"
                checked={isSimulating}
                onChange={(e) => handleSimulateToggle(e.target.checked)}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-slate-800 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-emerald-500" />
            </label>
          </div>

          {/* Project Overrides Table */}
          {projects.length > 0 && (
            <div className="space-y-2 border-t border-slate-800/80 pt-3">
              <span className="font-medium text-slate-300 block text-[11px] uppercase tracking-wider">
                Project Overrides ({projects.length})
              </span>
              <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                {projects.map((proj) => {
                  const conf = projectOverrides[proj.id] || {
                    inherit: true,
                    ratio: baselineRatio,
                  };
                  return (
                    <div
                      key={proj.id}
                      data-testid={`project-override-row-${proj.id}`}
                      className="p-2.5 rounded-lg bg-slate-950/50 border border-slate-800/60 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-200 block truncate">{proj.name}</span>
                        <span className="text-[10px] text-slate-500 font-mono">@{proj.slug}</span>
                      </div>

                      <div className="flex items-center space-x-2 shrink-0">
                        <label className="flex items-center space-x-1 text-[11px] text-slate-400 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={conf.inherit}
                            onChange={(e) => handleProjectInheritToggle(proj.id, e.target.checked)}
                            className="rounded border-slate-700 text-emerald-500 focus:ring-0"
                          />
                          <span>Inherit</span>
                        </label>

                        {!conf.inherit && (
                          <input
                            type="number"
                            min="0.5"
                            max="8.0"
                            step="0.25"
                            value={conf.ratio}
                            onChange={(e) =>
                              handleProjectRatioChange(proj.id, parseFloat(e.target.value))
                            }
                            data-testid={`project-ratio-input-${proj.id}`}
                            className="w-16 bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-right font-mono text-slate-100"
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Error & Success States */}
          {saveError && (
            <div className="p-2.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs">
              {saveError}
            </div>
          )}
          {saveSuccess && (
            <div className="p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-1.5">
              <Check className="w-3.5 h-3.5 text-emerald-400" />
              <span>Velocity settings saved successfully!</span>
            </div>
          )}

          {/* Footer Actions */}
          <div className="flex items-center justify-end space-x-2 pt-2 border-t border-slate-800/80">
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="save-velocity-settings-btn"
              disabled={saving}
              onClick={handleSave}
              className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Saving...</span>
                </>
              ) : (
                <span>Save Settings</span>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
