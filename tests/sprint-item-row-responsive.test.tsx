import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { SprintItemRow } from '@/components/SprintItemRow';
import { SprintWorkItemList } from '@/components/sprint/SprintWorkItemList';
import { WorkItem, HierarchyLevel, StatusDefinition } from '@/types/tracker';

const mockHierarchy: HierarchyLevel[] = [
  { level: 1, label: 'Epic', type: 'epic', color: '#8b5cf6', allowed_parents: [] },
  { level: 2, label: 'Story', type: 'story', color: '#0ea5e9', allowed_parents: ['epic'] },
  { level: 3, label: 'Task', type: 'task', color: '#10b981', allowed_parents: ['story'] },
];

const mockStatuses: StatusDefinition[] = [
  { id: 'todo', label: 'To Do', color: '#64748b', order: 1000 },
  { id: 'in_progress', label: 'In Progress', color: '#0ea5e9', order: 2000 },
  { id: 'done', label: 'Done', color: '#10b981', order: 3000 },
];

function createItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'test-item-row-1',
    tenant_id: 't-1',
    project_id: 'p-1',
    item_type: 'story',
    title: 'Mobile & Split-Screen Viewport Hardening for Sprint and Tree Item Rows',
    status: 'in_progress',
    order_index: 250000,
    external_ref_id: 'STORY-TRK-RESPONSIVE',
    metadata: { story_points: 5, sprint: 'Sprint 2026-Q4' },
    created_at: '2026-09-30T18:16:12Z',
    updated_at: '2026-10-09T18:37:09Z',
    assignee: 'Tymz',
    ...overrides,
  };
}

describe('TASK-TRK-ROW-RESPONSIVE-CONTAINER: Responsive Two-Tier Layout for SprintItemRow', () => {
  it('enforces responsive container refactor with flex-col on mobile and md:flex-row on desktop, min-w-0, and w-full', () => {
    const item = createItem();
    render(
      <SprintItemRow
        item={item}
        isSelected={false}
        onToggleSelect={vi.fn()}
        isImmutable={false}
        onEditItem={vi.fn()}
        getItemHierarchy={() => mockHierarchy}
        getItemStatuses={() => mockStatuses}
      />
    );

    const row = screen.getByTestId('sprint-item-row');
    expect(row).toHaveClass('flex');
    expect(row).toHaveClass('flex-col');
    expect(row).toHaveClass('md:flex-row');
    expect(row).toHaveClass('md:items-center');
    expect(row).toHaveClass('min-w-0');
    expect(row).toHaveClass('w-full');
  });

  it('renders Tier 1 with selection checkbox, level badge, and truncated title', () => {
    const item = createItem();
    render(
      <SprintItemRow
        item={item}
        isSelected={false}
        onToggleSelect={vi.fn()}
        isImmutable={false}
        onEditItem={vi.fn()}
        getItemHierarchy={() => mockHierarchy}
        getItemStatuses={() => mockStatuses}
      />
    );

    // Selection checkbox
    const checkboxBtn = screen.getByTestId(`sprint-item-checkbox-${item.id}`);
    expect(checkboxBtn).toBeInTheDocument();

    // Level badge
    const badge = screen.getByTitle('story');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('story');

    // Title
    const title = screen.getByText(item.title);
    expect(title).toBeInTheDocument();
    expect(title).toHaveClass('truncate min-w-0 flex-1');
  });

  it('renders discreet (n) subtask count on mobile and full pill on desktop in tree mode', () => {
    const item = createItem();
    render(
      <SprintItemRow
        item={item}
        isSelected={false}
        onToggleSelect={vi.fn()}
        isImmutable={false}
        onEditItem={vi.fn()}
        getItemHierarchy={() => mockHierarchy}
        getItemStatuses={() => mockStatuses}
        isTreeMode={true}
        childCount={4}
        rollupPoints={16}
      />
    );

    // Mobile discreet subtask count
    const mobileChildCount = screen.getByTestId('sprint-child-count-mobile');
    expect(mobileChildCount).toBeInTheDocument();
    expect(mobileChildCount).toHaveTextContent('(4)');

    // Desktop full subtask count pill
    const desktopChildCount = screen.getByTestId('tree-child-count-badge');
    expect(desktopChildCount).toBeInTheDocument();
    expect(desktopChildCount).toHaveTextContent('4 subtasks');
    expect(desktopChildCount).toHaveClass('hidden md:inline-flex');

    // Mobile edit button
    const mobileEditBtn = screen.getByTestId(`edit-item-mobile-${item.id}`);
    expect(mobileEditBtn).toBeInTheDocument();

    // Desktop edit button
    const desktopEditBtn = screen.getByTestId(`edit-item-desktop-${item.id}`);
    expect(desktopEditBtn).toBeInTheDocument();
    expect(desktopEditBtn).toHaveClass('hidden md:inline-flex');
  });

  it('renders Tier 2 with indented line pl-8 containing point badge, assignee, status, and sprint select', () => {
    const item = createItem();
    render(
      <SprintItemRow
        item={item}
        isSelected={false}
        onToggleSelect={vi.fn()}
        isImmutable={false}
        onEditItem={vi.fn()}
        getItemHierarchy={() => mockHierarchy}
        getItemStatuses={() => mockStatuses}
        availableSprints={['Sprint 2026-Q4', 'Sprint 2027-Q1']}
        currentSprintName="Sprint 2026-Q4"
        isTreeMode={true}
        childCount={3}
        rollupPoints={16}
      />
    );

    const tier2 = screen.getByTestId('sprint-item-row-tier2');
    expect(tier2).toHaveClass('pl-8');
    expect(tier2).toHaveClass('flex');
    expect(tier2).toHaveClass('flex-wrap');
    expect(tier2).toHaveClass('items-center');
    expect(tier2).toHaveClass('gap-2');
    expect(tier2).toHaveClass('mt-1.5');
    expect(tier2).toHaveClass('pb-1');

    // Consolidated Rollup Badge
    const rollupBadge = screen.getByTestId('tree-rollup-points-badge');
    expect(rollupBadge.textContent).toContain('16 pts Σ');

    // Assignee
    expect(within(tier2).getByText('Tymz')).toBeInTheDocument();

    // Status dropdown
    const statusSelect = screen.getByTestId(`sprint-status-select-${item.id}`);
    expect(statusSelect).toBeInTheDocument();
    expect(statusSelect).toHaveClass('py-0.5 px-1.5 md:py-1 md:px-2');

    // Sprint dropdown
    const sprintSelect = screen.getByDisplayValue('Sprint 2026-Q4');
    expect(sprintSelect).toBeInTheDocument();
    expect(sprintSelect).toHaveClass('max-w-[130px]');
  });

  it('SprintWorkItemList renders items and handles empty list gracefully', () => {
    const { rerender } = render(
      <SprintWorkItemList
        items={[]}
        getItemHierarchy={() => mockHierarchy}
        getItemStatuses={() => mockStatuses}
        emptyMessage="No sprint items currently scheduled."
      />
    );

    expect(screen.getByTestId('sprint-empty-list')).toHaveTextContent('No sprint items currently scheduled.');

    const item = createItem();
    rerender(
      <SprintWorkItemList
        items={[item]}
        getItemHierarchy={() => mockHierarchy}
        getItemStatuses={() => mockStatuses}
      />
    );

    expect(screen.getByTestId('sprint-work-item-list')).toBeInTheDocument();
    expect(screen.getByTestId('sprint-item-row')).toBeInTheDocument();
  });
});
