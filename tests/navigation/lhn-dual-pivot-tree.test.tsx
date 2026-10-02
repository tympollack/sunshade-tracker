import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LeftHandNavTree } from '@/components/navigation/LeftHandNavTree';
import { WorkItem } from '@/types/tracker';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

const mockProjects = [
  { id: 'proj-1', slug: 'cozy', name: 'Cozy' },
  { id: 'proj-2', slug: 'hub', name: 'SunShade Hub' },
];

const mockItems: WorkItem[] = [
  {
    id: 'item-1',
    tenant_id: 't-1',
    project_id: 'proj-1',
    external_ref_id: 'TASK-1',
    item_type: 'epic',
    status: 'in_progress',
    title: 'Design Three-Pane Layout',
    order_index: 1000,
    metadata: { sprint: 'Sprint 2026-Q4', story_points: 5 },
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'item-2',
    tenant_id: 't-1',
    project_id: 'proj-1',
    parent_id: 'item-1',
    external_ref_id: 'TASK-2',
    item_type: 'task',
    status: 'not_started',
    title: 'Scaffold Workspace Shell',
    order_index: 2000,
    metadata: { sprint: 'Sprint 2026-Q4', story_points: 3 },
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  },
  {
    id: 'item-3',
    tenant_id: 't-1',
    project_id: 'proj-2',
    external_ref_id: 'HUB-1',
    item_type: 'story',
    status: 'completed',
    title: 'Auth Redirection Guard',
    order_index: 3000,
    metadata: { sprint: 'Sprint 2026-Q3', story_points: 8 },
    created_at: '2026-10-01T00:00:00Z',
    updated_at: '2026-10-01T00:00:00Z',
  },
];

