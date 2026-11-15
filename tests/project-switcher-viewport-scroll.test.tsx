import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';

const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
}));

describe('BUG-TRK-PROJECT-DROPDOWN-VIEWPORT-SCROLL: Constrain Project Switcher Dropdown to Viewport Height with Scroll and Quick Filter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createProjects = (count: number) =>
    Array.from({ length: count }, (_, i) => ({
      id: `p-${i + 1}`,
      slug: `project-${i + 1}`,
      name: i === 17 ? 'Makerverse Engine' : `Project ${i + 1}`,
    }));

  it('1. Viewport Height Ceiling & Internal Scroll: applies container constraint, pinned header, and scrollable container classes', () => {
    const projects = createProjects(18);

    render(
      <ProjectSwitcher
        tenantSlug="pym-energy"
        currentProjectSlug="project-1"
        projects={projects}
      />
    );

    // Open dropdown
    const trigger = screen.getByTestId('project-switcher-trigger');
    fireEvent.click(trigger);

    // Dropdown container
    const dropdown = screen.getByTestId('project-switcher-dropdown');
    expect(dropdown).toHaveClass('max-h-[calc(100dvh-6rem)]');
    expect(dropdown).toHaveClass('flex');
    expect(dropdown).toHaveClass('flex-col');
    expect(dropdown).toHaveClass('overflow-hidden');

    // Pinned section header
    const header = dropdown.firstElementChild as HTMLElement;
    expect(header).toHaveClass('shrink-0');
    expect(header).toHaveClass('sticky');
    expect(header).toHaveClass('top-0');
    expect(header).toHaveClass('z-10');
    expect(header).toHaveClass('bg-slate-950/95');
    expect(header).toHaveClass('backdrop-blur');
    expect(header).toHaveClass('border-b');
    expect(header).toHaveClass('border-slate-800/80');

    // Scrollable project list container
    const list = screen.getByTestId('project-switcher-list');
    expect(list).toHaveClass('flex-1');
    expect(list).toHaveClass('overflow-y-auto');
    expect(list).toHaveClass('overscroll-contain');
    expect(list).toHaveClass('py-1');
    expect(list).toHaveClass('custom-scrollbar');
  });

  it('2. Quick Project Filter Input: does not show search input when projects <= 8', () => {
    const projects = createProjects(8);

    render(
      <ProjectSwitcher
        tenantSlug="pym-energy"
        currentProjectSlug="project-1"
        projects={projects}
      />
    );

    fireEvent.click(screen.getByTestId('project-switcher-trigger'));
    expect(screen.queryByTestId('project-switcher-search')).not.toBeInTheDocument();
  });

  it('3. Quick Project Filter Input: shows search input when projects > 8 and narrows project list instantaneously', () => {
    const projects = createProjects(18);

    render(
      <ProjectSwitcher
        tenantSlug="pym-energy"
        currentProjectSlug="project-1"
        projects={projects}
      />
    );

    fireEvent.click(screen.getByTestId('project-switcher-trigger'));

    const searchInput = screen.getByTestId('project-switcher-search');
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveAttribute('placeholder', 'Search projects...');

    // Initially all 18 projects are rendered
    expect(screen.getByTestId('project-switcher-item-project-18')).toBeInTheDocument();
    expect(screen.getByTestId('project-switcher-item-project-1')).toBeInTheDocument();

    // Type "Makerverse" to filter
    fireEvent.change(searchInput, { target: { value: 'Makerverse' } });

    // Only Makerverse should match
    expect(screen.getByTestId('project-switcher-item-project-18')).toBeInTheDocument();
    expect(screen.queryByTestId('project-switcher-item-project-1')).not.toBeInTheDocument();
    expect(screen.queryByTestId('project-switcher-item-all')).not.toBeInTheDocument();

    // Empty state when no matches
    fireEvent.change(searchInput, { target: { value: 'non-existent-project' } });
    expect(screen.getByTestId('project-switcher-no-results')).toBeInTheDocument();
    expect(screen.getByText('No matching projects')).toBeInTheDocument();
  });

  it('4. Quick Project Filter Input: Enter key navigates to the top match', () => {
    const projects = createProjects(18);

    render(
      <ProjectSwitcher
        tenantSlug="pym-energy"
        currentProjectSlug="project-1"
        projects={projects}
      />
    );

    fireEvent.click(screen.getByTestId('project-switcher-trigger'));

    const searchInput = screen.getByTestId('project-switcher-search');
    fireEvent.change(searchInput, { target: { value: 'Makerverse' } });

    // Press Enter
    fireEvent.keyDown(searchInput, { key: 'Enter', code: 'Enter' });

    // Navigates to top match
    expect(mockPush).toHaveBeenCalledWith('/pym-energy/project-18');
    // Dropdown is closed
    expect(screen.queryByTestId('project-switcher-dropdown')).not.toBeInTheDocument();
  });

  it('5. Quick Project Filter Input: Escape key closes the dropdown', () => {
    const projects = createProjects(18);

    render(
      <ProjectSwitcher
        tenantSlug="pym-energy"
        currentProjectSlug="project-1"
        projects={projects}
      />
    );

    fireEvent.click(screen.getByTestId('project-switcher-trigger'));
    const searchInput = screen.getByTestId('project-switcher-search');

    fireEvent.keyDown(searchInput, { key: 'Escape', code: 'Escape' });
    expect(screen.queryByTestId('project-switcher-dropdown')).not.toBeInTheDocument();
  });

  it('6. Active Item Auto-Scroll: calls scrollIntoView({ block: "nearest" }) on currently active project row', async () => {
    const scrollIntoViewMock = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    const projects = createProjects(18);

    render(
      <ProjectSwitcher
        tenantSlug="pym-energy"
        currentProjectSlug="project-18"
        projects={projects}
      />
    );

    fireEvent.click(screen.getByTestId('project-switcher-trigger'));

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'nearest' });
    });
  });

  it('7. Active Item Auto-Scroll: calls scrollIntoView on All Projects option when in portfolio / all mode', async () => {
    const scrollIntoViewMock = vi.fn();
    window.HTMLElement.prototype.scrollIntoView = scrollIntoViewMock;

    const projects = createProjects(18);

    render(
      <ProjectSwitcher
        tenantSlug="pym-energy"
        currentProjectSlug="all"
        projects={projects}
      />
    );

    fireEvent.click(screen.getByTestId('project-switcher-trigger'));

    await waitFor(() => {
      expect(scrollIntoViewMock).toHaveBeenCalledWith({ block: 'nearest' });
    });
  });
});
