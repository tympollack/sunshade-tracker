'use client';

import React from 'react';
import { buildDigestRollup, notificationKey } from '@digitalcanopy/notifications';
import { NotificationDigestCard } from '@digitalcanopy/notifications/react';
import type { InAppNotification, StatusDefinition, WorkItem } from '@/types/tracker';
import {
  ACTIVITY_SOURCE,
  activityToNotifications,
  blockersToNotifications,
} from '@/lib/board-digest';

interface BoardNotificationDigestProps {
  tenantSlug: string;
  items: WorkItem[];
  /** Resolves an item's own project status definitions (per-project schema). */
  getItemStatuses?: (item: WorkItem) => readonly StatusDefinition[] | undefined;
}

const POLL_MS = 120000;

/** Digest pinned above the Kanban columns: blocker flags + activity updates + unread delta polling. */
export function BoardNotificationDigest({ tenantSlug, items, getItemStatuses }: BoardNotificationDigestProps) {
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
    const all = [...blockersToNotifications(items, getItemStatuses), ...activityToNotifications(activity)]
      .filter((n) => !dismissed.has(notificationKey(n)))
      .map((n) => (locallyRead.has(notificationKey(n)) ? { ...n, read: true } : n));
    return buildDigestRollup(all);
  }, [items, getItemStatuses, activity, dismissed, locallyRead]);

  /**
   * Persists a read acknowledgement. On HTTP failure or `{ success: false }`, the
   * optimistically-read keys are reverted so the digest matches the server/bell.
   */
  const patchRead = async (body: Record<string, unknown>, optimisticKeys: string[]) => {
    const revert = () =>
      setLocallyRead((prev) => {
        const next = new Set(prev);
        optimisticKeys.forEach((k) => next.delete(k));
        return next;
      });
    try {
      const res = await fetch('/api/v1/notifications', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = res.ok ? await res.json().catch(() => null) : null;
      if (!res.ok || !data || data.success !== true) {
        revert();
        await fetchList();
      }
    } catch {
      revert();
      await fetchList();
    }
  };

  const markRead = (key: string) => {
    const prefix = `${ACTIVITY_SOURCE}:`;
    const isActivity = key.startsWith(prefix);
    const wasRead = locallyRead.has(key);
    setLocallyRead((prev) => new Set(prev).add(key));
    // Only revert keys we newly added; blocker keys are local-only.
    if (isActivity) void patchRead({ id: key.slice(prefix.length) }, wasRead ? [] : [key]);
  };

  const markAllRead = () => {
    const added = digest.items.map((n) => notificationKey(n)).filter((k) => !locallyRead.has(k));
    setLocallyRead((prev) => {
      const next = new Set(prev);
      added.forEach((k) => next.add(k));
      return next;
    });
    void patchRead({ all: true }, added.filter((k) => k.startsWith(`${ACTIVITY_SOURCE}:`)));
  };

  const dismiss = (key: string) => {
    markRead(key);
    setDismissed((prev) => new Set(prev).add(key));
  };

  return (
    <div
      data-testid="board-notification-digest"
      className="w-full text-slate-100 [&_[data-testid='notification-digest-card']]:!bg-slate-900 [&_[data-testid='notification-digest-card']]:!border-slate-800 [&_[data-testid='notification-digest-card']]:text-slate-100 [&_.text-slate-600]:!text-slate-400 [&_.text-slate-500]:!text-slate-400 [&_.divide-slate-100]:!divide-slate-800 [&_button]:!text-slate-200 hover:[&_button]:!text-white"
    >
      <NotificationDigestCard
        digest={digest}
        title="Notifications"
        storageKey={`tracker:board-digest:${tenantSlug}`}
        className="w-full"
        onMarkRead={markRead}
        onMarkAllRead={markAllRead}
        onDismiss={dismiss}
        emptyState={<p className="px-4 py-3 text-sm text-slate-400">No blockers or new updates.</p>}
      />
    </div>
  );
}
