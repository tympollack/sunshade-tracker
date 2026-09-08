'use client';

import { use, useEffect, useState, useCallback, Suspense } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Download,
  FileSpreadsheet,
  FileCode,
  Printer,
  TrendingUp,
  Clock,
  DollarSign,
  ShieldCheck,
  Sparkles,
  RefreshCw,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { SunShadeLogo } from '@/components/SunShadeLogo';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import { UserMenu } from '@/components/UserMenu';
import {
  EfficiencyMetricsPayload,
  formatEfficiencyStatementCSV,
  formatEfficiencyStatementJSON,
} from '@/lib/services/valueLedgerService';

interface PageProps {
  params: Promise<{
    tenantSlug: string;
  }>;
}

export default function EfficiencyStatementPage(props: PageProps) {
  const { tenantSlug } = use(props.params);

  return (
    <Suspense fallback={<EfficiencyStatementSkeleton tenantSlug={tenantSlug} />}>
      <EfficiencyStatementContent tenantSlug={tenantSlug} />
    </Suspense>
  );
}

function EfficiencyStatementSkeleton({ tenantSlug }: { tenantSlug: string }) {
  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100 animate-pulse">
      <header className="border-b border-slate-800/80 bg-slate-950/80 px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="h-6 w-48 bg-slate-800/60 rounded" />
        <div className="h-6 w-32 bg-slate-800/60 rounded" />
      </header>
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-6">
        <div className="h-8 w-64 bg-slate-800/60 rounded" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-28 bg-slate-900/60 border border-slate-800/80 rounded-xl" />
          ))}
        </div>
        <div className="h-64 bg-slate-900/60 border border-slate-800/80 rounded-xl" />
        <div className="h-32 bg-slate-900/60 border border-slate-800/80 rounded-xl" />
      </main>
    </div>
  );
}

