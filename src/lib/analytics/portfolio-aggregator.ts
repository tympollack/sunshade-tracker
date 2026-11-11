import { calculateSayDoRatio, calculateSprintVolatility } from '@/lib/analytics/velocity-forecaster';

export type ProjectHealthStatus =
  | 'high_stability'
  | 'high_churn'
  | 'scope_volatile'
  | 'stalled'
  | 'monitoring'
  | 'no_activity';

export const HEALTH_STATUS_LABELS: Record<ProjectHealthStatus, string> = {
  high_stability: 'High Stability',
  high_churn: 'High Churn',
  scope_volatile: 'Scope Volatile',
  stalled: 'Stalled / At Risk',
  monitoring: 'Monitoring',
  no_activity: 'No Activity',
};

export interface HistoricalSprintSummary {
  id?: string;
  name: string;
  endsAt?: string | null;
  completedPoints: number;
}

export interface ProjectTelemetry {
  projectId: string;
  projectSlug: string;
  projectName: string;
  sprintId: string | null;
  baselinePts: number;
  addedPts: number;
  droppedPts: number;
  deliveredPts: number;
  remainingPts: number;
  rollingVelocity: number;
  sayDoPct: number;
  volatilityPct: number;
  healthStatus: ProjectHealthStatus;
  historicalVelocities?: number[];
  historicalSprints?: HistoricalSprintSummary[];
}

export interface PortfolioTotals {
  baselinePts: number;
  addedPts: number;
  droppedPts: number;
  deliveredPts: number;
  remainingPts: number;
  rollingVelocity: number;
  sayDoPct: number;
  volatilityPct: number;
}

export interface PortfolioFailedProject {
  projectId: string;
  projectSlug: string;
  projectName: string;
  error: string;
}

export interface PortfolioReport extends PortfolioTotals {
  sprintName: string;
  projects_telemetry: ProjectTelemetry[];
}

/** Minimal per-project report shape consumed by the aggregator (subset of SprintHealthReport). */
export interface ProjectReportInput {
  sprintId?: string | null;
  committedPoints?: number;
  currentSprintPoints?: number;
  completedPoints?: number;
  remainingPoints?: number;
  pointsAddedMidSprint?: number;
  pointsDroppedMidSprint?: number;
  rollingVelocity?: number;
  historicalVelocities?: number[];
  historicalSprints?: Array<{
    id?: string;
    name?: string;
    ends_at?: string | null;
    endsAt?: string | null;
    end_date?: string | null;
    completed_points?: number;
    completedPoints?: number;
    [key: string]: any;
  }>;
  runwayElapsedRatio?: number;
  rules?: { scope_creep_danger_threshold?: number };
}

export const HIGH_CHURN_THRESHOLD = 25;
export const HIGH_STABILITY_VOLATILITY_MAX = 15;

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);

export function classifyProjectStability(input: {
  baselinePts: number;
  currentPts: number;
  deliveredPts: number;
  sayDoPct: number;
  volatilityPct: number;
  runwayElapsedRatio?: number;
  scopeDangerThreshold?: number;
}): ProjectHealthStatus {
  const { baselinePts, currentPts, deliveredPts, sayDoPct, volatilityPct } = input;
  if (baselinePts <= 0 && currentPts <= 0 && deliveredPts <= 0) return 'no_activity';

  const deliveredPct = baselinePts > 0 ? (deliveredPts / baselinePts) * 100 : 0;
  // Late in the sprint (past halfway) with <20% delivered
  if (baselinePts > 0 && deliveredPct < 20 && num(input.runwayElapsedRatio) >= 0.5) return 'stalled';
  if (volatilityPct > HIGH_CHURN_THRESHOLD) return 'high_churn';
  const danger = num(input.scopeDangerThreshold);
  if (danger > 0 && volatilityPct > danger) return 'scope_volatile';
  if (sayDoPct >= 85 && sayDoPct <= 115 && volatilityPct < HIGH_STABILITY_VOLATILITY_MAX) return 'high_stability';
  return 'monitoring';
}

