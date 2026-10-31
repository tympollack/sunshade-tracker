import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { TransitionGuardsEditor } from '@/components/schema/TransitionGuardsEditor';
import { ProjectSchemaView } from '@/components/schema/ProjectSchemaView';
import type { ProjectSettings } from '@/types/tracker';

describe('TASK-TRK-TRANSITION-GUARD-BUILDER-UI: TransitionGuardsEditor', () => {
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
      'commit_hash',
      { key: 'target_words', label: 'Target Words', type: 'number' },
    ],
    transition_guards: [
      {
        id: 'guard-review-pr',
        name: 'Require PR & Commit for In Review',
        enabled: true,
        target_status: 'in_review',
        conditions: [
          {
            field: 'metadata.pr_url',
            operator: '$is_not_null',
            message: 'Pull Request URL is required.',
          },
          {
            field: 'metadata.commit_hash',
            operator: '$is_not_null',
            message: 'Commit hash is required.',
          },
        ],
      },
      {
        id: 'guard-deploy-prod',
        name: 'Require QA Approval for Complete',
        enabled: false,
        target_status: 'complete',
        conditions: [
          {
            field: 'status',
            operator: '$eq',
            value: 'in_review',
            message: 'Must come directly from in_review.',
          },
        ],
      },
    ],
  };

  it('renders configured transition guards with accordion cards, names, and badges', () => {
    const handleChange = vi.fn();
    render(<TransitionGuardsEditor settings={baseSettings} onChange={handleChange} />);

    expect(screen.getByTestId('transition-guards-editor-section')).toBeInTheDocument();
    expect(screen.getByText('Require PR & Commit for In Review')).toBeInTheDocument();
    expect(screen.getByText('Require QA Approval for Complete')).toBeInTheDocument();

    // Check target status badge
    const badge = screen.getByTestId('target-status-badge-guard-review-pr');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('In Review');
  });

  it('renders empty state when no transition guards exist', () => {
    const handleChange = vi.fn();
    const emptySettings: ProjectSettings = {
      ...baseSettings,
      transition_guards: [],
    };

    render(<TransitionGuardsEditor settings={emptySettings} onChange={handleChange} />);
    expect(screen.getByTestId('transition-guards-empty-state')).toBeInTheDocument();
  });

  it('adds a new transition guard when + Add Transition Guard button is clicked', () => {
    const handleChange = vi.fn();
    render(<TransitionGuardsEditor settings={baseSettings} onChange={handleChange} />);

    const addButton = screen.getByTestId('add-transition-guard-button');
    fireEvent.click(addButton);

    expect(handleChange).toHaveBeenCalledTimes(1);
    const updatedSettings = handleChange.mock.calls[0][0];
    expect(updatedSettings.transition_guards).toHaveLength(3);
    expect(updatedSettings.transition_guards[2].name).toBe('Require Review Criteria');
    expect(updatedSettings.transition_guards[2].target_status).toBe('in_review');
  });

  it('deletes a transition guard when delete button is clicked', () => {
    const handleChange = vi.fn();
    render(<TransitionGuardsEditor settings={baseSettings} onChange={handleChange} />);

    const deleteBtn = screen.getByTestId('delete-guard-guard-review-pr');
    fireEvent.click(deleteBtn);

    expect(handleChange).toHaveBeenCalledTimes(1);
    const updatedSettings = handleChange.mock.calls[0][0];
    expect(updatedSettings.transition_guards).toHaveLength(1);
    expect(updatedSettings.transition_guards[0].id).toBe('guard-deploy-prod');
  });

  it('toggles enabled state when switch is toggled', () => {
    const handleChange = vi.fn();
    render(<TransitionGuardsEditor settings={baseSettings} onChange={handleChange} />);

    const toggle = screen.getByTestId('toggle-guard-enabled-guard-review-pr');
    fireEvent.click(toggle);

    expect(handleChange).toHaveBeenCalledTimes(1);
    const updatedSettings = handleChange.mock.calls[0][0];
    expect(updatedSettings.transition_guards[0].enabled).toBe(false);
  });

  it('updates guard name and target status dynamically', () => {
    const handleChange = vi.fn();
    render(<TransitionGuardsEditor settings={baseSettings} onChange={handleChange} />);

    // Update name
    const nameInput = screen.getByTestId('guard-name-input-guard-review-pr');
    fireEvent.change(nameInput, { target: { value: 'Strict In Review Gate' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        transition_guards: expect.arrayContaining([
          expect.objectContaining({
            id: 'guard-review-pr',
            name: 'Strict In Review Gate',
          }),
        ]),
      })
    );

    // Update target status
    const statusSelect = screen.getByTestId('guard-target-status-select-guard-review-pr');
    fireEvent.change(statusSelect, { target: { value: 'complete' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        transition_guards: expect.arrayContaining([
          expect.objectContaining({
            id: 'guard-review-pr',
            target_status: 'complete',
          }),
        ]),
      })
    );
  });

  it('adds and updates condition rows within a guard', () => {
    const handleChange = vi.fn();
    render(<TransitionGuardsEditor settings={baseSettings} onChange={handleChange} />);

    // Add condition
    const addCondBtn = screen.getByTestId('add-condition-guard-review-pr');
    fireEvent.click(addCondBtn);

    expect(handleChange).toHaveBeenCalledTimes(1);
    const updatedWithNewCond = handleChange.mock.calls[0][0];
    expect(updatedWithNewCond.transition_guards[0].conditions).toHaveLength(3);

    // Update condition field
    const fieldSelect = screen.getByTestId('condition-field-select-guard-review-pr-0');
    fireEvent.change(fieldSelect, { target: { value: 'metadata.target_words' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        transition_guards: expect.arrayContaining([
          expect.objectContaining({
            conditions: expect.arrayContaining([
              expect.objectContaining({
                field: 'metadata.target_words',
              }),
            ]),
          }),
        ]),
      })
    );

    // Update condition operator
    const opSelect = screen.getByTestId('condition-operator-select-guard-review-pr-0');
    fireEvent.change(opSelect, { target: { value: '$gt' } });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        transition_guards: expect.arrayContaining([
          expect.objectContaining({
            conditions: expect.arrayContaining([
              expect.objectContaining({
                operator: '$gt',
              }),
            ]),
          }),
        ]),
      })
    );

    // Delete condition
    const deleteCondBtn = screen.getByTestId('delete-condition-guard-review-pr-0');
    fireEvent.click(deleteCondBtn);

    const updatedAfterDelete = handleChange.mock.calls[handleChange.mock.calls.length - 1][0];
    expect(updatedAfterDelete.transition_guards[0].conditions).toHaveLength(1);
    expect(updatedAfterDelete.transition_guards[0].conditions[0].field).toBe('metadata.commit_hash');
  });

  it('synchronizes transition_guards state cleanly between Visual Form and Raw JSON in ProjectSchemaView', async () => {
    const handleSave = vi.fn();
    render(
      <ProjectSchemaView
        settings={baseSettings}
        onSave={handleSave}
        initialMode="visual"
      />
    );

    // In Visual Form mode, the Transition Guards editor should be present
    expect(screen.getByTestId('transition-guards-editor-section')).toBeInTheDocument();
    expect(screen.getByText('Require PR & Commit for In Review')).toBeInTheDocument();

    // Switch to Raw JSON tab
    const rawTab = screen.getByRole('tab', { name: /raw json/i });
    fireEvent.click(rawTab);

    // Check textarea contains transition_guards JSON
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toContain('"transition_guards"');
    expect(textarea.value).toContain('Require PR & Commit for In Review');

    // Switch back to Visual Form
    const visualTab = screen.getByRole('tab', { name: /visual form/i });
    fireEvent.click(visualTab);

    expect(screen.getByTestId('transition-guards-editor-section')).toBeInTheDocument();
  });
});
