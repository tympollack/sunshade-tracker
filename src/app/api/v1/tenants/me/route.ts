import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase-server';

/**
 * GET /api/v1/tenants/me
 *
 * Returns all workspaces the authenticated user is a member of,
 * enriched with their role in each workspace and that workspace's projects.
 *
 * Used by the dashboard header, WorkspaceSwitcher, and ProjectSwitcher.
 */
export async function GET(_req: NextRequest) {
  try {
    const supabase = await createServerClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = createServiceClient();

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
          api_key,
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
      return NextResponse.json(
        { error: 'No workspaces found. Complete onboarding first.', needs_onboarding: true },
        { status: 404 }
      );
    }

    // Fetch all projects for all tenant IDs the user is a member of
    const tenantIds = memberships.map((m: any) => m.tenants.id);

    const { data: allProjects } = await service
      .from('projects')
      .select('id, tenant_id, slug, name, description, created_at')
      .in('tenant_id', tenantIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });

    // Group projects by tenant
    const projectsByTenant: Record<string, any[]> = {};
    for (const p of allProjects || []) {
      if (!projectsByTenant[p.tenant_id]) projectsByTenant[p.tenant_id] = [];
      projectsByTenant[p.tenant_id].push(p);
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
        // Mask API key — first 20 chars only for identification
        api_key_preview: tenant.api_key ? `${tenant.api_key.substring(0, 20)}...` : null,
        created_at: tenant.created_at,
        role: m.role,
        member_since: m.created_at,
        projects: projectsByTenant[tenant.id] || [],
        members: membersByTenant[tenant.id] || [],
      };
    });

    const userMetadata = user.user_metadata || {};
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

    const { error: updateErr } = await supabase.auth.updateUser({
      data: {
        ...currentMeta,
        notification_preferences: updatedPrefs,
      },
    });

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      notification_preferences: updatedPrefs,
      user: {
        id: user.id,
        email: user.email,
        notification_preferences: updatedPrefs,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}

