import {
  SOVEREIGN_WEEKLY_TOKEN_CAP,
  SOVEREIGN_WEEKLY_HOURS_CAP,
  TOKEN_RATE_PER_HOUR,
} from './neglectPricing';

export interface CalendarWeekRange {
  startOfWeek: Date;
  endOfWeek: Date;
  isoWeekLabel: string;
}

export interface WeeklyCapacityValidationResult {
  allowed: boolean;
  weeklyTokensCap: number;
  weeklyHoursCap: number;
  currentWeeklyTokens: number;
  currentWeeklyHours: number;
  candidateBountyTokens: number;
  candidateBountyHours: number;
  projectedTokens: number;
  projectedHours: number;
  remainingTokens: number;
  remainingHours: number;
  tokensExceeded: number;
  reason?: string;
}

/**
 * Derives the ISO calendar week range (Monday 00:00:00.000 UTC to Sunday 23:59:59.999 UTC).
 */
export function getCalendarWeekRange(refDate: Date = new Date()): CalendarWeekRange {
  const d = new Date(Date.UTC(refDate.getUTCFullYear(), refDate.getUTCMonth(), refDate.getUTCDate()));
  const day = d.getUTCDay(); // 0 is Sunday, 1 is Monday
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const startOfWeek = new Date(d);
  startOfWeek.setUTCDate(d.getUTCDate() + diffToMonday);
  startOfWeek.setUTCHours(0, 0, 0, 0);

  const endOfWeek = new Date(startOfWeek);
  endOfWeek.setUTCDate(startOfWeek.getUTCDate() + 6);
  endOfWeek.setUTCHours(23, 59, 59, 999);

  // ISO Year & Week number for labeling
  const target = new Date(startOfWeek.valueOf());
  const dayNr = (startOfWeek.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNr + 3);
  const firstThursday = target.valueOf();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
  }
  const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);
  const isoWeekLabel = `${new Date(firstThursday).getUTCFullYear()}-W${String(weekNumber).padStart(2, '0')}`;

  return { startOfWeek, endOfWeek, isoWeekLabel };
}

/**
 * Pure validator testing whether a candidate bounty claim fits within the 20-hr weekly sovereign capacity.
 */
export function validateWeeklyBountyClaim(params: {
  candidateBountyTokens: number;
  currentWeeklyTokens: number;
  adminOverride?: boolean;
}): WeeklyCapacityValidationResult {
  const weeklyTokensCap = SOVEREIGN_WEEKLY_TOKEN_CAP; // 1,200,000 tokens
  const weeklyHoursCap = SOVEREIGN_WEEKLY_HOURS_CAP;   // 20 hours

  const candidateBountyTokens = Math.max(0, Math.round(params.candidateBountyTokens));
  const currentWeeklyTokens = Math.max(0, Math.round(params.currentWeeklyTokens));
  const projectedTokens = currentWeeklyTokens + candidateBountyTokens;

  const currentWeeklyHours = Number((currentWeeklyTokens / TOKEN_RATE_PER_HOUR).toFixed(2));
  const candidateBountyHours = Number((candidateBountyTokens / TOKEN_RATE_PER_HOUR).toFixed(2));
  const projectedHours = Number((projectedTokens / TOKEN_RATE_PER_HOUR).toFixed(2));

  const tokensExceeded = Math.max(0, projectedTokens - weeklyTokensCap);
  const remainingTokens = Math.max(0, weeklyTokensCap - projectedTokens);
  const remainingHours = Number((remainingTokens / TOKEN_RATE_PER_HOUR).toFixed(2));

  const isOverLimit = projectedTokens > weeklyTokensCap;

  if (isOverLimit && !params.adminOverride) {
    return {
      allowed: false,
      weeklyTokensCap,
      weeklyHoursCap,
      currentWeeklyTokens,
      currentWeeklyHours,
      candidateBountyTokens,
      candidateBountyHours,
      projectedTokens,
      projectedHours,
      remainingTokens: 0,
      remainingHours: 0,
      tokensExceeded,
      reason: `Claiming this bounty (${candidateBountyTokens.toLocaleString()} tokens / ${candidateBountyHours} hrs) exceeds your 20-hour weekly sovereign capacity (1,200,000 tokens/week). Current utilization: ${currentWeeklyTokens.toLocaleString()} tokens (${currentWeeklyHours} hrs).`,
    };
  }

  return {
    allowed: true,
    weeklyTokensCap,
    weeklyHoursCap,
    currentWeeklyTokens,
    currentWeeklyHours,
    candidateBountyTokens,
    candidateBountyHours,
    projectedTokens,
    projectedHours,
    remainingTokens,
    remainingHours,
    tokensExceeded,
  };
}

