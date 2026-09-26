import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { useTabSync } from '@/hooks/useTabSync';
import * as syncChannelModule from '@/lib/sync-channel';
import { broadcastItemMutation } from '@/lib/sync-channel';
import { saveModalItem } from '@/lib/save-modal-item';
import { KanbanCard } from '@/components/board/KanbanCard';
import { OnboardingStep1 } from '@/components/onboarding/OnboardingStep1';
import { OnboardingStep2 } from '@/components/onboarding/OnboardingStep2';
import { WorkItem, ProjectSettings } from '@/types/tracker';

describe('PR-63 & PR-64 Review Fixes', () => {
  const sampleItem: WorkItem = {
    id: 'item-100',
    external_ref_id: 'TRK-100',
    tenant_id: 'tenant-a',
    project_id: 'proj-1',
    title: 'PR-63 Test Card',
    item_type: 'task',
    status: 'backlog',
    order_index: 1000,
    metadata: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const sampleSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [{ type: 'task', label: 'Task', level: 1, allowed_parents: [] }],
    statuses: [{ id: 'backlog', label: 'Backlog', color: '#94a3b8', order: 1 }],
    custom_fields: [],
  };

  describe('Comment 1: Workspace and project isolation in cross-tab broadcast synchronization', () => {
    it('ignores mutations from another tenant/workspace', async () => {
      const fetchData = vi.fn();
      const setItems = vi.fn();
      const setEditingItem = vi.fn();

      renderHook(() =>
        useTabSync({
          items: [sampleItem],
          setItems,
          editingItem: null,
          setEditingItem,
          fetchData,
          tenantSlug: 'tenant-a',
          currentProjectId: 'proj-1',
        })
      );

      // Broadcast from different tenant 'tenant-b'
      act(() => {
        broadcastItemMutation({
          type: 'ITEM_CREATED',
          item: { ...sampleItem, id: 'item-foreign', tenant_id: 'tenant-b' },
          tenantSlug: 'tenant-b',
          projectId: 'proj-1',
        });
      });

      await new Promise((r) => setTimeout(r, 60));
      expect(fetchData).not.toHaveBeenCalled();
    });

    it('ignores item updates from another project when current tab is single-project view', async () => {
      const setItems = vi.fn();
      const setEditingItem = vi.fn();

      renderHook(() =>
        useTabSync({
          items: [sampleItem],
          setItems,
          editingItem: null,
          setEditingItem,
          fetchData: vi.fn(),
          tenantSlug: 'tenant-a',
          currentProjectId: 'proj-1',
          isAllProjects: false,
        })
      );

      // Broadcast update for item-999 in proj-2
      act(() => {
        broadcastItemMutation({
          type: 'ITEM_UPDATED',
          itemId: 'item-999',
          updates: { title: 'Other Project Task' },
          tenantSlug: 'tenant-a',
          projectId: 'proj-2',
        });
      });

      await new Promise((r) => setTimeout(r, 60));
      expect(setItems).not.toHaveBeenCalled();
    });

    it('processes cross-project item moves: destination project triggers fetchData', async () => {
      const fetchData = vi.fn();

      renderHook(() =>
        useTabSync({
          items: [],
          setItems: vi.fn(),
          editingItem: null,
          setEditingItem: vi.fn(),
          fetchData,
          tenantSlug: 'tenant-a',
          currentProjectId: 'proj-2',
          isAllProjects: false,
        })
      );

      // Broadcast move from 'proj-1' into 'proj-2'
      act(() => {
        broadcastItemMutation({
          type: 'ITEMS_REFRESH',
          tenantSlug: 'tenant-a',
          projectId: 'proj-2',
          sourceProjectId: 'proj-1',
        });
      });

      await new Promise((r) => setTimeout(r, 60));
      expect(fetchData).toHaveBeenCalled();
    });

    it('applies ITEM_UPDATED and ITEM_DELETED to off-project editingItem even when excluded from items (PR-64 Comment 2)', async () => {
      const setEditingItem = vi.fn();
      const setItems = vi.fn();
      const offProjectItem: WorkItem = {
        ...sampleItem,
        id: 'item-off-proj',
        project_id: 'proj-other',
        title: 'Off-Project Item',
      };

      renderHook(() =>
        useTabSync({
          items: [sampleItem], // does not contain offProjectItem
          setItems,
          editingItem: offProjectItem,
          setEditingItem,
          fetchData: vi.fn(),
          tenantSlug: 'tenant-a',
          currentProjectId: 'proj-1',
          isAllProjects: false,
        })
      );

      // Broadcast update from proj-other for offProjectItem
      act(() => {
        broadcastItemMutation({
          type: 'ITEM_UPDATED',
          itemId: 'item-off-proj',
          updates: { title: 'Updated Off-Project' },
          tenantSlug: 'tenant-a',
          projectId: 'proj-other',
        });
      });

      await new Promise((r) => setTimeout(r, 60));
      expect(setEditingItem).toHaveBeenCalled();

      // Broadcast delete from proj-other for offProjectItem
      act(() => {
        broadcastItemMutation({
          type: 'ITEM_DELETED',
          itemId: 'item-off-proj',
          tenantSlug: 'tenant-a',
          projectId: 'proj-other',
        });
      });

      await new Promise((r) => setTimeout(r, 60));
      expect(setEditingItem).toHaveBeenCalledWith(expect.any(Function));
    });

    it('does not re-subscribe to BroadcastChannel when items list changes (PR-64 Comment 4)', () => {
      const subscribeSpy = vi.spyOn(syncChannelModule, 'subscribeToItemSync');
      const setItems = vi.fn();
      const setEditingItem = vi.fn();
      const fetchData = vi.fn();
      const { rerender } = renderHook(
        ({ items }) =>
          useTabSync({
            items,
            setItems,
            editingItem: null,
            setEditingItem,
            fetchData,
            tenantSlug: 'tenant-a',
            currentProjectId: 'proj-1',
          }),
        { initialProps: { items: [sampleItem] } }
      );

      const initialCallCount = subscribeSpy.mock.calls.length;

      // Update items list (e.g. user drags card, edits description, etc.)
      rerender({ items: [sampleItem, { ...sampleItem, id: 'item-2' }] });

      // Subscriber should not be torn down and rebuilt
      expect(subscribeSpy.mock.calls.length).toBe(initialCallCount);
      subscribeSpy.mockRestore();
    });
  });

  describe('Deep link retention and URL cleanup in useTabSync', () => {
    beforeEach(() => {
      window.history.replaceState(null, '', '/tenant-a/proj-1?item=TRK-100');
    });

    afterEach(() => {
      window.history.replaceState(null, '', '/');
    });

    it('does NOT clear ?item= from URL while items are loading and editingItem is null', async () => {
      renderHook(() =>
        useTabSync({
          items: [], // empty while loading
          setItems: vi.fn(),
          editingItem: null,
          setEditingItem: vi.fn(),
          fetchData: vi.fn(),
          tenantSlug: 'tenant-a',
          initialSearchParamItem: 'TRK-100',
          loading: true, // loading in progress
        })
      );

      // Parameter should be preserved
      const url = new URL(window.location.href);
      expect(url.searchParams.get('item')).toBe('TRK-100');
    });

    it('preserves ?item= during initial render when items already contains the linked item (PR-64 Comment 1)', async () => {
      let currentEditingItem: WorkItem | null = null;
      const setEditingItem = vi.fn((val) => {
        currentEditingItem = typeof val === 'function' ? val(currentEditingItem) : val;
      });

      renderHook(() =>
        useTabSync({
          items: [sampleItem],
          setItems: vi.fn(),
          editingItem: currentEditingItem,
          setEditingItem,
          fetchData: vi.fn(),
          tenantSlug: 'tenant-a',
          initialSearchParamItem: 'TRK-100',
          loading: false,
        })
      );

      // The initial render must NOT strip ?item=TRK-100
      const url = new URL(window.location.href);
      expect(url.searchParams.get('item')).toBe('TRK-100');
      expect(setEditingItem).toHaveBeenCalledWith(sampleItem);
    });

    it('clears ?item= only when modal was explicitly open and then closed', async () => {
      let currentEditingItem: WorkItem | null = sampleItem;
      const { rerender } = renderHook(
        ({ editingItem }: { editingItem: WorkItem | null }) =>
          useTabSync({
            items: [sampleItem],
            setItems: vi.fn(),
            editingItem,
            setEditingItem: vi.fn(),
            fetchData: vi.fn(),
            tenantSlug: 'tenant-a',
            initialSearchParamItem: 'TRK-100',
            loading: false,
          }),
        { initialProps: { editingItem: currentEditingItem as WorkItem | null } }
      );

      // Initially open: URL has ?item=TRK-100
      let url = new URL(window.location.href);
      expect(url.searchParams.get('item')).toBe('TRK-100');

      // User closes modal: editingItem becomes null
      currentEditingItem = null;
      rerender({ editingItem: currentEditingItem });

      url = new URL(window.location.href);
      expect(url.searchParams.get('item')).toBeNull();
    });

    it('removes ?item from URL when both item lookups fail to find nonexistent item (PR-64 Comment 3)', async () => {
      window.history.replaceState(null, '', '/tenant-a/proj-1?item=NONEXISTENT-999');
      const originalFetch = global.fetch;
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ items: [] }),
      });

      renderHook(() =>
        useTabSync({
          items: [],
          setItems: vi.fn(),
          editingItem: null,
          setEditingItem: vi.fn(),
          fetchData: vi.fn(),
          tenantSlug: 'tenant-a',
          initialSearchParamItem: 'NONEXISTENT-999',
          loading: false,
        })
      );

      await new Promise((r) => setTimeout(r, 100));
      const url = new URL(window.location.href);
      expect(url.searchParams.get('item')).toBeNull();

      global.fetch = originalFetch;
    });
  });

  describe('Comment 4: Onboarding manual slug normalization', () => {
    it('normalizes manual workspace slug to lowercase and removes invalid characters', () => {
      const handleSlugChange = vi.fn();
      render(
        <OnboardingStep1
          orgName="Acme Corp"
          workspaceSlug=""
          onOrgNameChange={() => {}}
          onWorkspaceSlugChange={handleSlugChange}
          error=""
          onNext={() => {}}
        />
      );

      const input = screen.getByPlaceholderText('acme-corp') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Acme Workspace 123!@#' } });

      // Should be lowercased and stripped of spaces and symbols
      expect(handleSlugChange).toHaveBeenCalledWith('acmeworkspace123');
    });

    it('normalizes manual project slug to lowercase and removes invalid characters', () => {
      const handleSlugChange = vi.fn();
      render(
        <OnboardingStep2
          workspaceSlug="acme"
          projectName="Project"
          projectSlug=""
          selectedTemplate="kanban"
          onProjectNameChange={() => {}}
          onProjectSlugChange={handleSlugChange}
          onTemplateChange={() => {}}
          onBack={() => {}}
          onSubmit={() => {}}
          loading={false}
          error=""
        />
      );

      const input = screen.getByPlaceholderText('q4-roadmap') as HTMLInputElement;
      fireEvent.change(input, { target: { value: 'Q4 ROADMAP 2026!' } });

      expect(handleSlugChange).toHaveBeenCalledWith('q4roadmap2026');
    });
  });

  describe('Comment 5: New-tab item links preserve view settings in KanbanCard', () => {
    beforeEach(() => {
      window.history.replaceState(null, '', '/tenant-a/proj-1?tab=sprint&points=fibonacci');
    });

    afterEach(() => {
      window.history.replaceState(null, '', '/');
    });

    it('preserves existing query parameters (tab, sprint, points) in link href', () => {
      render(
        <KanbanCard
          item={sampleItem}
          itemHierarchy={sampleSettings.hierarchy}
          onEditItem={() => {}}
        />
      );

      const link = screen.getByTestId(`kanban-card-link-${sampleItem.id}`);
      const href = link.getAttribute('href');

      expect(href).toContain('tab=sprint');
      expect(href).toContain('points=fibonacci');
      expect(href).toContain('item=TRK-100');
    });
  });

  describe('Comment 5 (PR 64): Portfolio edits invoke save handler with correct save and broadcast flow', () => {
    it('executes normal save and broadcasts ITEM_UPDATED when project_id is unchanged in portfolio mode', async () => {
      const existingItem = { ...sampleItem, id: 'it-1', project_id: 'proj-alpha', title: 'Task' };
      const allProjects = [
        { id: 'proj-alpha', slug: 'alpha', name: 'Alpha' },
        { id: 'proj-beta', slug: 'beta', name: 'Beta' },
      ];
      const setItems = vi.fn();
      const setEditingItem = vi.fn();
      const setBulkToast = vi.fn();
      const fetchData = vi.fn();
      const mockApiFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ item: { id: 'it-1', title: 'Updated Title' } }),
      });
      const mockReassign = vi.fn();
      const mockBroadcast = vi.fn();

      await saveModalItem({
        itemId: 'it-1',
        updates: { project_id: 'proj-alpha', title: 'Updated Title' },
        items: [existingItem],
        editingItem: existingItem,
        allProjects,
        projectSlug: 'all', // Portfolio route
        tenantSlug: 'tenant-a',
        setItems,
        setEditingItem,
        setBulkToast,
        fetchData,
        apiFetch: mockApiFetch,
        reassignProjectFn: mockReassign,
        broadcastMutationFn: mockBroadcast,
      });

      // Reassign should NOT be called
      expect(mockReassign).not.toHaveBeenCalled();
      // apiFetch PATCH should be called
      expect(mockApiFetch).toHaveBeenCalledWith('/api/v1/items', expect.objectContaining({ method: 'PATCH' }));
      // broadcast should be ITEM_UPDATED, NOT ITEMS_REFRESH
      expect(mockBroadcast).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ITEM_UPDATED',
          itemId: 'it-1',
          projectId: 'proj-alpha',
        })
      );
    });

    it('executes reassignWorkItemProject and broadcasts ITEMS_REFRESH when project_id changes in portfolio mode', async () => {
      const existingItem = { ...sampleItem, id: 'it-1', project_id: 'proj-alpha', title: 'Task' };
      const allProjects = [
        { id: 'proj-alpha', slug: 'alpha', name: 'Alpha' },
        { id: 'proj-beta', slug: 'beta', name: 'Beta' },
      ];
      const setItems = vi.fn();
      const setEditingItem = vi.fn();
      const setBulkToast = vi.fn();
      const fetchData = vi.fn();
      const mockApiFetch = vi.fn();
      const mockReassign = vi.fn().mockResolvedValue({ success: true, updatedCount: 2 });
      const mockBroadcast = vi.fn();

      await saveModalItem({
        itemId: 'it-1',
        updates: { project_id: 'proj-beta' },
        items: [existingItem],
        editingItem: existingItem,
        allProjects,
        projectSlug: 'all',
        tenantSlug: 'tenant-a',
        setItems,
        setEditingItem,
        setBulkToast,
        fetchData,
        apiFetch: mockApiFetch,
        reassignProjectFn: mockReassign,
        broadcastMutationFn: mockBroadcast,
      });

      // Reassign SHOULD be called with new project_id
      expect(mockReassign).toHaveBeenCalledWith('it-1', 'proj-beta', 'tenant-a', expect.any(Object));
      // fetchData should be called
      expect(fetchData).toHaveBeenCalled();
      // Toast should display move info
      expect(setBulkToast).toHaveBeenCalledWith(expect.stringContaining('Moved item and 1 child task to Beta'));
      // Broadcast should be ITEMS_REFRESH with both projectId and sourceProjectId
      expect(mockBroadcast).toHaveBeenCalledWith({
        type: 'ITEMS_REFRESH',
        tenantSlug: 'tenant-a',
        projectId: 'proj-beta',
        sourceProjectId: 'proj-alpha',
      });
    });
  });
});
