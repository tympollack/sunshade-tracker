import React from 'react';
import { headers } from 'next/headers';
import { supabaseAdmin } from '@/lib/db';
import {
  ShieldAlert,
  Award,
  GitPullRequest,
  Terminal,
  Coins,
  Flame,
  ShieldCheck,
} from 'lucide-react';
import { BountyGatewayBoard } from '@/components/bounties/BountyGatewayBoard';
import { DEFAULT_LOCALE, resolveLocale, t } from '@/lib/i18n';

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

async function resolveRequestLocale(): Promise<string> {
  try {
    const hdrs = await headers();
    return resolveLocale(hdrs.get('accept-language'));
  } catch {
    return DEFAULT_LOCALE;
  }
}

export default async function PublicBountiesPage({ params }: PageProps) {
  const resolvedParams = await params;
  const rawSlug = resolvedParams?.tenantSlug || '';
  const tenantSlug = rawSlug.replace(/^@/, '');
  const locale = await resolveRequestLocale();

  // 1. Resolve Tenant
  let tenantQuery: any = supabaseAdmin
    .from('tenants')
    .select('id, slug, name, tier, metadata')
    .eq('slug', tenantSlug);

  if (typeof tenantQuery.is === 'function') {
    tenantQuery = tenantQuery.is('deleted_at', null);
  }

  const { data: tenant } = await tenantQuery.maybeSingle();

  // 2. Security Check: Mask internal private workspaces
  const isPublicWorkspace =
    tenant &&
    (tenant.slug === 'sunshade' ||
      tenant.tier === 'demo' ||
      Boolean(tenant.metadata?.is_public) ||
      Boolean(tenant.metadata?.public_bounties));

  if (!tenant || !isPublicWorkspace) {
    return (
      <main className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-xl p-8 text-center shadow-2xl">
          <div className="w-12 h-12 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto mb-4">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-slate-100 mb-2">
            {t('bounty.gateway.privateTitle', undefined, locale)}
          </h1>
          <p className="text-sm text-slate-400 mb-6">
            {t('bounty.gateway.privateDescription', { tenantSlug }, locale)}
          </p>
          <a
            href="/login"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm transition-colors"
          >
            {t('bounty.gateway.signIn', undefined, locale)}
          </a>
        </div>
      </main>
    );
  }

  // 3. Query Bounties / Work items marked active
  let itemsQuery: any = supabaseAdmin
    .from('work_items')
    .select('*')
    .eq('tenant_id', tenant.id);

  if (typeof itemsQuery.is === 'function') {
    itemsQuery = itemsQuery.is('deleted_at', null);
  }

  if (typeof itemsQuery.filter === 'function') {
    itemsQuery = itemsQuery.filter('metadata->>bounty_active', 'eq', 'true');
  }

  if (typeof itemsQuery.order === 'function') {
    itemsQuery = itemsQuery.order('created_at', { ascending: false });
  }

  const { data: allItems } = await itemsQuery;

  // Security: Strictly filter for active bounties to prevent exposing private task details
  const items = (allItems || []).filter((it: any) => it.metadata?.bounty_active === true);

  // 3b. Resolve project-level process_efficiency_factor overrides safely
  const projectEfficiencyMap = new Map<string, number>();
  try {
    const projTable: any = supabaseAdmin.from('projects');
    if (projTable && typeof projTable.select === 'function') {
      let projQuery: any = projTable.select('id, settings').eq('tenant_id', tenant.id);
      if (typeof projQuery?.is === 'function') {
        projQuery = projQuery.is('deleted_at', null);
      }
      const projRes = await projQuery;
      for (const proj of projRes?.data || []) {
        if (proj?.id && typeof proj?.settings?.process_efficiency_factor === 'number') {
          projectEfficiencyMap.set(proj.id, proj.settings.process_efficiency_factor);
        }
      }
    }
  } catch {
    // Non-fatal fallback to default 1.0 factor
  }

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
      {/* Header */}
      <header className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                {t('bounty.gateway.badge', undefined, locale)}
              </span>
              <span className="text-xs text-slate-500 font-mono">@{tenant.slug}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              {t('bounty.gateway.title', { tenantName: tenant.name }, locale)}
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              {t('bounty.gateway.subtitle', undefined, locale)}
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href={`/${tenant.slug}`}
              className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-300 text-sm font-medium transition-colors"
            >
              {t('bounty.gateway.viewBoard', undefined, locale)}
            </a>
          </div>
        </div>

        {/* Sovereign Token Economy Status Banner */}
        <div className="bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-amber-950/20 border border-slate-800 rounded-xl p-4 mt-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 flex items-center justify-center shrink-0">
              <Coins className="w-5 h-5 text-amber-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-white">
                  {t('bounty.gateway.banner.title', undefined, locale)}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/30">
                  {t('bounty.gateway.banner.badge', undefined, locale)}
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                {t('bounty.gateway.banner.subtitle', undefined, locale)}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-slate-300">
            <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-1.5">
              <Flame className="w-3.5 h-3.5 text-amber-400" />
              <span>{t('bounty.gateway.banner.dormancyChip', undefined, locale)}</span>
            </div>
            <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span>{t('bounty.gateway.banner.proofChip', undefined, locale)}</span>
            </div>
          </div>
        </div>

        {/* Contributor & Agent Instructions */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center shrink-0">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-200">
                {t('bounty.gateway.steps.claimTitle', undefined, locale)}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5 font-mono">
                sunshade-cli task:claim &lt;REF-ID&gt;
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-purple-500/10 text-purple-400 border border-purple-500/20 flex items-center justify-center shrink-0">
              <GitPullRequest className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-200">
                {t('bounty.gateway.steps.referenceTitle', undefined, locale)}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {t('bounty.gateway.steps.referenceDesc', undefined, locale)}{' '}
                <code className="text-purple-300 text-xs">feat: [&lt;REF-ID&gt;]</code>
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-200">
                {t('bounty.gateway.steps.rewardTitle', undefined, locale)}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {t('bounty.gateway.steps.rewardDesc', undefined, locale)}
              </p>
            </div>
          </div>
        </section>
      </header>

      <BountyGatewayBoard
        items={items}
        projectEfficiencyMap={projectEfficiencyMap}
        locale={locale}
      />
    </main>
  );
}
