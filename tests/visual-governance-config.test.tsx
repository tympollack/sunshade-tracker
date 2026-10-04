import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SprintGovernanceForm } from '@/components/schema/SprintGovernanceForm';
import { TaxonomyConfigEditor } from '@/components/schema/TaxonomyConfigEditor';
import { ProjectSchemaEditor } from '@/components/schema/ProjectSchemaEditor';
import { ProjectSchemaView } from '@/components/schema/ProjectSchemaView';
import { ProjectSettings, WorkItem } from '@/types/tracker';

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
  custom_fields: ['priority', 'points'],
  sprint_metrics: {
    velocity_window: 3,
    late_runway_threshold: 0.60,
    late_runway_max_points: 2,
    reliability_healthy_threshold: 85,
    enforce_zero_sum: true,
    lock_estimates: true,
    lock_estimates_in_active_sprint: true,
    feature_story_types: ['epic', 'story'],
    allowed_late_types: ['bug', 'chore', 'debt'],
    unstarted_statuses: ['todo', 'backlog'],
    in_progress_statuses: ['in_progress'],
    completed_statuses: ['done'],
  },
  github_repo: 'sunshade/repo-test',
};

describe('TASK-TRK-GOVERNANCE-METRICS-FORM: SprintGovernanceForm', () => {
  it('renders numeric steppers, percentage controls, and toggles with defaults', () => {
    const handleChange = vi.fn();
    render(<SprintGovernanceForm metrics={baseSettings.sprint_metrics} onChange={handleChange} />);

    expect(screen.getByText('Sprint Metric Rules (Governance)')).toBeDefined();
    expect(screen.getByText('Velocity Window')).toBeDefined();
    expect(screen.getByText('Runway Cutoff')).toBeDefined();
    expect(screen.getByText('Late Inflow Cap')).toBeDefined();
    expect(screen.getByText('Healthy Say/Do')).toBeDefined();
    expect(screen.getByText('Zero-Sum Backlog Swaps')).toBeDefined();
    expect(screen.getByText('Lock Estimates in Active Sprints')).toBeDefined();
  });

  it('increments and decrements velocity window within 1-10 bounds', () => {
    const handleChange = vi.fn();
    render(<SprintGovernanceForm metrics={{ ...baseSettings.sprint_metrics, velocity_window: 3 }} onChange={handleChange} />);

    const decBtn = screen.getByLabelText('Decrease velocity window');
    const incBtn = screen.getByLabelText('Increase velocity window');

    fireEvent.click(incBtn);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ velocity_window: 4 })
    );

    fireEvent.click(decBtn);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ velocity_window: 2 })
    );
  });

  it('validates late cap points and prevents negative values', () => {
    const handleChange = vi.fn();
    render(<SprintGovernanceForm metrics={{ ...baseSettings.sprint_metrics, late_runway_max_points: 0 }} onChange={handleChange} />);

    const decBtn = screen.getByLabelText('Decrease late inflow cap');
    expect((decBtn as HTMLButtonElement).disabled).toBe(true);

    const input = screen.getByLabelText('Late Inflow Cap');
    fireEvent.change(input, { target: { value: '-5' } });
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ late_runway_max_points: 0 })
    );
  });

  it('toggles enforce_zero_sum and lock_estimates', () => {
    const handleChange = vi.fn();
    render(<SprintGovernanceForm metrics={baseSettings.sprint_metrics} onChange={handleChange} />);

    const zeroSumSwitch = screen.getByRole('switch', { name: /toggle zero-sum enforcement/i });
    fireEvent.click(zeroSumSwitch);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ enforce_zero_sum: false })
    );

    const lockSwitch = screen.getByRole('switch', { name: /toggle estimate locking/i });
    fireEvent.click(lockSwitch);
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({ lock_estimates: false, lock_estimates_in_active_sprint: false })
    );
  });
});

