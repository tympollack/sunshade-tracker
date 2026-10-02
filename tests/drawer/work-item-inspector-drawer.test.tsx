import React from 'react';
import { render, screen, fireEvent, renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useWorkItemSelection } from '@/hooks/useWorkItemSelection';
import { WorkItemInspectorDrawer } from '@/components/drawer/WorkItemInspectorDrawer';
import { MobileItemBottomSheet } from '@/components/drawer/MobileItemBottomSheet';
import { WorkItem } from '@/types/tracker';

const mockItems: WorkItem[] = [
  {
    id: 'item-101',
    tenant_id: 't-1',
    project_id: 'p-1',
    external_ref_id: 'TASK-TRK-01',
    item_type: 'task',
    status: 'in_progress',
    title: 'Inspector Drawer Implementation',
    description: 'Build fast non-blocking triage panel',
    order_index: 1000,
    assignee: 'tympollack',
    metadata: { sprint: 'Sprint 2026-Q4', story_points: 5 },
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  },
];

describe('TASK-TRK-RHN-INSPECTOR-DRAWER: Inspector Drawer & Mobile Bottom Sheet', () => {
  beforeEach(() => {
    window.history.replaceState(null, '', 'http://localhost:3000/pym-energy/board');
    vi.clearAllMocks();
  });

  describe('useWorkItemSelection URL State Management', () => {
    it('synchronizes selected item with ?item= URL search parameter', () => {
      const { result } = renderHook(() =>
        useWorkItemSelection({ items: mockItems })
      );

      expect(result.current.selectedItem).toBeNull();
      expect(result.current.isOpen).toBe(false);

      act(() => {
        result.current.selectItem(mockItems[0]);
      });

      expect(result.current.selectedItem?.id).toBe('item-101');
      expect(result.current.isOpen).toBe(true);
      expect(window.location.search).toContain('item=TASK-TRK-01');

      act(() => {
        result.current.close();
      });

      expect(result.current.selectedItem).toBeNull();
      expect(result.current.isOpen).toBe(false);
      expect(window.location.search).not.toContain('item=TASK-TRK-01');
    });

    it('automatically opens inspector on initial load when deep-linked with ?item=', () => {
      window.history.replaceState(null, '', 'http://localhost:3000/pym-energy/board?item=TASK-TRK-01');

      const { result } = renderHook(() =>
        useWorkItemSelection({ items: mockItems })
      );

      expect(result.current.selectedItem?.id).toBe('item-101');
      expect(result.current.isOpen).toBe(true);
    });

    it('dismisses drawer when Escape key is pressed', () => {
      const { result } = renderHook(() =>
        useWorkItemSelection({ items: mockItems })
      );

      act(() => {
        result.current.selectItem(mockItems[0]);
      });

      expect(result.current.isOpen).toBe(true);

      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      });

      expect(result.current.isOpen).toBe(false);
      expect(result.current.selectedItem).toBeNull();
    });
  });

  describe('WorkItemInspectorDrawer Component', () => {
    it('renders editable fields (title, status, assignee, story points, sprint)', () => {
      const onUpdate = vi.fn();
      const onClose = vi.fn();

      render(
        <WorkItemInspectorDrawer
          item={mockItems[0]}
          isOpen={true}
          onClose={onClose}
          onUpdateItem={onUpdate}
          tenantSlug="pym-energy"
        />
      );

      expect(screen.getByDisplayValue('Inspector Drawer Implementation')).toBeInTheDocument();
      expect(screen.getByLabelText('Status')).toBeInTheDocument();
      expect(screen.getByLabelText('Story Points')).toHaveValue(5);
      expect(screen.getByLabelText('Description')).toHaveValue('Build fast non-blocking triage panel');

      // Test close button
      const closeBtn = screen.getByLabelText('Close Inspector');
      fireEvent.click(closeBtn);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it('calls onUpdateItem when a field changes', () => {
      const onUpdate = vi.fn();
      render(
        <WorkItemInspectorDrawer
          item={mockItems[0]}
          isOpen={true}
          onClose={vi.fn()}
          onUpdateItem={onUpdate}
          tenantSlug="pym-energy"
        />
      );

      const statusSelect = screen.getByLabelText('Status');
      fireEvent.change(statusSelect, { target: { value: 'completed' } });
      expect(onUpdate).toHaveBeenCalledWith('item-101', expect.objectContaining({ status: 'completed' }));
    });
  });

  describe('MobileItemBottomSheet Component', () => {
    it('renders bottom sheet modal with drag handle and backdrop', () => {
      const onClose = vi.fn();
      render(
        <MobileItemBottomSheet
          item={mockItems[0]}
          isOpen={true}
          onClose={onClose}
          tenantSlug="pym-energy"
        />
      );

      expect(screen.getByTestId('mobile-item-bottom-sheet')).toBeInTheDocument();
      expect(screen.getByTestId('sheet-drag-handle')).toBeInTheDocument();

      const backdrop = screen.getByTestId('bottom-sheet-backdrop');
      fireEvent.click(backdrop);
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });
});
