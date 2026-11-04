// @vitest-environment jsdom
import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { StatusTaxonomyEditor, inferFallbackLifecycleCategory } from '@/components/schema/StatusTaxonomyEditor';
import { ProjectSchemaView } from '@/components/schema/ProjectSchemaView';
import { ProjectSettings } from '@/types/tracker';
import { lintProjectSettings } from '@/lib/project-settings-schema';

const BASE_SETTINGS: ProjectSettings = {
  schema_version: '1.0',
  hierarchy: [
    { type: 'epic', label: 'Epic', level: 1, allowed_parents: [] },
    { type: 'story', label: 'Story', level: 2, allowed_parents: ['epic'] },
    { type: 'task', label: 'Task', level: 3, allowed_parents: ['story'] },
  ],
  statuses: [
    { id: 'backlog', label: 'Backlog', color: '#94a3b8', order: 1 },
    { id: 'drafting', label: 'Drafting', color: '#38bdf8', order: 2 },
    { id: 'copy_edit', label: 'Copy Edit', color: '#f59e0b', order: 3 },
    { id: 'published', label: 'Published', color: '#22c55e', order: 4, is_completed: true },
  ],
  custom_fields: ['priority', 'target_words', 'estimated_hours'],
};

describe('StatusTaxonomyEditor & Lifecycle Configurator (TASK-TRK-SCHEMA-LIFECYCLE-EDITOR)', () => {
  it('renders lifecycle category dropdowns for each status and defaults WIP limit to 8', () => {
    const onChange = vi.fn();
    render(<StatusTaxonomyEditor settings={BASE_SETTINGS} onChange={onChange} />);

    const wipInput = screen.getByTestId('wip-concurrency-cap-input') as HTMLInputElement;
    expect(wipInput.value).toBe('8');

    const draftingSelect = screen.getByTestId('lifecycle-select-drafting') as HTMLSelectElement;
    expect(draftingSelect.value).toBe('unstarted');

    const publishedSelect = screen.getByTestId('lifecycle-select-published') as HTMLSelectElement;
    expect(publishedSelect.value).toBe('terminal');
  });

  it('updates status lifecycle_category when dropdown changes', () => {
    const onChange = vi.fn();
    render(<StatusTaxonomyEditor settings={BASE_SETTINGS} onChange={onChange} />);

    const copyEditSelect = screen.getByTestId('lifecycle-select-copy_edit');
    fireEvent.change(copyEditSelect, { target: { value: 'verification' } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const updated: ProjectSettings = onChange.mock.calls[0][0];
    const copyEditStatus = updated.statuses.find((s) => s.id === 'copy_edit');
    expect(copyEditStatus?.lifecycle_category).toBe('verification');
    expect(lintProjectSettings(updated).valid).toBe(true);
  });

  it('updates wip_limit via stepper and numeric input', () => {
    const onChange = vi.fn();
    render(<StatusTaxonomyEditor settings={BASE_SETTINGS} onChange={onChange} />);

    const increaseBtn = screen.getByLabelText('Increase WIP concurrency cap');
    fireEvent.click(increaseBtn);

    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        wip_limit: 9,
      })
    );
  });

  it('introspects custom_fields into Work Unit Field selector and updates work_unit_field', () => {
    const onChange = vi.fn();
    render(<StatusTaxonomyEditor settings={BASE_SETTINGS} onChange={onChange} />);

    const unitSelect = screen.getByTestId('live-work-unit-field-select') as HTMLSelectElement;
    expect(unitSelect.value).toBe('story_points');

    // Should include custom_fields like target_words and estimated_hours
    const optionValues = Array.from(unitSelect.options).map((o) => o.value);
    expect(optionValues).toContain('story_points');
    expect(optionValues).toContain('target_words');
    expect(optionValues).toContain('estimated_hours');
    expect(optionValues).toContain('item_count');

    fireEvent.change(unitSelect, { target: { value: 'target_words' } });
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({
        work_unit_field: 'target_words',
        work_metric_config: expect.objectContaining({
          field_key: 'target_words',
        }),
      })
    );
  });

  it('synchronizes edits bidirectionally with the Raw JSON tab in ProjectSchemaView', () => {
    const onSave = vi.fn();
    render(<ProjectSchemaView settings={BASE_SETTINGS} onSave={onSave} />);

    const draftingSelect = screen.getByTestId('lifecycle-select-drafting');
    fireEvent.change(draftingSelect, { target: { value: 'execution' } });

    const rawTabBtn = screen.getByRole('tab', { name: /Raw JSON/i });
    fireEvent.click(rawTabBtn);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    const parsed = JSON.parse(textarea.value);
    const drafting = parsed.statuses.find((s: any) => s.id === 'drafting');
    expect(drafting.lifecycle_category).toBe('execution');
  });

  it('falls back to default taxonomy when explicit lifecycle_category is omitted', () => {
    expect(
      inferFallbackLifecycleCategory(
        { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
        { ...BASE_SETTINGS, in_progress_statuses: ['in_progress'] }
      )
    ).toBe('execution');

    expect(
      inferFallbackLifecycleCategory(
        { id: 'done', label: 'Done', color: '#22c55e', order: 4, is_completed: true },
        BASE_SETTINGS
      )
    ).toBe('terminal');
  });
});
