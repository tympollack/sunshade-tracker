import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import {
  handleBulkGetItems,
  handleBulkCreateItems,
  handleBulkUpdateItems,
  handleBulkDeleteItems,
} from '@/lib/bulk-items';

export async function GET(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  const { searchParams } = new URL(req.url);
  const rawIds = searchParams.get('ids');
  const rawRefs = searchParams.get('refs');
  const projectSlug = searchParams.get('project_slug') || undefined;
  const projectId = searchParams.get('project_id') || undefined;

  const ids = rawIds ? rawIds.split(',').map((s) => s.trim()).filter(Boolean) : undefined;
  const refs = rawRefs ? rawRefs.split(',').map((s) => s.trim()).filter(Boolean) : undefined;

  const res = await handleBulkGetItems(authCtx.tenant.id, {
    ids,
    refs,
    projectSlug,
    projectId,
  });

  if (!res.success) {
    return NextResponse.json({ error: res.error }, { status: res.status || 400 });
  }

  return NextResponse.json({
    workspace: { id: authCtx.tenant.id, slug: authCtx.tenant.slug, name: authCtx.tenant.name },
    count: res.count,
    items: res.items,
  });
}

export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  try {
    const body = await req.json();
    const payload = Array.isArray(body) ? { items: body } : body;

    const res = await handleBulkCreateItems(authCtx.tenant.id, payload);
    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: res.status || 400 });
    }

    return NextResponse.json(
      {
        success: true,
        count: res.count,
        items: res.items,
      },
      { status: 201 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Invalid JSON body' }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  try {
    const body = await req.json();
    const res = await handleBulkUpdateItems(authCtx.tenant.id, body);
    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: res.status || 400 });
    }

    return NextResponse.json({
      success: true,
      updated_count: res.updated_count,
      items: res.items,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Invalid JSON body' }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  try {
    const body = await req.json();
    const payload = Array.isArray(body) ? { ids: body } : body;

    const res = await handleBulkDeleteItems(authCtx.tenant.id, payload);
    if (!res.success) {
      return NextResponse.json({ error: res.error }, { status: res.status || 400 });
    }

    return NextResponse.json({
      success: true,
      deleted_count: res.deleted_count,
      deleted_ids: res.deleted_ids,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Invalid JSON body' }, { status: 400 });
  }
}
