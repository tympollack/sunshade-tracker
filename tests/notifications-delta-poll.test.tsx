import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import { NotificationBell } from '@/components/NotificationBell';

describe('FEAT-TRK-NOTIFICATIONS-DELTA-POLL: Delta Polling & 2-Minute Interval', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('polls delta endpoint every 120,000ms (2 minutes) and revalidates list on has_new', async () => {
    let unreadCountResponse = { unread_count: 2, has_new: false, latest_at: '2026-09-19T10:00:00.000Z' };

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/notifications/unread-count')) {
        return Promise.resolve({
          ok: true,
          json: async () => unreadCountResponse,
        });
      }
      if (url.includes('/api/v1/notifications')) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            notifications: [
              {
                id: 'notif-1',
                tenant_id: 't-1',
                user_id: 'u-1',
                action: 'created',
                read: false,
                created_at: '2026-09-19T10:00:00.000Z',
              },
            ],
            unread_count: 1,
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    global.fetch = mockFetch;

    render(<NotificationBell tenantSlug="demo-tenant" />);

    // Initial mount fetches full notifications
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/v1/notifications',
      expect.anything()
    );

    // Advance time by 60 seconds (halfway through 2 min poll) - should NOT poll yet
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });

    const unreadCalls60s = mockFetch.mock.calls.filter(([url]) =>
      url.includes('/api/v1/notifications/unread-count')
    );
    expect(unreadCalls60s.length).toBe(0);

    // Advance time by another 60 seconds (total 120 seconds / 2 minutes) - should poll delta
    await act(async () => {
      vi.advanceTimersByTime(60000);
    });

    const unreadCalls120s = mockFetch.mock.calls.filter(([url]) =>
      url.includes('/api/v1/notifications/unread-count')
    );
    expect(unreadCalls120s.length).toBe(1);

    // Configure next poll to have has_new: true
    unreadCountResponse = { unread_count: 3, has_new: true, latest_at: '2026-09-19T10:02:00.000Z' };

    // Advance time by another 120 seconds
    await act(async () => {
      vi.advanceTimersByTime(120000);
    });

    // Verify delta poll was invoked with since parameter
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/notifications/unread-count?since='),
      expect.anything()
    );

    // Verify full notifications list was revalidated due to has_new: true
    const fullCalls = mockFetch.mock.calls.filter(
      ([url]) => url === '/api/v1/notifications'
    );
    expect(fullCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('does not advance checkpoint when notifications list fetch fails on has_new', async () => {
    let unreadCountResponse = { unread_count: 3, has_new: true, latest_at: '2026-09-19T10:02:00.000Z' };
    let failNotifications = false;

    const mockFetch = vi.fn().mockImplementation((url: string) => {
      if (url.includes('/api/v1/notifications/unread-count')) {
        return Promise.resolve({
          ok: true,
          json: async () => unreadCountResponse,
        });
      }
      if (url.includes('/api/v1/notifications')) {
        if (failNotifications) {
          return Promise.resolve({ ok: false, status: 500 });
        }
        return Promise.resolve({
          ok: true,
          json: async () => ({
            notifications: [],
            unread_count: 1,
            latest_at: '2026-09-19T10:00:00.000Z',
          }),
        });
      }
      return Promise.reject(new Error(`Unhandled URL: ${url}`));
    });

    global.fetch = mockFetch;

    render(<NotificationBell tenantSlug="demo-tenant" />);

    // Wait for initial fetch to resolve
    await act(async () => {
      await Promise.resolve();
    });

    // Subsequent full notifications fetch (triggered by has_new) will fail
    failNotifications = true;

    // Advance 2 minutes to trigger poll
    await act(async () => {
      vi.advanceTimersByTime(120000);
    });

    // Advance another 2 minutes: checkpoint must not have advanced to 10:02:00
    await act(async () => {
      vi.advanceTimersByTime(120000);
    });

    const unreadCalls = mockFetch.mock.calls.filter(([url]) =>
      url.includes('/api/v1/notifications/unread-count?since=')
    );
    expect(unreadCalls.length).toBe(2);
    expect(decodeURIComponent(unreadCalls[1][0])).not.toContain('2026-09-19T10:02:00.000Z');
  });
});
