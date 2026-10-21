import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import {
  WorkItemInspectorDrawer,
  RESERVED_METADATA_KEYS,
  resolveCustomMetadataFields,
} from '@/components/drawer/WorkItemInspectorDrawer';
import { WorkItem, CustomMetadataFieldDefinition } from '@/types/tracker';

describe('BUG-TRK-INSPECTOR-CUSTOM-PROPS-DEDUP: Filter Core Reserved Keys from Inspector Drawer', () => {
  it('defines RESERVED_METADATA_KEYS set containing all required system keys', () => {
    const requiredKeys = [
      'sprint',
      'status',
      'assignee',
      'priority',
      'complexity',
      'story_points',
      'points',
      'parent_id',
      'project_id',
    ];
    for (const key of requiredKeys) {
      expect(RESERVED_METADATA_KEYS.has(key)).toBe(true);
    }
  });

  it('renders Sprint exactly once under core attributes and filters reserved keys from Custom Properties', () => {
    const mockItem: WorkItem = {
      id: 'item-dedup-1',
      tenant_id: 't-1',
      project_id: 'p-1',
      external_ref_id: 'TASK-DEDUP-1',
      item_type: 'task',
      status: 'in_progress',
      title: 'Inspector Deduplication Test Item',
      description: 'Testing custom properties deduplication',
      order_index: 1000,
      assignee: 'tympollack',
      metadata: {
        sprint: 'Sprint 2026-Q4',
        status: 'in_progress',
        assignee: 'tympollack',
        priority: 'Critical',
        complexity: 3,
        story_points: 5,
        points: 5,
        parent_id: null,
        project_id: 'p-1',
        commit_hash: '1e610f7',
        pr_url: 'https://github.com/tympollack/sunshade-tracker/pull/114',
        agent_prompt: 'Resolve layout collisions',
        source_type: 'ui_defect',
      },
      created_at: '2026-10-21T00:00:00Z',
      updated_at: '2026-10-21T00:00:00Z',
    };

    render(
      <WorkItemInspectorDrawer
        item={mockItem}
        isOpen={true}
        onClose={vi.fn()}
        availableSprints={['Sprint 2026-Q4', 'Sprint 2027-Q1']}
        tenantSlug="pym-energy"
      />
    );

    // 1. Core Sprint dropdown exists exactly once
    const sprintSelects = screen.getAllByLabelText('Sprint');
    expect(sprintSelects).toHaveLength(1);
    expect(sprintSelects[0]).toHaveValue('Sprint 2026-Q4');

    // 2. Custom Properties section is present
    expect(screen.getByTestId('dynamic-custom-fields-section')).toBeInTheDocument();

    // 3. Legitimate custom properties are rendered
    expect(screen.getByLabelText('Commit Hash')).toBeInTheDocument();
    expect(screen.getByLabelText('Commit Hash')).toHaveValue('1e610f7');

    expect(screen.getByLabelText('Pr Url')).toBeInTheDocument();
    expect(screen.getByLabelText('Pr Url')).toHaveValue(
      'https://github.com/tympollack/sunshade-tracker/pull/114'
    );

    expect(screen.getByLabelText('Agent Prompt')).toBeInTheDocument();
    expect(screen.getByLabelText('Agent Prompt')).toHaveValue('Resolve layout collisions');

    expect(screen.getByLabelText('Source Type')).toBeInTheDocument();
    expect(screen.getByLabelText('Source Type')).toHaveValue('ui_defect');

    // 4. Verify reserved keys are NOT rendered under Custom Properties
    expect(screen.queryByLabelText('Parent Id')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Project Id')).not.toBeInTheDocument();
  });

  it('filters sprint from configured schema fields so Sprint is never duplicated', () => {
    const fieldsWithSprint: CustomMetadataFieldDefinition[] = [
      { key: 'sprint', label: 'Sprint', type: 'string' },
      { key: 'client_name', label: 'Client Name', type: 'string' },
    ];

    const resolved = resolveCustomMetadataFields(null, fieldsWithSprint);
    expect(resolved.some((f) => f.key.toLowerCase() === 'sprint')).toBe(false);
    expect(resolved.some((f) => f.key.toLowerCase() === 'client_name')).toBe(true);
  });

  it('modifying custom properties updates metadata without corrupting primary item columns', () => {
    const onUpdate = vi.fn();
    const mockItem: WorkItem = {
      id: 'item-dedup-2',
      tenant_id: 't-1',
      project_id: 'p-1',
      external_ref_id: 'TASK-DEDUP-2',
      item_type: 'task',
      status: 'in_progress',
      title: 'Original Title',
      order_index: 2000,
      assignee: 'tympollack',
      metadata: {
        sprint: 'Sprint 2026-Q4',
        commit_hash: 'abc1234',
      },
      created_at: '2026-10-21T00:00:00Z',
      updated_at: '2026-10-21T00:00:00Z',
    };

    render(
      <WorkItemInspectorDrawer
        item={mockItem}
        isOpen={true}
        onClose={vi.fn()}
        onUpdateItem={onUpdate}
        tenantSlug="pym-energy"
      />
    );

    const commitInput = screen.getByLabelText('Commit Hash');
    act(() => {
      fireEvent.change(commitInput, { target: { value: 'fedcba9' } });
      fireEvent.blur(commitInput);
    });

    expect(onUpdate).toHaveBeenCalledWith(
      'item-dedup-2',
      expect.objectContaining({
        metadata: expect.objectContaining({
          sprint: 'Sprint 2026-Q4',
          commit_hash: 'fedcba9',
        }),
      })
    );
  });
});
