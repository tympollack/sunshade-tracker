import { hasVerifiableArtifactProof } from '@/lib/services/valueLedgerService';
import type {
  WorkItemWithProjectMode,
  DualStreamMintResult,
  EfficiencyMintSummary,
  AttestMintParams,
} from '@/types/statements';

export const TOKEN_PER_HOUR = 60000; // Calibrated: 20 hrs = 1,200,000 tokens (1,000 tokens/min)
export const TRIAGE_UPKEEP_HOURS_PER_ITEM = 0.05; // 3 min
export const AUTONOMOUS_BOUNTY_HOURS_PER_ITEM = 0.20; // 12 min
export const SYSTEM_ECOSYSTEM_POOL_USER_ID = '00000000-0000-0000-0000-000000000000';
export const SYSTEM_ECOSYSTEM_POOL_WALLET_ID = 'SYSTEM_ECOSYSTEM_POOL';
export const DEFAULT_HOURLY_VALUATION_USD = 125;
export const DEFAULT_PATRONAGE_UPKEEP_SLICE = 2500;
export const DEFAULT_PATRONAGE_ALPHA = 2.8;

const COMPLETION_STATUSES = new Set(['complete', 'completed', 'done', 'closed', 'resolved']);

/**
 * Calculates the dual-stream token mint allocation for a given work item.
 *
 * Anti-Chore Farming and Dual Recipient Rules:
 * 1. Personal organizer items ('personal_organizer') are strictly excluded from all minting
 *    (both Upkeep and Bounty streams = 0 tokens).
 * 2. Incompleted items are not eligible for minting.
 * 3. Stream A (Ecosystem Upkeep):
 *    - Backlog Triage / Sync credit (0.05 hrs = 3,000 tokens)
 *    - Minted to SYSTEM_ECOSYSTEM_POOL (funds future public bounties)
 * 4. Stream B (Personal Execution Bounty):
 *    - Autonomous Review & Dev Cycles (0.20 hrs = 12,000 tokens baseline)
 *    - Strictly requires verifiable artifact proof (commit_sha, pr_url, zkp_attestation_id, or ai_usage_logs)
 *    - Scaled by neglect_multiplier M_neglect (default 1.0)
 *    - Minted to assignee's personal wallet
 */
export function calculateItemEfficiencyYield(
  item: WorkItemWithProjectMode
): DualStreamMintResult {
  const ledgerMode = item.project_ledger_mode || 'standard_workspace';
  const status = String(item.status || '').toLowerCase().trim();
  const isCompleted = COMPLETION_STATUSES.has(status);

  if (ledgerMode === 'personal_organizer') {
    return {
      upkeepHours: 0,
      upkeepTokens: 0,
      bountyHours: 0,
      bountyTokens: 0,
      neglectMultiplier: 1.0,
      hasArtifactProof: false,
      isEligibleForUpkeep: false,
      isEligibleForBounty: false,
      reason: 'Personal organizer items are strictly excluded from sovereign token minting.',
    };
  }

  if (!isCompleted) {
    return {
      upkeepHours: 0,
      upkeepTokens: 0,
      bountyHours: 0,
      bountyTokens: 0,
      neglectMultiplier: 1.0,
      hasArtifactProof: false,
      isEligibleForUpkeep: false,
      isEligibleForBounty: false,
      reason: 'Work item is not in completed status.',
    };
  }

  // Stream A: Ecosystem Upkeep
  const upkeepHours = TRIAGE_UPKEEP_HOURS_PER_ITEM;
  const upkeepTokens = Math.round(upkeepHours * TOKEN_PER_HOUR); // 3,000 tokens

  // Stream B: Personal Execution Bounty
  const proof = hasVerifiableArtifactProof(item);
  const rawNeglect = Number(item.metadata?.neglect_multiplier ?? 1.0);
  // Neglect multiplier clamped to [1.0, 3.0] (3x maximum capacity yield cap) to prevent artificial inflation
  const neglectMultiplier =
    !Number.isFinite(rawNeglect) || rawNeglect < 1.0
      ? 1.0
      : Math.min(3.0, Number(rawNeglect.toFixed(4)));

  if (!proof.hasArtifactProof) {
    return {
      upkeepHours,
      upkeepTokens,
      bountyHours: 0,
      bountyTokens: 0,
      neglectMultiplier,
      hasArtifactProof: false,
      isEligibleForUpkeep: true,
      isEligibleForBounty: false,
      reason: 'Artifact proof (commit, PR, ZKP, or AI logs) required for personal bounty minting.',
    };
  }

  const bountyHours = AUTONOMOUS_BOUNTY_HOURS_PER_ITEM;
  const bountyTokens = Math.round(bountyHours * TOKEN_PER_HOUR * neglectMultiplier);

  return {
    upkeepHours,
    upkeepTokens,
    bountyHours,
    bountyTokens,
    neglectMultiplier,
    hasArtifactProof: true,
    proofType: proof.proofType,
    proofRef: proof.proofRef,
    isEligibleForUpkeep: true,
    isEligibleForBounty: true,
  };
}

