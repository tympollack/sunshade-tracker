import type { ActionableNotification } from '@digitalcanopy/notifications';
import type { InAppNotification, StatusDefinition, WorkItem } from '@/types/tracker';
import { getCompletedStatusSet } from '@/lib/sprint-utils';

export const BLOCKER_SOURCE = 'tracker-blocker';
export const ACTIVITY_SOURCE = 'tracker-activity';

const norm = (v: unknown) => String(v ?? '').toLowerCase().trim();

/**
 * True when the item's status is a "blocked" status for its own project schema:
 * either the literal id `blocked`, or a configured status whose id matches the
 * item and whose id or label is "blocked" (custom IDs such as `waiting_on_vendor`
 * labelled "Blocked" are honoured).
 */
export function isBlockedStatus(status: string, statuses?: readonly StatusDefinition[]): boolean {
  const s = norm(status);
  if (s === 'blocked') return true;
  const def = statuses?.find((d) => norm(d.id) === s);
  return !!def && norm(def.label) === 'blocked';
}

/**
 * Work items in a blocked (non-completed) status become critical digest entries.
 * `getStatuses` supplies each item's own project status definitions so portfolio
 * views do not depend on a merged schema.
 */
export function blockersToNotifications(
  items: readonly WorkItem[],
  getStatuses?: (item: WorkItem) => readonly StatusDefinition[] | undefined
): ActionableNotification[] {
  const completedCache = new Map<readonly StatusDefinition[] | undefined, Set<string>>();
  const completedFor = (statuses: readonly StatusDefinition[] | undefined) => {
    let set = completedCache.get(statuses);
    if (!set) {
      set = getCompletedStatusSet(statuses ? [...statuses] : undefined);
      completedCache.set(statuses, set);
    }
    return set;
  };

  return items
    .filter((it) => {
      if (it.deleted_at) return false;
      const statuses = getStatuses?.(it);
      return isBlockedStatus(it.status, statuses) && !completedFor(statuses).has(norm(it.status));
    })
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
