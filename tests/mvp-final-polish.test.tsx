import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { TreeNode } from '@/components/TreeNode';
import { SprintItemRow } from '@/components/SprintItemRow';
import { WorkItemNode, HierarchyLevel, StatusDefinition } from '@/types/tracker';
import fs from 'fs';
import path from 'path';

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
    id: 'item-1',
    tenant_id: 't-1',
    project_id: 'p-1',
    title: 'Test Work Item Title That Is Very Long To Verify Layout Truncation Behavior',
    item_type: 'story',
    status: 'in_progress',
    order_index: 10,
    depth: 0,
    metadata: {},
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    rollupPoints: 8,
    descendantCount: 2,
    assignee: 'Alice',
    ...overrides,
  };
}

describe('PRJ-05 - Loading Guard & Sprint View Status Color-Coding', () => {
  it('SprintItemRow applies color-coded styling to status select based on status color', () => {
    const item = createItem({ status: 'done' });
    const getItemStatuses = () => mockStatuses;
    const getItemHierarchy = () => mockHierarchy;

    render(
      <SprintItemRow
        item={item}
        depth={0}
        isSelected={false}
        onToggleSelect={vi.fn()}
        isImmutable={false}
        onEditItem={vi.fn()}
        getItemStatuses={getItemStatuses}
        getItemHierarchy={getItemHierarchy}
        onUpdateStatus={vi.fn()}
      />
    );

    const statusSelect = screen.getByTestId(`sprint-status-select-${item.id}`);
    expect(statusSelect).toBeInTheDocument();
    // Done status has color #10b981
    expect(statusSelect).toHaveStyle({
      color: '#10b981',
      backgroundColor: 'rgba(16, 185, 129, 0.125)',
      border: '1px solid #10b98140',
    });
  });

  it('SprintItemRow updates color styling dynamically when item has in_progress status', () => {
    const item = createItem({ status: 'in_progress' });
    const getItemStatuses = () => mockStatuses;
    const getItemHierarchy = () => mockHierarchy;

    render(
      <SprintItemRow
        item={item}
        depth={0}
        isSelected={false}
        onToggleSelect={vi.fn()}
        isImmutable={false}
        onEditItem={vi.fn()}
        getItemStatuses={getItemStatuses}
        getItemHierarchy={getItemHierarchy}
        onUpdateStatus={vi.fn()}
      />
    );

    const statusSelect = screen.getByTestId(`sprint-status-select-${item.id}`);
    expect(statusSelect).toHaveStyle({
      color: '#3b82f6',
      backgroundColor: 'rgba(59, 130, 246, 0.125)',
      border: '1px solid #3b82f640',
    });
  });
});

describe('BUG-TRK-DND-LAYOUT-STABILITY - Zero-Height Absolute Insertion Rails & Safe Geometries', () => {
  it('renders zero-height absolute drop rails with pointer-events-none above and below', () => {
    const item = createItem({ depth: 1 });
    render(
      <TreeNode
        item={item}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
      />
    );

    const card = screen.getByTestId(`tree-node-card-${item.id}`);
    Object.defineProperty(card, 'getBoundingClientRect', {
      value: () => ({
        top: 100,
        bottom: 200,
        left: 0,
        right: 800,
        width: 800,
        height: 100,
      }),
      configurable: true,
    });

    // Top threshold corridor -> dropPosition = before
    const dragBefore = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(dragBefore, 'clientY', { value: 110 });
    fireEvent(card, dragBefore);

    const indicatorBefore = screen.getByTestId('drop-indicator-before');
    expect(indicatorBefore).toBeInTheDocument();
    expect(indicatorBefore).toHaveClass('absolute');
    expect(indicatorBefore).toHaveClass('-top-0.5');
    expect(indicatorBefore).toHaveClass('h-0.5');
    expect(indicatorBefore).toHaveClass('pointer-events-none');
    expect(indicatorBefore).toHaveClass('z-30');

    // Bottom threshold corridor -> dropPosition = after
    const dragAfter = new Event('dragover', { bubbles: true, cancelable: true });
    Object.defineProperty(dragAfter, 'clientY', { value: 195 });
    fireEvent(card, dragAfter);

    const indicatorAfter = screen.getByTestId('drop-indicator-after');
    expect(indicatorAfter).toBeInTheDocument();
    expect(indicatorAfter).toHaveClass('absolute');
    expect(indicatorAfter).toHaveClass('-bottom-0.5');
    expect(indicatorAfter).toHaveClass('h-0.5');
    expect(indicatorAfter).toHaveClass('pointer-events-none');
    expect(indicatorAfter).toHaveClass('z-30');
  });

  it('tree branch connectors have pointer-events-none to prevent drag event interference', () => {
    const item = createItem({ depth: 1 });
    render(
      <TreeNode
        item={item}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
      />
    );

    const connector = screen.getByTestId('branch-connector');
    expect(connector).toBeInTheDocument();
    expect(connector).toHaveClass('pointer-events-none');
  });

  it('applies stable muted placeholder classes when isDraggingItemId matches node', () => {
    const item = createItem({ id: 'dragged-item' });
    render(
      <TreeNode
        item={item}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
        isDraggingItemId="dragged-item"
      />
    );

    const card = screen.getByTestId('tree-node-card-dragged-item');
    expect(card).toHaveClass('opacity-30');
    expect(card).toHaveClass('border-dashed');
    expect(card).toHaveClass('border-slate-700');
  });
});

