import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ProjectSchemaView } from '@/components/schema/ProjectSchemaView';
import { ProjectSettings } from '@/types/tracker';

describe('FEAT-TRK-CLONE-PROJECT-SCHEMA', () => {
  const currentProjectSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [
      { type: 'epic', label: 'Epic', level: 1, allowed_parents: [] },
      { type: 'task', label: 'Task', level: 2, allowed_parents: ['epic'] },
    ],
    statuses: [
      { id: 'todo', label: 'To Do', color: '#94a3b8', order: 1 },
      { id: 'done', label: 'Done', color: '#22c55e', order: 2, is_completed: true },
    ],
    custom_fields: ['priority'],
  };

  const marketingProjectSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [
      { type: 'campaign', label: 'Campaign', level: 1, allowed_parents: [] },
      { type: 'creative', label: 'Creative', level: 2, allowed_parents: ['campaign'] },
    ],
    statuses: [
      { id: 'concept', label: 'Concept', color: '#a855f7', order: 1 },
      { id: 'review', label: 'Review', color: '#38bdf8', order: 2 },
      { id: 'published', label: 'Published', color: '#22c55e', order: 3, is_completed: true },
    ],
    custom_fields: [
      { key: 'channel', label: 'Channel', type: 'enum', options: ['Google', 'Meta'] },
      'budget',
    ],
  };

  const availableProjects = [
    {
      id: 'proj-current',
      slug: 'current-project',
      name: 'Current Project',
      settings: currentProjectSettings,
    },
    {
      id: 'proj-marketing',
      slug: 'marketing-campaigns',
      name: 'Marketing Campaigns',
      settings: marketingProjectSettings,
    },
    {
      id: 'proj-infra',
      slug: 'infrastructure',
      name: 'Infrastructure',
      settings: currentProjectSettings,
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('renders Copy Schema From dropdown with sibling projects excluding current project', () => {
    render(
      <ProjectSchemaView
        projectId="current-project"
        settings={currentProjectSettings}
        onSave={() => {}}
        availableProjects={availableProjects}
      />
    );

    const select = screen.getByTestId('copy-schema-from-project-select') as HTMLSelectElement;
    expect(select).toBeDefined();

    const optionValues = Array.from(select.options).map((opt) => opt.value);
    expect(optionValues).toContain('marketing-campaigns');
    expect(optionValues).toContain('infrastructure');
    expect(optionValues).not.toContain('current-project');
  });

  it('prompts confirmation and does NOT overwrite draft when cancelled', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(false);

    render(
      <ProjectSchemaView
        projectId="current-project"
        settings={currentProjectSettings}
        onSave={() => {}}
        availableProjects={availableProjects}
        initialMode="raw"
      />
    );

    const select = screen.getByTestId('copy-schema-from-project-select');
    await act(async () => {
      fireEvent.change(select, { target: { value: 'marketing-campaigns' } });
    });

    expect(confirmSpy).toHaveBeenCalled();
    // Raw JSON textarea should still contain 'To Do', not 'Concept'
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toContain('todo');
    expect(textarea.value).not.toContain('concept');
  });

  it('cleanly copies sibling project schema into draft editor and persists on save', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const handleSave = vi.fn().mockResolvedValue(undefined);

    render(
      <ProjectSchemaView
        projectId="current-project"
        settings={currentProjectSettings}
        onSave={handleSave}
        availableProjects={availableProjects}
        initialMode="visual"
      />
    );

    // Initial visual state shows Epic / Task
    expect(screen.getByText('Epic')).toBeDefined();
    expect(screen.getByText('Task')).toBeDefined();

    const select = screen.getByTestId('copy-schema-from-project-select');
    await act(async () => {
      fireEvent.change(select, { target: { value: 'marketing-campaigns' } });
    });

    // Active editor now has Campaign / Creative and Concept / Review / Published
    expect(screen.getByText('Campaign')).toBeDefined();
    expect(screen.getByText('Creative')).toBeDefined();
    expect(screen.getByText('Concept')).toBeDefined();
    expect(screen.getByText('Published')).toBeDefined();

    // Database has NOT been touched yet
    expect(handleSave).not.toHaveBeenCalled();

    // Now click Save Schema
    const saveBtn = screen.getByText('Save Schema');
    await act(async () => {
      fireEvent.click(saveBtn);
    });

    expect(handleSave).toHaveBeenCalledTimes(1);
    expect(handleSave).toHaveBeenCalledWith(
      expect.objectContaining({
        hierarchy: marketingProjectSettings.hierarchy,
        statuses: marketingProjectSettings.statuses,
        custom_fields: marketingProjectSettings.custom_fields,
      })
    );
  });
});
