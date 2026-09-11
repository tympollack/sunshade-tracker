import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { useTabUrlSync, DashboardTab } from '@/components/rev_trk_02';

function TestTabComponent({
  initialTab,
  onTabChange,
}: {
  initialTab?: string | null;
  onTabChange?: (tab: DashboardTab) => void;
}) {
  const { activeTab, handleTabChange } = useTabUrlSync({
    initialTab,
    onTabChange,
  });

  return (
    <div>
      <div data-testid="current-tab">{activeTab}</div>
      <button onClick={() => handleTabChange('tree')}>Switch to Tree</button>
      <button onClick={() => handleTabChange('sprint')}>Switch to Sprint</button>
      <button onClick={() => handleTabChange('board')}>Switch to Board</button>
    </div>
  );
}

describe('useTabUrlSync (REV-TRK-02)', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    vi.restoreAllMocks();
    delete (window as any).location;
    window.location = new URL('http://localhost:3000/sunshade/portfolio') as any;
  });

  afterEach(() => {
    (window as any).location = originalLocation;
  });


  it('defaults to board tab when no initialTab or searchParam exists', () => {
    render(<TestTabComponent />);
    expect(screen.getByTestId('current-tab').textContent).toBe('board');
  });

  it('initializes from initialTab prop correctly', () => {
    render(<TestTabComponent initialTab="sprint" />);
    expect(screen.getByTestId('current-tab').textContent).toBe('sprint');
  });

  it('falls back to default board when initialTab is invalid', () => {
    render(<TestTabComponent initialTab="invalid_tab_name" />);
    expect(screen.getByTestId('current-tab').textContent).toBe('board');
  });

  it('updates tab state and calls window.history.pushState on tab change', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    render(<TestTabComponent />);

    fireEvent.click(screen.getByText('Switch to Tree'));

    expect(screen.getByTestId('current-tab').textContent).toBe('tree');
    expect(pushStateSpy).toHaveBeenCalledWith(
      { tab: 'tree' },
      '',
      expect.stringContaining('tab=tree')
    );
  });

  it('removes tab query parameter when switching back to board', () => {
    const pushStateSpy = vi.spyOn(window.history, 'pushState');
    render(<TestTabComponent initialTab="sprint" />);

    fireEvent.click(screen.getByText('Switch to Board'));

    expect(screen.getByTestId('current-tab').textContent).toBe('board');
    expect(pushStateSpy).toHaveBeenCalledWith(
      { tab: 'board' },
      '',
      '/sunshade/portfolio'
    );
  });

  it('synchronizes activeTab on window popstate event (browser back/forward button)', () => {
    render(<TestTabComponent initialTab="board" />);
    expect(screen.getByTestId('current-tab').textContent).toBe('board');

    // Simulate browser navigation to ?tab=sprint
    act(() => {
      window.location = new URL('http://localhost:3000/sunshade/portfolio?tab=sprint') as any;
      window.dispatchEvent(new PopStateEvent('popstate', { state: { tab: 'sprint' } }));
    });

    expect(screen.getByTestId('current-tab').textContent).toBe('sprint');

    // Simulate browser back button to root (no tab param -> board)
    act(() => {
      window.location = new URL('http://localhost:3000/sunshade/portfolio') as any;
      window.dispatchEvent(new PopStateEvent('popstate', { state: {} }));
    });

    expect(screen.getByTestId('current-tab').textContent).toBe('board');
  });

  it('reacts to external prop changes', () => {
    const { rerender } = render(<TestTabComponent initialTab="board" />);
    expect(screen.getByTestId('current-tab').textContent).toBe('board');

    rerender(<TestTabComponent initialTab="tree" />);
    expect(screen.getByTestId('current-tab').textContent).toBe('tree');
  });
});
