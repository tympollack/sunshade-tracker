'use client';

import React from 'react';
import {
  FolderKanban,
  Maximize2,
  Minimize2,
  Radio,
  RefreshCw,
  Zap,
} from 'lucide-react';

export type LivePivotMode = 'stage_flow' | 'project_swimlanes';
export type PollingCadenceMs = 30000 | 60000 | 120000 | 0;

export interface LiveDashboardToolbarProps {
  activePivot: LivePivotMode;
  onPivotChange: (pivot: LivePivotMode) => void;
  pollingCadenceMs: PollingCadenceMs;
  onPollingCadenceChange: (cadenceMs: PollingCadenceMs) => void;
  isKioskMode: boolean;
  onToggleKioskMode: () => void;
  lastSyncedAt?: string | null;
  isSyncing?: boolean;
  onManualRefresh?: () => void;
}

export const POLLING_CADENCE_OPTIONS: Array<{ value: PollingCadenceMs; label: string }> = [
  { value: 30000, label: 'Live (30s)' },
  { value: 60000, label: 'Balanced (60s)' },
  { value: 120000, label: 'Eco (120s)' },
  { value: 0, label: 'Paused' },
];

export function LiveDashboardToolbar({
  activePivot,
  onPivotChange,
  pollingCadenceMs,
  onPollingCadenceChange,
  isKioskMode,
  onToggleKioskMode,
  lastSyncedAt,
  isSyncing = false,
  onManualRefresh,
}: LiveDashboardToolbarProps) {
  const handleSelectPivot = (nextPivot: LivePivotMode) => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('pivot', nextPivot);
      window.history.replaceState(null, '', url.pathname + url.search);
    }
    onPivotChange(nextPivot);
  };

  return (
    <div
      data-testid="live-dashboard-toolbar"
      className="w-full px-4 py-2.5 rounded-xl bg-slate-900/80 border border-slate-800/90 backdrop-blur-md flex flex-wrap items-center justify-between gap-3 shadow-sm"
    >
      {/* Left: Title & Segmented Pivot Switcher */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center space-x-2">
          <span className="relative flex h-2.5 w-2.5 shrink-0">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                pollingCadenceMs === 0 ? 'bg-slate-500' : 'bg-cyan-400'
              }`}
            />
            <span
              className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                pollingCadenceMs === 0 ? 'bg-slate-500' : 'bg-cyan-500'
              }`}
            />
          </span>
          <h2 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-white">
            In-Flight Control Deck
          </h2>
        </div>

        {/* High-Contrast Segmented Control Switcher: [ ⚡ Stage Flow | 📁 Project Lanes ] */}
        <div
          role="group"
          aria-label="Live Deck Pivot Switcher"
          data-testid="live-pivot-switcher"
          className="inline-flex items-center p-0.5 rounded-lg bg-slate-950 border border-slate-800 text-xs"
        >
          <button
            type="button"
            data-testid="pivot-btn-stage-flow"
            aria-pressed={activePivot === 'stage_flow'}
            onClick={() => handleSelectPivot('stage_flow')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
              activePivot === 'stage_flow'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Zap className="w-3.5 h-3.5 shrink-0" />
            <span>⚡ Stage Flow</span>
          </button>

          <button
            type="button"
            data-testid="pivot-btn-project-swimlanes"
            aria-pressed={activePivot === 'project_swimlanes'}
            onClick={() => handleSelectPivot('project_swimlanes')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-semibold transition-all cursor-pointer ${
              activePivot === 'project_swimlanes'
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <FolderKanban className="w-3.5 h-3.5 shrink-0" />
            <span>📁 Project Lanes</span>
          </button>
        </div>
      </div>

      {/* Right: Sync Status, Polling Cadence Selector & 100dvh Kiosk Toggle */}
      <div className="flex flex-wrap items-center gap-2.5">
        {lastSyncedAt && (
          <span
            data-testid="live-last-synced"
            className="hidden sm:inline-flex items-center space-x-1 text-[11px] font-mono text-slate-400"
          >
            <Radio className="w-3 h-3 text-cyan-400" />
            <span>
              Synced{' '}
              {new Date(lastSyncedAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              })}
            </span>
          </span>
        )}

        {/* Polling Cadence Dropdown */}
        <div className="flex items-center space-x-1.5">
          <label htmlFor="live-polling-cadence-select" className="sr-only">
            Polling Cadence
          </label>
          <select
            id="live-polling-cadence-select"
            data-testid="live-polling-cadence-select"
            aria-label="Polling Cadence"
            value={pollingCadenceMs}
            onChange={(e) =>
              onPollingCadenceChange(Number(e.target.value) as PollingCadenceMs)
            }
            className="px-2.5 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
          >
            {POLLING_CADENCE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {onManualRefresh && (
          <button
            type="button"
            data-testid="live-manual-refresh-btn"
            onClick={onManualRefresh}
            disabled={isSyncing}
            title="Sync Delta Telemetry Now"
            className="p-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-cyan-400' : ''}`} />
          </button>
        )}

        {/* Full-Screen Kiosk Toggle */}
        <button
          type="button"
          data-testid="live-kiosk-toggle-btn"
          aria-pressed={isKioskMode}
          onClick={onToggleKioskMode}
          title={isKioskMode ? 'Exit 100dvh Wallboard Kiosk Mode' : 'Enter 100dvh Wallboard Kiosk Mode'}
          className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all cursor-pointer ${
            isKioskMode
              ? 'bg-amber-500/20 border-amber-500/50 text-amber-300'
              : 'bg-slate-950 hover:bg-slate-800 border-slate-800 text-slate-200'
          }`}
        >
          {isKioskMode ? (
            <>
              <Minimize2 className="w-3.5 h-3.5 text-amber-400 shrink-0" />
              <span>Exit Kiosk</span>
            </>
          ) : (
            <>
              <Maximize2 className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span>Kiosk Wallboard</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