export function summarizeProjectTelemetry(
  entries: Array<{ projectId: string; projectSlug: string; projectName: string; report: ProjectReportInput }>
): ProjectTelemetry[] {
  return entries.map(({ projectId, projectSlug, projectName, report }) => {
    const baselinePts = num(report.committedPoints);
    const addedPts = num(report.pointsAddedMidSprint);
    const droppedPts = num(report.pointsDroppedMidSprint);
    const deliveredPts = num(report.completedPoints);
    const sayDoPct = calculateSayDoRatio(baselinePts, deliveredPts);
    const volatilityPct = calculateSprintVolatility(baselinePts, addedPts, droppedPts);
    const historicalSprints: HistoricalSprintSummary[] = Array.isArray(report.historicalSprints)
      ? report.historicalSprints.map((s) => ({
          id: typeof s.id === 'string' ? s.id : undefined,
          name: String(s.name ?? '').trim(),
          endsAt: (s.ends_at ?? s.endsAt ?? s.end_date ?? null) as string | null,
          completedPoints: num(s.completed_points ?? s.completedPoints),
        }))
      : [];
    const historicalVelocities: number[] = Array.isArray(report.historicalVelocities)
      ? report.historicalVelocities.map(num)
      : historicalSprints.map((s) => s.completedPoints);
    return {
      projectId,
      projectSlug,
      projectName,
      sprintId: report.sprintId ?? null,
      baselinePts,
      addedPts,
      droppedPts,
      deliveredPts,
      remainingPts: num(report.remainingPoints),
      rollingVelocity: num(report.rollingVelocity),
      historicalVelocities,
      historicalSprints,
      sayDoPct,
      volatilityPct,
      healthStatus: classifyProjectStability({
        baselinePts,
        currentPts: num(report.currentSprintPoints),
        deliveredPts,
        sayDoPct,
        volatilityPct,
        runwayElapsedRatio: report.runwayElapsedRatio,
        scopeDangerThreshold: report.rules?.scope_creep_danger_threshold,
      }),
    };
  });
}

/** Rolls up per-project telemetry into portfolio-wide totals (safe against zero baselines). */
export function computePortfolioTotals(projects: ProjectTelemetry[]): PortfolioTotals {
  const sum = (k: keyof ProjectTelemetry) => projects.reduce((acc, p) => acc + num(p[k]), 0);
  const baselinePts = sum('baselinePts');
  const addedPts = sum('addedPts');
  const droppedPts = sum('droppedPts');
  const deliveredPts = sum('deliveredPts');
  return {
    baselinePts,
    addedPts,
    droppedPts,
    deliveredPts,
    remainingPts: sum('remainingPts'),
    rollingVelocity: sum('rollingVelocity'),
    sayDoPct: calculateSayDoRatio(baselinePts, deliveredPts),
    volatilityPct: calculateSprintVolatility(baselinePts, addedPts, droppedPts),
  };
}

export function aggregatePortfolioTelemetry(
  sprintName: string,
  entries: Array<{ projectId: string; projectSlug: string; projectName: string; report: ProjectReportInput }>
): PortfolioReport {
  const projects_telemetry = summarizeProjectTelemetry(entries);
  return { sprintName, projects_telemetry, ...computePortfolioTotals(projects_telemetry) };
}

export type StabilityFilter =
  | 'all'
  | 'high_stability'
  | 'high_volatility'
  | 'under_delivering'
  | 'zero_burn';

export const STABILITY_FILTERS: StabilityFilter[] = [
  'all',
  'high_stability',
  'high_volatility',
  'under_delivering',
  'zero_burn',
];

export function isStabilityFilter(v: unknown): v is StabilityFilter {
  return typeof v === 'string' && (STABILITY_FILTERS as string[]).includes(v);
}

