import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from './db';
import { Tenant } from '@/types/tracker';

export interface AuthContext {
  tenant: Tenant;
}

export type AuthResult =
  | { context: AuthContext; errorResponse: null }
  | { context: null; errorResponse: NextResponse };

/**
 * Validates Tenant API Key from Authorization header (Bearer tk_live_...) or x-api-key header.
 */
export async function authenticateApiKey(req: NextRequest): Promise<AuthResult> {
  try {
    const authHeader = req.headers.get('Authorization') || req.headers.get('authorization');
    const xApiKey = req.headers.get('x-api-key');

    let apiKey = '';

    if (authHeader?.startsWith('Bearer ')) {
      apiKey = authHeader.replace('Bearer ', '').trim();
    } else if (xApiKey) {
      apiKey = xApiKey.trim();
    }

    if (!apiKey) {
      return {
        context: null,
        errorResponse: NextResponse.json(
          { error: 'Missing or malformed Authorization header. Expected Bearer <api_key> or x-api-key' },
          { status: 401 }
        ),
      };
    }

    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('*')
      .eq('api_key', apiKey)
      .single();

    if (tenantErr || !tenant) {
      return {
        context: null,
        errorResponse: NextResponse.json(
          { error: 'Invalid API Key or Tenant not found' },
          { status: 401 }
        ),
      };
    }

    return {
      context: { tenant: tenant as Tenant },
      errorResponse: null,
    };
  } catch (err: any) {
    return {
      context: null,
      errorResponse: NextResponse.json(
        { error: err.message || 'Internal Authentication Error' },
        { status: 500 }
      ),
    };
  }
}
