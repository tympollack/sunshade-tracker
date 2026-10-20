import React from 'react';
import { supabaseAdmin } from '@/lib/db';
import { ShieldAlert, Award, GitPullRequest, Terminal, CheckCircle2, Clock, PlayCircle } from 'lucide-react';

interface PageProps {
  params: Promise<{ tenantSlug: string }> | { tenantSlug: string };
}

export default async function PublicBountiesPage({ params }: PageProps) {
  const resolvedParams = await params;
  const rawSlug = resolvedParams?.tenantSlug || '';
  const tenantSlug = rawSlug.replace(/^@/, '');

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
          <h1 className="text-xl font-bold text-slate-100 mb-2">Private Workspace</h1>
          <p className="text-sm text-slate-400 mb-6">
            Workspace &ldquo;{tenantSlug}&rdquo; is private. Only authenticated members can view internal roadmap items and bounties.
          </p>
          <a
            href="/login"
            className="inline-flex items-center justify-center px-4 py-2 rounded-lg bg-sky-600 hover:bg-sky-500 text-white font-medium text-sm transition-colors"
          >
            Sign In with Workspace Account
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

  const { data: allItems } = await itemsQuery;

  // Filter for bounty-active items or public tasks
  const items = (allItems || []).filter((it: any) => {
    return Boolean(it.metadata?.bounty_active) || it.metadata?.bounty_reward || it.metadata?.bounty_points;
  });

  const columns = [
    { id: 'not_started', label: 'Open Bounties', icon: PlayCircle, color: 'text-amber-400 border-amber-500/20' },
    { id: 'in_progress', label: 'Claimed / In Progress', icon: Clock, color: 'text-sky-400 border-sky-500/20' },
    { id: 'in_review', label: 'Under Review', icon: GitPullRequest, color: 'text-purple-400 border-purple-500/20' },
    { id: 'complete', label: 'Completed & Verified', icon: CheckCircle2, color: 'text-emerald-400 border-emerald-500/20' },
  ];

  return (
    <main className="min-h-screen bg-slate-950 text-slate-100 p-6 md:p-10 font-sans">
      {/* Header */}
      <header className="max-w-7xl mx-auto mb-8">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Public Roadmap & Bounties
              </span>
              <span className="text-xs text-slate-500 font-mono">@{tenant.slug}</span>
            </div>
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              {tenant.name} Bounty Gateway
            </h1>
            <p className="text-sm text-slate-400 mt-1">
              Autonomous agents and open-source contributors can claim tasks and submit pull requests for automated reward verification.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <a
              href={`/${tenant.slug}`}
              className="px-4 py-2 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-850 text-slate-300 text-sm font-medium transition-colors"
            >
              View Full Board
            </a>
          </div>
        </div>

        {/* Contributor & Agent Instructions */}
        <section className="bg-slate-900/60 border border-slate-800 rounded-xl p-5 mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-400 border border-sky-500/20 flex items-center justify-center shrink-0">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-200">1. Claim with CLI</h2>
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
              <h2 className="text-sm font-semibold text-slate-200">2. Reference in PR</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Include Ref ID in PR title: <code className="text-purple-300 text-xs">feat: [&lt;REF-ID&gt;]</code>
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 flex items-center justify-center shrink-0">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-200">3. Automated Reward</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Merge automatically moves card to Complete and verifies bounty.
              </p>
            </div>
          </div>
        </section>
      </header>

      {/* Kanban Board Grid */}
      <section className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {columns.map((col) => {
          const colItems = items.filter((it: any) => it.status === col.id);
          const Icon = col.icon;

          return (
            <div
              key={col.id}
              className="bg-slate-900/40 border border-slate-800/80 rounded-xl p-4 flex flex-col min-h-[500px]"
            >
              {/* Column Header */}
              <div className="flex items-center justify-between pb-3 mb-3 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Icon className={`w-4 h-4 ${col.color.split(' ')[0]}`} />
                  <h3 className="text-sm font-bold text-slate-200">{col.label}</h3>
                </div>
                <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                  {colItems.length}
                </span>
              </div>

              {/* Cards List */}
              <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
                {colItems.length === 0 ? (
                  <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-slate-600 italic">
                    No items in this column
                  </div>
                ) : (
                  colItems.map((item: any) => (
                    <article
                      key={item.id}
                      className="bg-slate-900 border border-slate-800/90 rounded-lg p-4 shadow-sm hover:border-slate-700 transition-all flex flex-col gap-2"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded bg-sky-950/60 text-sky-400 border border-sky-800/50 text-xs font-mono font-semibold">
                          {item.external_ref_id || item.id.slice(0, 8)}
                        </span>
                        {item.metadata?.bounty_reward && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs font-bold font-mono">
                            {item.metadata.bounty_reward}
                          </span>
                        )}
                      </div>

                      <h4 className="text-sm font-semibold text-slate-100 leading-snug">
                        {item.title}
                      </h4>

                      {item.description && (
                        <p className="text-xs text-slate-400 line-clamp-2">
                          {item.description}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs text-slate-500">
                        <span>{item.assignee ? `@${item.assignee}` : 'Unassigned'}</span>
                        {item.metadata?.pr_url && (
                          <a
                            href={item.metadata.pr_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-400 hover:text-purple-300 flex items-center gap-1 font-mono text-[11px]"
                          >
                            <GitPullRequest className="w-3 h-3" /> PR
                          </a>
                        )}
                      </div>
                    </article>
                  ))
                )}
              </div>
            </div>
          );
        })}
      </section>
    </main>
  );
}
