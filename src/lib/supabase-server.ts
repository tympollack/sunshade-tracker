/**
 * Server-only Supabase clients.
 * This file imports from 'next/headers' and MUST only be used in:
 *   - Server Components
 *   - Server Actions ('use server')
 *   - Route Handlers (app/api/*)
 *
 * For Client Components, import from '@/lib/supabase-browser' instead.
 */
import { createClient as createSupabaseClient } from '@supabase/supabase-js';
import { createServerClient as createSSRServerClient } from '@supabase/ssr';
import { cookies, headers } from 'next/headers';
import { isLocalDevelopment } from '@/lib/env';

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    if (process.env.NODE_ENV !== 'production') {
      throw new Error(`Missing required environment variable: ${name}`);
    }
    console.error(`[tracker] Missing env var: ${name}`);
    return '';
  }
  return value;
}

// ---------------------------------------------------------------------------
// SSR Server Client (Server Components, Actions, Route Handlers)
// Cookie-based auth via @supabase/ssr — respects RLS.
// ---------------------------------------------------------------------------
export async function createServerClient() {
  const cookieStore = await cookies();

  let isSunShadeDomain = false;
  let isLocal = false;
  try {
    const headersList = await headers();
    const host = headersList.get('x-forwarded-host') || headersList.get('host') || '';
    isSunShadeDomain = host === 'sunshade.icu' || host.endsWith('.sunshade.icu');
    isLocal = isLocalDevelopment(host);
  } catch {
    isLocal = isLocalDevelopment();
  }

  const isSecure = process.env.NODE_ENV === 'production' && !isLocal;

  return createSSRServerClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    {
      db: { schema: 'public' }, // auth is always public schema
      cookieOptions: {
        path: '/',
        sameSite: 'lax',
        secure: isSecure,
        ...(isSunShadeDomain ? { domain: '.sunshade.icu' } : {}),
      },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, {
                ...options,
                path: '/',
                sameSite: 'lax',
                secure: isSecure,
                ...(isSunShadeDomain ? { domain: '.sunshade.icu' } : {}),
              })
            );
          } catch {
            // setAll can throw in read-only Server Component context — safe to ignore
          }
        },
      },
    }
  );
}

// ---------------------------------------------------------------------------
// Service Client (Route Handlers / server-only — bypasses RLS)
// Used for tenant provisioning and API-key-authenticated ingest.
// NEVER expose to browser.
// ---------------------------------------------------------------------------
export function createServiceClient() {
  return createSupabaseClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    {
      db: { schema: 'tracker' },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  );
}
