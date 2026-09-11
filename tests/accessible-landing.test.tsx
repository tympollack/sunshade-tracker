import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import LandingPage from '@/app/page';
import DocsPage from '@/app/docs/page';

describe('STORY-TRK-ACCESSIBLE-LANDING Test Suite', () => {
  describe('TASK-TRK-LANDING-UI-COPY: LandingPage', () => {
    it('renders announcement pill with everyday teams copy', () => {
      render(<LandingPage />);
      expect(
        screen.getByText('Connected tracking for everyday teams and automated tools.')
      ).toBeDefined();
    });

    it('renders Peplink-style headline and subhead without dense jargon', () => {
      render(<LandingPage />);
      // Headline check
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading.textContent).toContain('Simple, flexible project tracking for');
      expect(heading.textContent).toContain('SunShade');

      // Subhead check
      expect(
        screen.getByText(
          'Organize tasks, align your team, and track progress across every initiative in real time. Work the way your project demands without rigid setups or complex maintenance.'
        )
      ).toBeDefined();
    });

    it('renders primary and secondary CTAs with correct destinations', () => {
      render(<LandingPage />);

      // Primary CTA
      const workspacesLink = screen.getByRole('link', { name: /Open Workspaces/i });
      expect(workspacesLink).toBeDefined();
      expect(workspacesLink.getAttribute('href')).toBe('/workspaces');

      // Secondary CTA
      const docsLink = screen.getByRole('link', { name: /View Documentation/i });
      expect(docsLink).toBeDefined();
      expect(docsLink.getAttribute('href')).toBe('/docs');
    });

    it('renders the 3 plain-language feature cards with exact copy', () => {
      render(<LandingPage />);

      // Card 1: Custom Workflows
      expect(screen.getByRole('heading', { level: 3, name: 'Custom Workflows' })).toBeDefined();
      expect(
        screen.getByText(
          'Every project runs differently. Set your own statuses, tags, and milestones without waiting on database changes or technical setups.'
        )
      ).toBeDefined();

      // Card 2: Automated Task Ingestion
      expect(screen.getByRole('heading', { level: 3, name: 'Automated Task Ingestion' })).toBeDefined();
      expect(
        screen.getByText(
          'Tasks flow directly into your board from chats, design reviews, and automated tools. Keep your roadmaps current without manual data entry.'
        )
      ).toBeDefined();

      // Card 3: Frictionless Prioritization
      expect(screen.getByRole('heading', { level: 3, name: 'Frictionless Prioritization' })).toBeDefined();
      expect(
        screen.getByText(
          'Drag, reorder, and adjust your priorities instantly. Boards update in real time across the entire team without sync delays or page refreshes.'
        )
      ).toBeDefined();
    });

    it('renders navigation and footer links pointing to docs and workspaces', () => {
      const { container } = render(<LandingPage />);
      const navLinks = Array.from(container.querySelectorAll('a')).map((a) => a.getAttribute('href'));
      expect(navLinks).toContain('/docs');
      expect(navLinks).toContain('/workspaces');
      expect(navLinks).toContain('/sunshade/portfolio');
    });
  });

  describe('TASK-TRK-DOCS-PORTAL-SCAFFOLD: DocsPage', () => {
    it('renders header, navigation links, and document title', () => {
      render(<DocsPage />);
      expect(
        screen.getByRole('heading', { level: 1, name: 'SunShade Tracker User Guide' })
      ).toBeDefined();

      const homeLinks = screen.getAllByRole('link', { name: /Home/i });
      expect(homeLinks.some((l) => l.getAttribute('href') === '/')).toBe(true);

      const signinLink = screen.getByRole('link', { name: /Sign In/i });
      expect(signinLink.getAttribute('href')).toBe('/login');
    });

    it('renders all 5 structured sections with plain-language explanations', () => {
      render(<DocsPage />);

      // Section 1: Overview
      expect(screen.getByRole('heading', { level: 2, name: /1\. Overview/i })).toBeDefined();

      // Section 2: Workspaces and Projects
      expect(screen.getByRole('heading', { level: 2, name: /2\. Workspaces and Projects/i })).toBeDefined();

      // Section 3: Kanban, Hierarchy, and Sprint Planning
      expect(screen.getByRole('heading', { level: 2, name: /3\. Kanban, Hierarchy, and Sprint Planning/i })).toBeDefined();

      // Section 4: Automated Task Ingestion
      expect(screen.getByRole('heading', { level: 2, name: /4\. Automated Task Ingestion/i })).toBeDefined();

      // Section 5: Quick Reference
      expect(screen.getByRole('heading', { level: 2, name: /5\. Quick Reference/i })).toBeDefined();
    });

    it('renders default status and hierarchy quick reference tables', () => {
      render(<DocsPage />);

      // Statuses
      expect(screen.getByText('backlog')).toBeDefined();
      expect(screen.getByText('in_progress')).toBeDefined();
      expect(screen.getByText('in_review')).toBeDefined();
      expect(screen.getByText('blocked')).toBeDefined();

      // Hierarchy Levels
      expect(screen.getAllByText('Epic').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Story').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Task').length).toBeGreaterThan(0);
      expect(screen.getAllByText('Bug').length).toBeGreaterThan(0);
    });
  });
});
