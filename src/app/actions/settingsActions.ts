'use server';

import { revalidatePath } from 'next/cache';
import { createServerClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/db';
import {
  LiveDashboardSettings,
  DEFAULT_LIVE_DASHBOARD_SETTINGS,
  resolveLiveDashboardSettings,
} from '@/types/tracker';
import type {
  EfficiencyDashboardSchema,
  ResolvedEfficiencyDashboardConfig,
} from '@/types/efficiency-dashboard';
import {
  mergeEfficiencyDashboardSchemas,
  resolveEfficiencyDashboardConfig,
  validateEfficiencyDashboardSchema,
} from '@/lib/efficiency-dashboard-schema';

export interface ProjectVelocityOverride {
  projectId: string;
  velocityRatio: number | null; // null indicates inherit workspace default
}

export interface VelocitySettingsConfig {
  defaultHoursPerPoint: number;
  projectOverrides?: ProjectVelocityOverride[];
}

export interface VelocitySettingsResult {
  success: boolean;
  error: string | null;
}

/**
 * Server action to mutate workspace velocity baseline and per-project conversion ratios.
 * Persists to tracker.tenants.settings and tracker.projects.settings.
 */
export async function updateVelocitySettingsAction(
  tenantSlug: string,
  config: VelocitySettingsConfig
): Promise<VelocitySettingsResult> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    // 1. Resolve tenant
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, owner_id, settings')
      .eq('slug', tenantSlug)
      .is('deleted_at', null)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return { success: false, error: `Workspace "@${tenantSlug}" not found.` };
    }

    // 2. Validate authorization (session required, viewers forbidden)
    if (!user) {
      return { success: false, error: 'Unauthorized: Session required to modify workspace settings.' };
    }

    if (tenant.owner_id !== user.id) {
      const { data: member, error: memberErr } = await supabaseAdmin
        .from('tenant_members')
        .select('role')
        .eq('tenant_id', tenant.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberErr || !member) {
        return { success: false, error: 'Forbidden: You do not have permissions to edit workspace settings.' };
      }

      if (member.role === 'viewer') {
        return { success: false, error: 'Forbidden: Viewer role cannot modify workspace settings.' };
      }
    }

    // 3. Pre-flight validate all project overrides (deduplicated by projectId)
    const rawOverrides = Array.isArray(config.projectOverrides) ? config.projectOverrides : [];
    const dedupedOverridesMap = new Map<string, number | null>();
    for (const o of rawOverrides) {
      if (o && o.projectId) {
        dedupedOverridesMap.set(o.projectId, o.velocityRatio);
      }
    }
    const projectOverrides = Array.from(dedupedOverridesMap.entries()).map(([projectId, velocityRatio]) => ({
      projectId,
      velocityRatio,
    }));

    const projectsToUpdate: Array<{ id: string; settings: any; velocityRatio: number | null }> = [];

    for (const override of projectOverrides) {
      const { data: proj, error: projFetchErr } = await supabaseAdmin
        .from('projects')
        .select('id, settings')
        .eq('id', override.projectId)
        .eq('tenant_id', tenant.id)
        .maybeSingle();

      if (projFetchErr) {
        return {
          success: false,
          error: `Failed to fetch project ${override.projectId}: ${projFetchErr.message}`,
        };
      }
      if (!proj) {
        return {
          success: false,
          error: `Project "${override.projectId}" not found in workspace "@${tenantSlug}".`,
        };
      }
      projectsToUpdate.push({
        id: proj.id,
        settings: proj.settings || {},
        velocityRatio: override.velocityRatio,
      });
    }

    const rollbackStack: Array<{ table: 'tenants' | 'projects'; id: string; settings: any }> = [];

    const executeRollback = async (): Promise<string[]> => {
      const rollbackFailures: string[] = [];
      // Replay in reverse order (LIFO)
      for (const item of [...rollbackStack].reverse()) {
        const { error: rbErr } = await supabaseAdmin
          .from(item.table)
          .update({ settings: item.settings, updated_at: new Date().toISOString() })
          .eq('id', item.id);
        if (rbErr) {
          console.error(`Rollback failed for ${item.table} ${item.id}:`, rbErr);
          rollbackFailures.push(`${item.table}:${item.id} (${rbErr.message})`);
        }
      }
      return rollbackFailures;
    };

    // 4. Update tenant settings
    const existingTenantSettings = tenant.settings || {};
    const updatedTenantSettings = {
      ...existingTenantSettings,
      velocity_conversion: {
        ...(existingTenantSettings.velocity_conversion || {}),
        default_hours_per_point: config.defaultHoursPerPoint,
      },
    };

    const { error: updateTenantErr } = await supabaseAdmin
      .from('tenants')
      .update({
        settings: updatedTenantSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenant.id);

    if (updateTenantErr) {
      return { success: false, error: `Failed to update workspace velocity ratio: ${updateTenantErr.message}` };
    }

    rollbackStack.push({ table: 'tenants', id: tenant.id, settings: existingTenantSettings });

    // 5. Update project overrides
    if (projectOverrides.length > 0) {
      for (const override of projectOverrides) {
        const proj = projectsToUpdate.find((p) => p.id === override.projectId);
        if (!proj) continue;

        const originalProjSettings = proj.settings || {};
        const projSettings = { ...originalProjSettings };
        if (override.velocityRatio === null || isNaN(override.velocityRatio) || override.velocityRatio <= 0) {
          delete projSettings.velocity_ratio;
        } else {
          projSettings.velocity_ratio = override.velocityRatio;
        }

        const { error: projUpdateErr } = await supabaseAdmin
          .from('projects')
          .update({
            settings: projSettings,
            updated_at: new Date().toISOString(),
          })
          .eq('id', proj.id);

        if (projUpdateErr) {
          const rbFailures = await executeRollback();
          let errMsg = `Failed to update velocity settings for project ${override.projectId}: ${projUpdateErr.message}`;
          if (rbFailures.length > 0) {
            errMsg += ` (Rollback also failed for: ${rbFailures.join(', ')})`;
          }
          return {
            success: false,
            error: errMsg,
          };
        }

        rollbackStack.push({ table: 'projects', id: proj.id, settings: originalProjSettings });
      }
    }

    // 5. Invalidate relevant caches
    try {
      revalidatePath(`/${tenantSlug}/statements`);
      revalidatePath(`/${tenantSlug}/settings/efficiency`);
      revalidatePath(`/api/v1/statements`);
      revalidatePath(`/api/v1/statements/calibration`);
    } catch {
      // Invalidation safe catch
    }

    return { success: true, error: null };
  } catch (err: any) {
    console.error('Error in updateVelocitySettingsAction:', err);
    return { success: false, error: err.message || 'Failed to update velocity settings.' };
  }
}

