import { NextRequest, NextResponse } from 'next/server';
import { createServiceClient } from '@/lib/supabase-server';

/**
 * GET /api/v1/tenants/validate-slug?type=workspace&slug=acme
 * GET /api/v1/tenants/validate-slug?type=project&slug=backend&workspace_slug=acme
 *
 * Validates whether a workspace slug or project slug is unique in the DB
 * before allowing the user to progress through onboarding.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') || 'workspace';
    const slug = (searchParams.get('slug') || '').trim().toLowerCase();
    const workspaceSlug = (searchParams.get('workspace_slug') || '').trim().toLowerCase();

    if (!slug) {
      return NextResponse.json({ valid: false, error: 'Slug is required' }, { status: 400 });
    }

    // Slug format validation: lowercase alphanumeric and hyphens, 2-40 chars
    const slugRegex = /^[a-z0-9-]+$/;
    if (!slugRegex.test(slug)) {
      return NextResponse.json(
        { valid: false, error: 'Slug must contain only lowercase letters, numbers, and hyphens' },
        { status: 200 }
      );
    }

    if (slug.length < 2) {
      return NextResponse.json(
        { valid: false, error: 'Slug must be at least 2 characters long' },
        { status: 200 }
      );
    }

    if (slug.length > 40) {
      return NextResponse.json(
        { valid: false, error: 'Slug cannot exceed 40 characters' },
        { status: 200 }
      );
    }

    const service = createServiceClient();

    if (type === 'workspace') {
      // Reserved system slugs
      const reservedSlugs = [
        'api', 'auth', 'login', 'logout', 'onboarding', 'settings',
        'admin', 'dashboard', 'public', 'system', 'track', 'hub'
      ];
      if (reservedSlugs.includes(slug)) {
        return NextResponse.json(
          { valid: false, error: `Workspace slug "${slug}" is reserved. Choose a different one.` },
          { status: 200 }
        );
      }

      // Check tracker.tenants for slug uniqueness (excluding soft-deleted rows)
      const { data: existingTenant, error } = await service
        .from('tenants')
        .select('id')
        .eq('slug', slug)
        .is('deleted_at', null)
        .maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (existingTenant) {
        return NextResponse.json(
          { valid: false, error: `Workspace slug "${slug}" is already taken. Choose a different one.` },
          { status: 200 }
        );
      }

      return NextResponse.json({ valid: true });
    }

    if (type === 'project') {
      // Check tracker.projects for slug uniqueness in the database
      // If workspace_slug is provided, check if it already exists under this tenant
      let query = service
        .from('projects')
        .select('id, slug, tenant_id')
        .eq('slug', slug)
        .is('deleted_at', null);

      if (workspaceSlug) {
        const { data: tenant } = await service
          .from('tenants')
          .select('id')
          .eq('slug', workspaceSlug)
          .is('deleted_at', null)
          .maybeSingle();

        if (tenant) {
          query = query.eq('tenant_id', tenant.id);
        }
      }

      const { data: existingProject, error } = await query.maybeSingle();

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (existingProject) {
        return NextResponse.json(
          { valid: false, error: `Project slug "${slug}" is already taken in the database. Choose a different one.` },
          { status: 200 }
        );
      }

      return NextResponse.json({ valid: true });
    }

    return NextResponse.json({ valid: false, error: 'Invalid type parameter' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json(
      { valid: false, error: err.message || 'Internal Server Error' },
      { status: 500 }
    );
  }
}
