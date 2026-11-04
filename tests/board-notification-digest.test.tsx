import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

  it('honours custom blocked status ids via per-item project statuses', () => {
    const custom = [
      { id: 'waiting_on_vendor', label: 'Blocked', color: '#f00', order: 1, is_completed: false },
      { id: 'todo', label: 'To Do', color: '#999', order: 0 },
    ];
    const out = blockersToNotifications(
      [item({ id: 'v', status: 'waiting_on_vendor' }), item({ id: 't', status: 'todo' })],
      () => custom
    );
    expect(out.map((n) => n.id)).toEqual(['v']);
  });

  it('uses each item\'s own project schema (portfolio view)', () => {
    const projA = [{ id: 'stuck', label: 'Blocked', color: '#f00', order: 1 }];
    const projB = [{ id: 'stuck', label: 'Parked', color: '#999', order: 1 }];
    const a = item({ id: 'a', project_id: 'A', status: 'stuck' });
    const b = item({ id: 'b', project_id: 'B', status: 'stuck' });
    const out = blockersToNotifications([a, b], (it) => (it.project_id === 'A' ? projA : projB));
    expect(out.map((n) => n.id)).toEqual(['a']);
  });

  it('returns nothing for empty inputs', () => {
    expect(blockersToNotifications([])).toEqual([]);
    expect(activityToNotifications([])).toEqual([]);
  });
});

describe('BoardNotificationDigest read failure', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('reverts optimistic read when PATCH returns success:false', async () => {
    window.localStorage.clear();
    const notif = {
      id: 'n1', tenant_id: 't', user_id: 'u', action: 'updated status', actor_name: 'Bot',
      item_title: 'X', read: false, created_at: '2026-11-02T00:00:00Z',
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (_url: string, init?: RequestInit) => ({
        ok: true,
        json: async () =>
          init?.method === 'PATCH' ? { success: false } : { notifications: [notif], unread_count: 1 },
      }))
    );
    render(<BoardNotificationDigest tenantSlug="acme" items={[]} />);
    await waitFor(() => expect(fetch).toHaveBeenCalled());
    // Open card and mark the notification read.
    const toggle = await screen.findByRole('button', { name: /^notifications/i });
    fireEvent.click(toggle);
    const markBtn = await screen.findByRole('button', { name: 'Mark read' });
    fireEvent.click(markBtn);
    await waitFor(() =>
      expect(fetch).toHaveBeenCalledWith(
        '/api/v1/notifications',
        expect.objectContaining({ method: 'PATCH' })
      )
    );
    // After failure the unread badge and Mark read control are restored.
    await waitFor(() => expect(screen.getByTestId('unread-badge').textContent).toBe('1'));
    expect(screen.getByRole('button', { name: 'Mark read' })).toBeTruthy();
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