describe('BUG-TRK-TOPNAV-HEIGHT-LOCK - Rigid 56px Header & View Tabs Scrollbar Protection', () => {
  it('enforces 56px locked height, flex-nowrap, and overflow-hidden on dashboard header', () => {
    const pageContent = fs.readFileSync(
      path.resolve(__dirname, '../src/app/(dashboard)/[tenantSlug]/[projectSlug]/page.tsx'),
      'utf-8'
    );
    // Header must lock height to 56px / h-14 with min/max bounds and overflow-hidden
    expect(pageContent).toContain('h-14 min-h-[56px] max-h-[56px] shrink-0 w-full flex items-center justify-between px-4 overflow-hidden');
    // Tab bar must have horizontal scroll wrapper with no-scrollbar
    expect(pageContent).toContain('overflow-x-auto no-scrollbar shrink-0');
  });

  it('configures scrollbar-gutter stable and no-scrollbar utilities in globals.css', () => {
    const cssContent = fs.readFileSync(
      path.resolve(__dirname, '../src/app/globals.css'),
      'utf-8'
    );
    expect(cssContent).toContain('scrollbar-gutter: stable;');
    expect(cssContent).toContain('.no-scrollbar::-webkit-scrollbar');
  });
});

describe('BUG-TRK-TREE-TABLE-ALIGNMENT - Tabular Tracks & Title Truncation', () => {
  it('renders dual-section layout with fixed-width column tracks for rollup, assignee, status, and actions', () => {
    const item = createItem();
    render(
      <TreeNode
        item={item}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
        members={[{ id: 'm-1', name: 'Alice' }]}
        onCreateChild={vi.fn()}
        onEditItem={vi.fn()}
      />
    );

    // Rollup column track
    const rollupCol = screen.getByTestId('col-rollup-points');
    expect(rollupCol).toBeInTheDocument();
    expect(rollupCol).toHaveClass('w-24');
    expect(rollupCol).toHaveClass('shrink-0');

    // Assignee column track
    const assigneeCol = screen.getByTestId('col-assignee');
    expect(assigneeCol).toBeInTheDocument();
    expect(assigneeCol).toHaveClass('w-32');
    expect(assigneeCol).toHaveClass('shrink-0');

    // Status column track
    const statusCol = screen.getByTestId('col-status');
    expect(statusCol).toBeInTheDocument();
    expect(statusCol).toHaveClass('w-36');
    expect(statusCol).toHaveClass('shrink-0');

    // Actions column track
    const actionsCol = screen.getByTestId('col-actions');
    expect(actionsCol).toBeInTheDocument();
    expect(actionsCol).toHaveClass('w-14');
    expect(actionsCol).toHaveClass('shrink-0');
  });

  it('truncates title without overflowing or displacing attribute columns', () => {
    const item = createItem();
    render(
      <TreeNode
        item={item}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
      />
    );

    const titleEl = screen.getByText(item.title);
    expect(titleEl).toBeInTheDocument();
    expect(titleEl).toHaveClass('truncate');
    expect(titleEl).toHaveClass('min-w-0');
    expect(titleEl).toHaveClass('flex-shrink');
    expect(titleEl).toHaveClass('flex-1');
  });
});
