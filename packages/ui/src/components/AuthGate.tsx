'use client';
import React, { useEffect, useState } from 'react';
import { supabase } from '@sunshade/supabase';

function isTrustedRedirectHost(rawHost: string): boolean {
  if (!rawHost || typeof rawHost !== 'string') return false;
  const host = rawHost.toLowerCase().trim();

  // 1. SunShade root domain and all subdomains
  if (host === 'sunshade.icu' || host.endsWith('.sunshade.icu')) {
    return true;
  }

  // 2. Local development
  if (host === 'localhost' || host === '127.0.0.1') {
    return true;
  }

  // 3. SunShade Vercel Organization preview deployments
  if (
    host.endsWith('-sunshade-systems.vercel.app') ||
    host.endsWith('.sunshade-systems.vercel.app') ||
    host === 'sunshade-systems.vercel.app'
  ) {
    return true;
  }

  // 4. Known SunShade ecosystem app Vercel preview deployment patterns
  if (
    /^(cozy|chess|pukhuk|critterverse|sunshade)-[a-z0-9-]+\.vercel\.app$/.test(host) ||
    /^(cozy|chess|pukhuk|critterverse|sunshade)\.vercel\.app$/.test(host)
  ) {
    return true;
  }

  return false;
}

function getSafeRedirectUrlFromSearch(session?: any): string | null {
  if (typeof window === 'undefined') return null;
  try {
    const searchParams = new URLSearchParams(window.location.search);
    const rawRedirect =
      searchParams.get('redirect_to') ||
      searchParams.get('redirect') ||
      searchParams.get('returnTo') ||
      searchParams.get('return_to') ||
      searchParams.get('next') ||
      searchParams.get('callbackUrl');

    if (!rawRedirect || typeof rawRedirect !== 'string') return null;
    const clean = rawRedirect.trim();
    if (clean.startsWith('/')) return clean;

    const parsed = new URL(clean);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return null;
    }

    if (isTrustedRedirectHost(parsed.hostname)) {
      const host = parsed.hostname.toLowerCase();
      // If on sunshade.icu, shared cookie works natively
      if (host === 'sunshade.icu' || host.endsWith('.sunshade.icu')) {
        return parsed.toString();
      }

      // For cross-domain environments, transfer session tokens to /auth/callback
      if (session?.access_token && session?.refresh_token) {
        const callbackUrl = new URL('/auth/callback', parsed.origin);
        callbackUrl.searchParams.set('access_token', session.access_token);
        callbackUrl.searchParams.set('refresh_token', session.refresh_token);
        const nextPath = parsed.pathname + parsed.search;
        if (nextPath && nextPath !== '/') {
          callbackUrl.searchParams.set('next', nextPath);
        }
        return callbackUrl.toString();
      }

      return parsed.toString();
    }
  } catch {
    // Ignore error
  }
  return null;
}