/**
 * Aggregates dual-stream token mint summary for a collection of workspace items.
 */
export function calculateTenantEfficiencyMintSummary(
  items: WorkItemWithProjectMode[]
): EfficiencyMintSummary {
  let totalUpkeepTokens = 0;
  let totalBountyTokens = 0;
  let eligibleItemsCount = 0;

  for (const item of items) {
    const yieldRes = calculateItemEfficiencyYield(item);
    if (yieldRes.isEligibleForUpkeep || yieldRes.isEligibleForBounty) {
      eligibleItemsCount++;
      totalUpkeepTokens += yieldRes.upkeepTokens;
      totalBountyTokens += yieldRes.bountyTokens;
    }
  }

  return {
    totalUpkeepTokens,
    totalBountyTokens,
    totalMintedTokens: totalUpkeepTokens + totalBountyTokens,
    ecosystemPoolAddress: SYSTEM_ECOSYSTEM_POOL_USER_ID,
    eligibleItemsCount,
  };
}

/**
 * Client/server RPC bridge to attest a verified work item and mint dual-stream yields via Supabase.
 */
export async function attestAndMintEfficiencyYield(
  supabaseClient: any,
  item: WorkItemWithProjectMode,
  params?: Partial<AttestMintParams>
) {
  const yieldResult = calculateItemEfficiencyYield(item);

  if (!yieldResult.isEligibleForUpkeep && !yieldResult.isEligibleForBounty) {
    return {
      status: 'skipped' as const,
      reason: yieldResult.reason,
      yieldResult,
    };
  }

  // Authoritative identity derivation: strictly bound to verified work item to prevent reward redirection
  const workItemId = item.id;
  const tenantId = item.tenant_id;
  const projectId = item.project_id;
  const assignee = item.assignee;
  const recipientUserId = item.assignee_id || null;

  const rpcPayload = {
    p_work_item_id: workItemId,
    p_tenant_id: tenantId,
    p_project_id: projectId,
    p_assignee: assignee,
    p_recipient_user_id: recipientUserId,
    p_upkeep_hours: yieldResult.upkeepHours,
    p_bounty_hours: yieldResult.bountyHours,
    p_neglect_multiplier: yieldResult.neglectMultiplier,
    p_artifact_type: yieldResult.proofType || null,
    p_artifact_ref: yieldResult.proofRef || null,
    p_metadata: {
      ...(item.metadata || {}),
      ...(params?.metadata || {}),
      attested_via: 'sunshade_tracker_bridge',
      proof_type: yieldResult.proofType,
      proof_ref: yieldResult.proofRef,
    },
  };

  const { data, error } = await supabaseClient.rpc('attest_and_mint_efficiency_yield', rpcPayload);

  if (error) {
    throw new Error(`RPC attest_and_mint_efficiency_yield failed: ${error.message}`);
  }

  return {
    status: data?.status || 'attested',
    attestation: data?.attestation,
    yieldResult,
  };
}

export interface AttributedPatronageParams {
  cumulativeUses: number;
  survivalRatio?: number;
  baseUpkeepSlice?: number;
  alpha?: number;
  invocations?: number;
}

