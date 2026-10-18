import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { WorkItemModal } from '@/components/WorkItemModal';
import { WorkItem, ProjectSettings, normalizeCustomField, normalizeCustomFields } from '@/types/tracker';
import { CustomFieldSchema } from '@/lib/project-settings-schema';

describe('FEAT-TRK-TYPED-CUSTOM-FIELDS', () => {
  const baseSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [
      { type: 'epic', label: 'Epic', level: 1, allowed_parents: [] },
      { type: 'story', label: 'Story', level: 2, allowed_parents: ['epic'] },
      { type: 'task', label: 'Task', level: 3, allowed_parents: ['story'] },
    ],
    statuses: [
      { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
      { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      { id: 'complete', label: 'Complete', color: '#22c55e', order: 3, is_completed: true },
    ],
    custom_fields: [],
  };

  const sampleItem: WorkItem = {
    id: 'item-001',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    title: 'Test Work Item for Typed Fields',
    description: 'Testing typed custom fields in work item modal',
    item_type: 'task',
    status: 'not_started',
    assignee: 'Alice',
    order_index: 1000,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  it('normalizes polymorphic custom_fields correctly (strings, definitions, and key-value maps)', () => {
    // 1. Legacy flat string
    const sDef = normalizeCustomField('story_points');
    expect(sDef.key).toBe('story_points');
    expect(sDef.type).toBe('string');
    expect(sDef.label).toBe('Story Points');

    // 2. Structured definition
    const objDef = normalizeCustomField({
      key: 'tone_standard',
      label: 'Tone Standard',
      type: 'enum',
      options: ['Peplink', 'Academic'],
    });
    expect(objDef.key).toBe('tone_standard');
    expect(objDef.type).toBe('enum');
    expect(objDef.options).toEqual(['Peplink', 'Academic']);

    // 3. Object map style { tone_standard: ['Peplink', 'Academic'] }
    const mapDef = normalizeCustomField({
      tone_standard: ['Peplink', 'Academic'],
    });
    expect(mapDef.key).toBe('tone_standard');
    expect(mapDef.type).toBe('enum');
    expect(mapDef.options).toEqual(['Peplink', 'Academic']);

    // 4. CustomFieldSchema validation
    expect(CustomFieldSchema.safeParse('priority').success).toBe(true);
    expect(
      CustomFieldSchema.safeParse({
        key: 'tone_standard',
        type: 'enum',
        options: ['Peplink', 'Academic'],
      }).success
    ).toBe(true);
    expect(
      CustomFieldSchema.safeParse({
        tone_standard: ['Peplink', 'Academic'],
      }).success
    ).toBe(true);
  });

  it('renders an enum dropdown populated with configured options and saves selection into metadata', async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const settings: ProjectSettings = {
      ...baseSettings,
      custom_fields: [
        {
          key: 'tone_standard',
          label: 'Tone Standard',
          type: 'enum',
          options: ['Peplink', 'Academic'],
        },
      ],
    };

    await act(async () => {
      render(
        <WorkItemModal
          item={sampleItem}
          isOpen={true}
          onClose={() => {}}
          onSave={handleSave}
          onDelete={() => {}}
          projectSettings={settings}
          allItems={[sampleItem]}
        />
      );
    });

    // Enum dropdown should be rendered
    const select = screen.getByTestId('custom-field-enum-tone_standard') as HTMLSelectElement;
    expect(select).toBeDefined();
    expect(select.tagName).toBe('SELECT');

    // Options should include placeholder + Peplink + Academic
    const optionTexts = Array.from(select.options).map((opt) => opt.value);
    expect(optionTexts).toContain('Peplink');
    expect(optionTexts).toContain('Academic');

    // Select Peplink
    await act(async () => {
      fireEvent.change(select, { target: { value: 'Peplink' } });
    });
    expect(select.value).toBe('Peplink');

    // Click Save Changes
    const saveBtn = screen.getByText('Save Changes');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(handleSave).toHaveBeenCalledWith(
      'item-001',
      expect.objectContaining({
        metadata: expect.objectContaining({
          tone_standard: 'Peplink',
        }),
      })
    );
  });

  it('renders numeric and date inputs and enforces constraints without corrupting card metadata', async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const settings: ProjectSettings = {
      ...baseSettings,
      custom_fields: [
        {
          key: 'score',
          label: 'Score',
          type: 'number',
        },
        {
          key: 'target_date',
          label: 'Target Date',
          type: 'date',
        },
      ],
    };

    await act(async () => {
      render(
        <WorkItemModal
          item={sampleItem}
          isOpen={true}
          onClose={() => {}}
          onSave={handleSave}
          onDelete={() => {}}
          projectSettings={settings}
          allItems={[sampleItem]}
        />
      );
    });

    const numberInput = screen.getByTestId('custom-field-number-score') as HTMLInputElement;
    const dateInput = screen.getByTestId('custom-field-date-target_date') as HTMLInputElement;

    expect(numberInput.type).toBe('number');
    expect(dateInput.type).toBe('date');

    // Input values
    await act(async () => {
      fireEvent.change(numberInput, { target: { value: '42' } });
      fireEvent.change(dateInput, { target: { value: '2026-12-31' } });
    });

    // Click Save
    const saveBtn = screen.getByText('Save Changes');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(handleSave).toHaveBeenCalledWith(
      'item-001',
      expect.objectContaining({
        metadata: expect.objectContaining({
          score: 42,
          target_date: '2026-12-31',
        }),
      })
    );
  });

  it('renders boolean and text inputs and preserves existing metadata values', async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const settings: ProjectSettings = {
      ...baseSettings,
      custom_fields: [
        {
          key: 'is_reviewed',
          label: 'Is Reviewed',
          type: 'boolean',
        },
        {
          key: 'notes',
          label: 'Notes',
          type: 'text',
        },
      ],
    };

    const itemWithMeta: WorkItem = {
      ...sampleItem,
      metadata: {
        is_reviewed: true,
        notes: 'Initial review notes',
      },
    };

    await act(async () => {
      render(
        <WorkItemModal
          item={itemWithMeta}
          isOpen={true}
          onClose={() => {}}
          onSave={handleSave}
          onDelete={() => {}}
          projectSettings={settings}
          allItems={[itemWithMeta]}
        />
      );
    });

    const boolSelect = screen.getByTestId('custom-field-boolean-is_reviewed') as HTMLSelectElement;
    const textInput = screen.getByTestId('custom-field-text-notes') as HTMLTextAreaElement;

    expect(boolSelect.value).toBe('true');
    expect(textInput.value).toBe('Initial review notes');

    // Change notes
    await act(async () => {
      fireEvent.change(textInput, { target: { value: 'Updated review notes' } });
    });

    const saveBtn = screen.getByText('Save Changes');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(handleSave).toHaveBeenCalledWith(
      'item-001',
      expect.objectContaining({
        metadata: expect.objectContaining({
          is_reviewed: true,
          notes: 'Updated review notes',
        }),
      })
    );
  });
});
