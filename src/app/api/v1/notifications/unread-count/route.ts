import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { getNotificationUnreadDelta } from '@/lib/notifications';

/**
 * GET /api/v1/notifications/unread-count
 *
 * Lightweight delta-polling endpoint (FEAT-TRK-NOTIFICATIONS-DELTA-POLL).
 * Accepts optional query param `?since=<ISO_TIMESTAMP>`.
 * Returns `{ unread_count: number, has_new: boolean, latest_at: string | null }`
 * without hydrating notification entities.
 */
export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const { tenant, userId } = auth.context;

  if (!userId) {
    return NextResponse.json({ error: 'User context required for notifications' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const since = searchParams.get('since');

  const delta = await getNotificationUnreadDelta(tenant.id, userId, since);

  return NextResponse.json(delta, { status: 200 });
}
