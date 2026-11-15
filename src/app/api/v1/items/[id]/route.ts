import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';
import { PATCH as patchItemsRoute } from '@/app/api/v1/items/route';

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  const resolvedParams = await context.params;
  const itemId = resolvedParams?.id;

  if (!itemId) {
    return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
  }

  // Look up full work item by UUID or external_ref_id
  let itemQuery: any = supabaseAdmin
    .from('work_items')
    .select('*')
    .eq('tenant_id', authCtx.tenant.id)
    .or(`id.eq.${itemId},external_ref_id.eq.${itemId}`);

  if (typeof itemQuery.is === 'function') {
    itemQuery = itemQuery.is('deleted_at', null);
  }

  const { data: item, error: itemErr } = typeof itemQuery.maybeSingle === 'function'
    ? await itemQuery.maybeSingle()
    : typeof itemQuery.single === 'function'
    ? await itemQuery.single().catch(() => ({ data: null }))
    : { data: null };

  if (itemErr || !item) {
    return NextResponse.json({ error: 'Work item not found' }, { status: 404 });
  }

  return NextResponse.json({
    item,
  });
}

export async function PATCH(
  req: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  const resolvedParams = await context.params;
  const itemId = resolvedParams?.id;

  let body: any = {};
  try {
    body = await req.json();
  } catch {}

  if (!body.id && itemId) {
    body.id = itemId;
  }

  const forwardReq = new NextRequest(req.url, {
    method: 'PATCH',
    headers: req.headers,
    body: JSON.stringify(body),
  });

  return patchItemsRoute(forwardReq);
}
