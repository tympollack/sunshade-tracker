import { sanitizeNextUrl } from '@/lib/env';

/**
 * After authentication, determines where to redirect the user:
 * 1. Honors `nextParam` if provided and points to a valid destination (not /login or /onboarding).
 * 2. Looks up the user's workspaces in `tenant_members` (joining `tenants`).
 * 3. Falls back to checking `tenants` by `owner_id`.
 * 4. Resolves the first active project in `projects` using the UUID `tenant_id`.
 * 5. Returns `/${tenantSlug}/${projectSlug}` (or `/${tenantSlug}`).
 * 6. ONLY if no tenant exists at all does it return `/onboarding`.
 */
export async function resolvePostAuthDestination(
  userId: string,
  nextParam?: string | null,
  origin: string = ''
): Promise<URL> {
  const baseOrigin = origin || (process.env.NEXT_PUBLIC_APP_URL || 'https://track.sunshade.icu');

  // 1. If there's an explicit valid destination requested, honor it
  if (nextParam && nextParam !== '/login' && nextParam !== '/onboarding') {
    const cleanPath = sanitizeNextUrl(nextParam, '');
    if (cleanPath && cleanPath !== '/login' && cleanPath !== '/onboarding') {
      return new URL(cleanPath, baseOrigin);
    }
  }

  // 2. Look up the user's workspace
  try {
    const { createServiceClient } = await import('@/lib/supabase-server');
    const service = createServiceClient();

    // Check tenant_members first
    const { data: memberships } = await service
      .from('tenant_members')
      .select(`
        role,
        created_at,
        tenants!inner (
          id,
          slug,
          name,
          deleted_at
        )
      `)
      .eq('user_id', userId)
      .is('tenants.deleted_at', null)
      .order('created_at', { ascending: true })
      .limit(1);

    const firstMembership = memberships?.[0];
    let tenantId = (firstMembership as any)?.tenants?.id;
    let tenantSlug = (firstMembership as any)?.tenants?.slug;

    // Fallback: check if user is owner_id on tenants directly
    if (!tenantId) {
      const { data: ownedTenant } = await service
        .from('tenants')
        .select('id, slug')
        .eq('owner_id', userId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (ownedTenant) {
        tenantId = ownedTenant.id;
        tenantSlug = ownedTenant.slug;
      }
    }

    if (tenantId && tenantSlug) {
      // Fetch their first active project using the UUID tenant_id
      const { data: project } = await service
        .from('projects')
        .select('slug')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (project) {
        return new URL(`/${tenantSlug}/${project.slug}`, baseOrigin);
      }
      return new URL(`/${tenantSlug}`, baseOrigin);
    }
  } catch (err) {
    console.error('[Auth] Failed to resolve post-auth destination:', err);
  }

  // 3. New user with no tenant -> send to onboarding
  return new URL('/onboarding', baseOrigin);
}
