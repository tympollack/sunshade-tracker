import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { isLocalDevelopment } from '@/lib/env';

/**
 * Next.js Edge Middleware — runs on every request before rendering.
 *
 * Responsibilities:
 * 1. Refresh the Supabase session (keeps cookies alive on each request).
 * 2. Redirect unauthenticated users away from dashboard routes to /login.
 * 3. Redirect authenticated users away from /login and /onboarding (if already done).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Build response we'll potentially mutate with refreshed cookies
  let supabaseResponse = NextResponse.next({ request });

  const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || '';
  const isSunShadeDomain = host === 'sunshade.icu' || host.endsWith('.sunshade.icu');
  const isLocal = isLocalDevelopment(host);
  const isSecure = process.env.NODE_ENV === 'production' && !isLocal;

  const cookieOptions = {
    path: '/',
    sameSite: 'lax' as const,
    secure: isSecure,
    ...(isSunShadeDomain ? { domain: '.sunshade.icu' } : {}),
  };

  // Create an SSR Supabase client that reads/writes cookies on this request
  const supabase = createSSRServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookieOptions,
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, { ...options, ...cookieOptions })
          );
        },
      },
    }
  );

  // IMPORTANT: getUser() refreshes the token and must be called before any redirects
  const { data: { user } } = await supabase.auth.getUser();

  // ─── Public routes — always allow through ───────────────────────────────
  const isPublicRoute =
    pathname === '/' ||
    pathname.startsWith('/login') ||
    pathname.startsWith('/auth/') ||
    pathname.startsWith('/api/') || // All API routes handle their own auth (dual: session or API key)
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon');

  // ─── Onboarding route ───────────────────────────────────────────────────
  const isOnboardingRoute = pathname.startsWith('/onboarding');

  if (isPublicRoute) {
    // If already authenticated and trying to reach /login, redirect to workspace
    if (user && pathname.startsWith('/login')) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
    // For API routes, always pass through (route handlers do auth themselves)
    return supabaseResponse;
  }

  // ─── Protected UI routes require a session ──────────────────────────────
  if (!user) {
    // Preserve the intended destination for post-login redirect
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // User is authenticated — allow through
  return supabaseResponse;
}

export const config = {
  matcher: [
    /*
     * Match all request paths EXCEPT static files and images.
     * Matches: /, /login, /onboarding, /[tenantSlug]/..., /api/...
     * Does NOT match: /_next/static, /_next/image, /favicon.ico, /apple-icon.png
     */
    '/((?!_next/static|_next/image|favicon\\.ico|apple-icon\\.png|icon\\.png|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
