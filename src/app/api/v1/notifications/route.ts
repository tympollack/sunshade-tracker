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
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 30, 100) : 30;

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
    const success = await markNotificationsAsRead(tenant.id, userId, {
      id: body.id,
      ids: body.ids,
      all: body.all,
    });

    return NextResponse.json({ success });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Invalid request body' }, { status: 400 });
  }
}
