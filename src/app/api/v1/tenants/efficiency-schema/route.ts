import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { createServerClient, createServiceClient } from '@/lib/supabase-server';
import {
  DEFAULT_LIVE_DASHBOARD_SETTINGS,
  resolveLiveDashboardSettings,
} from '@/types/tracker';
import {
  mergeSparseEfficiencyDashboardSchemas,
  resolveEfficiencyDashboardConfig,
  validateEfficiencyDashboardSchema,
} from '@/lib/efficiency-dashboard-schema';

function resolveTenantSlugFromRequest(req: NextRequest, bodySlug?: unknown): string {
  const raw =
    (typeof bodySlug === 'string' && bodySlug.trim()) ||
    req.nextUrl.searchParams.get('tenant_slug') ||
    req.headers.get('x-tenant-slug') ||
    '';
  return raw.replace(/^@/, '').trim();
}

/**
 * GET /api/v1/tenants/efficiency-schema
 * Resolves workspace-level declarative efficiency & telemetry dashboard schema.
 */
export async function GET(req: NextRequest) {
  try {
    const cleanSlug = resolveTenantSlugFromRequest(req);
    if (!cleanSlug) {
      return NextResponse.json({ error: 'tenant_slug is required' }, { status: 400 });
    }

    const service = createServiceClient();
    const { data: tenant, error: tenantErr } = await service
      .from('tenants')
      .select('id, slug, tier, owner_id, settings, metadata')
      .eq('slug', cleanSlug)
      .is('deleted_at', null)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return NextResponse.json(
        { error: tenantErr?.message || `Workspace "@${cleanSlug}" not found.` },
        { status: 404 }
      );
    }

    const isPublicWorkspace =
      tenant.slug === 'sunshade' ||
      tenant.tier === 'demo' ||
      Boolean(tenant.metadata?.is_public);

    if (!isPublicWorkspace) {
      const supabase = await createServerClient();
      const {
        data: { user },
        error: userErr,
      } = await supabase.auth.getUser();

      if (userErr || !user) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
      }

      if (tenant.owner_id !== user.id) {
        const { data: member, error: memberErr } = await service
          .from('tenant_members')
          .select('role')
          .eq('tenant_id', tenant.id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (memberErr || !member) {
          return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
        }
      }
    }

    const workspaceSettings =
      tenant.settings?.efficiency_dashboard_settings ||
      tenant.metadata?.efficiency_dashboard_settings ||
      null;
    const liveDashboardSettings =
      tenant.settings?.live_dashboard_settings ||
      tenant.metadata?.live_dashboard_settings ||
      null;

    return NextResponse.json({
      success: true,
      schema: mergeSparseEfficiencyDashboardSchemas(workspaceSettings),
      resolved: resolveEfficiencyDashboardConfig({
        workspaceSettings,
        liveDashboardSettings,
      }),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to load efficiency dashboard schema' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v1/tenants/efficiency-schema
 * Updates workspace-level declarative efficiency & telemetry dashboard schema in tenants.settings.
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

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const cleanSlug = resolveTenantSlugFromRequest(req, body.tenant_slug);
    if (!cleanSlug) {
      return NextResponse.json({ error: 'tenant_slug is required' }, { status: 400 });
    }

    const updates = body.updates ?? body.schema;
    const validation = validateEfficiencyDashboardSchema(updates);
    if (!validation.valid) {
      return NextResponse.json(
        {
          error: validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
        },
        { status: 400 }
      );
    }

    const service = createServiceClient();
    const { data: tenant, error: tenantErr } = await service
      .from('tenants')
      .select('id, slug, owner_id, settings')
      .eq('slug', cleanSlug)
      .is('deleted_at', null)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return NextResponse.json({ error: `Workspace "@${cleanSlug}" not found.` }, { status: 404 });
    }

    if (tenant.owner_id !== user.id) {
      const { data: member, error: memberErr } = await service
        .from('tenant_members')
        .select('role')
        .eq('tenant_id', tenant.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberErr || !member || member.role === 'viewer') {
        return NextResponse.json(
          { error: 'Forbidden: You do not have permissions to edit workspace settings.' },
          { status: 403 }
        );
      }
    }

    const existingSettings = tenant.settings || {};
    const mergedSchema = mergeSparseEfficiencyDashboardSchemas(
      existingSettings.efficiency_dashboard_settings,
      updates
    );

    const nextLiveSettings = updates.default_views?.telemetry
      ? resolveLiveDashboardSettings({
          live_dashboard_settings: {
            ...(existingSettings.live_dashboard_settings || DEFAULT_LIVE_DASHBOARD_SETTINGS),
            ...(updates.default_views.telemetry.defaultPivot
              ? { default_pivot: updates.default_views.telemetry.defaultPivot }
              : {}),
            ...(typeof updates.default_views.telemetry.defaultRefreshIntervalMs === 'number'
              ? {
                  default_refresh_interval_ms:
                    updates.default_views.telemetry.defaultRefreshIntervalMs,
                }
              : {}),
          },
        })
      : existingSettings.live_dashboard_settings;

    const updatedTenantSettings = {
      ...existingSettings,
      efficiency_dashboard_settings: mergedSchema,
      ...(nextLiveSettings ? { live_dashboard_settings: nextLiveSettings } : {}),
    };

    const { error: updateErr } = await service
      .from('tenants')
      .update({
        settings: updatedTenantSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenant.id);

    if (updateErr) {
      return NextResponse.json(
        { error: `Failed to update efficiency dashboard schema: ${updateErr.message}` },
        { status: 500 }
      );
    }

    try {
      revalidatePath(`/${cleanSlug}/all`);
      revalidatePath(`/${cleanSlug}/settings/efficiency`);
      revalidatePath(`/${cleanSlug}/statements`);
    } catch {
      // Safe catch outside request context
    }

    const resolved = resolveEfficiencyDashboardConfig({
      workspaceSettings: mergedSchema,
      liveDashboardSettings: nextLiveSettings,
    });

    return NextResponse.json({
      success: true,
      schema: mergedSchema,
      resolved,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || 'Failed to update efficiency dashboard schema' },
      { status: 500 }
    );
  }
}