export const LoginForm = () => {
  const [authMode, setAuthMode] = useState<'password' | 'code' | 'request'>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authCode, setAuthCode] = useState('');
  const [requestEmail, setRequestEmail] = useState('');
  const [requestNote, setRequestNote] = useState('');
  const [requestSubmitted, setRequestSubmitted] = useState(false);
  const [requestResponseMessage, setRequestResponseMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmitPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    const { data: authData, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setError(error.message);
      setSubmitting(false);
      return;
    }

    const targetRedirect = getSafeRedirectUrlFromSearch(authData?.session);
    if (targetRedirect) {
      window.location.href = targetRedirect;
      return;
    }

    setSubmitting(false);
  };

  const handleSubmitCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    const targetRedirect = getSafeRedirectUrlFromSearch();

    try {
      const res = await fetch('/api/auth/claim-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: authCode, redirect_to: targetRedirect }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to authenticate with user code.');
      }

      if (data.redirect_url) {
        window.location.href = data.redirect_url;
      }
    } catch (err: any) {
      setError(err.message || 'Invalid or expired auth code.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const res = await fetch('/api/auth/request-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: requestEmail, note: requestNote }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to submit code request.');
      }

      setRequestResponseMessage(data.message || 'Your request has been logged. An admin will review it and issue your 8-character auth code.');
      setRequestSubmitted(true);
    } catch (err: any) {
      setError(err.message || 'Failed to submit request.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', width: '100%', background: '#111111', color: 'white', fontFamily: 'sans-serif' }}>
      <img src="/logo.png" alt="SunShade Systems" style={{ width: 300, height: 'auto', marginBottom: 20 }} />

      {/* Mode Switcher Tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 20, background: '#1c1c1c', padding: 4, borderRadius: 8, border: '1px solid #333' }}>
        <button
          type="button"
          onClick={() => { setAuthMode('password'); setError(null); }}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: 'none',
            background: authMode === 'password' ? '#ea580c' : 'transparent',
            color: authMode === 'password' ? '#ffffff' : '#a1a1aa',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Password Sign In
        </button>
        <button
          type="button"
          onClick={() => { setAuthMode('code'); setError(null); }}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: 'none',
            background: authMode === 'code' ? '#ea580c' : 'transparent',
            color: authMode === 'code' ? '#ffffff' : '#a1a1aa',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Join with Code
        </button>
        <button
          type="button"
          onClick={() => { setAuthMode('request'); setError(null); setRequestSubmitted(false); }}
          style={{
            padding: '6px 14px',
            borderRadius: 6,
            border: 'none',
            background: authMode === 'request' ? '#27272a' : 'transparent',
            color: authMode === 'request' ? '#ffffff' : '#a1a1aa',
            fontSize: 13,
            fontWeight: 600,
            cursor: 'pointer',
            transition: 'all 0.2s',
          }}
        >
          Request a Code
        </button>
      </div>

      {authMode === 'password' && (
        <form onSubmit={handleSubmitPassword} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 300 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ padding: '10px 14px', borderRadius: 6, border: '1px solid #333', background: '#1a1a1a', color: 'white', fontSize: 14, outline: 'none' }}
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ padding: '10px 14px', borderRadius: 6, border: '1px solid #333', background: '#1a1a1a', color: 'white', fontSize: 14, outline: 'none' }}
          />
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: -6, marginBottom: -2 }}>
            <a
              href={typeof window !== 'undefined' ? `/forgot-password${window.location.search}` : '/forgot-password'}
              style={{ color: '#ea580c', fontSize: 12, textDecoration: 'none', fontWeight: 500 }}
            >
              Forgot password?
            </a>
          </div>
          {error && <div style={{ color: '#ef4444', fontSize: 12 }}>{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            style={{ padding: '11px 0', borderRadius: 6, border: 'none', background: submitting ? '#7c3010' : '#ea580c', color: 'white', fontSize: 15, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer' }}
          >
            {submitting ? 'Signing in...' : 'Sign In'}
          </button>
        </form>
      )}

      {authMode === 'code' && (
        <form onSubmit={handleSubmitCode} style={{ display: 'flex', flexDirection: 'column', gap: 12, width: 300 }}>
          <div style={{ textAlign: 'center', marginBottom: 4 }}>
            <p style={{ margin: 0, color: '#a1a1aa', fontSize: 13 }}>Enter your 8-character user code to join the Hub.</p>
          </div>
          <input
            type="text"
            placeholder="8-Character Code (e.g. ASDF1234)"
            value={authCode}
            onChange={(e) => setAuthCode(e.target.value.toUpperCase().trim())}
            maxLength={8}
            required
            style={{
              padding: '12px 14px',
              borderRadius: 6,
              border: '1px solid #ea580c',
              background: '#1a1a1a',
              color: '#ffffff',
              fontSize: 16,
              fontWeight: 700,
              letterSpacing: '2px',
              textAlign: 'center',
              outline: 'none',
              textTransform: 'uppercase',
            }}
          />
          {error && <div style={{ color: '#ef4444', fontSize: 12, textAlign: 'center' }}>{error}</div>}
          <button
            type="submit"
            disabled={submitting}
            style={{ padding: '11px 0', borderRadius: 6, border: 'none', background: submitting ? '#7c3010' : '#ea580c', color: 'white', fontSize: 15, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer' }}
          >
            {submitting ? 'Verifying Code...' : 'Join Hub with Code'}
          </button>
        </form>
      )}

      {authMode === 'request' && (
        <div style={{ width: 320 }}>
          {requestSubmitted ? (
            <div style={{ background: '#161616', border: `1px solid ${requestResponseMessage?.toLowerCase().includes('already') ? '#f59e0b' : '#22c55e'}`, borderRadius: 8, padding: 16, textAlign: 'center' }}>
              <div style={{ color: requestResponseMessage?.toLowerCase().includes('already') ? '#f59e0b' : '#22c55e', fontWeight: 700, fontSize: 16, marginBottom: 8 }}>
                {requestResponseMessage?.toLowerCase().includes('already') ? 'Request Already Logged!' : 'Request Submitted!'}
              </div>
              <p style={{ color: '#a1a1aa', fontSize: 13, margin: 0, lineHeight: 1.5 }}>
                {requestResponseMessage || 'Your request has been logged. An admin will review it and issue your 8-character auth code.'}
              </p>
            </div>
          ) : (
            <form onSubmit={handleRequestCode} style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ textAlign: 'center', marginBottom: 4 }}>
                <p style={{ margin: 0, color: '#a1a1aa', fontSize: 13 }}>Request an 8-character auth code from the admins to join the Hub.</p>
              </div>
              <input
                type="email"
                placeholder="Your Email"
                value={requestEmail}
                onChange={(e) => setRequestEmail(e.target.value)}
                required
                style={{ padding: '10px 14px', borderRadius: 6, border: '1px solid #333', background: '#1a1a1a', color: 'white', fontSize: 14, outline: 'none' }}
              />
              <textarea
                placeholder="Reason or Note (Optional)"
                value={requestNote}
                onChange={(e) => setRequestNote(e.target.value)}
                maxLength={500}
                rows={3}
                style={{ padding: '10px 14px', borderRadius: 6, border: '1px solid #333', background: '#1a1a1a', color: 'white', fontSize: 13, outline: 'none', resize: 'none' }}
              />
              {error && <div style={{ color: '#ef4444', fontSize: 12 }}>{error}</div>}
              <button
                type="submit"
                disabled={submitting}
                style={{ padding: '11px 0', borderRadius: 6, border: 'none', background: submitting ? '#3f3f46' : '#27272a', color: 'white', fontSize: 14, fontWeight: 600, cursor: submitting ? 'not-allowed' : 'pointer' }}
              >
                {submitting ? 'Submitting Request...' : 'Submit Request'}
              </button>
            </form>
          )}
        </div>
      )}
      
      {/* Brand Footer */}
      <div style={{ marginTop: 24, fontSize: 11, color: '#52525b', fontFamily: 'monospace' }}>
        SunShade Systems • Central SSO Gateway
      </div>
    </div>
  );
};

