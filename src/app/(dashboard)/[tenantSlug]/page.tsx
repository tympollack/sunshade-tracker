import { redirect } from 'next/navigation';
import { createServerClient, createServiceClient } from '@/lib/supabase-server';

interface PageProps {
  params: Promise<{ tenantSlug: string }>;
}

/**
 * Tenant root redirect: /{tenantSlug} → /{tenantSlug}/{firstProjectSlug}
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
    .select('id, slug')
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
    .single();

  if (project) {
    redirect(`/${tenantSlug}/${project.slug}`);
  }

  // Tenant exists but no projects yet
  redirect('/onboarding');
}
