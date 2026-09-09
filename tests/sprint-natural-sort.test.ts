import { describe, it, expect } from 'vitest';
import {
  compareSprints,
  sortSprintNames,
  formatSprintDateRange,
  getSprintStatusBadge,
  isItemImmutableDueToCompletedSprint,
} from '@/lib/sprint-utils';
import { SprintDefinition, WorkItem, ProjectSettings } from '@/types/tracker';

describe('Sprint Utils & Natural Chronological Sorting (TASK-TRK-SPRINT-NATURAL-SORT)', () => {
  it('sorts sprint names with natural alphanumeric ordering', () => {
    const rawSprints = ['Sprint 10', 'Sprint 2', 'Sprint 1', 'Sprint 21', 'Sprint 3'];
    const sorted = sortSprintNames(rawSprints);
    expect(sorted).toEqual(['Sprint 1', 'Sprint 2', 'Sprint 3', 'Sprint 10', 'Sprint 21']);
  });

  it('orders quarterly sprints naturally', () => {
    const raw = ['Sprint 2026-Q4', 'Sprint 2026-Q1', 'Sprint 2026-Q3', 'Sprint 2026-Q2'];
    const sorted = sortSprintNames(raw);
    expect(sorted).toEqual([
      'Sprint 2026-Q1',
      'Sprint 2026-Q2',
      'Sprint 2026-Q3',
      'Sprint 2026-Q4',
    ]);
  });

  it('prioritizes start_date chronological order when definitions are present', () => {
    const sprintDefs: SprintDefinition[] = [
      { id: '1', name: 'Alpha Sprint', start_date: '2026-04-01', status: 'planned' },
      { id: '2', name: 'Zeta Sprint', start_date: '2026-01-15', status: 'completed' },
      { id: '3', name: 'Beta Sprint', start_date: '2026-02-01', status: 'active' },
    ];
    const sorted = sortSprintNames(['Alpha Sprint', 'Zeta Sprint', 'Beta Sprint'], sprintDefs);
    // Zeta (Jan 15) -> Beta (Feb 01) -> Alpha (Apr 01)
    expect(sorted).toEqual(['Zeta Sprint', 'Beta Sprint', 'Alpha Sprint']);
  });

  it('places sprints with dates ahead of sprints without dates, then sorts alphabetically', () => {
    const sprintDefs: SprintDefinition[] = [
      { id: '1', name: 'Ad-hoc Sprint', status: 'planned' },
      { id: '2', name: 'Sprint 2', start_date: '2026-03-01', status: 'active' },
    ];
    const sorted = sortSprintNames(['Ad-hoc Sprint', 'Sprint 2'], sprintDefs);
    expect(sorted).toEqual(['Sprint 2', 'Ad-hoc Sprint']);
  });

  it('formats sprint date ranges accurately', () => {
    expect(formatSprintDateRange('2026-09-01', '2026-09-14')).toMatch(/Sep 1.*Sep 14.*2026/);
    expect(formatSprintDateRange('2026-09-01', null)).toMatch(/Starts.*Sep 1.*2026/);
    expect(formatSprintDateRange(null, '2026-09-30')).toMatch(/Ends.*Sep 30.*2026/);
    expect(formatSprintDateRange(null, null)).toBeNull();
  });

  it('returns appropriate styling badges for sprint status', () => {
    expect(getSprintStatusBadge('active').label).toBe('Active Sprint');
    expect(getSprintStatusBadge('active').bg).toContain('emerald');
    expect(getSprintStatusBadge('completed').label).toBe('Completed Sprint');
    expect(getSprintStatusBadge('completed').bg).toContain('purple');
    expect(getSprintStatusBadge('planned').label).toBe('Planned');
    expect(getSprintStatusBadge('planned').bg).toContain('blue');
  });

  it('evaluates item immutability in completed sprints', () => {
    const settings: ProjectSettings = {
      schema_version: '1.0',
      hierarchy: [],
      statuses: [],
      custom_fields: [],
      sprint_settings: {
        sprints: [
          { id: 's1', name: 'Sprint 2026-Q1', status: 'completed' },
          { id: 's2', name: 'Sprint 2026-Q2', status: 'active' },
        ],
      },
    };

    const completedInCompletedSprint: WorkItem = {
      id: 'i1',
      tenant_id: 't1',
      project_id: 'p1',
      item_type: 'task',
      status: 'complete',
      title: 'Done item',
      order_index: 1000,
      metadata: { sprint: 'Sprint 2026-Q1' },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const inProgressInCompletedSprint: WorkItem = {
      ...completedInCompletedSprint,
      id: 'i2',
      status: 'in_progress',
    };

    const completedInActiveSprint: WorkItem = {
      ...completedInCompletedSprint,
      id: 'i3',
      metadata: { sprint: 'Sprint 2026-Q2' },
    };

    const backlogItem: WorkItem = {
      ...completedInCompletedSprint,
      id: 'i4',
      metadata: {},
    };

    expect(isItemImmutableDueToCompletedSprint(completedInCompletedSprint, settings)).toBe(true);
    expect(isItemImmutableDueToCompletedSprint(inProgressInCompletedSprint, settings)).toBe(false);
    expect(isItemImmutableDueToCompletedSprint(completedInActiveSprint, settings)).toBe(false);
    expect(isItemImmutableDueToCompletedSprint(backlogItem, settings)).toBe(false);
  });
});
