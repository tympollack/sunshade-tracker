import { describe, it, expect, vi } from 'vitest';
import {
  calculateItemEfficiencyYield,
  calculateTenantEfficiencyMintSummary,
  attestAndMintEfficiencyYield,
  calculateAttributedPatronage,
  mintTokensFromEfficiencyStatement,
  recordArtifactTelemetry,
  TOKEN_PER_HOUR,
  TRIAGE_UPKEEP_HOURS_PER_ITEM,
  AUTONOMOUS_BOUNTY_HOURS_PER_ITEM,
  SYSTEM_ECOSYSTEM_POOL_USER_ID,
  SYSTEM_ECOSYSTEM_POOL_WALLET_ID,
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
        metadata: { commit_sha: 'commit-abcdef123456' },
      };

      await expect(attestAndMintEfficiencyYield(mockClient, item)).rejects.toThrow(
        'RPC attest_and_mint_efficiency_yield failed: Unique violation on work_item_id'
      );
    });

    it('clamps neglect_multiplier between 1.0 and 3.0 to prevent bounty inflation', () => {
      const inflatedItem: WorkItemWithProjectMode = {
        id: 'item-inflated',
        project_id: 'p-1',
        project_ledger_mode: 'standard_workspace',
        status: 'complete',
        metadata: {
          commit_sha: 'commit-abcdef123456',
          neglect_multiplier: 999.0, // Attempted 999x inflation
        },
      };

      const res = calculateItemEfficiencyYield(inflatedItem);
      expect(res.neglectMultiplier).toBe(3.0);
      expect(res.bountyTokens).toBe(36000); // 0.20 hrs * 60,000 * 3.0
    });

    it('locks authoritative IDs strictly to the verified item, ignoring caller override attempts', async () => {
      const mockRpc = vi.fn().mockResolvedValue({
        data: { status: 'attested', attestation: { id: 'att-1' } },
        error: null,
      });
      const mockClient = { rpc: mockRpc };

      const item: WorkItemWithProjectMode = {
        id: 'real-item-id',
        tenant_id: 'real-tenant-id',
        project_id: 'real-project-id',
        project_ledger_mode: 'standard_workspace',
        status: 'complete',
        assignee: 'real-runner',
        assignee_id: 'real-user-id',
        metadata: { commit_sha: 'commit-abcdef123456' },
      };

      // Attacker passes params attempting to redirect mint to evil IDs
      await attestAndMintEfficiencyYield(mockClient, item, {
        workItemId: 'evil-work-item-id',
        tenantId: 'evil-tenant-id',
        recipientUserId: 'evil-user-id',
        assignee: 'evil-runner',
      } as any);

      expect(mockRpc).toHaveBeenCalledTimes(1);
      const [, rpcPayload] = mockRpc.mock.calls[0];

      expect(rpcPayload.p_work_item_id).toBe('real-item-id');
      expect(rpcPayload.p_tenant_id).toBe('real-tenant-id');
      expect(rpcPayload.p_project_id).toBe('real-project-id');
      expect(rpcPayload.p_assignee).toBe('real-runner');
      expect(rpcPayload.p_recipient_user_id).toBe('real-user-id');
    });
  });

  describe('TASK-TRK-EFFICIENCY-MINT-BRIDGE: Usage-Attenuated Relevance Curve & Pool Minting', () => {
    it('computes high initial attribution at cumulativeUses=0, tapers to 10-100 $SHT at 10000, and returns 0 when survivalRatio=0 or invocations=0', () => {
      const initial = calculateAttributedPatronage({ cumulativeUses: 0, survivalRatio: 1.0 });
      expect(initial).toBe(2500);
      expect(initial).toBeGreaterThanOrEqual(1000);
      expect(initial).toBeLessThanOrEqual(2500);

      const mature = calculateAttributedPatronage({ cumulativeUses: 10000, survivalRatio: 1.0 });
      expect(mature).toBeGreaterThanOrEqual(10);
      expect(mature).toBeLessThanOrEqual(100);
      expect(mature).toBe(93);

      expect(calculateAttributedPatronage({ cumulativeUses: 5, survivalRatio: 0 })).toBe(0);
      expect(calculateAttributedPatronage({ cumulativeUses: 5, survivalRatio: 1.0, invocations: 0 })).toBe(0);
    });

    it('deducts ai_usage_logs compute costs, mints 100% into SYSTEM_ECOSYSTEM_POOL, and stays idempotent on repeat runs', async () => {
      const attestations: any[] = [];
      const ledgerRows: any[] = [];
      const artifact = {
        artifact_ref_id: 'TOOL-GH-TRACKER',
        builder_user_id: 'tympollack',
        cumulative_uses: 0,
        survival_ratio: 1.0,
      };

      const buildMockClient = () => {
        const makeTable = (table: string) => {
          if (table === 'ai_usage_logs') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn(() => ({
                  eq: vi.fn().mockResolvedValue({
                    data: [{ compute_cost_usd: 25 }],
                    error: null,
                  }),
                })),
              })),
            };
          }
          if (table === 'efficiency_mint_attestations') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn((col: string, val: string) => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: attestations.find((a) => a[col] === val) || null,
                    error: null,
                  }),
                })),
              })),
              insert: vi.fn((row: any) => {
                const duplicate = attestations.some(
                  (a) =>
                    (row.work_item_id && a.work_item_id === row.work_item_id) ||
                    (row.checkpoint_hash && a.checkpoint_hash === row.checkpoint_hash)
                );
                const result = duplicate
                  ? { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint' } }
                  : (() => {
                      const saved = { id: `att-${attestations.length + 1}`, ...row };
                      attestations.push(saved);
                      return { data: saved, error: null };
                    })();
                return {
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue(result),
                  })),
                };
              }),
            };
          }
          if (table === 'infrastructure_artifacts') {
            return {
              select: vi.fn(() => ({
                eq: vi.fn((_col: string, val: string) => ({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: val === artifact.artifact_ref_id ? { ...artifact } : null,
                    error: null,
                  }),
                })),
              })),
              update: vi.fn((patch: any) => ({
                eq: vi.fn((_col: string, val: string) => {
                  if (val === artifact.artifact_ref_id) {
                    artifact.cumulative_uses = patch.cumulative_uses;
                  }
                  return Promise.resolve({ data: { ...artifact }, error: null });
                }),
              })),
            };
          }
          if (table === 'hub_tokens_ledger') {
            return {
              insert: vi.fn((row: any) => {
                const saved = { id: `ledger-${ledgerRows.length + 1}`, ...row };
                ledgerRows.push(saved);
                return {
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({ data: saved, error: null }),
                  })),
                };
              }),
            };
          }
          return {};
        };

        return {
          schema: vi.fn(() => ({
            from: vi.fn(makeTable),
          })),
          from: vi.fn(makeTable),
        };
      };

      const mockClient = buildMockClient();

      // First run: gross $125 - $25 compute = $100 net => (100/125) * 60,000 = 48,000 tokens
      const first = await mintTokensFromEfficiencyStatement(mockClient, {
        tenantId: 'tenant-1',
        workItemId: 'item-uuid-100',
        projectId: 'proj-1',
        grossRealizedValueUsd: 125,
        artifactRefId: 'TOOL-GH-TRACKER',
      });

      expect(first.status).toBe('attested');
      expect(first.computeCostDeductedUsd).toBe(25);
      expect(first.netRealizedValueUsd).toBe(100);
      expect(first.mintedTokens).toBe(48000);
      expect(first.walletId).toBe(SYSTEM_ECOSYSTEM_POOL_WALLET_ID);
      expect(first.attributedBuilderId).toBe('tympollack');
      expect(first.patronageCreditAwarded).toBe(2500);
      expect(artifact.cumulative_uses).toBe(1);

      expect(ledgerRows).toHaveLength(1);
      expect(ledgerRows[0].user_id).toBe(SYSTEM_ECOSYSTEM_POOL_USER_ID);
      expect(ledgerRows[0].transaction_type).toBe('ECOSYSTEM_UPKEEP_MINT');
      expect(ledgerRows[0].amount).toBe(48000);
      expect(ledgerRows[0].metadata.wallet_id).toBe('SYSTEM_ECOSYSTEM_POOL');
      expect(ledgerRows[0].metadata.attributed_builder_id).toBe('tympollack');
      expect(ledgerRows[0].metadata.artifact_ref_id).toBe('TOOL-GH-TRACKER');
      expect(ledgerRows[0].metadata.patronage_credit_awarded).toBe(2500);
      expect(ledgerRows[0].metadata.survival_ratio).toBe(1.0);

      // Second run on the exact same completed item must be idempotent (zero duplicate mints)
      const second = await mintTokensFromEfficiencyStatement(mockClient, {
        tenantId: 'tenant-1',
        workItemId: 'item-uuid-100',
        projectId: 'proj-1',
        grossRealizedValueUsd: 125,
        artifactRefId: 'TOOL-GH-TRACKER',
      });

      expect(second.status).toBe('already_attested');
      expect(second.mintedTokens).toBe(0);
      expect(ledgerRows).toHaveLength(1);
      expect(artifact.cumulative_uses).toBe(1);
    });

    it('skips minting when ai_usage_logs compute costs exceed gross realized value', async () => {
      const makeTable = (table: string) => {
        if (table === 'ai_usage_logs') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({
                  data: [{ compute_cost_usd: 150 }],
                  error: null,
                }),
              })),
            })),
          };
        }
        return {};
      };

      const mockClient = {
        schema: vi.fn(() => ({ from: vi.fn(makeTable) })),
        from: vi.fn(makeTable),
      };

      const res = await mintTokensFromEfficiencyStatement(mockClient, {
        tenantId: 'tenant-1',
        workItemId: 'item-over-budget',
        grossRealizedValueUsd: 125,
      });

      expect(res.status).toBe('skipped');
      expect(res.netRealizedValueUsd).toBe(0);
      expect(res.mintedTokens).toBe(0);
    });

    it('recordArtifactTelemetry records pool upkeep mint and patronage credit for artifact sync', async () => {
      const ledgerRows: any[] = [];
      const attestations: any[] = [];
      const makeTable = (table: string) => {
        if (table === 'ai_usage_logs') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          };
        }
        if (table === 'efficiency_mint_attestations') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              })),
            })),
            insert: vi.fn((row: any) => {
              attestations.push(row);
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: row, error: null }),
                })),
              };
            }),
          };
        }
        if (table === 'infrastructure_artifacts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    artifact_ref_id: 'TOOL-GH-TRACKER',
                    builder_user_id: 'tympollack',
                    cumulative_uses: 10000,
                    survival_ratio: 1.0,
                  },
                  error: null,
                }),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: {}, error: null }),
            })),
          };
        }
        if (table === 'hub_tokens_ledger') {
          return {
            insert: vi.fn((row: any) => {
              ledgerRows.push(row);
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: row, error: null }),
                })),
              };
            }),
          };
        }
        return {};
      };

      const mockClient = {
        schema: vi.fn(() => ({ from: vi.fn(makeTable) })),
        from: vi.fn(makeTable),
      };

      const res = await recordArtifactTelemetry('TOOL-GH-TRACKER', 'item-sync-1', {
        supabaseClient: mockClient,
        tenantId: 'tenant-1',
      });

      expect(res?.status).toBe('attested');
      expect(res?.mintedTokens).toBe(3000);
      expect(res?.patronageCreditAwarded).toBe(93);
      expect(ledgerRows[0].user_id).toBe(SYSTEM_ECOSYSTEM_POOL_USER_ID);
      expect(ledgerRows[0].metadata.attributed_builder_id).toBe('tympollack');
    });

    it('fails closed when ai_usage_logs lookup returns a database error', async () => {
      const makeTable = (table: string) => {
        if (table === 'ai_usage_logs') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({
                  data: null,
                  error: { message: 'connection timeout' },
                }),
              })),
            })),
          };
        }
        return {};
      };

      const mockClient = {
        schema: vi.fn(() => ({ from: vi.fn(makeTable) })),
        from: vi.fn(makeTable),
      };

      await expect(
        mintTokensFromEfficiencyStatement(mockClient, {
          tenantId: 'tenant-1',
          workItemId: 'item-err-1',
          grossRealizedValueUsd: 125,
        })
      ).rejects.toThrow('Failed to query ai_usage_logs compute costs: connection timeout');
    });

    it('rolls back attestation and artifact increment if hub_tokens_ledger insert fails so retry succeeds', async () => {
      const attestations: any[] = [];
      const ledgerRows: any[] = [];
      const artifact = {
        artifact_ref_id: 'TOOL-GH-TRACKER',
        builder_user_id: 'tympollack',
        cumulative_uses: 0,
        survival_ratio: 1.0,
      };
      let failLedgerOnce = true;

      const makeTable = (table: string) => {
        if (table === 'ai_usage_logs') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          };
        }
        if (table === 'efficiency_mint_attestations') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string, val: string) => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: attestations.find((a) => a[col] === val) || null,
                  error: null,
                }),
              })),
            })),
            insert: vi.fn((row: any) => {
              const saved = { id: `att-${attestations.length + 1}`, ...row };
              attestations.push(saved);
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: saved, error: null }),
                })),
              };
            }),
            delete: vi.fn(() => ({
              eq: vi.fn((col: string, val: string) => {
                const idx = attestations.findIndex((a) => a[col] === val);
                if (idx >= 0) attestations.splice(idx, 1);
                return Promise.resolve({ error: null });
              }),
            })),
          };
        }
        if (table === 'infrastructure_artifacts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { ...artifact }, error: null }),
              })),
            })),
            update: vi.fn((patch: any) => ({
              eq: vi.fn(() => {
                artifact.cumulative_uses = patch.cumulative_uses;
                return Promise.resolve({ data: { ...artifact }, error: null });
              }),
            })),
          };
        }
        if (table === 'hub_tokens_ledger') {
          return {
            insert: vi.fn((row: any) => {
              if (failLedgerOnce) {
                failLedgerOnce = false;
                return {
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({
                      data: null,
                      error: { message: 'ledger write transient error' },
                    }),
                  })),
                };
              }
              ledgerRows.push(row);
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: row, error: null }),
                })),
              };
            }),
          };
        }
        return {};
      };

      const mockClient = {
        schema: vi.fn(() => ({ from: vi.fn(makeTable) })),
        from: vi.fn(makeTable),
      };

      await expect(
        mintTokensFromEfficiencyStatement(mockClient, {
          tenantId: 'tenant-1',
          workItemId: 'item-rollback-1',
          checkpointHash: 'cp-rollback-1',
          grossRealizedValueUsd: 125,
          artifactRefId: 'TOOL-GH-TRACKER',
        })
      ).rejects.toThrow('Failed to mint upkeep tokens to hub_tokens_ledger');

      expect(attestations).toHaveLength(0);
      expect(artifact.cumulative_uses).toBe(0);

      // Retry succeeds cleanly
      const retry = await mintTokensFromEfficiencyStatement(mockClient, {
        tenantId: 'tenant-1',
        workItemId: 'item-rollback-1',
        checkpointHash: 'cp-rollback-1',
        grossRealizedValueUsd: 125,
        artifactRefId: 'TOOL-GH-TRACKER',
      });
      expect(retry.status).toBe('attested');
      expect(ledgerRows).toHaveLength(1);
      expect(artifact.cumulative_uses).toBe(1);
    });

    it('credits subsequent distinct checkpoints on the same workItemId while rejecting exact checkpoint replays', async () => {
      const attestations: any[] = [];
      const ledgerRows: any[] = [];
      const artifact = {
        artifact_ref_id: 'TOOL-GH-TRACKER',
        builder_user_id: 'tympollack',
        cumulative_uses: 0,
        survival_ratio: 1.0,
      };

      const makeTable = (table: string) => {
        if (table === 'ai_usage_logs') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          };
        }
        if (table === 'efficiency_mint_attestations') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((col: string, val: string) => ({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: attestations.find((a) => a[col] === val) || null,
                  error: null,
                }),
              })),
            })),
            insert: vi.fn((row: any) => {
              const saved = { id: `att-${attestations.length + 1}`, ...row };
              attestations.push(saved);
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: saved, error: null }),
                })),
              };
            }),
          };
        }
        if (table === 'infrastructure_artifacts') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                maybeSingle: vi.fn().mockResolvedValue({ data: { ...artifact }, error: null }),
              })),
            })),
            update: vi.fn((patch: any) => ({
              eq: vi.fn(() => {
                artifact.cumulative_uses = patch.cumulative_uses;
                return Promise.resolve({ data: { ...artifact }, error: null });
              }),
            })),
          };
        }
        if (table === 'hub_tokens_ledger') {
          return {
            insert: vi.fn((row: any) => {
              ledgerRows.push(row);
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: row, error: null }),
                })),
              };
            }),
          };
        }
        return {};
      };

      const mockClient = {
        schema: vi.fn(() => ({ from: vi.fn(makeTable) })),
        from: vi.fn(makeTable),
      };

      const commitA = await recordArtifactTelemetry('TOOL-GH-TRACKER', 'item-multi-sync', {
        supabaseClient: mockClient,
        tenantId: 'tenant-1',
        checkpointHash: 'telemetry:TOOL-GH-TRACKER:item-multi-sync:pr1:shaA',
      });
      const commitB = await recordArtifactTelemetry('TOOL-GH-TRACKER', 'item-multi-sync', {
        supabaseClient: mockClient,
        tenantId: 'tenant-1',
        checkpointHash: 'telemetry:TOOL-GH-TRACKER:item-multi-sync:pr1:shaB',
      });
      const replayB = await recordArtifactTelemetry('TOOL-GH-TRACKER', 'item-multi-sync', {
        supabaseClient: mockClient,
        tenantId: 'tenant-1',
        checkpointHash: 'telemetry:TOOL-GH-TRACKER:item-multi-sync:pr1:shaB',
      });

      expect(commitA?.status).toBe('attested');
      expect(commitA?.patronageCreditAwarded).toBe(2500);
      expect(commitB?.status).toBe('attested');
      expect(commitB?.patronageCreditAwarded).toBe(850);
      expect(replayB?.status).toBe('already_attested');
      expect(ledgerRows).toHaveLength(2);
      expect(artifact.cumulative_uses).toBe(2);
    });
  });
});