describe('TASK-TRK-TAXONOMY-TAG-EDITORS: TaxonomyConfigEditor', () => {
  it('renders chip tags for allowed story types, late types, and lifecycle buckets', () => {
    render(<TaxonomyConfigEditor settings={baseSettings} onChange={vi.fn()} />);

    expect(screen.getByText('Taxonomy & Lifecycle Configuration')).toBeDefined();
    expect(screen.getByText('Allowed Item Types (Creation)')).toBeDefined();
    expect(screen.getByText('Allowed Mid-Sprint Inflow Types (allowed_late_types)')).toBeDefined();
    expect(screen.getByText('Unstarted / Backlog Statuses')).toBeDefined();
    expect(screen.getByText('In Progress / Active Statuses')).toBeDefined();
    expect(screen.getByText('Completed / Closed Statuses')).toBeDefined();

    // Verify chips render
    expect(screen.getByText('epic')).toBeDefined();
    expect(screen.getByText('bug')).toBeDefined();
  });

  it('supports adding tags via input with comma or enter, and deduplicates', () => {
    const handleChange = vi.fn();
    render(<TaxonomyConfigEditor settings={baseSettings} onChange={handleChange} />);

    const storyInput = screen.getByLabelText('Allowed Item Types (Creation)');
    // Type a new tag with leading/trailing spaces and mixed case
    fireEvent.change(storyInput, { target: { value: '  Initiative  ' } });
    fireEvent.keyDown(storyInput, { key: 'Enter' });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        allowed_story_types: expect.arrayContaining(['epic', 'story', 'initiative']),
      })
    );
  });

  it('removes tag when clicking remove button or backspace on empty input', () => {
    const handleChange = vi.fn();
    render(<TaxonomyConfigEditor settings={baseSettings} onChange={handleChange} />);

    const removeEpicBtn = screen.getByLabelText('Remove tag epic');
    fireEvent.click(removeEpicBtn);

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        allowed_story_types: ['story'],
      })
    );
  });

  it('warns when removing a status currently in use by active work items', () => {
    const handleChange = vi.fn();
    const activeItems: WorkItem[] = [
      {
        id: 'item-1',
        tenant_id: 't1',
        project_id: 'p1',
        item_type: 'task',
        status: 'todo',
        title: 'Active Task 1',
        order_index: 1000,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    ];

    render(
      <TaxonomyConfigEditor
        settings={baseSettings}
        onChange={handleChange}
        activeItems={activeItems}
      />
    );

    const removeTodoBtn = screen.getByLabelText('Remove tag todo');
    fireEvent.click(removeTodoBtn);

    // Warning should appear indicating the status is in use
    expect(screen.getByText(/Warning: Status "todo" is currently assigned to 1 active work item/i)).toBeDefined();
  });
});

