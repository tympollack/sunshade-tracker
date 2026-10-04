'use client';

import React, { useState, useEffect } from 'react';
import {
  ChevronDown,
  ChevronRight,
  FolderTree,
  AlertTriangle,
  Clock,
  Sparkles,
  ExternalLink,
} from 'lucide-react';
import { ProjectCalibrationGroup, CalibratedWorkItem } from '@/lib/services/estimationCalibrationService';
import { CalibrationBar } from './CalibrationBar';

export interface ProjectFocusAccordionProps {
  projects: ProjectCalibrationGroup[];
  targetVelocityRatio?: number;
  onSelectItem?: (externalRefId: string) => void;
  className?: string;
}

const STORAGE_KEY = 'statement_accordion_state';

const EMPTY_PROJECTS: ProjectCalibrationGroup[] = [];

export function ProjectFocusAccordion({
  projects = EMPTY_PROJECTS,
  targetVelocityRatio = 2.0,
  onSelectItem,
  className = '',
}: ProjectFocusAccordionProps) {
  // Retain open/closed state in localStorage
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!Array.isArray(projects) || projects.length === 0) return;

    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        setOpenMap(JSON.parse(saved));
        return;
      }
    } catch {
      // Fallback
    }

    // Default: expand all projects initially
    const defaults = projects.reduce<Record<string, boolean>>((acc, p) => {
      acc[p.projectId] = true;
      return acc;
    }, {});
    setOpenMap(defaults);
  }, [projects]);

  const toggleProject = (projectId: string) => {
    setOpenMap((prev) => {
      const next = { ...prev, [projectId]: !prev[projectId] };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        // Storage quota / privacy mode fallback
      }
      return next;
    });
  };

  const handleItemClick = (refId: string) => {
    if (onSelectItem) {
      onSelectItem(refId);
    }
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('item', refId);
      window.history.pushState(null, '', url.pathname + url.search);
      window.dispatchEvent(new Event('popstate'));
    }
  };

  if (!projects || projects.length === 0) {
    return (
      <div
        className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 text-center text-slate-400 text-xs"
        data-testid="empty-focus-accordion"
      >
        No project telemetry recorded for this timeframe.
      </div>
    );
  }

  return (
    <div
      className={`space-y-4 ${className}`}
      data-testid="project-focus-accordion-container"
    >
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-300 flex items-center gap-2">
          <FolderTree className="w-4 h-4 text-emerald-400" />
          <span>Project Workload & Estimation Calibration</span>
        </h4>
        <span className="text-xs text-slate-400 font-mono">
          {projects.length} {projects.length === 1 ? 'Project' : 'Projects'} Tracked
        </span>
      </div>

      <div className="space-y-3">
        {projects.map((project) => {
          const isOpen = Boolean(openMap[project.projectId]);
          const targetRatio = project.configuredRatio || targetVelocityRatio;
          const isRatioBeaten = project.empiricalRatio > 0 && project.empiricalRatio <= targetRatio;
          const isRatioOver = project.empiricalRatio > targetRatio;

          return (
            <div
              key={project.projectId}
              data-testid={`project-accordion-${project.projectId}`}
              className="rounded-2xl bg-gradient-to-br from-slate-900/90 to-slate-950/90 border border-slate-800/80 shadow-md overflow-hidden transition-all duration-200"
            >
              {/* Accordion Header Row */}
              <button
                type="button"
                data-testid={`accordion-toggle-${project.projectId}`}
                onClick={() => toggleProject(project.projectId)}
                className="w-full p-4 sm:p-5 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4 text-left hover:bg-slate-800/30 transition-colors cursor-pointer select-none"
              >
                {/* Left: Project title & counts */}
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="text-slate-400 hover:text-white transition-colors shrink-0">
                    {isOpen ? (
                      <ChevronDown className="w-4 h-4 text-emerald-400" />
                    ) : (
                      <ChevronRight className="w-4 h-4" />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center space-x-2">
                      <span className="text-sm sm:text-base font-bold text-white tracking-tight truncate">
                        {project.projectName}
                      </span>
                      <span className="text-[11px] font-mono text-slate-500 uppercase">
                        @{project.projectSlug}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-slate-400 font-mono">
                      <span>{project.totalItems} items</span>
                      <span className="text-slate-700">•</span>
                      <span className="text-emerald-400 font-semibold">{project.totalPoints} pts burned</span>
                      <span className="text-slate-700">•</span>
                      <div className="flex items-center gap-1.5" title="Focus percentage of total effort">
                        <span>Focus: {project.focusPercentage.toFixed(1)}%</span>
                        <div className="w-12 h-1.5 rounded-full bg-slate-800 overflow-hidden inline-block">
                          <div
                            className="h-full bg-emerald-400 rounded-full"
                            style={{ width: `${Math.min(100, project.focusPercentage)}%` }}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Empirical Calibration Badge & Planned vs Actual Dual Meter */}
                <div className="flex flex-wrap sm:flex-nowrap items-center gap-4 w-full lg:w-auto shrink-0 justify-between lg:justify-end">
                  {/* Empirical Calibration Badge */}
                  <div
                    data-testid={`empirical-badge-${project.projectId}`}
                    className={`px-2.5 py-1 rounded-lg text-xs font-mono font-medium border flex items-center space-x-1.5 ${
                      isRatioBeaten
                        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
                        : isRatioOver
                        ? 'bg-amber-500/10 text-amber-400 border-amber-500/30'
                        : 'bg-slate-800/60 text-slate-300 border-slate-700/60'
                    }`}
                    title="Empirical ratio k = actual_hours / delivered_points"
                  >
                    <span>
                      {project.totalPoints > 0
                        ? `${project.empiricalRatio.toFixed(2)} hrs/pt`
                        : 'N/A'}{' '}
                      <span className="opacity-70 text-[10px]">
                        (Target: {targetRatio.toFixed(1)})
                      </span>
                    </span>
                  </div>

                  {/* Dual-Meter Planned vs Actual Bar */}
                  <div className="w-36 sm:w-44 flex flex-col gap-1">
                    <CalibrationBar
                      plannedHours={project.plannedHours}
                      actualHours={project.actualHours}
                      showLabels
                    />
                  </div>
                </div>
              </button>

              {/* Collapsible Content: Item Breakdown Grid */}
              {isOpen && (
                <div
                  className="border-t border-slate-800/80 bg-slate-950/40 p-4 sm:p-5 animate-in fade-in duration-200"
                  data-testid={`accordion-content-${project.projectId}`}
                >
                  {project.items.length === 0 ? (
                    <div className="text-center py-6 text-slate-500 text-xs">
                      No completed items in this project for the selected timeframe.
                    </div>
                  ) : (
                    <>
                      {/* Desktop Table View (>= 768px) */}
                      <div className="hidden md:block overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider font-mono">
                              <th className="pb-2.5 pl-1">Ref ID</th>
                              <th className="pb-2.5">Title</th>
                              <th className="pb-2.5">Type</th>
                              <th className="pb-2.5 text-right">Points</th>
                              <th className="pb-2.5 text-right">Planned</th>
                              <th className="pb-2.5 text-right">Actual / Cycle</th>
                              <th className="pb-2.5 text-center">Variance</th>
                              <th className="pb-2.5 text-right pr-1">Tag</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-800/40">
                            {project.items.map((item) => {
                              const diffSign = item.varianceHours > 0 ? '+' : '';
                              return (
                                <tr
                                  key={item.id}
                                  data-testid={`item-row-${item.id}`}
                                  className="hover:bg-slate-800/30 transition-colors group"
                                >
                                  {/* Ref ID (Deep link into RHN drawer) */}
                                  <td className="py-2.5 pl-1 font-mono">
                                    <button
                                      type="button"
                                      data-testid={`ref-link-${item.externalRefId}`}
                                      onClick={() => handleItemClick(item.externalRefId)}
                                      className="text-emerald-400 hover:text-emerald-300 font-semibold flex items-center space-x-1 transition-colors cursor-pointer"
                                      title="Open item in inspector drawer"
                                    >
                                      <span>{item.externalRefId}</span>
                                      <ExternalLink className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    </button>
                                  </td>

                                  {/* Title */}
                                  <td className="py-2.5 pr-3 max-w-[240px] truncate text-slate-200">
                                    <span title={item.title}>{item.title}</span>
                                  </td>

                                  {/* Type */}
                                  <td className="py-2.5 pr-3">
                                    <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono font-medium bg-slate-800/80 text-slate-300 border border-slate-700/50">
                                      {item.itemType}
                                    </span>
                                  </td>

                                  {/* Story Points */}
                                  <td className="py-2.5 pr-3 text-right font-mono font-medium text-slate-200">
                                    {item.isLeaf ? (
                                      <span>{item.storyPoints} pts</span>
                                    ) : (
                                      <span className="text-slate-500 text-[11px]">(container)</span>
                                    )}
                                  </td>

                                  {/* Planned Envelope */}
                                  <td className="py-2.5 pr-3 text-right font-mono text-slate-400">
                                    {item.plannedHours.toFixed(1)}h
                                  </td>

                                  {/* Actual / Cycle Effort */}
                                  <td className="py-2.5 pr-3 text-right font-mono font-medium text-slate-200">
                                    <span>{item.actualHours.toFixed(1)}h</span>
                                    <span
                                      className="ml-1 text-[10px] text-slate-500"
                                      title={item.timeSource === 'logged' ? 'Logged Time' : 'Cycle Time'}
                                    >
                                      ({item.timeSource === 'logged' ? 'log' : 'cyc'})
                                    </span>
                                  </td>

                                  {/* Variance Pill */}
                                  <td className="py-2.5 text-center">
                                    <span
                                      data-testid={`variance-pill-${item.id}`}
                                      className={`inline-block px-2 py-0.5 rounded text-[10px] font-mono font-semibold border ${
                                        item.varianceStatus === 'under'
                                          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
                                          : item.varianceStatus === 'over'
                                          ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
                                          : 'bg-slate-800/80 text-slate-300 border-slate-700/60'
                                      }`}
                                    >
                                      {item.varianceHours === 0 ? '0.0h' : `${diffSign}${item.varianceHours.toFixed(1)}h`}
                                    </span>
                                  </td>

                                  {/* Tag Pill (Planned vs Churn) */}
                                  <td className="py-2.5 text-right pr-1">
                                    {item.isChurn ? (
                                      <span
                                        data-testid={`churn-tag-${item.id}`}
                                        className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 inline-flex items-center gap-1"
                                        title={item.churnReason ? `Unplanned churn (${item.churnReason})` : 'Unplanned churn'}
                                      >
                                        <AlertTriangle className="w-2.5 h-2.5" />
                                        <span>CHURN</span>
                                      </span>
                                    ) : (
                                      <span
                                        data-testid={`planned-tag-${item.id}`}
                                        className="px-1.5 py-0.5 rounded text-[10px] font-mono text-slate-400 bg-slate-800/80 border border-slate-700/50"
                                      >
                                        PLANNED
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile Card Rows (< 768px) */}
                      <div className="md:hidden space-y-2.5" data-testid="mobile-items-list">
                        {project.items.map((item) => {
                          const diffSign = item.varianceHours > 0 ? '+' : '';
                          return (
                            <div
                              key={item.id}
                              data-testid={`mobile-item-card-${item.id}`}
                              className="p-3 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-2 text-xs"
                            >
                              <div className="flex items-center justify-between gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleItemClick(item.externalRefId)}
                                  className="text-emerald-400 font-mono font-bold hover:underline"
                                >
                                  {item.externalRefId}
                                </button>
                                <div className="flex items-center gap-1.5">
                                  <span className="px-1.5 py-0.5 rounded text-[10px] uppercase font-mono bg-slate-800 text-slate-300">
                                    {item.itemType}
                                  </span>
                                  {item.isChurn && (
                                    <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40">
                                      CHURN
                                    </span>
                                  )}
                                </div>
                              </div>

                              <p className="text-slate-200 text-xs font-medium line-clamp-2">
                                {item.title}
                              </p>

                              <div className="grid grid-cols-3 gap-2 pt-1 border-t border-slate-800/60 text-[11px] font-mono">
                                <div>
                                  <span className="text-slate-500 block text-[9px] uppercase">Plan</span>
                                  <span className="text-slate-300">{item.plannedHours.toFixed(1)}h</span>
                                </div>
                                <div>
                                  <span className="text-slate-500 block text-[9px] uppercase">Actual</span>
                                  <span className="text-slate-100 font-bold">{item.actualHours.toFixed(1)}h</span>
                                </div>
                                <div className="text-right">
                                  <span className="text-slate-500 block text-[9px] uppercase">Variance</span>
                                  <span
                                    className={`font-semibold ${
                                      item.varianceStatus === 'under'
                                        ? 'text-emerald-400'
                                        : item.varianceStatus === 'over'
                                        ? 'text-amber-400'
                                        : 'text-slate-300'
                                    }`}
                                  >
                                    {diffSign}{item.varianceHours.toFixed(1)}h
                                  </span>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
