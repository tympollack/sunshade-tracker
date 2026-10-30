import { NextRequest, NextResponse } from 'next/server';
import { PATCH as patchItemsRoute } from '../route';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/v1/items/[id]
 *
 * Updates a single work item by ID, enforcing project schema & transition guardrails.
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  const resolvedParams = await context.params;
  const itemId = resolvedParams?.id;
  if (!itemId) {
    return NextResponse.json({ error: 'Missing item ID in path' }, { status: 400 });
  }

  let body: Record<string, any> = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON payload' }, { status: 400 });
  }

  const forwardedReq = new NextRequest(req.url, {
    method: 'PATCH',
    headers: req.headers,
    body: JSON.stringify({
      ...body,
      id: body.id || itemId,
    }),
  });

  return patchItemsRoute(forwardedReq);
}
