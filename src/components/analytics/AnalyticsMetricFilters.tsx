'use client';

import React from 'react';
import { StabilityFilter, STABILITY_FILTERS } from '@/lib/analytics/portfolio-aggregator';

const FILTER_LABELS: Record<StabilityFilter, string> = {
  all: 'All Projects',
  high_stability: 'High Stability',
  high_volatility: 'High Volatility (>25%)',
  under_delivering: 'Under-Delivering (<70%)',
  zero_burn: 'Zero Burn',
};

export interface AnalyticsMetricFiltersProps {
  value: StabilityFilter;
  onChange: (filter: StabilityFilter) => void;
}

export function AnalyticsMetricFilters({ value, onChange }: AnalyticsMetricFiltersProps) {
  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="analytics-metric-filters" role="group" aria-label="Project metric filters">
      {STABILITY_FILTERS.map((f) => (
        <button
          key={f}
          type="button"
          onClick={() => onChange(f)}
          aria-pressed={value === f}
          data-testid={`stability-filter-${f}`}
          className={`px-3 py-1 rounded-full border text-xs font-medium transition-colors cursor-pointer ${
            value === f
              ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-300'
              : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200'
          }`}
        >
          {FILTER_LABELS[f]}
        </button>
      ))}
      {value !== 'all' && (
        <button
          type="button"
          onClick={() => onChange('all')}
          data-testid="stability-filter-reset"
          className="text-xs text-emerald-400 hover:text-emerald-300 px-2 py-1 rounded hover:bg-slate-800 cursor-pointer"
        >
          Reset
        </button>
      )}
    </div>
  );
}

export default AnalyticsMetricFilters;