export const AuthGate = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
        
      if (error && error.code !== 'PGRST116') {
        console.error('Error fetching profile:', error);
      }
      setProfile(data);
    } catch (err) {
      console.error('Error in fetchProfile:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timeout = setTimeout(() => {
      setLoading((prev) => {
        if (prev) setAuthError('Session init timed out. Check Supabase env vars.');
        return false;
      });
    }, 8000);

    supabase.auth.getSession()
      .then(({ data: { session } }) => {
        clearTimeout(timeout);
        setSession(session);
        if (session?.user) {
          const targetUrl = getSafeRedirectUrlFromSearch(session);
          if (targetUrl) {
            window.location.href = targetUrl;
            return;
          }
          fetchProfile(session.user.id);
        } else {
          setLoading(false);
        }
      })
      .catch((err: unknown) => {
        clearTimeout(timeout);
        console.error('[AuthGate] getSession failed:', err);
        setAuthError(err instanceof Error ? err.message : 'Failed to initialize session');
        setLoading(false);
      });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      if (session?.user) {
        const targetUrl = getSafeRedirectUrlFromSearch(session);
        if (targetUrl) {
          window.location.href = targetUrl;
          return;
        }
        if (event === 'SIGNED_IN') {
          setLoading(true);
        }
        fetchProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => {
      clearTimeout(timeout);
      subscription.unsubscribe();
    };
  }, []);

  if (authError) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100%', background: '#111111', color: 'white', fontFamily: 'sans-serif' }}>
      <img src="/logo.png" alt="SunShade Systems" style={{ width: 300, height: 'auto', marginBottom: 20 }} />
      <div style={{ color: '#ef4444', marginBottom: 8, fontWeight: 600 }}>Auth Error</div>
      <div style={{ color: '#a1a1aa', fontSize: 13, maxWidth: 400, textAlign: 'center' }}>{authError}</div>
    </div>
  );

  if (loading) return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', width: '100%', background: '#111111', color: 'white', fontFamily: 'sans-serif' }}>
      <img src="/logo.png" alt="SunShade Systems" style={{ width: 300, height: 'auto', marginBottom: 20 }} />
      <div style={{ color: '#a1a1aa' }}>Initializing Secure Session...</div>
    </div>
  );

  if (!session) {
    return <LoginForm />;
  }

  // Allow 'pending_invite' users to view the dashboard (guest mode)
  return (
    <>
      {children}
    </>
  );
};

export default AuthGate;
