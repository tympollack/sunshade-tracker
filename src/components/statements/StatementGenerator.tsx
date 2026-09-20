'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  Calendar,
  Clock,
  DollarSign,
  Download,
  FileSpreadsheet,
  FileCode,
  Printer,
  TrendingUp,
  AlertCircle,
  Loader2,
  Check,
} from 'lucide-react';
import {
  EfficiencyMetricsPayload,
  formatEfficiencyStatementCSV,
  formatEfficiencyStatementJSON,
} from '@/lib/services/valueLedgerService';

export type StatementTimeframe = 'month' | 'quarter' | 'year' | 'custom';

export interface StatementGeneratorProps {
  tenantSlug: string;
  initialData?: EfficiencyMetricsPayload | null;
  onDataChange?: (data: EfficiencyMetricsPayload) => void;
  className?: string;
}

export function StatementGenerator({
  tenantSlug,
  initialData,
  onDataChange,
  className = '',
}: StatementGeneratorProps) {
  const [timeframe, setTimeframe] = useState<StatementTimeframe>('month');

  // Date range inputs (YYYY-MM-DD for standard HTML date input)
  const now = new Date();
  const defaultStartDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const defaultEndDate = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10);

  const [customStartDate, setCustomStartDate] = useState(defaultStartDate);
  const [customEndDate, setCustomEndDate] = useState(defaultEndDate);
  const [dateValidationError, setDateValidationError] = useState<string | null>(null);

  const [data, setData] = useState<EfficiencyMetricsPayload | null>(initialData || null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);

  // Compute preset dates based on timeframe selection
  const computePresetDates = useCallback((tf: StatementTimeframe): { start: string; end: string } => {
    const today = new Date();
    const y = today.getFullYear();
    const m = today.getMonth();

    if (tf === 'month') {
      const start = new Date(y, m, 1).toISOString().slice(0, 10);
      const end = new Date(y, m + 1, 0).toISOString().slice(0, 10);
      return { start, end };
    }

    if (tf === 'quarter') {
      const q = Math.floor(m / 3);
      const start = new Date(y, q * 3, 1).toISOString().slice(0, 10);
      const end = new Date(y, q * 3 + 3, 0).toISOString().slice(0, 10);
      return { start, end };
    }

    if (tf === 'year') {
      const start = new Date(y, 0, 1).toISOString().slice(0, 10);
      const end = new Date(y, 11, 31).toISOString().slice(0, 10);
      return { start, end };
    }

    return { start: customStartDate, end: customEndDate };
  }, [customStartDate, customEndDate]);

  // Fetch statement data for the active timeframe and dates
  const fetchStatement = useCallback(
    async (tf: StatementTimeframe, startDateStr: string, endDateStr: string) => {
      if (tf === 'custom' && startDateStr > endDateStr) {
        setDateValidationError('Start date cannot be after end date.');
        return;
      }
      setDateValidationError(null);
      setLoading(true);
      setError(null);

      try {
        const queryParams = new URLSearchParams({
          period: tf,
          start_date: new Date(startDateStr).toISOString(),
          end_date: new Date(`${endDateStr}T23:59:59.999Z`).toISOString(),
          tenant_slug: tenantSlug,
        });

        const res = await fetch(`/api/v1/statements?${queryParams.toString()}`, {
          headers: { 'x-tenant-slug': tenantSlug },
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `HTTP ${res.status}: Failed to generate statement`);
        }

        const payload: EfficiencyMetricsPayload = await res.json();
        setData(payload);
        onDataChange?.(payload);
      } catch (err: any) {
        setError(err.message || 'Error generating statement');
      } finally {
        setLoading(false);
      }
    },
    [tenantSlug, onDataChange]
  );

  const isFirstMount = useRef(true);

  // Trigger statement fetch when timeframe or preset changes
  useEffect(() => {
    if (isFirstMount.current) {
      isFirstMount.current = false;
      if (initialData) return;
    }
    if (timeframe !== 'custom') {
      const { start, end } = computePresetDates(timeframe);
      fetchStatement(timeframe, start, end);
    }
  }, [timeframe, computePresetDates, fetchStatement, initialData]);

  const handleTimeframeChange = (tf: StatementTimeframe) => {
    setTimeframe(tf);
    if (tf !== 'custom') {
      const { start, end } = computePresetDates(tf);
      setCustomStartDate(start);
      setCustomEndDate(end);
    }
  };

  const handleCustomDateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (customStartDate > customEndDate) {
      setDateValidationError('Start date cannot be after end date.');
      return;
    }
    fetchStatement('custom', customStartDate, customEndDate);
  };

  // Export handlers
  const handlePrint = () => {
    if (typeof window !== 'undefined') window.print();
  };

  const handleDownloadCSV = () => {
    if (!data) return;
    const csv = formatEfficiencyStatementCSV(data);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `statement-${tenantSlug}-${timeframe}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopyJSON = async () => {
    if (!data) return;
    const jsonStr = formatEfficiencyStatementJSON(data);
    await navigator.clipboard.writeText(jsonStr);
    setCopiedNotification('Statement JSON copied to clipboard!');
    setTimeout(() => setCopiedNotification(null), 3000);
  };

  return (
    <div className={`space-y-6 ${className}`} data-testid="statement-generator">
      {/* Timeframe Range Selector Controls */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 shadow-sm print:hidden">
        <div className="flex flex-wrap items-center gap-2" data-testid="timeframe-selector">
          <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider mr-1">
            Timeframe:
          </span>
          {(['month', 'quarter', 'year', 'custom'] as const).map((tf) => (
            <button
              key={tf}
              type="button"
              data-testid={`timeframe-btn-${tf}`}
              onClick={() => handleTimeframeChange(tf)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors cursor-pointer ${
                timeframe === tf
                  ? 'bg-emerald-500 text-slate-950 shadow-sm'
                  : 'bg-slate-800 text-slate-300 hover:text-white hover:bg-slate-700'
              }`}
            >
              {tf}
            </button>
          ))}
        </div>

        {/* Action buttons (Print, CSV, JSON) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handlePrint}
            data-testid="print-statement-btn"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            title="Print or Save PDF"
          >
            <Printer className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Print / PDF</span>
          </button>
          <button
            type="button"
            onClick={handleDownloadCSV}
            data-testid="download-csv-btn"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            title="Download RFC-4180 CSV"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
            <span className="hidden sm:inline">CSV</span>
          </button>
          <button
            type="button"
            onClick={handleCopyJSON}
            data-testid="copy-json-btn"
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white text-xs font-medium transition-colors cursor-pointer"
            title="Copy Statement JSON"
          >
            <FileCode className="w-3.5 h-3.5 text-sky-400" />
            <span className="hidden sm:inline">JSON</span>
          </button>
        </div>
      </div>

      {/* Custom Date Pickers (Shown when timeframe === 'custom') */}
      {timeframe === 'custom' && (
        <form
          onSubmit={handleCustomDateSubmit}
          data-testid="custom-date-range-form"
          className="p-4 rounded-xl bg-slate-900/40 border border-slate-800 flex flex-wrap items-center gap-4 text-xs print:hidden"
        >
          <div className="flex items-center space-x-2">
            <span className="text-slate-400 font-medium">Start Date:</span>
            <input
              type="date"
              value={customStartDate}
              onChange={(e) => setCustomStartDate(e.target.value)}
              data-testid="custom-start-date"
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 focus:outline-none focus:border-emerald-500"
              required
            />
          </div>

          <div className="flex items-center space-x-2">
            <span className="text-slate-400 font-medium">End Date:</span>
            <input
              type="date"
              value={customEndDate}
              onChange={(e) => setCustomEndDate(e.target.value)}
              data-testid="custom-end-date"
              className="bg-slate-950 border border-slate-700 rounded-lg px-2.5 py-1 text-slate-100 focus:outline-none focus:border-emerald-500"
              required
            />
          </div>

          <button
            type="submit"
            data-testid="apply-custom-range-btn"
            className="px-3.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold transition-colors cursor-pointer"
          >
            Apply Range
          </button>

          {dateValidationError && (
            <span className="text-rose-400 text-xs flex items-center gap-1" data-testid="date-validation-error">
              <AlertCircle className="w-3.5 h-3.5" />
              {dateValidationError}
            </span>
          )}
        </form>
      )}

      {/* Copied notification toast */}
      {copiedNotification && (
        <div className="p-2.5 rounded-lg bg-emerald-500/20 border border-emerald-500/30 text-emerald-300 text-xs flex items-center space-x-2 animate-in fade-in">
          <Check className="w-4 h-4 text-emerald-400" />
          <span>{copiedNotification}</span>
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div className="py-12 flex items-center justify-center space-x-2 text-slate-400" data-testid="statement-loading">
          <Loader2 className="w-5 h-5 animate-spin text-emerald-400" />
          <span className="text-sm">Calculating dynamic statement metrics...</span>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="p-4 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-sm flex items-center space-x-3" data-testid="statement-error">
          <AlertCircle className="w-5 h-5 text-rose-400 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Statement Presentation */}
      {!loading && !error && data && (
        <div className="space-y-6" data-testid="statement-content">
          {/* Header Snapshot Card */}
          <div className="p-6 rounded-2xl bg-gradient-to-br from-slate-900 via-slate-900 to-slate-950 border border-slate-800/80 shadow-xl space-y-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-slate-800/80 pb-4">
              <div>
                <h3 className="text-xl font-bold text-white tracking-tight" data-testid="statement-period-label">
                  {data.dateRange.periodLabel}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Workspace: <span className="text-slate-200 font-semibold">{data.tenant.name}</span> ({data.tenant.tier} Tier)
                </p>
              </div>
              <div className="text-right text-xs text-slate-400 font-mono">
                <span>
                  {new Date(data.dateRange.startDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                  {' – '}
                  {new Date(data.dateRange.endDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </span>
              </div>
            </div>

            {/* Top Metrics Grid */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Hours Reclaimed
                </span>
                <div className="text-2xl font-black text-emerald-400 font-mono" data-testid="kpi-hours-reclaimed">
                  {data.kpis.totalHoursReclaimed.toFixed(1)} hrs
                </div>
                <p className="text-[10px] text-slate-500">Administrative drag eliminated</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Realized Value
                </span>
                <div className="text-2xl font-black text-emerald-400 font-mono" data-testid="kpi-realized-value">
                  ${data.kpis.grossRealizedValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                </div>
                <p className="text-[10px] text-slate-500">Based on ${data.kpis.hourlyRate}/hr rate</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Completed Items
                </span>
                <div className="text-2xl font-black text-white font-mono" data-testid="kpi-completed-items">
                  {data.kpis.completedItemsCount}
                </div>
                <p className="text-[10px] text-slate-500">Shipped within timeframe</p>
              </div>

              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800/80 space-y-1">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
                  Active Projects
                </span>
                <div className="text-2xl font-black text-white font-mono" data-testid="kpi-active-projects">
                  {data.kpis.activeProjectsCount}
                </div>
                <p className="text-[10px] text-slate-500">Projects with activity</p>
              </div>
            </div>
          </div>

          {/* Itemized Yield Table */}
          <div className="p-6 rounded-2xl bg-slate-900/40 border border-slate-800/80 space-y-4">
            <h4 className="text-sm font-semibold uppercase tracking-wider text-slate-300">
              Itemized Yield Breakdown
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 text-[11px] uppercase tracking-wider">
                    <th className="pb-2">Friction Point</th>
                    <th className="pb-2">Metric Tracked</th>
                    <th className="pb-2 text-right">Hours Reclaimed</th>
                    <th className="pb-2 text-right">Realized Value</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/50">
                  {data.itemizedYields.map((yieldItem) => (
                    <tr key={yieldItem.id} className="hover:bg-slate-800/30">
                      <td className="py-3 pr-4">
                        <span className="font-semibold text-slate-100 block">{yieldItem.frictionPoint}</span>
                        <span className="text-[11px] text-slate-400 block mt-0.5">{yieldItem.description}</span>
                      </td>
                      <td className="py-3 pr-4 text-slate-300 font-mono">{yieldItem.metric}</td>
                      <td className="py-3 pr-4 text-right text-emerald-400 font-mono font-medium">
                        {yieldItem.hoursReclaimed.toFixed(2)} hrs
                      </td>
                      <td className="py-3 text-right text-emerald-400 font-mono font-bold">
                        ${yieldItem.realizedValue.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
