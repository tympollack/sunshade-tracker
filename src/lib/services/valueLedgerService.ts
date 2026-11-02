import type {
  LedgerMode,
  EfficiencyBreakdownStats,
  ItemVerificationProof,
  WorkItemWithProjectMode,
} from '@/types/statements';

export interface ItemizedYield {
  id: string;
  frictionPoint: string;
  description: string;
  metric: string;
  hoursReclaimed: number;
  ratePerHour: number;
  realizedValue: number;
}

export interface EfficiencySummaryKPIs {
  completedItemsCount: number;
  activeProjectsCount: number;
  totalItemsCount: number;
  totalHoursReclaimed: number;
  hourlyRate: number;
  velocityFactor: string;
  grossRealizedValue: number;
  platformSubscriptionFee: number;
  netRealizedSavings: number;
  breakdown?: EfficiencyBreakdownStats;
}

export interface EfficiencyStatementDateRange {
  periodLabel: string;
  startDate: string;
  endDate: string;
}

export interface EfficiencyMetricsPayload {
  tenant: {
    slug: string;
    name: string;
    tier: string;
  };
  dateRange: EfficiencyStatementDateRange;
  kpis: EfficiencySummaryKPIs;
  itemizedYields: ItemizedYield[];
  ecosystemNote: string;
  generatedAt: string;
}

export interface ComputeMetricsOptions {
  tenantSlug: string;
  tenantName?: string;
  tier?: string;
  completedItemsCount?: number;
  activeProjectsCount?: number;
  totalItemsCount?: number;
  hourlyRate?: number;
  velocityFactor?: string;
  startDate?: string;
  endDate?: string;
  periodMultiplier?: number;
  projectMonths?: number;
  // Item-level and project-level filtering inputs
  items?: WorkItemWithProjectMode[];
  verifiedItemsCount?: number;
  personalExcludedCount?: number;
  unverifiedExcludedCount?: number;
  qualifyingProjectsCount?: number;
}

const DEFAULT_HOURLY_RATE = 125;
const DEFAULT_VELOCITY_FACTOR = '+18%';
export const ECOSYSTEM_NOTE =
  'Built to eliminate busywork. Spend your reclaimed hours building, not managing administrative overhead.';

/**
 * Validates whether a completed item possesses verifiable artifact proof of execution.
 * Checks for commit hashes, pull requests, ZKP attestations, or AI telemetry logs.
 */
export function hasVerifiableArtifactProof(
  item: WorkItemWithProjectMode
): ItemVerificationProof {
  const meta = item.metadata || {};

  if (meta.commit_sha || meta.commit_hash) {
    return {
      hasArtifactProof: true,
      proofType: 'commit_sha',
      proofRef: String(meta.commit_sha || meta.commit_hash),
    };
  }

  if (meta.pr_url || meta.pr_number) {
    return {
      hasArtifactProof: true,
      proofType: 'pr_url',
      proofRef: String(meta.pr_url || meta.pr_number),
    };
  }

  if (meta.zkp_attestation_id || meta.zkp_hash) {
    return {
      hasArtifactProof: true,
      proofType: 'zkp_attestation_id',
      proofRef: String(meta.zkp_attestation_id || meta.zkp_hash),
    };
  }

  if (meta.has_ai_logs === true || (Array.isArray(meta.ai_usage_logs) && meta.ai_usage_logs.length > 0)) {
    return {
      hasArtifactProof: true,
      proofType: 'ai_usage_logs',
      proofRef: 'verified_telemetry_logs',
    };
  }

  return { hasArtifactProof: false };
}

/**
 * Pure calculation engine for deriving administrative drag hours reclaimed,
 * itemized yields, and realized financial value with Anti-Chore-Farming protection.
 *
 * Rules:
 * 1. Personal organizer projects ('personal_organizer') are strictly excluded from $125/hr
 *    commercial efficiency statements ($0.00 and 0.0 hrs).
 * 2. Backlog Triage & State Sync (0.05 hrs / 3 min per item) is awarded to completed items
 *    in 'standard_workspace' and 'audited_production'.
 * 3. Autonomous Review & Dev Cycles (0.20 hrs / 12 min per item) is strictly awarded ONLY
 *    to items possessing verified artifact proof (commit_sha, pr_url, zkp, or ai_usage_logs).
 * 4. Hierarchical Status Rollup (2.0 hrs/proj-mo) only counts non-personal projects with at least
 *    3 verified completed items.
 */
