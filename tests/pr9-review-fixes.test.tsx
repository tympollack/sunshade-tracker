import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { JsonSchemaEditor } from '@/components/JsonSchemaEditor';
import { ProjectSettings, WorkItem } from '@/types/tracker';
import {
  mergeProjectStatuses,
  mergeProjectHierarchy,
  mergeProjectSettings,
  getItemProjectSettings,
} from '@/lib/portfolio-merge';

describe('PR #9 Review Fixes', () => {
  const sampleSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [
      { type: 'epic', label: 'Epic', level: 0, allowed_parents: [], color: '#c084fc' },
      { type: 'story', label: 'Story', level: 1, allowed_parents: ['epic'], color: '#38bdf8' },
      { type: 'task', label: 'Task', level: 2, allowed_parents: ['story'], color: '#34d399' },
    ],
    statuses: [
      { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 0 },
      { id: 'in_progress', label: 'In Progress', color: '#3b82f6', order: 1 },
      { id: 'done', label: 'Done', color: '#10b981', order: 2 },
    ],
    custom_fields: [],
  };

  describe('TASK-TRK-SCHEMA-SAVE-ERROR-HANDLING: JsonSchemaEditor error propagation', () => {
    it('propagates onSave rejection to rawError banner and does not show success message', async () => {
      const handleSave = vi.fn().mockRejectedValue(new Error('Project schema update validation failed: invalid format'));
      render(<JsonSchemaEditor settings={sampleSettings} onSave={handleSave} />);

      const saveButton = screen.getByRole('button', { name: /Save Schema/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(handleSave).toHaveBeenCalled();
      });

      // The error banner should be displayed with the exact rejection error message
      expect(await screen.findByText('Project schema update validation failed: invalid format')).toBeDefined();

      // "Saved successfully!" must NOT be displayed
      expect(screen.queryByText('Saved successfully!')).toBeNull();
    });

    it('falls back to default error message if rejected error has no message', async () => {
      const handleSave = vi.fn().mockRejectedValue({});
      render(<JsonSchemaEditor settings={sampleSettings} onSave={handleSave} />);

      const saveButton = screen.getByRole('button', { name: /Save Schema/i });
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(handleSave).toHaveBeenCalled();
      });

      expect(await screen.findByText('Failed to save schema settings.')).toBeDefined();
      expect(screen.queryByText('Saved successfully!')).toBeNull();
    });

    it('resets saveSuccess to false if a subsequent save fails after an earlier success', async () => {
      let fail = false;
      const handleSave = vi.fn().mockImplementation(async () => {
        if (fail) {
          throw new Error('Immediate validation error');
        }
      });

      render(<JsonSchemaEditor settings={sampleSettings} onSave={handleSave} />);

      const saveButton = screen.getByRole('button', { name: /Save Schema/i });

      // First save succeeds
      fireEvent.click(saveButton);
      expect(await screen.findByText('Saved successfully!')).toBeDefined();

      // Second save fails immediately within 3 seconds
      fail = true;
      fireEvent.click(saveButton);

      // Success message must immediately be removed and error displayed
      expect(await screen.findByText('Immediate validation error')).toBeDefined();
      expect(screen.queryByText('Saved successfully!')).toBeNull();
    });
  });

  describe('TASK-TRK-PORTFOLIO-SCHEMA-POLICY: Deterministic schema merge policy (exercising production logic)', () => {
    it('deterministically merges statuses from multiple projects preserving lowest canonical order and sorting ascending', () => {
      const projects = [
        {
          slug: 'project-b',
          settings: {
            statuses: [
              { id: 'done', label: 'Done', color: '#10b981', order: 2 },
              { id: 'testing', label: 'QA Testing', color: '#f59e0b', order: 1 },
            ],
          },
        },
        {
          slug: 'project-a',
          settings: {
            statuses: [
              { id: 'not_started', label: 'Backlog', color: '#94a3b8', order: 0 },
              { id: 'testing', label: 'Testing', color: '#d97706', order: 3 }, // Higher order for duplicate status
              { id: 'in_progress', label: 'In Progress', color: '#3b82f6', order: 1 },
            ],
          },
        },
      ];

      // Directly exercise production function
      const finalStatuses = mergeProjectStatuses(projects as any);

      // Verify testing retained the lowest order (1, not 3) from project-b
      const testing = finalStatuses.find((s) => s.id === 'testing');
      expect(testing?.order).toBe(1);
      expect(testing?.label).toBe('QA Testing');
      expect(testing?.color).toBe('#f59e0b');

      // Verify sorted deterministically by order ascending: 0 (not_started) -> 1 (in_progress, testing) -> 2 (done)
      expect(finalStatuses.map((s) => s.id)).toEqual([
        'not_started',
        'in_progress',
        'testing',
        'done',
      ]);
    });

    it('deterministically breaks ties using project slug when duplicate statuses have equal order', () => {
      const projects = [
        {
          slug: 'project-z',
          settings: {
            statuses: [
              { id: 'review', label: 'Z Review', color: '#ff0000', order: 1 },
            ],
          },
        },
        {
          slug: 'project-a',
          settings: {
            statuses: [
              { id: 'review', label: 'A Review', color: '#00ff00', order: 1 },
            ],
          },
        },
      ];

      // Alphabetically earlier project slug ('project-a') must win the definition
      const finalStatuses = mergeProjectStatuses(projects as any);
      const review = finalStatuses.find((s) => s.id === 'review');
      expect(review?.label).toBe('A Review');
      expect(review?.color).toBe('#00ff00');
    });

    it('deterministically merges hierarchy types from multiple projects sorted by level ascending then type', () => {
      const projects = [
        {
          slug: 'project-b',
          settings: {
            hierarchy: [
              { type: 'task', label: 'Task', level: 2, allowed_parents: ['story'] },
              { type: 'epic', label: 'Epic', level: 0, allowed_parents: [] },
            ],
          },
        },
        {
          slug: 'project-a',
          settings: {
            hierarchy: [
              { type: 'subtask', label: 'Subtask', level: 3, allowed_parents: ['task'] },
              { type: 'story', label: 'Story', level: 1, allowed_parents: ['epic'] },
            ],
          },
        },
      ];

      // Directly exercise production function
      const finalHierarchy = mergeProjectHierarchy(projects as any);

      expect(finalHierarchy.map((h) => h.type)).toEqual([
        'epic',
        'story',
        'task',
        'subtask',
      ]);
    });

    it('produces full portfolio settings with mergeProjectSettings', () => {
      const projects = [
        {
          slug: 'project-a',
          settings: {
            statuses: [{ id: 'open', label: 'Open', color: '#38bdf8', order: 0 }],
            hierarchy: [{ type: 'task', label: 'Task', level: 0, allowed_parents: [] }],
            custom_fields: ['severity', 'due_date'],
            sprint_settings: {
              sprints: [{ name: 'Sprint 1', is_current: true }],
            },
          },
        },
      ];

      const merged = mergeProjectSettings(projects as any);
      expect(merged.statuses).toHaveLength(1);
      expect(merged.hierarchy).toHaveLength(1);
      expect(merged.custom_fields).toContain('severity');
      expect(merged.custom_fields).toContain('due_date');
      expect(merged.sprint_settings?.sprints).toHaveLength(1);
      expect(merged.sprint_settings?.default_sprint).toBe('all');
    });
  });

  describe('TASK-TRK-PORTFOLIO-SCHEMA-OPTIONS: Origin project option derivation (exercising production logic)', () => {
    it('correctly maps item to origin project hierarchy and statuses in portfolio mode', () => {
      const allProjects = [
        {
          id: 'proj-alpha-id',
          slug: 'proj-alpha',
          settings: {
            schema_version: '1.0',
            hierarchy: [
              { type: 'initiative', label: 'Initiative', level: 0, allowed_parents: [] },
              { type: 'feature', label: 'Feature', level: 1, allowed_parents: ['initiative'] },
            ],
            statuses: [
              { id: 'planning', label: 'Planning', color: '#cbd5e1', order: 0 },
              { id: 'active', label: 'Active', color: '#38bdf8', order: 1 },
            ],
            custom_fields: [],
          },
        },
        {
          id: 'proj-beta-id',
          slug: 'proj-beta',
          settings: {
            schema_version: '1.0',
            hierarchy: [
              { type: 'epic', label: 'Epic', level: 0, allowed_parents: [] },
              { type: 'bug', label: 'Bug', level: 1, allowed_parents: ['epic'] },
            ],
            statuses: [
              { id: 'triage', label: 'Triage', color: '#f87171', order: 0 },
              { id: 'resolved', label: 'Resolved', color: '#4ade80', order: 1 },
            ],
            custom_fields: [],
          },
        },
      ];

      const itemAlpha: Partial<WorkItem> = {
        id: 'item-1',
        project_id: 'proj-alpha-id',
        item_type: 'feature',
        status: 'active',
      };

      const itemBeta: Partial<WorkItem> = {
        id: 'item-2',
        project_id: 'proj-beta-id',
        item_type: 'bug',
        status: 'triage',
      };

      // Directly exercise production function
      const settingsAlpha = getItemProjectSettings(itemAlpha as WorkItem, allProjects, sampleSettings, true);
      expect(settingsAlpha.hierarchy.map((h) => h.type)).toEqual(['initiative', 'feature']);
      expect(settingsAlpha.statuses.map((s) => s.id)).toEqual(['planning', 'active']);

      const settingsBeta = getItemProjectSettings(itemBeta as WorkItem, allProjects, sampleSettings, true);
      expect(settingsBeta.hierarchy.map((h) => h.type)).toEqual(['epic', 'bug']);
      expect(settingsBeta.statuses.map((s) => s.id)).toEqual(['triage', 'resolved']);

      // In non-portfolio mode (single project), sampleSettings should be used
      const settingsAlphaSingle = getItemProjectSettings(itemAlpha as WorkItem, allProjects, sampleSettings, false);
      expect(settingsAlphaSingle.hierarchy.map((h) => h.type)).toEqual(['epic', 'story', 'task']);
    });
  });
});
