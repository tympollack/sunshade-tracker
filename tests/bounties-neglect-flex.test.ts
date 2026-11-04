import { describe, it, expect, vi } from 'vitest';
import {
  calculateNeglectMultiplier,
  calculateBountyPricing,
  calculateDaysDormant,
  enrichItemWithNeglectPricing,
  TOKEN_RATE_PER_HOUR,
  SOVEREIGN_WEEKLY_HOURS_CAP,
  SOVEREIGN_WEEKLY_TOKEN_CAP,
  MAX_NEGLECT_MULTIPLIER,
} from '@/lib/bounties/neglectPricing';
import {
  getCalendarWeekRange,
  validateWeeklyBountyClaim,
  computeUserWeeklyUtilization,
  getItemTokenCommitment,
  assertRunnerWeeklyCapacity,
} from '@/lib/bounties/flexLedgerService';

describe('TASK-TRK-NEGLECT-YIELD-PRICING: Neglect Multiplier & Yield Pricing', () => {
  it('verifies sovereign token calibrations (20 hrs = 1.2M tokens, 60k tokens/hr, 1k tokens/min)', () => {
    expect(TOKEN_RATE_PER_HOUR).toBe(60000);
    expect(SOVEREIGN_WEEKLY_HOURS_CAP).toBe(20);
    expect(SOVEREIGN_WEEKLY_TOKEN_CAP).toBe(1200000);
    expect(TOKEN_RATE_PER_HOUR / 60).toBe(1000); // 1,000 tokens/min
  });

  describe('calculateNeglectMultiplier formula', () => {
    it('returns baseline 1.0x for fresh items (0 days dormant)', () => {
      expect(calculateNeglectMultiplier(0, 'medium')).toBe(1.0);
      expect(calculateNeglectMultiplier(0, 'critical')).toBe(1.0);
    });

    it('scales linearly for medium priority (weight = 1.0)', () => {
      // 15 days / 30 * 1.0 = +0.5 -> 1.5x
      expect(calculateNeglectMultiplier(15, 'medium')).toBe(1.5);
      // 30 days / 30 * 1.0 = +1.0 -> 2.0x
      expect(calculateNeglectMultiplier(30, 'medium')).toBe(2.0);
    });

    it('accelerates for critical priority (weight = 1.5)', () => {
      // 10 days / 30 * 1.5 = +0.5 -> 1.5x
      expect(calculateNeglectMultiplier(10, 'critical')).toBe(1.5);
      // 20 days / 30 * 1.5 = +1.0 -> 2.0x
      expect(calculateNeglectMultiplier(20, 'critical')).toBe(2.0);
    });

    it('decelerates for low priority (weight = 0.5)', () => {
      // 30 days / 30 * 0.5 = +0.5 -> 1.5x
      expect(calculateNeglectMultiplier(30, 'low')).toBe(1.5);
      // 60 days / 30 * 0.5 = +1.0 -> 2.0x
      expect(calculateNeglectMultiplier(60, 'low')).toBe(2.0);
    });

    it('enforces hard cap at MAX_NEGLECT_MULTIPLIER (2.0x)', () => {
      expect(calculateNeglectMultiplier(100, 'critical')).toBe(MAX_NEGLECT_MULTIPLIER);
      expect(calculateNeglectMultiplier(365, 'medium')).toBe(2.0);
    });
  });

  describe('calculateBountyPricing', () => {
    it('calculates base and dynamic tokens for 2-hour task with 1.5x neglect', () => {
      const refNow = new Date('2026-11-01T12:00:00Z');
      const lastActivity = new Date('2026-10-17T12:00:00Z'); // 15 days dormant

      const pricing = calculateBountyPricing({
        estimatedHours: 2.0,
        priority: 'medium',
        lastActivityDate: lastActivity,
        referenceNow: refNow,
      });

      expect(pricing.daysDormant).toBe(15);
      expect(pricing.neglectMultiplier).toBe(1.5);
      expect(pricing.baseTokens).toBe(120000); // 2 hrs * 60,000
      expect(pricing.dynamicBountyTokens).toBe(180000); // 120,000 * 1.5
      expect(pricing.formattedRewardLabel).toBe('180,000 Tokens (1.50x Neglect Yield)');
    });

    it('defaults to 1.0 hour if estimatedHours is omitted or 0', () => {
      const pricing = calculateBountyPricing({
        estimatedHours: null,
        priority: 'high',
        lastActivityDate: null,
      });

      expect(pricing.estimatedHours).toBe(1.0);
      expect(pricing.baseTokens).toBe(60000);
      expect(pricing.neglectMultiplier).toBe(1.0);
      expect(pricing.dynamicBountyTokens).toBe(60000);
      expect(pricing.formattedRewardLabel).toBe('60,000 Tokens');
    });
  });

  describe('enrichItemWithNeglectPricing', () => {
    it('attaches neglect multiplier and token amounts into metadata', () => {
      const item = {
        id: 'task-100',
        title: 'Fix auth memory leak',
        priority: 'critical',
        created_at: '2026-10-21T00:00:00Z',
        metadata: {
          estimated_hours: 1.5,
        },
      };
      const refNow = new Date('2026-10-31T00:00:00Z'); // 10 days dormant

      const enriched = enrichItemWithNeglectPricing(item, refNow);
      expect(enriched.metadata.neglect_multiplier).toBe(1.5);
      expect(enriched.metadata.days_dormant).toBe(10);
      expect(enriched.metadata.base_tokens).toBe(90000); // 1.5 * 60,000
      expect(enriched.metadata.dynamic_tokens).toBe(135000); // 90,000 * 1.5
      expect(enriched.metadata.bounty_active).toBe(true);
    });
  });
});

