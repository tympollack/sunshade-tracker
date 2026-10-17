'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  GitCompare,
  X,
  PlusCircle,
  MinusCircle,
  TrendingUp,
  TrendingDown,
  Layers,
  Calendar,
  Clock,
  ArrowRight,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  Activity,
  History,
} from 'lucide-react';
import {
  SnapshotDiffResult,
  SnapshotItem,
  EstimateDriftItem,
  StatusDriftItem,
} from '@/lib/services/sprintDiffService';

export interface SprintSnapshotSummary {
  id: string;
  snapshot_type: 'commitment_baseline' | 'daily_rollup' | string;
  captured_at: string;
  committed_points?: number;
  remaining_points?: number;
  name?: string;
  [key: string]: any;
}

export interface SprintDiffModalProps {
  isOpen: boolean;
  onClose: () => void;
  sprintId: string;
  sprintName: string;
  projectId?: string;
  tenantSlug?: string;
  snapshots?: SprintSnapshotSummary[];
  initialDiff?: SnapshotDiffResult | null;
  onDiffLoaded?: (diff: SnapshotDiffResult) => void;
  fetchDiffOverride?: (sprintId: string, base: string, target: string) => Promise<SnapshotDiffResult>;
}

type TabType = 'injected' | 'ejected' | 'drift' | 'status';

