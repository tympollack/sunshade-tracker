import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { WorkItemInspectorDrawer } from '@/components/drawer/WorkItemInspectorDrawer';
import { WorkItemModal } from '@/components/WorkItemModal';
import { reconcileSprintMetadata } from '@/lib/bulk-items';
import { WorkItem, ProjectSettings } from '@/types/tracker';

describe('PR 162 Review Fixes: Real Component & Hook Handlers', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', 'http://localhost:3000/pym-energy/board');
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  const sampleSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [
      { type: 'epic', label: 'Epic', level: 1, allowed_parents: [] },
      { type: 'task', label: 'Task', level: 2, allowed_parents: ['epic'] },
    ],
    statuses: [
      { id: 'backlog', label: 'Backlog', color: '#94a3b8', order: 1 },
      { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      { id: 'done', label: 'Done', color: '#22c55e', order: 3 },
    ],
    custom_fields: ['priority', 'custom_tag'],
  };

  describe('1. WorkItemInspectorDrawer production backlog clearing and delta isolation', () => {
    it('executes real handleSprintChange, sending sprint: null and sprint_id: null without reviving sprint on subsequent delta edits', async () => {
      const initialItem: WorkItem = {
        id: 'item-101',
        tenant_id: 'pym-energy',
        project_id: 'p-1',
        external_ref_id: 'TASK-101',
        item_type: 'task',
        status: 'in_progress',
        title: 'Task in Sprint',
        description: 'Detailed description',
        order_index: 1000,
        metadata: {
          sprint: 'Sprint 12',
          sprint_id: 'sprint-uuid-12',
          priority: 'P1',
        },
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      };

      const onUpdateItem = vi.fn().mockResolvedValue(undefined);

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          item: {
            ...initialItem,
            metadata: {
              ...initialItem.metadata,
              agent_prompt: 'Hydrated instructions',
            },
          },
        }),
      });

      const { rerender } = render(
        <WorkItemInspectorDrawer
          item={initialItem}
          isOpen={true}
          onClose={vi.fn()}
          onUpdateItem={onUpdateItem}
          tenantSlug="pym-energy"
          availableSprints={['Sprint 12', 'Sprint 13']}
          availableStatuses={sampleSettings.statuses}
        />
      );

      // Verify sprint is initially set to Sprint 12
      const sprintSelect = screen.getByLabelText('Sprint');
      expect(sprintSelect).toHaveValue('Sprint 12');

      // 1. Move to Backlog via Sprint dropdown
      await act(async () => {
        fireEvent.change(sprintSelect, { target: { value: '' } });
      });

      // Verify that onUpdateItem was called with explicit clearing markers for both relational column and metadata
      expect(onUpdateItem).toHaveBeenCalledWith(
        'item-101',
        expect.objectContaining({
          sprint_id: null,
          metadata: expect.objectContaining({
            sprint: null,
          }),
        })
      );

      // 2. Delta polling arrives with thin card projection: sprint was cleared on server, agent_prompt omitted
      const deltaThinItem: WorkItem = {
        ...initialItem,
        description: undefined,
        metadata: {
          priority: 'P1',
        },
      };

      await act(async () => {
        rerender(
          <WorkItemInspectorDrawer
            item={deltaThinItem}
            isOpen={true}
            onClose={vi.fn()}
            onUpdateItem={onUpdateItem}
            tenantSlug="pym-energy"
            availableSprints={['Sprint 12', 'Sprint 13']}
            availableStatuses={sampleSettings.statuses}
          />
        );
      });

      // Assert that sprint select remains unassigned (empty/backlog)
      expect(sprintSelect).toHaveValue('');

      // 3. Edit another field (status to done)
      onUpdateItem.mockClear();
      const statusSelect = screen.getByLabelText('Status');
      await act(async () => {
        fireEvent.change(statusSelect, { target: { value: 'done' } });
      });

      // Verify that the subsequent edit does NOT revive the old sprint in metadata!
      expect(onUpdateItem).toHaveBeenCalledWith(
        'item-101',
        expect.objectContaining({
          status: 'done',
        })
      );
      const lastCallArgs = onUpdateItem.mock.calls[0][1];
      if (lastCallArgs.metadata) {
        expect(lastCallArgs.metadata.sprint).toBeUndefined();
        expect(lastCallArgs.metadata.sprint_id).toBeUndefined();
      }
    });

    it('guards against cross-item cache corruption when Item A save finishes after Item B hydrates', async () => {
      const itemA: WorkItem = {
        id: 'item-A',
        tenant_id: 'pym-energy',
        project_id: 'p-1',
        external_ref_id: 'TASK-A',
        item_type: 'task',
        status: 'in_progress',
        title: 'Item A Title',
        description: 'Item A Description',
        order_index: 1000,
        metadata: { priority: 'P1', agent_prompt: 'Prompt A' },
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      };

      const itemB: WorkItem = {
        id: 'item-B',
        tenant_id: 'pym-energy',
        project_id: 'p-1',
        external_ref_id: 'TASK-B',
        item_type: 'task',
        status: 'in_progress',
        title: 'Item B Title',
        description: 'Item B Description',
        order_index: 2000,
        metadata: { priority: 'P2', agent_prompt: 'Prompt B' },
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      };

      let resolveSaveA: () => void = () => {};
      const pendingSavePromiseA = new Promise<void>((resolve) => {
        resolveSaveA = resolve;
      });

      const onUpdateItem = vi.fn().mockImplementation((id: string) => {
        if (id === 'item-A') return pendingSavePromiseA;
        return Promise.resolve();
      });

      global.fetch = vi.fn().mockImplementation((url: string) => {
        if (url.includes('item-A')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ item: itemA }),
          });
        }
        if (url.includes('item-B')) {
          return Promise.resolve({
            ok: true,
            json: async () => ({ item: itemB }),
          });
        }
        return Promise.resolve({ ok: false });
      });

      // 1. Mount drawer with Item A
      const { rerender } = render(
        <WorkItemInspectorDrawer
          item={itemA}
          isOpen={true}
          onClose={vi.fn()}
          onUpdateItem={onUpdateItem}
          tenantSlug="pym-energy"
          availableStatuses={sampleSettings.statuses}
        />
      );

      expect(screen.getByDisplayValue('Item A Title')).toBeInTheDocument();

      // 2. Trigger metadata edit on Item A which triggers deferred save containing Prompt A
      const pointsInput = screen.getByLabelText('Story Points');
      await act(async () => {
        fireEvent.change(pointsInput, { target: { value: '8' } });
        fireEvent.blur(pointsInput);
      });

      // Verify onUpdateItem was called for item-A with metadata containing Prompt A
      expect(onUpdateItem).toHaveBeenCalledWith(
        'item-A',
        expect.objectContaining({
          metadata: expect.objectContaining({
            story_points: 8,
            agent_prompt: 'Prompt A',
          }),
        })
      );

      // 3. User switches to Item B before Item A save finishes
      await act(async () => {
        rerender(
          <WorkItemInspectorDrawer
            item={itemB}
            isOpen={true}
            onClose={vi.fn()}
            onUpdateItem={onUpdateItem}
            tenantSlug="pym-energy"
            availableStatuses={sampleSettings.statuses}
          />
        );
      });

      expect(screen.getByDisplayValue('Item B Title')).toBeInTheDocument();

      // 4. Now Item A's deferred save resolves
      await act(async () => {
        resolveSaveA();
      });

      // 5. Delta thin refresh arrives for Item B (omits agent_prompt)
      const thinItemB: WorkItem = {
        ...itemB,
        description: undefined,
        metadata: { priority: 'P2' },
      };

      await act(async () => {
        rerender(
          <WorkItemInspectorDrawer
            item={thinItemB}
            isOpen={true}
            onClose={vi.fn()}
            onUpdateItem={onUpdateItem}
            tenantSlug="pym-energy"
            availableStatuses={sampleSettings.statuses}
          />
        );
      });

      // 6. Now edit a metadata field on Item B (e.g. story points to 3)
      onUpdateItem.mockClear();
      const pointsInputB = screen.getByLabelText('Story Points');
      await act(async () => {
        fireEvent.change(pointsInputB, { target: { value: '3' } });
        fireEvent.blur(pointsInputB);
      });

      // Item B must retain its own updates with Prompt B, NEVER Item A's Prompt A!
      expect(onUpdateItem).toHaveBeenCalledWith(
        'item-B',
        expect.objectContaining({
          metadata: expect.objectContaining({
            story_points: 3,
            agent_prompt: 'Prompt B',
          }),
        })
      );
      const callArgsB = onUpdateItem.mock.calls[0][1];
      expect(callArgsB.metadata.agent_prompt).toBe('Prompt B');
      expect(callArgsB.metadata.agent_prompt).not.toBe('Prompt A');
    });
  });

  describe('2. WorkItemModal & useWorkItemForm production metadata deletion & prompt nullification', () => {
    it('executes real modal custom field removal, nullifying agent_prompt while deleting non-prompt custom fields', async () => {
      const itemWithPromptAndCustom: WorkItem = {
        id: 'item-201',
        tenant_id: 'pym-energy',
        project_id: 'p-1',
        title: 'Form Item Test',
        description: 'Item description for form test',
        item_type: 'task',
        status: 'in_progress',
        order_index: 1000,
        metadata: {
          priority: 'P1',
          agent_prompt: 'System prompt instructions',
          custom_tag: 'legacy-tag',
        },
        created_at: '2026-10-01T00:00:00Z',
        updated_at: '2026-10-01T00:00:00Z',
      };

      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ item: itemWithPromptAndCustom }),
      });

      const onSave = vi.fn().mockResolvedValue(undefined);
      const onClose = vi.fn();

      await act(async () => {
        render(
          <WorkItemModal
            item={itemWithPromptAndCustom}
            isOpen={true}
            projectSettings={sampleSettings}
            allItems={[itemWithPromptAndCustom]}
            tenantSlug="pym-energy"
            onSave={onSave}
            onClose={onClose}
            onDelete={vi.fn()}
          />
        );
      });

      // Verify fields are rendered
      expect(screen.getByDisplayValue('System prompt instructions')).toBeInTheDocument();
      expect(screen.getByDisplayValue('legacy-tag')).toBeInTheDocument();

      // Remove agent_prompt via production remove button
      const removePromptBtn = screen.getAllByTitle('Remove agent_prompt')[0];
      await act(async () => {
        fireEvent.click(removePromptBtn);
      });

      // Remove custom_tag via production remove button
      const removeTagBtn = screen.getAllByTitle('Remove custom_tag')[0];
      await act(async () => {
        fireEvent.click(removeTagBtn);
      });

      // Click Save Changes button
      const saveBtn = screen.getByText('Save Changes');
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      // Assert onSave was called
      expect(onSave).toHaveBeenCalledTimes(1);
      const savedUpdates = onSave.mock.calls[0][1];
      expect(savedUpdates.metadata).toBeDefined();

      // agent_prompt is explicitly null so reconcileSprintMetadata will not restore it
      expect(savedUpdates.metadata.agent_prompt).toBeNull();

      // custom_tag is deleted, NOT null
      expect('custom_tag' in savedUpdates.metadata).toBe(false);

      // Verify reconcileSprintMetadata behavior when consuming this saved payload
      const reconciled = reconcileSprintMetadata(
        itemWithPromptAndCustom.metadata,
        savedUpdates.metadata,
        sampleSettings,
        { fullReplacement: true }
      );

      expect(reconciled.agent_prompt).toBeNull();
      expect('custom_tag' in reconciled).toBe(false);
      expect(reconciled.priority).toBe('P1');
    });
  });
});
