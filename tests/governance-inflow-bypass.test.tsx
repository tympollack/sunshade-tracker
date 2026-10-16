import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  isLateInflowEnforced,
  disableLateInflowCaps,
  enableLateInflowCaps,
  getEffectiveLateInflowRules,
  DEFAULT_LATE_INFLOW_CAP,
  DEFAULT_RUNWAY_CUTOFF,
} from '@/lib/governance/sprint-rules';
import { SprintGovernanceForm } from '@/components/schema/SprintGovernanceForm';
import { ProjectSchemaEditor } from '@/components/schema/ProjectSchemaEditor';
import { validateProjectSettings } from '@/lib/project-settings-validator';
import { lintProjectSettings } from '@/lib/project-settings-schema';
import { validateSprintIntakePure, SprintGuardrailError } from '@/lib/services/sprintGuardrailService';
import { ProjectSettings, WorkItem } from '@/types/tracker';

const mockBaseSettings: ProjectSettings = {
  schema_version: '1.0',
  hierarchy: [
    { type: 'epic', label: 'Epic', level: 1, allowed_parents: [], color: '#c084fc' },
    { type: 'story', label: 'Story', level: 2, allowed_parents: ['epic'], color: '#38bdf8' },
    { type: 'task', label: 'Task', level: 3, allowed_parents: ['story'], color: '#34d399' },
  ],
  statuses: [
    { id: 'todo', label: 'To Do', color: '#94a3b8', order: 1 },
    { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
    { id: 'done', label: 'Done', color: '#22c55e', order: 3 },
  ],
  custom_fields: [],
  sprint_metrics: {
    velocity_window: 3,
    late_runway_threshold: 0.60,
    late_runway_max_points: 2,
    late_inflow_cap: 2,
    runway_cutoff: 0.60,
    enforce_late_inflow_caps: true,
    enforce_zero_sum: true,
    lock_estimates_in_active_sprint: true,
  },
};

describe('FEAT-TRK-GOVERNANCE-INFLOW-BYPASS: Late Inflow & Runway Governance Bypass', () => {
  describe('Governance sprint-rules Pure Functions', () => {
    it('isLateInflowEnforced returns true for default settings and false when null', () => {
      expect(isLateInflowEnforced(mockBaseSettings.sprint_metrics)).toBe(true);
      expect(isLateInflowEnforced({})).toBe(true);
      expect(isLateInflowEnforced(undefined)).toBe(true);

      // Explicit null bypass
      expect(
        isLateInflowEnforced({
          late_inflow_cap: null,
          runway_cutoff: null,
        })
      ).toBe(false);

      expect(
        isLateInflowEnforced({
          late_runway_max_points: null,
          late_runway_threshold: null,
        })
      ).toBe(false);

      expect(
        isLateInflowEnforced({
          enforce_late_inflow_caps: false,
        })
      ).toBe(false);

      // Metadata bypass lookup (Comment 4)
      expect(
        isLateInflowEnforced({
          metadata: {
            metric_rules: {
              enforce_late_inflow_caps: false,
              late_inflow_cap: null,
              runway_cutoff: null,
            },
          },
        })
      ).toBe(false);

      expect(
        isLateInflowEnforced({
          metadata: {
            sprint_metrics: {
              late_inflow_cap: null,
              runway_cutoff: null,
            },
          },
        })
      ).toBe(false);
    });

    it('disableLateInflowCaps sets late_inflow_cap and runway_cutoff to null while preserving custom values (Comment 2)', () => {
      const customMetrics = {
        ...mockBaseSettings.sprint_metrics,
        late_inflow_cap: 5,
        runway_cutoff: 0.80,
        late_runway_max_points: 5,
        late_runway_threshold: 0.80,
      };

      const disabled = disableLateInflowCaps(customMetrics);
      expect(disabled.late_inflow_cap).toBeNull();
      expect(disabled.runway_cutoff).toBeNull();
      expect(disabled.late_runway_max_points).toBeNull();
      expect(disabled.late_runway_threshold).toBeNull();
      expect(disabled.enforce_late_inflow_caps).toBe(false);
      // Preserves existing unrelated rules
      expect(disabled.velocity_window).toBe(3);
      expect(disabled.enforce_zero_sum).toBe(true);
      expect(disabled.lock_estimates_in_active_sprint).toBe(true);

      // Turning back on restores the custom 5 pts and 80% rather than reset to defaults (Comment 2)
      const reEnabled = enableLateInflowCaps(disabled);
      expect(reEnabled.late_inflow_cap).toBe(5);
      expect(reEnabled.runway_cutoff).toBe(0.80);
      expect(reEnabled.late_runway_max_points).toBe(5);
      expect(reEnabled.late_runway_threshold).toBe(0.80);
      expect(reEnabled.enforce_late_inflow_caps).toBe(true);
    });

    it('prioritizes new aliases over legacy keys when limits disagree (Comment 3)', () => {
      // With late_runway_max_points: 2 and late_inflow_cap: 13
      const conflictingMetrics = {
        late_runway_max_points: 2,
        late_inflow_cap: 13,
        late_runway_threshold: 0.60,
        runway_cutoff: 0.75,
      };

      const effective = getEffectiveLateInflowRules(conflictingMetrics);
      expect(effective.enforced).toBe(true);
      expect(effective.late_inflow_cap).toBe(13);
      expect(effective.runway_cutoff).toBe(0.75);
    });

    it('getEffectiveLateInflowRules handles metadata bypass correctly (Comment 4)', () => {
      const bypassedMetadata = {
        metadata: {
          metric_rules: {
            enforce_late_inflow_caps: false,
            late_inflow_cap: null,
            runway_cutoff: null,
          },
        },
      };
      const result = getEffectiveLateInflowRules(bypassedMetadata);
      expect(result.enforced).toBe(false);
      expect(result.late_inflow_cap).toBeNull();
      expect(result.runway_cutoff).toBeNull();
    });
  });

  describe('SprintGovernanceForm Interactive Toggle Component', () => {
    it('renders independent Enforce Late Inflow & Runway Caps toggle beside zero-sum and estimate locking', () => {
      render(<SprintGovernanceForm metrics={mockBaseSettings.sprint_metrics} onChange={vi.fn()} />);

      expect(screen.getByText('Enforce Late Inflow & Runway Caps')).toBeDefined();
      expect(screen.getByText('Zero-Sum Backlog Swaps')).toBeDefined();
      expect(screen.getByText('Lock Estimates in Active Sprints')).toBeDefined();

      const toggle = screen.getByRole('switch', { name: /toggle enforce late inflow & runway caps/i });
      expect(toggle.getAttribute('aria-checked')).toBe('true');
    });

    it('disabling toggle calls onChange with late_inflow_cap: null and runway_cutoff: null', () => {
      const handleChange = vi.fn();
      render(<SprintGovernanceForm metrics={mockBaseSettings.sprint_metrics} onChange={handleChange} />);

      const toggle = screen.getByRole('switch', { name: /toggle enforce late inflow & runway caps/i });
      fireEvent.click(toggle);

      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          late_inflow_cap: null,
          runway_cutoff: null,
          late_runway_max_points: null,
          late_runway_threshold: null,
          enforce_late_inflow_caps: false,
        })
      );
    });

    it('re-enabling toggle restores thresholds without affecting lock_estimates', () => {
      const disabledMetrics = {
        ...mockBaseSettings.sprint_metrics,
        late_inflow_cap: null,
        runway_cutoff: null,
        late_runway_max_points: null,
        late_runway_threshold: null,
        enforce_late_inflow_caps: false,
        lock_estimates_in_active_sprint: true,
      };

      const handleChange = vi.fn();
      render(<SprintGovernanceForm metrics={disabledMetrics} onChange={handleChange} />);

      const toggle = screen.getByRole('switch', { name: /toggle enforce late inflow & runway caps/i });
      expect(toggle.getAttribute('aria-checked')).toBe('false');

      fireEvent.click(toggle);

      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          late_inflow_cap: expect.any(Number),
          runway_cutoff: expect.any(Number),
          enforce_late_inflow_caps: true,
          lock_estimates_in_active_sprint: true,
        })
      );
    });
  });

  describe('ProjectSchemaEditor Persistence & Schema Validation', () => {
    it('persists disabled late inflow caps cleanly to tracker.projects.settings->sprint_metrics', () => {
      const handleChange = vi.fn();
      render(<ProjectSchemaEditor settings={mockBaseSettings} onChange={handleChange} />);

      const toggle = screen.getByRole('switch', { name: /toggle enforce late inflow & runway caps/i });
      fireEvent.click(toggle);

      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          sprint_metrics: expect.objectContaining({
            late_inflow_cap: null,
            runway_cutoff: null,
            late_runway_max_points: null,
            late_runway_threshold: null,
          }),
        })
      );
    });

    it('passes ProjectSettings validator and Zod linter when late_inflow_cap and runway_cutoff are null', () => {
      const settingsWithBypass: ProjectSettings = {
        ...mockBaseSettings,
        sprint_metrics: {
          ...mockBaseSettings.sprint_metrics,
          late_inflow_cap: null,
          runway_cutoff: null,
          late_runway_max_points: null,
          late_runway_threshold: null,
        },
      };

      const valResult = validateProjectSettings(settingsWithBypass);
      expect(valResult.valid).toBe(true);
      expect(valResult.errors).toHaveLength(0);

      const lintResult = lintProjectSettings(settingsWithBypass);
      expect(lintResult.valid).toBe(true);
      expect(lintResult.errors).toHaveLength(0);
    });
  });

  describe('Unrestricted Sprint Planning Acceptance Criteria', () => {
    const activeSprint = {
      id: 'sprint-active-late',
      name: 'Sprint Late Inflow Test',
      status: 'active',
      is_active: true,
      started_at: '2026-10-01T00:00:00Z',
      ends_at: '2026-10-11T00:00:00Z',
      committed_points: 50,
    };

    // Day 8: 80% elapsed (past the 60% mark)
    const lateSprintNow = '2026-10-09T00:00:00Z';

    const largeThirteenPointItem: Partial<WorkItem> = {
      id: 'story-13-points',
      item_type: 'story',
      title: 'Late 13 Point Epic Task',
      metadata: { story_points: 13 },
    };

    it('blocks 13 pt item when late inflow enforcement is active and sprint > 60% elapsed', () => {
      expect(() => {
        validateSprintIntakePure({
          sprint: activeSprint,
          currentSprintItems: [],
          incomingItem: largeThirteenPointItem,
          options: {
            now: lateSprintNow,
            rules: {
              late_inflow_cap: 2,
              runway_cutoff: 0.60,
              late_runway_max_points: 2,
              late_runway_threshold: 0.60,
              enforce_late_inflow_caps: true,
            },
          },
        });
      }).toThrowError(SprintGuardrailError);
    });

    it('allows unrestricted item planning regardless of sprint date when inflow caps are set to null', () => {
      const res = validateSprintIntakePure({
        sprint: activeSprint,
        currentSprintItems: [],
        incomingItem: largeThirteenPointItem,
        options: {
          now: lateSprintNow,
          rules: {
            late_inflow_cap: null,
            runway_cutoff: null,
            late_runway_max_points: null,
            late_runway_threshold: null,
            enforce_late_inflow_caps: false,
          },
        },
      });

      expect(res.valid).toBe(true);
      expect(res.elapsed_ratio).toBeCloseTo(0.80, 2);
    });
  });
});
