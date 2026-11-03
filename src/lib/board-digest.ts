import type { ActionableNotification } from '@digitalcanopy/notifications';
import type { InAppNotification, WorkItem } from '@/types/tracker';

export const BLOCKER_SOURCE = 'tracker-blocker';
export const ACTIVITY_SOURCE = 'tracker-activity';

/** Work items flagged as blocked (and not terminal) become critical digest entries. */
export function blockersToNotifications(
  items: readonly WorkItem[],
  completedStatuses: ReadonlySet<string> = new Set()
): ActionableNotification[] {
  return items
    .filter((it) => it.status === 'blocked' && !it.deleted_at && !completedStatuses.has(it.status))
    .map((it) => ({
      id: it.id,
      tier: 'critical' as const,
      title: `Blocked: ${it.title}`,
      body: it.assignee ? `Assigned to ${it.assignee}` : undefined,
      source: BLOCKER_SOURCE,
      createdAt: it.updated_at || it.created_at,
      read: false,
    }));
}

/**
 * In-app notifications (assignment / status updates, including those made by
 * agents) map to the digest. Assignment to the user needs attention; the rest is info.
 */
export function activityToNotifications(list: readonly InAppNotification[]): ActionableNotification[] {
  return list.map((n) => {
    const actor = n.actor_name || 'Someone';
    return {
      id: n.id,
      tier: /assigned you/i.test(n.action) ? ('attention' as const) : ('info' as const),
      title: n.item_title ? `${actor} ${n.action}: ${n.item_title}` : `${actor} ${n.action}`,
      source: ACTIVITY_SOURCE,
      createdAt: n.created_at,
      read: n.read,
    };
  });
}
