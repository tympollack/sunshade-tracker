import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GitHubBadge } from '@/components/GitHubBadge';

describe('GitHubBadge component', () => {
  it('renders a clickable PR badge that opens in a new tab', () => {
    render(
      <GitHubBadge
        type="pr"
        value="https://github.com/tympollack/sunshade-tracker/pull/10"
      />
    );

    const link = screen.getByRole('link');
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe('https://github.com/tympollack/sunshade-tracker/pull/10');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(screen.getByText('#10')).toBeDefined();
  });

  it('renders a clickable commit badge with truncated 7-char hash', () => {
    render(
      <GitHubBadge
        type="commit"
        value="364ae7389a9f24b81c2f0d91"
        prUrl="https://github.com/tympollack/sunshade-tracker/pull/10"
      />
    );

    const link = screen.getByRole('link');
    expect(link).toBeDefined();
    expect(link.getAttribute('href')).toBe(
      'https://github.com/tympollack/sunshade-tracker/commit/364ae7389a9f24b81c2f0d91'
    );
    expect(link.getAttribute('target')).toBe('_blank');
    expect(screen.getByText('364ae73')).toBeDefined();
  });

  it('shows hover popover on mouse enter with copy button and external link', async () => {
    render(
      <GitHubBadge
        type="commit"
        value="364ae73"
        prUrl="https://github.com/tympollack/sunshade-tracker/pull/10"
      />
    );

    const badgeContainer = screen.getByRole('link').parentElement!;

    // Hover over badge
    await act(async () => {
      fireEvent.mouseEnter(badgeContainer);
    });

    // Popover content is displayed
    expect(screen.getByText('tympollack/sunshade-tracker')).toBeDefined();
    expect(screen.getByTitle('Copy commit SHA')).toBeDefined();
    expect(screen.getByText('View on GitHub')).toBeDefined();
  });
});
