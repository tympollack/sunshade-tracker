import { NextResponse } from 'next/server';
import { createServerClient } from '@/lib/supabase-server';
import { sanitizeNextUrl } from '@/lib/env';
import { resolvePostAuthDestination } from '@/lib/auth';

/**
 * Hub SSO OAuth Callback Handler.
 *
 * After Hub authenticates the user, it redirects back here with a ?code= param.
 * We exchange the code for a Supabase session (sets auth cookies) then redirect
 * the user to their intended destination — either their workspace or onboarding.
 */
export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get('code');
  const accessToken = requestUrl.searchParams.get('access_token');
  const refreshToken = requestUrl.searchParams.get('refresh_token');
  const next = sanitizeNextUrl(requestUrl.searchParams.get('next'), '');

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
