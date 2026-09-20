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
  it('renders fixed bottom navigation shell with Board, Hierarchy, Sprint, and Tools buttons on mobile', () => {
    const handleTabChange = vi.fn();
    render(<MobileBottomNav activeTab="board" onTabChange={handleTabChange} />);

    const nav = screen.getByTestId('mobile-bottom-nav');
    expect(nav).toBeInTheDocument();
    expect(nav).toHaveClass('md:hidden');
    expect(nav).toHaveClass('fixed');
    expect(nav).toHaveClass('bottom-0');
    expect(nav).toHaveClass('z-40');
    expect(nav).toHaveClass('touch-manipulation');

    // Android/iOS safe-area elevation check via classes
    expect(nav).toHaveClass('safe-area-bottom');
    expect(nav).toHaveClass('mobile-bottom-nav');

    // Buttons
    const boardBtn = screen.getByTestId('mobile-nav-board');
    const treeBtn = screen.getByTestId('mobile-nav-tree');
    const sprintBtn = screen.getByTestId('mobile-nav-sprint');
    const toolsBtn = screen.getByTestId('mobile-nav-tools');

    expect(boardBtn).toBeInTheDocument();
    expect(treeBtn).toBeInTheDocument();
    expect(sprintBtn).toBeInTheDocument();
    expect(toolsBtn).toBeInTheDocument();

    expect(boardBtn).toHaveTextContent('Kanban');
    expect(treeBtn).toHaveTextContent('Hierarchy');
    expect(sprintBtn).toHaveTextContent('Sprint');
    expect(toolsBtn).toHaveTextContent('Tools');
  });

  it('highlights active tab dynamically and renders active indicator pill', () => {
    const handleTabChange = vi.fn();
    const { rerender } = render(<MobileBottomNav activeTab="board" onTabChange={handleTabChange} />);

    expect(screen.getByTestId('mobile-nav-active-pill-board')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-nav-active-pill-tree')).not.toBeInTheDocument();
    expect(screen.queryByTestId('mobile-nav-active-pill-tools')).not.toBeInTheDocument();

    // Rerender with 'tree'
    rerender(<MobileBottomNav activeTab="tree" onTabChange={handleTabChange} />);
    expect(screen.getByTestId('mobile-nav-active-pill-tree')).toBeInTheDocument();
    expect(screen.queryByTestId('mobile-nav-active-pill-board')).not.toBeInTheDocument();

    // Rerender with 'spark' - Tools tab should highlight
    rerender(<MobileBottomNav activeTab="spark" onTabChange={handleTabChange} />);
    expect(screen.getByTestId('mobile-nav-active-pill-tools')).toBeInTheDocument();

    // Rerender with 'schema' - Tools tab should highlight
    rerender(<MobileBottomNav activeTab="schema" onTabChange={handleTabChange} />);
    expect(screen.getByTestId('mobile-nav-active-pill-tools')).toBeInTheDocument();
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

  it('opens mobile tools menu exposing Gemini Spark and Schema Reconciliation destinations', () => {
    const handleTabChange = vi.fn();
    render(<MobileBottomNav activeTab="board" onTabChange={handleTabChange} />);

    const toolsBtn = screen.getByTestId('mobile-nav-tools');
    fireEvent.click(toolsBtn);

    const toolsMenu = screen.getByTestId('mobile-tools-menu');
    expect(toolsMenu).toBeInTheDocument();

    const sparkBtn = screen.getByTestId('mobile-nav-tool-spark');
    const schemaBtn = screen.getByTestId('mobile-nav-tool-schema');
    expect(sparkBtn).toBeInTheDocument();
    expect(sparkBtn).toHaveTextContent('JSON Ingestion');
    expect(schemaBtn).toBeInTheDocument();

    fireEvent.click(sparkBtn);
    expect(handleTabChange).toHaveBeenCalledWith('spark');
    expect(screen.queryByTestId('mobile-tools-menu')).not.toBeInTheDocument();
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

  it('WorkspaceSwitcher applies max-w-[75px] sm:max-w-[110px], truncate, shrink, min-w-0, and mobile max-w on popover', () => {
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
    expect(nameSpan).toHaveClass('max-w-[55px]');
    expect(nameSpan).toHaveClass('sm:max-w-[80px]');
    expect(nameSpan).toHaveClass('truncate');
    expect(nameSpan).toHaveClass('shrink');
    expect(nameSpan).toHaveClass('min-w-0');

    // Click trigger and verify popover width bounds
    const trigger = screen.getByRole('button');
    fireEvent.click(trigger);

    const dropdown = screen.getByTestId('workspace-switcher-dropdown');
    expect(dropdown).toHaveClass('max-w-[calc(100vw-24px)]');
  });

  it('ProjectSwitcher applies responsive max-w truncation, shrink, min-w-0, and mobile max-w on popover', () => {
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
    expect(nameSpan).toHaveClass('max-w-[50px]');
    expect(nameSpan).toHaveClass('sm:max-w-[75px]');
    expect(nameSpan).toHaveClass('truncate');
    expect(nameSpan).toHaveClass('shrink');
    expect(nameSpan).toHaveClass('min-w-0');

    const trigger = screen.getByTestId('project-switcher-trigger');
    fireEvent.click(trigger);

    const dropdown = screen.getByTestId('project-switcher-dropdown');
    expect(dropdown).toHaveClass('max-w-[calc(100vw-24px)]');
  });

  it('preserves breadcrumb label visibility permanently without scroll-dependent disappearance', () => {
    const projects = [{ id: 'p1', slug: 'cozy', name: 'Cozy Smart Home' }];
    const workspaces = [{ id: 'ws1', slug: 'pym', name: 'PYM Energy', tier: 'pro', role: 'owner', projects: [] }];

    // 1. Breadcrumb labels remain visible (no hidden class) and use min-w-0 truncate for responsive bounding
    const { unmount: unmount1 } = render(
      <ProjectSwitcher
        tenantSlug="pym"
        currentProjectSlug="cozy"
        projects={projects}
      />
    );
    const projSpan = screen.getByText('Cozy Smart Home');
    expect(projSpan).not.toHaveClass('hidden');
    expect(projSpan).toHaveClass('truncate');
    expect(projSpan).toHaveClass('min-w-0');
    unmount1();

    const { unmount: unmount2 } = render(
      <WorkspaceSwitcher
        currentTenantSlug="pym"
        workspaces={workspaces}
      />
    );
    const wsSpan = screen.getByText('PYM Energy');
    expect(wsSpan).not.toHaveClass('hidden');
    expect(wsSpan).toHaveClass('truncate');
    expect(wsSpan).toHaveClass('min-w-0');
    unmount2();

    // 2. SunShadeLogo: supports hideTextBelowLg to compact on mobile/tablet while displaying full brand on desktop
    const { rerender } = render(<SunShadeLogo variant="horizontal" size="xs" hideTextBelowLg={false} />);
    const logoTextNormal = screen.getByTestId('sunshade-logo-text');
    expect(logoTextNormal).not.toHaveClass('hidden lg:flex');

    rerender(<SunShadeLogo variant="horizontal" size="xs" hideTextBelowLg={true} />);
    const logoTextCompact = screen.getByTestId('sunshade-logo-text');
    expect(logoTextCompact).toHaveClass('hidden lg:flex');
  });
});

describe('BUG-TRK-MOBILE-FILTERBAR-SCROLL - Touch Pan Scrolling & Accessible Filter Targets', () => {
  it('FilterMultiSelect trigger button has shrink-0, whitespace-nowrap, min-h-[36px], and portaled max-w-[calc(100vw-24px)] popover', () => {
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
    const popover = screen.getByTestId('filter-multiselect-dropdown-status');
    expect(popover).toBeInTheDocument();
    expect(popover).toHaveClass('max-w-[calc(100vw-24px)]');
    expect(popover).toHaveStyle({ position: 'fixed' });
  });

  it('verifies page.tsx Board Controls Toolbar provides horizontal touch scroll with touch-pan-x and main-mobile-clearance', () => {
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
    expect(pageContent).toContain('<MobileBottomNav');
    expect(pageContent).toContain('activeTab={activeTab}');
    expect(pageContent).toContain('onTabChange={handleTabChange}');

    // Main container must apply main-mobile-clearance
    expect(pageContent).toContain('main-mobile-clearance');

    // Header must have responsive horizontal padding and mobile collapsed Add Item button
    expect(pageContent).toContain('px-2 sm:px-4');
    expect(pageContent).toContain('<span className="hidden sm:inline whitespace-nowrap">Add Item</span>');

    // globals.css must define main-mobile-clearance and mobile-bottom-nav
    const cssContent = fs.readFileSync(
      path.resolve(__dirname, '../src/app/globals.css'),
      'utf-8'
    );
    expect(cssContent).toContain('.main-mobile-clearance');
    expect(cssContent).toContain('.mobile-bottom-nav');
  });
});

describe('BUG-TRK-MOBILE-HEADER-BRAND-COLLAPSE - Reclaim Horizontal Space via Brand Collapse', () => {
  it('renders SunShadeLogo emblem across all viewports with shrink-0 min-w-0 bounding and accessible aria-label', () => {
    render(<SunShadeLogo variant="horizontal" size="xs" href="/" hideTextOnMobile={true} />);

    // Link must maintain accessible aria-label="SunShade Tracker"
    const link = screen.getByRole('link', { name: /SunShade Tracker/i });
    expect(link).toBeInTheDocument();
    expect(link).toHaveAttribute('href', '/');
    expect(link).toHaveClass('shrink-0');
    expect(link).toHaveClass('min-w-0');

    // Root logo container must have shrink-0 min-w-0
    const logoContainer = screen.getByTestId('sunshade-logo');
    expect(logoContainer).toHaveClass('shrink-0');
    expect(logoContainer).toHaveClass('min-w-0');

    // Text lockup must be hidden on mobile (<640px)
    const textLockup = screen.getByTestId('sunshade-logo-text');
    expect(textLockup).toHaveClass('hidden sm:flex');
  });

  it('preserves full text lockup and live badge on desktop viewports (>=640px)', () => {
    render(<SunShadeLogo variant="horizontal" size="sm" showBadge={true} badgeText="v1.0 Live" hideTextOnMobile={true} />);

    const textLockup = screen.getByTestId('sunshade-logo-text');
    expect(textLockup).toBeInTheDocument();
    expect(textLockup).toHaveTextContent('SunShade Tracker');
    expect(textLockup).toHaveTextContent('v1.0 Live');
    expect(textLockup).toHaveClass('hidden sm:flex');
  });

  it('verifies dashboard headers pass hideTextOnMobile and shrink-0 to SunShadeLogo', () => {
    // Check main dashboard page
    const dashboardPage = fs.readFileSync(
      path.resolve(__dirname, '../src/app/(dashboard)/[tenantSlug]/[projectSlug]/page.tsx'),
      'utf-8'
    );
    expect(dashboardPage).toContain('<SunShadeLogo variant="horizontal" size="xs" href="/" className="mr-0.5 sm:mr-1 shrink-0" hideTextOnMobile');

    // Check settings page
    const settingsPage = fs.readFileSync(
      path.resolve(__dirname, '../src/app/(dashboard)/[tenantSlug]/settings/page.tsx'),
      'utf-8'
    );
    expect(settingsPage).toContain('<SunShadeLogo variant="horizontal" size="xs" href="/" className="mr-0.5 sm:mr-1 shrink-0" hideTextOnMobile />');

    // Check efficiency page
    const efficiencyPage = fs.readFileSync(
      path.resolve(__dirname, '../src/app/(dashboard)/[tenantSlug]/settings/efficiency/page.tsx'),
      'utf-8'
    );
    expect(efficiencyPage).toContain('<SunShadeLogo variant="horizontal" size="xs" href="/" className="mr-0.5 sm:mr-1 shrink-0" hideTextOnMobile />');
  });
});

