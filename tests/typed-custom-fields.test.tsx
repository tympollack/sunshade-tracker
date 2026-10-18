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

  it('allows single-selection on required boolean field when initial metadata is empty', async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const settings: ProjectSettings = {
      ...baseSettings,
      custom_fields: [
        {
          key: 'requires_signoff',
          label: 'Requires Signoff',
          type: 'boolean',
          required: true,
        },
      ],
    };

    const itemWithoutMeta: WorkItem = {
      ...sampleItem,
      metadata: {},
    };

    await act(async () => {
      render(
        <WorkItemModal
          item={itemWithoutMeta}
          isOpen={true}
          onClose={() => {}}
          onSave={handleSave}
          onDelete={() => {}}
          projectSettings={settings}
          allItems={[itemWithoutMeta]}
        />
      );
    });

    const boolSelect = screen.getByTestId('custom-field-boolean-requires_signoff') as HTMLSelectElement;
    expect(boolSelect.value).toBe('');

    // Selecting 'false' on the first interaction should immediately register false
    await act(async () => {
      fireEvent.change(boolSelect, { target: { value: 'false' } });
    });
    expect(boolSelect.value).toBe('false');

    // Save should succeed with requires_signoff: false
    const saveBtn = screen.getByText('Save Changes');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(handleSave).toHaveBeenCalledWith(
      'item-001',
      expect.objectContaining({
        metadata: expect.objectContaining({
          requires_signoff: false,
        }),
      })
    );
  });

  it('removes configured typed field when user clicks remove and moves it to suggested fields', async () => {
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

    const itemWithTone: WorkItem = {
      ...sampleItem,
      metadata: {
        tone_standard: 'Peplink',
      },
    };

    await act(async () => {
      render(
        <WorkItemModal
          item={itemWithTone}
          isOpen={true}
          onClose={() => {}}
          onSave={handleSave}
          onDelete={() => {}}
          projectSettings={settings}
          allItems={[itemWithTone]}
        />
      );
    });

    // 1. Field is initially rendered in DOM
    expect(screen.getByTestId('custom-field-enum-tone_standard')).toBeDefined();

    // 2. Click remove button for tone_standard
    const removeBtn = screen.getAllByTitle('Remove tone_standard')[0];
    await act(async () => {
      fireEvent.click(removeBtn);
    });

    // 3. Field control is immediately removed from the DOM
    expect(screen.queryByTestId('custom-field-enum-tone_standard')).toBeNull();

    // 4. Field is now available in suggested fields pill list
    const addPill = screen.getByTitle('Add Tone Standard field');
    expect(addPill).toBeDefined();

    // 5. Saving persists the removal
    const saveBtn = screen.getByText('Save Changes');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(handleSave).toHaveBeenCalledWith(
      'item-001',
      expect.not.objectContaining({
        metadata: expect.objectContaining({
          tone_standard: expect.anything(),
        }),
      })
    );
  });

  it('makes field visible again when manually re-added via Add Field', async () => {
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

    const itemWithTone: WorkItem = {
      ...sampleItem,
      metadata: {
        tone_standard: 'Peplink',
      },
    };

    await act(async () => {
      render(
        <WorkItemModal
          item={itemWithTone}
          isOpen={true}
          onClose={() => {}}
          onSave={handleSave}
          onDelete={() => {}}
          projectSettings={settings}
          allItems={[itemWithTone]}
        />
      );
    });

    // 1. Remove tone_standard
    const removeBtn = screen.getAllByTitle('Remove tone_standard')[0];
    await act(async () => {
      fireEvent.click(removeBtn);
    });
    expect(screen.queryByTestId('custom-field-enum-tone_standard')).toBeNull();

    // 2. Open manual "Add Field"
    const addFieldToggle = screen.getByText('Add Field');
    await act(async () => {
      fireEvent.click(addFieldToggle);
    });

    // 3. Fill in key and value
    const keyInput = screen.getByPlaceholderText(/key \(e\.g\. priority\)/i);
    const valInput = screen.getByPlaceholderText(/value/i);
    await act(async () => {
      fireEvent.change(keyInput, { target: { value: 'tone_standard' } });
      fireEvent.change(valInput, { target: { value: 'Academic' } });
    });

    // 4. Click Add button
    const addAttrBtn = screen.getByRole('button', { name: /^add$/i });
    await act(async () => {
      fireEvent.click(addAttrBtn);
    });

    // 5. Field is restored to the DOM and has value 'Academic'
    const restoredSelect = screen.getByTestId('custom-field-enum-tone_standard') as HTMLSelectElement;
    expect(restoredSelect).toBeDefined();
    expect(restoredSelect.value).toBe('Academic');
  });
});
