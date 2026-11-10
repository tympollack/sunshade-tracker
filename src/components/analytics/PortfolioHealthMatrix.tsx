'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, ArrowUpDown, Folder } from 'lucide-react';
import {
  HEALTH_STATUS_LABELS,
  ProjectHealthStatus,
  ProjectTelemetry,
} from '@/lib/analytics/portfolio-aggregator';

export interface PortfolioHealthMatrixProps {
  tenantSlug: string;
  projects: ProjectTelemetry[];
  sprintId?: string;
}

type SortKey = 'name' | 'delivered' | 'sayDo' | 'volatility' | 'status';
type SortDir = 'asc' | 'desc';

const STATUS_STYLES: Record<ProjectHealthStatus, string> = {
  high_stability: 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30',
  high_churn: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  scope_volatile: 'bg-amber-500/10 text-amber-300 border-amber-500/30',
  stalled: 'bg-rose-500/10 text-rose-300 border-rose-500/30',
  monitoring: 'bg-slate-500/10 text-slate-300 border-slate-500/30',
  no_activity: 'bg-slate-800/60 text-slate-500 border-slate-700',
};

const STATUS_ORDER: ProjectHealthStatus[] = [
  'stalled',
  'high_churn',
  'scope_volatile',
  'monitoring',
  'high_stability',
  'no_activity',
];

export function sayDoPillClass(pct: number): string {
  if (pct > 85) return 'bg-emerald-500/10 text-emerald-300 border-emerald-500/30';
  if (pct >= 70) return 'bg-amber-500/10 text-amber-300 border-amber-500/30';
  return 'bg-rose-500/10 text-rose-300 border-rose-500/30';
}

export function formatSignedPct(pct: number): string {
  const rounded = Math.round(pct * 10) / 10;
  return `${rounded > 0 ? '+' : ''}${rounded}%`;
}

