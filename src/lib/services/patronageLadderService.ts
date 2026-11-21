export type PatronageLadderTier =
  | 'leaf_contributor'
  | 'force_multiplier'
  | 'bounty_patron'
  | 'oversight_steward';

export const PATRONAGE_LADDER_THRESHOLDS = {
  leaf_contributor: 0,
  force_multiplier: 300_000,
  bounty_patron: 1_200_000,
  oversight_steward: 3_000_000,
} as const;

export const DEFAULT_PATRON_BOOST_TOKENS = 15_000;
export const PATRONAGE_TOKENS_PER_HOUR = 60_000;

export interface BuilderPatronageStatus {
  builderUserId: string;
  totalPatronageCredits: number;
  spentBoostCredits: number;
  availablePatronageCredits: number;
  hoursSponsored: number;
  activeArtifactsCount: number;
  ladderTier: PatronageLadderTier;
  canDirectPatronBoost: boolean;
  isOversightSteward: boolean;
  nextTier: PatronageLadderTier | null;
  creditsToNextTier: number;
}

export interface DirectedPatronBoostResult {
  success: boolean;
  workItemId: string;
  boostTokens: number;
  patronBoostTokens: number;
  remainingPatronageCredits: number;
  ladderTier: PatronageLadderTier;
  allocation?: any;
}

function getPublicClient(supabaseClient: any) {
  if (supabaseClient && typeof supabaseClient.schema === 'function') {
    return supabaseClient.schema('public');
  }
  return supabaseClient;
}

/**
 * Resolves a builder's Oversight Graduation Ladder tier from accumulated Patronage Credits:
 * - leaf_contributor: < 300,000
 * - force_multiplier: >= 300,000
 * - bounty_patron: >= 1,200,000 (unlocks Directed Patronage Boosts)
 * - oversight_steward: >= 3,000,000 (unlocks Oversight Steward Governance Gate)
 */
export function resolvePatronageLadderTier(totalPatronageCredits: number): PatronageLadderTier {
  const credits = Math.max(0, Number(totalPatronageCredits) || 0);
  if (credits >= PATRONAGE_LADDER_THRESHOLDS.oversight_steward) {
    return 'oversight_steward';
  }
  if (credits >= PATRONAGE_LADDER_THRESHOLDS.bounty_patron) {
    return 'bounty_patron';
  }
  if (credits >= PATRONAGE_LADDER_THRESHOLDS.force_multiplier) {
    return 'force_multiplier';
  }
  return 'leaf_contributor';
}

export function canAttachDirectedPatronBoost(
  statusOrCredits: BuilderPatronageStatus | number
): boolean {
  if (typeof statusOrCredits === 'number') {
    return statusOrCredits >= PATRONAGE_LADDER_THRESHOLDS.bounty_patron;
  }
  return statusOrCredits.canDirectPatronBoost;
}

export function hasOversightStewardPrivilege(
  statusOrCredits: BuilderPatronageStatus | number
): boolean {
  if (typeof statusOrCredits === 'number') {
    return statusOrCredits >= PATRONAGE_LADDER_THRESHOLDS.oversight_steward;
  }
  return statusOrCredits.isOversightSteward;
}

function getNextTierProgress(totalCredits: number): {
  nextTier: PatronageLadderTier | null;
  creditsToNextTier: number;
} {
  if (totalCredits < PATRONAGE_LADDER_THRESHOLDS.force_multiplier) {
    return {
      nextTier: 'force_multiplier',
      creditsToNextTier: PATRONAGE_LADDER_THRESHOLDS.force_multiplier - totalCredits,
    };
  }
  if (totalCredits < PATRONAGE_LADDER_THRESHOLDS.bounty_patron) {
    return {
      nextTier: 'bounty_patron',
      creditsToNextTier: PATRONAGE_LADDER_THRESHOLDS.bounty_patron - totalCredits,
    };
  }
  if (totalCredits < PATRONAGE_LADDER_THRESHOLDS.oversight_steward) {
    return {
      nextTier: 'oversight_steward',
      creditsToNextTier: PATRONAGE_LADDER_THRESHOLDS.oversight_steward - totalCredits,
    };
  }
  return { nextTier: null, creditsToNextTier: 0 };
}

/**
 * Fetches a builder's Attributed Patronage Summary, unspent Directed Boost allowance,
 * and Oversight Steward governance privileges from public.v_builder_patronage_summary.
 */