describe('TASK-TRK-20HR-FLEX-LEDGER: 20-Hour Weekly Sovereign Capacity Ledger', () => {
  it('correctly derives Monday 00:00:00 UTC to Sunday 23:59:59.999 UTC window', () => {
    // Wednesday Nov 4, 2026
    const wednesday = new Date(Date.UTC(2026, 10, 4, 15, 30, 0));
    const range = getCalendarWeekRange(wednesday);

    expect(range.startOfWeek.getUTCDay()).toBe(1); // Monday
    expect(range.startOfWeek.getUTCHours()).toBe(0);
    expect(range.startOfWeek.getUTCMinutes()).toBe(0);
    expect(range.startOfWeek.getUTCDate()).toBe(2); // Nov 2, 2026 is Monday

    expect(range.endOfWeek.getUTCDay()).toBe(0); // Sunday
    expect(range.endOfWeek.getUTCDate()).toBe(8); // Nov 8, 2026 is Sunday
    expect(range.endOfWeek.getUTCHours()).toBe(23);
    expect(range.endOfWeek.getUTCMinutes()).toBe(59);

    // Year-end week boundary: Dec 30, 2024 is part of 2025-W01
    const yearEndMonday = new Date(Date.UTC(2024, 11, 30, 10, 0, 0));
    const yearEndRange = getCalendarWeekRange(yearEndMonday);
    expect(yearEndRange.isoWeekLabel).toBe('2025-W01');
  });

  it('allows claiming bounty when projected utilization is within 1,200,000 tokens (20 hrs)', () => {
    // Current utilization: 10 hrs = 600,000 tokens
    // Candidate bounty: 5 hrs = 300,000 tokens
    // Projected: 15 hrs = 900,000 tokens <= 1,200,000 tokens
    const res = validateWeeklyBountyClaim({
      candidateBountyTokens: 300000,
      currentWeeklyTokens: 600000,
    });

    expect(res.allowed).toBe(true);
    expect(res.weeklyTokensCap).toBe(1200000);
    expect(res.weeklyHoursCap).toBe(20);
    expect(res.currentWeeklyHours).toBe(10.0);
    expect(res.candidateBountyHours).toBe(5.0);
    expect(res.projectedHours).toBe(15.0);
    expect(res.remainingTokens).toBe(300000);
    expect(res.remainingHours).toBe(5.0);
    expect(res.tokensExceeded).toBe(0);
  });

  it('rejects claiming bounty when projected tokens exceed 1,200,000 tokens ceiling', () => {
    // Current utilization: 18 hrs = 1,080,000 tokens
    // Candidate bounty: 4 hrs = 240,000 tokens
    // Projected: 22 hrs = 1,320,000 tokens > 1,200,000 tokens
    const res = validateWeeklyBountyClaim({
      candidateBountyTokens: 240000,
      currentWeeklyTokens: 1080000,
    });

    expect(res.allowed).toBe(false);
    expect(res.tokensExceeded).toBe(120000);
    expect(res.projectedHours).toBe(22.0);
    expect(res.reason).toContain('exceeds your 20-hour weekly sovereign capacity (1,200,000 tokens/week)');
  });

  it('permits claiming over-limit bounty when adminOverride is true while preserving tokensExceeded', () => {
    const res = validateWeeklyBountyClaim({
      candidateBountyTokens: 300000,
      currentWeeklyTokens: 1100000,
      adminOverride: true,
    });

    expect(res.allowed).toBe(true);
    expect(res.projectedTokens).toBe(1400000);
    expect(res.tokensExceeded).toBe(200000); // 1,400,000 - 1,200,000
  });

  it('computes token commitment accurately from bounty_hours as well as estimated_hours', () => {
    const itemWithBountyHours = {
      metadata: {
        bounty_hours: 4.0,
        neglect_multiplier: 1.0,
      },
    };
    expect(getItemTokenCommitment(itemWithBountyHours)).toBe(240000); // 4 hrs * 60,000

    const itemWithBountyHoursAndNeglect = {
      metadata: {
        bounty_hours: 2.0,
        neglect_multiplier: 1.5,
      },
    };
    expect(getItemTokenCommitment(itemWithBountyHoursAndNeglect)).toBe(180000); // 2 hrs * 60,000 * 1.5
  });

  it('computes total utilization from active/completed week items accurately', () => {
    const items = [
      { metadata: { dynamic_tokens: 120000 } }, // 2 hrs
      { metadata: { estimated_hours: 3.0, neglect_multiplier: 1.0 } }, // 3 hrs * 60,000 = 180,000
      { metadata: { bounty_hours: 1.5, neglect_multiplier: 1.0 } }, // 1.5 hrs * 60,000 = 90,000
      { metadata: {} }, // default 1 hr = 60,000
    ];

    const utilization = computeUserWeeklyUtilization(items);
    // Total tokens = 120,000 + 180,000 + 90,000 + 60,000 = 450,000
    expect(utilization.totalTokens).toBe(450000);
    expect(utilization.totalHours).toBe(7.5);
    expect(utilization.itemCount).toBe(4);
  });

  it('assertRunnerWeeklyCapacity checks runner commitments and blocks claim exceeding 20hr cap', async () => {
    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              neq: vi.fn().mockResolvedValue({
                data: [
                  // Runner holds 18 hours already this week = 1,080,000 tokens
                  {
                    id: 'existing-1',
                    updated_at: new Date().toISOString(),
                    metadata: { dynamic_tokens: 1080000 },
                  },
                ],
                error: null,
              }),
            })),
          })),
        })),
      })),
    };

    // Candidate is a 4-hour task = 240,000 tokens
    const candidateItem = {
      id: 'candidate-bounty-1',
      metadata: { bounty_hours: 4.0 },
    };

    const res = await assertRunnerWeeklyCapacity({
      supabaseClient: mockClient as any,
      tenantId: 'tenant-1',
      assignee: 'runner-tym',
      candidateItem,
    });

    expect(res.allowed).toBe(false);
    expect(res.tokensExceeded).toBe(120000); // 1,080,000 + 240,000 - 1,200,000
    expect(res.reason).toContain('exceeds your 20-hour weekly sovereign capacity');

    // With admin override
    const overrideRes = await assertRunnerWeeklyCapacity({
      supabaseClient: mockClient as any,
      tenantId: 'tenant-1',
      assignee: 'runner-tym',
      candidateItem,
      adminOverride: true,
    });
    expect(overrideRes.allowed).toBe(true);
    expect(overrideRes.tokensExceeded).toBe(120000);
  });

  it('counts long-running in_progress tasks claimed in previous weeks towards current weekly capacity', async () => {
    // Task started 10 days ago (prior week) without edits this week
    const tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              neq: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'long-running-claim-1',
                    status: 'in_progress',
                    created_at: tenDaysAgo,
                    updated_at: tenDaysAgo,
                    metadata: { bounty_hours: 18.0 },
                  },
                ],
                error: null,
              }),
            })),
          })),
        })),
      })),
    };

    const candidateItem = {
      id: 'candidate-bounty-2',
      metadata: { bounty_hours: 4.0 },
    };

    const res = await assertRunnerWeeklyCapacity({
      supabaseClient: mockClient as any,
      tenantId: 'tenant-1',
      assignee: 'runner-tym',
      candidateItem,
    });

    expect(res.allowed).toBe(false);
    expect(res.currentWeeklyHours).toBe(18.0);
    expect(res.tokensExceeded).toBe(120000);
  });

  it('does not count untouched old not_started backlog assigned in prior weeks towards current weekly capacity', async () => {
    // 20 unstarted cards assigned last month (30 days ago) without edits this week
    const lastMonth = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const oldBacklogItems = Array.from({ length: 20 }, (_, i) => ({
      id: `old-backlog-${i}`,
      status: 'not_started',
      created_at: lastMonth,
      updated_at: lastMonth,
      metadata: { estimated_hours: 1.0 },
    }));

    const mockClient = {
      from: vi.fn(() => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            eq: vi.fn(() => ({
              neq: vi.fn().mockResolvedValue({
                data: oldBacklogItems,
                error: null,
              }),
            })),
          })),
        })),
      })),
    };

    const candidateItem = {
      id: 'candidate-bounty-3',
      metadata: { bounty_hours: 1.0 },
    };

    const res = await assertRunnerWeeklyCapacity({
      supabaseClient: mockClient as any,
      tenantId: 'tenant-1',
      assignee: 'runner-tym',
      candidateItem,
    });

    // Old unstarted backlog should NOT count, so currentWeeklyHours is 0 and 1hr claim is allowed
    expect(res.allowed).toBe(true);
    expect(res.currentWeeklyHours).toBe(0);
    expect(res.projectedHours).toBe(1.0);
  });
});