function EfficiencyStatementContent({ tenantSlug }: { tenantSlug: string }) {
  const [data, setData] = useState<EfficiencyMetricsPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedNotification, setCopiedNotification] = useState<string | null>(null);
  const [allWorkspaces, setAllWorkspaces] = useState<any[]>([]);

  const fetchStatement = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Fetch navigation workspaces and efficiency metrics concurrently
      const [workspacesRes, efficiencyRes] = await Promise.all([
        fetch('/api/v1/tenants/me', {
          headers: { 'x-tenant-slug': tenantSlug },
        }).catch(() => null),
        fetch(`/api/v1/tenants/efficiency?tenant_slug=${tenantSlug}`, {
          headers: { 'x-tenant-slug': tenantSlug },
        }),
      ]);

      if (workspacesRes && workspacesRes.ok) {
        const wsData = await workspacesRes.json().catch(() => ({}));
        setAllWorkspaces(wsData.workspaces || []);
      }

      if (!efficiencyRes.ok) {
        const errJson = await efficiencyRes.json().catch(() => ({}));
        throw new Error(errJson.error || `HTTP ${efficiencyRes.status}: Failed to load statement`);
      }

      const json: EfficiencyMetricsPayload = await efficiencyRes.json();
      setData(json);
    } catch (err: any) {
      setError(err.message || 'Error loading efficiency statement');
    } finally {
      setLoading(false);
    }
  }, [tenantSlug]);

  useEffect(() => {
    fetchStatement();
  }, [fetchStatement]);

  const handleExportJSON = () => {
    if (!data) return;
    const jsonStr = formatEfficiencyStatementJSON(data);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `efficiency-statement-${tenantSlug}-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
    showNotice('JSON statement downloaded');
  };

  const handleExportCSV = () => {
    if (!data) return;
    const csvStr = formatEfficiencyStatementCSV(data);
    const blob = new Blob([csvStr], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `efficiency-statement-${tenantSlug}-${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    showNotice('CSV statement downloaded');
  };

  const handlePrint = () => {
    window.print();
  };

  const showNotice = (msg: string) => {
    setCopiedNotification(msg);
    setTimeout(() => setCopiedNotification(null), 2500);
  };

  if (loading && !data) {
    return <EfficiencyStatementSkeleton tenantSlug={tenantSlug} />;
  }

  if (error && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#090d16] p-6 text-slate-100">
        <div className="max-w-md text-center space-y-4 p-8 rounded-2xl bg-slate-900 border border-slate-800">
          <AlertCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Statement Unavailable</h2>
          <p className="text-sm text-slate-400">{error}</p>
          <div className="flex items-center justify-center space-x-3 pt-2">
            <Link
              href={`/${tenantSlug}/settings`}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors"
            >
              Back to Settings
            </Link>
            <button
              onClick={fetchStatement}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  const kpis = data?.kpis;
  const itemized = data?.itemizedYields || [];

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100 print:bg-white print:text-black">
      {/* App Header (Hidden in Print) */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-6 py-3 flex items-center justify-between sticky top-0 z-40 print:hidden">
        <div className="flex items-center space-x-2">
          <SunShadeLogo variant="horizontal" size="xs" href="/" className="mr-1" />
          <span className="text-slate-700">/</span>
          <WorkspaceSwitcher currentTenantSlug={tenantSlug} workspaces={allWorkspaces} />
          <span className="text-slate-700">/</span>
          <Link
            href={`/${tenantSlug}/settings`}
            className="text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            Settings
          </Link>
          <span className="text-slate-700">/</span>
          <span className="text-xs font-semibold text-emerald-400">Efficiency</span>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href={`/${tenantSlug}/settings`}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Settings</span>
          </Link>

          {data?.tenant && (
            <UserMenu
              tenantName={data.tenant.name}
              tenantSlug={data.tenant.slug}
            />
          )}
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-6 print:p-0 print:max-w-none">
        {/* Toast notice */}
        {copiedNotification && (
          <div className="fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-xl bg-emerald-950 border border-emerald-500/50 text-emerald-300 text-xs font-medium flex items-center space-x-2 shadow-2xl animate-fade-in print:hidden">
            <Check className="w-4 h-4 text-emerald-400" />
            <span>{copiedNotification}</span>
          </div>
        )}

        {/* Statement Header Card */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-emerald-950/30 border border-slate-800/90 flex flex-col md:flex-row md:items-center md:justify-between gap-4 print:border-none print:bg-none print:p-0">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                Audit Statement
              </span>
              <span className="text-xs font-mono text-slate-500">
                @{tenantSlug} · {data?.tenant.tier}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white mt-1 flex items-center gap-2 print:text-black">
              <ShieldCheck className="w-7 h-7 text-emerald-400 print:hidden" />
              Operational Yield & Efficiency Statement
            </h1>
            <p className="text-xs md:text-sm text-slate-400 mt-1 print:text-slate-600">
              Derivation of administrative drag eliminated and net engineering value realized by self-administered tracking.
            </p>
          </div>

          {/* Action buttons (Hidden during Print) */}
          <div className="flex items-center space-x-2 flex-wrap gap-y-2 print:hidden">
            <button
              onClick={handlePrint}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-medium flex items-center space-x-1.5 transition-colors"
              title="Print Statement"
            >
              <Printer className="w-3.5 h-3.5 text-slate-400" />
              <span>Print</span>
            </button>
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-medium flex items-center space-x-1.5 transition-colors"
              title="Export CSV"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-400" />
              <span>Export CSV</span>
            </button>
            <button
              onClick={handleExportJSON}
              className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 text-slate-300 text-xs font-medium flex items-center space-x-1.5 transition-colors"
              title="Export JSON"
            >
              <FileCode className="w-3.5 h-3.5 text-indigo-400" />
              <span>Export JSON</span>
            </button>
            <button
              onClick={fetchStatement}
              disabled={loading}
              className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
              title="Refresh Statement"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
            </button>
          </div>
        </div>

        {/* Summary KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4">
          {/* Reclaimed Hours */}
          <div className="p-5 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-2 print:border-gray-300 print:bg-gray-50">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium uppercase tracking-wider">Hours Reclaimed</span>
              <Clock className="w-4 h-4 text-emerald-400 print:text-black" />
            </div>
            <div className="text-2xl font-bold font-mono text-white print:text-black">
              {kpis?.totalHoursReclaimed?.toFixed(1) ?? '0.0'}
              <span className="text-xs text-slate-500 font-sans ml-1 font-normal">hrs</span>
            </div>
            <p className="text-[11px] text-slate-500">
              Across {kpis?.completedItemsCount ?? 0} completed items & {kpis?.activeProjectsCount ?? 0} projects
            </p>
          </div>

          {/* Velocity Acceleration */}
          <div className="p-5 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-2 print:border-gray-300 print:bg-gray-50">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium uppercase tracking-wider">Velocity Factor</span>
              <TrendingUp className="w-4 h-4 text-indigo-400 print:text-black" />
            </div>
            <div className="text-2xl font-bold font-mono text-indigo-300 print:text-black">
              {kpis?.velocityFactor ?? '+18%'}
            </div>
            <p className="text-[11px] text-slate-500">
              Derived cycle-time reduction vs manual workflows
            </p>
          </div>

          {/* Gross Realized Value */}
          <div className="p-5 rounded-xl bg-slate-900/70 border border-slate-800/80 space-y-2 print:border-gray-300 print:bg-gray-50">
            <div className="flex items-center justify-between text-slate-400">
              <span className="text-xs font-medium uppercase tracking-wider">Gross Realized Value</span>
              <DollarSign className="w-4 h-4 text-amber-400 print:text-black" />
            </div>
            <div className="text-2xl font-bold font-mono text-amber-300 print:text-black">
              ${kpis?.grossRealizedValue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) ?? '0.00'}
            </div>
            <p className="text-[11px] text-slate-500">
              Evaluated at ${kpis?.hourlyRate ?? 125}/hr market engineering baseline
            </p>
          </div>

          {/* Platform Subscription Fee ($0.00) */}
          <div className="p-5 rounded-xl bg-emerald-950/40 border border-emerald-500/40 space-y-2 print:border-emerald-700 print:bg-emerald-50">
            <div className="flex items-center justify-between text-emerald-400">
              <span className="text-xs font-bold uppercase tracking-wider">Platform Subscription</span>
              <Sparkles className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="text-2xl font-bold font-mono text-emerald-300 print:text-emerald-800">
              $0.00
            </div>
            <p className="text-[11px] text-emerald-400/80">
              Self-administered · 100% net realized yield
            </p>
          </div>
        </div>

        {/* Itemized Audit Table */}
        <div className="rounded-xl bg-slate-900/60 border border-slate-800/80 overflow-hidden print:border-gray-300">
          <div className="px-6 py-4 border-b border-slate-800/80 flex items-center justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wider text-slate-300 print:text-black">
              Itemized Yield Breakdown
            </h2>
            <span className="text-xs text-slate-500 font-mono">
              {data?.dateRange.periodLabel}
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950/60 text-slate-400 font-mono uppercase tracking-wider print:bg-gray-100 print:text-black">
                  <th className="py-3 px-6">Operational Friction Point</th>
                  <th className="py-3 px-6">Yield / Volume Metrics</th>
                  <th className="py-3 px-6 text-right">Hours Reclaimed</th>
                  <th className="py-3 px-6 text-right">Valuation Rate</th>
                  <th className="py-3 px-6 text-right">Realized Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 font-mono text-slate-300 print:text-black print:divide-gray-200">
                {itemized.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-800/30 transition-colors">
                    <td className="py-4 px-6 font-sans">
                      <div className="font-semibold text-white print:text-black">
                        {row.frictionPoint}
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5 print:text-slate-600">
                        {row.description}
                      </div>
                    </td>
                    <td className="py-4 px-6 text-slate-400 font-sans">
                      <span className="px-2 py-0.5 rounded bg-slate-800/80 border border-slate-700/60 text-[11px] font-mono text-slate-300 print:border-gray-300 print:bg-gray-100 print:text-black">
                        {row.metric}
                      </span>
                    </td>
                    <td className="py-4 px-6 text-right text-emerald-400 font-semibold print:text-black">
                      {row.hoursReclaimed.toFixed(2)} hrs
                    </td>
                    <td className="py-4 px-6 text-right text-slate-400">
                      ${row.ratePerHour.toFixed(2)}/hr
                    </td>
                    <td className="py-4 px-6 text-right text-white font-bold print:text-black">
                      ${row.realizedValue.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-800 bg-slate-950/80 font-mono text-xs font-bold text-white print:bg-gray-100 print:text-black">
                  <td colSpan={2} className="py-3.5 px-6 uppercase tracking-wider font-sans text-slate-400">
                    Gross Operational Yield
                  </td>
                  <td className="py-3.5 px-6 text-right text-emerald-400">
                    {kpis?.totalHoursReclaimed?.toFixed(2)} hrs
                  </td>
                  <td className="py-3.5 px-6 text-right text-slate-400">
                    Avg ${kpis?.hourlyRate}/hr
                  </td>
                  <td className="py-3.5 px-6 text-right text-emerald-300">
                    ${kpis?.grossRealizedValue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>

        {/* Bottom Line / Reverse Invoice Card */}
        <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col md:flex-row md:items-center md:justify-between gap-6 print:border-gray-300 print:bg-gray-50">
          <div className="space-y-1 max-w-xl">
            <div className="flex items-center space-x-2 text-xs font-bold uppercase tracking-wider text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
              <span>Net Tenant Benefit Summary</span>
            </div>
            <p className="text-sm font-semibold text-white print:text-black">
              Zero Platform Tax · Full Realized Productivity Dividend
            </p>
            <p className="text-xs text-slate-400 italic pt-1 print:text-slate-600">
              &ldquo;{data?.ecosystemNote}&rdquo;
            </p>
          </div>

          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 text-right space-y-1 min-w-[240px] print:border-gray-300 print:bg-white">
            <div className="flex justify-between text-xs text-slate-400">
              <span>Gross Reclaimed Value:</span>
              <span className="font-mono text-white print:text-black">
                ${kpis?.grossRealizedValue?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
            <div className="flex justify-between text-xs text-slate-400">
              <span>SunShade Subscription Fee:</span>
              <span className="font-mono text-emerald-400 font-bold">$0.00</span>
            </div>
            <div className="pt-2 border-t border-slate-800 flex justify-between text-sm font-bold">
              <span className="text-white print:text-black">Net Realized Savings:</span>
              <span className="font-mono text-emerald-400">
                ${kpis?.netRealizedSavings?.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
