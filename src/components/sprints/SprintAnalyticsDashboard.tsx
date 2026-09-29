'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  Gauge,
  Layers,
  Lock,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  TrendingDown,
  TrendingUp,
  AlertTriangle,
  Flame,
} from 'lucide-react';
import { SunShadeLogo } from '@/components/SunShadeLogo';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import { SprintHealthReport } from '@/lib/services/sprintAnalyticsService';
import { SprintGuardrailModal } from '@/components/sprints/SprintGuardrailModal';
import { WorkItem } from '@/types/tracker';

/**
 * Skeleton placeholder matching exact dimensions and grid layout to guarantee
 * zero layout shift (CLS) during data loading.
 */
export function SprintAnalyticsSkeleton({ tenantSlug }: { tenantSlug?: string }) {
  return (
    <div
      data-testid="sprint-analytics-skeleton"
      className="min-h-screen flex flex-col bg-[#090d16] text-slate-100 animate-pulse"
    >
      {/* Header Skeleton */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 px-4 sm:px-6 py-3 flex items-center justify-between">
        <div className="h-6 w-64 bg-slate-800/60 rounded-md" />
        <div className="h-7 w-28 bg-slate-800/60 rounded-lg" />
      </header>

      {/* Main Skeleton */}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-6">
        <div className="h-28 w-full bg-slate-900/60 rounded-2xl border border-slate-800/80" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-44 bg-slate-900/40 rounded-2xl border border-slate-800/80" />
          <div className="h-44 bg-slate-900/40 rounded-2xl border border-slate-800/80" />
          <div className="h-44 bg-slate-900/40 rounded-2xl border border-slate-800/80" />
          <div className="h-44 bg-slate-900/40 rounded-2xl border border-slate-800/80" />
        </div>
        <div className="h-40 bg-slate-900/40 rounded-2xl border border-slate-800/80" />
      </main>
    </div>
  );
}

export function SprintAnalyticsContent({ tenantSlug }: { tenantSlug: string }) {
  const [workspaces, setWorkspaces] = useState<any[]>([]);
  const [availableSprints, setAvailableSprints] = useState<
    Array<{ id: string; name: string; status: string; project_id?: string; project_slug?: string }>
  >([]);
  const [selectedSprint, setSelectedSprint] = useState<string>('');
  const [report, setReport] = useState<SprintHealthReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Demo state for zero-sum trade-off modal
  const [isGuardrailModalOpen, setIsGuardrailModalOpen] = useState(false);
  const [guardrailItems, setGuardrailItems] = useState<WorkItem[]>([]);
  const [previewToast, setPreviewToast] = useState<string | null>(null);

  // 1. Fetch workspaces and sprint list
  useEffect(() => {
    fetch('/api/v1/tenants/me', {
      headers: { 'x-tenant-slug': tenantSlug },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.workspaces) setWorkspaces(d.workspaces);
      })
      .catch(() => {});

    // Fetch projects to extract sprints
    fetch(`/api/v1/projects?tenant_slug=${encodeURIComponent(tenantSlug)}`, {
      headers: { 'x-tenant-slug': tenantSlug },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const sprintList: Array<{
          id: string;
          name: string;
          status: string;
          project_id?: string;
          project_slug?: string;
        }> = [];
        const seen = new Set<string>();

        for (const p of d?.projects || []) {
          for (const s of p.settings?.sprint_settings?.sprints || []) {
            if (!seen.has(s.name)) {
              seen.add(s.name);
              sprintList.push({
                id: s.id || s.name,
                name: s.name,
                status: s.status,
                project_id: p.id,
                project_slug: p.slug,
              });
            }
          }
        }

        setAvailableSprints(sprintList);

        // Auto-select active sprint or first available
        const active = sprintList.find((s) => s.status === 'active');
        if (active) {
          setSelectedSprint(active.name);
        } else if (sprintList.length > 0) {
          setSelectedSprint(sprintList[0].name);
        } else {
          setSelectedSprint('Sprint 2026-Q4');
        }
      })
      .catch(() => {
        setSelectedSprint('Sprint 2026-Q4');
      });
  }, [tenantSlug]);

  // 2. Fetch Sprint Analytics Report when selectedSprint changes
  const fetchReport = async () => {
    if (!selectedSprint) return;
    setLoading(true);
    setError(null);

    try {
      const targetSprintObj = availableSprints.find(
        (s) => s.name === selectedSprint || s.id === selectedSprint
      );
      const projectParam = targetSprintObj?.project_slug
        ? `&project_slug=${encodeURIComponent(targetSprintObj.project_slug)}`
        : targetSprintObj?.project_id
        ? `&project_id=${encodeURIComponent(targetSprintObj.project_id)}`
        : '';

      const res = await fetch(
        `/api/v1/sprints/analytics?sprint_id=${encodeURIComponent(selectedSprint)}&tenant_slug=${encodeURIComponent(tenantSlug)}${projectParam}`,
        {
          headers: { 'x-tenant-slug': tenantSlug },
        }
      );

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${res.status}`);
      }

      const data: SprintHealthReport = await res.json();
      setReport(data);

      // Fetch sprint items for demo modal with project selector
      const itemsRes = await fetch(
        `/api/v1/items?tenant_slug=${encodeURIComponent(tenantSlug)}${projectParam}`,
        { headers: { 'x-tenant-slug': tenantSlug } }
      );
      if (itemsRes.ok) {
        const itemsData = await itemsRes.json();
        const sprintItems = (itemsData?.items || []).filter(
          (it: WorkItem) => it.metadata?.sprint === selectedSprint
        );
        setGuardrailItems(sprintItems);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load telemetry data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, [selectedSprint, tenantSlug]);

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100">
      {/* Top Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center space-x-2 min-w-0 shrink">
          <SunShadeLogo variant="horizontal" size="xs" href="/" className="mr-0.5 sm:mr-1 shrink-0" hideTextOnMobile />
          <span className="text-slate-700 shrink-0">/</span>
          <WorkspaceSwitcher currentTenantSlug={tenantSlug} workspaces={workspaces} />
          <span className="text-slate-700 shrink-0">/</span>
          <span className="text-xs font-semibold text-emerald-400">Sprint Governance Telemetry</span>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href={`/${tenantSlug}/settings`}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Workspace</span>
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 max-w-7xl mx-auto w-full space-y-6">
        {/* Page Banner & Sprint Selector */}
        <div className="p-5 sm:p-6 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-emerald-950/30 border border-slate-800/90 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                Enterprise KPI Telemetry
              </span>
              <span className="text-xs font-mono text-slate-500">@{tenantSlug}</span>
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold text-white mt-1 flex items-center gap-2">
              <Activity className="w-7 h-7 text-emerald-400" />
              Sprint Scope Guardrails & Velocity Engine
            </h1>
            <p className="text-xs sm:text-sm text-slate-400 mt-1">
              Rolling 3-sprint velocity, mathematical scope churn telemetry, and late-sprint intake invariants.
            </p>
          </div>

          <div className="flex items-center space-x-2 shrink-0">
            <label className="text-xs font-medium text-slate-400 font-mono">Sprint:</label>
            <select
              value={selectedSprint}
              onChange={(e) => setSelectedSprint(e.target.value)}
              data-testid="sprint-selector"
              className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-xl text-emerald-300 font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
            >
              {availableSprints.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name} ({s.status})
                </option>
              ))}
              {availableSprints.length === 0 && (
                <option value="Sprint 2026-Q4">Sprint 2026-Q4 (active)</option>
              )}
            </select>
            <button
              type="button"
              onClick={fetchReport}
              data-testid="refresh-telemetry-button"
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
              title="Refresh telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>

        {error && (
          <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
            <span>Error loading sprint telemetry: {error}</span>
          </div>
        )}

        {/* Metric Readout Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Card 1: Rolling Velocity (3-Sprint Avg vs Current) */}
          <div
            data-testid="card-rolling-velocity"
            className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-sm flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider font-mono">
                  Rolling Velocity
                </span>
                <Gauge className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold text-white font-mono" data-testid="rolling-velocity-value">
                  {report?.rollingVelocity3Sprint ?? 0}
                </span>
                <span className="text-xs text-slate-400 font-mono">pts / sprint</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                vs. <span className="text-emerald-300 font-bold">{report?.currentSprintPoints ?? 0}</span> current sprint pts
              </p>
            </div>

            <div className="pt-4 border-t border-slate-800/60 mt-4 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-mono">
                {report?.historicalSprintsEvaluated ?? 0} closed sprints evaluated
              </span>
              {report?.velocityTrend === 'increasing' ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 flex items-center gap-1">
                  <TrendingUp className="w-3 h-3" /> Accelerating
                </span>
              ) : report?.velocityTrend === 'decreasing' ? (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                  <TrendingDown className="w-3 h-3" /> Decelerating
                </span>
              ) : (
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  Stable Pace
                </span>
              )}
            </div>
          </div>

          {/* Card 2: Commitment Reliability % (Say/Do Ratio with Health Badges) */}
          <div
            data-testid="card-commitment-reliability"
            className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-sm flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider font-mono">
                  Reliability (Say/Do)
                </span>
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex items-baseline space-x-2">
                <span
                  className="text-3xl font-extrabold text-white font-mono"
                  data-testid="commitment-reliability-value"
                >
                  {report?.commitmentReliabilityPercent ?? 0}%
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                <span className="text-white font-bold">{report?.completedPoints ?? 0}</span> done /{' '}
                <span className="text-slate-400">{report?.committedPoints ?? 0}</span> committed pts
              </p>
            </div>

            <div className="pt-4 border-t border-slate-800/60 mt-4 flex items-center justify-between">
              <span className="text-[11px] text-slate-500 font-mono">Status:</span>
              {report?.reliabilityStatus === 'green' ? (
                <span
                  data-testid="health-badge-green"
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                >
                  ● Healthy (&gt;=85%)
                </span>
              ) : report?.reliabilityStatus === 'amber' ? (
                <span
                  data-testid="health-badge-amber"
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40"
                >
                  ● Moderate (70-84%)
                </span>
              ) : (
                <span
                  data-testid="health-badge-red"
                  className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-bold bg-red-500/20 text-red-300 border border-red-500/40"
                >
                  ● At Risk (&lt;70%)
                </span>
              )}
            </div>
          </div>

          {/* Card 3: Scope Creep Delta (Added After Sprint Start) */}
          <div
            data-testid="card-scope-creep"
            className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-sm flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider font-mono">
                  Scope Creep Delta
                </span>
                <Flame className="w-4 h-4 text-amber-400" />
              </div>
              <div className="flex items-baseline space-x-2">
                <span
                  className={`text-3xl font-extrabold font-mono ${
                    (report?.scopeCreepPercent ?? 0) > 0 ? 'text-amber-400' : 'text-emerald-400'
                  }`}
                  data-testid="scope-creep-value"
                >
                  {(report?.pointsAddedMidSprint ?? 0) > 0 ? '+' : ''}
                  {report?.pointsAddedMidSprint ?? 0} pts
                </span>
                <span className="text-xs text-slate-400 font-mono">
                  ({report?.scopeCreepPercent ?? 0}%)
                </span>
              </div>
              <div className="mt-2">
                <span
                  data-testid="tag-added-after-sprint-start"
                  className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase bg-amber-500/10 text-amber-300 border border-amber-500/30"
                >
                  Added After Sprint Start
                </span>
              </div>
            </div>

            <div className="pt-4 border-t border-slate-800/60 mt-4 text-[11px] text-slate-500 font-mono">
              Committed capacity: {report?.committedPoints ?? 0} pts
            </div>
          </div>

          {/* Card 4: Cycle Lead Time & Active WIP Age */}
          <div
            data-testid="card-cycle-lead-time"
            className="p-5 rounded-2xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-sm flex flex-col justify-between"
          >
            <div>
              <div className="flex items-center justify-between text-slate-400 mb-2">
                <span className="text-xs font-semibold uppercase tracking-wider font-mono">
                  Cycle & WIP Age
                </span>
                <Clock className="w-4 h-4 text-sky-400" />
              </div>
              <div className="flex items-baseline space-x-2">
                <span className="text-3xl font-extrabold text-white font-mono">
                  {report?.cycleTimeDays ?? 0}d
                </span>
                <span className="text-xs text-slate-400 font-mono">lead time</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Mean time: <span className="text-sky-300 font-mono font-bold">in_progress → complete</span>
              </p>
            </div>

            <div className="pt-4 border-t border-slate-800/60 mt-4 flex items-center justify-between text-[11px] font-mono">
              <span className="text-slate-500">Active WIP Age:</span>
              <span className="text-slate-200 font-bold">{report?.wipAgeDays ?? 0} days</span>
            </div>
          </div>
        </div>

        {/* Late Runway Gauge Component */}
        <div
          data-testid="late-runway-gauge"
          className="p-5 sm:p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-sm space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <div className="flex items-center space-x-2">
                <span className="text-xs font-semibold uppercase tracking-wider font-mono text-slate-300">
                  Late Runway Timeline Gauge
                </span>
                {report?.runwayLocked ? (
                  <span
                    data-testid="runway-locked-badge"
                    className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-red-500/10 text-red-400 border border-red-500/30 flex items-center gap-1"
                  >
                    <Lock className="w-3 h-3" /> Intake Locked (&lt;= 2 pts)
                  </span>
                ) : (
                  <span
                    data-testid="runway-open-badge"
                    className="px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase bg-emerald-500/10 text-emerald-400 border border-emerald-500/30"
                  >
                    Intake Open
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-400 mt-1">
                {report?.runwayLocked
                  ? 'Runway elapsed ratio > 60%. Feature stories over 2 story points are locked from mid-sprint intake.'
                  : 'Runway elapsed ratio <= 60%. Unallocated capacity permits standard feature story intake.'}
              </p>
            </div>

            <div className="text-right font-mono text-xs text-slate-400">
              <span className="text-white font-bold text-base">
                {((report?.runwayElapsedRatio ?? 0) * 100).toFixed(1)}%
              </span>{' '}
              sprint runway elapsed
            </div>
          </div>

          {/* Visual Progress Bar with 60% Marker */}
          <div className="relative pt-6 pb-2">
            {/* 60% Marker Line */}
            <div
              className="absolute top-0 bottom-2 w-0.5 bg-amber-500/80 z-20 flex flex-col items-center"
              style={{ left: '60%' }}
            >
              <span className="text-[9px] font-mono font-bold text-amber-400 bg-slate-950 px-1 rounded border border-amber-500/30 whitespace-nowrap -mt-5">
                60% Lock Line
              </span>
            </div>

            {/* Track Bar */}
            <div className="h-4 w-full bg-slate-950 rounded-full border border-slate-800 overflow-hidden relative">
              <div
                data-testid="runway-progress-fill"
                className={`h-full transition-all duration-500 rounded-full ${
                  report?.runwayLocked
                    ? 'bg-gradient-to-r from-emerald-500 via-amber-500 to-red-500'
                    : 'bg-emerald-500'
                }`}
                style={{ width: `${Math.min(100, (report?.runwayElapsedRatio ?? 0) * 100)}%` }}
              />
            </div>

            {/* Sub-labels */}
            <div className="flex justify-between text-[10px] font-mono text-slate-500 mt-2">
              <span>0% (Sprint Start)</span>
              <span className="text-amber-400/80">60% Guardrail Boundary</span>
              <span>100% (Sprint End)</span>
            </div>
          </div>
        </div>

        {/* Zero-Sum Guardrail Barrier Interactive Demo */}
        <div className="p-5 rounded-2xl bg-gradient-to-r from-red-950/20 via-slate-900/40 to-slate-900/40 border border-red-500/20 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center space-x-2">
              <ShieldAlert className="w-5 h-5 text-red-400" />
              <h3 className="text-sm font-bold text-white">
                Zero-Sum Scope Guardrail Barrier (Preview)
              </h3>
            </div>
            <p className="text-xs text-slate-400 mt-1 max-w-2xl">
              When an agent or user attempts to drag or assign a story into an active sprint exceeding capacity,
              the system intercepts with an impassable swap barrier requiring unstarted task ejections.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setIsGuardrailModalOpen(true)}
            data-testid="test-barrier-modal-button"
            className="px-4 py-2 rounded-xl bg-red-500/10 hover:bg-red-500/20 text-red-300 border border-red-500/30 text-xs font-semibold transition-colors shrink-0 flex items-center space-x-1.5"
          >
            <ShieldAlert className="w-3.5 h-3.5" />
            <span>Preview Swap Barrier Dialog</span>
          </button>
        </div>

        {previewToast && (
          <div
            data-testid="preview-simulation-toast"
            className="p-3 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs flex items-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{previewToast}</span>
          </div>
        )}
      </main>

      {/* Zero-Sum Guardrail Barrier Modal */}
      <SprintGuardrailModal
        isOpen={isGuardrailModalOpen}
        onClose={() => setIsGuardrailModalOpen(false)}
        onConfirmSwap={async (ejectedIds) => {
          setIsGuardrailModalOpen(false);
          setPreviewToast(`[Preview Mode] Ejection swap simulated successfully for ${ejectedIds.length} candidate tasks.`);
          setTimeout(() => setPreviewToast(null), 3500);
          await fetchReport();
        }}
        incomingItem={{
          title: 'High-Impact Predictive Analytics Engine',
          story_points: 5,
          external_ref_id: 'STORY-PREDICT-01',
          item_type: 'story',
        }}
        sprintName={selectedSprint}
        requiredEjectionPoints={3}
        availableUnstartedItems={
          guardrailItems.length > 0
            ? guardrailItems
            : [
                {
                  id: 'demo-task-1',
                  tenant_id: 't-1',
                  project_id: 'p-1',
                  title: 'Non-critical styling polish',
                  status: 'not_started',
                  item_type: 'task',
                  order_index: 1000,
                  metadata: { story_points: 2 },
                  created_at: '2026-10-01',
                  updated_at: '2026-10-01',
                },
                {
                  id: 'demo-task-2',
                  tenant_id: 't-1',
                  project_id: 'p-1',
                  title: 'Documentation updates',
                  status: 'not_started',
                  item_type: 'task',
                  order_index: 2000,
                  metadata: { story_points: 3 },
                  created_at: '2026-10-01',
                  updated_at: '2026-10-01',
                },
              ]
        }
      />
    </div>
  );
}
