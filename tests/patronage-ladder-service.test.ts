import { describe, it, expect, vi } from 'vitest';
import {
  PATRONAGE_LADDER_THRESHOLDS,
  DEFAULT_PATRON_BOOST_TOKENS,
  resolvePatronageLadderTier,
  canAttachDirectedPatronBoost,
  hasOversightStewardPrivilege,
  getBuilderPatronageStatus,
  applyDirectedPatronBoost,
} from '@/lib/services/patronageLadderService';
import { calculateBountyPricing } from '@/lib/bounties/neglectPricing';

describe('TASK-TRK-OVERSIGHT-LADDER-VIEW: Builder Patronage Summary, Directed Boost & Oversight Steward Gate', () => {
  it('resolves all four Oversight Graduation Ladder tiers accurately', () => {
    expect(resolvePatronageLadderTier(0)).toBe('leaf_contributor');
    expect(resolvePatronageLadderTier(299_999)).toBe('leaf_contributor');
    expect(resolvePatronageLadderTier(300_000)).toBe('force_multiplier');
    expect(resolvePatronageLadderTier(1_199_999)).toBe('force_multiplier');
    expect(resolvePatronageLadderTier(1_200_000)).toBe('bounty_patron');
    expect(resolvePatronageLadderTier(2_999_999)).toBe('bounty_patron');
    expect(resolvePatronageLadderTier(3_000_000)).toBe('oversight_steward');
  });

  it('unlocks bounty_patron at 1,200,000 credits and oversight_steward at 3,000,000 credits', () => {
    expect(canAttachDirectedPatronBoost(PATRONAGE_LADDER_THRESHOLDS.force_multiplier)).toBe(false);
    expect(canAttachDirectedPatronBoost(PATRONAGE_LADDER_THRESHOLDS.bounty_patron)).toBe(true);
    expect(hasOversightStewardPrivilege(PATRONAGE_LADDER_THRESHOLDS.bounty_patron)).toBe(false);
    expect(hasOversightStewardPrivilege(PATRONAGE_LADDER_THRESHOLDS.oversight_steward)).toBe(true);
  });

  it('computes unspent patronage boost allowance and ladder privileges in getBuilderPatronageStatus', async () => {
    const makeTable = (table: string) => {
      if (table === 'v_builder_patronage_summary') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  builder_user_id: 'tympollack',
                  total_patronage_credits: 1_230_000,
                  hours_sponsored: 20.5,
                  active_artifacts_count: 3,
                  ladder_tier: 'bounty_patron',
                },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === 'patronage_boost_allocations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({
                data: [
                  { boost_tokens: 15_000, status: 'reserved' },
                  { boost_tokens: 15_000, status: 'claimed' },
                ],
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

    const status = await getBuilderPatronageStatus('tympollack', mockClient);
    expect(status.builderUserId).toBe('tympollack');
    expect(status.totalPatronageCredits).toBe(1_230_000);
    expect(status.spentBoostCredits).toBe(30_000);
    expect(status.availablePatronageCredits).toBe(1_200_000);
    expect(status.hoursSponsored).toBe(20.5);
    expect(status.activeArtifactsCount).toBe(3);
    expect(status.ladderTier).toBe('bounty_patron');
    expect(status.canDirectPatronBoost).toBe(true);
    expect(status.isOversightSteward).toBe(false);
    expect(status.nextTier).toBe('oversight_steward');
    expect(status.creditsToNextTier).toBe(1_770_000);
  });

  it('resolves oversight_steward privilege at >= 3,000,000 credits', async () => {
    const makeTable = (table: string) => {
      if (table === 'v_builder_patronage_summary') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: {
                  builder_user_id: 'steward-1',
                  total_patronage_credits: 3_600_000,
                  hours_sponsored: 60.0,
                  active_artifacts_count: 5,
                  ladder_tier: 'oversight_steward',
                },
                error: null,
              }),
            })),
          })),
        };
      }
      if (table === 'patronage_boost_allocations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
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

    const status = await getBuilderPatronageStatus('steward-1', mockClient);
    expect(status.ladderTier).toBe('oversight_steward');
    expect(status.isOversightSteward).toBe(true);
    expect(status.canDirectPatronBoost).toBe(true);
    expect(status.nextTier).toBeNull();
    expect(status.creditsToNextTier).toBe(0);
  });

  it('attaches a 15,000 $SHT pool-backed directed boost to a not_started ticket and tracks remaining allowance', async () => {
    const workItem = {
      id: '11111111-1111-4111-8111-111111111111',
      status: 'not_started',
      metadata: {} as Record<string, any>,
    };
    const builderTotalCredits = 1_200_000;
    let spentCredits = 0;

    const mockRpc = vi.fn(async (fnName: string, args: any) => {
      expect(fnName).toBe('apply_directed_patron_boost');
      const available = builderTotalCredits - spentCredits;
      if (args.p_boost_tokens > available) {
        return {
          data: null,
          error: {
            message: `Insufficient unspent patronage boost allowance. Available: ${available}, Requested: ${args.p_boost_tokens}.`,
          },
        };
      }
      spentCredits += args.p_boost_tokens;
      workItem.metadata.patron_boost_tokens =
        (workItem.metadata.patron_boost_tokens || 0) + args.p_boost_tokens;
      return {
        data: {
          success: true,
          work_item_id: workItem.id,
          boost_tokens: args.p_boost_tokens,
          patron_boost_tokens: workItem.metadata.patron_boost_tokens,
          remaining_patronage_credits: builderTotalCredits - spentCredits,
          ladder_tier: 'bounty_patron',
          allocation: {
            id: 'alloc-1',
            builder_user_id: args.p_builder_id,
            boost_tokens: args.p_boost_tokens,
            status: 'reserved',
          },
        },
        error: null,
      };
    });

    const mockClient = {
      schema: vi.fn(() => ({ rpc: mockRpc })),
      rpc: mockRpc,
    };

    const res = await applyDirectedPatronBoost({
      builderId: 'tympollack',
      workItemId: workItem.id,
      boostTokens: DEFAULT_PATRON_BOOST_TOKENS,
      supabaseClient: mockClient,
    });

    expect(res.success).toBe(true);
    expect(res.boostTokens).toBe(15_000);
    expect(res.patronBoostTokens).toBe(15_000);
    expect(res.remainingPatronageCredits).toBe(1_185_000);
    expect(res.ladderTier).toBe('bounty_patron');
    expect(workItem.metadata.patron_boost_tokens).toBe(15_000);

    // Verify Bounty Calculator reflects the attached patron boost
    const pricing = calculateBountyPricing({
      estimatedHours: 1.0,
      priority: 'medium',
      patronBoostTokens: workItem.metadata.patron_boost_tokens,
    });
    expect(pricing.dynamicBountyTokens).toBe(75_000);
    expect(pricing.formattedRewardLabel).toContain('+15,000 Patron Boost');

    // Verify attempting to spend beyond remaining allowance fails cleanly
    await expect(
      applyDirectedPatronBoost({
        builderId: 'tympollack',
        workItemId: workItem.id,
        boostTokens: 1_190_000,
        supabaseClient: mockClient,
      })
    ).rejects.toThrow('Insufficient unspent patronage boost allowance');
  });
});
