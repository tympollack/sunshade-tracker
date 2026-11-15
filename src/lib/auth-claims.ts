/**
 * Resolves the authenticated user from local JWT claims using `supabase.auth.getClaims()`
 * to avoid an outbound network round-trip to `/auth/v1/user`.
 *
 * If `getClaims()` is not available (e.g. in test mocks where only `getUser` is provided),
 * falls back to `supabase.auth.getUser()`.
 */
export async function getSessionUser(
  supabase: any,
  options: { allowFallbackToGetUser?: boolean } = {}
): Promise<{ user: any | null; error: any | null }> {
  if (typeof supabase?.auth?.getClaims === 'function') {
    try {
      const { data: claimsData, error: claimsErr } = await supabase.auth.getClaims();
      if (claimsData?.claims?.sub) {
        const claims = claimsData.claims;
        const user = {
          id: claims.sub,
          email: claims.email as string | undefined,
          user_metadata: (claims.user_metadata || {}) as Record<string, any>,
          app_metadata: (claims.app_metadata || {}) as Record<string, any>,
          role: claims.role as string | undefined,
          ...claims,
        };
        return { user, error: null };
      }
      if (claimsErr && options.allowFallbackToGetUser && typeof supabase?.auth?.getUser === 'function') {
        const { data, error } = await supabase.auth.getUser();
        return { user: data?.user || null, error };
      }
      return { user: null, error: claimsErr || null };
    } catch (err) {
      if (options.allowFallbackToGetUser && typeof supabase?.auth?.getUser === 'function') {
        const { data, error } = await supabase.auth.getUser();
        return { user: data?.user || null, error };
      }
      return { user: null, error: err };
    }
  }

  // Fallback for environments / mocks where getClaims is not provided
  if (typeof supabase?.auth?.getUser === 'function') {
    const { data, error } = await supabase.auth.getUser();
    return { user: data?.user || null, error };
  }

  return { user: null, error: null };
}
