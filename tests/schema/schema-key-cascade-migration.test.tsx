import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ProjectSchemaView } from '@/components/schema/ProjectSchemaView';
import { SchemaKeyCascadeModal } from '@/components/schema/SchemaKeyCascadeModal';
import { ProjectSettings, WorkItem } from '@/types/tracker';

describe('FEAT-TRK-SCHEMA-KEY-CASCADE-MIGRATION', () => {
  const originalSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [
      { type: 'epic', label: 'Epic', level: 1, allowed_parents: [] },
      { type: 'story', label: 'Story', level: 2, allowed_parents: ['epic'] },
      { type: 'task', label: 'Task', level: 3, allowed_parents: ['story'] },
    ],
    statuses: [
      { id: 'backlog', label: 'Backlog', color: '#94a3b8', order: 1 },
      { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      { id: 'done', label: 'Done', color: '#22c55e', order: 3, is_completed: true },
    ],
    custom_fields: ['priority'],
  };

  const sampleItems: WorkItem[] = [
    {
      id: 'item-1',
      tenant_id: 'tenant-1',
      project_id: 'proj-1',
      title: 'Item in backlog',
      item_type: 'task',
      status: 'backlog',
      order_index: 1000,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'item-2',
      tenant_id: 'tenant-1',
      project_id: 'proj-1',
      title: 'Another backlog item',
      item_type: 'story',
      status: 'backlog',
      order_index: 2000,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
    {
      id: 'item-3',
      tenant_id: 'tenant-1',
      project_id: 'proj-1',
      title: 'Active in progress item',
      item_type: 'task',
      status: 'in_progress',
      order_index: 3000,
      metadata: {},
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('SchemaKeyCascadeModal Unit', () => {
    it('renders removed status and hierarchy levels with affected counts and remap dropdowns', () => {
      const handleConfirm = vi.fn();
      const handleClose = vi.fn();

      const newSettings: ProjectSettings = {
        ...originalSettings,
        statuses: [
          { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 1 },
          { id: 'done', label: 'Done', color: '#22c55e', order: 2, is_completed: true },
        ],
      };

      render(
        <SchemaKeyCascadeModal
          isOpen={true}
          onClose={handleClose}
          orphanStatuses={[
            {
              oldStatus: { id: 'backlog', label: 'Backlog', color: '#94a3b8', order: 1 },
              items: [sampleItems[0], sampleItems[1]],
            },
          ]}
          orphanHierarchies={[]}
          newSettings={newSettings}
          onConfirmCascade={handleConfirm}
        />
      );

      expect(screen.getByText('Schema Key Cascade Migration')).toBeDefined();
      expect(screen.getByText('2 records require remapping to new schema keys')).toBeDefined();
      expect(screen.getByText('2 items affected')).toBeDefined();

      const select = screen.getByTestId('remap-status-backlog') as HTMLSelectElement;
      expect(select).toBeDefined();

      // Options should be In Progress and Done
      const options = Array.from(select.options).map((o) => o.value);
      expect(options).toEqual(['in_progress', 'done']);

      // Change selection to done
      fireEvent.change(select, { target: { value: 'done' } });
      expect(select.value).toBe('done');

      // Click Confirm
      const confirmBtn = screen.getByTestId('confirm-cascade-migration-button');
      fireEvent.click(confirmBtn);

      expect(handleConfirm).toHaveBeenCalledWith({
        statusRemaps: { backlog: 'done' },
        hierarchyRemaps: {},
      });
    });
  });

  describe('ProjectSchemaView Integration', () => {
    it('directly saves schema without cascade modal when no active items use removed keys', async () => {
      const handleSave = vi.fn().mockResolvedValue(undefined);

      // Schema removing 'done' (which none of our sampleItems have)
      const updatedSettingsWithoutDone: ProjectSettings = {
        ...originalSettings,
        statuses: [
          { id: 'backlog', label: 'Backlog', color: '#94a3b8', order: 1 },
          { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
        ],
      };

      render(
        <ProjectSchemaView
          projectId="proj-1"
          settings={originalSettings}
          onSave={handleSave}
          activeItems={[sampleItems[0], sampleItems[1]]} // both are backlog
          initialMode="raw"
        />
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      await act(async () => {
        fireEvent.change(textarea, {
          target: { value: JSON.stringify(updatedSettingsWithoutDone, null, 2) },
        });
      });

      const saveBtn = screen.getByText('Save Schema');
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      // Directly saves without opening cascade modal
      expect(handleSave).toHaveBeenCalledTimes(1);
      expect(screen.queryByTestId('confirm-cascade-migration-button')).toBeNull();
    });

    it('intercepts save when active items use removed status, prompts remap, executes bulk migration, and persists schema', async () => {
      const handleSave = vi.fn().mockResolvedValue(undefined);
      const handleMigrate = vi.fn().mockResolvedValue(undefined);

      // Remove 'backlog' from schema (sampleItems[0] and sampleItems[1] have status: 'backlog')
      const newSettingsWithoutBacklog: ProjectSettings = {
        ...originalSettings,
        statuses: [
          { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 1 },
          { id: 'done', label: 'Done', color: '#22c55e', order: 2, is_completed: true },
        ],
      };

      render(
        <ProjectSchemaView
          projectId="proj-1"
          settings={originalSettings}
          onSave={handleSave}
          activeItems={[sampleItems[0], sampleItems[1], sampleItems[2]]}
          onMigrateItems={handleMigrate}
          initialMode="raw"
        />
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      await act(async () => {
        fireEvent.change(textarea, {
          target: { value: JSON.stringify(newSettingsWithoutBacklog, null, 2) },
        });
      });

      const saveBtn = screen.getByText('Save Schema');
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      // Save was intercepted! Modal is open!
      expect(handleSave).not.toHaveBeenCalled();
      expect(screen.getByTestId('confirm-cascade-migration-button')).toBeDefined();

      // Remap status backlog -> in_progress
      const remapSelect = screen.getByTestId('remap-status-backlog');
      await act(async () => {
        fireEvent.change(remapSelect, { target: { value: 'in_progress' } });
      });

      // Confirm cascade migration
      const confirmBtn = screen.getByTestId('confirm-cascade-migration-button');
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      // 1. Bulk item migration executed on item-1 and item-2
      expect(handleMigrate).toHaveBeenCalledWith([
        {
          ids: ['item-1', 'item-2'],
          updates: { status: 'in_progress' },
        },
      ]);

      // 2. Schema settings saved
      expect(handleSave).toHaveBeenCalledTimes(1);
      expect(handleSave).toHaveBeenCalledWith(newSettingsWithoutBacklog);

      // 3. Modal closed
      expect(screen.queryByTestId('confirm-cascade-migration-button')).toBeNull();
    });

    it('includes x-tenant-slug header in bulk migration requests when tenantSlug is provided', async () => {
      const handleSave = vi.fn().mockResolvedValue(undefined);
      const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
        Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true }),
        } as any)
      );

      const newSettingsWithoutBacklog: ProjectSettings = {
        ...originalSettings,
        statuses: [
          { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 1 },
          { id: 'done', label: 'Done', color: '#22c55e', order: 2, is_completed: true },
        ],
      };

      const freshItems: WorkItem[] = [
        {
          id: 'item-tenant-1',
          tenant_id: 'tenant-1',
          project_id: 'proj-1',
          title: 'Item in backlog',
          item_type: 'task',
          status: 'backlog',
          order_index: 1000,
          metadata: {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      render(
        <ProjectSchemaView
          projectId="proj-1"
          tenantSlug="acme-corp"
          settings={originalSettings}
          onSave={handleSave}
          activeItems={freshItems}
          initialMode="raw"
        />
      );

      const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
      await act(async () => {
        fireEvent.change(textarea, {
          target: { value: JSON.stringify(newSettingsWithoutBacklog, null, 2) },
        });
      });

      const saveBtn = screen.getByText('Save Schema');
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      const confirmBtn = screen.getByTestId('confirm-cascade-migration-button');
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/v1/items/bulk',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
            'x-tenant-slug': 'acme-corp',
          }),
        })
      );
    });
  });
});
