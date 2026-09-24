import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { TreeNode } from '@/components/TreeNode';
import { WorkItemNode, HierarchyLevel, StatusDefinition } from '@/types/tracker';
import fs from 'fs';
import path from 'path';

// Mock useRouter
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const mockStatuses: StatusDefinition[] = [
  { id: 'todo', label: 'To Do', color: '#94a3b8', order: 1 },
  { id: 'in_progress', label: 'In Progress', color: '#3b82f6', order: 2 },
  { id: 'done', label: 'Done', color: '#10b981', order: 3 },
];

const mockHierarchy: HierarchyLevel[] = [
  { level: 0, type: 'epic', label: 'Epic', allowed_parents: [] },
  { level: 1, type: 'story', label: 'Story', allowed_parents: ['epic'] },
  { level: 2, type: 'task', label: 'Task', allowed_parents: ['story'] },
];

function createItem(overrides: Partial<WorkItemNode> = {}): WorkItemNode {
  return {
    id: 'test-item-mobile',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    title: 'Mobile Usability Refactor for Tree Hierarchy',
    item_type: 'story',
    status: 'in_progress',
    order_index: 10,
    depth: 0,
    external_ref_id: 'STORY-404',
    metadata: { story_points: 5 },
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    rollupPoints: 12,
    descendantCount: 2,
    assignee: 'Alice Engineering Lead',
    ...overrides,
  };
}

describe('BUG-TRK-HIERARCHY-MOBILE-VIEWPORT - Two-line layout, hidden assignee on mobile, and horizontal scroll container', () => {
  it('TreeNode: card container uses flex-col on mobile and md:flex-row on desktop', () => {
    const item = createItem();
    render(
      <TreeNode
        item={item}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
        members={[{ id: 'm-1', name: 'Alice Engineering Lead' }]}
        onCreateChild={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    const leftZone = screen.getByTestId(`tree-node-left-zone-${item.id}`);
    const rightZone = screen.getByTestId(`tree-node-right-zone-${item.id}`);
    const parentRow = leftZone.parentElement;

    expect(parentRow).toHaveClass('flex flex-col md:flex-row md:items-center md:justify-between');
    expect(leftZone).toHaveClass('w-full md:w-auto');
    expect(rightZone).toHaveClass('w-full md:w-auto');
  });

  it('TreeNode: top row displays Level Badge, Title, and External Ref ID with full width', () => {
    const item = createItem();
    render(
      <TreeNode
        item={item}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
        members={[{ id: 'm-1', name: 'Alice Engineering Lead' }]}
      />
    );

    const leftZone = screen.getByTestId(`tree-node-left-zone-${item.id}`);

    // Level badge
    const badge = within(leftZone).getByTestId(`level-badge-${item.item_type}`);
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('story');

    // Title
    const title = within(leftZone).getByText(item.title);
    expect(title).toBeInTheDocument();
    expect(title).toHaveClass('truncate min-w-0 flex-1');

    // External Ref ID
    const refId = within(leftZone).getByText(/STORY-404/);
    expect(refId).toBeInTheDocument();
    expect(refId).toHaveClass('shrink-0');
  });

  it('TreeNode: second row hides Assignee on small viewports and displays Points, Status, and Actions', () => {
    const item = createItem();
    render(
      <TreeNode
        item={item}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
        members={[{ id: 'm-1', name: 'Alice Engineering Lead' }]}
        onCreateChild={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    // Points column is present
    const rollupCol = screen.getByTestId('col-rollup-points');
    expect(rollupCol).toBeInTheDocument();

    // Assignee column is hidden on mobile (< md) and flex on desktop (>= md)
    const assigneeCol = screen.getByTestId('col-assignee');
    expect(assigneeCol).toHaveClass('hidden');
    expect(assigneeCol).toHaveClass('md:flex');

    // Status column is present
    const statusCol = screen.getByTestId('col-status');
    expect(statusCol).toBeInTheDocument();

    // Actions column has mobile-accessible touch opacity
    const addChildBtn = screen.getByTestId(`add-child-btn-${item.id}`);
    expect(addChildBtn).toHaveClass('opacity-70');
    expect(addChildBtn).toHaveClass('md:opacity-0');

    const editBtn = screen.getByTestId(`edit-item-btn-${item.id}`);
    expect(editBtn).toHaveClass('opacity-70');
    expect(editBtn).toHaveClass('md:opacity-0');
  });

  it('page.tsx: mounts tree items inside horizontal scroll container with custom scrollbar and touch-pan-x', () => {
    const pageFiles = [
      path.resolve(__dirname, '../src/app/(dashboard)/[tenantSlug]/[projectSlug]/page.tsx'),
      path.resolve(__dirname, '../src/components/views/TreeViewContainer.tsx'),
      path.resolve(__dirname, '../src/components/views/ProjectWorkspaceView.tsx'),
    ];
    const pageContent = pageFiles
      .filter(fs.existsSync)
      .map((p) => fs.readFileSync(p, 'utf-8'))
      .join('\n');

    // Dedicated scroll container
    expect(pageContent).toContain('data-testid="tree-scroll-container"');
    expect(pageContent).toContain('overflow-x-auto custom-scrollbar pb-2 touch-pan-x');

    // Minimum width constraint to protect nested content
    expect(pageContent).toContain('min-w-[600px] md:min-w-0 w-full');

    // Assignee FilterMultiSelect in Tree View toolbar
    expect(pageContent).toContain('label="Assignee"');
    expect(pageContent).toContain('options={assigneeFilterOptions}');
    expect(pageContent).toContain('selectedIds={effectiveTreeAssignees}');
    expect(pageContent).toContain('onChange={setTreeSelectedAssignees}');

    // Main element responsive padding
    expect(pageContent).toContain('flex-1 p-3 sm:p-4 md:p-6 main-mobile-clearance');
  });
});
