import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
import { UserMenu } from '@/components/UserMenu';
import { NavToolsDropdown } from '@/components/NavToolsDropdown';
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
    id: 'test-item-123',
    tenant_id: 'tenant-1',
    project_id: 'proj-1',
    title: 'Super Long Engineering Epic With Excessive Characters That Would Otherwise Break Column Track Layout',
    item_type: 'story',
    status: 'in_progress',
    order_index: 10,
    depth: 0,
    external_ref_id: 'STORY-999',
    metadata: {},
    created_at: '2026-09-01T00:00:00Z',
    updated_at: '2026-09-01T00:00:00Z',
    rollupPoints: 21,
    descendantCount: 4,
    assignee: 'Alice Engineering Lead',
    ...overrides,
  };
}

describe('BUG-TRK-DROPDOWN-PORTAL-CLIP - Popover Portals & Escape from Navbar Overflow Trap', () => {
  it('WorkspaceSwitcher renders popover menu portaled directly to document.body with fixed coordinates and z-[100]', () => {
    const workspaces = [
      {
        id: 'ws-1',
        slug: 'default-ws',
        name: 'Default Workspace',
        tier: 'pro',
        role: 'owner',
        projects: [{ id: 'p1', slug: 'sunshade-tracker', name: 'Tracker' }],
      },
    ];

    render(
      <div id="navbar-overflow-trap" style={{ height: 56, overflow: 'hidden' }}>
        <WorkspaceSwitcher currentTenantSlug="default-ws" workspaces={workspaces} />
      </div>
    );

    // Initial state: menu not in document
    expect(screen.queryByTestId('workspace-switcher-dropdown')).not.toBeInTheDocument();

    // Click trigger
    const trigger = screen.getByRole('button', { name: /Default Workspace/i });
    fireEvent.click(trigger);

    // Menu should now be open
    const menu = screen.getByTestId('workspace-switcher-dropdown');
    expect(menu).toBeInTheDocument();

    // Verify it is a direct child of document.body (portal target, escaped from navbar-overflow-trap)
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveClass('z-[100]');
    expect(menu.style.position).toBe('fixed');
  });

  it('ProjectSwitcher renders popover menu portaled directly to document.body with fixed coordinates and z-[100]', () => {
    const projects = [
      { id: 'p1', slug: 'sunshade-tracker', name: 'Sunshade Tracker' },
      { id: 'p2', slug: 'sunshade-core', name: 'Sunshade Core' },
    ];

    render(
      <div id="navbar-overflow-trap" style={{ height: 56, overflow: 'hidden' }}>
        <ProjectSwitcher
          tenantSlug="default-ws"
          currentProjectSlug="sunshade-tracker"
          projects={projects}
        />
      </div>
    );

    expect(screen.queryByTestId('project-switcher-dropdown')).not.toBeInTheDocument();

    const trigger = screen.getByTestId('project-switcher-trigger');
    fireEvent.click(trigger);

    const menu = screen.getByTestId('project-switcher-dropdown');
    expect(menu).toBeInTheDocument();
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveClass('z-[100]');
    expect(menu.style.position).toBe('fixed');
  });

  it('UserMenu renders popover menu portaled directly to document.body with fixed coordinates and z-[100]', () => {
    render(
      <div id="navbar-overflow-trap" style={{ height: 56, overflow: 'hidden' }}>
        <UserMenu tenantName="Acme Corp" tenantSlug="acme" apiKeyPreview="ss_live_abc" />
      </div>
    );

    expect(screen.queryByTestId('user-menu-dropdown')).not.toBeInTheDocument();

    const trigger = screen.getByTestId('user-menu-trigger');
    fireEvent.click(trigger);

    const menu = screen.getByTestId('user-menu-dropdown');
    expect(menu).toBeInTheDocument();
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveClass('z-[100]');
    expect(menu.style.position).toBe('fixed');
  });

  it('NavToolsDropdown renders tools popover menu portaled directly to document.body with fixed coordinates and z-[100]', () => {
    const onSelectTab = vi.fn();
    render(
      <div id="navbar-overflow-trap" style={{ height: 56, overflow: 'hidden' }}>
        <NavToolsDropdown activeTab="board" onSelectTab={onSelectTab} />
      </div>
    );

    expect(screen.queryByTestId('nav-tools-dropdown-menu')).not.toBeInTheDocument();

    const trigger = screen.getByTestId('nav-tools-dropdown-trigger');
    fireEvent.click(trigger);

    const menu = screen.getByTestId('nav-tools-dropdown-menu');
    expect(menu).toBeInTheDocument();
    expect(menu.parentElement).toBe(document.body);
    expect(menu).toHaveClass('z-[100]');
    expect(menu.style.position).toBe('fixed');

    // Selecting a tool triggers callback and closes dropdown
    const sparkItem = screen.getByTestId('tool-item-spark');
    fireEvent.click(sparkItem);
    expect(onSelectTab).toHaveBeenCalledWith('spark');
    expect(screen.queryByTestId('nav-tools-dropdown-menu')).not.toBeInTheDocument();
  });
});

