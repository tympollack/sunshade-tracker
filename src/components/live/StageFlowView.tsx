'use client';

import React from 'react';
import { Bot, Clock, Flame, Layers, User } from 'lucide-react';
import {
  EnrichedInFlightItem,
  InFlightTelemetryPayload,
  StageBucketSummary,
} from '@/lib/services/inFlightTelemetryService';
import { DEFAULT_LIVE_DASHBOARD_SETTINGS } from '@/types/tracker';

export interface StageFlowViewProps {
  telemetry: InFlightTelemetryPayload;
  selectedItemRef?: string | null;
  onSelectItem?: (item: EnrichedInFlightItem) => void;
}

export function formatDwellDuration(dwellHours: number, statusLabel: string): string {
  const cleanStatus = statusLabel.toLowerCase();
  if (dwellHours >= 24) {
    const days = Number((dwellHours / 24).toFixed(1));
    return `${days}d in ${cleanStatus}`;
  }
  const hrs = Math.max(0.1, Number(dwellHours.toFixed(1)));
  return `${hrs}h in ${cleanStatus}`;
}

export function getPriorityDotClass(priority: unknown): { colorClass: string; label: string } {
  const norm = String(priority || 'medium').toLowerCase().trim();
  if (norm === 'critical' || norm === 'p0' || norm === 'emergency') {
    return { colorClass: 'bg-red-400 shadow-[0_0_6px_rgba(248,113,113,0.8)]', label: 'Critical' };
  }
  if (norm === 'high' || norm === 'p1') {
    return { colorClass: 'bg-amber-400', label: 'High' };
  }
  if (norm === 'low' || norm === 'p3') {
    return { colorClass: 'bg-slate-400', label: 'Low' };
  }
  return { colorClass: 'bg-sky-400', label: 'Medium' };
}

