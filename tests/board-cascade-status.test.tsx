import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CascadeCompletionModal } from '@/components/CascadeCompletionModal';
import { CascadePromptModal } from '@/components/CascadePromptModal';
import { WorkItem } from '@/types/tracker';

describe('TASK-TRK-BOARD-CASCADE-STATUS & TASK-TRK-BOARD-COMPLETE-CONFIRMATION', () => {
  const mockParent: WorkItem = {
    id: 'parent-123',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    parent_id: null,
    external_ref_id: 'STORY-TRK-01',
    item_type: 'story',
    status: 'in_progress',
    title: 'Implement Kanban Enhancements',
    description: null,
    order_index: 1000,
    assignee: 'tympollack',
    metadata: {},
    created_at: '2026-09-08T00:00:00Z',
    updated_at: '2026-09-08T00:00:00Z',
  };

  const mockChildren: WorkItem[] = [
    {
      id: 'child-1',
      tenant_id: 'tenant-1',
      project_id: 'proj-1',
      parent_id: 'parent-123',
      external_ref_id: 'TASK-TRK-01',
      item_type: 'task',
      status: 'not_started',
      title: 'First unfinished task',
      description: null,
      order_index: 1000,
      assignee: null,
      metadata: {},
      created_at: '2026-09-08T00:00:00Z',
      updated_at: '2026-09-08T00:00:00Z',
    },
    {
      id: 'child-2',
      tenant_id: 'tenant-1',
      project_id: 'proj-1',
      parent_id: 'parent-123',
      external_ref_id: 'TASK-TRK-02',
      item_type: 'task',
      status: 'in_progress',
      title: 'Second unfinished task',
      description: null,
      order_index: 2000,
      assignee: null,
      metadata: {},
      created_at: '2026-09-08T00:00:00Z',
      updated_at: '2026-09-08T00:00:00Z',
    },
  ];

  describe('CascadeCompletionModal component', () => {
    it('renders nothing when isOpen is false', () => {
      const { container } = render(
        <CascadeCompletionModal
          isOpen={false}
          parentItem={mockParent}
          unfinishedChildren={mockChildren}
          targetStatus="complete"
          onCompleteParentAnyway={() => {}}
          onCompleteAllChildren={() => {}}
          onCancel={() => {}}
        />
      );
      expect(container.firstChild).toBeNull();
    });

    it('renders modal with parent title, unfinished count, and list of child tasks', () => {
      render(
        <CascadeCompletionModal
          isOpen={true}
          parentItem={mockParent}
          unfinishedChildren={mockChildren}
          targetStatus="complete"
          targetStatusLabel="Complete"
          onCompleteParentAnyway={() => {}}
          onCompleteAllChildren={() => {}}
          onCancel={() => {}}
        />
      );

      expect(screen.getByText('Unfinished Child Tasks')).toBeDefined();
      expect(screen.getByText(/"Implement Kanban Enhancements"/i)).toBeDefined();
      expect(screen.getByText('First unfinished task')).toBeDefined();
      expect(screen.getByText('TASK-TRK-01')).toBeDefined();
      expect(screen.getByText('Second unfinished task')).toBeDefined();
      expect(screen.getByText('TASK-TRK-02')).toBeDefined();
      expect(screen.getByRole('button', { name: /Complete all children too/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /Complete parent anyway/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeDefined();
    });

    it('calls onCompleteAllChildren when "Complete all children too" is clicked', async () => {
      const handleCompleteAll = vi.fn();
      render(
        <CascadeCompletionModal
          isOpen={true}
          parentItem={mockParent}
          unfinishedChildren={mockChildren}
          targetStatus="complete"
          onCompleteParentAnyway={() => {}}
          onCompleteAllChildren={handleCompleteAll}
          onCancel={() => {}}
        />
      );

      const btn = screen.getByRole('button', { name: /Complete all children too/i });
      await act(async () => {
        fireEvent.click(btn);
      });
      expect(handleCompleteAll).toHaveBeenCalledTimes(1);
    });

    it('calls onCompleteParentAnyway when "Complete parent anyway" is clicked', async () => {
      const handleParentAnyway = vi.fn();
      render(
        <CascadeCompletionModal
          isOpen={true}
          parentItem={mockParent}
          unfinishedChildren={mockChildren}
          targetStatus="complete"
          onCompleteParentAnyway={handleParentAnyway}
          onCompleteAllChildren={() => {}}
          onCancel={() => {}}
        />
      );

      const btn = screen.getByRole('button', { name: /Complete parent anyway/i });
      await act(async () => {
        fireEvent.click(btn);
      });
      expect(handleParentAnyway).toHaveBeenCalledTimes(1);
    });

    it('calls onCancel when Cancel button is clicked', async () => {
      const handleCancel = vi.fn();
      render(
        <CascadeCompletionModal
          isOpen={true}
          parentItem={mockParent}
          unfinishedChildren={mockChildren}
          targetStatus="complete"
          onCompleteParentAnyway={() => {}}
          onCompleteAllChildren={() => {}}
          onCancel={handleCancel}
        />
      );

      const btn = screen.getByRole('button', { name: /Cancel/i });
      await act(async () => {
        fireEvent.click(btn);
      });
      expect(handleCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe('CascadePromptModal component', () => {
    it('renders prompt when parent moves to In Progress with unstarted children', () => {
      render(
        <CascadePromptModal
          isOpen={true}
          type="advance_children_to_in_progress"
          targetItem={mockParent}
          relatedItems={mockChildren}
          onConfirm={() => {}}
          onDecline={() => {}}
          onCancel={() => {}}
        />
      );

      expect(screen.getByText('Start Child Tasks?')).toBeDefined();
      expect(screen.getByRole('button', { name: /Update children too/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /Parent only/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /Cancel/i })).toBeDefined();
    });

    it('renders prompt when last child completes offering to advance parent', () => {
      render(
        <CascadePromptModal
          isOpen={true}
          type="advance_parent_to_complete"
          targetItem={mockParent}
          relatedItems={mockChildren}
          onConfirm={() => {}}
          onDecline={() => {}}
          onCancel={() => {}}
        />
      );

      expect(screen.getByText('All Child Tasks Complete')).toBeDefined();
      expect(screen.getByRole('button', { name: /Move parent to Complete/i })).toBeDefined();
      expect(screen.getByRole('button', { name: /Keep parent status/i })).toBeDefined();
    });

    it('invokes onConfirm when confirm action is triggered', async () => {
      const handleConfirm = vi.fn();
      render(
        <CascadePromptModal
          isOpen={true}
          type="advance_children_to_in_progress"
          targetItem={mockParent}
          relatedItems={mockChildren}
          onConfirm={handleConfirm}
          onDecline={() => {}}
          onCancel={() => {}}
        />
      );

      const btn = screen.getByRole('button', { name: /Update children too/i });
      await act(async () => {
        fireEvent.click(btn);
      });
      expect(handleConfirm).toHaveBeenCalledTimes(1);
    });
  });
});
