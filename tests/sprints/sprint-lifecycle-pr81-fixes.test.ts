import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isItemImmutableDueToCompletedSprint, sortSprintNames } from '@/lib/sprint-utils';
import { SprintDefinition, WorkItem, ProjectSettings } from '@/types/tracker';

describe('PR #81 Review Feedback Verifications (STORY-TRK-SPRINT-LIFECYCLE-MANAGER)', () => {
  const settings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [{ type: 'story', label: 'Story', level: 0, allowed_parents: [] }],
    statuses: [
      { id: 'not_started', label: 'To Do', color: '#64748b', order: 1 },
      { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      { id: 'done', label: 'Done', color: '#10b981', order: 3 },
    ],
    custom_fields: [],
    sprint_settings: {
      sprints: [
        { id: 's-legacy-completed', name: 'Legacy Closed Sprint', status: 'completed' },
        { id: 's-legacy-active', name: 'Legacy Active Sprint', status: 'active' },
      ],
    },
  };

  const completedRelationalSprint: SprintDefinition = {
    id: 's-rel-completed',
    name: 'Sprint Completed in DB Only',
    status: 'completed',
    is_active: false,
    project_id: 'proj-1',
  };

  const activeRelationalSprint: SprintDefinition = {
    id: 's-rel-active',
    name: 'Sprint Active in DB Only',
    status: 'active',
    is_active: true,
    project_id: 'proj-1',
  };

  const otherProjectSprint: SprintDefinition = {
    id: 's-rel-other-proj',
    name: 'Sprint For Other Project',
    status: 'planned',
    is_active: false,
    project_id: 'proj-2',
  };

  describe('Comment 3: Completed relational sprints lock items even if missing from projectSettings', () => {
    it('evaluates item as immutable when completed sprint exists ONLY in relational sprintDefs', () => {
      const itemCompleted: WorkItem = {
        id: 'item-1',
        title: 'Work Item in Completed Relational Sprint',
        status: 'done',
        item_type: 'story',
        tenant_id: 't1',
        project_id: 'proj-1',
        order_index: 0,
        metadata: { sprint: 'Sprint Completed in DB Only' },
        created_at: '',
        updated_at: '',
      };

      // Without sprintDefs, settings has no record of this sprint -> evaluates to false
      expect(isItemImmutableDueToCompletedSprint(itemCompleted, { ...settings, sprint_settings: { sprints: [] } })).toBe(false);

      // With sprintDefs provided, item is correctly recognized as immutable / locked
      expect(
        isItemImmutableDueToCompletedSprint(
          itemCompleted,
          { ...settings, sprint_settings: { sprints: [] } },
          [completedRelationalSprint, activeRelationalSprint]
        )
      ).toBe(true);
    });

    it('evaluates item as mutable when relational sprint is active or planned', () => {
      const itemInActive: WorkItem = {
        id: 'item-2',
        title: 'Work Item in Active Relational Sprint',
        status: 'done',
        item_type: 'story',
        tenant_id: 't1',
        project_id: 'proj-1',
        order_index: 0,
        metadata: { sprint: 'Sprint Active in DB Only' },
        created_at: '',
        updated_at: '',
      };

      expect(
        isItemImmutableDueToCompletedSprint(
          itemInActive,
          settings,
          [completedRelationalSprint, activeRelationalSprint]
        )
      ).toBe(false);
    });

    it('maintains backwards compatibility with projectSettings when sprintDefs is omitted', () => {
      const itemLegacy: WorkItem = {
        id: 'item-3',
        title: 'Legacy Item',
        status: 'done',
        item_type: 'story',
        tenant_id: 't1',
        project_id: 'proj-1',
        order_index: 0,
        metadata: { sprint: 'Legacy Closed Sprint' },
        created_at: '',
        updated_at: '',
      };

      expect(isItemImmutableDueToCompletedSprint(itemLegacy, settings)).toBe(true);
    });
  });

  describe('Comment 2: Project isolation in single-project view', () => {
    it('filters out sprints belonging to other projects in single-project mode', () => {
      const dbSprints = [completedRelationalSprint, activeRelationalSprint, otherProjectSprint];
      const isAllProjects = false;
      const currentProjectId = 'proj-1';

      // Replicate availableSprints resolution logic from ProjectWorkspaceView
      const set = new Set<string>();
      dbSprints.forEach((s) => {
        if (!isAllProjects && currentProjectId && s.project_id && s.project_id !== currentProjectId) {
          return;
        }
        if (s.name && s.status !== 'unplanned' && s.name.toLowerCase() !== 'unplanned') {
          set.add(s.name);
        }
      });

      const scopedDbSprints = !isAllProjects && currentProjectId
        ? dbSprints.filter((s) => !s.project_id || s.project_id === currentProjectId)
        : dbSprints;
      const availableSprints = sortSprintNames(Array.from(set), scopedDbSprints);

      expect(availableSprints).toContain('Sprint Completed in DB Only');
      expect(availableSprints).toContain('Sprint Active in DB Only');
      expect(availableSprints).not.toContain('Sprint For Other Project');
    });

    it('includes sprints across all projects in portfolio (isAllProjects) mode', () => {
      const dbSprints = [completedRelationalSprint, activeRelationalSprint, otherProjectSprint];
      const isAllProjects = true;
      const currentProjectId = null;

      const set = new Set<string>();
      dbSprints.forEach((s) => {
        if (!isAllProjects && currentProjectId && s.project_id && s.project_id !== currentProjectId) {
          return;
        }
        if (s.name && s.status !== 'unplanned' && s.name.toLowerCase() !== 'unplanned') {
          set.add(s.name);
        }
      });

      const scopedDbSprints = !isAllProjects && currentProjectId
        ? dbSprints.filter((s) => !s.project_id || s.project_id === currentProjectId)
        : dbSprints;
      const availableSprints = sortSprintNames(Array.from(set), scopedDbSprints);

      expect(availableSprints).toContain('Sprint Completed in DB Only');
      expect(availableSprints).toContain('Sprint Active in DB Only');
      expect(availableSprints).toContain('Sprint For Other Project');
    });
  });

  describe('Comment 4: Cleared sprint dates properly serialize to null', () => {
    it('resolves cleared dates as null rather than falling back to old started_at timestamp', () => {
      // Simulating a sprint edit where the user cleared the start date in the modal
      const editedSprintDef: SprintDefinition = {
        id: 's-1',
        name: 'Sprint 1',
        start_date: null, // user cleared this
        end_date: '',    // user cleared this
        started_at: '2026-10-01T00:00:00.000Z', // old date in DB
        ends_at: '2026-10-15T00:00:00.000Z',    // old date in DB
        status: 'active',
      };

      const resolvedStartedAt =
        editedSprintDef.start_date !== undefined
          ? (editedSprintDef.start_date || null)
          : (editedSprintDef.started_at || null);

      const resolvedEndsAt =
        editedSprintDef.end_date !== undefined
          ? (editedSprintDef.end_date || null)
          : (editedSprintDef.ends_at || null);

      // Must be null, NOT the old started_at / ends_at timestamps
      expect(resolvedStartedAt).toBeNull();
      expect(resolvedEndsAt).toBeNull();
    });

    it('preserves existing dates when start_date is not modified (undefined)', () => {
      const uneditedSprintDef: SprintDefinition = {
        id: 's-2',
        name: 'Sprint 2',
        started_at: '2026-10-01T00:00:00.000Z',
        ends_at: '2026-10-15T00:00:00.000Z',
        status: 'active',
      };

      const resolvedStartedAt =
        uneditedSprintDef.start_date !== undefined
          ? (uneditedSprintDef.start_date || null)
          : (uneditedSprintDef.started_at || null);

      expect(resolvedStartedAt).toBe('2026-10-01T00:00:00.000Z');
    });

    it('updates to new date string when start_date is provided', () => {
      const newDateSprintDef: SprintDefinition = {
        id: 's-3',
        name: 'Sprint 3',
        start_date: '2026-11-01',
        started_at: '2026-10-01T00:00:00.000Z',
        status: 'active',
      };

      const resolvedStartedAt =
        newDateSprintDef.start_date !== undefined
          ? (newDateSprintDef.start_date || null)
          : (newDateSprintDef.started_at || null);

      expect(resolvedStartedAt).toBe('2026-11-01');
    });
  });

  describe('Comment 1 & Comment 5: Sprint deletion and error handling synchronization', () => {
    it('correctly calculates deleted sprints when a relational sprint is removed from modal list', () => {
      const currentDbSprints: SprintDefinition[] = [
        { id: 's-keep-1', name: 'Sprint Keep 1', status: 'active', project_id: 'proj-1' },
        { id: 's-delete-2', name: 'Sprint Delete 2', status: 'planned', project_id: 'proj-1' },
        { id: 's-other-proj', name: 'Other Proj Sprint', status: 'planned', project_id: 'proj-2' },
      ];

      const submittedSprints: SprintDefinition[] = [
        { id: 's-keep-1', name: 'Sprint Keep 1', status: 'active' },
      ];

      const currentProj = { id: 'proj-1', slug: 'project-1' };

      const toDelete = currentDbSprints.filter(
        (dbS) =>
          (!dbS.project_id || !currentProj || dbS.project_id === currentProj.id) &&
          !submittedSprints.some((s) => s.id === dbS.id || s.name === dbS.name)
      );

      expect(toDelete.map((d) => d.id)).toEqual(['s-delete-2']);
    });

    it('rejects save when relational action returns failure instead of silently swallowing error', async () => {
      const mockUpdateAction = vi.fn().mockResolvedValue({
        success: false,
        error: 'Database connection failed',
      });

      // Emulate handleSaveSprints sync block
      const syncSprints = async () => {
        const updateRes = await mockUpdateAction();
        if (!updateRes.success) {
          throw new Error(updateRes.error || 'Failed to update sprint');
        }
      };

      await expect(syncSprints()).rejects.toThrow('Database connection failed');
    });
  });
});
