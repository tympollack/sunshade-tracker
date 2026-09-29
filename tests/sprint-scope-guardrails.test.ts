import { describe, it, expect, vi, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
  validateSprintIntakePure,
  validateEstimateImmutability,
  calculateElapsedRatio,
  isSprintActive,
  SprintGuardrailError,
} from '@/lib/services/sprintGuardrailService';
import { validateSprintIntake } from '@/lib/services/sprintGuardrailServer';
import { supabaseAdmin } from '@/lib/db';
import { WorkItem } from '@/types/tracker';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('TASK-TRK-SCOPE-INVARIANTS: Sprint Scope Invariants & Guardrails', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Elapsed Sprint Timeline & Boundary Calculations', () => {
    it('calculates elapsed ratio accurately across time boundaries', () => {
      const start = '2026-10-01T00:00:00Z';
      const end = '2026-10-11T00:00:00Z'; // 10 days total

      // Day 0: 0%
      expect(calculateElapsedRatio(start, end, '2026-10-01T00:00:00Z')).toBe(0.0);

      // Day 6: Exactly 60% elapsed
      const sixtyPercentDate = '2026-10-07T00:00:00Z';
      expect(calculateElapsedRatio(start, end, sixtyPercentDate)).toBeCloseTo(0.60, 4);

      // Day 6 + 1 hour: > 60% elapsed
      const pastSixtyDate = '2026-10-07T01:00:00Z';
      expect(calculateElapsedRatio(start, end, pastSixtyDate)).toBeGreaterThan(0.60);

      // Day 10: 100%
      expect(calculateElapsedRatio(start, end, '2026-10-11T00:00:00Z')).toBe(1.0);
    });

    it('handles malformed dates gracefully without NaN', () => {
      expect(calculateElapsedRatio(null, null)).toBe(0.0);
      expect(calculateElapsedRatio('invalid', 'invalid')).toBe(0.0);
    });
  });

  describe('Guardrail 2: Late-Sprint Runway Rules', () => {
    const activeSprint = {
      id: 'sprint-q4',
      name: 'Sprint 2026-Q4',
      status: 'active',
      is_active: true,
      started_at: '2026-10-01T00:00:00Z',
      ends_at: '2026-10-11T00:00:00Z',
      committed_points: 50,
    };

    it('permits feature stories with > 2 points when elapsed runway is <= 60%', () => {
      // 50% elapsed (Oct 6)
      const now = '2026-10-06T00:00:00Z';
      const storyItem: Partial<WorkItem> = {
        id: 'item-1',
        item_type: 'story',
        title: 'Large Feature Story',
        metadata: { story_points: 5 },
      };

      const res = validateSprintIntakePure({
        sprint: activeSprint,
        currentSprintItems: [],
        incomingItem: storyItem,
        options: { now },
      });

      expect(res.valid).toBe(true);
      expect(res.required_ejection_points).toBe(0);
    });

    it('boundary threshold edge case: exactly 60% elapsed permits feature stories with > 2 points', () => {
      // Exactly 60% elapsed (Oct 7 00:00:00Z)
      const now = '2026-10-07T00:00:00Z';
      const storyItem: Partial<WorkItem> = {
        id: 'item-1',
        item_type: 'story',
        title: 'Boundary Feature Story',
        metadata: { story_points: 5 },
      };

      const res = validateSprintIntakePure({
        sprint: activeSprint,
        currentSprintItems: [],
        incomingItem: storyItem,
        options: { now },
      });

      expect(res.valid).toBe(true);
      expect(res.elapsed_ratio).toBeCloseTo(0.60, 4);
    });

    it('blocks feature stories with > 2 points when elapsed runway > 60%', () => {
      // 61% elapsed (Oct 7 02:24:00Z)
      const now = '2026-10-07T02:24:00Z';
      const storyItem: Partial<WorkItem> = {
        id: 'item-1',
        item_type: 'story',
        title: 'Late Feature Story',
        metadata: { story_points: 3 },
      };

      expect(() => {
        validateSprintIntakePure({
          sprint: activeSprint,
          currentSprintItems: [],
          incomingItem: storyItem,
          options: { now },
        });
      }).toThrowError(SprintGuardrailError);

      try {
        validateSprintIntakePure({
          sprint: activeSprint,
          currentSprintItems: [],
          incomingItem: storyItem,
          options: { now },
        });
      } catch (err: any) {
        expect(err.code).toBe('LATE_RUNWAY_EXCEEDED');
        expect(err.status).toBe(409);
        expect(err.details.threshold).toBe(0.60);
      }
    });

    it('permits feature stories with <= 2 points even when elapsed runway > 60%', () => {
      const now = '2026-10-09T00:00:00Z'; // 80% elapsed
      const smallStory: Partial<WorkItem> = {
        id: 'item-small',
        item_type: 'story',
        title: 'Small Story Fix',
        metadata: { story_points: 2 },
      };

      const res = validateSprintIntakePure({
        sprint: activeSprint,
        currentSprintItems: [],
        incomingItem: smallStory,
        options: { now },
      });

      expect(res.valid).toBe(true);
    });

    it('permits non-feature chores, test debt, or documentation tasks > 2 points when elapsed > 60%', () => {
      const now = '2026-10-09T00:00:00Z'; // 80% elapsed

      const choreTask: Partial<WorkItem> = {
        id: 'task-chore',
        item_type: 'task',
        title: 'CI Pipeline Hardening',
        metadata: { story_points: 5 },
      };

      const testDebt: Partial<WorkItem> = {
        id: 'task-test',
        item_type: 'test',
        title: 'E2E Cypress Test Coverage',
        metadata: { story_points: 8 },
      };

      const docTask: Partial<WorkItem> = {
        id: 'task-doc',
        item_type: 'documentation',
        title: 'API Spec Documentation',
        metadata: { story_points: 5 },
      };

      expect(
        validateSprintIntakePure({
          sprint: activeSprint,
          currentSprintItems: [],
          incomingItem: choreTask,
          options: { now },
        }).valid
      ).toBe(true);

      expect(
        validateSprintIntakePure({
          sprint: activeSprint,
          currentSprintItems: [],
          incomingItem: testDebt,
          options: { now },
        }).valid
      ).toBe(true);

      expect(
        validateSprintIntakePure({
          sprint: activeSprint,
          currentSprintItems: [],
          incomingItem: docTask,
          options: { now },
        }).valid
      ).toBe(true);
    });
  });

  describe('Guardrail 1: Strict Zero-Sum Swap API', () => {
    const activeSprint = {
      id: 'sprint-q4',
      name: 'Sprint 2026-Q4',
      status: 'active',
      is_active: true,
      committed_points: 20,
    };

    const existingItems: WorkItem[] = [
      {
        id: 'exist-1',
        tenant_id: 't-1',
        project_id: 'p-1',
        item_type: 'task',
        status: 'in_progress',
        title: 'In Progress Core Dev',
        order_index: 1000,
        metadata: { story_points: 10, sprint: 'Sprint 2026-Q4' },
        created_at: '2026-10-01',
        updated_at: '2026-10-01',
      },
      {
        id: 'exist-2',
        tenant_id: 't-1',
        project_id: 'p-1',
        item_type: 'task',
        status: 'not_started',
        title: 'Unstarted Backlog Candidate 1',
        order_index: 2000,
        metadata: { story_points: 5, sprint: 'Sprint 2026-Q4' },
        created_at: '2026-10-01',
        updated_at: '2026-10-01',
      },
      {
        id: 'exist-3',
        tenant_id: 't-1',
        project_id: 'p-1',
        item_type: 'task',
        status: 'not_started',
        title: 'Unstarted Backlog Candidate 2',
        order_index: 3000,
        metadata: { story_points: 3, sprint: 'Sprint 2026-Q4' },
        created_at: '2026-10-01',
        updated_at: '2026-10-01',
      },
    ];
    // Total existing points = 10 + 5 + 3 = 18 points.
    // Committed = 20 points. Remaining unallocated capacity = 2 points.

    it('permits incoming items that fit within remaining capacity without ejection', () => {
      const incomingSmall: Partial<WorkItem> = {
        id: 'inc-1',
        item_type: 'task',
        title: 'Small 2-point item',
        metadata: { story_points: 2 },
      };

      const res = validateSprintIntakePure({
        sprint: activeSprint,
        currentSprintItems: existingItems,
        incomingItem: incomingSmall,
      });

      expect(res.valid).toBe(true);
      expect(res.required_ejection_points).toBe(0);
      expect(res.remaining_capacity).toBe(2);
    });

    it('rejects with structured 409 and required_ejection_points when incoming exceeds capacity without ejections', () => {
      const incomingLarge: Partial<WorkItem> = {
        id: 'inc-large',
        item_type: 'task',
        title: 'Large 5-point item',
        metadata: { story_points: 5 }, // Needs 5 points, capacity is 2 -> overflow 3 points
      };

      try {
        validateSprintIntakePure({
          sprint: activeSprint,
          currentSprintItems: existingItems,
          incomingItem: incomingLarge,
        });
        expect.unreachable('Should have thrown SprintGuardrailError');
      } catch (err: any) {
        expect(err).toBeInstanceOf(SprintGuardrailError);
        expect(err.code).toBe('SCOPE_OVERFLOW');
        expect(err.status).toBe(409);
        expect(err.required_ejection_points).toBe(3);
        expect(err.details.committed_points).toBe(20);
        expect(err.details.current_active_points).toBe(18);
        expect(err.details.remaining_capacity).toBe(2);
        expect(err.details.incoming_points).toBe(5);
      }
    });

    it('cleanly permits intake when accompanied by equivalent or greater unstarted item ejections', () => {
      const incomingLarge: Partial<WorkItem> = {
        id: 'inc-large',
        item_type: 'task',
        title: 'Large 5-point item',
        metadata: { story_points: 5 },
      };

      // Eject exist-2 (5 points >= required 3 points)
      const res = validateSprintIntakePure({
        sprint: activeSprint,
        currentSprintItems: existingItems,
        incomingItem: incomingLarge,
        options: {
          ejectedItemIds: ['exist-2'],
        },
      });

      expect(res.valid).toBe(true);
      expect(res.required_ejection_points).toBe(3);
      expect(res.ejected_item_ids).toEqual(['exist-2']);
    });

    it('rejects with INVALID_EJECTION when attempting to eject an in-progress or completed item', () => {
      const incomingLarge: Partial<WorkItem> = {
        id: 'inc-large',
        item_type: 'task',
        title: 'Large 5-point item',
        metadata: { story_points: 5 },
      };

      // Attempt to eject exist-1 which is status: 'in_progress'
      try {
        validateSprintIntakePure({
          sprint: activeSprint,
          currentSprintItems: existingItems,
          incomingItem: incomingLarge,
          options: {
            ejectedItemIds: ['exist-1'], // in_progress item!
          },
        });
        expect.unreachable('Should have thrown error on in-progress ejection');
      } catch (err: any) {
        expect(err).toBeInstanceOf(SprintGuardrailError);
        expect(err.code).toBe('INVALID_EJECTION');
        expect(err.status).toBe(400);
        expect(err.message).toContain('Only unstarted items can be ejected');
      }
    });

    it('rejects with SCOPE_OVERFLOW if selected ejections total less than required_ejection_points', () => {
      const incomingNine: Partial<WorkItem> = {
        id: 'inc-huge',
        item_type: 'task',
        title: 'Huge 9-point item',
        metadata: { story_points: 9 }, // Needs 9, capacity 2 -> overflow 7
      };

      // Only eject exist-2 (5 points < 7 required)
      expect(() => {
        validateSprintIntakePure({
          sprint: activeSprint,
          currentSprintItems: existingItems,
          incomingItem: incomingNine,
          options: {
            ejectedItemIds: ['exist-2'],
          },
        });
      }).toThrowError(SprintGuardrailError);
    });

    it('rejects with INVALID_EJECTION when attempting to eject an item from a different sprint', () => {
      const incomingLarge: Partial<WorkItem> = {
        id: 'inc-large',
        item_type: 'task',
        title: 'Large 5-point item',
        metadata: { story_points: 5 },
      };

      const foreignItem: WorkItem = {
        id: 'foreign-1',
        tenant_id: 't-1',
        project_id: 'p-1',
        item_type: 'task',
        status: 'not_started',
        title: 'Backlog Item In Other Sprint',
        order_index: 4000,
        metadata: { story_points: 5, sprint: 'Other Sprint' },
        created_at: '2026-10-01',
        updated_at: '2026-10-01',
      };

      expect(() => {
        validateSprintIntakePure({
          sprint: activeSprint,
          currentSprintItems: existingItems,
          incomingItem: incomingLarge,
          options: {
            ejectedItems: [foreignItem],
          },
        });
      }).toThrowError(/does not belong to active sprint/);
    });

    it('uses leaf items only to avoid double counting parent and child story points', () => {
      const parentStory: WorkItem = {
        id: 'parent-1',
        tenant_id: 't-1',
        project_id: 'p-1',
        item_type: 'story',
        status: 'in_progress',
        title: 'Parent Story',
        order_index: 1000,
        metadata: { story_points: 8, sprint: 'Sprint 2026-Q4' },
        created_at: '2026-10-01',
        updated_at: '2026-10-01',
      };
      const childTask: WorkItem = {
        id: 'child-1',
        parent_id: 'parent-1',
        tenant_id: 't-1',
        project_id: 'p-1',
        item_type: 'task',
        status: 'in_progress',
        title: 'Child Task',
        order_index: 1010,
        metadata: { story_points: 8, sprint: 'Sprint 2026-Q4' },
        created_at: '2026-10-01',
        updated_at: '2026-10-01',
      };

      // Both have 8 points. Committed = 10.
      // If summed naively: 16 > 10 (overflow).
      // With leaf point calculation: only childTask counts (8 <= 10, capacity = 2).
      const incomingTwo: Partial<WorkItem> = {
        id: 'inc-2',
        item_type: 'task',
        title: '2-point leaf addition',
        metadata: { story_points: 2 },
      };

      const res = validateSprintIntakePure({
        sprint: { ...activeSprint, committed_points: 10 },
        currentSprintItems: [parentStory, childTask],
        incomingItem: incomingTwo,
      });

      expect(res.valid).toBe(true);
      expect(res.remaining_capacity).toBe(2);
    });
  });

  describe('P0 Emergency Override Flag', () => {
    const activeSprint = {
      id: 'sprint-q4',
      name: 'Sprint 2026-Q4',
      status: 'active',
      is_active: true,
      started_at: '2026-10-01T00:00:00Z',
      ends_at: '2026-10-11T00:00:00Z',
      committed_points: 10,
    };

    it('bypasses both capacity overflow and late runway limit when P0 emergency override is set', () => {
      const emergencyItem: Partial<WorkItem> = {
        id: 'p0-hotfix',
        item_type: 'story',
        title: 'P0 Security Vulnerability Patch',
        metadata: { story_points: 8, priority: 'P0' }, // 8 pts exceeds capacity & late runway limit
      };

      // Late runway: 90% elapsed
      const now = '2026-10-10T00:00:00Z';

      const res = validateSprintIntakePure({
        sprint: activeSprint,
        currentSprintItems: [{ id: 'ex-1', metadata: { story_points: 10 } } as any],
        incomingItem: emergencyItem,
        options: {
          now,
          overrideP0: true,
        },
      });

      expect(res.valid).toBe(true);
      expect(res.required_ejection_points).toBe(0);
    });

    it('bypasses restrictions when incoming item metadata priority is P0', () => {
      const emergencyItem: Partial<WorkItem> = {
        id: 'p0-db-down',
        item_type: 'story',
        title: 'Production Database Recovery',
        metadata: { story_points: 13, priority: 'P0' },
      };

      const res = validateSprintIntakePure({
        sprint: activeSprint,
        currentSprintItems: [{ id: 'ex-1', metadata: { story_points: 10 } } as any],
        incomingItem: emergencyItem,
      });

      expect(res.valid).toBe(true);
    });

    it('refuses overrideP0 bypass if incoming item is not actually P0/Critical priority', () => {
      const regularItem: Partial<WorkItem> = {
        id: 'regular-story',
        item_type: 'story',
        title: 'Low Priority Story with Fake Override',
        metadata: { story_points: 5, priority: 'Low' },
      };

      const now = '2026-10-09T00:00:00Z'; // 80% elapsed

      expect(() => {
        validateSprintIntakePure({
          sprint: activeSprint,
          currentSprintItems: [],
          incomingItem: regularItem,
          options: {
            now,
            overrideP0: true, // Should be ignored because item is not P0
          },
        });
      }).toThrowError(SprintGuardrailError);
    });
  });

  describe('Guardrail 3: Immutable Estimates Validation', () => {
    const activeSprint = {
      id: 'sprint-q4',
      name: 'Sprint 2026-Q4',
      status: 'active',
      is_active: true,
    };

    const plannedSprint = {
      id: 'sprint-q5',
      name: 'Sprint 2027-Q1',
      status: 'planned',
      is_active: false,
    };

    it('rejects story_points changes when item is assigned to an active sprint', () => {
      const currentItem: Partial<WorkItem> = {
        id: 'item-lock',
        metadata: { sprint: 'Sprint 2026-Q4', story_points: 5 },
      };

      expect(() => {
        validateEstimateImmutability(
          currentItem,
          { sprint: 'Sprint 2026-Q4', story_points: 8 },
          activeSprint
        );
      }).toThrowError(SprintGuardrailError);

      expect(() => {
        validateEstimateImmutability(
          currentItem,
          { sprint: 'Sprint 2026-Q4', story_points: 3 },
          activeSprint
        );
      }).toThrowError(SprintGuardrailError);
    });

    it('rejects points field changes when item is assigned to an active sprint', () => {
      const currentItem: Partial<WorkItem> = {
        id: 'item-lock-points',
        metadata: { sprint: 'Sprint 2026-Q4', points: 3 },
      };

      expect(() => {
        validateEstimateImmutability(
          currentItem,
          { sprint: 'Sprint 2026-Q4', points: 5 },
          activeSprint
        );
      }).toThrowError(SprintGuardrailError);
    });

    it('permits story_points changes when sprint is planned or not active', () => {
      const currentItem: Partial<WorkItem> = {
        id: 'item-planned',
        metadata: { sprint: 'Sprint 2027-Q1', story_points: 5 },
      };

      expect(() => {
        validateEstimateImmutability(
          currentItem,
          { sprint: 'Sprint 2027-Q1', story_points: 8 },
          plannedSprint
        );
      }).not.toThrow();
    });

    it('permits updates when story_points did not change', () => {
      const currentItem: Partial<WorkItem> = {
        id: 'item-active',
        metadata: { sprint: 'Sprint 2026-Q4', story_points: 5 },
      };

      expect(() => {
        validateEstimateImmutability(
          currentItem,
          { sprint: 'Sprint 2026-Q4', story_points: 5, title: 'Updated Title' },
          activeSprint
        );
      }).not.toThrow();
    });
  });

  describe('PostgreSQL Migration Script Integrity', () => {
    it('verifies 20261001000000_sprint_scope_guardrails.sql exists and contains trigger definitions', () => {
      const migrationPath = path.resolve(
        process.cwd(),
        'supabase/migrations/20261001000000_sprint_scope_guardrails.sql'
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const content = fs.readFileSync(migrationPath, 'utf8');

      // Schema verification
      expect(content).toContain('tracker.sprints');
      expect(content).toContain('is_active BOOLEAN');
      expect(content).toContain('started_at TIMESTAMPTZ');
      expect(content).toContain('ends_at TIMESTAMPTZ');
      expect(content).toContain('committed_points INTEGER');

      // Trigger verification
      expect(content).toContain('prevent_point_drift_on_active_sprint()');
      expect(content).toContain('ERRCODE = \'23514\'');
      expect(content).toContain('trg_prevent_point_drift_on_active_sprint');
    });
  });

  describe('Async validateSprintIntake with Database Lookup', () => {
    it('queries tenant, project settings, and items to enforce guardrails', async () => {
      const mockTenant = { id: 't-100', slug: 'pym-energy', name: 'PYM Energy' };
      const mockProjects = [
        {
          id: 'p-100',
          settings: {
            sprint_settings: {
              sprints: [
                {
                  id: 'sprint-active-1',
                  name: 'Active Sprint 1',
                  status: 'active',
                  is_active: true,
                  committed_points: 15,
                },
              ],
            },
          },
        },
      ];
      const mockItems: any[] = [
        {
          id: 'exist-a',
          project_id: 'p-100',
          metadata: { sprint: 'Active Sprint 1', story_points: 10 },
          status: 'in_progress',
        },
      ];

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
          };
        }
        if (table === 'sprints') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            or: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
          };
        }
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockResolvedValue({ data: mockProjects, error: null }),
          };
        }
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockResolvedValue({ data: mockItems, error: null }),
          };
        }
        return {};
      });

      // Capacity is 15 - 10 = 5 points. Incoming 3 points fits cleanly!
      const res = await validateSprintIntake('pym-energy', 'Active Sprint 1', {
        id: 'new-item',
        metadata: { story_points: 3 },
      });

      expect(res.valid).toBe(true);
      expect(res.remaining_capacity).toBe(5);
    });
  });

  describe('Configurable Guardrail Rules & Invariant Paradigms', () => {
    const activeSprint = {
      id: 'sprint-active-custom',
      name: 'Sprint Custom Rules',
      status: 'active',
      is_active: true,
      started_at: '2026-10-01T00:00:00Z',
      ends_at: '2026-10-11T00:00:00Z', // 10 days
      committed_points: 20,
    };

    it('honors custom late runway threshold and point limits', () => {
      // 70% elapsed: past default 60% threshold
      const now = '2026-10-08T00:00:00Z';
      const storyItem = {
        id: 'story-3pt',
        item_type: 'story',
        metadata: { story_points: 3 },
      };

      // With default rules (cutoff 60%, max 2 pts), 3 points is rejected
      expect(() =>
        validateSprintIntakePure({
          sprint: activeSprint,
          currentSprintItems: [],
          incomingItem: storyItem,
          options: { now },
        })
      ).toThrow(SprintGuardrailError);

      // With custom rules (cutoff 80%, max 2 pts), 70% elapsed is permitted
      const res1 = validateSprintIntakePure({
        sprint: activeSprint,
        currentSprintItems: [],
        incomingItem: storyItem,
        options: { now },
        rules: {
          late_runway_threshold: 0.80,
          late_runway_max_points: 2,
        },
      });
      expect(res1.valid).toBe(true);

      // With custom rules (cutoff 60%, max 5 pts), 3 points is permitted
      const res2 = validateSprintIntakePure({
        sprint: activeSprint,
        currentSprintItems: [],
        incomingItem: storyItem,
        options: { now },
        rules: {
          late_runway_threshold: 0.60,
          late_runway_max_points: 5,
        },
      });
      expect(res2.valid).toBe(true);
    });

    it('honors custom emergency priorities for guardrail bypass', () => {
      const now = '2026-10-09T00:00:00Z'; // 80% elapsed
      const urgentItem = {
        id: 'urgent-item',
        item_type: 'story',
        priority: 'URGENT',
        metadata: { story_points: 8 },
      };

      // By default, only P0 / CRITICAL / EMERGENCY are emergency priorities
      expect(() =>
        validateSprintIntakePure({
          sprint: activeSprint,
          currentSprintItems: [],
          incomingItem: urgentItem,
          options: { now },
        })
      ).toThrow(SprintGuardrailError);

      // With custom emergency_priorities including URGENT, it passes
      const res = validateSprintIntakePure({
        sprint: activeSprint,
        currentSprintItems: [],
        incomingItem: urgentItem,
        options: { now },
        rules: {
          emergency_priorities: ['URGENT', 'CRITICAL'],
        },
      });
      expect(res.valid).toBe(true);
    });

    it('permits estimate edits when lock_estimates_in_active_sprint is configured false', () => {
      const currentItem = {
        id: 'item-edit',
        metadata: { story_points: 3 },
      };

      // By default: throws ESTIMATE_LOCKED
      expect(() =>
        validateEstimateImmutability(currentItem, { story_points: 5 }, activeSprint)
      ).toThrow(SprintGuardrailError);

      // When configured false: does not throw
      expect(() =>
        validateEstimateImmutability(currentItem, { story_points: 5 }, activeSprint, {
          lock_estimates_in_active_sprint: false,
        })
      ).not.toThrow();
    });

    it('bypasses zero-sum requirement when enforce_zero_sum is configured false', () => {
      // 20 committed, already 18 active points. Incoming 8 points would overflow by 6 pts.
      const currentItems = [
        {
          id: 'existing-1',
          tenant_id: 't-1',
          project_id: 'p-1',
          order_index: 1,
          metadata: { story_points: 18 },
          title: 'Existing',
          status: 'in_progress',
          item_type: 'story',
          created_at: '',
          updated_at: '',
        },
      ];
      const incomingItem = {
        id: 'incoming',
        item_type: 'chore',
        metadata: { story_points: 8 },
      };

      // Default: rejects with SCOPE_OVERFLOW
      expect(() =>
        validateSprintIntakePure({
          sprint: activeSprint,
          currentSprintItems: currentItems,
          incomingItem,
        })
      ).toThrow(SprintGuardrailError);

      // When enforce_zero_sum: false, allows intake without ejection
      const res = validateSprintIntakePure({
        sprint: activeSprint,
        currentSprintItems: currentItems,
        incomingItem,
        rules: {
          enforce_zero_sum: false,
        },
      });
      expect(res.valid).toBe(true);
    });
  });
});
