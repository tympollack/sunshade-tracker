import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase-server';
import { Tenant } from '@/types/tracker';

export interface AuthContext {
  tenant: Tenant;
  /** The authenticated user's ID (present for session-based auth; null for API key auth) */
  userId: string | null;
  /** The user's role in this workspace ('owner' | 'admin' | 'member' | null for API key auth) */
  role: string | null;
}

export type AuthResult =
  | { context: AuthContext; errorResponse: null }
  | { context: null; errorResponse: NextResponse };

// ─────────────────────────────────────────────────────────────────────────────
// Session-based auth (for frontend dashboard API calls)
//
// Reads the Supabase cookie session set by the Hub SSO callback.
// Resolves which workspace to authorize via (in priority order):
//   1. x-tenant-slug request header  (set by dashboard page on every fetch)
//   2. tenant_slug query param
//   3. Falls back to the first workspace the user is a member of
// ─────────────────────────────────────────────────────────────────────────────
export async function authenticateSession(req: NextRequest): Promise<AuthResult> {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();

    if (userErr || !user) {
      return {
        context: null,
        errorResponse: NextResponse.json(
          { error: 'Unauthorized — valid session required' },
          { status: 401 }
        ),
      };
    }

    const service = createServiceClient();

    // Determine which workspace to authorize against
    const tenantSlugHint =
      req.headers.get('x-tenant-slug') ||
      new URL(req.url).searchParams.get('tenant_slug');

    let membershipQuery = service
      .from('tenant_members')
      .select('role, created_at, tenants!inner(*, deleted_at)')
      .eq('user_id', user.id);

    if (tenantSlugHint) {
      // Look up by slug via the joined tenants table
      membershipQuery = (membershipQuery as any).eq('tenants.slug', tenantSlugHint);
    }

    const { data: memberships, error: memberErr } = await membershipQuery
      .is('tenants.deleted_at', null)
      .limit(1)
      .maybeSingle();

    if (memberErr || !memberships) {
      // 1. Fallback: check if the user is owner_id on the tenant directly
      if (tenantSlugHint) {
        const { data: ownedTenant } = await service
          .from('tenants')
          .select('*')
          .eq('owner_id', user.id)
          .eq('slug', tenantSlugHint)
          .is('deleted_at', null)
          .maybeSingle();

        if (ownedTenant) {
          return {
            context: { tenant: ownedTenant as Tenant, userId: user.id, role: 'owner' },
            errorResponse: null,
          };
        }
      }

      // 2. Demo workspace allowance: 'sunshade' is the public demo workspace
      if (tenantSlugHint === 'sunshade') {
        const { data: demoTenant } = await service
          .from('tenants')
          .select('*')
          .eq('slug', 'sunshade')
          .is('deleted_at', null)
          .maybeSingle();

        if (demoTenant) {
          return {
            context: { tenant: demoTenant as Tenant, userId: user.id, role: 'member' },
            errorResponse: null,
          };
        }
      }

      return {
        context: null,
        errorResponse: NextResponse.json(
          {
            error: tenantSlugHint
              ? `You are not a member of workspace "${tenantSlugHint}".`
              : 'No workspace found for this user. Complete onboarding first.',
          },
          { status: 403 }
        ),
      };
    }

    const tenant = (memberships as any).tenants as Tenant;
    const role = (memberships as any).role as string;

    return {
      context: { tenant, userId: user.id, role },
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

// ─────────────────────────────────────────────────────────────────────────────
// API Key-based auth (for external Gemini Spark / headless ingest)
// Reads Bearer token from Authorization header or x-api-key header.
// ─────────────────────────────────────────────────────────────────────────────
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
          { error: 'Missing or malformed Authorization header. Expected: Bearer tk_live_...' },
          { status: 401 }
        ),
      };
    }

    const service = createServiceClient();
    const { data: tenant, error: tenantErr } = await service
      .from('tenants')
      .select('*')
      .eq('api_key', apiKey)
      .is('deleted_at', null)
      .single();

    if (tenantErr || !tenant) {
      return {
        context: null,
        errorResponse: NextResponse.json(
          { error: 'Invalid API Key or tenant not found' },
          { status: 401 }
        ),
      };
    }

    return {
      context: { tenant: tenant as Tenant, userId: null, role: null },
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

// ─────────────────────────────────────────────────────────────────────────────
// Dual auth — tries API key first (if Bearer tk_ prefix), else session.
// Use this for routes that serve both dashboard UI and external pipelines.
// ─────────────────────────────────────────────────────────────────────────────
export async function authenticate(req: NextRequest): Promise<AuthResult> {
  const hasApiKey =
    req.headers.has('x-api-key') ||
    (req.headers.get('Authorization') || '').startsWith('Bearer tk_');

  if (hasApiKey) {
    return authenticateApiKey(req);
  }

  return authenticateSession(req);
}
