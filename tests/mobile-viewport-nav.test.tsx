import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { SunShadeLogo } from '@/components/SunShadeLogo';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
import { FilterMultiSelect } from '@/components/FilterMultiSelect';
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

describe('BUG-TRK-MOBILE-VIEW-SWITCHER - Mobile Bottom Navigation Shell & Android/iOS System Safety', () => {
  it('renders fixed bottom navigation shell with Board, Hierarchy, and Sprint buttons on mobile', () => {
    const handleTabChange = vi.fn();
    render(<MobileBottomNav activeTab="board" onTabChange={handleTabChange} />);

    const nav = screen.getByTestId('mobile-bottom-nav');
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveClass('md:hidden');
    expect(nav).toHaveClass('fixed');
    expect(nav).toHaveClass('bottom-0');
    expect(nav).toHaveClass('z-40');
    expect(nav).toHaveClass('touch-manipulation');

    // Android/iOS safe-area elevation check
    expect(nav).toHaveClass('safe-area-bottom');

    // Buttons
    const boardBtn = screen.getByTestId('mobile-nav-board');
    const treeBtn = screen.getByTestId('mobile-nav-tree');
    const sprintBtn = screen.getByTestId('mobile-nav-sprint');

    expect(boardBtn).toBeInTheDocument();
    expect(treeBtn).toBeInTheDocument();
    expect(sprintBtn).toBeInTheDocument();

    expect(boardBtn).toHaveTextContent('Board');
    expect(treeBtn).toHaveTextContent('Hierarchy');
    expect(sprintBtn).toHaveTextContent('Sprint');
  });

  it('highlights active tab dynamically and renders active indicator pill', () => {
    const handleTabChange = vi.fn();
    const { rerender } = render(<MobileBottomNav activeTab="board" onTabChange={handleTabChange} />);

    expect(screen.getByTestId('mobile-nav-active-pill-board')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-nav-active-pill-tree')).not.toBeInTheDocument();

    // Rerender with 'tree'
    rerender(<MobileBottomNav activeTab="tree" onTabChange={handleTabChange} />);
    expect(screen.getByTestId('mobile-nav-active-pill-tree')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-nav-active-pill-board')).not.toBeInTheDocument();
  });

  it('dispatches onTabChange callback on button taps with minimum 44px touch targets', () => {
    const handleTabChange = vi.fn();
    render(<MobileBottomNav activeTab="board" onTabChange={handleTabChange} />);

    const treeBtn = screen.getByTestId('mobile-nav-tree');
    expect(treeBtn).toHaveClass('min-h-[44px]');

    fireEvent.click(treeBtn);
    expect(handleTabChange).toHaveBeenCalledWith('tree');

    const sprintBtn = screen.getByTestId('mobile-nav-sprint');
    fireEvent.click(sprintBtn);
    expect(handleTabChange).toHaveBeenCalledWith('sprint');
  });
});

describe('BUG-TRK-MOBILE-BREADCRUMB-CLIPPING - Responsive Header, Logo Collapse & Breadcrumb Truncation', () => {
  it('SunShadeLogo collapses typography on mobile when hideTextOnMobile is enabled', () => {
    const { rerender } = render(<SunShadeLogo variant="horizontal" size="xs" hideTextOnMobile={false} />);
    const textNormal = screen.getByTestId('sunshade-logo-text');
    expect(textNormal).not.toHaveClass('hidden sm:flex');

    rerender(<SunShadeLogo variant="horizontal" size="xs" hideTextOnMobile={true} />);
    const textCollapsed = screen.getByTestId('sunshade-logo-text');
    expect(textCollapsed).toHaveClass('hidden sm:flex');
  });

  it('WorkspaceSwitcher applies max-w-[110px], truncate, shrink, min-w-0, and mobile max-w on popover', () => {
    const workspaces = [
      {
        id: 'ws-1',
        slug: 'pym-energy',
        name: 'PYM Energy Solutions Incorporated',
        tier: 'enterprise',
        role: 'owner',
        projects: [{ id: 'p1', slug: 'cozy', name: 'Cozy Project' }],
      },
    ];

    render(<WorkspaceSwitcher currentTenantSlug="pym-energy" workspaces={workspaces} />);

    const nameSpan = screen.getByText('PYM Energy Solutions Incorporated');
    expect(nameSpan).toHaveClass('max-w-[110px]');
    expect(nameSpan).toHaveClass('truncate');
    expect(nameSpan).toHaveClass('shrink');
    expect(nameSpan).toHaveClass('min-w-0');

    // Click trigger and verify popover width bounds
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    const dropdown = screen.getByTestId('workspace-switcher-dropdown');
    expect(dropdown).toHaveClass('max-w-[calc(100vw-24px)]');
  });

  it('ProjectSwitcher applies max-w-[100px], truncate, shrink, min-w-0, and mobile max-w on popover', () => {
    const projects = [
      { id: 'p1', slug: 'cozy-project-name', name: 'Cozy Smart Home System Operations' },
    ];

    render(
      <ProjectSwitcher
        tenantSlug="pym-energy"
        currentProjectSlug="cozy-project-name"
        projects={projects}
      />
    );

    const nameSpan = screen.getByText('Cozy Smart Home System Operations');
    expect(nameSpan).toHaveClass('max-w-[100px]');
    expect(nameSpan).toHaveClass('truncate');
    expect(nameSpan).toHaveClass('shrink');
    expect(nameSpan).toHaveClass('min-w-0');

    const trigger = screen.getByTestId('project-switcher-trigger');
    fireEvent.click(trigger);

    const dropdown = screen.getByTestId('project-switcher-dropdown');
    expect(dropdown).toHaveClass('max-w-[calc(100vw-24px)]');
  });
});

describe('BUG-TRK-MOBILE-FILTERBAR-SCROLL - Touch Pan Scrolling & Accessible Filter Targets', () => {
  it('FilterMultiSelect trigger button has shrink-0, whitespace-nowrap, min-h-[36px], and max-w-[calc(100vw-24px)] popover', () => {
    const options = [
      { id: 'todo', label: 'To Do' },
      { id: 'done', label: 'Done' },
    ];

    render(
      <FilterMultiSelect
        label="Status"
        options={options}
        selectedIds={['todo', 'done']}
        onChange={vi.fn()}
      />
    );

    const button = screen.getByRole('button');
    expect(button).toHaveClass('shrink-0');
    expect(button).toHaveClass('whitespace-nowrap');
    expect(button).toHaveClass('min-h-[36px]');

    fireEvent.click(button);
    const popover = screen.getByText('Filter by Status').closest('div[class*="absolute"]');
    expect(popover).toHaveClass('max-w-[calc(100vw-24px)]');
  });

  it('verifies page.tsx Board Controls Toolbar provides horizontal touch scroll with touch-pan-x and safe bottom area', () => {
    const pageContent = fs.readFileSync(
      path.resolve(__dirname, '../src/app/(dashboard)/[tenantSlug]/[projectSlug]/page.tsx'),
      'utf-8'
    );

    // Toolbar must have touch-pan-x, overflow-x-auto, no-scrollbar, -mx-4 px-4
    expect(pageContent).toContain('data-testid="board-filter-toolbar"');
    expect(pageContent).toContain('overflow-x-auto no-scrollbar w-full py-1 -mx-4 px-4 touch-pan-x');

    // Desktop view tabs must be hidden on mobile
    expect(pageContent).toContain('className="hidden md:flex items-center gap-1 bg-slate-900 border border-slate-800');

    // MobileBottomNav must be mounted
    expect(pageContent).toContain('<MobileBottomNav activeTab={activeTab} onTabChange={handleTabChange} />');

    // Main container must apply safe area bottom padding
    expect(pageContent).toContain('pb-24 md:pb-6');
    expect(pageContent).toContain('safe-area-bottom');
  });
});