function ProgressBar({ delivered, committed }: { delivered: number; committed: number }) {
  const pct = committed > 0 ? Math.min(100, Math.round((delivered / committed) * 100)) : 0;
  return (
    <div className="h-1.5 w-full bg-slate-800 rounded-full overflow-hidden mt-1">
      <div className="h-full bg-emerald-500" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function PortfolioHealthMatrix({ tenantSlug, projects, sprintId }: PortfolioHealthMatrixProps) {
  const [sortKey, setSortKey] = useState<SortKey>('name');
  const [sortDir, setSortDir] = useState<SortDir>('asc');

  const toggleSort = (key: SortKey) => {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' ? 'asc' : 'desc');
    }
  };

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...projects].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'delivered':
          cmp = a.deliveredPts - b.deliveredPts;
          break;
        case 'sayDo':
          cmp = a.sayDoPct - b.sayDoPct;
          break;
        case 'volatility':
          cmp = a.volatilityPct - b.volatilityPct;
          break;
        case 'status':
          cmp = STATUS_ORDER.indexOf(a.healthStatus) - STATUS_ORDER.indexOf(b.healthStatus);
          break;
        default:
          cmp = a.projectName.localeCompare(b.projectName);
      }
      return cmp * dir || a.projectName.localeCompare(b.projectName);
    });
  }, [projects, sortKey, sortDir]);

  const drillHref = (p: ProjectTelemetry) => {
    const sid = p.sprintId || sprintId;
    return `/${tenantSlug}/${p.projectSlug}/analytics${sid ? `?sprintId=${encodeURIComponent(sid)}` : ''}`;
  };

  const header = (key: SortKey, label: string) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      className="inline-flex items-center gap-1 hover:text-slate-200 cursor-pointer"
      data-testid={`portfolio-sort-${key}`}
    >
      {label}
      <ArrowUpDown className="w-3 h-3" />
    </button>
  );

  return (
    <section
      aria-label="Portfolio Health Matrix"
      className="rounded-xl border border-slate-800/80 bg-slate-900/40"
      data-testid="portfolio-health-matrix"
    >
      <div className="px-4 py-3 border-b border-slate-800/80">
        <h3 className="text-sm font-semibold text-white">Portfolio Health Matrix</h3>
      </div>

      {sorted.length === 0 ? (
        <div className="p-6 text-center text-xs text-slate-500 italic" data-testid="portfolio-matrix-empty">
          No projects match the selected filter.
        </div>
      ) : (
        <>
          {/* Table (md and up) */}
          <table className="hidden md:table w-full text-xs">
            <thead>
              <tr className="text-left text-slate-400 border-b border-slate-800/80">
                <th className="px-4 py-2 font-medium">{header('name', 'Project Name')}</th>
                <th className="px-4 py-2 font-medium">{header('delivered', 'Delivered / Committed')}</th>
                <th className="px-4 py-2 font-medium">{header('sayDo', 'Say/Do (Commitment)')}</th>
                <th className="px-4 py-2 font-medium">{header('volatility', 'Scope Volatility')}</th>
                <th className="px-4 py-2 font-medium">{header('status', 'Stability Status')}</th>
                <th className="px-4 py-2 font-medium text-right">Drill-Down</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {sorted.map((p) => (
                <tr key={p.projectId} data-testid={`portfolio-row-${p.projectSlug}`}>
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/${tenantSlug}/${p.projectSlug}`}
                      className="inline-flex items-center gap-1.5 text-slate-200 hover:text-emerald-300"
                    >
                      <Folder className="w-3.5 h-3.5 text-slate-400" />
                      {p.projectName}
                    </Link>
                  </td>
                  <td className="px-4 py-2.5 min-w-[160px]">
                    <span className="font-mono text-slate-300">
                      {p.deliveredPts} / {p.baselinePts} pts
                    </span>
                    <ProgressBar delivered={p.deliveredPts} committed={p.baselinePts} />
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full border font-mono ${sayDoPillClass(p.sayDoPct)}`}>
                      {Math.round(p.sayDoPct)}%
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className="px-2 py-0.5 rounded-full border border-slate-700 font-mono text-slate-300">
                      {formatSignedPct(p.volatilityPct)}
                    </span>
                  </td>
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded-full border ${STATUS_STYLES[p.healthStatus]}`}>
                      {HEALTH_STATUS_LABELS[p.healthStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-right">
                    <Link
                      href={drillHref(p)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20"
                      data-testid={`portfolio-drilldown-${p.projectSlug}`}
                    >
                      View Analytics <ArrowRight className="w-3 h-3" />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Card rows (below md) */}
          <ul className="md:hidden divide-y divide-slate-800/50">
            {sorted.map((p) => (
              <li key={p.projectId} className="p-3 space-y-2" data-testid={`portfolio-card-${p.projectSlug}`}>
                <div className="flex items-center justify-between">
                  <Link href={`/${tenantSlug}/${p.projectSlug}`} className="inline-flex items-center gap-1.5 text-sm text-slate-200">
                    <Folder className="w-3.5 h-3.5 text-slate-400" />
                    {p.projectName}
                  </Link>
                  <span className={`px-2 py-0.5 rounded-full border text-[11px] ${STATUS_STYLES[p.healthStatus]}`}>
                    {HEALTH_STATUS_LABELS[p.healthStatus]}
                  </span>
                </div>
                <div className="text-xs text-slate-300 font-mono">
                  {p.deliveredPts} / {p.baselinePts} pts
                  <ProgressBar delivered={p.deliveredPts} committed={p.baselinePts} />
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <span className={`px-2 py-0.5 rounded-full border font-mono ${sayDoPillClass(p.sayDoPct)}`}>
                    Say/Do {Math.round(p.sayDoPct)}%
                  </span>
                  <span className="px-2 py-0.5 rounded-full border border-slate-700 font-mono text-slate-300">
                    {formatSignedPct(p.volatilityPct)}
                  </span>
                  <Link href={drillHref(p)} className="ml-auto inline-flex items-center gap-1 text-emerald-300">
                    View Analytics <ArrowRight className="w-3 h-3" />
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}

export default PortfolioHealthMatrix;