export const SprintDiffModal: React.FC<SprintDiffModalProps> = ({
  isOpen,
  onClose,
  sprintId,
  sprintName,
  projectId,
  tenantSlug,
  snapshots: propSnapshots,
  initialDiff = null,
  onDiffLoaded,
  fetchDiffOverride,
}) => {
  const [baseId, setBaseId] = useState<string>('baseline');
  const [targetId, setTargetId] = useState<string>('live');
  const [activeTab, setActiveTab] = useState<TabType>('injected');
  const [diff, setDiff] = useState<SnapshotDiffResult | null>(initialDiff);
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Available snapshots list
  const [snapshots, setSnapshots] = useState<SprintSnapshotSummary[]>(propSnapshots || []);
  const [loadingSnapshots, setLoadingSnapshots] = useState<boolean>(false);

  // Sync propSnapshots if provided
  useEffect(() => {
    if (propSnapshots && propSnapshots.length > 0) {
      setSnapshots(propSnapshots);
    }
  }, [propSnapshots]);

  // Load snapshots if not provided and modal is open
  useEffect(() => {
    if (!isOpen) return;
    if (propSnapshots && propSnapshots.length > 0) return;
    if (!projectId && !sprintId) return;

    let isMounted = true;
    setLoadingSnapshots(true);

    const targetProject = projectId || 'current';
    fetch(
      `/api/v1/projects/${encodeURIComponent(targetProject)}/analytics/snapshots?sprint_id=${encodeURIComponent(
        sprintId
      )}&snapshot_type=all`,
      {
        headers: tenantSlug ? { 'x-tenant-slug': tenantSlug } : undefined,
      }
    )
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isMounted) return;
        if (data?.snapshots && Array.isArray(data.snapshots)) {
          setSnapshots(data.snapshots);
        }
      })
      .catch(() => {
        // Fallback silently if snapshots route fails
      })
      .finally(() => {
        if (isMounted) setLoadingSnapshots(false);
      });

    return () => {
      isMounted = false;
    };
  }, [isOpen, projectId, sprintId, tenantSlug, propSnapshots]);

  // Fetch diff calculation when base or target changes
  const fetchDiff = useCallback(
    async (base: string, target: string) => {
      if (!isOpen || !sprintId) return;

      setLoading(true);
      setError(null);

      try {
        if (fetchDiffOverride) {
          const res = await fetchDiffOverride(sprintId, base, target);
          setDiff(res);
          onDiffLoaded?.(res);
          return;
        }

        const params = new URLSearchParams({
          base,
          target,
        });
        if (projectId) params.set('project_id', projectId);

        const headers: Record<string, string> = {};
        if (tenantSlug) headers['x-tenant-slug'] = tenantSlug;

        const res = await fetch(`/api/v1/sprints/${encodeURIComponent(sprintId)}/diff?${params.toString()}`, {
          headers,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}: Failed to calculate snapshot diff`);
        }

        const data = await res.json();
        setDiff(data.diff);
        onDiffLoaded?.(data.diff);
      } catch (err: any) {
        setError(err.message || 'Error calculating snapshot delta');
      } finally {
        setLoading(false);
      }
    },
    [isOpen, sprintId, projectId, tenantSlug, fetchDiffOverride, onDiffLoaded]
  );

  // Trigger diff fetch on open or base/target changes
  useEffect(() => {
    if (isOpen) {
      if (initialDiff && baseId === 'baseline' && targetId === 'live') {
        setDiff(initialDiff);
      } else {
        fetchDiff(baseId, targetId);
      }
    }
  }, [isOpen, baseId, targetId, fetchDiff]);

  // Reset to default on initial open
  useEffect(() => {
    if (isOpen) {
      setBaseId('baseline');
      setTargetId('live');
      setActiveTab('injected');
    }
  }, [isOpen]);

  // Presets handlers
  const handlePresetBaselineVsNow = () => {
    setBaseId('baseline');
    setTargetId('live');
  };

  const handlePresetPast24Hours = () => {
    setTargetId('live');
    if (!snapshots || snapshots.length === 0) {
      setBaseId('baseline');
      return;
    }
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Find snapshot closest to 24h ago
    let closest = snapshots[0];
    let minDiff = Math.abs(new Date(closest.captured_at).getTime() - oneDayAgo);

    for (const snap of snapshots) {
      const snapTime = new Date(snap.captured_at).getTime();
      const diffTime = Math.abs(snapTime - oneDayAgo);
      if (diffTime < minDiff) {
        minDiff = diffTime;
        closest = snap;
      }
    }

    setBaseId(closest.id);
  };

  const handlePresetPast7Days = () => {
    setTargetId('live');
    if (!snapshots || snapshots.length === 0) {
      setBaseId('baseline');
      return;
    }
    const now = Date.now();
    const sevenDaysAgo = now - 7 * 24 * 60 * 60 * 1000;

    let closest = snapshots[0];
    let minDiff = Math.abs(new Date(closest.captured_at).getTime() - sevenDaysAgo);

    for (const snap of snapshots) {
      const snapTime = new Date(snap.captured_at).getTime();
      const diffTime = Math.abs(snapTime - sevenDaysAgo);
      if (diffTime < minDiff) {
        minDiff = diffTime;
        closest = snap;
      }
    }

    setBaseId(closest.id);
  };

  // Format external ref id with brackets
  const formatRefId = (ref?: string | null) => {
    if (!ref) return null;
    return ref.startsWith('[') ? ref : `[${ref}]`;
  };

  // Helper date formatter
  const formatSnapshotLabel = (snap: SprintSnapshotSummary) => {
    const isBaseline = snap.snapshot_type === 'commitment_baseline';
    const dateStr = snap.captured_at
      ? new Date(snap.captured_at).toLocaleString(undefined, {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })
      : snap.id;
    const typeLabel = isBaseline ? 'Commitment Baseline' : 'Daily Rollup';
    const pointsInfo = snap.committed_points !== undefined ? ` (${snap.committed_points} pts)` : '';
    return `${dateStr} - ${typeLabel}${pointsInfo}`;
  };

  // Summaries from diff
  const injectedPoints = useMemo(() => {
    if (diff?.injected_points !== undefined) return diff.injected_points;
    return (diff?.injected || []).reduce((acc: number, it: SnapshotItem) => acc + (Number(it.story_points) || 0), 0);
  }, [diff]);

  const ejectedPoints = useMemo(() => {
    if (diff?.ejected_points !== undefined) return diff.ejected_points;
    return (diff?.ejected || []).reduce((acc: number, it: SnapshotItem) => acc + (Number(it.story_points) || 0), 0);
  }, [diff]);

  const estimateDriftNet = useMemo(() => {
    if (diff?.estimate_drift_points !== undefined) return diff.estimate_drift_points;
    return (diff?.estimate_drift || []).reduce(
      (acc: number, it: EstimateDriftItem) => acc + (Number(it.delta ?? (it as any).delta_points) || 0),
      0
    );
  }, [diff]);

  if (!isOpen) return null;

  return (
    <div
      data-testid="sprint-diff-modal"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200"
    >
      <div
        className="w-full max-w-4xl rounded-2xl bg-[#090d16] border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]"
        role="dialog"
        aria-modal="true"
      >
        {/* Modal Header */}
        <div className="p-5 border-b border-slate-800/80 bg-gradient-to-r from-blue-950/30 via-slate-900/50 to-transparent flex items-start justify-between">
          <div className="flex items-start space-x-3">
            <div className="p-2.5 rounded-xl bg-blue-500/10 border border-blue-500/30 text-blue-400 shrink-0">
              <GitCompare className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center space-x-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/30">
                  Itemized Scope Delta Diff
                </span>
                <span className="text-xs font-mono text-slate-400">{sprintName}</span>
              </div>
              <h2 className="text-lg font-bold text-white mt-1">Snapshot Diff Inspector</h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-testid="diff-close-button"
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/60 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 space-y-5 overflow-y-auto flex-1 custom-scrollbar">
          {/* Snapshot Selectors & Presets */}
          <div className="p-4 rounded-xl bg-slate-900/60 border border-slate-800 space-y-4">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <span className="text-xs font-semibold uppercase tracking-wider font-mono text-slate-300 flex items-center gap-1.5">
                <History className="w-4 h-4 text-sky-400" />
                Snapshot Comparison Range
              </span>

              {/* Preset Buttons */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] font-mono text-slate-400 mr-1">Presets:</span>
                <button
                  type="button"
                  data-testid="preset-baseline-now"
                  onClick={handlePresetBaselineVsNow}
                  className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium transition-all ${
                    baseId === 'baseline' && targetId === 'live'
                      ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                      : 'bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white border border-slate-700/60'
                  }`}
                >
                  Baseline vs Now
                </button>
                <button
                  type="button"
                  data-testid="preset-past-24h"
                  onClick={handlePresetPast24Hours}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white border border-slate-700/60 transition-all"
                >
                  Past 24 Hours
                </button>
                <button
                  type="button"
                  data-testid="preset-past-7d"
                  onClick={handlePresetPast7Days}
                  className="px-2.5 py-1 rounded-lg text-xs font-mono font-medium bg-slate-800/80 text-slate-300 hover:bg-slate-700/80 hover:text-white border border-slate-700/60 transition-all"
                >
                  Past 7 Days
                </button>
              </div>
            </div>

            {/* Dual Dropdowns */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Base Snapshot Selector */}
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1.5 font-medium">
                  Base Snapshot (Origin Reference)
                </label>
                <select
                  data-testid="diff-base-select"
                  value={baseId}
                  onChange={(e) => setBaseId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer"
                >
                  <option value="baseline">Commitment Baseline (Sprint Start)</option>
                  {snapshots
                    .filter((s) => s.snapshot_type !== 'commitment_baseline')
                    .map((snap) => (
                      <option key={snap.id} value={snap.id}>
                        {formatSnapshotLabel(snap)}
                      </option>
                    ))}
                </select>
              </div>

              {/* Target Snapshot Selector */}
              <div>
                <label className="block text-xs font-mono text-slate-400 mb-1.5 font-medium">
                  Target Snapshot (Destination Scope)
                </label>
                <select
                  data-testid="diff-target-select"
                  value={targetId}
                  onChange={(e) => setTargetId(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-slate-200 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-blue-500 transition-all cursor-pointer"
                >
                  <option value="live">Live Sprint Backlog (Current State)</option>
                  {snapshots.map((snap) => (
                    <option key={snap.id} value={snap.id}>
                      {formatSnapshotLabel(snap)}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Loading or Error State */}
          {loading && (
            <div className="p-8 rounded-xl bg-slate-900/40 border border-slate-800/80 flex flex-col items-center justify-center space-y-3">
              <RefreshCw className="w-6 h-6 text-blue-400 animate-spin" />
              <span className="text-xs font-mono text-slate-400">Computing itemized scope differential...</span>
            </div>
          )}

          {error && !loading && (
            <div className="p-4 rounded-xl bg-red-950/40 border border-red-500/30 text-red-300 text-xs flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span>{error}</span>
              </div>
              <button
                type="button"
                onClick={() => fetchDiff(baseId, targetId)}
                className="px-2.5 py-1 rounded bg-red-900/60 hover:bg-red-800 text-white font-mono text-[11px] transition-colors"
              >
                Retry
              </button>
            </div>
          )}

          {/* Summary KPI Ribbon */}
          {diff && !loading && (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 font-mono">
                {/* KPI 1: Net Points Delta */}
                <div
                  data-testid="kpi-net-delta"
                  className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider">Net Scope Delta</span>
                    {diff.net_points_delta > 0 ? (
                      <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                    ) : diff.net_points_delta < 0 ? (
                      <TrendingDown className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Activity className="w-3.5 h-3.5 text-slate-400" />
                    )}
                  </div>
                  <div>
                    <span
                      className={`text-xl font-bold ${
                        diff.net_points_delta > 0
                          ? 'text-amber-400'
                          : diff.net_points_delta < 0
                          ? 'text-emerald-400'
                          : 'text-slate-300'
                      }`}
                    >
                      {diff.net_points_delta > 0 ? `+${diff.net_points_delta}` : diff.net_points_delta} pts
                    </span>
                    <span className="text-[11px] text-slate-500 block mt-0.5">
                      {diff.churn_rate_pct}% churn rate
                    </span>
                  </div>
                </div>

                {/* KPI 2: Injected Scope */}
                <div
                  data-testid="kpi-injected"
                  className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider">Injected Scope</span>
                    <PlusCircle className="w-3.5 h-3.5 text-amber-400" />
                  </div>
                  <div>
                    <span className="text-xl font-bold text-white">
                      +{injectedPoints} pts
                    </span>
                    <span className="text-[11px] text-amber-400/90 block mt-0.5">
                      {diff.injected.length} item{diff.injected.length !== 1 ? 's' : ''} added
                    </span>
                  </div>
                </div>

                {/* KPI 3: Ejected Scope */}
                <div
                  data-testid="kpi-ejected"
                  className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider">Ejected Scope</span>
                    <MinusCircle className="w-3.5 h-3.5 text-rose-400" />
                  </div>
                  <div>
                    <span className="text-xl font-bold text-white">
                      -{ejectedPoints} pts
                    </span>
                    <span className="text-[11px] text-rose-400/90 block mt-0.5">
                      {diff.ejected.length} item{diff.ejected.length !== 1 ? 's' : ''} removed
                    </span>
                  </div>
                </div>

                {/* KPI 4: Estimate Modifications */}
                <div
                  data-testid="kpi-estimate-drift"
                  className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between text-slate-400 mb-1">
                    <span className="text-[10px] uppercase font-bold tracking-wider">Estimate Drift</span>
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                  </div>
                  <div>
                    <span className="text-xl font-bold text-white">
                      {estimateDriftNet > 0 ? `+${estimateDriftNet}` : estimateDriftNet} pts
                    </span>
                    <span className="text-[11px] text-sky-400/90 block mt-0.5">
                      {diff.estimate_drift.length} modified
                    </span>
                  </div>
                </div>
              </div>

              {/* Categorized Delta Navigation Tabs */}
              <div className="border-b border-slate-800 flex items-center space-x-1 font-mono text-xs">
                <button
                  type="button"
                  data-testid="tab-injected"
                  onClick={() => setActiveTab('injected')}
                  className={`px-4 py-2.5 font-medium border-b-2 transition-all flex items-center gap-2 ${
                    activeTab === 'injected'
                      ? 'border-amber-400 text-amber-300 bg-amber-500/10'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                  }`}
                >
                  <PlusCircle className="w-3.5 h-3.5" />
                  <span>Injected Scope</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    {diff.injected.length}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="tab-ejected"
                  onClick={() => setActiveTab('ejected')}
                  className={`px-4 py-2.5 font-medium border-b-2 transition-all flex items-center gap-2 ${
                    activeTab === 'ejected'
                      ? 'border-rose-400 text-rose-300 bg-rose-500/10'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                  }`}
                >
                  <MinusCircle className="w-3.5 h-3.5" />
                  <span>Ejected Scope</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-rose-500/20 text-rose-300 border border-rose-500/30">
                    {diff.ejected.length}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="tab-estimate-drift"
                  onClick={() => setActiveTab('drift')}
                  className={`px-4 py-2.5 font-medium border-b-2 transition-all flex items-center gap-2 ${
                    activeTab === 'drift'
                      ? 'border-sky-400 text-sky-300 bg-sky-500/10'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>Estimate Drift</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-500/20 text-sky-300 border border-sky-500/30">
                    {diff.estimate_drift.length}
                  </span>
                </button>

                <button
                  type="button"
                  data-testid="tab-status-drift"
                  onClick={() => setActiveTab('status')}
                  className={`px-4 py-2.5 font-medium border-b-2 transition-all flex items-center gap-2 ${
                    activeTab === 'status'
                      ? 'border-purple-400 text-purple-300 bg-purple-500/10'
                      : 'border-transparent text-slate-400 hover:text-slate-200 hover:bg-slate-900/40'
                  }`}
                >
                  <Activity className="w-3.5 h-3.5" />
                  <span>Status Drift</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-purple-500/20 text-purple-300 border border-purple-500/30">
                    {diff.status_drift.length}
                  </span>
                </button>
              </div>

              {/* Categorized Breakdown Content */}
              <div className="space-y-2">
                {/* Tab: Injected Scope */}
                {activeTab === 'injected' && (
                  <div data-testid="injected-list" className="space-y-2">
                    {diff.injected.length === 0 ? (
                      <div
                        data-testid="empty-injected-state"
                        className="p-8 rounded-xl bg-slate-900/40 border border-dashed border-slate-800 text-center space-y-2"
                      >
                        <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto" />
                        <h4 className="text-sm font-semibold text-slate-200">Zero Scope Injections</h4>
                        <p className="text-xs text-slate-400 max-w-md mx-auto">
                          Zero scope injections detected. No new work items have been added between the selected snapshots.
                        </p>
                      </div>
                    ) : (
                      diff.injected.map((item: SnapshotItem) => (
                        <div
                          key={item.id}
                          className="p-3 rounded-xl bg-slate-900/50 border border-amber-500/20 flex items-center justify-between hover:border-amber-500/40 transition-colors"
                        >
                          <div className="min-w-0 pr-3">
                            <div className="flex items-center gap-2 mb-1">
                              {formatRefId(item.external_ref_id) && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-300 border border-amber-500/30">
                                  {formatRefId(item.external_ref_id)}
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-300">
                                {item.status}
                              </span>
                              {item.assignee_id && (
                                <span className="text-[11px] font-mono text-slate-400">
                                  assignee: {item.assignee_id}
                                </span>
                              )}
                            </div>
                            <p className="text-sm font-medium text-slate-100 truncate">{item.title}</p>
                          </div>
                          <div className="shrink-0 text-right font-mono">
                            <span className="px-2.5 py-1 rounded-lg bg-amber-500/10 text-amber-300 border border-amber-500/30 text-xs font-bold">
                              +{item.story_points ?? 0} pts
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Tab: Ejected Scope */}
                {activeTab === 'ejected' && (
                  <div data-testid="ejected-list" className="space-y-2">
                    {diff.ejected.length === 0 ? (
                      <div
                        data-testid="empty-ejected-state"
                        className="p-8 rounded-xl bg-slate-900/40 border border-dashed border-slate-800 text-center space-y-2"
                      >
                        <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto" />
                        <h4 className="text-sm font-semibold text-slate-200">Zero Scope Ejections</h4>
                        <p className="text-xs text-slate-400 max-w-md mx-auto">
                          Zero scope ejections detected. No work items were removed from this sprint between the selected snapshots.
                        </p>
                      </div>
                    ) : (
                      diff.ejected.map((item: SnapshotItem) => (
                        <div
                          key={item.id}
                          className="p-3 rounded-xl bg-slate-900/50 border border-rose-500/20 flex items-center justify-between hover:border-rose-500/40 transition-colors"
                        >
                          <div className="min-w-0 pr-3">
                            <div className="flex items-center gap-2 mb-1">
                              {formatRefId(item.external_ref_id) && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-500/10 text-rose-300 border border-rose-500/30">
                                  {formatRefId(item.external_ref_id)}
                                </span>
                              )}
                              <span className="px-1.5 py-0.5 rounded text-[10px] font-mono uppercase bg-slate-800 text-slate-300">
                                {item.status}
                              </span>
                            </div>
                            <p className="text-sm font-medium text-slate-100 truncate">{item.title}</p>
                          </div>
                          <div className="shrink-0 text-right font-mono">
                            <span className="px-2.5 py-1 rounded-lg bg-rose-500/10 text-rose-300 border border-rose-500/30 text-xs font-bold">
                              -{item.story_points ?? 0} pts
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}

                {/* Tab: Estimate Drift */}
                {activeTab === 'drift' && (
                  <div data-testid="estimate-drift-list" className="space-y-2">
                    {diff.estimate_drift.length === 0 ? (
                      <div
                        data-testid="empty-drift-state"
                        className="p-8 rounded-xl bg-slate-900/40 border border-dashed border-slate-800 text-center space-y-2"
                      >
                        <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto" />
                        <h4 className="text-sm font-semibold text-slate-200">Zero Estimate Drift</h4>
                        <p className="text-xs text-slate-400 max-w-md mx-auto">
                          Zero estimate drift detected. All item estimates remain constant across the selected timeframe.
                        </p>
                      </div>
                    ) : (
                      diff.estimate_drift.map((drift: EstimateDriftItem) => {
                        const delta = drift.delta ?? (drift as any).delta_points ?? 0;
                        return (
                          <div
                            key={drift.item.id}
                            className="p-3 rounded-xl bg-slate-900/50 border border-sky-500/20 flex items-center justify-between hover:border-sky-500/40 transition-colors"
                          >
                            <div className="min-w-0 pr-3">
                              <div className="flex items-center gap-2 mb-1">
                                {formatRefId(drift.item.external_ref_id) && (
                                  <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-sky-500/10 text-sky-300 border border-sky-500/30">
                                    {formatRefId(drift.item.external_ref_id)}
                                  </span>
                                )}
                                <span className="text-xs font-mono text-slate-400">
                                  {drift.base_points} pts → {drift.target_points} pts
                                </span>
                              </div>
                              <p className="text-sm font-medium text-slate-100 truncate">{drift.item.title}</p>
                            </div>
                            <div className="shrink-0 text-right font-mono">
                              <span
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${
                                  delta > 0
                                    ? 'bg-amber-500/10 text-amber-300 border-amber-500/30'
                                    : 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30'
                                }`}
                              >
                                {delta > 0 ? `+${delta}` : delta} pts
                              </span>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                )}

                {/* Tab: Status Drift */}
                {activeTab === 'status' && (
                  <div data-testid="status-drift-list" className="space-y-2">
                    {diff.status_drift.length === 0 ? (
                      <div
                        data-testid="empty-status-state"
                        className="p-8 rounded-xl bg-slate-900/40 border border-dashed border-slate-800 text-center space-y-2"
                      >
                        <ShieldCheck className="w-8 h-8 text-emerald-400 mx-auto" />
                        <h4 className="text-sm font-semibold text-slate-200">Zero Status Drift</h4>
                        <p className="text-xs text-slate-400 max-w-md mx-auto">
                          Zero status drift detected. Item workflow statuses are identical between the selected snapshots.
                        </p>
                      </div>
                    ) : (
                      diff.status_drift.map((drift: StatusDriftItem) => (
                        <div
                          key={drift.item.id}
                          className="p-3 rounded-xl bg-slate-900/50 border border-purple-500/20 flex items-center justify-between hover:border-purple-500/40 transition-colors"
                        >
                          <div className="min-w-0 pr-3">
                            <div className="flex items-center gap-2 mb-1">
                              {formatRefId(drift.item.external_ref_id) && (
                                <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-purple-500/10 text-purple-300 border border-purple-500/30">
                                  {formatRefId(drift.item.external_ref_id)}
                                </span>
                              )}
                              <span className="text-xs font-mono text-slate-300 flex items-center gap-1.5">
                                <span className="uppercase text-slate-400">{drift.base_status}</span>
                                <ArrowRight className="w-3 h-3 text-purple-400" />
                                <span className="uppercase text-purple-300 font-bold">{drift.target_status}</span>
                              </span>
                            </div>
                            <p className="text-sm font-medium text-slate-100 truncate">{drift.item.title}</p>
                          </div>
                          <div className="shrink-0 text-right font-mono">
                            <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-slate-800 text-slate-300">
                              {drift.item.story_points ?? 0} pts
                            </span>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 border-t border-slate-800 bg-slate-950 flex items-center justify-between text-xs font-mono text-slate-500">
          <div>
            Comparing <span className="text-slate-300 font-semibold">{baseId}</span> to{' '}
            <span className="text-slate-300 font-semibold">{targetId}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white font-medium transition-colors"
          >
            Close Inspector
          </button>
        </div>
      </div>
    </div>
  );
};
