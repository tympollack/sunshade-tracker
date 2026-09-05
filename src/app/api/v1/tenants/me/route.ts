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

    // Assemble workspaces with role + projects
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
      };
    });

    return NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
      },
      workspaces,
      // Convenience: the first (primary) workspace
      primary_workspace: workspaces[0] ?? null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
