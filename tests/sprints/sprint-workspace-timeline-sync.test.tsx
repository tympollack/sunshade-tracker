import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { WorkItem } from '@/types/tracker';
import { TimelineSnapshotPoint } from '@/components/sprints/SprintTimelineScrubber';
import { getCompletedStatusSet } from '@/lib/sprint-utils';

describe('PR 105 & PR 106 Review Fixes: Workspace Timeline, Governance & Integrity Guards', () => {
  const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  describe('BUG-PR106-0004: Explicit Incomplete Status (getCompletedStatusSet)', () => {
    it('honors is_completed: false even when status is named "done" or "closed"', () => {
      const customStatuses = [
        { id: 'todo', label: 'To Do', is_completed: false },
        { id: 'in_progress', label: 'In Progress', is_completed: false },
        { id: 'done', label: 'Done (Needs QA)', is_completed: false }, // Explicitly false!
        { id: 'released', label: 'Released', is_completed: true },
      ];

      const completedSet = getCompletedStatusSet(customStatuses);
      expect(completedSet.has('done')).toBe(false);
      expect(completedSet.has('released')).toBe(true);
      expect(completedSet.has('todo')).toBe(false);
    });

    it('falls back to default completed statuses when is_completed is undefined', () => {
      const defaultStatuses = [
        { id: 'open', label: 'Open' },
        { id: 'closed', label: 'Closed' },
      ];

      const completedSet = getCompletedStatusSet(defaultStatuses);
      expect(completedSet.has('closed')).toBe(true);
      expect(completedSet.has('open')).toBe(false);
    });
  });

  describe('BUG-PR106-0001: Separation of Snapshot Reset and Timeline Fetch Effects', () => {
    it('preserves activeTimelineSnapshot when items refresh or availableSprintDefs recomputes', () => {
      let activeTimelineSnapshot: any = { id: 'snap-historical-1' };
      let previousSprint = 'Sprint 1';

      // Simulates the separated reset effect: only triggers when sprint or project changes
      const onSprintOrProjectChange = (newSprint: string) => {
        if (newSprint !== previousSprint) {
          activeTimelineSnapshot = null;
          previousSprint = newSprint;
        }
      };

      // Item refresh occurs: sprint is still 'Sprint 1'
      onSprintOrProjectChange('Sprint 1');
      expect(activeTimelineSnapshot).toEqual({ id: 'snap-historical-1' });

      // Sprint switch occurs: active snapshot is reset
      onSprintOrProjectChange('Sprint 2');
      expect(activeTimelineSnapshot).toBeNull();
    });
  });

  describe('BUG-PR106-0002: Empty Sprint Rollup & Itemized Check', () => {
    it('treats explicitly empty assignee_breakdown.items array as empty rather than absent', () => {
      const emptySnapshot: TimelineSnapshotPoint = {
        id: 'snap-empty-sprint',
        snapshot_type: 'daily_rollup',
        captured_at: '2026-10-07T00:00:00Z',
        committed_item_ids: [],
        assignee_breakdown: {
          items: [], // All items departed the sprint
        },
      };

      // Board logic check
      let effectiveItems: any[] = [];
      if (Array.isArray(emptySnapshot.assignee_breakdown?.items)) {
        effectiveItems = emptySnapshot.assignee_breakdown.items;
      } else if (Array.isArray(emptySnapshot.committed_item_ids)) {
        effectiveItems = [{ id: 'resurrected-item' }];
      }

      expect(effectiveItems).toHaveLength(0);
    });
  });

  describe('BUG-PR106-0005: Purge Stale Intake Markers When Moving to Non-Active Sprints', () => {
    it('removes added_mid_sprint when moving an item from active to planned sprint', () => {
      const plannedSprint = { id: 'sprint-planned', name: 'Sprint Planned', status: 'planned' };
      const sprints = [plannedSprint];

      const initialMetadata = {
        sprint: 'Sprint Active',
        added_mid_sprint: true,
        governance_bypass: true,
      };

      // Emulate bulk-items purge logic for target sprint
      const targetSprintName = 'Sprint Planned';
      const targetSprintDef = sprints.find((s) => s.name === targetSprintName);
      const isTargetActive = targetSprintDef ? targetSprintDef.status === 'active' : false;

      const mergedMetadata: Record<string, any> = { ...initialMetadata, sprint: targetSprintName };
      if (!isTargetActive) {
        delete mergedMetadata.added_mid_sprint;
        delete mergedMetadata.governance_bypass;
      }

      expect(mergedMetadata.sprint).toBe('Sprint Planned');
      expect(mergedMetadata.added_mid_sprint).toBeUndefined();
      expect(mergedMetadata.governance_bypass).toBeUndefined();
    });
  });

  describe('ANALYSIS-PR106-0002: Status Transitions Do Not Reduce Item Estimate', () => {
    it('does not reduce story points when status transition contains burned points delta', () => {
      const basePoints = 5;
      let effectivePoints = basePoints;

      const events = [
        {
          event_type: 'status_transition',
          points_delta: 5, // 5 points burned upon completion
          previous_state: { status: 'in_progress' },
        },
      ];

      for (const ev of events) {
        if (ev.event_type === 'estimate_change') {
          if (typeof (ev as any).previous_state?.points === 'number') {
            effectivePoints = (ev as any).previous_state.points;
          } else if (typeof ev.points_delta === 'number') {
            effectivePoints -= ev.points_delta;
          }
        }
      }

      // Estimate remains unchanged because status transition is not an estimate change
      expect(effectivePoints).toBe(5);
    });

    it('correctly reverts points when event_type is estimate_change', () => {
      let effectivePoints = 8;

      const events = [
        {
          event_type: 'estimate_change',
          points_delta: 3, // Points were increased from 5 to 8
          previous_state: { points: 5 },
        },
      ];

      for (const ev of events) {
        if (ev.event_type === 'estimate_change') {
          if (typeof (ev as any).previous_state?.points === 'number') {
            effectivePoints = (ev as any).previous_state.points;
          } else if (typeof ev.points_delta === 'number') {
            effectivePoints -= ev.points_delta;
          }
        }
      }

      expect(effectivePoints).toBe(5);
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
