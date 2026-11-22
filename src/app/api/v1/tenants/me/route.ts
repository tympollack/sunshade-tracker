import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase-server';
import { getSessionUser } from '@/lib/auth-claims';
import {
  validateEfficiencyDashboardSchema,
  WIDGET_CATALOG_MAP,
} from '@/lib/efficiency-dashboard-schema';

function isFlatDashboardSchema(val: any): boolean {
  return Boolean(
    val &&
      typeof val === 'object' &&
      !Array.isArray(val) &&
      ('schema_version' in val || 'widgets' in val || 'default_views' in val)
  );
}

function normalizeDashboardPrefsMap(
  raw: any,
  fallbackSlug?: string
): Record<string, any> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  if (isFlatDashboardSchema(raw)) {
    return fallbackSlug ? { [fallbackSlug]: raw } : {};
  }
  const map: Record<string, any> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      map[k] = v;
    }
  }
  return map;
}

function resolveScopedDashboardPrefs(raw: any, tenantSlug: string): any {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  if (isFlatDashboardSchema(raw)) return raw;
  return raw[tenantSlug] || null;
}

function mergeSurfacePreferences(
  existing: any,
  incoming: any,
  targetSurface: string
): any {
  if (!existing && !incoming) return null;
  const prevWidgets = Array.isArray(existing?.widgets) ? existing.widgets : [];
  const otherWidgets = prevWidgets.filter((w: any) => {
    const def = WIDGET_CATALOG_MAP.get(w?.id);
    return def && def.surface !== targetSurface;
  });

  const incomingWidgets = Array.isArray(incoming?.widgets) ? incoming.widgets : [];
  const incomingSurfaceWidgets = incomingWidgets.filter((w: any) => {
    const def = WIDGET_CATALOG_MAP.get(w?.id);
    return def && def.surface === targetSurface;
  });

  const mergedWidgets = [...otherWidgets, ...incomingSurfaceWidgets];

  const prevViews =
    existing?.default_views && typeof existing.default_views === 'object'
      ? { ...existing.default_views }
      : {};

  if (
    incoming?.default_views &&
    typeof incoming.default_views === 'object' &&
    incoming.default_views[targetSurface]
  ) {
    prevViews[targetSurface] = incoming.default_views[targetSurface];
  } else if (!incoming || !incoming.default_views?.[targetSurface]) {
    delete prevViews[targetSurface];
  }

  const hasViews = Object.keys(prevViews).length > 0;
  if (mergedWidgets.length === 0 && !hasViews) {
    return null;
  }

  return {
    schema_version: incoming?.schema_version || existing?.schema_version || '1.0',
    ...(mergedWidgets.length > 0 ? { widgets: mergedWidgets } : {}),
    ...(hasViews ? { default_views: prevViews } : {}),
  };
}

