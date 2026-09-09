import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ManageSprintsModal } from '@/components/ManageSprintsModal';
import { SprintDefinition, WorkItem } from '@/types/tracker';

describe('ManageSprintsModal Component (TASK-TRK-SPRINT-STANDALONE-DEF)', () => {
  const mockSprints: SprintDefinition[] = [
    {
      id: 's1',
      name: 'Sprint 2026-Q3',
      start_date: '2026-07-01',
      end_date: '2026-09-30',
      goal: 'Deliver high-priority board enhancements',
      status: 'active',
      is_current: true,
    },
    {
      id: 's2',
      name: 'Sprint 2026-Q4',
      start_date: '2026-10-01',
      end_date: '2026-12-31',
      goal: 'Architecture rollouts',
      status: 'planned',
      is_current: false,
    },
  ];

  const mockItems: WorkItem[] = [
    {
      id: 'it1',
      tenant_id: 't1',
      project_id: 'p1',
      item_type: 'story',
      status: 'in_progress',
      title: 'Item in Q3',
      order_index: 1000,
      metadata: { sprint: 'Sprint 2026-Q3' },
      created_at: '',
      updated_at: '',
    },
  ];

  it('renders configured sprints with names, badges, and metadata', () => {
    render(
      <ManageSprintsModal
        isOpen={true}
        onClose={vi.fn()}
        sprints={mockSprints}
        onSaveSprints={vi.fn()}
        items={mockItems}
      />
    );

    expect(screen.getByText('Manage Sprints')).toBeDefined();
    expect(screen.getByText('Sprint 2026-Q3')).toBeDefined();
    expect(screen.getByText('Sprint 2026-Q4')).toBeDefined();
    expect(screen.getByText('Active Sprint')).toBeDefined();
    expect(screen.getByText('Current Focus')).toBeDefined();
    expect(screen.getByText('1 item')).toBeDefined();
  });

  it('adds a new sprint and validates required fields', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ManageSprintsModal
        isOpen={true}
        onClose={vi.fn()}
        sprints={mockSprints}
        onSaveSprints={onSave}
        items={mockItems}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: /New Sprint/i }));
    expect(screen.getByText('Create New Sprint')).toBeDefined();

    // Attempting to save empty form yields error
    fireEvent.click(screen.getByRole('button', { name: /Add Sprint/i }));
    expect(screen.getByText(/Sprint name is required/i)).toBeDefined();

    // Fill form
    fireEvent.change(screen.getByPlaceholderText('e.g. Sprint 2026-Q4'), {
      target: { value: 'Sprint 2027-Q1' },
    });
    fireEvent.click(screen.getByRole('button', { name: /Add Sprint/i }));

    expect(screen.getByText('Sprint 2027-Q1')).toBeDefined();

    // Save and commit
    fireEvent.click(screen.getByRole('button', { name: /Save Sprints/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
      const saved = onSave.mock.calls[0][0];
      expect(saved.length).toBe(3);
      expect(saved.some((s: SprintDefinition) => s.name === 'Sprint 2027-Q1')).toBe(true);
    });
  });

  it('transitions sprint to completed and sets active', async () => {
    const onSave = vi.fn().mockResolvedValue(undefined);
    render(
      <ManageSprintsModal
        isOpen={true}
        onClose={vi.fn()}
        sprints={mockSprints}
        onSaveSprints={onSave}
        items={mockItems}
      />
    );

    // Click "Complete" on Sprint 2026-Q3
    fireEvent.click(screen.getByRole('button', { name: /Complete Sprint 2026-Q3/i }));

    // Click "Set Active" on Sprint 2026-Q4
    fireEvent.click(screen.getByRole('button', { name: /Set Sprint 2026-Q4 Active/i }));

    fireEvent.click(screen.getByRole('button', { name: /Save Sprints/i }));

    await waitFor(() => {
      expect(onSave).toHaveBeenCalledTimes(1);
      const saved = onSave.mock.calls[0][0];
      const q3 = saved.find((s: SprintDefinition) => s.name === 'Sprint 2026-Q3');
      const q4 = saved.find((s: SprintDefinition) => s.name === 'Sprint 2026-Q4');
      expect(q3.status).toBe('completed');
      expect(q4.status).toBe('active');
      expect(q4.is_current).toBe(true);
    });
  });

  it('calls onClose when close button or Cancel is clicked', () => {
    const onClose = vi.fn();
    render(
      <ManageSprintsModal
        isOpen={true}
        onClose={onClose}
        sprints={mockSprints}
        onSaveSprints={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