/**
 * Derives token commitment for a work item in the weekly calculation.
 * Supports dynamic_tokens, bounty_tokens, estimated_hours, and bounty_hours.
 */
export function getItemTokenCommitment(item: any): number {
  const meta = item?.metadata || {};
  if (meta.dynamic_tokens && !isNaN(Number(meta.dynamic_tokens))) {
    return Number(meta.dynamic_tokens);
  }
  if (meta.bounty_tokens && !isNaN(Number(meta.bounty_tokens))) {
    return Number(meta.bounty_tokens);
  }
  const rawHours = meta.estimated_hours ?? meta.bounty_hours;
  if (rawHours !== undefined && !isNaN(Number(rawHours))) {
    const hours = Number(rawHours);
    const mult = Number(meta.neglect_multiplier || 1.0);
    return Math.round(hours * TOKEN_RATE_PER_HOUR * mult);
  }
  // Default 1-hr task
  return TOKEN_RATE_PER_HOUR;
}

/**
 * Server-side capacity enforcement helper that queries a runner's weekly commitments
 * and validates whether candidate bounty tokens can be claimed under the 20-hr weekly limit.
 */
export async function assertRunnerWeeklyCapacity(params: {
  supabaseClient: any;
  tenantId: string;
  assignee: string;
  candidateItem: {
    id: string;
    metadata?: Record<string, any>;
    [key: string]: any;
  };
  adminOverride?: boolean;
}): Promise<WeeklyCapacityValidationResult> {
  const { startOfWeek, endOfWeek } = getCalendarWeekRange();

  const { data: userItems } = await params.supabaseClient
    .from('work_items')
    .select('id, metadata, status, updated_at, created_at')
    .eq('tenant_id', params.tenantId)
    .eq('assignee', params.assignee)
    .neq('id', params.candidateItem.id);

  const TERMINAL_STATUSES = new Set(['done', 'completed', 'complete', 'closed', 'cancelled']);

  const weeklyItems = (userItems || []).filter((it: any) => {
    const rawStatus = String(it.status || '').toLowerCase().trim();
    const isTerminal = TERMINAL_STATUSES.has(rawStatus);

    // Ongoing active work consumes weekly capacity regardless of when it was started or last updated
    if (!isTerminal) {
      return true;
    }

    // For completed/closed work, check durable completion, claim, update, or creation within this week
    const completedAt = it.metadata?.completed_at ? new Date(it.metadata.completed_at).getTime() : 0;
    const claimedAt = it.metadata?.claimed_at ? new Date(it.metadata.claimed_at).getTime() : 0;
    const updated = it.updated_at ? new Date(it.updated_at).getTime() : 0;
    const created = it.created_at ? new Date(it.created_at).getTime() : 0;
    const startMs = startOfWeek.getTime();
    const endMs = endOfWeek.getTime();

    const inWeek = (ts: number) => ts >= startMs && ts <= endMs;
    return inWeek(completedAt) || inWeek(claimedAt) || inWeek(updated) || inWeek(created);
  });

  const { totalTokens: currentWeeklyTokens } = computeUserWeeklyUtilization(weeklyItems);
  const candidateBountyTokens = getItemTokenCommitment(params.candidateItem);

  return validateWeeklyBountyClaim({
    candidateBountyTokens,
    currentWeeklyTokens,
    adminOverride: params.adminOverride,
  });
}

/**
 * Computes weekly utilization from an array of a user's work items active or completed in the week.
 */
export function computeUserWeeklyUtilization(items: any[]): {
  totalTokens: number;
  totalHours: number;
  itemCount: number;
} {
  let totalTokens = 0;
  let itemCount = 0;

  for (const item of items) {
    totalTokens += getItemTokenCommitment(item);
    itemCount++;
  }

  const totalHours = Number((totalTokens / TOKEN_RATE_PER_HOUR).toFixed(2));

  return { totalTokens, totalHours, itemCount };
}