/**
 * Usage-Attenuated Relevance Curve:
 * credit = Math.round(baseUpkeepSlice * (1 / (1 + alpha * Math.log(1 + cumulativeUses))) * survivalRatio)
 *
 * - Early invocations attribute ~1,000–2,500 $SHT (at baseUpkeepSlice = 2500, alpha = 2.8).
 * - High-volume mature utilities taper smoothly into a 10–100 $SHT active heartbeat.
 * - Refactored/dead code (survivalRatio === 0) or zero invocations yields 0.
 * - Never enforces a calendar expiration clock.
 */
export function calculateAttributedPatronage(params: AttributedPatronageParams): number {
  const rawSurvival = params.survivalRatio === undefined ? 1.0 : Number(params.survivalRatio);
  if (!Number.isFinite(rawSurvival) || rawSurvival <= 0) {
    return 0;
  }
  if (params.invocations !== undefined && params.invocations <= 0) {
    return 0;
  }

  const survivalRatio = Math.min(1.0, rawSurvival);
  const cumulativeUses = Math.max(0, Number(params.cumulativeUses) || 0);
  const baseUpkeepSlice =
    params.baseUpkeepSlice === undefined
      ? DEFAULT_PATRONAGE_UPKEEP_SLICE
      : Math.max(0, Number(params.baseUpkeepSlice) || 0);
  const alpha =
    params.alpha === undefined ? DEFAULT_PATRONAGE_ALPHA : Math.max(0, Number(params.alpha) || 0);

  const credit = Math.round(
    baseUpkeepSlice * (1 / (1 + alpha * Math.log(1 + cumulativeUses))) * survivalRatio
  );
  return Math.max(0, credit);
}

export interface EfficiencyStatementMintParams {
  tenantId: string;
  workItemId?: string | null;
  checkpointHash?: string | null;
  projectId?: string | null;
  grossRealizedValueUsd: number;
  hourlyValuationUsd?: number;
  artifactRefId?: string | null;
  builderUserId?: string | null;
  baseUpkeepSlice?: number;
  alpha?: number;
  metadata?: Record<string, any>;
}

export interface EfficiencyStatementMintResult {
  status: 'attested' | 'already_attested' | 'skipped';
  reason?: string;
  mintedTokens: number;
  walletId: string;
  computeCostDeductedUsd: number;
  netRealizedValueUsd: number;
  patronageCreditAwarded: number;
  attributedBuilderId: string | null;
  artifactRefId: string | null;
  survivalRatio: number | null;
  cumulativeUses: number | null;
  attestation?: any;
  ledgerEntry?: any;
}

function getSchemaClient(supabaseClient: any, schema: 'public' | 'tracker') {
  if (supabaseClient && typeof supabaseClient.schema === 'function') {
    return supabaseClient.schema(schema);
  }
  return supabaseClient;
}

function isUniqueViolation(err: any): boolean {
  if (!err) return false;
  const code = String(err.code || '');
  const msg = String(err.message || '').toLowerCase();
  return code === '23505' || msg.includes('duplicate key') || msg.includes('unique constraint');
}

/**
 * Deducts tracker.ai_usage_logs compute costs from gross realized value, checks idempotency,
 * mints 100% of verified upkeep tokens into public.hub_tokens_ledger under SYSTEM_ECOSYSTEM_POOL,
 * and attributes non-transferable Patronage Credits to the originating artifact builder.
 */
