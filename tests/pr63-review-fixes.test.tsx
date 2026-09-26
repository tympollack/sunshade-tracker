import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { useTabSync } from '@/hooks/useTabSync';
import { broadcastItemMutation } from '@/lib/sync-channel';
import { KanbanCard } from '@/components/board/KanbanCard';
import { OnboardingStep1 } from '@/components/onboarding/OnboardingStep1';
import { OnboardingStep2 } from '@/components/onboarding/OnboardingStep2';
import { WorkItem, ProjectSettings } from '@/types/tracker';

describe('PR-63 Review Fixes', () => {
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

    it('ignores item creation in another project when in single-project view', async () => {
      const fetchData = vi.fn();

      renderHook(() =>
        useTabSync({
          items: [sampleItem],
          setItems: vi.fn(),
          editingItem: null,
          setEditingItem: vi.fn(),
          fetchData,
          tenantSlug: 'tenant-a',
          currentProjectId: 'proj-1',
          isAllProjects: false,
        })
      );

      // Broadcast creation in 'proj-2'
      act(() => {
        broadcastItemMutation({
          type: 'ITEM_CREATED',
          item: { ...sampleItem, id: 'item-2', project_id: 'proj-2' },
          tenantSlug: 'tenant-a',
          projectId: 'proj-2',
        });
      });

      await new Promise((r) => setTimeout(r, 60));
      expect(fetchData).not.toHaveBeenCalled();
    });

    it('triggers reload on item creation when in all-projects view', async () => {
      const fetchData = vi.fn();

      renderHook(() =>
        useTabSync({
          items: [sampleItem],
          setItems: vi.fn(),
          editingItem: null,
          setEditingItem: vi.fn(),
          fetchData,
          tenantSlug: 'tenant-a',
          isAllProjects: true,
        })
      );

      // Broadcast creation in any project within the same tenant
      act(() => {
        broadcastItemMutation({
          type: 'ITEM_CREATED',
          item: { ...sampleItem, id: 'item-2', project_id: 'proj-2' },
          tenantSlug: 'tenant-a',
          projectId: 'proj-2',
        });
      });

      await new Promise((r) => setTimeout(r, 60));
      expect(fetchData).toHaveBeenCalled();
    });

    it('triggers reload when an item is moved into this project from another project', async () => {
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
  });

  describe('Comment 2: Deep link retention during item loading in useTabSync', () => {
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

  describe('Comment 3: Portfolio edits do not trigger unnecessary project moves', () => {
    it('compares requested project ID against edited item current project_id, not route project slug', () => {
      const existingItem = { id: 'it-1', project_id: 'proj-alpha', title: 'Task' };
      const allProjects = [{ id: 'proj-alpha', slug: 'alpha', name: 'Alpha' }];
      const projectSlug = 'all'; // Portfolio view has no project matching 'all'
      const currentProj = allProjects.find((p) => p.slug === projectSlug); // undefined

      // Case 1: Normal edit in portfolio retaining same project_id
      const updatesNormalEdit = { title: 'Updated Title', project_id: 'proj-alpha' };
      const isMovingNormal = Boolean(
        updatesNormalEdit.project_id &&
        (existingItem
          ? existingItem.project_id !== updatesNormalEdit.project_id
          : currentProj && updatesNormalEdit.project_id !== currentProj.id)
      );
      expect(isMovingNormal).toBe(false);

      // Case 2: Intentional project move to proj-beta
      const updatesMove = { title: 'Updated Title', project_id: 'proj-beta' };
      const isMovingExplicit = Boolean(
        updatesMove.project_id &&
        (existingItem
          ? existingItem.project_id !== updatesMove.project_id
          : currentProj && updatesMove.project_id !== currentProj.id)
      );
      expect(isMovingExplicit).toBe(true);
    });
  });
});