export function computeEfficiencyMetrics(
  opts: ComputeMetricsOptions
): EfficiencyMetricsPayload {
  const rate = opts.hourlyRate ?? DEFAULT_HOURLY_RATE;
  let verifiedArtifactCount = 0;
  let standardOrAuditedCompletedCount = 0;
  let personalExcludedCount = 0;
  let unverifiedExcludedCount = 0;
  let activeProjectsCount = opts.activeProjectsCount ?? 0;
  let totalItemsCount = opts.totalItemsCount ?? 0;

  if (Array.isArray(opts.items)) {
    totalItemsCount = opts.items.length;
    const projectVerifiedCounts = new Map<string, number>();

    for (const item of opts.items) {
      const isCompleted = item.status === 'complete';
      if (!isCompleted) continue;

      const ledgerMode: LedgerMode = item.project_ledger_mode || 'standard_workspace';

      if (ledgerMode === 'personal_organizer') {
        // Excluded from commercial statements
        personalExcludedCount++;
        continue;
      }

      // Qualifying workspace/production item
      standardOrAuditedCompletedCount++;

      const proof = hasVerifiableArtifactProof(item);
      if (proof.hasArtifactProof) {
        verifiedArtifactCount++;
        const currentCount = projectVerifiedCounts.get(item.project_id) || 0;
        projectVerifiedCounts.set(item.project_id, currentCount + 1);
      } else {
        unverifiedExcludedCount++;
      }
    }

    // Projects qualifying for hierarchical status rollup: non-personal and >= 3 verified items
    let qualifyingProjects = 0;
    for (const count of projectVerifiedCounts.values()) {
      if (count >= 3) {
        qualifyingProjects++;
      }
    }
    activeProjectsCount = qualifyingProjects;
  } else {
    // Fallback when aggregate counts are passed directly
    personalExcludedCount = opts.personalExcludedCount ?? 0;
    unverifiedExcludedCount = opts.unverifiedExcludedCount ?? 0;

    if (opts.verifiedItemsCount !== undefined) {
      verifiedArtifactCount = opts.verifiedItemsCount;
      standardOrAuditedCompletedCount =
        opts.completedItemsCount ?? verifiedArtifactCount + unverifiedExcludedCount;
    } else {
      // Backward-compatible fallback for legacy unsegmented aggregate options
      const rawCompleted = Math.max(0, Math.floor(opts.completedItemsCount || 0));
      verifiedArtifactCount = Math.max(0, rawCompleted - unverifiedExcludedCount);
      standardOrAuditedCompletedCount = rawCompleted;
    }

    if (opts.qualifyingProjectsCount !== undefined) {
      activeProjectsCount = opts.qualifyingProjectsCount;
    }
  }

  const completedCount = standardOrAuditedCompletedCount;
  const velocity =
    opts.velocityFactor !== undefined
      ? opts.velocityFactor
      : completedCount === 0
      ? '0%'
      : DEFAULT_VELOCITY_FACTOR;

  // Calculate period duration in months
  let durationMonths = opts.periodMultiplier ?? 1;
  if (!opts.periodMultiplier && opts.startDate && opts.endDate) {
    const sMs = new Date(opts.startDate).getTime();
    const eMs = new Date(opts.endDate).getTime();
    if (!isNaN(sMs) && !isNaN(eMs) && eMs >= sMs) {
      const days = (eMs - sMs) / (1000 * 60 * 60 * 24);
      if (days >= 350 && days <= 370) {
        durationMonths = 12;
      } else if (days >= 85 && days <= 95) {
        durationMonths = 3;
      } else if (days >= 27 && days <= 32) {
        durationMonths = 1;
      } else {
        durationMonths = Number(Math.max(1 / 30, days / 30.4375).toFixed(2));
      }
    }
  }

  // ─── Itemized Yield Breakdown ──────────────────────────────────────────────
  // 1. Hierarchical Status Rollup: 2.0 hrs per qualifying active project/month
  const effectiveProjectMonths =
    opts.projectMonths !== undefined
      ? opts.projectMonths
      : activeProjectsCount * durationMonths;

  const hierarchyHours = Number((effectiveProjectMonths * 2.0).toFixed(2));
  const hierarchyValue = Number((hierarchyHours * rate).toFixed(2));

  // 2. Backlog Triage & State Sync: 0.05 hrs (3 min) per completed standard/audited item
  const triageHours = Number((standardOrAuditedCompletedCount * 0.05).toFixed(2));
  const triageValue = Number((triageHours * rate).toFixed(2));

  // 3. Autonomous Review & Dev Cycles: 0.20 hrs (12 min) ONLY per verified artifact item
  const autonomousHours = Number((verifiedArtifactCount * 0.2).toFixed(2));
  const autonomousValue = Number((autonomousHours * rate).toFixed(2));

  // Total Reclaimed Hours
  const totalHours = Number((hierarchyHours + triageHours + autonomousHours).toFixed(2));
  const grossValue = Number((totalHours * rate).toFixed(2));
  const subscriptionFee = 0.0;
  const netSavings = grossValue;

  const breakdown: EfficiencyBreakdownStats = {
    verifiedArtifactCount,
    personalExcludedCount,
    unverifiedExcludedCount,
    totalConsideredCount: completedCount + personalExcludedCount,
  };

  const itemizedYields: ItemizedYield[] = [
    {
      id: 'hierarchical-status-rollup',
      frictionPoint: 'Hierarchical Status Rollup',
      description:
        '15–30 min per project/week saved via automated hierarchy queries & real-time progress rollups (min. 3 verified completions).',
      metric: `${activeProjectsCount} active project${activeProjectsCount === 1 ? '' : 's'} (${effectiveProjectMonths} proj-mo)`,
      hoursReclaimed: hierarchyHours,
      ratePerHour: rate,
      realizedValue: hierarchyValue,
    },
    {
      id: 'backlog-triage-state-sync',
      frictionPoint: 'Backlog Triage & State Sync',
      description:
        '2–5 min per item eliminated via atomic status transitions and inline metadata management in commercial workspaces.',
      metric: `${standardOrAuditedCompletedCount} commercial work item${standardOrAuditedCompletedCount === 1 ? '' : 's'}`,
      hoursReclaimed: triageHours,
      ratePerHour: rate,
      realizedValue: triageValue,
    },
    {
      id: 'autonomous-review-dev-cycles',
      frictionPoint: 'Autonomous Review & Dev Cycles',
      description:
        'Friction eliminated via automated PR linking, commit attribution, and verified artifact proofs.',
      metric: `${verifiedArtifactCount} artifact-verified item${verifiedArtifactCount === 1 ? '' : 's'}`,
      hoursReclaimed: autonomousHours,
      ratePerHour: rate,
      realizedValue: autonomousValue,
    },
  ];

  const now = new Date();
  const start = opts.startDate || new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
  const end = opts.endDate || now.toISOString();

  return {
    tenant: {
      slug: opts.tenantSlug,
      name: opts.tenantName || opts.tenantSlug,
      tier: opts.tier || 'Self-Administered',
    },
    dateRange: {
      periodLabel: `${new Intl.DateTimeFormat('en-US', { month: 'short', year: 'numeric' }).format(
        now
      )} Statement`,
      startDate: start,
      endDate: end,
    },
    kpis: {
      completedItemsCount: standardOrAuditedCompletedCount,
      activeProjectsCount,
      totalItemsCount,
      totalHoursReclaimed: totalHours,
      hourlyRate: rate,
      velocityFactor: velocity,
      grossRealizedValue: grossValue,
      platformSubscriptionFee: subscriptionFee,
      netRealizedSavings: netSavings,
      breakdown,
    },
    itemizedYields,
    ecosystemNote: ECOSYSTEM_NOTE,
    generatedAt: now.toISOString(),
  };
}