export async function mintTokensFromEfficiencyStatement(
  supabaseClient: any,
  params: EfficiencyStatementMintParams
): Promise<EfficiencyStatementMintResult> {
  const trackerClient = getSchemaClient(supabaseClient, 'tracker');
  const publicClient = getSchemaClient(supabaseClient, 'public');

  const workItemId = params.workItemId || null;
  const checkpointHash = params.checkpointHash ? String(params.checkpointHash).trim() : null;
  const artifactRefId =
    params.artifactRefId ||
    (typeof params.metadata?.artifact_ref_id === 'string' ? params.metadata.artifact_ref_id.trim() : null) ||
    null;

  if (!workItemId && !checkpointHash) {
    throw new Error('Either workItemId or checkpointHash is required for idempotent efficiency minting.');
  }

  // 1. Deduct tracker.ai_usage_logs compute costs from gross realized value
  let computeCostDeductedUsd = 0;
  try {
    const logsTable = trackerClient?.from?.('ai_usage_logs');
    if (logsTable && typeof logsTable.select === 'function') {
      let logsQuery: any = logsTable.select('compute_cost_usd, work_item_id, tenant_id').eq('tenant_id', params.tenantId);
      if (workItemId && typeof logsQuery.eq === 'function') {
        logsQuery = logsQuery.eq('work_item_id', workItemId);
      }
      const { data: usageLogs } = await logsQuery;
      for (const row of usageLogs || []) {
        const cost = Number(row?.compute_cost_usd ?? row?.cost_usd ?? 0);
        if (Number.isFinite(cost) && cost > 0) {
          computeCostDeductedUsd += cost;
        }
      }
    }
  } catch {
    // Non-fatal if ai_usage_logs table is absent in legacy mocks
  }

  computeCostDeductedUsd = Number(computeCostDeductedUsd.toFixed(6));
  const grossUsd = Math.max(0, Number(params.grossRealizedValueUsd) || 0);
  const netRealizedValueUsd = Number(Math.max(0, grossUsd - computeCostDeductedUsd).toFixed(6));
  const hourlyValuationUsd =
    params.hourlyValuationUsd && params.hourlyValuationUsd > 0
      ? params.hourlyValuationUsd
      : DEFAULT_HOURLY_VALUATION_USD;

  const upkeepTokens = Math.round((netRealizedValueUsd / hourlyValuationUsd) * TOKEN_PER_HOUR);

  if (upkeepTokens <= 0) {
    return {
      status: 'skipped',
      reason: 'Net realized value after AI compute cost deduction is zero or negative.',
      mintedTokens: 0,
      walletId: SYSTEM_ECOSYSTEM_POOL_WALLET_ID,
      computeCostDeductedUsd,
      netRealizedValueUsd,
      patronageCreditAwarded: 0,
      attributedBuilderId: null,
      artifactRefId,
      survivalRatio: null,
      cumulativeUses: null,
    };
  }

  // 2. Idempotency check in public.efficiency_mint_attestations
  const attestTable = publicClient.from('efficiency_mint_attestations');
  if (attestTable && typeof attestTable.select === 'function') {
    let existing: any = null;
    if (workItemId) {
      const q = attestTable.select('*').eq('work_item_id', workItemId);
      const res = typeof q.maybeSingle === 'function' ? await q.maybeSingle() : await q;
      existing = Array.isArray(res?.data) ? res.data[0] : res?.data;
    }
    if (!existing && checkpointHash) {
      const q = attestTable.select('*').eq('checkpoint_hash', checkpointHash);
      const res = typeof q.maybeSingle === 'function' ? await q.maybeSingle() : await q;
      existing = Array.isArray(res?.data) ? res.data[0] : res?.data;
    }

    if (existing) {
      return {
        status: 'already_attested',
        reason: 'Efficiency statement already attested.',
        mintedTokens: 0,
        walletId: SYSTEM_ECOSYSTEM_POOL_WALLET_ID,
        computeCostDeductedUsd,
        netRealizedValueUsd,
        patronageCreditAwarded: Number(existing.patronage_credit_awarded || 0),
        attributedBuilderId: existing.attributed_builder_id || null,
        artifactRefId: existing.artifact_ref_id || artifactRefId,
        survivalRatio: existing.metadata?.survival_ratio ?? null,
        cumulativeUses: existing.metadata?.cumulative_uses ?? null,
        attestation: existing,
      };
    }
  }

  // 3. Resolve infrastructure artifact (read-only first so concurrent duplicate attestations never double-increment)
  let attributedBuilderId: string | null = null;
  let patronageCreditAwarded = 0;
  let survivalRatio: number | null = null;
  let nextCumulativeUses: number | null = null;
  let resolvedArtifactRow: any = null;

  if (artifactRefId) {
    const artifactsTable = publicClient.from('infrastructure_artifacts');

    if (artifactsTable && typeof artifactsTable.select === 'function') {
      const q = artifactsTable.select('*').eq('artifact_ref_id', artifactRefId);
      const res = typeof q.maybeSingle === 'function' ? await q.maybeSingle() : await q;
      resolvedArtifactRow = Array.isArray(res?.data) ? res.data[0] : res?.data;
    }

    if (resolvedArtifactRow) {
      const prevUses = Math.max(0, Number(resolvedArtifactRow.cumulative_uses ?? 0));
      survivalRatio = Number(resolvedArtifactRow.survival_ratio ?? 1.0);
      attributedBuilderId = resolvedArtifactRow.builder_user_id || params.builderUserId || null;

      patronageCreditAwarded = attributedBuilderId
        ? calculateAttributedPatronage({
            cumulativeUses: prevUses,
            survivalRatio,
            baseUpkeepSlice: params.baseUpkeepSlice,
            alpha: params.alpha,
          })
        : 0;

      nextCumulativeUses = prevUses + 1;
    }
  }

  const ledgerMetadata: Record<string, any> = {
    ...(params.metadata || {}),
    wallet_id: SYSTEM_ECOSYSTEM_POOL_WALLET_ID,
    target_pool: SYSTEM_ECOSYSTEM_POOL_WALLET_ID,
    stream: 'system_ecosystem_pool',
    gross_realized_value_usd: grossUsd,
    compute_cost_deducted_usd: computeCostDeductedUsd,
    net_realized_value_usd: netRealizedValueUsd,
    ...(workItemId ? { work_item_id: workItemId } : {}),
    ...(checkpointHash ? { checkpoint_hash: checkpointHash } : {}),
    ...(artifactRefId && attributedBuilderId
      ? {
          attributed_builder_id: attributedBuilderId,
          artifact_ref_id: artifactRefId,
          patronage_credit_awarded: patronageCreditAwarded,
          survival_ratio: survivalRatio,
          cumulative_uses: nextCumulativeUses,
        }
      : {}),
  };

  // 4. Insert idempotent attestation record before ledger write or artifact increment
  let insertedAttestation: any = null;
  if (attestTable && typeof attestTable.insert === 'function') {
    const insertCall = attestTable.insert({
      work_item_id: workItemId,
      checkpoint_hash: checkpointHash,
      tenant_id: params.tenantId,
      project_id: params.projectId || null,
      artifact_ref_id: attributedBuilderId ? artifactRefId : null,
      attributed_builder_id: attributedBuilderId,
      upkeep_tokens_minted: upkeepTokens,
      patronage_credit_awarded: patronageCreditAwarded,
      compute_cost_deducted: computeCostDeductedUsd,
      metadata: ledgerMetadata,
      attested_at: new Date().toISOString(),
    });
    const insertRes =
      typeof insertCall.select === 'function'
        ? await insertCall.select().single()
        : await insertCall;

    if (insertRes?.error) {
      if (isUniqueViolation(insertRes.error)) {
        return {
          status: 'already_attested',
          reason: 'Concurrent attestation already recorded.',
          mintedTokens: 0,
          walletId: SYSTEM_ECOSYSTEM_POOL_WALLET_ID,
          computeCostDeductedUsd,
          netRealizedValueUsd,
          patronageCreditAwarded: 0,
          attributedBuilderId,
          artifactRefId,
          survivalRatio,
          cumulativeUses: nextCumulativeUses,
        };
      }
      throw new Error(`Failed to record efficiency attestation: ${insertRes.error.message}`);
    }
    insertedAttestation = insertRes?.data || insertRes;
  }

  // 5. Atomically increment cumulative_uses on infrastructure_artifacts after unique claim succeeds
  if (artifactRefId && resolvedArtifactRow) {
    const artifactsTable = publicClient.from('infrastructure_artifacts');
    let incrementedViaRpc = false;
    if (typeof publicClient.rpc === 'function') {
      try {
        const rpcRes = await publicClient.rpc('increment_infrastructure_artifact_use', {
          p_artifact_ref_id: artifactRefId,
        });
        if (rpcRes?.data?.found) {
          incrementedViaRpc = true;
          nextCumulativeUses = Number(rpcRes.data.cumulative_uses ?? nextCumulativeUses);
        }
      } catch {
        // Fall through to direct table update
      }
    }
    if (!incrementedViaRpc && artifactsTable && typeof artifactsTable.update === 'function') {
      await artifactsTable
        .update({
          cumulative_uses: nextCumulativeUses,
          last_invoked_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('artifact_ref_id', artifactRefId);
    }
  }

  // 5. Insert upkeep mint strictly into SYSTEM_ECOSYSTEM_POOL on public.hub_tokens_ledger
  const ledgerTable = publicClient.from('hub_tokens_ledger');
  let insertedLedger: any = null;
  if (ledgerTable && typeof ledgerTable.insert === 'function') {
    const ledgerInsert = ledgerTable.insert({
      user_id: SYSTEM_ECOSYSTEM_POOL_USER_ID,
      token_class: 'work_rebate_token',
      transaction_type: 'ECOSYSTEM_UPKEEP_MINT',
      amount: upkeepTokens,
      description: 'Verified Ecosystem Upkeep Mint into SYSTEM_ECOSYSTEM_POOL',
      metadata: ledgerMetadata,
    });
    const ledgerRes =
      typeof ledgerInsert.select === 'function'
        ? await ledgerInsert.select().single()
        : await ledgerInsert;

    if (ledgerRes?.error) {
      throw new Error(`Failed to mint upkeep tokens to hub_tokens_ledger: ${ledgerRes.error.message}`);
    }
    insertedLedger = ledgerRes?.data || ledgerRes;
  }

  return {
    status: 'attested',
    mintedTokens: upkeepTokens,
    walletId: SYSTEM_ECOSYSTEM_POOL_WALLET_ID,
    computeCostDeductedUsd,
    netRealizedValueUsd,
    patronageCreditAwarded,
    attributedBuilderId,
    artifactRefId,
    survivalRatio,
    cumulativeUses: nextCumulativeUses,
    attestation: insertedAttestation,
    ledgerEntry: insertedLedger,
  };
}

/**
 * Non-blocking telemetry hook triggered when an infrastructure artifact (e.g. TOOL-GH-TRACKER)
 * automates a PR/commit sync on a work item.
 */
export async function recordArtifactTelemetry(
  artifactRefId: string,
  workItemId: string,
  options?: {
    supabaseClient?: any;
    tenantId?: string;
    projectId?: string | null;
    checkpointHash?: string;
    grossRealizedValueUsd?: number;
    metadata?: Record<string, any>;
  }
): Promise<EfficiencyStatementMintResult | null> {
  if (!artifactRefId || !workItemId) return null;

  let client = options?.supabaseClient;
  if (!client) {
    const { supabaseAdmin } = await import('@/lib/db');
    client = supabaseAdmin;
  }

  const checkpointHash = options?.checkpointHash || `telemetry:${artifactRefId}:${workItemId}`;
  const grossRealizedValueUsd =
    options?.grossRealizedValueUsd ?? TRIAGE_UPKEEP_HOURS_PER_ITEM * DEFAULT_HOURLY_VALUATION_USD; // $6.25 -> 3,000 $SHT

  try {
    return await mintTokensFromEfficiencyStatement(client, {
      tenantId: options?.tenantId || SYSTEM_ECOSYSTEM_POOL_USER_ID,
      workItemId,
      checkpointHash,
      projectId: options?.projectId || null,
      grossRealizedValueUsd,
      artifactRefId,
      metadata: {
        ...(options?.metadata || {}),
        telemetry_source: 'artifact_sync_hook',
        artifact_ref_id: artifactRefId,
      },
    });
  } catch (err) {
    console.warn('[efficiencyMintBridge] Non-blocking recordArtifactTelemetry failed:', err);
    return null;
  }
}

/**
 * Batches attestations for an array of work items.
 */
export async function batchAttestTenantEfficiency(
  supabaseClient: any,
  items: WorkItemWithProjectMode[],
  tenantId: string
) {
  const results = [];
  for (const item of items) {
    const yieldRes = calculateItemEfficiencyYield(item);
    if (yieldRes.isEligibleForUpkeep || yieldRes.isEligibleForBounty) {
      try {
        const res = await attestAndMintEfficiencyYield(supabaseClient, item, { tenantId });
        results.push({ itemId: item.id, ...res });
      } catch (err: any) {
        results.push({ itemId: item.id, status: 'error', error: err.message });
      }
    }
  }
  return results;
}
