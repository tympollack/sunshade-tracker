import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, act, renderHook } from '@testing-library/react';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
import { useTabUrlSync } from '@/components/rev_trk_02';
import * as ProjectDataContextModule from '@/context/ProjectDataContext';

const mockProjects = [
  { id: 'proj-1', slug: 'core-api', name: 'Core API' },
  { id: 'proj-2', slug: 'web-ui', name: 'Web UI' },
];

const mockPrefetch = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    prefetch: mockPrefetch,
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

describe('TASK-TRK-SWITCHER-PREFETCH-SHALLOW-TABS: Hover Prefetching & Shallow URL Sync', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    mockPrefetch.mockClear();
    vi.spyOn(ProjectDataContextModule, 'prefetchProjectData').mockImplementation(async () => {});
    vi.spyOn(window.history, 'replaceState');
    vi.spyOn(window.history, 'pushState');
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  describe('1. Hover Prefetching in ProjectSwitcher', () => {
    it('triggers router.prefetch and prefetchProjectData after 75ms debounce', async () => {
      render(
        <ProjectSwitcher
          tenantSlug="test-org"
          currentProjectSlug="core-api"
          projects={mockProjects}
        />
      );

      // Open the dropdown
      const trigger = screen.getByRole('button');
      fireEvent.click(trigger);

      const targetOption = screen.getByTestId('project-switcher-item-web-ui');
      expect(targetOption).toBeDefined();

      // Mouse enter initiates 75ms debounce
      fireEvent.mouseEnter(targetOption);
      expect(mockPrefetch).not.toHaveBeenCalled();
      expect(ProjectDataContextModule.prefetchProjectData).not.toHaveBeenCalled();

      // Advance by 50ms - still shouldn't fire
      act(() => {
        vi.advanceTimersByTime(50);
      });
      expect(mockPrefetch).not.toHaveBeenCalled();

      // Advance another 30ms (total 80ms >= 75ms)
      act(() => {
        vi.advanceTimersByTime(30);
      });

      expect(mockPrefetch).toHaveBeenCalledWith('/test-org/web-ui');
      expect(ProjectDataContextModule.prefetchProjectData).toHaveBeenCalledWith('proj-2', 'test-org');
    });

    it('cancels prefetching if mouse leaves before 75ms', () => {
      render(
        <ProjectSwitcher
          tenantSlug="test-org"
          currentProjectSlug="core-api"
          projects={mockProjects}
        />
      );

      const trigger = screen.getByRole('button');
      fireEvent.click(trigger);

      const targetOption = screen.getByTestId('project-switcher-item-web-ui');

      fireEvent.mouseEnter(targetOption);
      // Mouse leaves after 30ms
      act(() => {
        vi.advanceTimersByTime(30);
      });
      fireEvent.mouseLeave(targetOption);

      // Advance past 75ms
      act(() => {
        vi.advanceTimersByTime(100);
      });

      expect(mockPrefetch).not.toHaveBeenCalled();
      expect(ProjectDataContextModule.prefetchProjectData).not.toHaveBeenCalled();
    });
  });

  describe('2. Shallow View & Tab Transitions via replaceState', () => {
    it('updates URL search params shallowly with replaceState on tab change', () => {
      const { result } = renderHook(() =>
        useTabUrlSync({
          defaultTab: 'board',
          initialTab: 'board',
        })
      );

      act(() => {
        result.current.handleTabChange('tree');
      });

      expect(result.current.activeTab).toBe('tree');
      expect(window.history.replaceState).toHaveBeenCalledWith(
        { tab: 'tree' },
        '',
        expect.stringContaining('tab=tree')
      );
      // Ensure pushState was NOT called for shallow switch
      expect(window.history.pushState).not.toHaveBeenCalled();
    });

    it('removes tab param cleanly via replaceState when returning to default tab', () => {
      const { result } = renderHook(() =>
        useTabUrlSync({
          defaultTab: 'board',
          initialTab: 'sprint',
        })
      );

      act(() => {
        result.current.handleTabChange('board');
      });

      expect(result.current.activeTab).toBe('board');
      expect(window.history.replaceState).toHaveBeenCalledWith(
        { tab: 'board' },
        '',
        expect.not.stringContaining('tab=board')
      );
    });

    it('supports sprint and live tabs as valid dashboard tabs', () => {
      const { result } = renderHook(() =>
        useTabUrlSync({
          defaultTab: 'board',
          initialTab: 'sprint',
        })
      );

      expect(result.current.activeTab).toBe('sprint');
    });
  });
});
