import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { handleBulkUpdateItems } from '@/lib/bulk-items';

async function processBulkUpdate(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  try {
    const body = await req.json();
    const payload =
      body && typeof body === 'object' && !Array.isArray(body)
        ? { ...body, ids: body.ids || body.item_ids }
        : body;

    const governanceBypass = Boolean(
      payload?.governance_bypass ||
      payload?.updates?.governance_bypass ||
      payload?.metadata?.governance_bypass ||
      req.headers.get('x-governance-bypass') === 'true'
    );

    const effectivePayload =
      governanceBypass && typeof payload === 'object' && !Array.isArray(payload)
        ? {
            ...payload,
            governance_bypass: true,
            updates: payload.updates
              ? {
                  ...payload.updates,
                  governance_bypass: true,
                  metadata: {
                    ...(payload.updates.metadata || {}),
                    governance_bypass: true,
                    added_mid_sprint: true,
                  },
                }
              : payload.updates,
          }
        : payload;

    const res = await handleBulkUpdateItems(authCtx.tenant.id, effectivePayload, {
      tenantSlug: authCtx.tenant.slug,
      actorId: authCtx.userId || null,
      actorName: authCtx.userName || (authCtx.userId ? 'User' : 'Bulk API'),
      governance_bypass: governanceBypass,
    });

    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: res.status || 400 });
    }

    return NextResponse.json({
      success: true,
      updated_count: res.updated_count,
      items: res.items,
    });
  } catch (err: any) {
    const isSyntaxError = err instanceof SyntaxError || err.name === 'SyntaxError';
    return NextResponse.json(
      { error: isSyntaxError ? 'Invalid JSON body' : (err.message || 'Internal server error') },
      { status: isSyntaxError ? 400 : 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  return processBulkUpdate(req);
}

export async function PATCH(req: NextRequest) {
  return processBulkUpdate(req);
}

export async function PUT(req: NextRequest) {
  return processBulkUpdate(req);
}
