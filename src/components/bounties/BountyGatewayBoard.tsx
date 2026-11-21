import React from 'react';
import {
  GitPullRequest,
  CheckCircle2,
  Clock,
  PlayCircle,
  Coins,
  Flame,
  ShieldCheck,
} from 'lucide-react';
import { calculateBountyPricing } from '@/lib/bounties/neglectPricing';
import { formatNumber, t, type TranslationKey } from '@/lib/i18n';

interface BountyGatewayBoardProps {
  items: any[];
  projectEfficiencyMap: Map<string, number>;
  locale: string;
}

const BOARD_COLUMNS: Array<{
  id: string;
  labelKey: TranslationKey;
  icon: typeof PlayCircle;
  color: string;
}> = [
  { id: 'not_started', labelKey: 'bounty.gateway.columns.not_started', icon: PlayCircle, color: 'text-amber-400 border-amber-500/20' },
  { id: 'in_progress', labelKey: 'bounty.gateway.columns.in_progress', icon: Clock, color: 'text-sky-400 border-sky-500/20' },
  { id: 'in_review', labelKey: 'bounty.gateway.columns.in_review', icon: GitPullRequest, color: 'text-purple-400 border-purple-500/20' },
  { id: 'complete', labelKey: 'bounty.gateway.columns.complete', icon: CheckCircle2, color: 'text-emerald-400 border-emerald-500/20' },
];

export function BountyGatewayBoard({
  items,
  projectEfficiencyMap,
  locale,
}: BountyGatewayBoardProps) {
  return (
    <section className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {BOARD_COLUMNS.map((col) => {
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
                <h3 className="text-sm font-bold text-slate-200">
                  {t(col.labelKey, undefined, locale)}
                </h3>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                {formatNumber(colItems.length, locale)}
              </span>
            </div>

            {/* Cards List */}
            <div className="flex flex-col gap-3 flex-1 overflow-y-auto">
              {colItems.length === 0 ? (
                <div className="flex-1 flex items-center justify-center p-6 text-center text-xs text-slate-600 italic">
                  {t('bounty.gateway.emptyColumn', undefined, locale)}
                </div>
              ) : (
                colItems.map((item: any) => {
                  const pricing = calculateBountyPricing({
                    estimatedHours: item.metadata?.estimated_hours || item.metadata?.bounty_hours,
                    priority: item.priority || item.metadata?.priority,
                    lastActivityDate: item.updated_at || item.created_at,
                    processEfficiencyFactor:
                      projectEfficiencyMap.get(item.project_id) ?? item.metadata?.process_efficiency_factor,
                    patronBoostTokens: item.metadata?.patron_boost_tokens,
                    locale,
                  });

                  return (
                    <article
                      key={item.id}
                      className="bg-slate-900 border border-slate-800/90 rounded-lg p-4 shadow-sm hover:border-slate-700 transition-all flex flex-col gap-2.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="px-2 py-0.5 rounded bg-sky-950/60 text-sky-400 border border-sky-800/50 text-xs font-mono font-semibold">
                          {item.external_ref_id || item.id.slice(0, 8)}
                        </span>
                        {item.metadata?.bounty_reward ? (
                          <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs font-bold font-mono">
                            {item.metadata.bounty_reward}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded bg-amber-500/10 text-amber-300 border border-amber-500/20 text-xs font-bold font-mono flex items-center gap-1">
                            <Coins className="w-3 h-3 text-amber-400" />
                            {t(
                              'bounty.reward.tokens',
                              { amount: formatNumber(pricing.dynamicBountyTokens, locale) },
                              locale
                            )}
                          </span>
                        )}
                      </div>

                      {pricing.patronBoostTokens > 0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <Coins className="w-3 h-3 text-emerald-400" />
                            {t(
                              'bounty.reward.badge.patronBoost',
                              { amount: formatNumber(pricing.patronBoostTokens, locale) },
                              locale
                            )}
                          </span>
                        </div>
                      )}

                      {!item.metadata?.bounty_reward && pricing.neglectMultiplier > 1.0 && (
                        <div className="flex items-center gap-1.5">
                          <span className="px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-amber-500/10 text-amber-400 border border-amber-500/30 flex items-center gap-1">
                            <Flame className="w-3 h-3 text-amber-400" />
                            {t(
                              'bounty.reward.dormancyDetail',
                              {
                                multiplier: pricing.neglectMultiplier.toFixed(2),
                                days: formatNumber(pricing.daysDormant, locale),
                              },
                              locale
                            )}
                          </span>
                        </div>
                      )}

                      <h4 className="text-sm font-semibold text-slate-100 leading-snug">
                        {item.title}
                      </h4>

                      {item.description && (
                        <p className="text-xs text-slate-400 line-clamp-2">
                          {item.description}
                        </p>
                      )}

                      <div className="flex items-center justify-between pt-2 border-t border-slate-800/60 text-xs text-slate-500">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-slate-400">
                            {item.assignee
                              ? `@${item.assignee}`
                              : t('bounty.gateway.card.unassigned', undefined, locale)}
                          </span>
                          <span className="text-slate-600">·</span>
                          <span className="flex items-center gap-1 text-[11px] text-slate-400 font-mono">
                            <Clock className="w-3 h-3 text-slate-500" />
                            {t(
                              'bounty.gateway.card.hoursEstimate',
                              { hours: pricing.estimatedHours.toFixed(1) },
                              locale
                            )}
                          </span>
                        </div>
                        {item.metadata?.pr_url ? (
                          <a
                            href={item.metadata.pr_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-purple-400 hover:text-purple-300 flex items-center gap-1 font-mono text-[11px]"
                          >
                            <GitPullRequest className="w-3 h-3" />{' '}
                            {t('bounty.gateway.card.prLink', undefined, locale)}
                          </a>
                        ) : (
                          <span className="text-[11px] font-mono text-emerald-400/80 flex items-center gap-1">
                            <ShieldCheck className="w-3 h-3 text-emerald-400" />{' '}
                            {t('bounty.gateway.card.proofRequired', undefined, locale)}
                          </span>
                        )}
                      </div>
                    </article>
                  );
                })
              )}
            </div>
          </div>
        );
      })}
    </section>
  );
}