export function StageFlowView({
  telemetry,
  selectedItemRef,
  onSelectItem,
}: StageFlowViewProps) {
  const configuredCategories =
    telemetry.live_dashboard_settings?.lifecycle_categories?.length
      ? telemetry.live_dashboard_settings.lifecycle_categories
      : DEFAULT_LIVE_DASHBOARD_SETTINGS.lifecycle_categories;

  const columns: StageBucketSummary[] = configuredCategories.map((cat) => {
    const existing = (telemetry.stages || []).find((s) => s.stage === cat.key);
    if (existing) return existing;
    const stageItems = (telemetry.in_flight_items || []).filter(
      (it) => it.lifecycle_stage === cat.key
    );
    const totalUnits = Number(
      stageItems.reduce((sum, it) => sum + (it.work_units || 0), 0).toFixed(2)
    );
    return {
      stage: cat.key as StageBucketSummary['stage'],
      label: cat.label,
      color: cat.color,
      order: cat.order,
      item_count: stageItems.length,
      total_units: totalUnits,
      median_dwell_ms: 0,
      median_dwell_hours: 0,
      items: stageItems,
    };
  });

  const handleCardClick = (item: EnrichedInFlightItem) => {
    const ref = item.external_ref_id || item.id;
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('item', ref);
      window.history.replaceState(null, '', url.pathname + url.search);
    }
    if (onSelectItem) {
      onSelectItem(item);
    }
  };

  return (
    <div
      data-testid="stage-flow-view"
      className="w-full grid grid-cols-1 lg:grid-cols-3 gap-4 min-h-0 flex-1 overflow-x-hidden"
    >
      {columns.map((col) => (
        <div
          key={col.stage}
          data-testid={`stage-column-${col.stage}`}
          className="flex flex-col rounded-xl bg-slate-900/60 border border-slate-800/90 overflow-hidden min-h-[340px]"
        >
          {/* Column Header */}
          <div className="px-4 py-3 border-b border-slate-800/90 bg-slate-950/70 flex items-center justify-between gap-2">
            <div className="flex items-center space-x-2 min-w-0">
              <span
                className="w-2.5 h-2.5 rounded-full shrink-0"
                style={{ backgroundColor: col.color || '#38BDF8' }}
              />
              <h3 className="text-xs font-bold uppercase tracking-wider text-white truncate">
                {col.label}
              </h3>
            </div>

            <div className="flex items-center space-x-1.5 shrink-0 font-mono text-[11px]">
              <span
                data-testid={`stage-count-${col.stage}`}
                className="px-2 py-0.5 rounded bg-slate-900 text-slate-200 border border-slate-800"
              >
                {col.item_count} {col.item_count === 1 ? 'item' : 'items'}
              </span>
              <span
                data-testid={`stage-units-${col.stage}`}
                className="px-2 py-0.5 rounded bg-cyan-950/50 text-cyan-300 border border-cyan-800/50 font-semibold"
              >
                {col.total_units} units
              </span>
            </div>
          </div>

          {/* Column Cards List */}
          <div className="p-3 space-y-2.5 overflow-y-auto flex-1 custom-scrollbar">
            {col.items.length === 0 ? (
              <div
                data-testid={`stage-empty-${col.stage}`}
                className="h-44 rounded-lg border border-dashed border-slate-800/80 flex flex-col items-center justify-center text-center p-4 text-slate-500"
              >
                <Layers className="w-5 h-5 mb-1.5 text-slate-600" />
                <p className="text-xs font-medium text-slate-400">0 Active Deliverables</p>
                <p className="text-[11px] text-slate-500">
                  No work items currently in {col.label}.
                </p>
              </div>
            ) : (
              col.items.map((item) => {
                const refId = item.external_ref_id || item.id;
                const isSelected =
                  selectedItemRef &&
                  (selectedItemRef.toLowerCase() === refId.toLowerCase() ||
                    selectedItemRef === item.id);
                const priorityMeta = getPriorityDotClass(item.metadata?.priority);
                const actorName =
                  item.metadata?.origin_agent ||
                  item.assignee ||
                  'Unassigned';
                const hasAgent = Boolean(item.metadata?.agent_prompt || item.metadata?.origin_agent);
                const formattedUnits = `${Number(item.work_units).toLocaleString()} ${item.unit_label || 'pts'}`;
                const dwellText = formatDwellDuration(item.dwell_hours, item.status_label || item.status);

                return (
                  <div
                    key={item.id}
                    role="button"
                    tabIndex={0}
                    data-testid={`stage-card-${refId}`}
                    onClick={() => handleCardClick(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleCardClick(item);
                      }
                    }}
                    className={`group relative rounded-xl p-3 bg-slate-950/90 hover:bg-slate-900 border transition-all cursor-pointer select-none space-y-2 ${
                      item.is_stagnant
                        ? 'border-amber-500/70 ring-2 ring-amber-500/30 shadow-[0_0_15px_rgba(245,158,11,0.15)]'
                        : isSelected
                        ? 'border-cyan-400 ring-1 ring-cyan-400/40'
                        : 'border-slate-800/90 hover:border-slate-700'
                    }`}
                  >
                    {/* Systemic Aging Warning Pulse Banner */}
                    {item.is_stagnant && (
                      <div
                        data-testid={`flow-stall-badge-${refId}`}
                        className="flex items-center space-x-1.5 px-2 py-0.5 rounded-md bg-amber-500/15 border border-amber-500/40 text-[10px] font-mono font-semibold text-amber-300"
                      >
                        <Flame className="w-3 h-3 text-amber-400 animate-pulse shrink-0" />
                        <span>Flow Stall: Needs Peer Review / Triage</span>
                      </div>
                    )}

                    {/* Line 1: Project Pill, Ref ID deep-link, Priority dot */}
                    <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                      <div className="flex items-center space-x-1.5 min-w-0">
                        <span className="px-1.5 py-0.5 rounded bg-slate-900 text-sky-300 border border-slate-800 truncate max-w-[140px]">
                          [Proj: {item.project_name || item.project_slug}]
                        </span>
                        <span className="text-slate-300 font-semibold group-hover:text-cyan-300 transition-colors truncate">
                          #{refId}
                        </span>
                      </div>

                      <span
                        title={`Priority: ${priorityMeta.label}`}
                        className={`w-2 h-2 rounded-full shrink-0 ${priorityMeta.colorClass}`}
                      />
                    </div>

                    {/* Line 2: Deliverable Title */}
                    <div className="text-xs font-semibold text-slate-100 line-clamp-2 leading-snug">
                      {item.title}
                    </div>

                    {/* Line 3: Active Actor / Agent Pill, Dynamic Work Unit Badge, System Stage Dwell Badge */}
                    <div className="flex flex-wrap items-center justify-between gap-1.5 pt-1 border-t border-slate-900 text-[11px] font-mono">
                      <span className="inline-flex items-center space-x-1 px-1.5 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800 max-w-[130px] truncate">
                        {hasAgent ? (
                          <Bot className="w-3 h-3 text-purple-400 shrink-0" />
                        ) : (
                          <User className="w-3 h-3 text-slate-400 shrink-0" />
                        )}
                        <span className="truncate">{actorName}</span>
                      </span>

                      <div className="flex items-center space-x-1.5">
                        <span
                          data-testid={`card-unit-badge-${refId}`}
                          className="px-1.5 py-0.5 rounded bg-emerald-950/50 text-emerald-300 border border-emerald-800/50 font-medium"
                        >
                          {formattedUnits}
                        </span>

                        <span
                          data-testid={`card-dwell-badge-${refId}`}
                          className={`inline-flex items-center space-x-1 px-1.5 py-0.5 rounded border ${
                            item.is_stagnant
                              ? 'bg-amber-950/60 text-amber-300 border-amber-700/60'
                              : 'bg-slate-900 text-slate-400 border-slate-800'
                          }`}
                        >
                          <Clock className="w-2.5 h-2.5 shrink-0" />
                          <span>{dwellText}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
