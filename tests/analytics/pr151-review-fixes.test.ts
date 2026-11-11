import { describe, it, expect } from 'vitest';
import {
  matchesStabilityFilter,
  classifyProjectStability,
  summarizeProjectTelemetry,
  alignFilteredHistoricalVelocities,
  ProjectTelemetry,
} from '@/lib/analytics/portfolio-aggregator';

describe('TRK-26: PR 151 Review Feedback Fixes', () => {
  const makeProject = (overrides: Partial<ProjectTelemetry>): ProjectTelemetry => ({
    projectId: 'p-1',
    projectSlug: 'proj-1',
    projectName: 'Project 1',
    sprintId: 's-1',
    baselinePts: 100,
    addedPts: 5,
    droppedPts: 0,
    deliveredPts: 95,
    remainingPts: 10,
    rollingVelocity: 30,
    sayDoPct: 95,
    volatilityPct: 5,
    healthStatus: 'high_stability',
    ...overrides,
  });

  describe('Stability filter threshold alignment with badge (Comment 6)', () => {

    it('matches high_stability filter based on healthStatus classification', () => {
      const stable = makeProject({
        sayDoPct: 90,
        volatilityPct: 12, // < 15 HIGH_STABILITY_VOLATILITY_MAX
        healthStatus: 'high_stability',
      });
      // Should match filter since badge is High Stability
      expect(matchesStabilityFilter(stable, 'high_stability')).toBe(true);

      const monitoring = makeProject({
        sayDoPct: 125, // > 115
        volatilityPct: 4,
        healthStatus: 'monitoring',
      });
      // Should NOT match high_stability filter since badge is Monitoring
      expect(matchesStabilityFilter(monitoring, 'high_stability')).toBe(false);
    });

    it('matches high_volatility filter based on healthStatus and threshold', () => {
      const volatile = makeProject({
        volatilityPct: 30,
        healthStatus: 'high_churn',
      });
      expect(matchesStabilityFilter(volatile, 'high_volatility')).toBe(true);

      const scoped = makeProject({
        volatilityPct: 20,
        healthStatus: 'scope_volatile',
      });
      expect(matchesStabilityFilter(scoped, 'high_volatility')).toBe(true);
    });
  });

  describe('Sprint participation resolution logic (Comment 2 & 3)', () => {
    it('ensures project without sprint has zero velocity in portfolio rollups', () => {
      // If a project did not participate in the selected sprint, its rolling velocity is zeroed
      // so it does not overstate the selected sprint forecast.
      const activeProj = {
        projectId: 'p-active',
        projectSlug: 'active',
        projectName: 'Active Proj',
        report: {
          committedPoints: 20,
          completedPoints: 18,
          remainingPoints: 2,
          rollingVelocity: 15,
        },
      };

      const unrelatedProj = {
        projectId: 'p-unrelated',
        projectSlug: 'unrelated',
        projectName: 'Unrelated Proj',
        report: {
          committedPoints: 0,
          completedPoints: 0,
          remainingPoints: 0,
          // Simulated zeroing of absent project velocity
          rollingVelocity: 0,
        },
      };

      expect(activeProj.report.rollingVelocity).toBe(15);
      expect(unrelatedProj.report.rollingVelocity).toBe(0);
    });
  });

  describe('Filtered forecast aligned historical velocities (PR 152 Comment 1 & PR 154 Comment 3)', () => {
    it('aligns historical sprints by shared period key when projects skipped sprints (treats absent project as 0)', () => {
      const telemetry = summarizeProjectTelemetry([
        {
          projectId: 'p-a',
          projectSlug: 'proj-a',
          projectName: 'Project A',
          report: {
            committedPoints: 30,
            completedPoints: 30,
            historicalSprints: [
              { id: 'a-c', name: 'Sprint C', ends_at: '2026-10-30T00:00:00Z', completed_points: 10 },
              { id: 'a-a', name: 'Sprint A', ends_at: '2026-10-02T00:00:00Z', completed_points: 30 },
            ],
          },
        },
        {
          projectId: 'p-b',
          projectSlug: 'proj-b',
          projectName: 'Project B',
          report: {
            committedPoints: 50,
            completedPoints: 50,
            historicalSprints: [
              { id: 'b-c', name: 'Sprint C', ends_at: '2026-10-30T00:00:00Z', completed_points: 20 },
              { id: 'b-b', name: 'Sprint B', ends_at: '2026-10-16T00:00:00Z', completed_points: 40 },
              { id: 'b-a', name: 'Sprint A', ends_at: '2026-10-02T00:00:00Z', completed_points: 50 },
            ],
          },
        },
      ]);

      expect(telemetry[0].historicalSprints).toHaveLength(2);
      // C=10+20=30, B=0+40=40, A=30+50=80 (not positional [30, 70, 50])
      expect(alignFilteredHistoricalVelocities(telemetry)).toEqual([30, 40, 80]);
    });

    it('falls back to positional alignment only when period metadata is absent', () => {
      const red = makeProject({ projectId: 'r', historicalVelocities: [10, 30, 50] });
      const blue = makeProject({ projectId: 'b', historicalVelocities: [20, 20, 20] });
      expect(alignFilteredHistoricalVelocities([red, blue])).toEqual([30, 50, 70]);
    });

    it('separates same-named sprints when their end dates differ (PR 155 Comment 1)', () => {
      const telemetry = summarizeProjectTelemetry([
        {
          projectId: 'p-a',
          projectSlug: 'proj-a',
          projectName: 'Project A',
          report: {
            historicalSprints: [
              { id: 'a1', name: 'Sprint 1', ends_at: '2026-10-02T00:00:00Z', completed_points: 10 },
            ],
          },
        },
        {
          projectId: 'p-b',
          projectSlug: 'proj-b',
          projectName: 'Project B',
          report: {
            historicalSprints: [
              { id: 'b1', name: 'Sprint 1', ends_at: '2026-10-16T00:00:00Z', completed_points: 20 },
            ],
          },
        },
      ]);

      expect(alignFilteredHistoricalVelocities(telemetry)).toEqual([20, 10]);
    });

    it('combines different-named sprints that share the same normalized end date', () => {
      const telemetry = summarizeProjectTelemetry([
        {
          projectId: 'p-a',
          projectSlug: 'proj-a',
          projectName: 'Project A',
          report: {
            historicalSprints: [
              { id: 'a1', name: 'Alpha Wk 1', ends_at: '2026-10-02T09:00:00Z', completed_points: 15 },
            ],
          },
        },
        {
          projectId: 'p-b',
          projectSlug: 'proj-b',
          projectName: 'Project B',
          report: {
            historicalSprints: [
              { id: 'b1', name: 'Beta Cycle 1', ends_at: '2026-10-02T18:30:00Z', completed_points: 25 },
            ],
          },
        },
      ]);

      expect(alignFilteredHistoricalVelocities(telemetry)).toEqual([40]);
    });

    it('falls back to normalized sprint name when endsAt is omitted', () => {
      const telemetry = summarizeProjectTelemetry([
        {
          projectId: 'p-a',
          projectSlug: 'proj-a',
          projectName: 'Project A',
          report: {
            historicalSprints: [{ id: 'a1', name: 'Sprint One', completed_points: 12 }],
          },
        },
        {
          projectId: 'p-b',
          projectSlug: 'proj-b',
          projectName: 'Project B',
          report: {
            historicalSprints: [{ id: 'b1', name: ' sprint one ', completed_points: 18 }],
          },
        },
      ]);

      expect(alignFilteredHistoricalVelocities(telemetry)).toEqual([30]);
    });

    it('incorporates numeric-only projects alongside metadata-backed projects (PR 155 Comment 2)', () => {
      const withMetadata = makeProject({
        projectId: 'meta',
        historicalSprints: [{ id: 'm1', name: 'Sprint 1', endsAt: '2026-10-16T00:00:00Z', completedPoints: 10 }],
        historicalVelocities: [10],
      });
      const numericOnly = makeProject({
        projectId: 'num',
        historicalVelocities: [20, 15],
      });

      expect(alignFilteredHistoricalVelocities([withMetadata, numericOnly])).toEqual([30, 15]);
    });
  });
});
