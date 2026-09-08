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
  completedItemsCount: number;
  activeProjectsCount: number;
  totalItemsCount: number;
  hourlyRate?: number;
  velocityFactor?: string;
  startDate?: string;
  endDate?: string;
}

const DEFAULT_HOURLY_RATE = 125;
const DEFAULT_VELOCITY_FACTOR = '+18%';
export const ECOSYSTEM_NOTE =
  'Built to eliminate busywork. Spend your reclaimed hours building, not managing administrative overhead.';

/**
 * Pure calculation engine for deriving administrative drag hours reclaimed,
 * itemized yields, and realized financial value.
 *
 * Product Modeling Rationale:
 * - Hourly Rate ($125/hr default): Calibrated to blended engineering/PM compensation benchmarks.
 *   Fully configurable via query params or runtime options for customer-tailored audits.
 * - Hierarchical Status Rollup (2.0 hrs/project/month): Modeled on ~30 minutes/week spent in manual
 *   cross-team alignment, status reporting, and epic rollups eliminated by automated hierarchy tracking.
 * - Backlog Triage & State Sync (0.05 hrs / 3 min per item): Calibrated against manual metadata syncing,
 *   re-prioritization, and board maintenance.
 * - Autonomous Dev & Review Cycles (0.20 hrs / 12 min per item): Accounts for context switching, PR linking,
 *   and branch status reconciliation handled automatically.
 *
 * These metrics represent estimated administrative drag reduction and reclaimed engineering capacity.
 */
export function computeEfficiencyMetrics(
  opts: ComputeMetricsOptions
): EfficiencyMetricsPayload {
  const completedCount = Math.max(0, Math.floor(opts.completedItemsCount || 0));
  const activeProjectsCount = Math.max(0, Math.floor(opts.activeProjectsCount || 0));
  const totalItemsCount = Math.max(0, Math.floor(opts.totalItemsCount || 0));
  const rate = opts.hourlyRate ?? DEFAULT_HOURLY_RATE;
  const velocity =
    opts.velocityFactor !== undefined
      ? opts.velocityFactor
      : completedCount === 0
      ? '0%'
      : DEFAULT_VELOCITY_FACTOR;

  // ─── Itemized Yield Breakdown ──────────────────────────────────────────────
  // 1. Hierarchical Status Rollup: 2.0 hrs per active project/month (30m/week)
  const hierarchyHours = Number((activeProjectsCount * 2.0).toFixed(2));
  const hierarchyValue = Number((hierarchyHours * rate).toFixed(2));

  // 2. Backlog Triage & State Sync: 0.05 hrs (3 min) per completed item
  const triageHours = Number((completedCount * 0.05).toFixed(2));
  const triageValue = Number((triageHours * rate).toFixed(2));

  // 3. Autonomous Review & Dev Cycles: 0.20 hrs (12 min) per completed item
  const autonomousHours = Number((completedCount * 0.2).toFixed(2));
  const autonomousValue = Number((autonomousHours * rate).toFixed(2));

  // Total Hours = (Completed Items * 0.25 hrs) + (Active Projects * 2.0 hrs)
  const totalHours = Number((hierarchyHours + triageHours + autonomousHours).toFixed(2));
  const grossValue = Number((totalHours * rate).toFixed(2));
  const subscriptionFee = 0.0;
  const netSavings = grossValue;

  const itemizedYields: ItemizedYield[] = [
    {
      id: 'hierarchical-status-rollup',
      frictionPoint: 'Hierarchical Status Rollup',
      description:
        '15–30 min per project/week saved via automated hierarchy queries & real-time progress rollups.',
      metric: `${activeProjectsCount} active project${activeProjectsCount === 1 ? '' : 's'} tracked`,
      hoursReclaimed: hierarchyHours,
      ratePerHour: rate,
      realizedValue: hierarchyValue,
    },
    {
      id: 'backlog-triage-state-sync',
      frictionPoint: 'Backlog Triage & State Sync',
      description:
        '2–5 min per item eliminated via atomic status transitions and inline metadata management.',
      metric: `${completedCount} completed work item${completedCount === 1 ? '' : 's'}`,
      hoursReclaimed: triageHours,
      ratePerHour: rate,
      realizedValue: triageValue,
    },
    {
      id: 'autonomous-review-dev-cycles',
      frictionPoint: 'Autonomous Review & Dev Cycles',
      description:
        'Friction eliminated via automated PR linking, commit attribution, and autonomous agent loops.',
      metric: `${completedCount} attributed item${completedCount === 1 ? '' : 's'}`,
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
      completedItemsCount: completedCount,
      activeProjectsCount,
      totalItemsCount,
      totalHoursReclaimed: totalHours,
      hourlyRate: rate,
      velocityFactor: velocity,
      grossRealizedValue: grossValue,
      platformSubscriptionFee: subscriptionFee,
      netRealizedSavings: netSavings,
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
    ['Completed Work Items', String(payload.kpis.completedItemsCount)],
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
