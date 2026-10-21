import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SprintItemRow } from '@/components/SprintItemRow';
import { WorkItem, HierarchyLevel, StatusDefinition } from '@/types/tracker';

const mockHierarchy: HierarchyLevel[] = [
  { level: 1, label: 'Story', type: 'story', color: '#0ea5e9', allowed_parents: [] },
  { level: 2, label: 'Task', type: 'task', color: '#10b981', allowed_parents: ['story'] },
  { level: 3, label: 'Subtask', type: 'subtask', color: '#6366f1', allowed_parents: ['task'] },
];

const mockStatuses: StatusDefinition[] = [
  { id: 'not_started', label: 'Not Started', color: '#64748b', order: 1000 },
  { id: 'in_progress', label: 'In Progress', color: '#0ea5e9', order: 2000 },
  { id: 'completed', label: 'Completed', color: '#10b981', order: 3000 },
];

function createItem(overrides: Partial<WorkItem> = {}): WorkItem {
  return {
    id: 'test-collision-item-1',
    tenant_id: 't-1',
    project_id: 'p-1',
    item_type: 'story',
    title: 'Very Long Task Title That Could Potentially Collide With Metadata Badges In Narrow Viewports',
    status: 'in_progress',
    order_index: 299000,
    external_ref_id: 'STORY-COLLISION-1',
    metadata: {
      story_points: 5,
      sprint: 'Sprint 2026-Q4',
      pr_url: 'https://github.com/tympollack/sunshade-tracker/pull/114',
      commit_hash: '1e610f7654321',
    },
    created_at: '2026-10-21T00:00:00Z',
    updated_at: '2026-10-21T00:00:00Z',
    assignee: 'Tymz',
    ...overrides,
  };
}

describe('BUG-TRK-SPRINT-ROW-BADGE-COLLISION: Sprint Planning Tree Row Layout & Pill Collision', () => {
  it('structures primary row into Left Section, Git Metadata Cluster, and Right Attributes Section', () => {
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
        childCount={2}
        rollupPoints={8}
      />
    );

    // Left Section
    const titleEl = screen.getByText(item.title);
    const leftSection = titleEl.parentElement;
    expect(leftSection).not.toBeNull();
    expect(leftSection).toHaveClass('flex-1');
    expect(leftSection).toHaveClass('min-w-0');
    expect(leftSection).toHaveClass('flex');
    expect(leftSection).toHaveClass('items-center');
    expect(leftSection).toHaveClass('gap-2');
    expect(leftSection).toHaveClass('overflow-hidden');

    // Title truncation and tooltip
    expect(titleEl).toHaveClass('truncate');
    expect(titleEl).toHaveClass('min-w-0');
    expect(titleEl).toHaveClass('flex-1');
    expect(titleEl).toHaveClass('font-medium');
    expect(titleEl).toHaveAttribute('title', item.title);

    // Git Metadata Cluster
    const gitCluster = screen.getByTestId('git-metadata-cluster');
    expect(gitCluster).toBeInTheDocument();
    expect(gitCluster).toHaveClass('shrink-0');
    expect(gitCluster).toHaveClass('flex');
    expect(gitCluster).toHaveClass('items-center');
    expect(gitCluster).toHaveClass('gap-1.5');
    expect(gitCluster).toHaveClass('whitespace-nowrap');

    // Badges inside cluster
    expect(screen.getByText('#114')).toBeInTheDocument();
    expect(screen.getByText('1e610f7')).toBeInTheDocument();

    // Right Attributes Section (Tier 2 on mobile, right on desktop)
    const rightSection = screen.getByTestId('sprint-item-row-tier2');
    expect(rightSection).toHaveClass('md:shrink-0');
    expect(rightSection).toHaveClass('md:ml-auto');
    expect(rightSection).toHaveClass('md:gap-2.5');

    // Subtasks counter and rollup points are in right attributes section
    const subtaskBadge = screen.getByTestId('tree-child-count-badge');
    expect(subtaskBadge).toBeInTheDocument();
    expect(subtaskBadge).toHaveClass('whitespace-nowrap');
    expect(subtaskBadge).toHaveClass('shrink-0');

    const pointsBadge = screen.getByTestId('tree-rollup-points-badge');
    expect(pointsBadge).toBeInTheDocument();
    expect(pointsBadge).toHaveClass('whitespace-nowrap');
    expect(pointsBadge).toHaveClass('shrink-0');
  });

  it('renders badges and pills with shrink-0 and whitespace-nowrap preventing clipping', () => {
    const item = createItem();
    render(
      <SprintItemRow
        item={item}
        isSelected={false}
        onToggleSelect={vi.fn()}
        isImmutable={true}
        onEditItem={vi.fn()}
        getItemHierarchy={() => mockHierarchy}
        getItemStatuses={() => mockStatuses}
      />
    );

    const levelBadge = screen.getByTitle('story');
    expect(levelBadge).toHaveClass('shrink-0');
    expect(levelBadge).toHaveClass('whitespace-nowrap');

    const lockBadge = screen.getByTestId('immutable-lock-badge');
    expect(lockBadge).toHaveClass('shrink-0');
    expect(lockBadge).toHaveClass('whitespace-nowrap');
  });
});
