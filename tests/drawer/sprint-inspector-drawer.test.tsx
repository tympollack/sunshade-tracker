import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { SprintInspectorDrawer } from '@/components/drawer/SprintInspectorDrawer';
import { LeftHandNavTree } from '@/components/navigation/LeftHandNavTree';
import { SprintDefinition } from '@/types/tracker';

const mockSprints: SprintDefinition[] = [
  {
    id: 'sprint-1',
    name: 'Sprint 2026-Q4',
    goal: 'Ship Three-Pane Architecture',
    status: 'active',
    is_active: true,
    start_date: '2026-10-01',
    end_date: '2026-10-15',
    committed_points: 21,
  },
];

describe('TASK-TRK-LHN-SPRINT-LIFECYCLE-INTEGRATION: Sprint Inspector & LHN Cadence Integration', () => {
  describe('SprintInspectorDrawer', () => {
    it('renders editable fields for sprint lifecycle configuration', () => {
      const onSave = vi.fn();
      const onClose = vi.fn();

      render(
        <SprintInspectorDrawer
          sprint={mockSprints[0]}
          isOpen={true}
          onClose={onClose}
          onSave={onSave}
          tenantSlug="pym-energy"
        />
      );

      expect(screen.getByDisplayValue('Sprint 2026-Q4')).toBeInTheDocument();
      expect(screen.getByDisplayValue('Ship Three-Pane Architecture')).toBeInTheDocument();
      expect(screen.getByLabelText('Sprint Status')).toHaveValue('active');
      expect(screen.getByLabelText('Committed Story Points')).toHaveValue(21);
      expect(screen.getByLabelText('Sprint Start Date')).toHaveValue('2026-10-01');
      expect(screen.getByLabelText('Sprint End Date')).toHaveValue('2026-10-15');
    });

    it('submits updated sprint lifecycle configuration on save', async () => {
      const onSave = vi.fn();
      render(
        <SprintInspectorDrawer
          sprint={mockSprints[0]}
          isOpen={true}
          onClose={vi.fn()}
          onSave={onSave}
          tenantSlug="pym-energy"
        />
      );

      const goalInput = screen.getByLabelText('Sprint Goal');
      fireEvent.change(goalInput, { target: { value: 'Updated Goal' } });

      const saveBtn = screen.getByRole('button', { name: /save changes/i });
      fireEvent.click(saveBtn);

      expect(onSave).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Sprint 2026-Q4',
          goal: 'Updated Goal',
        })
      );
    });
  });

  describe('LHN Sprint Lifecycle Integration', () => {
    it('renders inline "+ Sprint" button in Cadence mode header', () => {
      const onNewSprint = vi.fn();
      render(
        <LeftHandNavTree
          items={[]}
          projects={[{ id: 'p-1', slug: 'cozy', name: 'Cozy' }]}
          sprints={mockSprints}
          tenantSlug="pym-energy"
          onNewSprint={onNewSprint}
        />
      );

      const newSprintBtn = screen.getByTestId('lhn-new-sprint-btn');
      expect(newSprintBtn).toBeInTheDocument();
      fireEvent.click(newSprintBtn);
      expect(onNewSprint).toHaveBeenCalledTimes(1);
    });

    it('triggers onSelectSprint when sprint settings icon is clicked', () => {
      const onSelectSprint = vi.fn();
      render(
        <LeftHandNavTree
          items={[]}
          projects={[{ id: 'p-1', slug: 'cozy', name: 'Cozy' }]}
          sprints={mockSprints}
          tenantSlug="pym-energy"
          onSelectSprint={onSelectSprint}
        />
      );

      const sprintSettingsBtn = screen.getByLabelText('Sprint Settings');
      expect(sprintSettingsBtn).toBeInTheDocument();
      fireEvent.click(sprintSettingsBtn);
      expect(onSelectSprint).toHaveBeenCalledWith('Sprint 2026-Q4');
    });
  });
});