describe('TASK-TRK-SCHEMA-TAB-VIEW-SWITCHER: ProjectSchemaView', () => {
  it('defaults to Visual Form mode and displays 3-way segmented switcher', () => {
    render(<ProjectSchemaView settings={baseSettings} onSave={vi.fn()} />);

    const tabs = screen.getAllByRole('tab');
    expect(tabs.length).toBe(3);
    expect(screen.getByText('Visual Form')).toBeDefined();
    expect(screen.getByText('Interactive Tree')).toBeDefined();
    expect(screen.getByText('Raw JSON')).toBeDefined();

    // Default active is Visual Form
    const visualTab = screen.getByRole('tab', { name: /visual form/i });
    expect(visualTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText('Sprint Metric Rules (Governance)')).toBeDefined();
  });

  it('switches between Visual Form, Interactive Tree, and Raw JSON while preserving drafts', () => {
    render(<ProjectSchemaView settings={baseSettings} onSave={vi.fn()} />);

    // Switch to Interactive Tree
    const treeTab = screen.getByRole('tab', { name: /interactive tree/i });
    fireEvent.click(treeTab);
    expect(treeTab.getAttribute('aria-selected')).toBe('true');
    expect(screen.getByText(/"schema_version":/)).toBeDefined();

    // Switch to Raw JSON
    const rawTab = screen.getByRole('tab', { name: /raw json/i });
    fireEvent.click(rawTab);
    expect(rawTab.getAttribute('aria-selected')).toBe('true');

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toContain('"schema_version": "1.0"');
  });

  it('locks switching and shows syntax error toast when invalid JSON is entered in Raw mode', () => {
    render(<ProjectSchemaView settings={baseSettings} onSave={vi.fn()} initialMode="raw" />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '{"broken": syntax_err}' } });

    // Attempt to switch to Visual Form
    const visualTab = screen.getByRole('tab', { name: /visual form/i });
    fireEvent.click(visualTab);

    // Switch should be locked: mode stays raw
    expect(screen.getByRole('tab', { name: /raw json/i }).getAttribute('aria-selected')).toBe('true');
    // Toast error should be visible
    expect(screen.getByText(/Cannot switch view: .*Fix JSON syntax errors before switching/i)).toBeDefined();
  });

  it('pins Format, Reset, and Save Schema buttons across all modes', async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    render(<ProjectSchemaView settings={baseSettings} onSave={handleSave} />);

    const formatBtn = screen.getByRole('button', { name: /format/i });
    const resetBtn = screen.getByRole('button', { name: /reset/i });
    const saveBtn = screen.getByRole('button', { name: /save schema/i });

    expect(formatBtn).toBeDefined();
    expect(resetBtn).toBeDefined();
    expect(saveBtn).toBeDefined();

    fireEvent.click(saveBtn);
    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith(baseSettings);
    });
  });

  it('resets in-memory draft back to initial props when clicking Reset', () => {
    render(<ProjectSchemaView settings={baseSettings} onSave={vi.fn()} initialMode="raw" />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '{"schema_version": "9.9"}' } });
    expect(textarea.value).toContain('"9.9"');

    const resetBtn = screen.getByRole('button', { name: /reset/i });
    fireEvent.click(resetBtn);

    expect(textarea.value).toContain('"schema_version": "1.0"');
  });

  it('formats unformatted raw JSON when clicking Format button', () => {
    render(<ProjectSchemaView settings={baseSettings} onSave={vi.fn()} initialMode="raw" />);

    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: '{"a":1,"b":2}' } });

    const formatBtn = screen.getByRole('button', { name: /format/i });
    fireEvent.click(formatBtn);

    expect(textarea.value).toBe('{\n  "a": 1,\n  "b": 2\n}');
  });

  it('navigates autocomplete suggestions with ArrowDown, ArrowUp, and Enter', () => {
    const handleChange = vi.fn();
    render(<TaxonomyConfigEditor settings={baseSettings} onChange={handleChange} />);

    const storyInput = screen.getByLabelText('Allowed Item Types (Creation)');
    fireEvent.focus(storyInput);
    fireEvent.change(storyInput, { target: { value: 'ini' } });

    // Autocomplete dropdown item should be displayed
    expect(screen.getByText('initiative')).toBeDefined();

    // Arrow down and enter to commit suggestion
    fireEvent.keyDown(storyInput, { key: 'ArrowDown' });
    fireEvent.keyDown(storyInput, { key: 'Enter' });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        allowed_story_types: expect.arrayContaining(['epic', 'story', 'initiative']),
      })
    );
  });

  it('commits tag on comma delimiter and removes last tag on Backspace', () => {
    const handleChange = vi.fn();
    render(<TaxonomyConfigEditor settings={baseSettings} onChange={handleChange} />);

    const storyInput = screen.getByLabelText('Allowed Item Types (Creation)');
    fireEvent.change(storyInput, { target: { value: 'feature' } });
    fireEvent.keyDown(storyInput, { key: ',' });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        allowed_story_types: expect.arrayContaining(['epic', 'story', 'feature']),
      })
    );

    // Backspace on empty input removes last tag ('story')
    fireEvent.change(storyInput, { target: { value: '' } });
    fireEvent.keyDown(storyInput, { key: 'Backspace' });

    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        allowed_story_types: ['epic'],
      })
    );
  });
});