export interface LiveDashboardSettingsResult {
  success: boolean;
  settings: LiveDashboardSettings;
  error: string | null;
}

/**
 * Server action to resolve workspace-level live dashboard configuration from tracker.tenants.settings,
 * falling back to DEFAULT_LIVE_DASHBOARD_SETTINGS when unconfigured.
 */
export async function getLiveDashboardSettingsAction(
  tenantSlug: string
): Promise<LiveDashboardSettingsResult> {
  try {
    const cleanSlug = tenantSlug.replace(/^@/, '').trim();
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, tier, owner_id, settings, metadata')
      .eq('slug', cleanSlug)
      .is('deleted_at', null)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return {
        success: false,
        settings: resolveLiveDashboardSettings(null),
        error: tenantErr?.message || `Workspace "@${cleanSlug}" not found.`,
      };
    }

    const isPublicWorkspace =
      tenant.slug === 'sunshade' ||
      tenant.tier === 'demo' ||
      Boolean(tenant.metadata?.is_public);

    if (!isPublicWorkspace) {
      const supabase = await createServerClient();
      const authRes = await supabase?.auth?.getUser?.();
      const user = authRes?.data?.user;

      if (!user) {
        return {
          success: false,
          settings: resolveLiveDashboardSettings(null),
          error: 'Unauthorized: Session required to view private workspace settings.',
        };
      }

      if (tenant.owner_id !== user.id) {
        const { data: member, error: memberErr } = await supabaseAdmin
          .from('tenant_members')
          .select('role')
          .eq('tenant_id', tenant.id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (memberErr || !member) {
          return {
            success: false,
            settings: resolveLiveDashboardSettings(null),
            error: 'Forbidden: You do not have membership access to this workspace.',
          };
        }
      }
    }

    const mergedSettingsSource = {
      ...(tenant.metadata || {}),
      ...(tenant.settings || {}),
    };

    return {
      success: true,
      settings: resolveLiveDashboardSettings(mergedSettingsSource),
      error: null,
    };
  } catch (err: any) {
    return {
      success: false,
      settings: resolveLiveDashboardSettings(null),
      error: err.message || 'Failed to load live dashboard settings.',
    };
  }
}

