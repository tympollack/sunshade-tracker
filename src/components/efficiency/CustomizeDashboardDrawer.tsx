'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  SlidersHorizontal,
  X,
  RotateCcw,
  ArrowUp,
  ArrowDown,
  Save,
  Check,
  AlertCircle,
  Loader2,
  LayoutGrid,
  Activity,
  FileSpreadsheet,
  Gauge,
} from 'lucide-react';
import type {
  DashboardSurface,
  EfficiencySurfaceDefaultView,
  EfficiencyWidgetKind,
  ResolvedEfficiencyWidget,
  StatementsSurfaceDefaultView,
  TelemetryRefreshIntervalMs,
  TelemetrySurfaceDefaultView,
} from '@/types/efficiency-dashboard';

export type DefaultViewAppliedEvent =
  | { surface: 'efficiency'; updates: Partial<EfficiencySurfaceDefaultView>; isReset?: boolean }
  | { surface: 'statements'; updates: Partial<StatementsSurfaceDefaultView>; isReset?: boolean }
  | { surface: 'telemetry'; updates: Partial<TelemetrySurfaceDefaultView>; isReset?: boolean };
import type { UseEfficiencyDashboardConfigResult } from '@/hooks/useEfficiencyDashboardConfig';
import {
  getSurfaceWidgets,
  isSurfaceCustomized,
} from '@/lib/efficiency-dashboard-schema';

export interface CustomizeDashboardButtonProps {
  onClick: () => void;
  isCustomized?: boolean;
  label?: string;
  className?: string;
  'data-testid'?: string;
}

export function CustomizeDashboardButton({
  onClick,
  isCustomized = false,
  label = 'Customize Dashboard',
  className = '',
  'data-testid': testId = 'customize-dashboard-trigger',
}: CustomizeDashboardButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      title="Customize visible KPIs, modules, and default view settings"
      className={`inline-flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer shrink-0 ${
        isCustomized
          ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300 hover:bg-emerald-500/20'
          : 'bg-slate-900 border-slate-800 text-slate-300 hover:text-white hover:bg-slate-800'
      } ${className}`}
    >
      <SlidersHorizontal className="w-3.5 h-3.5 shrink-0" />
      <span>{label}</span>
      {isCustomized && (
        <span
          data-testid="customize-dashboard-active-dot"
          className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"
          aria-hidden="true"
        />
      )}
    </button>
  );
}

export interface CustomizeDashboardDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  activeSurface: DashboardSurface;
  config: UseEfficiencyDashboardConfigResult;
  canSaveWorkspaceDefault?: boolean;
  allowSurfaceSwitch?: boolean;
  onDefaultViewApplied?: (event: DefaultViewAppliedEvent) => void;
}

const SURFACE_META: Record<
  DashboardSurface,
  { label: string; shortLabel: string; description: string }
> = {
  efficiency: {
    label: 'Efficiency Statement',
    shortLabel: 'Efficiency',
    description: 'Configure Operational Yield & Efficiency Statement KPIs, audit sections, and period defaults.',
  },
  statements: {
    label: 'Dynamic Statements',
    shortLabel: 'Statements',
    description: 'Configure custom range statement metrics, calibration accordion, and timeframe defaults.',
  },
  telemetry: {
    label: 'Live Telemetry Deck',
    shortLabel: 'Telemetry',
    description: 'Configure In-Flight Control Deck telemetry badges, blocker radar, and pivot defaults.',
  },
};

function SurfaceIcon({ surface }: { surface: DashboardSurface }) {
  if (surface === 'efficiency') return <Gauge className="w-3.5 h-3.5" />;
  if (surface === 'statements') return <FileSpreadsheet className="w-3.5 h-3.5" />;
  return <Activity className="w-3.5 h-3.5" />;
}