/**
 * GET /api/v1/tenants/me
 *
 * Returns all workspaces the authenticated user is a member of,
 * enriched with their role in each workspace and that workspace's projects.
 *
 * Used by the dashboard header, WorkspaceSwitcher, and ProjectSwitcher.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { user, error: userErr } = await getSessionUser(supabase);
    const service = createServiceClient();

    const rawSlugHint =
      req.headers.get('x-tenant-slug') ||
      req.nextUrl.searchParams.get('tenant_slug') ||
      'sunshade';
    const tenantSlugHint = rawSlugHint?.replace(/^@/, '');

    const checkPublicGuestWorkspace = async (slugToTest: string) => {
      let q: any = service
        .from('tenants')
        .select('id, slug, name, tier, owner_id, settings, metadata, created_at, deleted_at')
        .eq('slug', slugToTest);
      if (typeof q.is === 'function') {
        q = q.is('deleted_at', null);
      }
      const { data: publicTenant } = await q.maybeSingle();
      if (
        publicTenant &&
        (publicTenant.slug === 'sunshade' ||
          publicTenant.tier === 'demo' ||
          Boolean(publicTenant.metadata?.is_public))
      ) {
        let demoProjects: any[] = [];
        const { data: demoData, error: demoErr } = await service
          .from('projects')
          .select('id, tenant_id, slug, name, description, settings, order_index, created_at')
          .eq('tenant_id', publicTenant.id)
          .is('deleted_at', null)
          .order('created_at', { ascending: true });

        if (demoErr) {
          const { data: demoFallback } = await service
            .from('projects')
            .select('id, tenant_id, slug, name, description, settings, created_at')
            .eq('tenant_id', publicTenant.id)
            .is('deleted_at', null)
            .order('created_at', { ascending: true });
          demoProjects = demoFallback || [];
        } else {
          demoProjects = demoData || [];
        }

        const sortedDemoProjects = (demoProjects || []).slice().sort((a: any, b: any) => {
          const aOrder = a.order_index ?? a.settings?.order_index ?? 999999;
          const bOrder = b.order_index ?? b.settings?.order_index ?? 999999;
          if (aOrder !== bOrder) return aOrder - bOrder;
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        });

        return {
          id: publicTenant.id,
          slug: publicTenant.slug,
          name: publicTenant.name,
          tier: publicTenant.tier,
          owner_id: publicTenant.owner_id,
          api_key_preview: null,
          created_at: publicTenant.created_at,
          role: 'viewer',
          member_since: publicTenant.created_at,
          projects: sortedDemoProjects || [],
          members: [],
          is_public: true,
          settings: publicTenant.settings || {},
          metadata: publicTenant.metadata || {},
        };
      }
      return null;
    };

    if (userErr || !user) {
      if (tenantSlugHint) {
        const publicWs = await checkPublicGuestWorkspace(tenantSlugHint);
        if (publicWs) {
          return NextResponse.json({
            user: null,
            is_guest: true,
            workspaces: [publicWs],
            primary_workspace: publicWs,
          });
        }
      }
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Fetch all active memberships with tenant details
    const { data: memberships, error: memberErr } = await service
      .from('tenant_members')
      .select(`
        role,
        created_at,
        tenants!inner (
          id,
          slug,
          name,
          tier,
          owner_id,
          settings,
          metadata,
          api_key,
          api_key_preview,
          created_at,
          deleted_at
        )
      `)
      .eq('user_id', user.id)
      .is('tenants.deleted_at', null)
      .order('created_at', { ascending: true });

    if (memberErr) {
      return NextResponse.json({ error: memberErr.message }, { status: 500 });
    }

    if (!memberships || memberships.length === 0) {
      if (tenantSlugHint) {
        const publicWs = await checkPublicGuestWorkspace(tenantSlugHint);
        if (publicWs) {
          const currentFullName =
            user.user_metadata?.full_name ||
            user.user_metadata?.name ||
            (user.email ? user.email.split('@')[0] : 'User');
          return NextResponse.json({
            user: {
              id: user.id,
              email: user.email,
              full_name: currentFullName,
              notification_preferences: {
                notify_in_app: true,
                notify_email: true,
                notify_on_assignment: true,
                notify_on_status_change: true,
                ...(user.user_metadata?.notification_preferences || {}),
              },
              efficiency_dashboard_preferences: resolveScopedDashboardPrefs(
                user.user_metadata?.efficiency_dashboard_preferences,
                tenantSlugHint || 'sunshade'
              ),
              efficiency_dashboard_preferences_map: normalizeDashboardPrefsMap(
                user.user_metadata?.efficiency_dashboard_preferences,
                tenantSlugHint || 'sunshade'
              ),
            },
            workspaces: [publicWs],
            primary_workspace: publicWs,
          });
        }
      }
      return NextResponse.json(
        { error: 'No workspaces found. Complete onboarding first.', needs_onboarding: true },
        { status: 404 }
      );
    }

    // Fetch all projects for all tenant IDs the user is a member of
    const tenantIds = memberships.map((m: any) => m.tenants.id);

    let allProjects: any[] = [];
    const { data: projData, error: projErr } = await service
      .from('projects')
      .select('id, tenant_id, slug, name, description, settings, order_index, created_at')
      .in('tenant_id', tenantIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    if (projErr) {
      const { data: fallbackProjects } = await service
        .from('projects')
        .select('id, tenant_id, slug, name, description, settings, created_at')
        .in('tenant_id', tenantIds)
        .is('deleted_at', null)
        .order('created_at', { ascending: true });
      allProjects = fallbackProjects || [];
    } else {
      allProjects = projData || [];
    }

    // Group projects by tenant
    const projectsByTenant: Record<string, any[]> = {};
    for (const p of allProjects || []) {
      if (!projectsByTenant[p.tenant_id]) projectsByTenant[p.tenant_id] = [];
      projectsByTenant[p.tenant_id].push(p);
    }

    // Sort projects for each tenant by order_index ASC
    for (const tid of Object.keys(projectsByTenant)) {
      projectsByTenant[tid].sort((a: any, b: any) => {
        const aOrder = a.order_index ?? a.settings?.order_index ?? 999999;
        const bOrder = b.order_index ?? b.settings?.order_index ?? 999999;
        if (aOrder !== bOrder) return aOrder - bOrder;
        return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
    }

    // Fetch all members for all tenant IDs the user is a member of
    const { data: allMembers } = await service
      .from('tenant_members')
      .select('id, tenant_id, user_id, role, created_at')
      .in('tenant_id', tenantIds);

    // Attempt to enrich member details from auth admin if available (with pagination)
    const usersMap = new Map<string, any>();
    try {
      if (typeof service.auth?.admin?.listUsers === 'function') {
        let page = 1;
        const perPage = 100;
        let hasMore = true;
        while (hasMore && page <= 10) {
          const { data: authUsers } = await service.auth.admin.listUsers({ page, perPage });
          if (authUsers?.users?.length) {
            for (const u of authUsers.users) {
              usersMap.set(u.id, u);
            }
            if (authUsers.users.length < perPage) {
              hasMore = false;
            } else {
              page++;
            }
          } else {
            hasMore = false;
          }
        }
      }
    } catch {
      // Ignore if service role cannot list users or not in admin context
    }

    const currentFullName =
      user.user_metadata?.full_name ||
      user.user_metadata?.name ||
      (user.email ? user.email.split('@')[0] : 'User');

    // Group members by tenant without exposing fellow members' private account emails
    const membersByTenant: Record<string, any[]> = {};
    for (const mem of allMembers || []) {
      if (!membersByTenant[mem.tenant_id]) membersByTenant[mem.tenant_id] = [];
      const memUser = usersMap.get(mem.user_id);
      membersByTenant[mem.tenant_id].push({
        id: mem.id,
        user_id: mem.user_id,
        role: mem.role,
        full_name:
          memUser?.user_metadata?.full_name ||
          memUser?.user_metadata?.name ||
          (mem.user_id === user.id ? currentFullName : null) ||
          (memUser?.email ? memUser.email.split('@')[0] : null) ||
          'Member',
      });
    }

    // Assemble workspaces with role + projects + members
    const workspaces = memberships.map((m: any) => {
      const tenant = m.tenants;
      return {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        tier: tenant.tier,
        owner_id: tenant.owner_id,
        // Mask API key — prefer persisted preview, fallback to masking api_key if legacy
        api_key_preview:
          tenant.api_key_preview ||
          (tenant.api_key ? `${tenant.api_key.substring(0, 20)}...` : null),
        created_at: tenant.created_at,
        role: m.role,
        member_since: m.created_at,
        projects: projectsByTenant[tenant.id] || [],
        members: membersByTenant[tenant.id] || [],
        is_public:
          tenant.slug === 'sunshade' ||
          tenant.tier === 'demo' ||
          Boolean(tenant.metadata?.is_public),
        settings: tenant.settings || {},
        metadata: tenant.metadata || {},
      };
    });

    // If visiting a public workspace where user is not a member, append it as a viewer
    if (tenantSlugHint && !workspaces.some((w: any) => w.slug === tenantSlugHint)) {
      const publicWs = await checkPublicGuestWorkspace(tenantSlugHint);
      if (publicWs) {
        workspaces.push(publicWs);
      }
    }

    let userMetadata = user.user_metadata || {};
    try {
      if (typeof service.auth?.admin?.getUserById === 'function') {
        const { data: freshUser } = await service.auth.admin.getUserById(user.id);
        if (freshUser?.user?.user_metadata) {
          userMetadata = freshUser.user.user_metadata;
        }
      }
    } catch {
      // Non-fatal, use token user_metadata
    }
    const notificationPreferences = {
      notify_in_app: true,
      notify_email: true,
      notify_on_assignment: true,
      notify_on_status_change: true,
      ...(userMetadata.notification_preferences || {}),
    };

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        full_name: currentFullName,
        notification_preferences: notificationPreferences,
        efficiency_dashboard_preferences: resolveScopedDashboardPrefs(
          userMetadata.efficiency_dashboard_preferences,
          tenantSlugHint || workspaces[0]?.slug || 'default'
        ),
        efficiency_dashboard_preferences_map: normalizeDashboardPrefsMap(
          userMetadata.efficiency_dashboard_preferences,
          tenantSlugHint || workspaces[0]?.slug || 'default'
        ),
      },
      workspaces,
      // Convenience: the first (primary) workspace
      primary_workspace: workspaces[0] ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

/**
 * PATCH /api/v1/tenants/me
 *
 * Updates current user settings (e.g. notification preferences) in auth metadata.
 */
