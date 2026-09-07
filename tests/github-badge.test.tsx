import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { GitHubBadge } from '@/components/GitHubBadge';

describe('GitHubBadge component', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

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

  it('correctly derives non-default repository context from prUrl for commit badges', () => {
    render(
      <GitHubBadge
        type="commit"
        value="a1b2c3d4e5f6"
        prUrl="https://github.com/acme-corp/quantum-engine/pull/99"
      />
    );

    const link = screen.getByRole('link');
    expect(link.getAttribute('href')).toBe(
      'https://github.com/acme-corp/quantum-engine/commit/a1b2c3d4e5f6'
    );
    expect(screen.getByText('a1b2c3d')).toBeDefined();
  });

  it('renders popover through a portal into document.body on hover without clipping', async () => {
    render(
      <div style={{ overflow: 'hidden', height: '50px' }}>
        <GitHubBadge
          type="commit"
          value="364ae73"
          prUrl="https://github.com/tympollack/sunshade-tracker/pull/10"
        />
      </div>
    );

    const badgeContainer = screen.getByRole('link').parentElement!;

    // Hover over badge
    await act(async () => {
      fireEvent.mouseEnter(badgeContainer);
    });

    // Popover content is appended directly to document.body outside overflow container
    const popover = document.body.querySelector('.fixed.z-\\[9999\\]');
    expect(popover).not.toBeNull();
    expect(screen.getByText('tympollack/sunshade-tracker')).toBeDefined();
    expect(screen.getByTitle('Copy commit SHA')).toBeDefined();
    expect(screen.getByText('View on GitHub')).toBeDefined();
  });

  it('deduplicates simultaneous PR stats requests and updates with live stats', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch').mockImplementation(() =>
      Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            title: 'Fix edge case in quantum routing',
            state: 'open',
            merged_at: null,
            additions: 42,
            deletions: 7,
            user: { login: 'octocat', avatar_url: 'https://github.com/octocat.png' },
            comments: 3,
          }),
      } as any)
    );

    render(
      <div>
        <GitHubBadge
          type="pr"
          value="https://github.com/test-org/test-repo/pull/77"
        />
        <GitHubBadge
          type="pr"
          value="https://github.com/test-org/test-repo/pull/77"
        />
      </div>
    );

    const links = screen.getAllByRole('link');
    const badge1 = links[0].parentElement!;
    const badge2 = links[1].parentElement!;

    await act(async () => {
      fireEvent.mouseEnter(badge1);
      fireEvent.mouseEnter(badge2);
    });

    // Both badges share the in-flight request, resulting in only 1 fetch call
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(screen.getAllByText(/Fix edge case in quantum routing/).length).toBeGreaterThan(0);
    expect(screen.getAllByText('+42').length).toBeGreaterThan(0);
    expect(screen.getAllByText('-7').length).toBeGreaterThan(0);
  });
});
