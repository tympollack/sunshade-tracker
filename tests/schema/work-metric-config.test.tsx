import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ProjectSchemaEditor } from '@/components/schema/ProjectSchemaEditor';
import {
  ProjectSettings,
  WorkMetricConfig,
  DEFAULT_WORK_METRIC_CONFIG,
  getWorkMetricConfig,
} from '@/types/tracker';
import { validateProjectSettings } from '@/lib/project-settings-validator';
import { mergeProjectSettings } from '@/lib/portfolio-merge';

const baseSettings: ProjectSettings = {
  schema_version: '1.0',
  hierarchy: [
    { type: 'epic', label: 'Epic', level: 1, allowed_parents: [], color: '#c084fc' },
    { type: 'story', label: 'Story', level: 2, allowed_parents: ['epic'], color: '#38bdf8' },
    { type: 'task', label: 'Task', level: 3, allowed_parents: ['story'], color: '#34d399' },
  ],
  statuses: [
    { id: 'todo', label: 'To Do', color: '#94a3b8', order: 1 },
    { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
    { id: 'done', label: 'Done', color: '#22c55e', order: 3 },
  ],
  custom_fields: ['priority', 'ai_credits'],
  custom_metadata_fields: [
    { key: 'ai_credits', label: 'AI Credits', type: 'number', unit: 'credits' },
    { key: 'target_hours', label: 'Target Hours', type: 'number', unit: 'hrs' },
  ],
};

describe('TASK-TRK-SCHEMA-WORK-METRIC-CONFIG: Work Metric Configuration & UI Editor', () => {
  describe('Helper getWorkMetricConfig', () => {
    it('returns default story_points / pts when work_metric_config is not set', () => {
      const config = getWorkMetricConfig(baseSettings);
      expect(config).toEqual(DEFAULT_WORK_METRIC_CONFIG);
      expect(config.field_key).toBe('story_points');
      expect(config.label).toBe('Story Points');
      expect(config.unit_label).toBe('pts');
    });

    it('reads custom work_metric_config correctly', () => {
      const customSettings: ProjectSettings = {
        ...baseSettings,
        work_metric_config: {
          field_key: 'ai_credits',
          label: 'AI Credits Burn',
          unit_label: 'credits',
        },
      };
      const config = getWorkMetricConfig(customSettings);
      expect(config).toEqual({
        field_key: 'ai_credits',
        label: 'AI Credits Burn',
        unit_label: 'credits',
      });
    });

    it('falls back to work_unit_field if work_metric_config is missing', () => {
      const legacySettings: ProjectSettings = {
        ...baseSettings,
        work_unit_field: 'dev_hours',
      };
      const config = getWorkMetricConfig(legacySettings);
      expect(config.field_key).toBe('dev_hours');
      expect(config.label).toBe('dev_hours');
      expect(config.unit_label).toBe('pts');
    });
  });

  describe('Validation with validateProjectSettings', () => {
    it('passes when work_metric_config is valid', () => {
      const res = validateProjectSettings({
        ...baseSettings,
        work_metric_config: {
          field_key: 'ai_credits',
          label: 'AI Credits',
          unit_label: 'credits',
        },
      });
      expect(res.valid).toBe(true);
      expect(res.errors).toHaveLength(0);
    });

    it('fails when work_metric_config is not an object or field_key is missing', () => {
      const resInvalid = validateProjectSettings({
        ...baseSettings,
        work_metric_config: 'invalid',
      });
      expect(resInvalid.valid).toBe(false);
      expect(resInvalid.errors.some((e) => e.path === 'work_metric_config')).toBe(true);

      const resMissingKey = validateProjectSettings({
        ...baseSettings,
        work_metric_config: { label: 'Points' },
      });
      expect(resMissingKey.valid).toBe(false);
      expect(resMissingKey.errors.some((e) => e.path === 'work_metric_config.field_key')).toBe(true);
    });

    it('validates work_unit_field type', () => {
      const resValid = validateProjectSettings({
        ...baseSettings,
        work_unit_field: 'story_points',
      });
      expect(resValid.valid).toBe(true);

      const resInvalid = validateProjectSettings({
        ...baseSettings,
        work_unit_field: 123,
      });
      expect(resInvalid.valid).toBe(false);
      expect(resInvalid.errors.some((e) => e.path === 'work_unit_field')).toBe(true);
    });
  });

  describe('Portfolio Merge with mergeProjectSettings', () => {
    it('preserves work_metric_config from projects', () => {
      const merged = mergeProjectSettings([
        {
          id: 'proj-1',
          slug: 'p1',
          settings: {
            ...baseSettings,
            work_metric_config: {
              field_key: 'ai_credits',
              label: 'AI Credits',
              unit_label: 'credits',
            },
          },
        },
      ]);
      expect(merged.work_metric_config).toEqual({
        field_key: 'ai_credits',
        label: 'AI Credits',
        unit_label: 'credits',
      });
    });
  });

  describe('ProjectSchemaEditor UI Visual Selector', () => {
    it('renders work metric card with selector, label input, and unit input', () => {
      const handleChange = vi.fn();
      render(<ProjectSchemaEditor settings={baseSettings} onChange={handleChange} />);

      expect(screen.getByText('Work Metric & Estimation Unit')).toBeDefined();
      const select = screen.getByLabelText('Work estimation metric field') as HTMLSelectElement;
      expect(select).toBeDefined();
      expect(select.value).toBe('story_points');

      const labelInput = screen.getByLabelText('Work metric display label') as HTMLInputElement;
      expect(labelInput.value).toBe('Story Points');

      const unitInput = screen.getByLabelText('Work metric unit suffix') as HTMLInputElement;
      expect(unitInput.value).toBe('pts');
    });

    it('changes metric field to ai_credits and invokes onChange with new config', () => {
      const handleChange = vi.fn();
      render(<ProjectSchemaEditor settings={baseSettings} onChange={handleChange} />);

      const select = screen.getByLabelText('Work estimation metric field');
      fireEvent.change(select, { target: { value: 'ai_credits' } });

      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          work_metric_config: {
            field_key: 'ai_credits',
            label: 'AI Credits',
            unit_label: 'credits',
          },
          work_unit_field: 'ai_credits',
        })
      );
    });

    it('updates custom label and unit suffix inputs', () => {
      const handleChange = vi.fn();
      render(<ProjectSchemaEditor settings={baseSettings} onChange={handleChange} />);

      const labelInput = screen.getByLabelText('Work metric display label');
      fireEvent.change(labelInput, { target: { value: 'Compute Units' } });

      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          work_metric_config: expect.objectContaining({
            label: 'Compute Units',
          }),
        })
      );

      const unitInput = screen.getByLabelText('Work metric unit suffix');
      fireEvent.change(unitInput, { target: { value: 'CU' } });

      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          work_metric_config: expect.objectContaining({
            unit_label: 'CU',
          }),
        })
      );
    });

    it('disables controls in readOnly mode', () => {
      const handleChange = vi.fn();
      render(<ProjectSchemaEditor settings={baseSettings} onChange={handleChange} readOnly={true} />);

      const select = screen.getByLabelText('Work estimation metric field') as HTMLSelectElement;
      const labelInput = screen.getByLabelText('Work metric display label') as HTMLInputElement;
      const unitInput = screen.getByLabelText('Work metric unit suffix') as HTMLInputElement;

      expect(select.disabled).toBe(true);
      expect(labelInput.disabled).toBe(true);
      expect(unitInput.disabled).toBe(true);
    });
  });
});
