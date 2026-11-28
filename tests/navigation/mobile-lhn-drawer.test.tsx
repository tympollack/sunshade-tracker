import React, { useState } from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { WorkspaceShell } from '@/components/layout/WorkspaceShell';
import { LeftHandNavTree } from '@/components/navigation/LeftHandNavTree';
import { ProjectHeader } from '@/components/board/ProjectHeader';
import type { PivotMode, TreeFilterScope } from '@/hooks/usePivotTree';
import { WorkItem } from '@/types/tracker';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => '/sunshade/all',
}));

const sampleItems: WorkItem[] = [
  {
    id: 'item-1',
    tenant_id: 'tenant-1',
    project_id: 'proj-a',
    title: 'Project A Feature',
    description: null,
    item_type: 'story',
    status: 'planned',
    parent_id: null,
    assignee: null,
    order_index: 1000,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    metadata: { sprint: 'Sprint 1' },
  },
];

const sampleProjects = [{ id: 'proj-a', slug: 'proj-a', name: 'Project A' }];

describe('Mobile LHN Drawer & ProjectHeader Safeguards', () => {
  it('retains pivotMode and activeScope with Reset control across mobile drawer close and reopen', () => {
    function Harness() {
      const [mobileOpen, setMobileOpen] = useState(false);
      const [pivotMode, setPivotMode] = useState<PivotMode>('sprint');
      const [activeScope, setActiveScope] = useState<TreeFilterScope>({});
      const [appliedProjectId, setAppliedProjectId] = useState<string | null>(null);

      return (
        <div>
          <span data-testid="applied-project">{appliedProjectId || 'none'}</span>
          <WorkspaceShell
            isMobileLeftOpen={mobileOpen}
            onToggleMobileLeft={() => setMobileOpen((p) => !p)}
            header={
              <ProjectHeader
                tenantSlug="sunshade"
                projectSlug="all"
                allWorkspaces={[]}
                allProjects={sampleProjects}
                isReadOnly={true}
                activeTab="board"
                onTabChange={vi.fn()}
                onOpenSearch={vi.fn()}
                onOpenQuickAdd={vi.fn()}
                deviations={[]}
                onOpenReconciliation={vi.fn()}
                isRefreshing={false}
                onRefresh={vi.fn()}
                items={sampleItems}
                onSelectItem={vi.fn()}
                loading={false}
                currentUser={null}
                tenantInfo={null}
                onArchiveProject={vi.fn()}
                onToggleMobileNav={() => setMobileOpen((p) => !p)}
              />
            }
            leftPane={
              <LeftHandNavTree
                items={sampleItems}
                projects={sampleProjects}
                tenantSlug="sunshade"
                currentProjectSlug="all"
                pivotMode={pivotMode}
                onPivotModeChange={setPivotMode}
                activeScope={activeScope}
                onActiveScopeChange={setActiveScope}
                onScopeFilter={(scope) => {
                  setMobileOpen(false);
                  setAppliedProjectId(scope.projectId || null);
                }}
              />
            }
            centerPane={<div>Board</div>}
          />
        </div>
      );
    }

    render(<Harness />);

    const toggle = screen.getByTestId('header-mobile-nav-toggle');
    expect(toggle).toHaveAttribute('aria-label', 'Open project navigation');
    expect(toggle.className).toContain('min-w-[36px]');
    expect(toggle.className).toContain('min-h-[36px]');

    // Open mobile drawer via header toggle
    fireEvent.click(toggle);
    const overlay = screen.getByTestId('workspace-lhn-mobile-overlay');
    expect(overlay).toBeInTheDocument();

    // Switch to Projects pivot inside mobile overlay and select Project A
    const projectsTab = within(overlay).getByRole('tab', { name: /projects/i });
    fireEvent.click(projectsTab);
    fireEvent.click(within(overlay).getByText('Project A'));

    // Drawer auto-closed and board filter applied
    expect(screen.queryByTestId('workspace-lhn-mobile-overlay')).not.toBeInTheDocument();
    expect(screen.getByTestId('applied-project')).toHaveTextContent('proj-a');

    // Reopen drawer: Projects pivot and Reset button must still be active
    fireEvent.click(toggle);
    const reopenedOverlay = screen.getByTestId('workspace-lhn-mobile-overlay');
    const reopenedProjectsTab = within(reopenedOverlay).getByRole('tab', { name: /projects/i });
    expect(reopenedProjectsTab).toHaveAttribute('aria-selected', 'true');
    expect(within(reopenedOverlay).getByText('Reset')).toBeInTheDocument();

    // Escape key dismisses mobile drawer
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('workspace-lhn-mobile-overlay')).not.toBeInTheDocument();
  });

  it('compacts Read-Only Demo badge text below sm so mobile Sign In link fits without clipping', () => {
    render(
      <ProjectHeader
        tenantSlug="sunshade"
        projectSlug="portfolio"
        allWorkspaces={[]}
        allProjects={sampleProjects}
        isReadOnly={true}
        activeTab="board"
        onTabChange={vi.fn()}
        onOpenSearch={vi.fn()}
        onOpenQuickAdd={vi.fn()}
        deviations={[]}
        onOpenReconciliation={vi.fn()}
        isRefreshing={false}
        onRefresh={vi.fn()}
        items={sampleItems}
        onSelectItem={vi.fn()}
        loading={false}
        currentUser={null}
        tenantInfo={null}
        onArchiveProject={vi.fn()}
        onToggleMobileNav={vi.fn()}
      />
    );

    const demoBadge = screen.getByTestId('header-demo-badge');
    const badgeLabel = demoBadge.querySelector('span');
    expect(badgeLabel).toHaveClass('hidden', 'sm:inline');

    const signIn = screen.getByRole('link', { name: 'Sign In' });
    expect(signIn).toHaveClass('min-h-[32px]', 'bg-emerald-700');
  });
});
