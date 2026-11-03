'use client';

import React from 'react';
import { buildDigestRollup, notificationKey } from '@digitalcanopy/notifications';
import { NotificationDigestCard } from '@digitalcanopy/notifications/react';
import type { InAppNotification, WorkItem } from '@/types/tracker';
import {
  ACTIVITY_SOURCE,
  activityToNotifications,
  blockersToNotifications,
} from '@/lib/board-digest';

interface BoardNotificationDigestProps {
  tenantSlug: string;
  items: WorkItem[];
  completedStatuses?: ReadonlySet<string>;
}

const POLL_MS = 120000;

/** Digest pinned above the Kanban columns: blocker flags + activity updates + unread delta polling. */
export function BoardNotificationDigest({ tenantSlug, items, completedStatuses }: BoardNotificationDigestProps) {
  const [activity, setActivity] = React.useState<InAppNotification[]>([]);
  const [locallyRead, setLocallyRead] = React.useState<Set<string>>(new Set());
  const [dismissed, setDismissed] = React.useState<Set<string>>(new Set());
  const latestAtRef = React.useRef<string | null>(null);
  const headers = React.useMemo(() => ({ 'x-tenant-slug': tenantSlug }), [tenantSlug]);

  const fetchList = React.useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/v1/notifications', { headers });
      if (!res.ok) return false;
      const data = await res.json();
      const list: InAppNotification[] = data.notifications || [];
      setActivity(list);
      if (list.length > 0 && list[0].created_at) latestAtRef.current = list[0].created_at;
      return true;
    } catch {
      return false;
    }
  }, [headers]);

  const pollDelta = React.useCallback(async () => {
    try {
      const query = latestAtRef.current ? `?since=${encodeURIComponent(latestAtRef.current)}` : '';
      const res = await fetch(`/api/v1/notifications/unread-count${query}`, { headers });
      if (!res.ok) return;
      const data = await res.json();
      if (data.has_new) {
        const ok = await fetchList();
        if (ok && data.latest_at) latestAtRef.current = data.latest_at;
      } else if (data.latest_at) {
        latestAtRef.current = data.latest_at;
      }
    } catch {
      // Graceful ignore; next poll retries
    }
  }, [headers, fetchList]);

  React.useEffect(() => {
    fetchList();
    const interval = setInterval(pollDelta, POLL_MS);
    return () => clearInterval(interval);
  }, [fetchList, pollDelta]);

  const digest = React.useMemo(() => {
    const all = [...blockersToNotifications(items, completedStatuses), ...activityToNotifications(activity)]
      .filter((n) => !dismissed.has(notificationKey(n)))
      .map((n) => (locallyRead.has(notificationKey(n)) ? { ...n, read: true } : n));
    return buildDigestRollup(all);
  }, [items, completedStatuses, activity, dismissed, locallyRead]);

  const patchRead = async (body: Record<string, unknown>) => {
    try {
      const res = await fetch('/api/v1/notifications', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) await fetchList();
    } catch {
      await fetchList();
    }
  };

  const markRead = (key: string) => {
    setLocallyRead((prev) => new Set(prev).add(key));
    const prefix = `${ACTIVITY_SOURCE}:`;
    if (key.startsWith(prefix)) void patchRead({ id: key.slice(prefix.length) });
  };

  const markAllRead = () => {
    setLocallyRead((prev) => {
      const next = new Set(prev);
      digest.items.forEach((n) => next.add(notificationKey(n)));
      return next;
    });
    void patchRead({ all: true });
  };

  const dismiss = (key: string) => {
    markRead(key);
    setDismissed((prev) => new Set(prev).add(key));
  };

  return (
    <div data-testid="board-notification-digest">
      <NotificationDigestCard
        digest={digest}
        title="Notifications"
        storageKey={`tracker:board-digest:${tenantSlug}`}
        className="w-full"
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
        onDismiss={dismiss}
        emptyState={<p className="px-4 py-3 text-sm text-slate-500">No blockers or new updates.</p>}
      />
    </div>
  );
}