/**
 * Format the efficiency statement as an RFC-4180 compliant CSV string.
 */
export function formatEfficiencyStatementCSV(payload: EfficiencyMetricsPayload): string {
  const escape = (val: any) => {
    const s = String(val ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\r') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };

  const rows: string[][] = [
    ['Operational Yield & Efficiency Statement'],
    ['Tenant', payload.tenant.name, `@${payload.tenant.slug}`],
    ['Tier', payload.tenant.tier],
    ['Period', payload.dateRange.periodLabel],
    ['Generated At', payload.generatedAt],
    [],
    ['Summary KPIs'],
    ['Metric', 'Value'],
    ['Commercial Work Items', String(payload.kpis.completedItemsCount)],
    ['Artifact-Verified Items', String(payload.kpis.breakdown?.verifiedArtifactCount ?? 0)],
    ['Personal / Chores Excluded', String(payload.kpis.breakdown?.personalExcludedCount ?? 0)],
    ['Active Projects', String(payload.kpis.activeProjectsCount)],
    ['Total Work Items', String(payload.kpis.totalItemsCount)],
    ['Hours Reclaimed', `${payload.kpis.totalHoursReclaimed} hrs`],
    ['Velocity Factor', payload.kpis.velocityFactor],
    ['Hourly Valuation Baseline', `$${payload.kpis.hourlyRate.toFixed(2)}/hr`],
    ['Gross Realized Value', `$${payload.kpis.grossRealizedValue.toFixed(2)}`],
    ['Platform Subscription Fee', `$${payload.kpis.platformSubscriptionFee.toFixed(2)}`],
    ['Net Realized Savings', `$${payload.kpis.netRealizedSavings.toFixed(2)}`],
    [],
    ['Itemized Yield Breakdown'],
    ['Friction Point', 'Metric', 'Hours Reclaimed', 'Hourly Rate', 'Realized Value', 'Description'],
    ...payload.itemizedYields.map((yieldItem) => [
      yieldItem.frictionPoint,
      yieldItem.metric,
      `${yieldItem.hoursReclaimed} hrs`,
      `$${yieldItem.ratePerHour.toFixed(2)}/hr`,
      `$${yieldItem.realizedValue.toFixed(2)}`,
      yieldItem.description,
    ]),
    [],
    ['Ecosystem Note', payload.ecosystemNote],
  ];

  return rows.map((r) => r.map(escape).join(',')).join('\r\n');
}

/**
 * Format the efficiency statement as pretty-printed JSON.
 */
export function formatEfficiencyStatementJSON(payload: EfficiencyMetricsPayload): string {
  return JSON.stringify(payload, null, 2);
}
