'use client';

import { useState } from 'react';
import { createBrowserClient } from '@/lib/supabase-browser';
import { ExternalLink, Mail, ArrowRight, Loader, CheckCircle, Zap, Shield } from 'lucide-react';

interface LoginFormProps {
  hubLoginUrl: string;
  isDevMode?: boolean;
  returnUrl?: string;
}

type State = 'idle' | 'loading' | 'sent' | 'error';

export function LoginForm({ hubLoginUrl, isDevMode, returnUrl = '/onboarding' }: LoginFormProps) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<State>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [showEmailForm, setShowEmailForm] = useState(false);

  const handleMagicLink = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setState('loading');
    setErrorMsg('');

    const supabase = createBrowserClient();
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback?next=${encodeURIComponent(returnUrl)}`,
      },
    });

    if (error) {
      setErrorMsg(error.message);
      setState('error');
    } else {
      setState('sent');
    }
  };

  if (state === 'sent') {
    return (
      <div className="p-8 rounded-2xl bg-slate-900/80 border border-slate-800 text-center space-y-3">
        <CheckCircle className="w-10 h-10 text-emerald-400 mx-auto" />
        <h2 className="text-lg font-bold text-white">Check your inbox</h2>
        <p className="text-sm text-slate-400">
          We sent a magic link to <strong className="text-emerald-400">{email}</strong>.
          Click it to sign in — no password needed.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Primary: Hub SSO */}
      <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-4">
        <div className="flex items-center space-x-2">
          <Shield className="w-5 h-5 text-emerald-400" />
          <h2 className="font-semibold text-white">SunShade Hub SSO</h2>
        </div>
        <p className="text-xs text-slate-400">
          Authenticate securely via your SunShade Hub account. Access is shared across all
          SunShade apps — one login for everything.
        </p>
        <a
          href={hubLoginUrl}
          className="w-full flex items-center justify-center space-x-2 py-3 px-5 rounded-xl font-semibold text-sm text-slate-950 bg-emerald-500 hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/20"
        >
          <span>Continue with SunShade Hub</span>
          <ExternalLink className="w-4 h-4" />
        </a>
      </div>

      {/* Dev Mode Bypass */}
      {isDevMode && (
        <div className="p-5 rounded-2xl bg-amber-950/30 border border-amber-700/40 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Zap className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-semibold text-amber-300">Dev Mode Bypass</span>
            </div>
            <span className="text-[10px] font-mono font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-900/60 text-amber-300">
              Local Only
            </span>
          </div>
          <p className="text-xs text-amber-400/80">
            Magic link sign-in (email OTP) — for local dev without Hub SSO.
          </p>

          {!showEmailForm ? (
            <button
              onClick={() => setShowEmailForm(true)}
              className="w-full py-2 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-300 text-xs font-medium hover:bg-amber-500/30 transition-colors"
            >
              Sign in with Email OTP
            </button>
          ) : (
            <form onSubmit={handleMagicLink} className="space-y-2">
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  placeholder="you@sunshade.icu"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={state === 'loading'}
                  className="w-full pl-9 pr-4 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>
              {errorMsg && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded px-3 py-1.5">
                  {errorMsg}
                </p>
              )}
              <button
                type="submit"
                disabled={state === 'loading' || !email.trim()}
                className="w-full flex items-center justify-center space-x-2 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-semibold disabled:opacity-50 transition-colors"
              >
                {state === 'loading' ? (
                  <><Loader className="w-3.5 h-3.5 animate-spin" /><span>Sending…</span></>
                ) : (
                  <><span>Send Magic Link</span><ArrowRight className="w-3.5 h-3.5" /></>
                )}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
