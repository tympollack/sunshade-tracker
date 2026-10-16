import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import {
  lintProjectSettings,
  ProjectSettingsSchema,
  HexColorRegex,
  formatZodPath,
} from '@/lib/project-settings-schema';
import { ProjectSchemaView } from '@/components/schema/ProjectSchemaView';
import { ProjectSchemaEditor } from '@/components/schema/ProjectSchemaEditor';
import { ProjectSettings } from '@/types/tracker';

describe('FEAT-TRK-SCHEMA-EDITOR-LINTER: Client-side Zod Validation & Schema Linter', () => {
  const validSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [
      { type: 'project', label: 'Project', level: 1, allowed_parents: [], color: '#c084fc' },
      { type: 'epic', label: 'Epic', level: 2, allowed_parents: ['project'], color: '#38bdf8' },
      { type: 'story', label: 'Story', level: 3, allowed_parents: ['epic'], color: '#34d399' },
      { type: 'task', label: 'Task', level: 4, allowed_parents: ['story', 'epic'], color: '#fbbf24' },
    ],
    statuses: [
      { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
      { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      { id: 'planned', label: 'Planned', color: '#a855f7', order: 3 },
      { id: 'complete', label: 'Complete', color: '#22c55e', order: 4, is_completed: true },
    ],
    custom_fields: ['priority', 'complexity', 'timeline'],
  };

  describe('Zod Schema & Cross-field Validation Unit Tests', () => {
    it('validates a correct ProjectSettings object with zero errors', () => {
      const result = lintProjectSettings(validSettings);
      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('rejects non-object or null input', () => {
      expect(lintProjectSettings(null).valid).toBe(false);
      expect(lintProjectSettings('not an object').valid).toBe(false);
      expect(lintProjectSettings([]).valid).toBe(false);
    });

    it('rejects empty or missing hierarchy array', () => {
      const invalid = { ...validSettings, hierarchy: [] };
      const result = lintProjectSettings(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'hierarchy')).toBe(true);
    });

    it('rejects empty or missing statuses array', () => {
      const invalid = { ...validSettings, statuses: [] };
      const result = lintProjectSettings(invalid);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'statuses')).toBe(true);
    });

    it('rejects duplicate hierarchy level types', () => {
      const duplicateHierarchy: ProjectSettings = {
        ...validSettings,
        hierarchy: [
          { type: 'story', label: 'Story', level: 1, allowed_parents: [] },
          { type: 'story', label: 'Another Story', level: 2, allowed_parents: [] },
        ],
      };
      const result = lintProjectSettings(duplicateHierarchy);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('Duplicate hierarchy type "story"'))).toBe(true);
      expect(result.errors.some((e) => e.path === 'hierarchy[1].type')).toBe(true);
    });

    it('rejects hierarchy allowed_parents referencing non-existent parent type', () => {
      const brokenParent: ProjectSettings = {
        ...validSettings,
        hierarchy: [
          { type: 'story', label: 'Story', level: 1, allowed_parents: ['ghost_parent'] },
        ],
      };
      const result = lintProjectSettings(brokenParent);
      expect(result.valid).toBe(false);
      expect(
        result.errors.some((e) =>
          e.message.includes('Referenced parent type "ghost_parent" does not exist in hierarchy')
        )
      ).toBe(true);
    });

    it('rejects duplicate status IDs', () => {
      const duplicateStatuses: ProjectSettings = {
        ...validSettings,
        statuses: [
          { id: 'open', label: 'Open', color: '#94a3b8', order: 1 },
          { id: 'open', label: 'Open Duplicate', color: '#38bdf8', order: 2 },
        ],
      };
      const result = lintProjectSettings(duplicateStatuses);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.message.includes('Duplicate status id "open"'))).toBe(true);
      expect(result.errors.some((e) => e.path === 'statuses[1].id')).toBe(true);
    });

    it('validates status hex colors against HexColorRegex', () => {
      expect(HexColorRegex.test('#38bdf8')).toBe(true);
      expect(HexColorRegex.test('#fff')).toBe(true);
      expect(HexColorRegex.test('blue')).toBe(false);
      expect(HexColorRegex.test('#12345')).toBe(false);

      const invalidColor: ProjectSettings = {
        ...validSettings,
        statuses: [
          { id: 'test', label: 'Test', color: 'not-a-hex', order: 1 },
        ],
      };
      const result = lintProjectSettings(invalidColor);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.path === 'statuses[0].color')).toBe(true);
    });

    it('formats Zod path segments correctly into bracketed index notation', () => {
      expect(formatZodPath(['hierarchy', 0, 'type'])).toBe('hierarchy[0].type');
      expect(formatZodPath(['statuses', 2, 'color'])).toBe('statuses[2].color');
      expect(formatZodPath([])).toBe('settings');
    });
  });

  describe('ProjectSchemaView UI & Linter Integration', () => {
    it('enables Save Schema button when schema is valid', () => {
      render(
        <ProjectSchemaView
          settings={validSettings}
          onSave={vi.fn()}
          initialMode="raw"
        />
      );

      const saveBtn = screen.getByRole('button', { name: /save schema/i });
      expect(saveBtn).not.toBeDisabled();
      expect(screen.queryByTestId('schema-validation-banner')).toBeNull();
    });

    it('executes validation on change in raw JSON mode, disables Save Schema, and displays high-contrast banner with exact error paths', () => {
      render(
        <ProjectSchemaView
          settings={validSettings}
          onSave={vi.fn()}
          initialMode="raw"
        />
      );

      const textarea = screen.getByRole('textbox');
      const saveBtn = screen.getByRole('button', { name: /save schema/i });

      // Introduce duplicate status IDs
      const invalidPayload = {
        ...validSettings,
        statuses: [
          { id: 'in_progress', label: 'In Progress 1', color: '#38bdf8', order: 1 },
          { id: 'in_progress', label: 'In Progress 2', color: '#38bdf8', order: 2 },
        ],
      };

      fireEvent.change(textarea, { target: { value: JSON.stringify(invalidPayload, null, 2) } });

      // Validation banner should appear
      const banner = screen.getByTestId('schema-validation-banner');
      expect(banner).not.toBeNull();
      expect(banner.textContent).toContain('Duplicate status id "in_progress"');
      expect(banner.textContent).toContain('statuses[1].id');

      // Save Schema button must be disabled
      expect(saveBtn).toBeDisabled();

      // Fix the error by restoring unique IDs
      const fixedPayload = {
        ...validSettings,
        statuses: [
          { id: 'in_progress', label: 'In Progress 1', color: '#38bdf8', order: 1 },
          { id: 'complete', label: 'Complete', color: '#22c55e', order: 2 },
        ],
      };

      fireEvent.change(textarea, { target: { value: JSON.stringify(fixedPayload, null, 2) } });

      // Banner should disappear and Save Schema should be re-enabled
      expect(screen.queryByTestId('schema-validation-banner')).toBeNull();
      expect(saveBtn).not.toBeDisabled();
    });

    it('disables Save Schema on syntax error in raw JSON mode', () => {
      render(
        <ProjectSchemaView
          settings={validSettings}
          onSave={vi.fn()}
          initialMode="raw"
        />
      );

      const textarea = screen.getByRole('textbox');
      const saveBtn = screen.getByRole('button', { name: /save schema/i });

      fireEvent.change(textarea, { target: { value: '{ broken json: true' } });

      expect(saveBtn).toBeDisabled();
    });
  });

  describe('ProjectSchemaEditor Standalone & Re-export', () => {
    it('re-exports ProjectSettingsSchema and lintProjectSettings', () => {
      expect(ProjectSchemaEditor.name).toBe('ProjectSchemaEditor');
      expect(typeof lintProjectSettings).toBe('function');
      expect(ProjectSettingsSchema).toBeDefined();
    });

    it('renders schema-validation-banner when invalid schema settings are passed to ProjectSchemaEditor', () => {
      const invalidSettings: ProjectSettings = {
        ...validSettings,
        statuses: [
          { id: 'st1', label: 'Status 1', color: 'invalid-hex', order: 1 },
        ],
      };

      render(
        <ProjectSchemaEditor
          settings={invalidSettings}
          onChange={vi.fn()}
        />
      );

      const banner = screen.getByTestId('schema-validation-banner');
      expect(banner).not.toBeNull();
      expect(banner.textContent).toContain('statuses[0].color');
    });
  });
});