describe('TASK-TRK-LHN-DUAL-PIVOT-TREE: LeftHandNavTree & usePivotTree', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('renders dual-pivot segmented controls for Sprints and Projects', () => {
    render(
      <LeftHandNavTree
        items={mockItems}
        projects={mockProjects}
        tenantSlug="pym-energy"
      />
    );

    expect(screen.getByRole('tab', { name: /sprints/i })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /projects/i })).toBeInTheDocument();
  });

  it('renders Cadence Mode (Sprint > Project > Item) by default', () => {
    render(
      <LeftHandNavTree
        items={mockItems}
        projects={mockProjects}
        tenantSlug="pym-energy"
      />
    );

    // Root nodes should include Sprint 2026-Q4 and Sprint 2026-Q3
    expect(screen.getByText('Sprint 2026-Q4')).toBeInTheDocument();
    expect(screen.getByText('Sprint 2026-Q3')).toBeInTheDocument();
  });

  it('switches to Domain Mode (Project > Sprint > Item) instantaneously upon clicking Projects tab', () => {
    render(
      <LeftHandNavTree
        items={mockItems}
        projects={mockProjects}
        tenantSlug="pym-energy"
      />
    );

    const projectsTab = screen.getByRole('tab', { name: /projects/i });
    fireEvent.click(projectsTab);

    // Root nodes should now be project names
    expect(screen.getAllByText('Cozy').length).toBeGreaterThan(0);
    expect(screen.getByText('SunShade Hub')).toBeInTheDocument();
  });

  it('expands nodes and displays nested child count and point rollups', () => {
    render(
      <LeftHandNavTree
        items={mockItems}
        projects={mockProjects}
        tenantSlug="pym-energy"
      />
    );

    // In Cadence mode, expand all
    const expandAllBtn = screen.getByTitle('Expand All');
    fireEvent.click(expandAllBtn);

    // Nested project under sprints should include Cozy
    expect(screen.getAllByText('Cozy').length).toBeGreaterThan(0);
    // Nested items should be visible
    expect(screen.getByText('Design Three-Pane Layout')).toBeInTheDocument();
  });

  it('triggers onScopeFilter callback when a tree node is clicked', () => {
    const onFilter = vi.fn();
    render(
      <LeftHandNavTree
        items={mockItems}
        projects={mockProjects}
        tenantSlug="pym-energy"
        onScopeFilter={onFilter}
      />
    );

    const sprintNode = screen.getByText('Sprint 2026-Q4');
    fireEvent.click(sprintNode);

    expect(onFilter).toHaveBeenCalledWith(
      expect.objectContaining({ sprintName: 'Sprint 2026-Q4' })
    );
  });

  it('renders stacked Workspace and Project selectors at top of LHN when expanded', () => {
    const mockWorkspaces = [
      {
        id: 'ws-1',
        slug: 'pym-energy',
        name: 'PYM Energy',
        tier: 'enterprise',
      },
    ];

    render(
      <LeftHandNavTree
        items={mockItems}
        projects={mockProjects}
        tenantSlug="pym-energy"
        allWorkspaces={mockWorkspaces}
        currentProjectSlug="cozy"
        isCollapsed={false}
      />
    );

    const scopeHeader = screen.getByTestId('lhn-scope-header');
    expect(scopeHeader).toBeInTheDocument();
    expect(screen.getByText('PYM Energy')).toBeInTheDocument();
    expect(screen.getByText('Cozy')).toBeInTheDocument();
    expect(screen.getByTestId('project-switcher-trigger')).toBeInTheDocument();
  });

  it('renders collapsed icon rail with compact initial badge, single pivot toggle icon, and root icons when isCollapsed is true', () => {
    const mockWorkspaces = [
      {
        id: 'ws-1',
        slug: 'pym-energy',
        name: 'PYM Energy',
        tier: 'enterprise',
      },
    ];
    const onToggle = vi.fn();

    render(
      <LeftHandNavTree
        items={mockItems}
        projects={mockProjects}
        tenantSlug="pym-energy"
        allWorkspaces={mockWorkspaces}
        currentProjectSlug="cozy"
        isCollapsed={true}
        onToggleCollapse={onToggle}
      />
    );

    // 1. Compact initial square badge with tooltip
    const collapsedScope = screen.getByTestId('lhn-collapsed-scope');
    expect(collapsedScope).toBeInTheDocument();
    const badge = screen.getByTestId('lhn-collapsed-workspace-badge');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveTextContent('PE');
    expect(badge.getAttribute('title')).toBe('PYM Energy / Cozy');

    fireEvent.click(badge);
    expect(onToggle).toHaveBeenCalledTimes(1);

    // 2. Single centered pivot toggle button with tooltip
    const pivotToggle = screen.getByTestId('lhn-collapsed-pivot-toggle');
    expect(pivotToggle).toBeInTheDocument();
    expect(pivotToggle.getAttribute('title')).toBe('Pivot: Sprints (Click to switch)');

    // Toggle pivot mode from sprint to project
    fireEvent.click(pivotToggle);
    expect(pivotToggle.getAttribute('title')).toBe('Pivot: Projects (Click to switch)');

    // 3. Collapsed root icon rail
    const rail = screen.getByTestId('lhn-collapsed-rail');
    expect(rail).toBeInTheDocument();

    // Verify text labels and tabs are hidden
    expect(screen.queryByRole('tab', { name: /sprints/i })).not.toBeInTheDocument();
    expect(screen.queryByText('Hierarchy Pivot')).not.toBeInTheDocument();
    expect(screen.queryByText('Expand')).not.toBeInTheDocument();
  });

  it('correctly names overview routes in collapsed badge tooltip', () => {
    const mockWorkspaces = [
      { id: 'ws-1', slug: 'pym-energy', name: 'PYM Energy', tier: 'enterprise' },
    ];

    const { rerender } = render(
      <LeftHandNavTree
        items={mockItems}
        projects={mockProjects}
        tenantSlug="pym-energy"
        allWorkspaces={mockWorkspaces}
        currentProjectSlug="portfolio"
        isCollapsed={true}
      />
    );

    const badge = screen.getByTestId('lhn-collapsed-workspace-badge');
    expect(badge.getAttribute('title')).toBe('PYM Energy / Portfolio Overview');

    rerender(
      <LeftHandNavTree
        items={mockItems}
        projects={mockProjects}
        tenantSlug="pym-energy"
        allWorkspaces={mockWorkspaces}
        currentProjectSlug="all"
        isCollapsed={true}
      />
    );

    expect(badge.getAttribute('title')).toBe('PYM Energy / All Projects');
  });

  it('highlights collapsed project roots upon selection and displays childCount', () => {
    const onFilter = vi.fn();
    render(
      <LeftHandNavTree
        items={mockItems}
        projects={mockProjects}
        tenantSlug="pym-energy"
        isCollapsed={true}
        onScopeFilter={onFilter}
      />
    );

    // Switch to project mode
    const pivotToggle = screen.getByTestId('lhn-collapsed-pivot-toggle');
    fireEvent.click(pivotToggle);

    // Root project buttons: Cozy and SunShade Hub
    const cozyRootBtn = screen.getByTestId('lhn-collapsed-root-project:proj-1');
    expect(cozyRootBtn).toBeInTheDocument();
    // Verify tooltip contains childCount (2 work items under Cozy: TASK-1, TASK-2)
    expect(cozyRootBtn.getAttribute('title')).toContain('Cozy (2 items)');

    // Click to select
    fireEvent.click(cozyRootBtn);
    expect(onFilter).toHaveBeenCalledWith(
      expect.objectContaining({ projectSlug: 'cozy' })
    );

    // Check highlighted classes
    expect(cozyRootBtn.className).toContain('text-emerald-400');
    expect(cozyRootBtn.className).toContain('border-emerald-500/40');
  });
});
