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
  const neglectMultiplier = isNaN(rawNeglect) || rawNeglect < 1.0 ? 1.0 : rawNeglect;

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

  const workItemId = params?.workItemId || item.id;
  const tenantId = params?.tenantId || item.tenant_id;
  const projectId = params?.projectId || item.project_id;
  const assignee = params?.assignee || item.assignee;
  const recipientUserId = params?.recipientUserId || item.assignee_id || null;

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
