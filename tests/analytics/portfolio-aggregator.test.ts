import { describe, it, expect } from 'vitest';
import {
  aggregatePortfolioTelemetry,
  classifyProjectStability,
  matchesStabilityFilter,
  computePortfolioTotals,
} from '@/lib/analytics/portfolio-aggregator';

const entry = (slug: string, report: any) => ({
  projectId: `id-${slug}`,
  projectSlug: slug,
  projectName: slug.toUpperCase(),
  report,
});

describe('portfolio analytics aggregation (STORY-TRK-WORKSPACE-ANALYTICS-DRILLDOWN)', () => {
  const portfolio = aggregatePortfolioTelemetry('Sprint 2026-Q4', [
    entry('a', { committedPoints: 100, completedPoints: 90, pointsAddedMidSprint: 5, remainingPoints: 10, runwayElapsedRatio: 0.8 }),
    entry('b', { committedPoints: 50, completedPoints: 9, pointsAddedMidSprint: 30, pointsDroppedMidSprint: 5, remainingPoints: 70, runwayElapsedRatio: 0.9 }),
    entry('c', {}),
  ]);

  it('sums totals and computes portfolio say/do and volatility', () => {
    expect(portfolio.baselinePts).toBe(150);
    expect(portfolio.deliveredPts).toBe(99);
    expect(portfolio.addedPts).toBe(35);
    expect(portfolio.droppedPts).toBe(5);
    expect(portfolio.sayDoPct).toBeCloseTo(66, 1);
    expect(portfolio.volatilityPct).toBeCloseTo(20, 1);
  });

  it('handles zero-activity projects without NaN', () => {
    const c = portfolio.projects_telemetry.find((p) => p.projectSlug === 'c')!;
    expect(c.sayDoPct).toBe(0);
    expect(c.volatilityPct).toBe(0);
    expect(c.healthStatus).toBe('no_activity');
    const empty = computePortfolioTotals([]);
    expect(Number.isNaN(empty.sayDoPct)).toBe(false);
    expect(empty.volatilityPct).toBe(0);
  });

  it('classifies stability tiers', () => {
    const a = portfolio.projects_telemetry.find((p) => p.projectSlug === 'a')!;
    const b = portfolio.projects_telemetry.find((p) => p.projectSlug === 'b')!;
    expect(a.healthStatus).toBe('high_stability');
    expect(b.healthStatus).toBe('stalled');
    expect(
      classifyProjectStability({ baselinePts: 100, currentPts: 140, deliveredPts: 100, sayDoPct: 100, volatilityPct: 40 })
    ).toBe('high_churn');
  });

  it('filters project subsets', () => {
    const list = portfolio.projects_telemetry;
    expect(list.filter((p) => matchesStabilityFilter(p, 'high_stability')).map((p) => p.projectSlug)).toEqual(['a']);
    expect(list.filter((p) => matchesStabilityFilter(p, 'high_volatility')).map((p) => p.projectSlug)).toEqual(['b']);
    expect(list.filter((p) => matchesStabilityFilter(p, 'under_delivering')).map((p) => p.projectSlug)).toEqual(['b']);
    expect(list.filter((p) => matchesStabilityFilter(p, 'zero_burn')).map((p) => p.projectSlug)).toEqual(['c']);
    expect(list.filter((p) => matchesStabilityFilter(p, 'all'))).toHaveLength(3);
  });
});
