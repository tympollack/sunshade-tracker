/**
 * Environment & Hub SSO Routing Helpers for SunShade Tracker
 * Mirrors the pattern used in cozy/lib/env.ts.
 */

export function isStagingEnvironment(host?: string): boolean {
  const env = (
    process.env.NEXT_PUBLIC_ENVIRONMENT ||
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
    process.env.VERCEL_ENV ||
    ''
  ).toLowerCase();

  if (env === 'staging' || env === 'preview' || env === 'development') {
    return true;
  }

  const targetHost = (
    host ||
    (typeof window !== 'undefined' ? window.location.hostname : '')
  ).toLowerCase();

  return (
    targetHost.includes('-stag') ||
    targetHost.includes('staging') ||
    targetHost.endsWith('.vercel.app') ||
    targetHost.includes('localhost') ||
    targetHost.includes('127.0.0.1')
  );
}

export function isLocalDevelopment(host?: string): boolean {
  if (process.env.NODE_ENV === 'production') return false;
  if (process.env.NODE_ENV === 'development') return true;

  const rawHost = (
    host ||
    (typeof window !== 'undefined' ? window.location.host || window.location.hostname : '')
  ).toLowerCase().trim();

  if (!rawHost) return false;

  const targetHost = rawHost.startsWith('[')
    ? rawHost.replace(/\[|\]/g, '').split(':')[0]
    : rawHost.split(':')[0];

  return (
    targetHost === 'localhost' ||
    targetHost === '127.0.0.1' ||
    targetHost === '::1' ||
    targetHost === '0.0.0.0' ||
    targetHost.endsWith('.localhost') ||
    targetHost.endsWith('.local') ||
    targetHost.startsWith('192.168.') ||
    targetHost.startsWith('10.') ||
    /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(targetHost)
  );
}

export function isBypassAuthEnabled(): boolean {
  const bypassEnv = (
    process.env.NEXT_PUBLIC_BYPASS_AUTH ||
    process.env.BYPASS_AUTH ||
    ''
  ).toLowerCase().trim();

  if (bypassEnv === 'true' || bypassEnv === '1') return true;
  if (bypassEnv === 'false' || bypassEnv === '0') return false;
  if (process.env.NODE_ENV === 'development') return true;

  const env = (
    process.env.NEXT_PUBLIC_ENVIRONMENT ||
    process.env.NEXT_PUBLIC_VERCEL_ENV ||
    process.env.VERCEL_ENV ||
    ''
  ).toLowerCase().trim();

  return env === 'staging' || env === 'preview';
}

/**
 * Sanitizes redirect paths to prevent Open Redirect vulnerabilities.
 */
export function sanitizeNextUrl(next?: string | null, fallback: string = '/login'): string {
  if (!next || typeof next !== 'string') return fallback;
  const trimmed = next.trim();
  if (
    trimmed.startsWith('/') &&
    !trimmed.startsWith('//') &&
    !trimmed.startsWith('/\\') &&
    !trimmed.includes('://')
  ) {
    return trimmed;
  }
  return fallback;
}

export function getHubBaseUrl(host?: string): string {
  const isStag = isStagingEnvironment(host);
  // Prefer explicit env var, fall back to derived URL
  if (process.env.NEXT_PUBLIC_HUB_URL && !isStag) {
    return process.env.NEXT_PUBLIC_HUB_URL;
  }
  return isStag ? 'https://hub-stag.sunshade.icu' : 'https://hub.sunshade.icu';
}

/**
 * Constructs the full Hub SSO login URL with a return redirect.
 * Hub will authenticate the user and redirect back to returnToPath.
 */
export function getHubLoginUrl(returnToPath: string = '/login', host?: string): string {
  const hubBase = getHubBaseUrl(host);

  let targetReturnUrl = returnToPath;

  if (targetReturnUrl.startsWith('/')) {
    const safePath = sanitizeNextUrl(targetReturnUrl, '/login');

    // Build absolute URL for the callback
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    if (typeof window !== 'undefined') {
      targetReturnUrl = `${window.location.origin}${safePath}`;
    } else if (appUrl) {
      targetReturnUrl = `${appUrl}${safePath}`;
    } else if (host) {
      const proto = isLocalDevelopment(host) ? 'http' : 'https';
      targetReturnUrl = `${proto}://${host}${safePath}`;
    } else {
      const isStag = isStagingEnvironment(host);
      const defaultOrigin = isStag
        ? 'https://track-stag.sunshade.icu'
        : 'https://track.sunshade.icu';
      targetReturnUrl = `${defaultOrigin}${safePath}`;
    }
  } else {
    // Validate absolute URLs are trusted origins
    try {
      const parsed = new URL(targetReturnUrl);
      const hostname = parsed.hostname.toLowerCase();
      const isTrusted =
        hostname === 'sunshade.icu' ||
        hostname.endsWith('.sunshade.icu') ||
        hostname.endsWith('.vercel.app') ||
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        hostname.endsWith('.localhost');

      if (!isTrusted) {
        const isStag = isStagingEnvironment(host);
        const defaultOrigin = isStag
          ? 'https://track-stag.sunshade.icu'
          : 'https://track.sunshade.icu';
        targetReturnUrl = `${defaultOrigin}/login`;
      }
    } catch {
      targetReturnUrl = 'https://track.sunshade.icu/login';
    }
  }

  return `${hubBase}/login?redirect_to=${encodeURIComponent(targetReturnUrl)}`;
}
