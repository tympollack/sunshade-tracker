import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { getInAppNotifications, markNotificationsAsRead } from '@/lib/notifications';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const { tenant, userId } = auth.context;

  if (!userId) {
    return NextResponse.json({ error: 'User context required for notifications' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get('limit');
  const parsedLimit = limitParam ? parseInt(limitParam, 10) : 30;
  const limit = Math.max(1, Math.min(isNaN(parsedLimit) ? 30 : parsedLimit, 100));

  const result = await getInAppNotifications(tenant.id, userId, limit);

  return NextResponse.json({
    success: true,
    count: result.notifications.length,
    unread_count: result.unread_count,
    notifications: result.notifications,
  });
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const { tenant, userId } = auth.context;

  if (!userId) {
    return NextResponse.json({ error: 'User context required for notifications' }, { status: 401 });
  }

  try {
    const body = await req.json();

    const isAll = body.all === true;
    const hasValidIds =
      Array.isArray(body.ids) &&
      body.ids.length > 0 &&
      body.ids.every((id: any) => typeof id === 'string' && id.trim().length > 0);
    const hasValidId = typeof body.id === 'string' && body.id.trim().length > 0;

    // Guard against empty criteria requests or truthy non-boolean "all" values
    if (!isAll && !hasValidIds && !hasValidId) {
      return NextResponse.json(
        { error: 'Missing or invalid filter criteria: must provide "id", non-empty string array "ids", or "all: true"' },
        { status: 400 }
      );
    }

    const success = await markNotificationsAsRead(tenant.id, userId, {
      id: hasValidId ? body.id.trim() : undefined,
      ids: hasValidIds ? body.ids.map((id: string) => id.trim()) : undefined,
      all: isAll,
    });

    return NextResponse.json({ success });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Invalid request body' }, { status: 400 });
  }
}