export function matchesStabilityFilter(p: ProjectTelemetry, filter: StabilityFilter): boolean {
  switch (filter) {
    case 'high_stability':
      return p.healthStatus === 'high_stability';
    case 'high_volatility':
      return (
        p.healthStatus === 'high_churn' ||
        p.healthStatus === 'scope_volatile' ||
        p.volatilityPct > HIGH_CHURN_THRESHOLD
      );
    case 'under_delivering':
      return (p.baselinePts > 0 && p.sayDoPct < 70) || p.healthStatus === 'stalled';
    case 'zero_burn':
      return p.deliveredPts === 0;
    default:
      return true;
  }
}

function getHistoricalPeriodKey(s: HistoricalSprintSummary): string | null {
  const endsAt = s.endsAt ? String(s.endsAt).trim() : '';
  if (endsAt) {
    const parsed = Date.parse(endsAt);
    if (Number.isFinite(parsed)) {
      return `date:${new Date(parsed).toISOString().slice(0, 10)}`;
    }
    return `date:${endsAt.slice(0, 10)}`;
  }
  const name = String(s.name ?? '').toLowerCase().trim();
  if (name) return `name:${name}`;
  if (s.id) return `id:${s.id}`;
  return null;
}

/**
 * Aligns historical sprint velocities across a filtered subset of projects by a shared
 * sprint period key (normalized UTC `endsAt` date `YYYY-MM-DD`, falling back to canonical
 * sprint name or id for undated sprints) so unrelated sprints are never merged by name
 * or positional index.
 *
 * Alignment policies:
 * - Absent-period rule: when a metadata-backed project has no closed sprint record for a
 *   given period `K`, it contributes `0` points to period `K`.
 * - Mixed-telemetry rule: when some projects only carry numeric `historicalVelocities`
 *   (no `historicalSprints` metadata), their newest-first samples are aligned by recency
 *   index onto the sorted timeline (extending beyond `periodSeries.length` if longer) so
 *   recorded numeric throughput is never dropped.
 */
export function alignFilteredHistoricalVelocities(projects: readonly ProjectTelemetry[]): number[] {
  const periods = new Map<string, { totalPoints: number; sortTime: number | null; order: number }>();
  const numericOnlyProjects: ProjectTelemetry[] = [];
  let order = 0;

  for (const proj of projects) {
    if (Array.isArray(proj.historicalSprints) && proj.historicalSprints.length > 0) {
      for (const sprint of proj.historicalSprints) {
        const key = getHistoricalPeriodKey(sprint);
        if (!key) continue;
        const parsedTime = sprint.endsAt ? Date.parse(sprint.endsAt) : NaN;
        const sortTime = Number.isFinite(parsedTime) ? parsedTime : null;
        const existing = periods.get(key);
        if (existing) {
          existing.totalPoints += num(sprint.completedPoints);
          if (existing.sortTime === null && sortTime !== null) {
            existing.sortTime = sortTime;
          }
        } else {
          periods.set(key, {
            totalPoints: num(sprint.completedPoints),
            sortTime,
            order: order++,
          });
        }
      }
    } else if (Array.isArray(proj.historicalVelocities) && proj.historicalVelocities.length > 0) {
      numericOnlyProjects.push(proj);
    }
  }

  const periodSeries = Array.from(periods.values())
    .sort((a, b) => {
      if (a.sortTime !== null && b.sortTime !== null && a.sortTime !== b.sortTime) {
        return b.sortTime - a.sortTime;
      }
      return a.order - b.order;
    })
    .map((entry) => entry.totalPoints);

  const maxLen = Math.max(
    periodSeries.length,
    ...numericOnlyProjects.map((p) => (p.historicalVelocities || []).length)
  );
  if (maxLen === 0) return [];

  const aligned: number[] = [];
  for (let i = 0; i < maxLen; i++) {
    const metadataPoints = periodSeries[i] ?? 0;
    const numericPoints = numericOnlyProjects.reduce(
      (acc, p) => acc + num(p.historicalVelocities?.[i]),
      0
    );
    aligned.push(metadataPoints + numericPoints);
  }
  return aligned;
}
