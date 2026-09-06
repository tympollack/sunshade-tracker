import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { FilterMultiSelect, FilterOption } from '@/components/FilterMultiSelect';

describe('FilterMultiSelect component', () => {
  const sampleOptions: FilterOption[] = [
    { id: 'backlog', label: 'Backlog', color: '#94a3b8', count: 3 },
    { id: 'in_progress', label: 'In Progress', color: '#38bdf8', count: 2 },
    { id: 'done', label: 'Done', color: '#22c55e', count: 5 },
  ];

  it('renders summary text when all options are selected', () => {
    render(
      <FilterMultiSelect
        label="Status"
        options={sampleOptions}
        selectedIds={['backlog', 'in_progress', 'done']}
        onChange={() => {}}
      />
    );

    expect(screen.getByText('Status: All (3)')).toBeDefined();
  });

  it('renders summary text when no options are selected', () => {
    render(
      <FilterMultiSelect
        label="Status"
        options={sampleOptions}
        selectedIds={[]}
        onChange={() => {}}
      />
    );

    expect(screen.getByText('Status: None')).toBeDefined();
  });

  it('renders summary count when partially selected', () => {
    render(
      <FilterMultiSelect
        label="Status"
        options={sampleOptions}
        selectedIds={['backlog', 'done']}
        onChange={() => {}}
      />
    );

    expect(screen.getByText('Status: 2/3')).toBeDefined();
  });

  it('opens dropdown and handles Select All and Select None', () => {
    const handleChange = vi.fn();
    render(
      <FilterMultiSelect
        label="Status"
        options={sampleOptions}
        selectedIds={['backlog']}
        onChange={handleChange}
      />
    );

    // Click trigger to open dropdown
    fireEvent.click(screen.getByRole('button'));

    // Check header buttons exist
    const allBtn = screen.getByText('All');
    const noneBtn = screen.getByText('None');
    expect(allBtn).toBeDefined();
    expect(noneBtn).toBeDefined();

    // Click All
    fireEvent.click(allBtn);
    expect(handleChange).toHaveBeenCalledWith(['backlog', 'in_progress', 'done']);

    // Click None
    fireEvent.click(noneBtn);
    expect(handleChange).toHaveBeenCalledWith([]);
  });

  it('toggles individual options', () => {
    const handleChange = vi.fn();
    render(
      <FilterMultiSelect
        label="Status"
        options={sampleOptions}
        selectedIds={['backlog']}
        onChange={handleChange}
      />
    );

    fireEvent.click(screen.getByRole('button'));

    // Click Done to add it
    const doneBtn = screen.getByText('Done');
    fireEvent.click(doneBtn);
    expect(handleChange).toHaveBeenCalledWith(['backlog', 'done']);
  });
});
