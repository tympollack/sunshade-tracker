import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { BoardNotificationDigest } from '@/components/board/BoardNotificationDigest';
import { activityToNotifications, blockersToNotifications } from '@/lib/board-digest';
import type { WorkItem } from '@/types/tracker';

function item(over: Partial<WorkItem>): WorkItem {
  return {
    id: 'i1',
    tenant_id: 't',
    project_id: 'p',
    item_type: 'task',
    status: 'todo',
    title: 'Item',
    order_index: 0,
    metadata: {},
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-02T00:00:00Z',
    ...over,
  };
}

describe('board-digest mapping', () => {
  it('maps only blocked, non-deleted items to critical entries', () => {
    const out = blockersToNotifications([
      item({ id: 'a', status: 'blocked', title: 'Stuck' }),
      item({ id: 'b', status: 'todo' }),
      item({ id: 'c', status: 'blocked', deleted_at: '2026-11-02T00:00:00Z' }),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({ id: 'a', tier: 'critical', read: false, title: 'Blocked: Stuck' });
  });

  it('maps assignment to attention and other updates to info', () => {
    const base = { tenant_id: 't', user_id: 'u', read: false, created_at: '2026-11-02T00:00:00Z' };
    const out = activityToNotifications([
      { ...base, id: '1', action: 'assigned you to this item', actor_name: 'Agent', item_title: 'X' },
      { ...base, id: '2', action: 'updated status to "done"', actor_name: 'Bot', item_title: 'Y' },
    ]);
    expect(out.map((n) => n.tier)).toEqual(['attention', 'info']);
  });

  it('returns nothing for empty inputs', () => {
    expect(blockersToNotifications([])).toEqual([]);
    expect(activityToNotifications([])).toEqual([]);
  });
});

describe('BoardNotificationDigest', () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ({ ok: true, json: async () => ({ notifications: [], unread_count: 0 }) }))
    );
  });
  afterEach(() => vi.unstubAllGlobals());

  it('renders the card and fetches notifications for the tenant', async () => {
    render(<BoardNotificationDigest tenantSlug="acme" items={[item({ status: 'blocked', title: 'Stuck' })]} />);
    expect(screen.getByTestId('board-notification-digest')).toBeTruthy();
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith('/api/v1/notifications', { headers: { 'x-tenant-slug': 'acme' } })
    );
  });
});
