'use client';

import { use, useEffect, useState, Suspense } from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Loader2, Settings } from 'lucide-react';
import { SunShadeLogo } from '@/components/SunShadeLogo';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import { StatementGenerator } from '@/components/statements/StatementGenerator';

interface PageProps {
  params: Promise<{
    tenantSlug: string;
  }>;
}

export default function DynamicStatementsPage(props: PageProps) {
  const { tenantSlug } = use(props.params);

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-[#090d16] text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin text-emerald-400 mr-2" />
          <span>Loading statements...</span>
        </div>
      }
    >
      <StatementsContent tenantSlug={tenantSlug} />
    </Suspense>
  );
}

function StatementsContent({ tenantSlug }: { tenantSlug: string }) {
  const [workspaces, setWorkspaces] = useState<any[]>([]);

  useEffect(() => {
    fetch('/api/v1/tenants/me', {
      headers: { 'x-tenant-slug': tenantSlug },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d?.workspaces) setWorkspaces(d.workspaces);
      })
      .catch(() => {});
  }, [tenantSlug]);

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100 print:bg-white print:text-black">
      {/* App Header (Hidden in Print) */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-4 sm:px-6 py-3 flex items-center justify-between sticky top-0 z-40 print:hidden">
        <div className="flex items-center space-x-2 min-w-0 shrink">
          <SunShadeLogo variant="horizontal" size="xs" href="/" className="mr-0.5 sm:mr-1 shrink-0" hideTextOnMobile />
          <span className="text-slate-700 shrink-0">/</span>
          <WorkspaceSwitcher currentTenantSlug={tenantSlug} workspaces={workspaces} />
          <span className="text-slate-700 shrink-0">/</span>
          <Link
            href={`/${tenantSlug}/settings`}
            className="text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors"
          >
            Settings
          </Link>
          <span className="text-slate-700">/</span>
          <span className="text-xs font-semibold text-emerald-400">Statements</span>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href={`/${tenantSlug}/settings/efficiency`}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Monthly Audit</span>
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-6 print:p-0 print:max-w-none">
        {/* Page Banner */}
        <div className="p-6 rounded-2xl bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-emerald-950/30 border border-slate-800/90 flex flex-col md:flex-row md:items-center md:justify-between gap-4 print:border-none print:bg-none print:p-0">
          <div>
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded text-[11px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 uppercase tracking-wider">
                Ledger Statements
              </span>
              <span className="text-xs font-mono text-slate-500">
                @{tenantSlug}
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold text-white mt-1 flex items-center gap-2 print:text-black">
              <ShieldCheck className="w-7 h-7 text-emerald-400 print:hidden" />
              Dynamic Efficiency Statements
            </h1>
            <p className="text-xs md:text-sm text-slate-400 mt-1 print:text-slate-600">
              Generate custom date-range statements, quarterly audits, or annual efficiency reports.
            </p>
          </div>
        </div>

        {/* Dynamic Statement Generator Component */}
        <StatementGenerator tenantSlug={tenantSlug} />
      </main>
    </div>
  );
}
