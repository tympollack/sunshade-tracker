import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import Link from 'next/link';
import { createServerClient } from '@/lib/supabase-server';
import {
  getHubLoginUrl,
  isBypassAuthEnabled,
  isLocalDevelopment,
  sanitizeNextUrl,
} from '@/lib/env';
import { resolvePostAuthDestination } from '@/lib/auth';
import { SunShadeLogo } from '@/components/SunShadeLogo';
import { LoginForm } from './LoginForm';

export const metadata = {
  title: 'Sign In — SunShade Tracker',
  description: 'Sign in to your SunShade Tracker workspace via Hub SSO.',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  const params = searchParams ? await searchParams : {};
  const rawNext = typeof params.next === 'string' ? params.next : null;
  const nextParam = sanitizeNextUrl(rawNext, '');
  const errorParam = typeof params.error === 'string' ? params.error : null;

  // Already authenticated — resolve active workspace and redirect
  if (user) {
    const destination = await resolvePostAuthDestination(user.id, nextParam || null);
    redirect(destination.pathname + destination.search);
  }

  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || '';
  const proto = headersList.get('x-forwarded-proto') || (isLocalDevelopment(host) ? 'http' : 'https');

  // Build the absolute callback URL that Hub will redirect back to
  const callbackQuery = nextParam ? `?next=${encodeURIComponent(nextParam)}` : '';
  const callbackUrl = host
    ? `${proto}://${host}/auth/callback${callbackQuery}`
    : `/auth/callback${callbackQuery}`;

  const hubLoginUrl = getHubLoginUrl(callbackUrl, host);
  const isBypass = isBypassAuthEnabled();

  // In production (non-dev, non-bypass), skip the form and go straight to Hub SSO
  if (!isBypass && typeof params.direct === 'undefined') {
    redirect(hubLoginUrl);
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[#090d16]">
      <div className="w-full max-w-md space-y-6">
        {/* Brand */}
        <div className="text-center space-y-3">
          <SunShadeLogo variant="stacked" size="lg" showTagline href="/" />
          <p className="text-sm text-slate-400">
            Enterprise work item tracking powered by the SunShade ecosystem
          </p>
        </div>

        {/* Error Banner */}
        {errorParam && (
          <div className="p-3 rounded-lg bg-red-950/60 border border-red-800/60 text-sm text-red-300">
            {errorParam === 'auth-callback-failed'
              ? 'Authentication failed. Please try signing in again.'
              : errorParam}
          </div>
        )}

        <LoginForm hubLoginUrl={hubLoginUrl} isDevMode={isBypass} returnUrl={nextParam} />

        <p className="text-center text-xs text-slate-500">
          Protected by Row-Level Security & SunShade Hub SSO
        </p>
      </div>
    </div>
  );
}
