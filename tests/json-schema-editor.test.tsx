import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { JsonSchemaEditor } from '@/components/JsonSchemaEditor';
import { ProjectSettings } from '@/types/tracker';

describe('JsonSchemaEditor component', () => {
  const sampleSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [
      { type: 'epic', label: 'Epic', level: 1, allowed_parents: [], color: '#c084fc' },
      { type: 'task', label: 'Task', level: 2, allowed_parents: ['epic'], color: '#38bdf8' },
    ],
    statuses: [
      { id: 'todo', label: 'To Do', color: '#94a3b8', order: 1 },
      { id: 'done', label: 'Done', color: '#22c55e', order: 2 },
    ],
    custom_fields: ['priority', 'points'],
  };

  it('renders interactive tree mode by default', () => {
    render(<JsonSchemaEditor settings={sampleSettings} onSave={vi.fn()} />);

    expect(screen.getByText('Interactive Tree')).toBeDefined();
    expect(screen.getByText('Raw JSON')).toBeDefined();
    // Tree view shows field names
    expect(screen.getByText(/"schema_version":/)).toBeDefined();
    expect(screen.getByText(/"hierarchy":/)).toBeDefined();
  });

  it('renders color swatches and color pickers for hex color strings', () => {
    const { container } = render(
      <JsonSchemaEditor settings={sampleSettings} onSave={vi.fn()} />
    );

    // Color inputs exist for hex colors in the schema
    const colorInputs = container.querySelectorAll('input[type="color"]');
    expect(colorInputs.length).toBeGreaterThanOrEqual(4); // 2 in hierarchy + 2 in statuses
  });

  it('allows switching to Raw JSON mode and back to Interactive Tree', () => {
    render(<JsonSchemaEditor settings={sampleSettings} onSave={vi.fn()} />);

    const rawButton = screen.getByRole('button', { name: /Raw JSON/i });
    fireEvent.click(rawButton);

    // A textarea should now be visible with the raw JSON content
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea).toBeDefined();
    expect(textarea.value).toContain('"schema_version": "1.0"');

    // Switch back to tree
    const treeButton = screen.getByRole('button', { name: /Interactive Tree/i });
    fireEvent.click(treeButton);
    expect(screen.getByText(/"schema_version":/)).toBeDefined();
  });

  it('shows error banner when invalid JSON syntax is entered in raw mode', () => {
    render(<JsonSchemaEditor settings={sampleSettings} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Raw JSON/i }));
    const textarea = screen.getByRole('textbox');

    // Enter invalid JSON
    fireEvent.change(textarea, { target: { value: '{"schema_version": INVALID}' } });

    expect(screen.getByText(/Syntax error in JSON|Unexpected token/i)).toBeDefined();
  });

  it('calls onSave when save button is clicked in tree mode', async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    render(<JsonSchemaEditor settings={sampleSettings} onSave={handleSave} />);

    const saveButton = screen.getByRole('button', { name: /Save Schema/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith(sampleSettings);
    });
  });

  it('calls onSave with updated payload when saved in raw mode', async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    render(<JsonSchemaEditor settings={sampleSettings} onSave={handleSave} />);

    fireEvent.click(screen.getByRole('button', { name: /Raw JSON/i }));
    const textarea = screen.getByRole('textbox');

    const modified = { ...sampleSettings, schema_version: '2.0' };
    fireEvent.change(textarea, { target: { value: JSON.stringify(modified) } });

    const saveButton = screen.getByRole('button', { name: /Save Schema/i });
    fireEvent.click(saveButton);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledWith(modified);
    });
  });

  it('resets modifications when reset button is clicked', () => {
    render(<JsonSchemaEditor settings={sampleSettings} onSave={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /Raw JSON/i }));
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;

    fireEvent.change(textarea, { target: { value: '{"schema_version": "modified"}' } });
    expect(textarea.value).toContain('"modified"');

    const resetButton = screen.getByRole('button', { name: /Reset/i });
    fireEvent.click(resetButton);

    expect(textarea.value).toContain('"schema_version": "1.0"');
  });
});
