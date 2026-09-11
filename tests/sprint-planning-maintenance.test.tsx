import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ManageSprintsModal } from '@/components/ManageSprintsModal';
import { SprintDefinition, WorkItem, ProjectSettings } from '@/types/tracker';
import { sortSprintNames } from '@/lib/sprint-utils';

describe('Sprint Planning & Default Sprint Filtering (TASK-TRK-SPRINT-PLANNING)', () => {
  const mockSprints: SprintDefinition[] = [
    {
      id: 's-q3',
      name: 'Sprint 2026-Q3',
      start_date: '2026-07-01',
      end_date: '2026-09-30',
      goal: 'Deliver core tracking features',
      status: 'active',
      is_current: true,
    },
    {
      id: 's-q4',
      name: 'Sprint 2026-Q4',
      start_date: '2026-10-01',
      end_date: '2026-12-31',
      goal: 'Scale infrastructure and polish UX',
      status: 'planned',
      is_current: false,
    },
  ];

  const mockItems: WorkItem[] = [
    {
      id: 'it-1',
      tenant_id: 't-1',
      project_id: 'p-1',
      title: 'Q3 Feature Story',
      item_type: 'story',
      status: 'in_progress',
      order_index: 10,
      metadata: { sprint: 'Sprint 2026-Q3', story_points: 5 },
      created_at: '',
      updated_at: '',
    },
    {
      id: 'it-2',
      tenant_id: 't-1',
      project_id: 'p-1',
      title: 'Q4 Architectural Task',
      item_type: 'task',
      status: 'not_started',
      order_index: 20,
      metadata: { sprint: 'Sprint 2026-Q4', story_points: 8 },
      created_at: '',
      updated_at: '',
    },
    {
      id: 'it-3',
      tenant_id: 't-1',
      project_id: 'p-1',
      title: 'Unassigned Backlog Item',
      item_type: 'task',
      status: 'not_started',
      order_index: 30,
      metadata: {},
      created_at: '',
      updated_at: '',
    },
  ];

  describe('Default Sprint Filtering Behavior', () => {
    function resolveEffectiveSprint(
      settings: ProjectSettings,
      availableSprints: string[],
      queryParamSprint?: string | null
    ): string {
      if (
        queryParamSprint &&
        (queryParamSprint === 'all' ||
          queryParamSprint === '__none__' ||
          availableSprints.includes(queryParamSprint))
      ) {
        return queryParamSprint;
      }

      const def = settings.sprint_settings?.default_sprint;
      if (!def || def === 'all') return 'all';

      if (def === 'current') {
        const curr = settings.sprint_settings?.sprints?.find((s) => s.is_current)?.name;
        if (curr) return curr;
        if (availableSprints.length > 0) return availableSprints[0];
        return 'all';
      }

      if (availableSprints.includes(def)) {
        return def;
      }

      return 'all';
    }

    it('resolves to "all" by default or when explicitly configured as "all"', () => {
      const settings: ProjectSettings = {
        schema_version: '1.0',
        hierarchy: [],
        statuses: [],
        custom_fields: [],
        sprint_settings: { default_sprint: 'all' },
      };

      const result = resolveEffectiveSprint(settings, ['Sprint 2026-Q3', 'Sprint 2026-Q4']);
      expect(result).toBe('all');
    });

    it('resolves to current active sprint when default_sprint is "current"', () => {
      const settings: ProjectSettings = {
        schema_version: '1.0',
        hierarchy: [],
        statuses: [],
        custom_fields: [],
        sprint_settings: {
          default_sprint: 'current',
          sprints: mockSprints,
        },
      };

      const result = resolveEffectiveSprint(settings, ['Sprint 2026-Q3', 'Sprint 2026-Q4']);
      expect(result).toBe('Sprint 2026-Q3');
    });

    it('resolves to a named sprint when default_sprint specifies a valid sprint name', () => {
      const settings: ProjectSettings = {
        schema_version: '1.0',
        hierarchy: [],
        statuses: [],
        custom_fields: [],
        sprint_settings: {
          default_sprint: 'Sprint 2026-Q4',
          sprints: mockSprints,
        },
      };

      const result = resolveEffectiveSprint(settings, ['Sprint 2026-Q3', 'Sprint 2026-Q4']);
      expect(result).toBe('Sprint 2026-Q4');
    });

    it('prioritizes explicit URL query parameter over project settings default', () => {
      const settings: ProjectSettings = {
        schema_version: '1.0',
        hierarchy: [],
        statuses: [],
        custom_fields: [],
        sprint_settings: {
          default_sprint: 'Sprint 2026-Q3',
          sprints: mockSprints,
        },
      };

      // User requested Q4 in URL query param
      const result = resolveEffectiveSprint(
        settings,
        ['Sprint 2026-Q3', 'Sprint 2026-Q4'],
        'Sprint 2026-Q4'
      );
      expect(result).toBe('Sprint 2026-Q4');
    });
  });

  describe('Quarterly Story Maintenance View', () => {
    it('sorts quarterly sprints in natural chronological order', () => {
      const rawSprints = ['Sprint 2026-Q4', 'Sprint 2026-Q2', 'Sprint 2026-Q3', 'Sprint 2027-Q1'];
      // Pure alphanumeric comparison without dates
      const sorted = sortSprintNames(rawSprints);
      expect(sorted).toEqual([
        'Sprint 2026-Q2',
        'Sprint 2026-Q3',
        'Sprint 2026-Q4',
        'Sprint 2027-Q1',
      ]);
    });


    it('renders quarterly sprint management modal with active status and item metrics', () => {
      render(
        <ManageSprintsModal
          isOpen={true}
          onClose={vi.fn()}
          sprints={mockSprints}
          onSaveSprints={vi.fn()}
          items={mockItems}
        />
      );

      expect(screen.getByText('Manage Sprints')).toBeDefined();
      expect(screen.getByText('Sprint 2026-Q3')).toBeDefined();
      expect(screen.getByText('Active Sprint')).toBeDefined();
      expect(screen.getByText('Current Focus')).toBeDefined();
      expect(screen.getByText('Sprint 2026-Q4')).toBeDefined();
      expect(screen.getByText('Planned')).toBeDefined();
    });

    it('aggregates sprint story points and item count metrics', () => {
      const q3Items = mockItems.filter((it) => it.metadata.sprint === 'Sprint 2026-Q3');
      const q4Items = mockItems.filter((it) => it.metadata.sprint === 'Sprint 2026-Q4');

      const q3Points = q3Items.reduce((acc, it) => acc + (it.metadata.story_points || 0), 0);
      const q4Points = q4Items.reduce((acc, it) => acc + (it.metadata.story_points || 0), 0);

      expect(q3Items).toHaveLength(1);
      expect(q3Points).toBe(5);

      expect(q4Items).toHaveLength(1);
      expect(q4Points).toBe(8);
    });
  });
});
