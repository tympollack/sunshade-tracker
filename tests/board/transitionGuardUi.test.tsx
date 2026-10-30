import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { KanbanCard } from '@/components/board/KanbanCard';
import {
  GuardRejectionToast,
  TransitionGuardWarningBanner,
} from '@/components/board/TransitionGuardFeedback';
import { formatGuardRejectionMessage } from '@/lib/automation/guardEvaluator';
import { WorkItemModal } from '@/components/WorkItemModal';
import { WorkItemInspectorDrawer } from '@/components/drawer/WorkItemInspectorDrawer';
import { WorkItem, ProjectSettings } from '@/types/tracker';

describe('TASK-TRK-GUARD-UI-INTERCEPTOR: Kanban Guard Feedback & Modal Warnings', () => {
  const sampleSettings: ProjectSettings = {
    schema_version: '1.0',
    hierarchy: [
      { type: 'epic', label: 'Epic', level: 1, allowed_parents: [] },
      { type: 'task', label: 'Task', level: 2, allowed_parents: ['epic'] },
    ],
    statuses: [
      { id: 'backlog', label: 'Backlog', color: '#94a3b8', order: 1 },
      { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      { id: 'in_review', label: 'In Review', color: '#a855f7', order: 3 },
      { id: 'done', label: 'Done', color: '#22c55e', order: 4 },
    ],
    custom_fields: ['priority', 'pr_url', 'commit_hash'],
    transition_guards: [
      {
        id: 'guard-review-pr',
        target_status: 'in_review',
        name: 'Require pull request URL before moving to In Review',
        enabled: true,
        conditions: [
          {
            field: 'metadata.pr_url',
            operator: '$is_not_null',
            message: 'Missing Pull Request URL',
          },
        ],
      },
    ],
  };

  const sampleItem: WorkItem = {
    id: 'item-guard-101',
    external_ref_id: 'TASK-TRK-101',
    tenant_id: 't-1',
    project_id: 'p-1',
    title: 'Transition Guardrail Integration',
    description: 'Ensure drag-and-drop rollback and toast alert work properly',
    status: 'in_progress',
    item_type: 'task',
    order_index: 1000,
    metadata: {
      priority: 'High',
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  describe('KanbanCard guard rejection styling', () => {
    it('applies high-contrast rose ring and data-guard-rejected attribute when rejected', () => {
      render(
        <KanbanCard
          item={sampleItem}
          itemHierarchy={sampleSettings.hierarchy}
          isGuardRejected={true}
          getItemStatuses={() => sampleSettings.statuses}
        />
      );

      const card = screen.getByTestId('kanban-card-item-guard-101');
      expect(card).toHaveAttribute('data-guard-rejected', 'true');
      expect(card.className).toContain('ring-2');
      expect(card.className).toContain('ring-rose-500');
    });

    it('does not have data-guard-rejected attribute when isGuardRejected is false', () => {
      render(
        <KanbanCard
          item={sampleItem}
          itemHierarchy={sampleSettings.hierarchy}
          isGuardRejected={false}
          getItemStatuses={() => sampleSettings.statuses}
        />
      );

      const card = screen.getByTestId('kanban-card-item-guard-101');
      expect(card).not.toHaveAttribute('data-guard-rejected');
      expect(card.className).not.toContain('ring-rose-500');
    });
  });

  describe('GuardRejectionToast', () => {
    it('renders high-contrast alert toast with message and dismiss button', () => {
      const onDismiss = vi.fn();
      render(
        <GuardRejectionToast
          message="Cannot move to In Review: Missing Pull Request URL"
          errors={['Missing Pull Request URL']}
          onDismiss={onDismiss}
        />
      );

      const toast = screen.getByTestId('guard-rejection-toast');
      expect(toast).toBeInTheDocument();
      expect(toast).toHaveAttribute('role', 'alert');
      expect(toast.className).toContain('bg-rose-950');
      expect(toast.className).toContain('border-rose-500');
      expect(screen.getByText('Cannot move to In Review: Missing Pull Request URL')).toBeInTheDocument();

      const dismissBtn = screen.getByTestId('dismiss-guard-toast-btn');
      fireEvent.click(dismissBtn);
      expect(onDismiss).toHaveBeenCalledTimes(1);
    });

    it('renders error list when multiple guard errors exist', () => {
      render(
        <GuardRejectionToast
          message="Cannot move to In Review: Missing required transition fields"
          errors={['Missing Pull Request URL', 'Missing Commit Hash']}
        />
      );

      expect(screen.getByText('Missing Pull Request URL')).toBeInTheDocument();
      expect(screen.getByText('Missing Commit Hash')).toBeInTheDocument();
    });

    it('returns null when message is null', () => {
      const { container } = render(<GuardRejectionToast message={null} />);
      expect(container.firstChild).toBeNull();
    });
  });

  describe('formatGuardRejectionMessage', () => {
    it('formats single and multiple guard errors with human-readable status label', () => {
      const msg = formatGuardRejectionMessage(
        'in_review',
        ['Missing Pull Request URL'],
        sampleSettings.statuses
      );
      expect(msg).toBe('Cannot move to In Review: Missing Pull Request URL');

      const multiMsg = formatGuardRejectionMessage(
        'in_review',
        ['Missing Pull Request URL', 'Missing Commit Hash'],
        sampleSettings.statuses
      );
      expect(multiMsg).toBe('Cannot move to In Review: Missing Pull Request URL, Missing Commit Hash');
    });

    it('preserves message if already prefixed with Cannot move to', () => {
      const msg = formatGuardRejectionMessage(
        'in_review',
        'Cannot move to In Review: Already formatted',
        sampleSettings.statuses
      );
      expect(msg).toBe('Cannot move to In Review: Already formatted');
    });
  });

  describe('TransitionGuardWarningBanner', () => {
    it('shows proactive warning when item has unmet guard requirements', () => {
      const onQuickAdd = vi.fn();
      render(
        <TransitionGuardWarningBanner
          item={sampleItem}
          projectSettings={sampleSettings}
          existingMetadataKeys={sampleItem.metadata}
          onQuickAddField={onQuickAdd}
        />
      );

      const warning = screen.getByTestId('transition-guard-warning');
      expect(warning).toBeInTheDocument();
      expect(screen.getByText(/Required transition fields are blank/i)).toBeInTheDocument();
      expect(screen.getByText(/Missing Pull Request URL/i)).toBeInTheDocument();

      const quickAddBtn = screen.getByTestId('guard-quick-add-pr_url');
      expect(quickAddBtn).toBeInTheDocument();
      fireEvent.click(quickAddBtn);
      expect(onQuickAdd).toHaveBeenCalledWith('pr_url');
    });

    it('renders with rose styling when selectedStatus matches the blocked target_status', () => {
      render(
        <TransitionGuardWarningBanner
          item={sampleItem}
          projectSettings={sampleSettings}
          selectedStatus="in_review"
          existingMetadataKeys={sampleItem.metadata}
        />
      );

      const banner = screen.getByTestId('transition-guard-warning');
      expect(banner.className).toContain('bg-rose-950/60');
      expect(screen.getByText(/Cannot transition to selected status — required fields are blank/i)).toBeInTheDocument();
    });

    it('returns null when all guard conditions are satisfied', () => {
      const satisfiedItem: WorkItem = {
        ...sampleItem,
        metadata: {
          ...sampleItem.metadata,
          pr_url: 'https://github.com/sunshade/tracker/pull/42',
        },
      };

      const { container } = render(
        <TransitionGuardWarningBanner
          item={satisfiedItem}
          projectSettings={sampleSettings}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('WorkItemModal integration', () => {
    it('displays TransitionGuardWarningBanner inside modal when required fields are missing', () => {
      render(
        <WorkItemModal
          item={sampleItem}
          isOpen={true}
          onClose={() => {}}
          onSave={() => {}}
          onDelete={() => {}}
          projectSettings={sampleSettings}
          allItems={[sampleItem]}
        />
      );

      const warning = screen.getByTestId('modal-transition-guard-warning');
      expect(warning).toBeInTheDocument();
      expect(screen.getByText(/Missing Pull Request URL/i)).toBeInTheDocument();
    });
  });

  describe('WorkItemInspectorDrawer integration', () => {
    it('displays TransitionGuardWarningBanner inside inspector drawer for unmet guards', () => {
      render(
        <WorkItemInspectorDrawer
          tenantSlug="t-1"
          item={sampleItem}
          isOpen={true}
          onClose={() => {}}
          projectSettings={sampleSettings}
          allItems={[sampleItem]}
        />
      );

      const warning = screen.getByTestId('drawer-transition-guard-warning');
      expect(warning).toBeInTheDocument();
      expect(screen.getByText(/Missing Pull Request URL/i)).toBeInTheDocument();
    });
  });
});