describe('BUG-TRK-TREE-TITLE-TRUNCATE-ALIGN - Strict Two-Zone Layout & Column Tabular Tracks', () => {
  it('TreeNode Left Zone enforces chevron w-5, type badge w-14 shrink-0 uppercase, truncate min-w-0 title, and shrink-0 ref tag', () => {
    const item = createItem({ children: [createItem({ id: 'child-1' })] });
    render(
      <TreeNode
        item={item}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
      />
    );

    // Left Zone container
    const leftZone = screen.getByTestId(`tree-node-left-zone-${item.id}`);
    expect(leftZone).toBeInTheDocument();
    expect(leftZone).toHaveClass('flex-1');
    expect(leftZone).toHaveClass('min-w-0');
    expect(leftZone).toHaveClass('overflow-hidden');

    // Chevron button
    const chevronBtn = screen.getByTestId(`collapse-toggle-${item.id}`);
    expect(chevronBtn).toHaveClass('w-5');
    expect(chevronBtn).toHaveClass('h-5');

    // Type badge
    const badge = within(leftZone).getByTestId('level-badge-story');
    expect(badge).toHaveClass('w-14');
    expect(badge).toHaveClass('shrink-0');
    expect(badge).toHaveClass('text-center');
    expect(badge).toHaveClass('uppercase');

    // Title truncation
    const titleEl = within(leftZone).getByText(item.title);
    expect(titleEl).toHaveClass('truncate');
    expect(titleEl).toHaveClass('min-w-0');
    expect(titleEl).toHaveClass('flex-1');

    // External ref tag
    const refTag = within(leftZone).getByText(new RegExp(item.external_ref_id!));
    expect(refTag).toHaveClass('font-mono');
    expect(refTag).toHaveClass('text-xs');
    expect(refTag).toHaveClass('shrink-0');
  });

  it('TreeNode Right Zone enforces shrink-0 ml-auto with tracks: w-28 rollup, w-32 assignee, w-36 status, w-14 actions', () => {
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

    const rightZone = screen.getByTestId(`tree-node-right-zone-${item.id}`);
    expect(rightZone).toBeInTheDocument();
    expect(rightZone).toHaveClass('shrink-0');
    expect(rightZone).toHaveClass('ml-auto');

    // Rollup points column
    const rollupCol = screen.getByTestId('col-rollup-points');
    expect(rollupCol).toHaveClass('w-28');
    expect(rollupCol).toHaveClass('shrink-0');
    expect(rollupCol).toHaveClass('text-right');

    // Assignee column
    const assigneeCol = screen.getByTestId('col-assignee');
    expect(assigneeCol).toHaveClass('w-32');
    expect(assigneeCol).toHaveClass('shrink-0');
    expect(assigneeCol).toHaveClass('truncate');

    // Status column
    const statusCol = screen.getByTestId('col-status');
    expect(statusCol).toHaveClass('w-36');
    expect(statusCol).toHaveClass('shrink-0');

    // Actions column
    const actionsCol = screen.getByTestId('col-actions');
    expect(actionsCol).toHaveClass('w-14');
    expect(actionsCol).toHaveClass('shrink-0');
  });

  it('TreeNode card and row containers prevent horizontal layout expansion', () => {
    const item = createItem();
    render(
      <TreeNode
        item={item}
        statuses={mockStatuses}
        hierarchy={mockHierarchy}
      />
    );

    const card = screen.getByTestId(`tree-node-card-${item.id}`);
    expect(card).toHaveClass('min-w-0');
    expect(card).toHaveClass('max-w-full');
  });
});

describe('BUG-TRK-NAV-ACTIONS-OVERFLOW - Header Tab Consolidation & Safe Right Actions Space', () => {
  it('verifies page.tsx restricts primary tabs to board, tree, sprint and encapsulates secondary tools in Tools dropdown', () => {
    const pageContent = fs.readFileSync(
      path.resolve(__dirname, '../src/app/(dashboard)/[tenantSlug]/[projectSlug]/page.tsx'),
      'utf-8'
    );

    // Primary tabs must only be board, tree, sprint
    expect(pageContent).toContain("(['board', 'tree', 'sprint'] as const).map((tab)");
    // NavToolsDropdown must be mounted for spark and schema
    expect(pageContent).toContain('<NavToolsDropdown activeTab={activeTab} onSelectTab={(tab) => handleTabChange(tab)} />');
  });

  it('verifies right header actions wrapper has ml-auto shrink-0 and Add Item button has whitespace-nowrap shrink-0', () => {
    const pageContent = fs.readFileSync(
      path.resolve(__dirname, '../src/app/(dashboard)/[tenantSlug]/[projectSlug]/page.tsx'),
      'utf-8'
    );

    // Right actions wrapper
    expect(pageContent).toContain('className="flex items-center gap-2 shrink-0 ml-auto"');
    // Add Item button whitespace-nowrap and shrink-0
    expect(pageContent).toContain('data-testid="header-add-item-btn"');
    expect(pageContent).toContain('whitespace-nowrap shrink-0');
    // Main container overflow-x-hidden
    expect(pageContent).toContain('<main className="flex-1 p-6 pb-24 md:pb-6 max-w-[1700px] mx-auto w-full max-w-full overflow-x-hidden safe-area-bottom">');
  });
});
