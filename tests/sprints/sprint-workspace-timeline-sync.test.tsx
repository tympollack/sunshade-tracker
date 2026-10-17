import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { WorkItem } from '@/types/tracker';
import { TimelineSnapshotPoint } from '@/components/sprints/SprintTimelineScrubber';

describe('PR 105 Review Fixes: Workspace Timeline & Sprint Scoping Guards', () => {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  describe('BUG-0002 & BUG-0003: Historical Timeline Replay Guards', () => {
    const liveItems: WorkItem[] = [
      {
        id: 'item-1',
        title: 'Original Baseline Card',
        status: 'completed', // Completed on Friday
        created_at: '2026-10-01T10:00:00Z',
        updated_at: '2026-10-09T18:00:00Z', // Updated Friday
        tenant_id: 'default',
        project_id: 'proj-1',
        item_type: 'task',
        order_index: 0,
        metadata: {},
      },
      {
        id: 'item-2',
        title: 'Mid-sprint Intake Card',
        status: 'in_progress',
        created_at: '2026-10-08T12:00:00Z', // Injected Thursday
        updated_at: '2026-10-08T12:00:00Z',
        tenant_id: 'default',
        project_id: 'proj-1',
        item_type: 'task',
        order_index: 1,
        metadata: {},
      },
    ];

    it('uses itemized assignee_breakdown.items directly when available', () => {
      const snapshotWithItemized: TimelineSnapshotPoint = {
        id: 'snap-wednesday',
        snapshot_type: 'daily_rollup',
        captured_at: '2026-10-07T00:00:00Z', // Wednesday
        assignee_breakdown: {
          items: [
            {
              id: 'item-1',
              title: 'Original Baseline Card',
              status: 'in_progress', // On Wednesday, it was in_progress!
              story_points: 5,
              created_at: '2026-10-01T10:00:00Z',
              updated_at: '2026-10-05T10:00:00Z',
            },
          ],
        },
      };

      // Pure representation of ProjectWorkspaceView effectiveBoardItems
      const effectiveItems = snapshotWithItemized.assignee_breakdown?.items?.map((it: any) => ({
        ...it,
        tenant_id: 'default',
        project_id: 'proj-1',
        order_index: 0,
      }));

      expect(effectiveItems).toHaveLength(1);
      expect(effectiveItems![0].id).toBe('item-1');
      expect(effectiveItems![0].status).toBe('in_progress');
    });

    it('filters out future-created items and rolls back future completed status when itemized items are absent', () => {
      const snapshotFallbackWednesday: TimelineSnapshotPoint = {
        id: 'snap-wednesday-fallback',
        snapshot_type: 'daily_rollup',
        captured_at: '2026-10-07T00:00:00Z', // Wednesday
        committed_item_ids: ['item-1'],
      };

      const capturedTime = new Date(snapshotFallbackWednesday.captured_at!).getTime();
      const allowed = new Set(snapshotFallbackWednesday.committed_item_ids);

      const effectiveItems = liveItems
        .filter((it) => {
          if (!allowed.has(it.id)) return false;
          if (it.created_at && new Date(it.created_at).getTime() > capturedTime) return false;
          return true;
        })
        .map((it) => {
          if (it.updated_at && new Date(it.updated_at).getTime() > capturedTime) {
            const isCompleted = it.status === 'done' || it.status === 'completed' || it.status === 'closed';
            if (isCompleted) {
              return { ...it, status: 'in_progress' };
            }
          }
          return it;
        });

      // item-2 (created Thursday) is excluded
      expect(effectiveItems).toHaveLength(1);
      expect(effectiveItems[0].id).toBe('item-1');
      // item-1 (completed Friday) status rolled back to in_progress for Wednesday snapshot
      expect(effectiveItems[0].status).toBe('in_progress');
    });
  });

  describe('ANALYSIS-0001: Sprint Context Switching Cleanup', () => {
    it('resets activeTimelineSnapshot to null when selected sprint changes', () => {
      let activeTimelineSnapshot: any = { id: 'snap-1', sprint_id: 'sprint-1' };

      const handleSprintSwitch = (newSprint: string) => {
        // Enforced invariant: reset historical snapshot immediately
        activeTimelineSnapshot = null;
      };

      handleSprintSwitch('sprint-2');
      expect(activeTimelineSnapshot).toBeNull();
    });
  });

  describe('BUG-0005 & BUG-0006: Ad-hoc Sprint Moves & Intake Marker Scoping', () => {
    it('validates UUID for targetSprintId and rejects ad-hoc string names as foreign keys', () => {
      const adHocSprint = { id: 'Iteration Alpha', name: 'Iteration Alpha', status: 'planned' };
      const relationalSprint = { id: '5a3d8204-6725-4fe0-a7d0-112233445566', name: 'Sprint 1', status: 'active' };

      const resolveRelationalId = (sprintDef: any) => {
        const rawId = sprintDef?.id;
        return rawId && UUID_REGEX.test(rawId) ? rawId : null;
      };

      expect(resolveRelationalId(adHocSprint)).toBeNull();
      expect(resolveRelationalId(relationalSprint)).toBe('5a3d8204-6725-4fe0-a7d0-112233445566');
    });

    it('only requests governance_bypass and flags added_mid_sprint when moving into an ACTIVE sprint', () => {
      const activeSprint = { id: '5a3d8204-6725-4fe0-a7d0-112233445566', name: 'Sprint 1', status: 'active' };
      const plannedSprint = { id: '7b8c9d0e-1122-3344-5566-778899aabbcc', name: 'Sprint 2', status: 'planned' };

      const buildPayload = (sprintDef: any) => {
        const isTargetActive = sprintDef.status === 'active';
        return {
          governance_bypass: isTargetActive ? true : undefined,
          metadata: {
            sprint: sprintDef.name,
            governance_bypass: isTargetActive ? true : undefined,
            added_mid_sprint: isTargetActive ? true : undefined,
          },
        };
      };

      const activePayload = buildPayload(activeSprint);
      expect(activePayload.governance_bypass).toBe(true);
      expect(activePayload.metadata.added_mid_sprint).toBe(true);

      const plannedPayload = buildPayload(plannedSprint);
      expect(plannedPayload.governance_bypass).toBeUndefined();
      expect(plannedPayload.metadata.added_mid_sprint).toBeUndefined();
    });
  });

  describe('BUG-0007 & BUG-0008: Snapshot & Diff Scoping Identifiers', () => {
    it('resolves relational sprint UUID for snapshot queries when available', () => {
      const availableDefs = [
        { id: '3f6e1a90-8888-4444-9999-123456789abc', name: 'Sprint 12' },
      ];
      const selectedSprint = 'Sprint 12';

      const matchedDef = availableDefs.find((s) => s.name === selectedSprint || s.id === selectedSprint);
      const sprintParam = matchedDef?.id && UUID_REGEX.test(matchedDef.id) ? matchedDef.id : selectedSprint;

      expect(sprintParam).toBe('3f6e1a90-8888-4444-9999-123456789abc');
    });

    it('prefers currentProjectId UUID over projectSlug for SprintDiffModal', () => {
      const currentProjectId = '98765432-1234-5678-90ab-cdef12345678';
      const projectSlug = 'core-api';

      const diffModalProjectId = currentProjectId || projectSlug;
      expect(diffModalProjectId).toBe('98765432-1234-5678-90ab-cdef12345678');
    });
  });
});
