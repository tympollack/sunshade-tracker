import { NextRequest, NextResponse } from 'next/server';
import { createHash } from 'crypto';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';

/**
 * POST /api/v1/tenants/api-key
 *
 * Regenerates the tenant workspace API key.
 * Only 'owner' and 'admin' roles can regenerate the key.
 * Returns the full key once so it can be securely copied by the user.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  if (authCtx.role !== 'owner' && authCtx.role !== 'admin') {
    return NextResponse.json(
      { error: 'Forbidden — only workspace owners or admins can regenerate API keys' },
      { status: 403 }
    );
  }

  try {
    const randomSuffix = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    const newApiKey = `tk_live_${authCtx.tenant.slug}_${randomSuffix}`;
    const preview = `${newApiKey.substring(0, 20)}...`;
    const keyHash = createHash('sha256').update(newApiKey).digest('hex');

    const updatePayload: Record<string, any> = {
      api_key: newApiKey,
      api_key_preview: preview,
      api_key_hash: keyHash,
      updated_at: new Date().toISOString(),
    };

    let updateQuery: any = supabaseAdmin
      .from('tenants')
      .update(updatePayload)
      .eq('id', authCtx.tenant.id);

    if (typeof updateQuery.is === 'function') {
      updateQuery = updateQuery.is('deleted_at', null);
    }

    let { error } = await updateQuery;

    // Graceful fallback if api_key_hash or api_key_preview columns are missing in the schema
    if (
      error &&
      error.message &&
      (error.message.includes('api_key_hash') || error.message.includes('api_key_preview'))
    ) {
      const fallbackPayload: Record<string, any> = {
        api_key: newApiKey,
        updated_at: new Date().toISOString(),
      };
      if (!error.message.includes('api_key_preview')) {
        fallbackPayload.api_key_preview = preview;
      }
      let retryQuery: any = supabaseAdmin
        .from('tenants')
        .update(fallbackPayload)
        .eq('id', authCtx.tenant.id);
      if (typeof retryQuery.is === 'function') {
        retryQuery = retryQuery.is('deleted_at', null);
      }
      const retryRes = await retryQuery;
      error = retryRes.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      api_key: newApiKey,
      api_key_preview: preview,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