export function CustomizeDashboardDrawer({
  isOpen,
  onClose,
  activeSurface,
  config,
  canSaveWorkspaceDefault = false,
  allowSurfaceSwitch = true,
  onDefaultViewApplied,
}: CustomizeDashboardDrawerProps) {
  const [drawerSurface, setDrawerSurface] = useState<DashboardSurface>(activeSurface);
  const [savedWorkspaceNotice, setSavedWorkspaceNotice] = useState(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current =
        typeof document !== 'undefined' ? (document.activeElement as HTMLElement | null) : null;
      setDrawerSurface(activeSurface);
      setSavedWorkspaceNotice(false);
      // Move focus into the drawer when opened
      const timer = setTimeout(() => {
        closeBtnRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    } else if (previousFocusRef.current) {
      const prev = previousFocusRef.current;
      previousFocusRef.current = null;
      if (typeof prev.focus === 'function') {
        prev.focus();
      }
    }
  }, [isOpen, activeSurface]);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }
      if (e.key === 'Tab' && dialogRef.current) {
        const focusable = Array.from(
          dialogRef.current.querySelectorAll<HTMLElement>(
            'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'
          )
        ).filter((el) => el.offsetParent !== null || el === document.activeElement);

        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey) {
          if (document.activeElement === first || !dialogRef.current.contains(document.activeElement)) {
            e.preventDefault();
            last.focus();
          }
        } else if (document.activeElement === last || !dialogRef.current.contains(document.activeElement)) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const kpiWidgets = getSurfaceWidgets(config.resolved, drawerSurface, 'kpi');
  const moduleWidgets = getSurfaceWidgets(config.resolved, drawerSurface, 'module');
  const surfaceCustomized = isSurfaceCustomized(
    config.resolved,
    config.workspaceBaseline,
    drawerSurface
  );

  const handleSaveWorkspaceDefault = async () => {
    setSavedWorkspaceNotice(false);
    const ok = await config.saveAsWorkspaceDefault(drawerSurface);
    if (ok) {
      setSavedWorkspaceNotice(true);
      setTimeout(() => setSavedWorkspaceNotice(false), 3000);
    }
  };

  const renderWidgetList = (
    title: string,
    kind: EfficiencyWidgetKind,
    widgets: ResolvedEfficiencyWidget[]
  ) => (
    <section className="space-y-2.5" aria-label={title}>
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          {title}
        </h3>
        <span className="text-[11px] font-mono text-slate-500">
          {widgets.filter((w) => w.visible).length}/{widgets.length} visible
        </span>
      </div>

      <div className="space-y-2">
        {widgets.map((widget, idx) => (
          <div
            key={widget.id}
            data-testid={`customizer-widget-row-${widget.id}`}
            className={`p-3 rounded-xl border transition-colors flex items-center justify-between gap-3 ${
              widget.visible
                ? 'bg-slate-900/90 border-slate-800 text-slate-100'
                : 'bg-slate-950/60 border-slate-800/60 text-slate-400'
            }`}
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold truncate">{widget.label}</span>
                {widget.isCustomized && (
                  <span className="text-[10px] font-mono px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                    Edited
                  </span>
                )}
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
                {widget.description}
              </p>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <div className="flex items-center gap-0.5 mr-1">
                <button
                  type="button"
                  onClick={() => config.moveWidget(kind, widget.id, 'up', drawerSurface)}
                  disabled={idx === 0}
                  title={`Move ${widget.label} up`}
                  aria-label={`Move ${widget.label} up`}
                  data-testid={`widget-move-up-${widget.id}`}
                  className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ArrowUp className="w-3 h-3" />
                </button>
                <button
                  type="button"
                  onClick={() => config.moveWidget(kind, widget.id, 'down', drawerSurface)}
                  disabled={idx === widgets.length - 1}
                  title={`Move ${widget.label} down`}
                  aria-label={`Move ${widget.label} down`}
                  data-testid={`widget-move-down-${widget.id}`}
                  className="p-1 rounded bg-slate-950 border border-slate-800 text-slate-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                >
                  <ArrowDown className="w-3 h-3" />
                </button>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={widget.visible}
                aria-label={`Toggle ${widget.label}`}
                data-testid={`widget-toggle-${widget.id}`}
                onClick={() => config.toggleWidget(widget.id)}
                className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer ${
                  widget.visible ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform ${
                    widget.visible ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        ))}
      </div>
    </section>
  );

  const renderDefaultViewSettings = () => {
    const views = config.resolved.default_views;

    if (drawerSurface === 'efficiency') {
      return (
        <section className="space-y-3" aria-label="Default View Settings">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Default View Settings
          </h3>

          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-200 block">
                Default Statement Period
              </span>
              <div className="grid grid-cols-2 gap-2">
                {(['monthly', 'all-time'] as const).map((period) => {
                  const selected = views.efficiency.defaultPeriod === period;
                  return (
                    <button
                      key={period}
                      type="button"
                      data-testid={`default-view-eff-period-${period}`}
                      onClick={() => {
                        config.updateDefaultView('efficiency', { defaultPeriod: period });
                        onDefaultViewApplied?.({
                          surface: 'efficiency',
                          updates: { defaultPeriod: period },
                        });
                      }}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        selected
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {period === 'monthly' ? 'Monthly Audit' : 'All-Time Cumulative'}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-slate-200 block">
                  Compact Card Density
                </span>
                <span className="text-[11px] text-slate-400">
                  Tighter padding across KPI cards and audit tables.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={views.efficiency.compactMode}
                aria-label="Toggle Compact Card Density"
                data-testid="default-view-eff-compact-toggle"
                onClick={() =>
                  config.updateDefaultView('efficiency', {
                    compactMode: !views.efficiency.compactMode,
                  })
                }
                className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                  views.efficiency.compactMode ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform ${
                    views.efficiency.compactMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </section>
      );
    }

    if (drawerSurface === 'statements') {
      return (
        <section className="space-y-3" aria-label="Default View Settings">
          <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Default View Settings
          </h3>

          <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-200 block">
                Default Statement Timeframe
              </span>
              <div className="grid grid-cols-4 gap-1.5">
                {(['week', 'month', 'quarter', 'year'] as const).map((tf) => {
                  const selected = views.statements.defaultTimeframe === tf;
                  return (
                    <button
                      key={tf}
                      type="button"
                      data-testid={`default-view-stmt-timeframe-${tf}`}
                      onClick={() => {
                        config.updateDefaultView('statements', { defaultTimeframe: tf });
                        onDefaultViewApplied?.({
                          surface: 'statements',
                          updates: { defaultTimeframe: tf },
                        });
                      }}
                      className={`px-2 py-1.5 rounded-lg text-xs font-medium capitalize border transition-colors cursor-pointer ${
                        selected
                          ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                          : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                      }`}
                    >
                      {tf}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between gap-3">
              <div>
                <span className="text-xs font-semibold text-slate-200 block">
                  Expand Project Accordions
                </span>
                <span className="text-[11px] text-slate-400">
                  Auto-expand project calibration breakdowns on load.
                </span>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={views.statements.expandProjectAccordions}
                aria-label="Toggle Expand Project Accordions"
                data-testid="default-view-stmt-expand-toggle"
                onClick={() =>
                  config.updateDefaultView('statements', {
                    expandProjectAccordions: !views.statements.expandProjectAccordions,
                  })
                }
                className={`w-10 h-5 flex items-center rounded-full p-0.5 transition-colors cursor-pointer shrink-0 ${
                  views.statements.expandProjectAccordions ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <span
                  className={`bg-white w-4 h-4 rounded-full shadow-sm transform transition-transform ${
                    views.statements.expandProjectAccordions ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>
        </section>
      );
    }

    return (
      <section className="space-y-3" aria-label="Default View Settings">
        <h3 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          Default View Settings
        </h3>

        <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-200 block">
              Default Telemetry Pivot
            </span>
            <div className="grid grid-cols-2 gap-2">
              {(
                [
                  { id: 'stage_flow', label: 'Stage Flow' },
                  { id: 'project_swimlanes', label: 'Project Lanes' },
                ] as const
              ).map((pivot) => {
                const selected = views.telemetry.defaultPivot === pivot.id;
                return (
                  <button
                    key={pivot.id}
                    type="button"
                    data-testid={`default-view-tel-pivot-${pivot.id}`}
                    onClick={() => {
                      config.updateDefaultView('telemetry', { defaultPivot: pivot.id });
                      onDefaultViewApplied?.({
                        surface: 'telemetry',
                        updates: { defaultPivot: pivot.id },
                      });
                    }}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                      selected
                        ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300'
                        : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    {pivot.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="pt-2 border-t border-slate-800/80 space-y-1.5">
            <label
              htmlFor="default-view-tel-cadence-select"
              className="text-xs font-semibold text-slate-200 block"
            >
              Default Polling Cadence
            </label>
            <select
              id="default-view-tel-cadence-select"
              data-testid="default-view-tel-cadence-select"
              value={views.telemetry.defaultRefreshIntervalMs}
              onChange={(e) => {
                const nextInterval = Number(e.target.value) as TelemetryRefreshIntervalMs;
                config.updateDefaultView('telemetry', {
                  defaultRefreshIntervalMs: nextInterval,
                });
                onDefaultViewApplied?.({
                  surface: 'telemetry',
                  updates: { defaultRefreshIntervalMs: nextInterval },
                });
              }}
              className="w-full px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-200 focus:outline-none focus:border-cyan-500 cursor-pointer"
            >
              <option value={30000}>Live (30s)</option>
              <option value={60000}>Balanced (60s)</option>
              <option value={120000}>Eco (120s)</option>
              <option value={0}>Paused</option>
            </select>
          </div>
        </div>
      </section>
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end print:hidden"
      data-testid="customize-dashboard-drawer-backdrop"
      onClick={onClose}
    >
      <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs" aria-hidden="true" />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="customize-dashboard-title"
        data-testid="customize-dashboard-drawer"
        onClick={(e) => e.stopPropagation()}
        className="relative z-10 w-full max-w-md h-full bg-[#0b1120] border-l border-slate-800 shadow-2xl flex flex-col text-slate-100"
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-800/90 flex items-start justify-between gap-3 bg-slate-950/80">
          <div className="space-y-1 min-w-0">
            <div className="flex items-center gap-2">
              <LayoutGrid className="w-4 h-4 text-emerald-400 shrink-0" />
              <h2
                id="customize-dashboard-title"
                className="text-sm font-bold text-white tracking-tight"
              >
                Customize Dashboard
              </h2>
            </div>
            <p className="text-[11px] text-slate-400 leading-snug">
              {SURFACE_META[drawerSurface].description}
            </p>
          </div>

          <button
            ref={closeBtnRef}
            type="button"
            onClick={onClose}
            aria-label="Close Customize Dashboard Drawer"
            data-testid="customize-dashboard-close-btn"
            className="p-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-colors cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Surface Tabs */}
        {allowSurfaceSwitch && (
          <div className="px-5 py-2.5 border-b border-slate-800/80 bg-slate-950/40">
            <div
              role="tablist"
              aria-label="Dashboard Surfaces"
              className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-slate-950 border border-slate-800"
            >
              {(['efficiency', 'statements', 'telemetry'] as const).map((surf) => {
                const isSelected = drawerSurface === surf;
                const hasDiff = isSurfaceCustomized(
                  config.resolved,
                  config.workspaceBaseline,
                  surf
                );
                return (
                  <button
                    key={surf}
                    type="button"
                    role="tab"
                    aria-selected={isSelected}
                    data-testid={`customizer-surface-tab-${surf}`}
                    onClick={() => setDrawerSurface(surf)}
                    className={`flex items-center justify-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-slate-800 text-white shadow-sm'
                        : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <SurfaceIcon surface={surf} />
                    <span>{SURFACE_META[surf].shortLabel}</span>
                    {hasDiff && (
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-6 custom-scrollbar">
          {renderDefaultViewSettings()}
          {renderWidgetList('KPI Cards', 'kpi', kpiWidgets)}
          {renderWidgetList('Dashboard Modules', 'module', moduleWidgets)}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-800/90 bg-slate-950/80 space-y-2.5">
          {config.workspaceSaveError && (
            <div className="p-2 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-300 text-[11px] flex items-center gap-1.5">
              <AlertCircle className="w-3.5 h-3.5 shrink-0" />
              <span>{config.workspaceSaveError}</span>
            </div>
          )}

          {savedWorkspaceNotice && (
            <div
              data-testid="customize-dashboard-workspace-saved"
              className="p-2 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-[11px] flex items-center gap-1.5"
            >
              <Check className="w-3.5 h-3.5 shrink-0" />
              <span>Saved {SURFACE_META[drawerSurface].shortLabel} schema as workspace default.</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => {
                config.resetSurface(drawerSurface);
                onDefaultViewApplied?.({
                  surface: drawerSurface,
                  updates: config.workspaceBaseline.default_views[drawerSurface],
                  isReset: true,
                } as DefaultViewAppliedEvent);
              }}
              disabled={!surfaceCustomized}
              data-testid="customize-dashboard-reset-btn"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Reset to Default</span>
            </button>

            {canSaveWorkspaceDefault && (
              <button
                type="button"
                onClick={handleSaveWorkspaceDefault}
                disabled={config.isSavingWorkspaceDefault}
                data-testid="customize-dashboard-save-workspace-btn"
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 text-xs font-bold disabled:opacity-50 transition-colors cursor-pointer"
              >
                {config.isSavingWorkspaceDefault ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    <span>Save Workspace Default</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