export async function getBuilderPatronageStatus(
  userId: string,
  supabaseClient?: any
): Promise<BuilderPatronageStatus> {
  const cleanUserId = String(userId || '').trim();
  if (!cleanUserId) {
    throw new Error('userId is required to resolve builder patronage status.');
  }

  let client = supabaseClient;
  if (!client) {
    const { supabaseAdmin } = await import('@/lib/db');
    client = supabaseAdmin;
  }
  const publicClient = getPublicClient(client);

  let summaryRow: any = null;
  const summaryTable = publicClient.from('v_builder_patronage_summary');
  if (summaryTable && typeof summaryTable.select === 'function') {
    const q = summaryTable.select('*').eq('builder_user_id', cleanUserId);
    const res = typeof q.maybeSingle === 'function' ? await q.maybeSingle() : await q;
    if (res?.error) {
      throw new Error(`Failed to fetch builder patronage summary: ${res.error.message}`);
    }
    summaryRow = Array.isArray(res?.data) ? res.data[0] : res?.data;
  }

  const totalPatronageCredits = Math.max(0, Number(summaryRow?.total_patronage_credits ?? 0));
  const activeArtifactsCount = Math.max(0, Number(summaryRow?.active_artifacts_count ?? 0));
  const hoursSponsored =
    summaryRow?.hours_sponsored !== undefined && summaryRow?.hours_sponsored !== null
      ? Number(summaryRow.hours_sponsored)
      : Number((totalPatronageCredits / PATRONAGE_TOKENS_PER_HOUR).toFixed(2));

  let spentBoostCredits = 0;
  try {
    const allocTable = publicClient.from('patronage_boost_allocations');
    if (allocTable && typeof allocTable.select === 'function') {
      let allocQuery: any = allocTable
        .select('boost_tokens, status')
        .eq('builder_user_id', cleanUserId);
      if (typeof allocQuery.in === 'function') {
        allocQuery = allocQuery.in('status', ['reserved', 'claimed']);
      }
      const { data: allocRows } = await allocQuery;
      for (const row of allocRows || []) {
        if (row?.status && row.status !== 'reserved' && row.status !== 'claimed') continue;
        const amt = Number(row?.boost_tokens ?? 0);
        if (Number.isFinite(amt) && amt > 0) {
          spentBoostCredits += amt;
        }
      }
    }
  } catch {
    // Non-fatal if allocation table query is omitted in read-only summary mocks
  }

  const availablePatronageCredits = Math.max(0, totalPatronageCredits - spentBoostCredits);
  const ladderTier =
    (summaryRow?.ladder_tier as PatronageLadderTier | undefined) ||
    resolvePatronageLadderTier(totalPatronageCredits);

  const { nextTier, creditsToNextTier } = getNextTierProgress(totalPatronageCredits);

  return {
    builderUserId: cleanUserId,
    totalPatronageCredits,
    spentBoostCredits,
    availablePatronageCredits,
    hoursSponsored,
    activeArtifactsCount,
    ladderTier,
    canDirectPatronBoost: totalPatronageCredits >= PATRONAGE_LADDER_THRESHOLDS.bounty_patron,
    isOversightSteward: totalPatronageCredits >= PATRONAGE_LADDER_THRESHOLDS.oversight_steward,
    nextTier,
    creditsToNextTier,
  };
}

/**
 * Attaches a pool-backed Directed Patron Boost (default 15,000 $SHT) from SYSTEM_ECOSYSTEM_POOL
 * onto a work item via public.apply_directed_patron_boost without draining personal wallets.
 */
export async function applyDirectedPatronBoost(params: {
  builderId: string;
  workItemId: string;
  boostTokens?: number;
  supabaseClient?: any;
}): Promise<DirectedPatronBoostResult> {
  const builderId = String(params.builderId || '').trim();
  const workItemId = String(params.workItemId || '').trim();
  const boostTokens = Math.round(Number(params.boostTokens ?? DEFAULT_PATRON_BOOST_TOKENS));

  if (!builderId) {
    throw new Error('builderId is required to apply a directed patron boost.');
  }
  if (!workItemId) {
    throw new Error('workItemId is required to apply a directed patron boost.');
  }
  if (!Number.isFinite(boostTokens) || boostTokens <= 0) {
    throw new Error('boostTokens must be a positive integer.');
  }

  let client = params.supabaseClient;
  if (!client) {
    const { supabaseAdmin } = await import('@/lib/db');
    client = supabaseAdmin;
  }
  const publicClient = getPublicClient(client);

  if (typeof publicClient.rpc !== 'function') {
    throw new Error('Supabase client does not support RPC apply_directed_patron_boost.');
  }

  const { data, error } = await publicClient.rpc('apply_directed_patron_boost', {
    p_builder_id: builderId,
    p_work_item_id: workItemId,
    p_boost_tokens: boostTokens,
  });

  if (error) {
    throw new Error(`RPC apply_directed_patron_boost failed: ${error.message}`);
  }

  return {
    success: Boolean(data?.success ?? true),
    workItemId: data?.work_item_id || workItemId,
    boostTokens: Number(data?.boost_tokens ?? boostTokens),
    patronBoostTokens: Number(data?.patron_boost_tokens ?? boostTokens),
    remainingPatronageCredits: Number(data?.remaining_patronage_credits ?? 0),
    ladderTier: (data?.ladder_tier as PatronageLadderTier) || 'bounty_patron',
    allocation: data?.allocation,
  };
}
