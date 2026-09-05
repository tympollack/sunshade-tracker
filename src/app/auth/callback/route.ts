import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sanitizeNextUrl } from '@/lib/env';

/**
 * Hub SSO OAuth Callback Handler.
 *
 * After Hub authenticates the user, it redirects back here with a ?code= param.
 * We exchange the code for a Supabase session (sets auth cookies) then redirect
 * the user to their intended destination — either onboarding (new tenant) or
 * their workspace.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const accessToken = requestUrl.searchParams.get('access_token');
  const refreshToken = requestUrl.searchParams.get('refresh_token');
  const next = sanitizeNextUrl(requestUrl.searchParams.get('next'), '/onboarding');

  const supabase = await createServerClient();

  // ── PKCE code exchange (standard OAuth flow) ──────────────────────────
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Re-fetch user after session is established to check tenant existence
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const destination = await resolvePostAuthDestination(user.id, next, requestUrl.origin);
        return NextResponse.redirect(destination);
      }
    } else {
      console.error('[Auth Callback] Code exchange error:', error.message);
    }
  }

  // ── Direct token injection (magic link / email OTP fallback) ──────────
  if (accessToken && refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (!error) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const destination = await resolvePostAuthDestination(user.id, next, requestUrl.origin);
        return NextResponse.redirect(destination);
      }
    } else {
      console.error('[Auth Callback] Token injection error:', error.message);
    }
  }

  // Auth failed — redirect back to login with error signal
  return NextResponse.redirect(new URL('/login?error=auth-callback-failed', requestUrl.origin));
}

/**
 * After successful auth, determine where to send the user:
 * - New user (no tenant row) → /onboarding
 * - Existing tenant → /{tenantSlug}/{firstProjectSlug}
 * - next param takes priority if it points to a real destination (not /login or /onboarding)
 */
async function resolvePostAuthDestination(
  userId: string,
  nextParam: string,
  origin: string
): Promise<URL> {
  // If there's a specific page they were trying to reach, honor it
  if (nextParam && nextParam !== '/login' && nextParam !== '/onboarding') {
    return new URL(nextParam, origin);
  }

  // Look up the tenant for this Hub user (by owner_id)
  try {
    const { createServiceClient } = await import('@/lib/supabase-server');
    const service = createServiceClient();

    const { data: tenant } = await service
      .from('tenants')
      .select('slug')
      .eq('owner_id', userId)
      .is('deleted_at', null)
      .maybeSingle();

    if (tenant) {
      // Fetch their first project
      const { data: project } = await service
        .from('projects')
        .select('slug')
        .eq('tenant_id', tenant.slug) // join via tenant slug is handled by RLS, use id if needed
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (project) {
        return new URL(`/${tenant.slug}/${project.slug}`, origin);
      }
      return new URL(`/${tenant.slug}`, origin);
    }
  } catch (err) {
    console.error('[Auth Callback] Tenant lookup failed:', err);
  }

  // No tenant → send to onboarding
  return new URL('/onboarding', origin);
}
