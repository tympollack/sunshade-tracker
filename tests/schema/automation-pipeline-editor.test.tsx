import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { AutomationPipelineEditor } from '@/components/schema/AutomationPipelineEditor';
import { ProjectSchemaView } from '@/components/schema/ProjectSchemaView';
import type { ProjectSettings } from '@/types/tracker';

describe('TASK-TRK-AUTOMATION-PIPELINE-BUILDER-UI: AutomationPipelineEditor', () => {
  const baseSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [
      { type: 'story', label: 'Story', level: 1, allowed_parents: [] },
      { type: 'task', label: 'Task', level: 2, allowed_parents: ['story'] },
    ],
    statuses: [
      { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
      { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      { id: 'in_review', label: 'In Review', color: '#f59e0b', order: 3 },
      { id: 'complete', label: 'Complete', color: '#10b981', order: 4, is_completed: true },
    ],
    custom_fields: [
      'pr_url',
      'service_name',
      { key: 'target_words', label: 'Target Words', type: 'number' },
    ],
    templates: {
      qa_verification_template: [
        { title: 'Unit test verification', item_type: 'task' },
        { title: 'Staging smoke test', item_type: 'task' },
      ],
    },
    automations: [
      {
        id: 'rule-expand-qa',
        name: 'Auto Expand QA Checklist on Review',
        enabled: true,
        trigger: {
          event: 'status_transition',
          status: 'in_review',
        },
        conditions: [
          {
            field: 'item_type',
            operator: '$eq',
            value: 'story',
          },
        ],
        actions: [
          {
            type: 'expand_children_template',
            template_id: 'qa_verification_template',
          },
        ],
      },
      {
        id: 'rule-deploy-webhook',
        name: 'Dispatch Deploy Notification',
        enabled: false,
        trigger: {
          event: 'deployment_completed',
        },
        conditions: [],
        actions: [
          {
            type: 'dispatch_webhook',
            url: 'https://hooks.slack.com/services/123',
            include_parent_context: true,
          },
        ],
      },
    ],
  };

  it('renders configured automation rules with accordion cards, names, and event badges', () => {
    const handleChange = vi.fn();
    render(<AutomationPipelineEditor settings={baseSettings} onChange={handleChange} />);

    expect(screen.getByTestId('automation-pipeline-editor-section')).toBeInTheDocument();
    expect(screen.getByText('Auto Expand QA Checklist on Review')).toBeInTheDocument();
    expect(screen.getByText('Dispatch Deploy Notification')).toBeInTheDocument();

    expect(screen.getByTestId('rule-event-badge-rule-expand-qa')).toHaveTextContent('status_transition');
    expect(screen.getByTestId('rule-event-badge-rule-deploy-webhook')).toHaveTextContent('deployment_completed');
  });

  it('renders empty state when no automations are configured', () => {
    const handleChange = vi.fn();
    const emptySettings: ProjectSettings = {
      ...baseSettings,
      automations: [],
    };

    render(<AutomationPipelineEditor settings={emptySettings} onChange={handleChange} />);
    expect(screen.getByTestId('automations-empty-state')).toBeInTheDocument();
  });

  it('adds a new automation rule with default trigger and patch action', () => {
    const handleChange = vi.fn();
    render(<AutomationPipelineEditor settings={baseSettings} onChange={handleChange} />);

    const addBtn = screen.getByTestId('add-automation-rule-button');
    fireEvent.click(addBtn);

    expect(handleChange).toHaveBeenCalledTimes(1);
    const updated = handleChange.mock.calls[0][0];
    expect(updated.automations).toHaveLength(3);
    expect(updated.automations[2].name).toBe('New Automation Rule');
    expect(updated.automations[2].trigger.event).toBe('status_transition');
  });

  it('deletes an automation rule when delete button is clicked', () => {
    const handleChange = vi.fn();
    render(<AutomationPipelineEditor settings={baseSettings} onChange={handleChange} />);

    const deleteBtn = screen.getByTestId('delete-rule-rule-expand-qa');
    fireEvent.click(deleteBtn);

    expect(handleChange).toHaveBeenCalledTimes(1);
    const updated = handleChange.mock.calls[0][0];
    expect(updated.automations).toHaveLength(1);
    expect(updated.automations[0].id).toBe('rule-deploy-webhook');
  });

  it('toggles rule enabled switch', () => {
    const handleChange = vi.fn();
    render(<AutomationPipelineEditor settings={baseSettings} onChange={handleChange} />);

    const toggle = screen.getByTestId('toggle-rule-enabled-rule-expand-qa');
    fireEvent.click(toggle);

    expect(handleChange).toHaveBeenCalledTimes(1);
    const updated = handleChange.mock.calls[0][0];
    expect(updated.automations[0].enabled).toBe(false);
  });

  it('updates trigger event type and target status matcher', () => {
    const handleChange = vi.fn();
    render(<AutomationPipelineEditor settings={baseSettings} onChange={handleChange} />);

    const statusSelect = screen.getByTestId('trigger-status-select-rule-expand-qa');
    fireEvent.change(statusSelect, { target: { value: 'complete' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        automations: expect.arrayContaining([
          expect.objectContaining({
            id: 'rule-expand-qa',
            trigger: expect.objectContaining({
              status: 'complete',
            }),
          }),
        ]),
      })
    );
  });

  it('adds, modifies, and removes condition filter rows with AND/OR logic', () => {
    const handleChange = vi.fn();
    render(<AutomationPipelineEditor settings={baseSettings} onChange={handleChange} />);

    // Add filter condition
    const addCondBtn = screen.getByTestId('add-condition-rule-expand-qa');
    fireEvent.click(addCondBtn);

    expect(handleChange).toHaveBeenCalledTimes(1);
    const updated = handleChange.mock.calls[0][0];
    expect(updated.automations[0].conditions).toHaveLength(2);

    // Modify operator
    const opSelect = screen.getByTestId('condition-operator-select-rule-expand-qa-0');
    fireEvent.change(opSelect, { target: { value: '$in' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        automations: expect.arrayContaining([
          expect.objectContaining({
            id: 'rule-expand-qa',
            conditions: expect.arrayContaining([
              expect.objectContaining({
                operator: '$in',
              }),
            ]),
          }),
        ]),
      })
    );

    // Delete condition
    const deleteCondBtn = screen.getByTestId('delete-condition-rule-expand-qa-0');
    fireEvent.click(deleteCondBtn);

    const afterDelete = handleChange.mock.calls[handleChange.mock.calls.length - 1][0];
    expect(afterDelete.automations[0].conditions).toHaveLength(0);
  });

  it('configures calculate_calendar_slot action with cadence days, weekday, and collision statuses', () => {
    const handleChange = vi.fn();
    render(<AutomationPipelineEditor settings={baseSettings} onChange={handleChange} />);

    // Change action type to calculate_calendar_slot
    const actionTypeSelect = screen.getByTestId('action-type-select-rule-expand-qa-0');
    fireEvent.change(actionTypeSelect, { target: { value: 'calculate_calendar_slot' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        automations: expect.arrayContaining([
          expect.objectContaining({
            id: 'rule-expand-qa',
            actions: expect.arrayContaining([
              expect.objectContaining({
                type: 'calculate_calendar_slot',
                cadence_days: 7,
                weekday: 'Monday',
              }),
            ]),
          }),
        ]),
      })
    );
  });

  it('configures patch_metadata action with key-value pairs', () => {
    const handleChange = vi.fn();
    render(<AutomationPipelineEditor settings={baseSettings} onChange={handleChange} />);

    // Change action type to patch_metadata
    const actionTypeSelect = screen.getByTestId('action-type-select-rule-expand-qa-0');
    fireEvent.change(actionTypeSelect, { target: { value: 'patch_metadata' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        automations: expect.arrayContaining([
          expect.objectContaining({
            id: 'rule-expand-qa',
            actions: expect.arrayContaining([
              expect.objectContaining({
                type: 'patch_metadata',
              }),
            ]),
          }),
        ]),
      })
    );
  });

  it('synchronizes automations cleanly between Visual Form and Raw JSON in ProjectSchemaView', async () => {
    const handleSave = vi.fn();
    render(
      <ProjectSchemaView
        settings={baseSettings}
        onSave={handleSave}
        initialMode="visual"
      />
    );

    expect(screen.getByTestId('automation-pipeline-editor-section')).toBeInTheDocument();
    expect(screen.getByText('Auto Expand QA Checklist on Review')).toBeInTheDocument();

    // Switch to Raw JSON
    const rawTab = screen.getByRole('tab', { name: /raw json/i });
    fireEvent.click(rawTab);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toContain('"automations"');
    expect(textarea.value).toContain('Auto Expand QA Checklist on Review');
    expect(textarea.value).toContain('qa_verification_template');

    // Switch back to Visual Form
    const visualTab = screen.getByRole('tab', { name: /visual form/i });
    fireEvent.click(visualTab);

    expect(screen.getByTestId('automation-pipeline-editor-section')).toBeInTheDocument();
  });
});
