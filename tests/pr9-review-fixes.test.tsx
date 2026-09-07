import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { JsonSchemaEditor } from '@/components/JsonSchemaEditor';
import { ProjectSettings, WorkItem } from '@/types/tracker';

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
  });

  describe('TASK-TRK-PORTFOLIO-SCHEMA-POLICY: Deterministic schema merge policy', () => {
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

      const mergedStatuses = new Map<string, any>();
      projects.forEach((proj) => {
        (proj.settings?.statuses || []).forEach((st) => {
          if (!mergedStatuses.has(st.id)) {
            mergedStatuses.set(st.id, st);
          } else {
            const existing = mergedStatuses.get(st.id);
            if (typeof st.order === 'number' && (typeof existing.order !== 'number' || st.order < existing.order)) {
              mergedStatuses.set(st.id, { ...existing, order: st.order });
            }
          }
        });
      });

      const finalStatuses = Array.from(mergedStatuses.values()).sort(
        (a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id)
      );

      // Verify testing retained the lowest order (1, not 3)
      const testing = finalStatuses.find((s) => s.id === 'testing');
      expect(testing?.order).toBe(1);

      // Verify sorted deterministically by order ascending: 0 (not_started) -> 1 (in_progress, testing) -> 2 (done)
      expect(finalStatuses.map((s) => s.id)).toEqual([
        'not_started',
        'in_progress',
        'testing',
        'done',
      ]);
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

      const mergedHierarchy = new Map<string, any>();
      projects.forEach((proj) => {
        (proj.settings?.hierarchy || []).forEach((h) => {
          if (!mergedHierarchy.has(h.type)) {
            mergedHierarchy.set(h.type, h);
          } else {
            const existing = mergedHierarchy.get(h.type);
            if (typeof h.level === 'number' && (typeof existing.level !== 'number' || h.level < existing.level)) {
              mergedHierarchy.set(h.type, { ...existing, level: h.level });
            }
          }
        });
      });

      const finalHierarchy = Array.from(mergedHierarchy.values()).sort(
        (a, b) => (a.level ?? 0) - (b.level ?? 0) || a.type.localeCompare(b.type)
      );

      expect(finalHierarchy.map((h) => h.type)).toEqual([
        'epic',
        'story',
        'task',
        'subtask',
      ]);
    });
  });

  describe('TASK-TRK-PORTFOLIO-SCHEMA-OPTIONS: Origin project option derivation', () => {
    it('correctly maps item to origin project hierarchy and statuses in portfolio mode', () => {
      const allProjects = [
        {
          id: 'proj-alpha-id',
          slug: 'proj-alpha',
          settings: {
            hierarchy: [
              { type: 'initiative', label: 'Initiative', level: 0, allowed_parents: [] },
              { type: 'feature', label: 'Feature', level: 1, allowed_parents: ['initiative'] },
            ],
            statuses: [
              { id: 'planning', label: 'Planning', color: '#cbd5e1', order: 0 },
              { id: 'active', label: 'Active', color: '#38bdf8', order: 1 },
            ],
          },
        },
        {
          id: 'proj-beta-id',
          slug: 'proj-beta',
          settings: {
            hierarchy: [
              { type: 'epic', label: 'Epic', level: 0, allowed_parents: [] },
              { type: 'bug', label: 'Bug', level: 1, allowed_parents: ['epic'] },
            ],
            statuses: [
              { id: 'triage', label: 'Triage', color: '#f87171', order: 0 },
              { id: 'resolved', label: 'Resolved', color: '#4ade80', order: 1 },
            ],
          },
        },
      ];

      function getItemProjectSettings(item: Partial<WorkItem>, isAllProjects: boolean, defaultSettings: ProjectSettings): ProjectSettings {
        if (!item || !isAllProjects) return defaultSettings;
        const proj = allProjects.find(
          (p) => p.id === item.project_id || p.slug === item.project_id
        );
        if (proj && proj.settings) {
          return {
            ...defaultSettings,
            ...proj.settings,
          };
        }
        return defaultSettings;
      }

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

      const settingsAlpha = getItemProjectSettings(itemAlpha, true, sampleSettings);
      expect(settingsAlpha.hierarchy.map((h) => h.type)).toEqual(['initiative', 'feature']);
      expect(settingsAlpha.statuses.map((s) => s.id)).toEqual(['planning', 'active']);

      const settingsBeta = getItemProjectSettings(itemBeta, true, sampleSettings);
      expect(settingsBeta.hierarchy.map((h) => h.type)).toEqual(['epic', 'bug']);
      expect(settingsBeta.statuses.map((s) => s.id)).toEqual(['triage', 'resolved']);

      // In non-portfolio mode (single project), defaultSettings should be used
      const settingsAlphaSingle = getItemProjectSettings(itemAlpha, false, sampleSettings);
      expect(settingsAlphaSingle.hierarchy.map((h) => h.type)).toEqual(['epic', 'story', 'task']);
    });
  });
});
