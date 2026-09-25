/**
 * Cross-Tab Sync via BroadcastChannel (TRK-21)
 * Keeps work item mutations and deletions synchronized across open browser tabs.
 */

import { WorkItem } from '@/types/tracker';

export const TRACKER_BROADCAST_CHANNEL_NAME = 'sunshade_tracker_items';

export type SyncMessage =
  | { type: 'ITEM_UPDATED'; itemId: string; updates: Partial<WorkItem> }
  | { type: 'ITEM_CREATED'; item: WorkItem }
  | { type: 'ITEM_DELETED'; itemId: string }
  | { type: 'ITEMS_REFRESH'; tenantSlug?: string; projectSlug?: string };

let channelInstance: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return null;
  }
  if (!channelInstance) {
    try {
      channelInstance = new BroadcastChannel(TRACKER_BROADCAST_CHANNEL_NAME);
    } catch {
      return null;
    }
  }
  return channelInstance;
}

export function broadcastItemMutation(msg: SyncMessage): void {
  const channel = getChannel();
  if (!channel) return;
  try {
    channel.postMessage(msg);
  } catch (err) {
    console.warn('Failed to broadcast item mutation:', err);
  }
}

export function subscribeToItemSync(handler: (msg: SyncMessage) => void): () => void {
  if (typeof window === 'undefined' || typeof BroadcastChannel === 'undefined') {
    return () => {};
  }

  let subChannel: BroadcastChannel | null = null;
  try {
    subChannel = new BroadcastChannel(TRACKER_BROADCAST_CHANNEL_NAME);
  } catch {
    return () => {};
  }

  const listener = (event: MessageEvent) => {
    if (event.data && typeof event.data.type === 'string') {
      handler(event.data as SyncMessage);
    }
  };

  subChannel.addEventListener('message', listener);
  return () => {
    try {
      subChannel?.removeEventListener('message', listener);
      subChannel?.close();
    } catch {
      // Graceful cleanup
    }
  };
}
