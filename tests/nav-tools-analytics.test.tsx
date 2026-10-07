import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { NavToolsDropdown } from '@/components/NavToolsDropdown';
import { ProjectHeader } from '@/components/board/ProjectHeader';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { AnalyticsHeader } from '@/components/analytics/AnalyticsHeader';

// Mock useRouter
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/sunshade/portfolio/analytics',
}));

describe('STORY-TRK-NAV-TOOLS-ANALYTICS & TASK-TRK-NAV-TOOLS-ANALYTICS-MENU', () => {
  describe('ProjectHeader: Unmounted Analytics Tab from Primary Navbar', () => {
    it('unmounts top-level Analytics link from primary tabs row and preserves Kanban, Hierarchy, Sprint, and Tools', () => {
      const onTabChange = vi.fn();
      render(
        <ProjectHeader
          tenantSlug="sunshade"
          projectSlug="portfolio"
          allWorkspaces={[]}
          allProjects={[]}
          isReadOnly={false}
          activeTab="board"
          onTabChange={onTabChange}
          onOpenSearch={vi.fn()}
          onOpenQuickAdd={vi.fn()}
          deviations={[]}
          onOpenReconciliation={vi.fn()}
          isRefreshing={false}
          onRefresh={vi.fn()}
          items={[]}
          onSelectItem={vi.fn()}
          loading={false}
          currentUser={{ email: 'test@sunshade.icu' }}
          tenantInfo={null}
          onArchiveProject={vi.fn()}
        />
      );

      // Verify header-analytics-link is completely unmounted from primary navbar tabs row
      expect(screen.queryByTestId('header-analytics-link')).not.toBeInTheDocument();

      // Top view tabs row
      const topTabs = screen.getByTestId('top-view-tabs');
      expect(topTabs).toBeInTheDocument();
      expect(topTabs).toHaveTextContent('Kanban');
      expect(topTabs).toHaveTextContent('Hierarchy Tree');
      expect(topTabs).toHaveTextContent('Sprint Planning');

      // Tools button exists in the row
      expect(screen.getByTestId('nav-tools-dropdown-trigger')).toBeInTheDocument();
    });
  });

  describe('NavToolsDropdown: Secondary Tools with Analytics & Telemetry', () => {
    it('renders Analytics & Telemetry with chart icon, subtitle, correct link, and handles selection', () => {
      const onSelectTab = vi.fn();
      render(
        <NavToolsDropdown
          activeTab="board"
          onSelectTab={onSelectTab}
          tenantSlug="sunshade"
          projectSlug="portfolio"
          analyticsHref="/sunshade/portfolio/analytics"
          pathname="/sunshade/portfolio"
        />
      );

      const trigger = screen.getByTestId('nav-tools-dropdown-trigger');
      expect(trigger).toBeInTheDocument();
      expect(screen.queryByTestId('nav-tools-dropdown-menu')).not.toBeInTheDocument();

      fireEvent.click(trigger);

      const menu = screen.getByTestId('nav-tools-dropdown-menu');
      expect(menu).toBeInTheDocument();

      // Verify all secondary tools are present
      expect(screen.getByTestId('tool-item-spark')).toBeInTheDocument();
      expect(screen.getByTestId('tool-item-schema')).toBeInTheDocument();

      // Verify Analytics & Telemetry option
      const analyticsItem = screen.getByTestId('tool-item-analytics');
      expect(analyticsItem).toBeInTheDocument();
      expect(analyticsItem).toHaveTextContent('Analytics & Telemetry');
      expect(analyticsItem).toHaveTextContent('Sprint & flow telemetry');
      expect(analyticsItem).toHaveAttribute('href', '/sunshade/portfolio/analytics');

      // Selecting closes dropdown and triggers callback
      analyticsItem.addEventListener('click', (e) => e.preventDefault(), { once: true });
      fireEvent.click(analyticsItem);
      expect(onSelectTab).toHaveBeenCalledWith('analytics');
      expect(screen.queryByTestId('nav-tools-dropdown-menu')).not.toBeInTheDocument();
    });

    it('highlights Tools button and Analytics menu item when on /analytics pathname', () => {
      render(
        <NavToolsDropdown
          activeTab="board"
          onSelectTab={vi.fn()}
          tenantSlug="sunshade"
          projectSlug="portfolio"
          analyticsHref="/sunshade/portfolio/analytics"
          pathname="/sunshade/portfolio/analytics"
        />
      );

      const trigger = screen.getByTestId('nav-tools-dropdown-trigger');
      expect(trigger.className).toContain('bg-emerald-500/20');
      expect(trigger.className).toContain('text-emerald-300');
      expect(trigger.className).toContain('border-emerald-500/40');

      // Open menu and check active highlighting on item
      fireEvent.click(trigger);
      const analyticsItem = screen.getByTestId('tool-item-analytics');
      expect(analyticsItem.className).toContain('bg-cyan-500/15');
      expect(analyticsItem.className).toContain('text-cyan-300');
    });

    it('highlights Tools button when activeTab is set to analytics', () => {
      render(
        <NavToolsDropdown
          activeTab="analytics"
          onSelectTab={vi.fn()}
          pathname="/some/path"
        />
      );

      const trigger = screen.getByTestId('nav-tools-dropdown-trigger');
      expect(trigger.className).toContain('bg-emerald-500/20');
      expect(trigger.className).toContain('text-emerald-300');
    });
  });

  describe('MobileBottomNav: Mobile Tools Drawer with Analytics & Telemetry', () => {
    it('renders Analytics & Telemetry link inside mobile tools drawer and highlights button on /analytics', () => {
      const onTabChange = vi.fn();
      render(
        <MobileBottomNav
          activeTab="board"
          onTabChange={onTabChange}
          tenantSlug="sunshade"
          projectSlug="portfolio"
          analyticsHref="/sunshade/portfolio/analytics"
          pathname="/sunshade/portfolio/analytics"
        />
      );

      // Verify tools button is highlighted and has active pill
      const toolsBtn = screen.getByTestId('mobile-nav-tools');
      expect(toolsBtn).toBeInTheDocument();
      expect(screen.getByTestId('mobile-nav-active-pill-tools')).toBeInTheDocument();

      // Open mobile tools drawer
      fireEvent.click(toolsBtn);
      const analyticsTool = screen.getByTestId('mobile-nav-tool-analytics');
      expect(analyticsTool).toBeInTheDocument();
      expect(analyticsTool).toHaveTextContent('Analytics & Telemetry');
      expect(analyticsTool).toHaveAttribute('href', '/sunshade/portfolio/analytics');

      analyticsTool.addEventListener('click', (e) => e.preventDefault(), { once: true });
      fireEvent.click(analyticsTool);
      expect(onTabChange).toHaveBeenCalledWith('analytics');
    });
  });

  describe('AnalyticsHeader: Tools Dropdown Integration', () => {
    it('renders highlighted Tools dropdown in AnalyticsHeader', () => {
      render(
        <AnalyticsHeader
          tenantSlug="sunshade"
          projectSlug="portfolio"
          sprints={[]}
          selectedSprintId=""
          onSelectSprint={vi.fn()}
          startDate="2026-10-01"
          endDate="2026-10-15"
          onChangeStartDate={vi.fn()}
          onChangeEndDate={vi.fn()}
        />
      );

      const trigger = screen.getByTestId('nav-tools-dropdown-trigger');
      expect(trigger).toBeInTheDocument();
      // On analytics page, tools button is active/highlighted
      expect(trigger.className).toContain('bg-emerald-500/20');
    });
  });
});
