import { describe, it, expect } from 'vitest';
import {
  calculateSprintLeafPoints,
  calculateSprintMacroPoints,
  getItemWorkMetric,
} from '@/lib/sprint-utils';
import {
  calculateHierarchyRollupPoints,
  calculateHierarchyLeafPoints,
  calculateHierarchyMacroPoints,
  formatWorkMetric,
} from '@/lib/hierarchy-utils';
import { buildTree } from '@/lib/tree';
import { WorkItem, ProjectSettings } from '@/types/tracker';

describe('TASK-TRK-DYNAMIC-LEAF-ROLLUP-ENGINE: Dynamic Work Metric Rollup Engine', () => {
  const mockSettingsWithAICredits: ProjectSettings = {
    schema_version: '1.0',
    custom_fields: [],
    hierarchy: [],
    statuses: [],
    work_metric_config: {
      field_key: 'ai_credits',
      label: 'AI Credits',
      unit_label: 'credits',
    },
  };

  const mockSettingsWithHours: ProjectSettings = {
    schema_version: '1.0',
    custom_fields: [],
    hierarchy: [],
    statuses: [],
    work_metric_config: {
      field_key: 'hours',
      label: 'Estimated Hours',
      unit_label: 'hrs',
    },
  };

  const mockSettingsWithLegacyUnit: ProjectSettings = {
    schema_version: '1.0',
    custom_fields: [],
    hierarchy: [],
    statuses: [],
    work_unit_field: 'complexity_score',
  };

  const createItem = (
    id: string,
    parentId: string | null,
    metadata: Record<string, any> = {},
    refId?: string
  ): WorkItem => ({
    id,
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    parent_id: parentId,
    external_ref_id: refId || id,
    title: `Item ${id}`,
    item_type: parentId === null ? 'epic' : 'task',
    status: 'in_progress',
    order_index: 1000,
    metadata,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  describe('getItemWorkMetric', () => {
    it('defaults to story_points when no settings or metric key is passed', () => {
      const item = createItem('1', null, { story_points: 8 });
      expect(getItemWorkMetric(item)).toBe(8);
    });

    it('falls back to points or estimate when metric key is story_points', () => {
      const itemPoints = createItem('1', null, { points: 5 });
      const itemEstimate = createItem('2', null, { estimate: 3 });
      expect(getItemWorkMetric(itemPoints)).toBe(5);
      expect(getItemWorkMetric(itemEstimate)).toBe(3);
    });

    it('extracts custom metric key when configured in ProjectSettings', () => {
      const item = createItem('1', null, {
        story_points: 10,
        ai_credits: 25,
        hours: 4,
      });

      expect(getItemWorkMetric(item, mockSettingsWithAICredits)).toBe(25);
      expect(getItemWorkMetric(item, mockSettingsWithHours)).toBe(4);
    });

    it('extracts custom metric key when passed as a string key', () => {
      const item = createItem('1', null, { custom_val: 42 });
      expect(getItemWorkMetric(item, 'custom_val')).toBe(42);
    });

    it('supports legacy work_unit_field fallback when work_metric_config is absent', () => {
      const item = createItem('1', null, { complexity_score: 9 });
      expect(getItemWorkMetric(item, mockSettingsWithLegacyUnit)).toBe(9);
    });

    it('returns 0 for missing, non-numeric, or null metric values', () => {
      const itemEmpty = createItem('1', null, {});
      const itemNaN = createItem('2', null, { ai_credits: 'not-a-number' });
      const itemNull = createItem('3', null, { ai_credits: null });

      expect(getItemWorkMetric(itemEmpty, mockSettingsWithAICredits)).toBe(0);
      expect(getItemWorkMetric(itemNaN, mockSettingsWithAICredits)).toBe(0);
      expect(getItemWorkMetric(itemNull, mockSettingsWithAICredits)).toBe(0);
    });
  });

  describe('calculateSprintLeafPoints & calculateSprintMacroPoints with dynamic metrics', () => {
    it('aggregates sprint leaf and macro points using configured ai_credits metric', () => {
      // Hierarchy: Epic (100 credits) -> Story (50 credits) -> Task 1 (20 credits), Task 2 (30 credits)
      const epic = createItem('epic-1', null, {
        story_points: 13,
        ai_credits: 100,
      });
      const story = createItem('story-1', 'epic-1', {
        story_points: 5,
        ai_credits: 50,
      });
      const task1 = createItem('task-1', 'story-1', {
        story_points: 2,
        ai_credits: 20,
      });
      const task2 = createItem('task-2', 'story-1', {
        story_points: 3,
        ai_credits: 30,
      });

      const sprintItems = [epic, story, task1, task2];

      // Default story points: leaves = 2 + 3 = 5
      expect(calculateSprintLeafPoints(sprintItems)).toBe(5);
      expect(calculateSprintMacroPoints(sprintItems)).toBe(13);

      // Configured ai_credits: leaves = 20 + 30 = 50
      expect(calculateSprintLeafPoints(sprintItems, mockSettingsWithAICredits)).toBe(50);
      // Configured ai_credits: macro root = 100
      expect(calculateSprintMacroPoints(sprintItems, mockSettingsWithAICredits)).toBe(100);
    });

    it('aggregates sprint points using configured hours metric with multiple roots', () => {
      const epic1 = createItem('epic-1', null, { hours: 16 });
      const task1 = createItem('task-1', 'epic-1', { hours: 8 });
      const standalone = createItem('standalone', null, { hours: 4 });

      const sprintItems = [epic1, task1, standalone];

      // Leaves: task1 (8) + standalone (4) = 12 hrs
      expect(calculateSprintLeafPoints(sprintItems, mockSettingsWithHours)).toBe(12);
      // Roots: epic1 (16) + standalone (4) = 20 hrs
      expect(calculateSprintMacroPoints(sprintItems, mockSettingsWithHours)).toBe(20);
    });
  });

  describe('Hierarchy Rollup & Formatting Utilities', () => {
    it('calculates hierarchy leaf points and root macro points correctly', () => {
      const epic = createItem('epic-1', null, { ai_credits: 80 });
      const task1 = createItem('task-1', 'epic-1', { ai_credits: 35 });
      const task2 = createItem('task-2', 'epic-1', { ai_credits: 45 });

      const items = [epic, task1, task2];

      expect(calculateHierarchyLeafPoints(items, mockSettingsWithAICredits)).toBe(80);
      expect(calculateHierarchyMacroPoints(items, mockSettingsWithAICredits)).toBe(80);
    });

    it('formats work metric with configured unit_label', () => {
      expect(formatWorkMetric(25, mockSettingsWithAICredits)).toBe('25 credits');
      expect(formatWorkMetric(12, mockSettingsWithHours)).toBe('12 hrs');
      expect(formatWorkMetric(8, null)).toBe('8 pts');
    });
  });

  describe('buildTree recursive rollup with dynamic work metric', () => {
    it('computes node.rollupPoints based on leaf sum using configured metric key', () => {
      const epic = createItem('epic-1', null, { ai_credits: 200, story_points: 20 });
      const story = createItem('story-1', 'epic-1', { ai_credits: 100, story_points: 10 });
      const task1 = createItem('task-1', 'story-1', { ai_credits: 40, story_points: 4 });
      const task2 = createItem('task-2', 'story-1', { ai_credits: 60, story_points: 6 });

      const items = [epic, story, task1, task2];

      // Build tree with custom AI credits
      const tree = buildTree(items, null, 0, new Set(), undefined, mockSettingsWithAICredits);
      expect(tree).toHaveLength(1);

      const epicNode = tree[0];
      expect(epicNode.id).toBe('epic-1');
      // Subtree rollup: leaves task1 (40) + task2 (60) = 100
      expect(epicNode.rollupPoints).toBe(100);

      const storyNode = epicNode.children![0];
      expect(storyNode.id).toBe('story-1');
      expect(storyNode.rollupPoints).toBe(100);

      const task1Node = storyNode.children![0];
      expect(task1Node.rollupPoints).toBe(40);

      const task2Node = storyNode.children![1];
      expect(task2Node.rollupPoints).toBe(60);
    });
  });
});
