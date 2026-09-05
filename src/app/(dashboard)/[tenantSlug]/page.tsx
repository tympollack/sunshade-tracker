import { redirect } from 'next/navigation';
import { createServerClient, createServiceClient } from '@/lib/supabase-server';
import { EmptyWorkspaceView } from './EmptyWorkspaceView';

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

/**
 * Tenant root redirect: /{tenantSlug} → /{tenantSlug}/{firstProjectSlug}
 * If no projects exist in the tenant (e.g. user skipped during onboarding),
 * renders EmptyWorkspaceView instead of redirecting to /onboarding.
 */
export default async function TenantRootPage({ params }: PageProps) {
  const { tenantSlug } = await params;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=/${tenantSlug}`);
  }

  const service = createServiceClient();

  // Find the tenant (active only)
  const { data: tenant } = await service
    .from('tenants')
    .select('id, slug, name, api_key')
    .eq('slug', tenantSlug)
    .is('deleted_at', null)
    .single();

  if (!tenant) {
    redirect('/onboarding');
  }

  // Get first active project
  const { data: project } = await service
    .from('projects')
    .select('slug')
    .eq('tenant_id', tenant.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle();

  if (project) {
    redirect(`/${tenantSlug}/${project.slug}`);
  }

  // Fetch workspaces the user is a member of for the WorkspaceSwitcher
  const { data: memberships } = await service
    .from('tenant_members')
    .select('role, tenants!inner(id, slug, name, tier)')
    .eq('user_id', user.id)
    .is('tenants.deleted_at', null);

  const workspaces = (memberships || []).map((m: any) => ({
    id: m.tenants.id,
    slug: m.tenants.slug,
    name: m.tenants.name,
    tier: m.tenants.tier,
    role: m.role,
    projects: [],
  }));

  // Tenant exists but no projects yet — render empty workspace view
  return <EmptyWorkspaceView tenant={tenant} workspaces={workspaces} />;
}
