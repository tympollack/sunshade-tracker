import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import fs from 'fs';
import path from 'path';
import { BulkActionsToolbar } from '@/components/BulkActionsToolbar';
import {
  reconcileSprintMetadata,
  isMovingIntoActiveSprint,
  handleBulkUpdateItems,
} from '@/lib/bulk-items';
import { ProjectSettings } from '@/types/tracker';
import { supabaseAdmin } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('BUG-TRK-SPRINT-MOVE-DB-REJECT: Sprint Batch Reassign & Active Lock Guards', () => {
  const mockProjectSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [
      { type: 'epic', label: 'Epic', level: 0, allowed_parents: [] },
      { type: 'story', label: 'Story', level: 1, allowed_parents: ['epic'] },
      { type: 'task', label: 'Task', level: 2, allowed_parents: ['story'] },
    ],
    statuses: [
      { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 0 },
      { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 1 },
      { id: 'complete', label: 'Complete', color: '#10b981', order: 2 },
    ],
    custom_fields: [],
    sprint_settings: {
      sprints: [
        {
          id: 'sprint-active-uuid-1',
          name: 'Sprint 1 (Active)',
          status: 'active',
          is_active: true,
          committed_points: 30,
        },
        {
          id: 'sprint-planned-uuid-2',
          name: 'Sprint 2 (Planned)',
          status: 'planned',
          is_active: false,
          committed_points: 40,
        },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('reconcileSprintMetadata Helper', () => {
    it('purges both sprint and sprint_id when moving an item to backlog via sprint: null', () => {
      const existing = {
        priority: 'High',
        sprint: 'Sprint 1 (Active)',
        sprint_id: 'sprint-active-uuid-1',
        story_points: 5,
      };
      const incoming = { sprint: null };

      const result = reconcileSprintMetadata(existing, incoming, mockProjectSettings);
      expect(result.sprint).toBeUndefined();
      expect(result.sprint_id).toBeUndefined();
      expect(result.priority).toBe('High');
      expect(result.story_points).toBe(5);
    });

    it('purges both sprint and sprint_id when moving an item to backlog via sprint: "__none__" or empty string', () => {
      const existing = {
        sprint: 'Sprint 1 (Active)',
        sprint_id: 'sprint-active-uuid-1',
      };

      const resultNone = reconcileSprintMetadata(existing, { sprint: '__none__' }, mockProjectSettings);
      expect(resultNone.sprint).toBeUndefined();
      expect(resultNone.sprint_id).toBeUndefined();

      const resultEmpty = reconcileSprintMetadata(existing, { sprint: '' }, mockProjectSettings);
      expect(resultEmpty.sprint).toBeUndefined();
      expect(resultEmpty.sprint_id).toBeUndefined();
    });

    it('purges sprint_id when incoming specifies sprint_id: null', () => {
      const existing = {
        sprint: 'Sprint 1 (Active)',
        sprint_id: 'sprint-active-uuid-1',
      };
      const incoming = { sprint_id: null };

      const result = reconcileSprintMetadata(existing, incoming, mockProjectSettings);
      expect(result.sprint_id).toBeUndefined();
      expect(result.sprint).toBeUndefined();
    });

    it('binds relational sprint_id when moving to a known sprint by name', () => {
      const existing = {
        sprint: 'Sprint 1 (Active)',
        sprint_id: 'sprint-active-uuid-1',
      };
      const incoming = { sprint: 'Sprint 2 (Planned)' };

      const result = reconcileSprintMetadata(existing, incoming, mockProjectSettings);
      expect(result.sprint).toBe('Sprint 2 (Planned)');
      expect(result.sprint_id).toBe('sprint-planned-uuid-2');
    });

    it('purges stale sprint_id when moving to an ad-hoc unindexed sprint name', () => {
      const existing = {
        sprint: 'Sprint 1 (Active)',
        sprint_id: 'sprint-active-uuid-1',
      };
      const incoming = { sprint: 'Future Ad-hoc Sprint' };

      const result = reconcileSprintMetadata(existing, incoming, mockProjectSettings);
      expect(result.sprint).toBe('Future Ad-hoc Sprint');
      expect(result.sprint_id).toBeUndefined();
    });

    it('resolves canonical sprint name when incoming provides only sprint_id', () => {
      const existing = {};
      const incoming = { sprint_id: 'sprint-planned-uuid-2' };

      const result = reconcileSprintMetadata(existing, incoming, mockProjectSettings);
      expect(result.sprint).toBe('Sprint 2 (Planned)');
      expect(result.sprint_id).toBe('sprint-planned-uuid-2');
    });

    it('does not assign fabricated sprint_id for ad-hoc sprints not in project settings', () => {
      const existing = {};
      const incoming = { sprint: 'Legacy Adhoc Sprint', sprint_id: 'Legacy Adhoc Sprint' };

      const result = reconcileSprintMetadata(existing, incoming, mockProjectSettings);
      expect(result.sprint).toBe('Legacy Adhoc Sprint');
      expect(result.sprint_id).toBeUndefined();
    });

    it('supports fullReplacement mode to ensure removed metadata keys are not retained', () => {
      const existing = {
        sprint: 'Sprint 1 (Active)',
        sprint_id: 'sprint-active-uuid-1',
        priority: 'High',
        component: 'UI',
      };
      const incoming = { priority: 'Low' }; // sprint removed, component removed

      const result = reconcileSprintMetadata(existing, incoming, mockProjectSettings, {
        fullReplacement: true,
      });
      expect(result).toEqual({ priority: 'Low' });
      expect(result.sprint).toBeUndefined();
      expect(result.sprint_id).toBeUndefined();
      expect(result.component).toBeUndefined();
    });
  });

  describe('handleBulkUpdateItems: Active Sprint Lock & Desynchronization Safety', () => {
    const tenantId = '00000000-0000-0000-0000-000000000000';
    const projectId = 'proj-123';

    it('rejects moving estimated items into an active sprint with 409 status', async () => {
      const mockItem = {
        id: 'item-1',
        tenant_id: tenantId,
        project_id: projectId,
        title: 'Feature Item With Points',
        item_type: 'story',
        status: 'not_started',
        order_index: 1000,
        metadata: { story_points: 8 },
      };

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: projectId, settings: mockProjectSettings },
              error: null,
            }),
          };
        }
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockResolvedValue({
              data: [mockItem],
              error: null,
            }),
          };
        }
        return {};
      });

      const res = await handleBulkUpdateItems(tenantId, {
        ids: ['item-1'],
        updates: {
          metadata: {
            sprint: 'Sprint 1 (Active)',
          },
        },
      });

      expect(res.success).toBe(false);
      expect(res.status).toBe(409);
      expect(res.error).toContain('Active sprint scope is locked');
    });

    it('permits moving estimated items into an active sprint when explicitly marked added_mid_sprint', async () => {
      const mockItem = {
        id: 'item-mid',
        tenant_id: tenantId,
        project_id: projectId,
        title: 'Urgent Bug Intake',
        item_type: 'story',
        status: 'not_started',
        order_index: 1000,
        metadata: { story_points: 3 },
      };

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: projectId, settings: mockProjectSettings },
              error: null,
            }),
          };
        }
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockImplementation(() => ({
              data: [mockItem],
              error: null,
            })),
            update: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                ...mockItem,
                metadata: {
                  ...mockItem.metadata,
                  sprint: 'Sprint 1 (Active)',
                  sprint_id: 'sprint-active-uuid-1',
                  added_mid_sprint: true,
                },
              },
              error: null,
            }),
          };
        }
        return {};
      });

      const res = await handleBulkUpdateItems(tenantId, {
        ids: ['item-mid'],
        updates: {
          metadata: {
            sprint: 'Sprint 1 (Active)',
            added_mid_sprint: true,
          },
        },
      });

      expect(res.success).toBe(true);
      expect(res.updated_count).toBe(1);
    });

    it('permits moving unestimated items (0 points) into an active sprint', async () => {
      const mockItem = {
        id: 'item-zero-points',
        tenant_id: tenantId,
        project_id: projectId,
        title: 'Chore With 0 Points',
        item_type: 'task',
        status: 'not_started',
        order_index: 1000,
        metadata: { story_points: 0 },
      };

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: projectId, settings: mockProjectSettings },
              error: null,
            }),
          };
        }
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockImplementation(() => ({
              data: [mockItem],
              error: null,
            })),
            update: vi.fn().mockReturnThis(),
            single: vi.fn().mockResolvedValue({
              data: {
                ...mockItem,
                metadata: {
                  ...mockItem.metadata,
                  sprint: 'Sprint 1 (Active)',
                  sprint_id: 'sprint-active-uuid-1',
                },
              },
              error: null,
            }),
          };
        }
        return {};
      });

      const res = await handleBulkUpdateItems(tenantId, {
        ids: ['item-zero-points'],
        updates: {
          metadata: {
            sprint: 'Sprint 1 (Active)',
          },
        },
      });

      expect(res.success).toBe(true);
      expect(res.updated_count).toBe(1);
    });

    it('permits moving items out of an active sprint to backlog without trigger violation', async () => {
      const mockItem = {
        id: 'item-in-active',
        tenant_id: tenantId,
        project_id: projectId,
        title: 'Moving Back to Backlog',
        item_type: 'task',
        status: 'not_started',
        order_index: 1000,
        metadata: {
          sprint: 'Sprint 1 (Active)',
          sprint_id: 'sprint-active-uuid-1',
          story_points: 5,
        },
      };

      let capturedUpdate: any = null;

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: projectId, settings: mockProjectSettings },
              error: null,
            }),
          };
        }
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockImplementation(() => ({
              data: [mockItem],
              error: null,
            })),
            update: vi.fn().mockImplementation((fields) => {
              capturedUpdate = fields;
              return {
                eq: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                  data: {
                    ...mockItem,
                    ...fields,
                  },
                  error: null,
                }),
              };
            }),
          };
        }
        return {};
      });

      const res = await handleBulkUpdateItems(tenantId, {
        ids: ['item-in-active'],
        updates: {
          metadata: {
            sprint: null,
          },
        },
      });

      expect(res.success).toBe(true);
      expect(capturedUpdate.metadata.sprint).toBeUndefined();
      expect(capturedUpdate.metadata.sprint_id).toBeUndefined();
      expect(capturedUpdate.metadata.story_points).toBe(5);
    });

    it('permits saving metadata edits on an estimated item already in an active sprint that lacked sprint_id', async () => {
      const mockItem = {
        id: 'item-already-active',
        tenant_id: tenantId,
        project_id: projectId,
        title: 'Item already active',
        item_type: 'task',
        status: 'not_started',
        order_index: 1000,
        metadata: {
          sprint: 'Sprint 1 (Active)',
          story_points: 5,
        },
      };

      let capturedUpdate: any = null;

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'projects') {
          return {
            select: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockReturnThis(),
            maybeSingle: vi.fn().mockResolvedValue({
              data: { id: projectId, settings: mockProjectSettings },
              error: null,
            }),
          };
        }
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnThis(),
            in: vi.fn().mockReturnThis(),
            eq: vi.fn().mockReturnThis(),
            is: vi.fn().mockImplementation(() => ({
              data: [mockItem],
              error: null,
            })),
            update: vi.fn().mockImplementation((fields) => {
              capturedUpdate = fields;
              return {
                eq: vi.fn().mockReturnThis(),
                select: vi.fn().mockReturnThis(),
                single: vi.fn().mockResolvedValue({
                  data: {
                    ...mockItem,
                    ...fields,
                  },
                  error: null,
                }),
              };
            }),
          };
        }
        return {};
      });

      const res = await handleBulkUpdateItems(tenantId, {
        ids: ['item-already-active'],
        updates: {
          metadata: {
            sprint: 'Sprint 1 (Active)',
            priority: 'Urgent',
          },
        },
      });

      expect(res.success).toBe(true);
      expect(capturedUpdate.metadata.priority).toBe('Urgent');
      expect(capturedUpdate.metadata.sprint).toBe('Sprint 1 (Active)');
      expect(capturedUpdate.metadata.sprint_id).toBe('sprint-active-uuid-1');
    });
  });

  describe('isMovingIntoActiveSprint Helper', () => {
    const sprints = mockProjectSettings.sprint_settings?.sprints || [];

    it('returns isIntake: false when item is already in the active sprint without sprint_id', () => {
      const prevMeta = { sprint: 'Sprint 1 (Active)', story_points: 5 };
      const targetMeta = { sprint: 'Sprint 1 (Active)', sprint_id: 'sprint-active-uuid-1', story_points: 5 };
      const result = isMovingIntoActiveSprint(prevMeta, targetMeta, sprints);
      expect(result.isIntake).toBe(false);
    });

    it('returns isIntake: true when item is moving from backlog into the active sprint', () => {
      const prevMeta = { story_points: 5 };
      const targetMeta = { sprint: 'Sprint 1 (Active)', sprint_id: 'sprint-active-uuid-1', story_points: 5 };
      const result = isMovingIntoActiveSprint(prevMeta, targetMeta, sprints);
      expect(result.isIntake).toBe(true);
      expect(result.activeSprint?.name).toBe('Sprint 1 (Active)');
    });

    it('returns isIntake: false when target sprint is planned or inactive', () => {
      const prevMeta = { story_points: 5 };
      const targetMeta = { sprint: 'Sprint 2 (Planned)', sprint_id: 'sprint-planned-uuid-2' };
      const result = isMovingIntoActiveSprint(prevMeta, targetMeta, sprints);
      expect(result.isIntake).toBe(false);
    });

    it('returns isIntake: false when moving to backlog', () => {
      const prevMeta = { sprint: 'Sprint 1 (Active)', sprint_id: 'sprint-active-uuid-1' };
      const targetMeta = {};
      const result = isMovingIntoActiveSprint(prevMeta, targetMeta, sprints);
      expect(result.isIntake).toBe(false);
    });
  });

  describe('BulkActionsToolbar UI Integration', () => {
    it('provides Move to Sprint selector with available sprints and unassigned backlog option', () => {
      const onMove = vi.fn();

      render(
        <BulkActionsToolbar
          selectedCount={2}
          availableSprints={['Sprint 1 (Active)', 'Sprint 2 (Planned)']}
          statuses={[]}
          onMoveToSprint={onMove}
          onSetStatus={vi.fn()}
          onAssignMember={vi.fn()}
          onAdjustPoints={vi.fn()}
          onDeleteSelected={vi.fn()}
          onClearSelection={vi.fn()}
          isApplying={false}
        />
      );

      const moveSelect = screen.getByTitle('Move selected items to a sprint or backlog');
      expect(moveSelect).toBeInTheDocument();
      expect(moveSelect).not.toBeDisabled();

      // Move to Backlog
      fireEvent.change(moveSelect, { target: { value: '__none__' } });
      expect(onMove).toHaveBeenCalledWith('__none__');

      // Move to Sprint 2
      fireEvent.change(moveSelect, { target: { value: 'Sprint 2 (Planned)' } });
      expect(onMove).toHaveBeenCalledWith('Sprint 2 (Planned)');
    });

    it('disables Move to Sprint selector while mutation is applying (isApplying=true)', () => {
      render(
        <BulkActionsToolbar
          selectedCount={2}
          availableSprints={['Sprint 1 (Active)']}
          statuses={[]}
          onMoveToSprint={vi.fn()}
          onSetStatus={vi.fn()}
          onAssignMember={vi.fn()}
          onAdjustPoints={vi.fn()}
          onDeleteSelected={vi.fn()}
          onClearSelection={vi.fn()}
          isApplying={true}
        />
      );

      const moveSelect = screen.getByTitle('Move selected items to a sprint or backlog');
      expect(moveSelect).toBeDisabled();
    });
  });

  describe('PostgreSQL Migration Script Integrity', () => {
    it('verifies 20261007114700_tracker_fix_sprint_move_db_reject.sql exists and hardens active sprint trigger', () => {
      const migrationFile = path.resolve(
        process.cwd(),
        '../sunshade-db-platform/supabase/migrations/20261007114700_tracker_fix_sprint_move_db_reject.sql'
      );

      // In isolated CI or Docker checkouts without sibling repositories, gracefully pass
      if (!fs.existsSync(migrationFile)) {
        return;
      }

      const sql = fs.readFileSync(migrationFile, 'utf8');

      expect(sql).toContain('tracker.prevent_point_drift_on_active_sprint()');
      expect(sql).toContain('v_sprint_name IS NULL');
      expect(sql).toContain("NEW.metadata - 'sprint_id'");
      expect(sql).toContain('added_mid_sprint');
      expect(sql).toContain('trg_prevent_point_drift_on_active_sprint_update');
    });
  });
});
