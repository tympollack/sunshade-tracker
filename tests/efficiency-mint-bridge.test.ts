import { describe, it, expect, vi } from 'vitest';
import {
  calculateItemEfficiencyYield,
  calculateTenantEfficiencyMintSummary,
  attestAndMintEfficiencyYield,
  TOKEN_PER_HOUR,
  TRIAGE_UPKEEP_HOURS_PER_ITEM,
  AUTONOMOUS_BOUNTY_HOURS_PER_ITEM,
  SYSTEM_ECOSYSTEM_POOL_USER_ID,
} from '@/lib/services/efficiencyMintBridge';
import type { WorkItemWithProjectMode } from '@/types/statements';

describe('Dual-Recipient Efficiency Mint Bridge Service', () => {
  describe('calculateItemEfficiencyYield', () => {
    it('strictly excludes personal_organizer items from all sovereign token minting', () => {
      const choreItem: WorkItemWithProjectMode = {
        id: 'chore-1',
        project_id: 'proj-personal',
        project_ledger_mode: 'personal_organizer',
        status: 'complete',
        metadata: {
          title: 'Wash dishes',
          commit_sha: 'fake_sha_should_still_be_ignored',
        },
      };

      const res = calculateItemEfficiencyYield(choreItem);
      expect(res.isEligibleForUpkeep).toBe(false);
      expect(res.isEligibleForBounty).toBe(false);
      expect(res.upkeepTokens).toBe(0);
      expect(res.bountyTokens).toBe(0);
      expect(res.reason).toContain('Personal organizer items are strictly excluded');
    });

    it('rejects incompleted items from minting', () => {
      const openItem: WorkItemWithProjectMode = {
        id: 'open-1',
        project_id: 'proj-prod',
        project_ledger_mode: 'standard_workspace',
        status: 'in_progress',
        metadata: { commit_sha: 'abc1234' },
      };

      const res = calculateItemEfficiencyYield(openItem);
      expect(res.isEligibleForUpkeep).toBe(false);
      expect(res.isEligibleForBounty).toBe(false);
      expect(res.upkeepTokens).toBe(0);
      expect(res.bountyTokens).toBe(0);
      expect(res.reason).toBe('Work item is not in completed status.');
    });

    it('awards Upkeep stream (3,000 tokens) but blocks Bounty stream when artifact proof is missing', () => {
      const unverifiedItem: WorkItemWithProjectMode = {
        id: 'task-no-proof',
        project_id: 'proj-prod',
        project_ledger_mode: 'standard_workspace',
        status: 'complete',
        metadata: { notes: 'manual checkbox done' },
      };

      const res = calculateItemEfficiencyYield(unverifiedItem);
      // Upkeep stream: 0.05 hrs * 60,000 tokens = 3,000 tokens
      expect(res.isEligibleForUpkeep).toBe(true);
      expect(res.upkeepHours).toBe(TRIAGE_UPKEEP_HOURS_PER_ITEM);
      expect(res.upkeepTokens).toBe(3000);

      // Bounty stream: blocked without proof
      expect(res.isEligibleForBounty).toBe(false);
      expect(res.bountyHours).toBe(0);
      expect(res.bountyTokens).toBe(0);
      expect(res.hasArtifactProof).toBe(false);
      expect(res.reason).toContain('Artifact proof');
    });

    it('awards both Upkeep (3,000 tokens) and Personal Bounty (12,000 tokens baseline) for verified artifact items', () => {
      const verifiedItem: WorkItemWithProjectMode = {
        id: 'task-verified',
        project_id: 'proj-prod',
        project_ledger_mode: 'audited_production',
        status: 'done',
        metadata: {
          commit_sha: 'commit-fedcba0987654321',
        },
      };

      const res = calculateItemEfficiencyYield(verifiedItem);
      expect(res.isEligibleForUpkeep).toBe(true);
      expect(res.isEligibleForBounty).toBe(true);
      expect(res.hasArtifactProof).toBe(true);
      expect(res.proofType).toBe('commit_sha');
      expect(res.proofRef).toBe('commit-fedcba0987654321');

      // Upkeep: 3,000 tokens (0.05 hrs)
      expect(res.upkeepTokens).toBe(3000);

      // Bounty: 12,000 tokens (0.20 hrs baseline)
      expect(res.bountyHours).toBe(AUTONOMOUS_BOUNTY_HOURS_PER_ITEM);
      expect(res.bountyTokens).toBe(12000);
      expect(res.neglectMultiplier).toBe(1.0);
    });

    it('multiplies Personal Bounty tokens by neglect_multiplier M_neglect', () => {
      const agedItem: WorkItemWithProjectMode = {
        id: 'task-aged',
        project_id: 'proj-prod',
        project_ledger_mode: 'audited_production',
        status: 'complete',
        metadata: {
          pr_url: 'https://github.com/org/repo/pull/123',
          neglect_multiplier: 1.5,
        },
      };

      const res = calculateItemEfficiencyYield(agedItem);
      expect(res.isEligibleForBounty).toBe(true);
      expect(res.neglectMultiplier).toBe(1.5);

      // Upkeep stays at 3,000
      expect(res.upkeepTokens).toBe(3000);

      // Bounty scaled: 12,000 * 1.5 = 18,000 tokens
      expect(res.bountyTokens).toBe(18000);
    });
  });

  describe('calculateTenantEfficiencyMintSummary', () => {
    it('aggregates dual-stream tokens accurately across mixed batches', () => {
      const items: WorkItemWithProjectMode[] = [
        // Personal chore (0 tokens)
        {
          id: 'chore-1',
          project_id: 'p-personal',
          project_ledger_mode: 'personal_organizer',
          status: 'complete',
        },
        // Unverified completed item (3,000 upkeep, 0 bounty)
        {
          id: 'task-1',
          project_id: 'p-standard',
          project_ledger_mode: 'standard_workspace',
          status: 'complete',
          metadata: {},
        },
        // Verified completed item with commit (3,000 upkeep, 12,000 bounty)
        {
          id: 'task-2',
          project_id: 'p-standard',
          project_ledger_mode: 'standard_workspace',
          status: 'complete',
          metadata: { commit_sha: 'sha-123' },
        },
        // Verified completed item with PR and 2.0x neglect multiplier (3,000 upkeep, 24,000 bounty)
        {
          id: 'task-3',
          project_id: 'p-audited',
          project_ledger_mode: 'audited_production',
          status: 'complete',
          metadata: { pr_url: 'https://gh/pull/99', neglect_multiplier: 2.0 },
        },
      ];

      const summary = calculateTenantEfficiencyMintSummary(items);
      expect(summary.eligibleItemsCount).toBe(3);
      // Upkeep: 3 eligible items * 3,000 = 9,000 tokens
      expect(summary.totalUpkeepTokens).toBe(9000);
      // Bounty: 0 + 12,000 + 24,000 = 36,000 tokens
      expect(summary.totalBountyTokens).toBe(36000);
      expect(summary.totalMintedTokens).toBe(45000);
      expect(summary.ecosystemPoolAddress).toBe(SYSTEM_ECOSYSTEM_POOL_USER_ID);
    });
  });

  describe('attestAndMintEfficiencyYield RPC bridge', () => {
    it('skips RPC call when item is completely ineligible', async () => {
      const mockClient = { rpc: vi.fn() };
      const choreItem: WorkItemWithProjectMode = {
        id: 'chore-skip',
        project_id: 'p-personal',
        project_ledger_mode: 'personal_organizer',
        status: 'complete',
      };

      const res = await attestAndMintEfficiencyYield(mockClient, choreItem);
      expect(res.status).toBe('skipped');
      expect(mockClient.rpc).not.toHaveBeenCalled();
    });

    it('invokes attest_and_mint_efficiency_yield RPC with exact parameter mapping for verified item', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: {
          status: 'attested',
          attestation: {
            id: 'attestation-uuid-1',
            work_item_id: 'item-uuid-1',
            upkeep_tokens_minted: 3000,
            bounty_tokens_minted: 12000,
          },
        },
        error: null,
      });
      const mockClient = { rpc: mockRpc };

      const verifiedItem: WorkItemWithProjectMode = {
        id: 'item-uuid-1',
        tenant_id: 'tenant-uuid-1',
        project_id: 'project-uuid-1',
        project_ledger_mode: 'audited_production',
        status: 'complete',
        assignee: 'tympollack',
        assignee_id: 'user-uuid-99',
        metadata: {
          commit_sha: 'commit-abcdef123456',
        },
      };

      const res = await attestAndMintEfficiencyYield(mockClient, verifiedItem);
      expect(mockRpc).toHaveBeenCalledTimes(1);
      const [rpcName, rpcPayload] = mockRpc.mock.calls[0];

      expect(rpcName).toBe('attest_and_mint_efficiency_yield');
      expect(rpcPayload.p_work_item_id).toBe('item-uuid-1');
      expect(rpcPayload.p_tenant_id).toBe('tenant-uuid-1');
      expect(rpcPayload.p_project_id).toBe('project-uuid-1');
      expect(rpcPayload.p_assignee).toBe('tympollack');
      expect(rpcPayload.p_recipient_user_id).toBe('user-uuid-99');
      expect(rpcPayload.p_upkeep_hours).toBe(0.05);
      expect(rpcPayload.p_bounty_hours).toBe(0.20);
      expect(rpcPayload.p_neglect_multiplier).toBe(1.0);
      expect(rpcPayload.p_artifact_type).toBe('commit_sha');
      expect(rpcPayload.p_artifact_ref).toBe('commit-abcdef123456');

      expect(res.status).toBe('attested');
      expect(res.attestation?.id).toBe('attestation-uuid-1');
    });

    it('throws error when RPC returns database error', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Unique violation on work_item_id' },
      });
      const mockClient = { rpc: mockRpc };

      const item: WorkItemWithProjectMode = {
        id: 'item-fail',
        project_id: 'p-1',
        project_ledger_mode: 'standard_workspace',
        status: 'complete',
        metadata: { commit_sha: 'sha-abc' },
      };

      await expect(attestAndMintEfficiencyYield(mockClient, item)).rejects.toThrow(
        'RPC attest_and_mint_efficiency_yield failed: Unique violation on work_item_id'
      );
    });
  });
});