/**
 * Server action to update workspace-level live dashboard configuration in tracker.tenants.settings.
 */
export async function updateLiveDashboardSettingsAction(
  tenantSlug: string,
  updates: Partial<LiveDashboardSettings>
): Promise<LiveDashboardSettingsResult> {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const cleanSlug = tenantSlug.replace(/^@/, '').trim();
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, owner_id, settings')
      .eq('slug', cleanSlug)
      .is('deleted_at', null)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return {
        success: false,
        settings: resolveLiveDashboardSettings(null),
        error: `Workspace "@${cleanSlug}" not found.`,
      };
    }

    if (!user) {
      return {
        success: false,
        settings: resolveLiveDashboardSettings(tenant.settings),
        error: 'Unauthorized: Session required to modify workspace settings.',
      };
    }

    if (tenant.owner_id !== user.id) {
      const { data: member, error: memberErr } = await supabaseAdmin
        .from('tenant_members')
        .select('role')
        .eq('tenant_id', tenant.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberErr || !member || member.role === 'viewer') {
        return {
          success: false,
          settings: resolveLiveDashboardSettings(tenant.settings),
          error: 'Forbidden: You do not have permissions to edit workspace settings.',
        };
      }
    }

    const existingSettings = tenant.settings || {};
    const mergedLiveSettings = resolveLiveDashboardSettings({
      live_dashboard_settings: {
        ...(existingSettings.live_dashboard_settings || DEFAULT_LIVE_DASHBOARD_SETTINGS),
        ...updates,
      },
    });

    const updatedTenantSettings = {
      ...existingSettings,
      live_dashboard_settings: mergedLiveSettings,
    };

    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({
        settings: updatedTenantSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenant.id);

    if (updateErr) {
      return {
        success: false,
        settings: resolveLiveDashboardSettings(tenant.settings),
        error: `Failed to update live dashboard settings: ${updateErr.message}`,
      };
    }

    try {
      revalidatePath(`/${cleanSlug}/all`);
    } catch {
      // Safe catch outside request context
    }

    return {
      success: true,
      settings: mergedLiveSettings,
      error: null,
    };
  } catch (err: any) {
    return {
      success: false,
      settings: resolveLiveDashboardSettings(null),
      error: err.message || 'Failed to update live dashboard settings.',
    };
  }
}

export interface EfficiencyDashboardSchemaResult {
  success: boolean;
  schema: EfficiencyDashboardSchema;
  resolved: ResolvedEfficiencyDashboardConfig;
  error: string | null;
}

/**
 * Server action to resolve workspace-level declarative efficiency & telemetry dashboard schema
 * from tracker.tenants.settings.efficiency_dashboard_settings.
 */
