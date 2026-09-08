import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { getAuditLogsForItem } from '@/lib/audit-log';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const { tenant } = auth.context;

  const { searchParams } = new URL(req.url);
  const itemId = searchParams.get('item_id');
  const limitParam = searchParams.get('limit');
  const limit = limitParam ? Math.min(parseInt(limitParam, 10) || 50, 200) : 50;

  if (!itemId) {
    return NextResponse.json(
      { error: 'Query parameter "item_id" is required' },
      { status: 400 }
    );
  }

  const logs = await getAuditLogsForItem(tenant.id, itemId, limit);

  return NextResponse.json({
    success: true,
    count: logs.length,
    audit_logs: logs,
  });
}
