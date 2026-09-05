import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase-server';
import { getTemplateById, SCHEMA_TEMPLATES } from '@/lib/schema-templates';
import { z } from 'zod';

const OnboardSchema = z.object({
  /** Human-readable organization / company name */
  org_name: z.string().min(2).max(80),
  /** URL-safe workspace slug (auto-derived from org_name if not provided) */
  slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/, 'Slug must be lowercase alphanumeric with hyphens'),
  /** Billing tier — defaults to 'free' */
  tier: z.enum(['free', 'pro', 'enterprise']).default('free'),
  /** Skip project creation (creates workspace and goes straight to API key) */
  skip_project: z.boolean().optional().default(false),
  /** First project name (required if skip_project is false) */
  project_name: z.string().min(2).max(80).optional(),
  /** First project slug (required if skip_project is false) */
  project_slug: z.string().min(2).max(40).regex(/^[a-z0-9-]+$/).optional(),
  /** Schema template ID from SCHEMA_TEMPLATES */
  template_id: z.enum(['software', 'marketing', 'operations', 'custom']).optional().default('software'),
  /** Custom schema settings uploaded via JSON */
  custom_settings: z.any().optional(),
  /** Initial work items uploaded via JSON */
  initial_items: z.array(z.any()).optional(),
});

/**
 * POST /api/v1/tenants/onboard
 *
 * Provisions a new tenant for the authenticated Hub user.
 * Creates: tracker.tenants row (+ optional tracker.projects row).
 * Returns the tenant, project (if created), and the generated API key (shown once).
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

    const {
      org_name,
      slug,
      tier,
      skip_project,
      project_name,
      project_slug,
      template_id,
      custom_settings,
      initial_items,
    } = parsed.data;

    // Validate project fields if not skipping
    if (!skip_project && (!project_name || !project_slug)) {
      return NextResponse.json(
        { error: 'Project name and slug are required unless skipping project creation.' },
        { status: 400 }
      );
    }

    const service = createServiceClient();

    // 1. Check workspace slug uniqueness in DB (excluding soft-deleted tenants)
    const { data: slugConflict } = await service
      .from('tenants')
      .select('id')
      .eq('slug', slug)
      .is('deleted_at', null)
      .maybeSingle();

    if (slugConflict) {
      return NextResponse.json(
        { error: `Workspace slug "${slug}" is already taken. Choose a different one.` },
        { status: 409 }
      );
    }

    // 2. Check project slug uniqueness in DB if project is being created
    if (!skip_project && project_slug) {
      const { data: projectSlugConflict } = await service
        .from('projects')
        .select('id')
        .eq('slug', project_slug)
        .is('deleted_at', null)
        .maybeSingle();

      if (projectSlugConflict) {
        return NextResponse.json(
          { error: `Project slug "${project_slug}" is already taken in the database. Choose a different one.` },
          { status: 409 }
        );
      }
    }

    // 3. Generate a unique API key: tk_live_{slug}_{random}
    const randomSuffix = crypto.randomUUID().replace(/-/g, '').substring(0, 16);
    const apiKey = `tk_live_${slug}_${randomSuffix}`;

    // 4. Create the tenant
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
          onboarding_template: skip_project ? 'none' : template_id,
          created_via: custom_settings ? 'json_upload' : 'wizard',
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

    // 5. Seed creator as 'owner' in tenant_members
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

    // 6. If skipping project setup, return immediately with the API key
    if (skip_project) {
      return NextResponse.json(
        {
          success: true,
          tenant: {
            id: tenant.id,
            slug: tenant.slug,
            name: tenant.name,
            tier: tenant.tier,
          },
          project: null,
          api_key: apiKey,
          workspace_url: `/${tenant.slug}`,
        },
        { status: 201 }
      );
    }

    // 7. Resolve project settings (custom settings from JSON upload take priority)
    let settings = custom_settings;
    if (!settings || !Array.isArray(settings.hierarchy) || !Array.isArray(settings.statuses)) {
      const template = getTemplateById(template_id || 'software');
      settings = template?.settings || SCHEMA_TEMPLATES[0].settings;
    }

    // 8. Create the first project
    const { data: project, error: projectErr } = await service
      .from('projects')
      .insert({
        tenant_id: tenant.id,
        name: project_name!,
        slug: project_slug!,
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

    // 9. If initial items were provided in uploaded JSON document, insert them
    if (Array.isArray(initial_items) && initial_items.length > 0) {
      const defaultStatus = settings.statuses?.[0]?.id || 'not_started';
      const defaultType = settings.hierarchy?.[settings.hierarchy.length - 1]?.type || 'task';

      const itemsToInsert = initial_items.map((it: any, idx: number) => ({
        tenant_id: tenant.id,
        project_id: project.id,
        title: it.title || `Item ${idx + 1}`,
        description: it.description || null,
        item_type: it.item_type || defaultType,
        status: it.status || defaultStatus,
        assignee: it.assignee || null,
        external_ref_id: it.external_ref_id || null,
        order_index: typeof it.order_index === 'number' ? it.order_index : (idx + 1) * 1000.0,
        metadata: it.metadata || {},
      }));

      const { error: itemsErr } = await service.from('work_items').insert(itemsToInsert);
      if (itemsErr) {
        console.warn('[Onboard] Initial items ingestion failed (non-fatal):', itemsErr);
      }
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