export async function getEfficiencyDashboardSchemaAction(
  tenantSlug: string
): Promise<EfficiencyDashboardSchemaResult> {
  const fallbackResolved = resolveEfficiencyDashboardConfig();
  const fallbackSchema = mergeEfficiencyDashboardSchemas(null);

  try {
    const cleanSlug = tenantSlug.replace(/^@/, '').trim();
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, tier, owner_id, settings, metadata')
      .eq('slug', cleanSlug)
      .is('deleted_at', null)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return {
        success: false,
        schema: fallbackSchema,
        resolved: fallbackResolved,
        error: tenantErr?.message || `Workspace "@${cleanSlug}" not found.`,
      };
    }

    const isPublicWorkspace =
      tenant.slug === 'sunshade' ||
      tenant.tier === 'demo' ||
      Boolean(tenant.metadata?.is_public);

    if (!isPublicWorkspace) {
      const supabase = await createServerClient();
      const authRes = await supabase?.auth?.getUser?.();
      const user = authRes?.data?.user;

      if (!user) {
        return {
          success: false,
          schema: fallbackSchema,
          resolved: fallbackResolved,
          error: 'Unauthorized: Session required to view private workspace settings.',
        };
      }

      if (tenant.owner_id !== user.id) {
        const { data: member, error: memberErr } = await supabaseAdmin
          .from('tenant_members')
          .select('role')
          .eq('tenant_id', tenant.id)
          .eq('user_id', user.id)
          .maybeSingle();

        if (memberErr || !member) {
          return {
            success: false,
            schema: fallbackSchema,
            resolved: fallbackResolved,
            error: 'Forbidden: You do not have membership access to this workspace.',
          };
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

    const resolved = resolveEfficiencyDashboardConfig({
      workspaceSettings,
      liveDashboardSettings,
    });
    const schema = mergeEfficiencyDashboardSchemas(workspaceSettings);

    return {
      success: true,
      schema,
      resolved,
      error: null,
    };
  } catch (err: any) {
    return {
      success: false,
      schema: fallbackSchema,
      resolved: fallbackResolved,
      error: err.message || 'Failed to load efficiency dashboard schema.',
    };
  }
}

/**
 * Server action to update workspace-level declarative efficiency & telemetry dashboard schema
 * in tracker.tenants.settings.efficiency_dashboard_settings.
 */
export async function updateEfficiencyDashboardSchemaAction(
  tenantSlug: string,
  updates: Partial<EfficiencyDashboardSchema>
): Promise<EfficiencyDashboardSchemaResult> {
  const fallbackResolved = resolveEfficiencyDashboardConfig();
  const fallbackSchema = mergeEfficiencyDashboardSchemas(null);

  try {
    const validation = validateEfficiencyDashboardSchema(updates);
    if (!validation.valid) {
      return {
        success: false,
        schema: fallbackSchema,
        resolved: fallbackResolved,
        error: validation.errors.map((e) => `${e.path}: ${e.message}`).join('; '),
      };
    }

    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    const cleanSlug = tenantSlug.replace(/^@/, '').trim();
    const { data: tenant, error: tenantErr } = await supabaseAdmin
      .from('tenants')
      .select('id, slug, owner_id, settings')
      .eq('slug', cleanSlug)
      .is('deleted_at', null)
      .maybeSingle();

    if (tenantErr || !tenant) {
      return {
        success: false,
        schema: fallbackSchema,
        resolved: fallbackResolved,
        error: `Workspace "@${cleanSlug}" not found.`,
      };
    }

    const existingSettings = tenant.settings || {};
    const existingResolved = resolveEfficiencyDashboardConfig({
      workspaceSettings: existingSettings.efficiency_dashboard_settings,
      liveDashboardSettings: existingSettings.live_dashboard_settings,
    });
    const existingSchema = mergeEfficiencyDashboardSchemas(
      existingSettings.efficiency_dashboard_settings
    );

    if (!user) {
      return {
        success: false,
        schema: existingSchema,
        resolved: existingResolved,
        error: 'Unauthorized: Session required to modify workspace settings.',
      };
    }

    if (tenant.owner_id !== user.id) {
      const { data: member, error: memberErr } = await supabaseAdmin
        .from('tenant_members')
        .select('role')
        .eq('tenant_id', tenant.id)
        .eq('user_id', user.id)
        .maybeSingle();

      if (memberErr || !member || member.role === 'viewer') {
        return {
          success: false,
          schema: existingSchema,
          resolved: existingResolved,
          error: 'Forbidden: You do not have permissions to edit workspace settings.',
        };
      }
    }

    const mergedSchema = mergeEfficiencyDashboardSchemas(
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

    const { error: updateErr } = await supabaseAdmin
      .from('tenants')
      .update({
        settings: updatedTenantSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('id', tenant.id);

    if (updateErr) {
      return {
        success: false,
        schema: existingSchema,
        resolved: existingResolved,
        error: `Failed to update efficiency dashboard schema: ${updateErr.message}`,
      };
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

    return {
      success: true,
      schema: mergedSchema,
      resolved,
      error: null,
    };
  } catch (err: any) {
    return {
      success: false,
      schema: fallbackSchema,
      resolved: fallbackResolved,
      error: err.message || 'Failed to update efficiency dashboard schema.',
    };
  }
}
