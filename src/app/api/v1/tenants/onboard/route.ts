import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase-server';
import { getTemplateById, SCHEMA_TEMPLATES } from '@/lib/schema-templates';
import { z } from 'zod';

const OnboardSchema = z.object({
  /** Human-readable organization / company name */
  org_name: z.string().min(2).max(80),
  /** URL-safe workspace slug (auto-derived from org_name if not provided) */
  slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  /** First project name */
  project_name: z.string().min(2).max(80),
  /** First project slug */
  project_slug: z
    .string()
    .min(2)
    .max(40)
    .regex(/^[a-z0-9-]+$/)
    .refine((s) => s !== 'all' && s !== 'portfolio', {
      message: 'The project slugs "all" and "portfolio" are reserved for workspace overview.',
    }),
  /** Schema template ID from SCHEMA_TEMPLATES */
  template_id: z.enum(['software', 'marketing', 'operations', 'custom']).default('software'),
  /** Billing tier — defaults to 'free' */
  tier: z.enum(['free', 'pro', 'enterprise']).default('free'),
});

/**
 * POST /api/v1/tenants/onboard
 *
 * Provisions a new tenant for the authenticated Hub user.
 * Creates: tracker.tenants row + first tracker.projects row.
 * Returns the tenant, project, and the generated API key (shown once).
 *
 * If the user already has a tenant, returns 409 Conflict.
 */
export async function POST(req: NextRequest) {
  try {
    // Require a valid Supabase session (from Hub SSO)
    const supabase = await createServerClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json(
        { error: 'Authentication required. Sign in via SunShade Hub first.' },
        { status: 401 }
      );
    }

    const body = await req.json();
    const parsed = OnboardSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { org_name, slug, project_name, project_slug, template_id, tier } = parsed.data;
    const service = createServiceClient();

    // Check slug uniqueness (global — slugs must be unique across all tenants)
    const { data: slugConflict } = await service
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .maybeSingle();

    if (slugConflict) {
      return NextResponse.json(
        { error: `Workspace slug "${slug}" is already taken. Choose a different one.` },
        { status: 409 }
      );
    }

    // Generate a unique API key: tk_live_{slug}_{random}
    const randomSuffix = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    const apiKey = `tk_live_${slug}_${randomSuffix}`;

    // Create the tenant
    const { data: tenant, error: tenantErr } = await service
      .from('tenants')
      .insert({
        slug,
        name: org_name,
        api_key: apiKey,
        owner_id: user.id,
        tier,
        metadata: {
          onboarded_at: new Date().toISOString(),
          onboarding_template: template_id,
        },
      })
      .select()
      .single();

    if (tenantErr || !tenant) {
      console.error('[Onboard] Tenant creation failed:', tenantErr);
      return NextResponse.json(
        { error: tenantErr?.message || 'Failed to create tenant' },
        { status: 500 }
      );
    }

    // Seed creator as 'owner' in tenant_members
    const { error: memberErr } = await service
      .from('tenant_members')
      .insert({ tenant_id: tenant.id, user_id: user.id, role: 'owner' });

    if (memberErr) {
      console.error('[Onboard] Member seed failed:', memberErr);
      await service.from('tenants').delete().eq('id', tenant.id);
      return NextResponse.json(
        { error: 'Failed to set up workspace membership' },
        { status: 500 }
      );
    }

    // Get the selected schema template
    const template = getTemplateById(template_id);
    const settings = template?.settings || SCHEMA_TEMPLATES[0].settings;

    // Create the first project
    const { data: project, error: projectErr } = await service
      .from('projects')
      .insert({
        tenant_id: tenant.id,
        name: project_name,
        slug: project_slug,
        description: `First project for ${org_name}`,
        app_id: 'tracker',
        settings,
      })
      .select()
      .single();

    if (projectErr || !project) {
      console.error('[Onboard] Project creation failed:', projectErr);
      // Roll back the tenant if project creation fails
      await service.from('tenants').delete().eq('id', tenant.id);
      return NextResponse.json(
        { error: projectErr?.message || 'Failed to create first project' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        tenant: {
          id: tenant.id,
          slug: tenant.slug,
          name: tenant.name,
          tier: tenant.tier,
        },
        project: {
          id: project.id,
          slug: project.slug,
          name: project.name,
        },
        // API key is returned ONCE here — store it securely
        api_key: apiKey,
        workspace_url: `/${tenant.slug}/${project.slug}`,
      },
      { status: 201 }
    );
  } catch (err: any) {
    console.error('[Onboard] Unexpected error:', err);
    return NextResponse.json(
      { error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
