'use client';

import { useState, useEffect, useCallback, useRef } from 'react';

export type DashboardTab = 'board' | 'tree' | 'sprint' | 'spark' | 'schema';

export const VALID_DASHBOARD_TABS: readonly DashboardTab[] = [
  'board',
  'tree',
  'sprint',
  'spark',
  'schema',
] as const;

export interface UseTabUrlSyncOptions {
  validTabs?: readonly DashboardTab[];
  defaultTab?: DashboardTab;
  initialTab?: string | null;
  onTabChange?: (tab: DashboardTab) => void;
}

/**
 * Hook providing two-way synchronization between URL search parameters (?tab=...)
 * and dashboard active tab state (REV-TRK-02).
 *
 * - Reads query param ?tab from initial URL and searchParams prop
 * - Listens for browser back/forward history navigation via `popstate`
 * - Updates URL via `window.history.pushState` on user tab switch
 * - Normalizes default tab ('board') by removing the ?tab query parameter
 */
export function useTabUrlSync(options?: UseTabUrlSyncOptions) {
  const validTabs = options?.validTabs ?? VALID_DASHBOARD_TABS;
  const defaultTab = options?.defaultTab ?? 'board';

  const parseTab = useCallback(
    (val: string | null | undefined): DashboardTab => {
      if (typeof val === 'string' && (validTabs as readonly string[]).includes(val)) {
        return val as DashboardTab;
      }
      return defaultTab;
    },
    [validTabs, defaultTab]
  );

  const [activeTab, setActiveTabState] = useState<DashboardTab>(() => {
    if (options?.initialTab) {
      return parseTab(options.initialTab);
    }
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return parseTab(params.get('tab'));
    }
    return defaultTab;
  });

  const activeTabRef = useRef(activeTab);
  activeTabRef.current = activeTab;

  // Handle external prop changes (e.g. Next.js router transitions)
  useEffect(() => {
    if (options?.initialTab !== undefined) {
      const parsed = parseTab(options.initialTab);
      if (parsed !== activeTabRef.current) {
        setActiveTabState(parsed);
      }
    }
  }, [options?.initialTab, parseTab]);

  // Handle browser back/forward history navigation
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const urlTab = parseTab(params.get('tab'));
      if (urlTab !== activeTabRef.current) {
        setActiveTabState(urlTab);
        options?.onTabChange?.(urlTab);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [parseTab, options]);

  // Programmatic tab switch
  const handleTabChange = useCallback(
    (newTab: DashboardTab, historyMode: 'push' | 'replace' = 'push') => {
      setActiveTabState(newTab);
      options?.onTabChange?.(newTab);

      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        if (newTab === defaultTab) {
          url.searchParams.delete('tab');
        } else {
          url.searchParams.set('tab', newTab);
        }

        const nextUrl = url.pathname + (url.search ? url.search : '') + url.hash;
        if (historyMode === 'replace' || newTab === activeTabRef.current) {
          window.history.replaceState({ tab: newTab }, '', nextUrl);
        } else {
          window.history.pushState({ tab: newTab }, '', nextUrl);
        }
      }
    },
    [defaultTab, options]
  );

  return {
    activeTab,
    setActiveTab: handleTabChange,
    handleTabChange,
  };
}
