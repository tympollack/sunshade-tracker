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
  const nextParam = sanitizeNextUrl(
    typeof params.next === 'string' ? params.next : null,
    '/onboarding'
  );
  const errorParam = typeof params.error === 'string' ? params.error : null;

  // Already authenticated — send to workspace or onboarding
  if (user) {
    redirect(nextParam);
  }

  const headersList = await headers();
  const host = headersList.get('x-forwarded-host') || headersList.get('host') || '';
  const proto = headersList.get('x-forwarded-proto') || (isLocalDevelopment(host) ? 'http' : 'https');

  // Build the absolute callback URL that Hub will redirect back to
  const callbackUrl = host
    ? `${proto}://${host}/auth/callback?next=${encodeURIComponent(nextParam)}`
    : `/auth/callback?next=${encodeURIComponent(nextParam)}`;

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
          <Link href="/" className="inline-flex items-center space-x-2 group">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-sm group-hover:bg-emerald-500/30 transition-colors">
              ST
            </div>
            <span className="font-bold text-white text-xl tracking-tight">
              SunShade <span className="text-emerald-400">Tracker</span>
            </span>
          </Link>
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
