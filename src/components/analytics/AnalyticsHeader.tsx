'use client';

import React from 'react';
import Link from 'next/link';
import { Calendar, ChevronLeft, Layers, RefreshCw } from 'lucide-react';
import { NavToolsDropdown } from '@/components/NavToolsDropdown';

export interface SprintOption {
  id: string;
  name: string;
  is_active?: boolean;
  status?: string;
}

interface AnalyticsHeaderProps {
  tenantSlug: string;
  projectSlug: string;
  projectName?: string;
  sprints: SprintOption[];
  selectedSprintId: string;
  onSelectSprint: (sprintId: string) => void;
  startDate: string;
  endDate: string;
  onChangeStartDate: (date: string) => void;
  onChangeEndDate: (date: string) => void;
  onRefresh?: () => void;
  isRefreshing?: boolean;
  onSelectTab?: (tab: string) => void;
}

export function AnalyticsHeader({
  tenantSlug,
  projectSlug,
  projectName,
  sprints,
  selectedSprintId,
  onSelectSprint,
  startDate,
  endDate,
  onChangeStartDate,
  onChangeEndDate,
  onRefresh,
  isRefreshing = false,
  onSelectTab,
}: AnalyticsHeaderProps) {
  return (
    <header className="bg-slate-900/90 border-b border-slate-800 backdrop-blur sticky top-0 z-30 px-4 sm:px-6 py-4">
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        {/* Title & Navigation */}
        <div className="flex items-center gap-3">
          <Link
            href={`/${tenantSlug}/${projectSlug}`}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition-colors"
            title="Return to Kanban Board"
          >
            <ChevronLeft className="w-5 h-5" />
          </Link>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs uppercase tracking-wider font-semibold text-cyan-400">
                {projectName || projectSlug}
              </span>
              <span className="text-slate-600">•</span>
              <span className="text-xs text-slate-400 font-mono">Sprint Telemetry</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-100 flex items-center gap-2">
              <Layers className="w-6 h-6 text-cyan-400" />
              Sprint & Flow Analytics
            </h1>
          </div>
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Sprint Selector */}
          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/80 rounded-lg px-3 py-1.5">
            <label htmlFor="sprint-select" className="text-xs font-medium text-slate-400">
              Sprint:
            </label>
            <select
              id="sprint-select"
              value={selectedSprintId}
              onChange={(e) => onSelectSprint(e.target.value)}
              className="bg-transparent text-slate-100 text-sm font-medium focus:outline-none cursor-pointer"
            >
              {sprints.map((s) => (
                <option key={s.id} value={s.id} className="bg-slate-800 text-slate-100">
                  {s.name} {s.is_active ? '● (Active)' : ''}
                </option>
              ))}
              {sprints.length === 0 && (
                <option value="" className="bg-slate-800 text-slate-400">
                  No sprints configured
                </option>
              )}
            </select>
          </div>

          {/* Date Range Controls */}
          <div className="flex items-center gap-2 bg-slate-800/80 border border-slate-700/80 rounded-lg px-3 py-1.5 text-xs text-slate-300">
            <Calendar className="w-4 h-4 text-cyan-400" />
            <input
              type="date"
              value={startDate}
              onChange={(e) => onChangeStartDate(e.target.value)}
              aria-label="Start date"
              className="bg-transparent text-slate-100 text-xs focus:outline-none cursor-pointer"
            />
            <span className="text-slate-500">to</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => onChangeEndDate(e.target.value)}
              aria-label="End date"
              className="bg-transparent text-slate-100 text-xs focus:outline-none cursor-pointer"
            />
          </div>

          {/* Refresh Action */}
          {onRefresh && (
            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700/80 border border-slate-700/80 text-slate-300 hover:text-slate-100 transition-colors disabled:opacity-50"
              title="Refresh Telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-cyan-400' : ''}`} />
            </button>
          )}

          {/* Workspace Tools Dropdown (TASK-TRK-NAV-TOOLS-ANALYTICS-MENU) */}
          <NavToolsDropdown
            activeTab={'analytics' as any}
            onSelectTab={(tab) => {
              if (tab === 'spark' || tab === 'schema') {
                if (onSelectTab) {
                  onSelectTab(tab);
                } else if (typeof window !== 'undefined') {
                  window.location.href = `/${tenantSlug}/${projectSlug}?tab=${tab}`;
                }
              }
            }}
            tenantSlug={tenantSlug}
            projectSlug={projectSlug}
            analyticsHref={`/${tenantSlug}/${projectSlug}/analytics`}
          />
        </div>
      </div>
    </header>
  );
}
