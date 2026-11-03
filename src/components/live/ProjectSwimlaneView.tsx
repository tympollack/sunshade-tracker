'use client';

import React, { useState, useEffect } from 'react';
import {
  Bot,
  ChevronDown,
  ChevronRight,
  Clock,
  FolderKanban,
  Layers,
  Sparkles,
  User,
} from 'lucide-react';
import {
  EnrichedInFlightItem,
  InFlightTelemetryPayload,
  ProjectSwimlaneSummary,
} from '@/lib/services/inFlightTelemetryCore';
import { formatDwellDuration, getPriorityDotClass } from './StageFlowView';

export const SWIMLANE_COLLAPSE_STORAGE_KEY = 'sunshade_live_collapsed_swimlanes';

export interface ProjectSwimlaneViewProps {
  telemetry: InFlightTelemetryPayload;
  selectedItemRef?: string | null;
  onSelectItem?: (item: EnrichedInFlightItem) => void;
  storageKey?: string;
}

export function ProjectSwimlaneView({
  telemetry,
  selectedItemRef,
  onSelectItem,
  storageKey = SWIMLANE_COLLAPSE_STORAGE_KEY,
}: ProjectSwimlaneViewProps) {
  const [collapsedProjectIds, setCollapsedProjectIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch {}
    return new Set();
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) {
          setCollapsedProjectIds(new Set(parsed));
        }
      }
    } catch {}
  }, [storageKey]);

  const toggleProjectCollapse = (projectId: string) => {
    setCollapsedProjectIds((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) {
        next.delete(projectId);
      } else {
        next.add(projectId);
      }
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(storageKey, JSON.stringify(Array.from(next)));
        } catch {}
      }
      return next;
    });
  };

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

  // Show projects containing active in-flight items (or all configured projects if none have active items)
  const allProjects: ProjectSwimlaneSummary[] = telemetry.projects || [];
  const activeProjects = allProjects.filter((p) => p.active_item_count > 0);
  const displayedProjects = activeProjects.length > 0 ? activeProjects : allProjects;

  if (displayedProjects.length === 0) {
    return (
      <div
        data-testid="project-swimlanes-empty"
        className="rounded-xl bg-slate-900/50 border border-dashed border-slate-800 p-10 text-center space-y-2"
      >
        <Layers className="w-7 h-7 text-slate-600 mx-auto" />
        <h3 className="text-sm font-semibold text-slate-300">0 Active Project Swimlanes</h3>
        <p className="text-xs text-slate-500">
          No active in-flight deliverables are currently executing across workspace projects.
        </p>
      </div>
    );
  }

  return (
    <div data-testid="project-swimlane-view" className="w-full space-y-3.5">
      {displayedProjects.map((project) => {
        const isCollapsed = collapsedProjectIds.has(project.project_id);
        const healthBadge =
          project.health_status === 'saturated'
            ? {
                label: 'Over Cap',
                style: 'bg-amber-500/15 text-amber-300 border-amber-500/40',
              }
            : project.health_status === 'approaching_limit'
            ? {
                label: 'Near Cap',
                style: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/40',
              }
            : {
                label: 'Healthy',
                style: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
              };

        return (
          <div
            key={project.project_id}
            data-testid={`project-swimlane-${project.project_slug}`}
            className="rounded-xl bg-slate-900/60 border border-slate-800/90 overflow-hidden shadow-sm"
          >
            {/* Row Header */}
            <button
              type="button"
              data-testid={`swimlane-toggle-${project.project_slug}`}
              aria-expanded={!isCollapsed}
              onClick={() => toggleProjectCollapse(project.project_id)}
              className="w-full px-4 py-3 bg-slate-950/80 hover:bg-slate-950 flex flex-wrap items-center justify-between gap-3 text-left transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2.5 min-w-0">
                {isCollapsed ? (
                  <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-cyan-400 shrink-0" />
                )}
                <div className="p-1.5 rounded-lg bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 shrink-0">
                  <FolderKanban className="w-3.5 h-3.5" />
                </div>
                <span className="text-sm font-bold text-white truncate">
                  {project.project_name}
                </span>
                <span className="text-xs font-mono text-slate-500">
                  ({project.project_slug})
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 font-mono text-xs shrink-0">
                <span
                  data-testid={`swimlane-items-${project.project_slug}`}
                  className="px-2 py-0.5 rounded bg-slate-900 text-slate-300 border border-slate-800"
                >
                  {project.active_item_count} active{' '}
                  {project.active_item_count === 1 ? 'item' : 'items'}
                </span>

                <span
                  data-testid={`swimlane-units-${project.project_slug}`}
                  className="px-2 py-0.5 rounded bg-slate-900 text-cyan-300 border border-slate-800 font-semibold"
                >
                  {Number(project.active_units).toLocaleString()} {project.unit_label || 'pts'}
                </span>

                <span
                  data-testid={`swimlane-wip-pill-${project.project_slug}`}
                  className={`px-2.5 py-0.5 rounded-full border font-semibold ${healthBadge.style}`}
                >
                  WIP: {project.active_item_count}/{project.wip_limit} Limit &middot;{' '}
                  {healthBadge.label}
                </span>
              </div>
            </button>

            {/* Card Grid Layout */}
            {!isCollapsed && (
              <div
                data-testid={`swimlane-body-${project.project_slug}`}
                className="p-3.5 border-t border-slate-800/80"
              >
                {project.items.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-500 font-mono">
                    0 Active In-Flight Items in {project.project_name}
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
                    {project.items.map((item) => {
                      const refId = item.external_ref_id || item.id;
                      const isSelected =
                        selectedItemRef &&
                        (selectedItemRef.toLowerCase() === refId.toLowerCase() ||
                          selectedItemRef === item.id);
                      const priorityMeta = getPriorityDotClass(item.metadata?.priority);
                      const hasAgentPrompt = Boolean(item.metadata?.agent_prompt);
                      const actorName =
                        item.metadata?.origin_agent ||
                        item.assignee ||
                        'Unassigned';
                      const formattedUnits = `${Number(item.work_units).toLocaleString()} ${item.unit_label || 'pts'}`;
                      const dwellText = formatDwellDuration(
                        item.dwell_hours,
                        item.status_label || item.status
                      );

                      return (
                        <div
                          key={item.id}
                          role="button"
                          tabIndex={0}
                          data-testid={`swimlane-card-${refId}`}
                          onClick={() => handleCardClick(item)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleCardClick(item);
                            }
                          }}
                          className={`group rounded-xl p-3 bg-slate-950/90 hover:bg-slate-900 border transition-all cursor-pointer flex flex-col justify-between space-y-2.5 ${
                            item.is_stagnant
                              ? 'border-amber-500/70 ring-1 ring-amber-500/30'
                              : isSelected
                              ? 'border-cyan-400 ring-1 ring-cyan-400/40'
                              : 'border-slate-800/90 hover:border-slate-700'
                          }`}
                        >
                          <div className="space-y-1.5">
                            {/* Native Status Badge + Ref ID + Priority */}
                            <div className="flex items-center justify-between gap-2 text-[11px] font-mono">
                              <span
                                data-testid={`swimlane-card-status-${refId}`}
                                className="inline-flex items-center space-x-1.5 px-2 py-0.5 rounded-md border border-slate-800 bg-slate-900 text-slate-200 font-medium"
                              >
                                <span
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ backgroundColor: item.status_color || '#38BDF8' }}
                                />
                                <span>{item.status_label || item.status}</span>
                              </span>

                              <div className="flex items-center space-x-1.5">
                                <span className="text-slate-400 group-hover:text-cyan-300 font-semibold transition-colors">
                                  #{refId}
                                </span>
                                <span
                                  title={`Priority: ${priorityMeta.label}`}
                                  className={`w-2 h-2 rounded-full shrink-0 ${priorityMeta.colorClass}`}
                                />
                              </div>
                            </div>

                            {/* Deliverable Title */}
                            <div className="text-xs font-semibold text-slate-100 line-clamp-2 leading-snug">
                              {item.title}
                            </div>
                          </div>

                          {/* Agent Prompt Badge & Footer Metrics */}
                          <div className="space-y-2 pt-1.5 border-t border-slate-900">
                            {hasAgentPrompt && (
                              <div
                                data-testid={`agent-prompt-badge-${refId}`}
                                className="inline-flex items-center space-x-1 px-2 py-0.5 rounded bg-purple-950/50 border border-purple-700/50 text-[10px] font-mono text-purple-300"
                              >
                                <Sparkles className="w-3 h-3 text-purple-400 shrink-0" />
                                <span>Agent / Developer Prompt Ready</span>
                              </div>
                            )}

                            <div className="flex items-center justify-between gap-1.5 text-[11px] font-mono">
                              <span className="inline-flex items-center space-x-1 text-slate-400 truncate max-w-[110px]">
                                {hasAgentPrompt ? (
                                  <Bot className="w-3 h-3 text-purple-400 shrink-0" />
                                ) : (
                                  <User className="w-3 h-3 text-slate-500 shrink-0" />
                                )}
                                <span className="truncate">{actorName}</span>
                              </span>

                              <div className="flex items-center space-x-1.5 shrink-0">
                                <span className="px-1.5 py-0.5 rounded bg-emerald-950/40 text-emerald-300 border border-emerald-800/40">
                                  {formattedUnits}
                                </span>
                                <span className="inline-flex items-center space-x-1 text-slate-500">
                                  <Clock className="w-2.5 h-2.5" />
                                  <span>{dwellText}</span>
                                </span>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
