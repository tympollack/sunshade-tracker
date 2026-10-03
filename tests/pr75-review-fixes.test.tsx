import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act, waitFor } from '@testing-library/react';
import { useWorkItemSelection } from '@/hooks/useWorkItemSelection';
import { WorkItemInspectorDrawer } from '@/components/drawer/WorkItemInspectorDrawer';
import { NavTreeNode } from '@/components/navigation/NavTreeNode';
import { SprintRelationalService, validateSprintInput } from '@/lib/services/sprintRelationalService';
import { supabaseAdmin } from '@/lib/db';
import { WorkItem } from '@/types/tracker';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

const mockItems: WorkItem[] = [
  {
    id: 'item-1',
    external_ref_id: 'TRK-101',
    title: 'Item 101',
    status: 'in_progress',
    assignee: 'Tymz',
    item_type: 'task',
    project_id: 'proj-1',
    tenant_id: 'tenant-1',
    order_index: 0,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

describe('PR-75 Review Comments Verification Suite', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState(null, '', 'http://localhost:3000/pym-energy/board');
  });

  describe('Comment 6 & 7: useWorkItemSelection Deep Links & Refresh Resilience', () => {
    it('Comment 6: fetches out-of-project item via bulk API when missing from current items list', async () => {
      window.history.replaceState(null, '', 'http://localhost:3000/pym-energy/board?item=OUT-OF-PROJECT-99');

      const outOfProjectItem: WorkItem = {
        id: 'item-99',
        external_ref_id: 'OUT-OF-PROJECT-99',
        title: 'Deep Linked Foreign Item',
        status: 'open',
        item_type: 'task',
        project_id: 'proj-other',
        tenant_id: 'tenant-1',
        order_index: 0,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [outOfProjectItem] }),
      });

      const { result } = renderHook(() =>
        useWorkItemSelection({
          items: mockItems,
          tenantSlug: 'pym-energy',
        })
      );

      await waitFor(() => {
        expect(result.current.selectedItem?.id).toBe('item-99');
        expect(result.current.isOpen).toBe(true);
      });

      global.fetch = originalFetch;
    });

    it('Comment 7: closing deep-linked drawer removes ?item and does NOT reopen on subsequent items rerenders', () => {
      window.history.replaceState(null, '', 'http://localhost:3000/pym-energy/board?item=TRK-101');

      let currentItems = [...mockItems];
      const { result, rerender } = renderHook(
        ({ items }) =>
          useWorkItemSelection({
            items,
            initialItemRef: 'TRK-101',
            tenantSlug: 'pym-energy',
          }),
        { initialProps: { items: currentItems } }
      );

      expect(result.current.selectedItem?.id).toBe('item-1');
      expect(result.current.isOpen).toBe(true);

      // Close the drawer
      act(() => {
        result.current.close();
      });

      expect(result.current.isOpen).toBe(false);
      expect(result.current.selectedItem).toBeNull();
      expect(window.location.search).not.toContain('item=TRK-101');

      // Trigger re-render with updated items list (e.g. background polling)
      currentItems = [...mockItems, { ...mockItems[0], id: 'item-2', external_ref_id: 'TRK-102' }];
      rerender({ items: currentItems });

      // The drawer MUST remain closed
      expect(result.current.isOpen).toBe(false);
      expect(result.current.selectedItem).toBeNull();
      expect(window.location.search).not.toContain('item=TRK-101');
    });

    it('Comment 8 (PR 76): late deep-link lookup does not override selection or reopen closed drawer when URL is cleared', async () => {
      window.history.replaceState(null, '', 'http://localhost:3000/pym-energy/board?item=PENDING-ITEM');

      let resolveFetch: (data: any) => void = () => {};
      const pendingFetch = new Promise((resolve) => {
        resolveFetch = resolve;
      });

      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockReturnValue(pendingFetch);

      const { result } = renderHook(() =>
        useWorkItemSelection({
          items: mockItems,
          tenantSlug: 'pym-energy',
        })
      );

      // User immediately closes or navigates before fetch resolves
      act(() => {
        result.current.close();
      });

      expect(result.current.selectedItem).toBeNull();
      expect(result.current.isOpen).toBe(false);

      // Now the pending fetch resolves with an item
      const fetchedItem: WorkItem = {
        ...mockItems[0],
        id: 'item-delayed',
        external_ref_id: 'PENDING-ITEM',
      };

      await act(async () => {
        resolveFetch({
          ok: true,
          json: async () => ({ items: [fetchedItem] }),
        });
      });

      // The selection MUST remain null because user closed the drawer
      expect(result.current.selectedItem).toBeNull();
      expect(result.current.isOpen).toBe(false);

      global.fetch = originalFetch;
    });
  });

  describe('Comment 8: WorkItemInspectorDrawer Assignee Normalization', () => {
    it('normalizes "Tymz (You)" to canonical "Tymz" and renders normalized option values', () => {
      const onUpdate = vi.fn();
      render(
        <WorkItemInspectorDrawer
          item={{ ...mockItems[0], assignee: 'Tymz' }}
          isOpen={true}
          onClose={vi.fn()}
          onUpdateItem={onUpdate}
          availableAssignees={['Tymz (You)', 'Alice']}
          tenantSlug="pym-energy"
        />
      );

      const assigneeSelect = screen.getByLabelText('Assignee') as HTMLSelectElement;
      // Option for Tymz (You) must have canonical value 'Tymz'
      const tymzOption = screen.getByRole('option', { name: 'Tymz (You)' }) as HTMLOptionElement;
      expect(tymzOption.value).toBe('Tymz');

      // Changing select to Alice
      fireEvent.change(assigneeSelect, { target: { value: 'Alice' } });
      expect(onUpdate).toHaveBeenCalledWith('item-1', { assignee: 'Alice' });

      // Changing back to Tymz
      fireEvent.change(assigneeSelect, { target: { value: 'Tymz' } });
      expect(onUpdate).toHaveBeenCalledWith('item-1', { assignee: 'Tymz' });
    });
  });

  describe('Comment 1, 13: NavTreeNode Scope & Backlog Bucket Settings Guard', () => {
    it('Comment 1: passes projectId in onSelectScope when project node is clicked', () => {
      const onSelectScope = vi.fn();
      render(
        <NavTreeNode
          node={{
            id: 'proj:alpha',
            title: 'Alpha Project',
            type: 'project',
            projectId: 'proj-alpha-id',
            depth: 0,
            children: [],
            childCount: 0,
            rollupPoints: 0,
          }}
          isExpanded={false}
          onToggle={vi.fn()}
          expandedNodes={new Set()}
          onSelectScope={onSelectScope}
        />
      );

      fireEvent.click(screen.getByText('Alpha Project'));
      expect(onSelectScope).toHaveBeenCalledWith(
        expect.objectContaining({
          projectId: 'proj-alpha-id',
        })
      );
    });

    it('Comment 13: does NOT render sprint settings trigger button for unassigned backlog bucket', () => {
      const onSelectSprint = vi.fn();
      render(
        <NavTreeNode
          node={{
            id: 'sprint:unassigned',
            title: 'No Sprint',
            type: 'sprint',
            sprintName: 'No Sprint',
            depth: 0,
            children: [],
            childCount: 0,
            rollupPoints: 0,
          }}
          isExpanded={false}
          onToggle={vi.fn()}
          expandedNodes={new Set()}
          onSelectScope={vi.fn()}
          onSelectSprint={onSelectSprint}
        />
      );

      // Settings trigger button should not be present
      expect(screen.queryByTitle(/Sprint Settings/i)).not.toBeInTheDocument();
    });
  });

  describe('Comment 15, 16, 17, 4, 11: SprintRelationalService Security & Integrity', () => {
    it('Comment 17: validateSprintInput validates status enum, dates, points, and non-empty name', () => {
      expect(validateSprintInput({ name: 'Valid Sprint' })).toBeNull();
      expect(validateSprintInput({ name: '   ' })).not.toBeNull();
      expect(validateSprintInput({ status: 'invalid_status' as any })).not.toBeNull();
      expect(validateSprintInput({ committed_points: -5 })).not.toBeNull();
      expect(validateSprintInput({ started_at: 'invalid-date' })).not.toBeNull();
    });

    it('Comment 15: updateSprint rejects renaming a completed sprint to prevent bypassing completed-item lock', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: { id: 'sp-completed', status: 'completed', name: 'Sprint Done', project_id: 'p1' },
        error: null,
      });
      const mockSelectById = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: mockMaybeSingle,
          }),
        }),
      });

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'sprints') {
          return {
            select: mockSelectById,
          };
        }
        return {};
      });

      const res = await SprintRelationalService.updateSprint('tenant-1', 'sp-completed', {
        name: 'Sprint Done Renamed',
      });

      expect(res.error).toContain('Cannot rename a completed sprint');
    });

    it('Comment 16: deleteSprint rejects deleting a completed sprint to prevent unlocking protected items', async () => {
      const mockMaybeSingle = vi.fn().mockResolvedValue({
        data: { id: 'sp-completed', status: 'completed', name: 'Sprint Done', project_id: 'p1' },
        error: null,
      });
      const mockSelectById = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: mockMaybeSingle,
          }),
        }),
      });

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'sprints') {
          return {
            select: mockSelectById,
          };
        }
        return {};
      });

      const res = await SprintRelationalService.deleteSprint('tenant-1', 'sp-completed');

      expect(res.error).toContain('Cannot delete a completed sprint');
    });

    it('Comment 4: updateSprint queries original project items when moving and renaming sprint', async () => {
      const mockCurrentSprint = {
        id: 'sp-1',
        name: 'Sprint Alpha',
        project_id: 'proj-source',
        status: 'active',
      };

      const mockSelectById = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockCurrentSprint, error: null }),
          }),
        }),
      });

      const mockSingleUpdate = vi.fn().mockResolvedValue({
        data: { ...mockCurrentSprint, name: 'Sprint Beta', project_id: 'proj-dest' },
        error: null,
      });
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: mockSingleUpdate,
            }),
          }),
        }),
      });

      // Target project verification mock
      const mockProjectCheck = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'proj-dest' }, error: null }),
          }),
        }),
      });

      // Work items query mock
      const mockWorkItemsEqProject = vi.fn().mockResolvedValue({
        data: [{ id: 'item-1', metadata: { sprint: 'Sprint Alpha' } }],
        error: null,
      });
      const mockWorkItemsIs = vi.fn().mockReturnValue({
        eq: mockWorkItemsEqProject,
      });
      const mockWorkItemsEqTenant = vi.fn().mockReturnValue({
        is: mockWorkItemsIs,
      });
      const mockWorkItemsSelect = vi.fn().mockReturnValue({
        eq: mockWorkItemsEqTenant,
      });

      const mockWorkItemUpdateEq = vi.fn().mockResolvedValue({ error: null });
      const mockWorkItemUpdate = vi.fn().mockReturnValue({ eq: mockWorkItemUpdateEq });

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'sprints') {
          return {
            select: mockSelectById,
            update: mockUpdate,
          };
        }
        if (table === 'projects') {
          return {
            select: mockProjectCheck,
          };
        }
        if (table === 'work_items') {
          return {
            select: mockWorkItemsSelect,
            update: mockWorkItemUpdate,
          };
        }
        return {};
      });

      const res = await SprintRelationalService.updateSprint('tenant-1', 'sp-1', {
        name: 'Sprint Beta',
        project_id: 'proj-dest',
      });

      expect(res.error).toBeNull();
      // Should query tracker.work_items for the source project 'proj-source'
      expect(mockWorkItemsIs().eq).toHaveBeenCalledWith('project_id', 'proj-source');
    });

    it('Comment 11: deleteSprint returns an error if work-item disassociation fails', async () => {
      const mockCurrentSprint = {
        id: 'sp-1',
        name: 'Sprint To Delete',
        project_id: 'proj-1',
        status: 'active',
      };

      const mockSelectById = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockCurrentSprint, error: null }),
          }),
        }),
      });

      const mockWorkItemsEqProject = vi.fn().mockResolvedValue({
        data: [{ id: 'item-1', metadata: { sprint: 'Sprint To Delete' } }],
        error: null,
      });
      const mockWorkItemsIs = vi.fn().mockReturnValue({
        eq: mockWorkItemsEqProject,
      });
      const mockWorkItemsEqTenant = vi.fn().mockReturnValue({
        is: mockWorkItemsIs,
      });
      const mockWorkItemsSelect = vi.fn().mockReturnValue({
        eq: mockWorkItemsEqTenant,
      });

      const mockWorkItemUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          error: { message: 'Database connection dropped' },
        }),
      });

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'sprints') {
          return {
            select: mockSelectById,
          };
        }
        if (table === 'work_items') {
          return {
            select: mockWorkItemsSelect,
            update: mockWorkItemUpdate,
          };
        }
        return {};
      });

      const res = await SprintRelationalService.deleteSprint('tenant-1', 'sp-1');

      expect(res.error).toContain('Failed to disassociate sprint from item item-1');
    });

    it('Comment 3 (PR 76): project-only sprint move updates work items project_id without rename', async () => {
      const mockCurrentSprint = {
        id: 'sp-move-only',
        name: 'Sprint Stationary Name',
        project_id: 'proj-old',
        status: 'active',
      };

      const mockSelectById = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockCurrentSprint, error: null }),
          }),
        }),
      });

      const mockSingleUpdate = vi.fn().mockResolvedValue({
        data: { ...mockCurrentSprint, project_id: 'proj-new' },
        error: null,
      });
      const mockUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            select: vi.fn().mockReturnValue({
              single: mockSingleUpdate,
            }),
          }),
        }),
      });

      const mockProjectCheck = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: { id: 'proj-new' }, error: null }),
          }),
        }),
      });

      const mockWorkItemsEqProject = vi.fn().mockResolvedValue({
        data: [{ id: 'item-10', project_id: 'proj-old', metadata: { sprint: 'Sprint Stationary Name' } }],
        error: null,
      });
      const mockWorkItemsIs = vi.fn().mockReturnValue({
        eq: mockWorkItemsEqProject,
      });
      const mockWorkItemsEqTenant = vi.fn().mockReturnValue({
        is: mockWorkItemsIs,
      });
      const mockWorkItemsSelect = vi.fn().mockReturnValue({
        eq: mockWorkItemsEqTenant,
      });

      const mockWorkItemUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'sprints') {
          return { select: mockSelectById, update: mockUpdate };
        }
        if (table === 'projects') {
          return { select: mockProjectCheck };
        }
        if (table === 'work_items') {
          return { select: mockWorkItemsSelect, update: mockWorkItemUpdate };
        }
        return {};
      });

      const res = await SprintRelationalService.updateSprint('tenant-1', 'sp-move-only', {
        project_id: 'proj-new',
      });

      expect(res.error).toBeNull();
      // Verifies work_items was updated with new project_id
      expect(mockWorkItemUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ project_id: 'proj-new' })
      );
    });

    it('Comment 7 (PR 76): deleteSprint rolls back detached items if sprint deletion fails', async () => {
      const mockCurrentSprint = {
        id: 'sp-fail-delete',
        name: 'Sprint Rollback',
        project_id: 'proj-1',
        status: 'active',
      };

      const mockSelectById = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: mockCurrentSprint, error: null }),
          }),
        }),
      });

      const mockWorkItemsEqProject = vi.fn().mockResolvedValue({
        data: [{ id: 'item-rollback-1', metadata: { sprint: 'Sprint Rollback' } }],
        error: null,
      });
      const mockWorkItemsIs = vi.fn().mockReturnValue({
        eq: mockWorkItemsEqProject,
      });
      const mockWorkItemsEqTenant = vi.fn().mockReturnValue({
        is: mockWorkItemsIs,
      });
      const mockWorkItemsSelect = vi.fn().mockReturnValue({
        eq: mockWorkItemsEqTenant,
      });

      const mockWorkItemUpdate = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ error: null }),
      });

      const mockSprintDelete = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ error: { message: 'Foreign key constraint violation' } }),
        }),
      });

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'sprints') {
          return { select: mockSelectById, delete: mockSprintDelete };
        }
        if (table === 'work_items') {
          return { select: mockWorkItemsSelect, update: mockWorkItemUpdate };
        }
        return {};
      });

      const res = await SprintRelationalService.deleteSprint('tenant-1', 'sp-fail-delete');

      expect(res.error).toContain('Foreign key constraint violation');
      // Verifies rollback was triggered to restore original metadata
      expect(mockWorkItemUpdate).toHaveBeenCalledWith({
        metadata: { sprint: 'Sprint Rollback' },
      });
    });
  });
});