export async function PATCH(req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const currentMeta = user.user_metadata || {};
    const currentPrefs = {
      notify_in_app: true,
      notify_email: true,
      notify_on_assignment: true,
      notify_on_status_change: true,
      ...(currentMeta.notification_preferences || {}),
    };

    const ALLOWED_PREF_KEYS = [
      'notify_in_app',
      'notify_email',
      'notify_on_assignment',
      'notify_on_status_change',
    ] as const;

    const rawPrefs = body.notification_preferences;
    const sanitizedIncoming: Partial<Record<typeof ALLOWED_PREF_KEYS[number], boolean>> = {};
    if (rawPrefs && typeof rawPrefs === 'object' && !Array.isArray(rawPrefs)) {
      for (const key of ALLOWED_PREF_KEYS) {
        if (typeof rawPrefs[key] === 'boolean') {
          sanitizedIncoming[key] = rawPrefs[key];
        }
      }
    }

    const updatedPrefs = {
      ...currentPrefs,
      ...sanitizedIncoming,
    };

    const rawTenantSlug =
      (typeof body.tenant_slug === 'string' && body.tenant_slug.trim()) ||
      req.headers.get('x-tenant-slug') ||
      req.nextUrl.searchParams.get('tenant_slug') ||
      'default';
    const cleanTenantSlug = rawTenantSlug.replace(/^@/, '').trim() || 'default';

    let updatedDashboardPrefsMap = normalizeDashboardPrefsMap(
      currentMeta.efficiency_dashboard_preferences
    );
    if ('efficiency_dashboard_preferences' in body) {
      const incomingDash = body.efficiency_dashboard_preferences;
      const targetSurface =
        typeof body.surface === 'string' && body.surface.trim() ? body.surface.trim() : undefined;

      if (incomingDash === null && !targetSurface) {
        delete updatedDashboardPrefsMap[cleanTenantSlug];
      } else {
        const existingWorkspacePref = updatedDashboardPrefsMap[cleanTenantSlug] || null;
        if (targetSurface && existingWorkspacePref) {
          const merged = mergeSurfacePreferences(existingWorkspacePref, incomingDash, targetSurface);
          if (merged === null) {
            delete updatedDashboardPrefsMap[cleanTenantSlug];
          } else {
            updatedDashboardPrefsMap[cleanTenantSlug] = merged;
          }
        } else if (incomingDash === null) {
          delete updatedDashboardPrefsMap[cleanTenantSlug];
        } else {
          const validation = validateEfficiencyDashboardSchema(incomingDash);
          if (!validation.valid) {
            return NextResponse.json(
              {
                error: `Invalid efficiency_dashboard_preferences: ${validation.errors
                  .map((e) => `${e.path}: ${e.message}`)
                  .join('; ')}`,
              },
              { status: 400 }
            );
          }
          updatedDashboardPrefsMap[cleanTenantSlug] = incomingDash;
        }
      }
    }

    const scopedDashboardPrefs = updatedDashboardPrefsMap[cleanTenantSlug] || null;

    const { error: updateErr } = await supabase.auth.updateUser({
      data: {
        ...currentMeta,
        notification_preferences: updatedPrefs,
        efficiency_dashboard_preferences: updatedDashboardPrefsMap,
      },
    });

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      notification_preferences: updatedPrefs,
      efficiency_dashboard_preferences: scopedDashboardPrefs,
      efficiency_dashboard_preferences_map: updatedDashboardPrefsMap,
      user: {
        id: user.id,
        email: user.email,
        notification_preferences: updatedPrefs,
        efficiency_dashboard_preferences: scopedDashboardPrefs,
        efficiency_dashboard_preferences_map: updatedDashboardPrefsMap,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

