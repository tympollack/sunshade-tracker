'use server';

import { createServerClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/db';
import { getTenantEfficiencyMetrics } from '@/lib/services/valueLedgerServer';
import type { EfficiencyMetricsPayload } from '@/lib/services/valueLedgerService';

/**
 * Server action to fetch efficiency and value realization metrics for a tenant workspace.
 * Validates the caller's session and verifies authorized workspace membership.
 */
export async function getTenantEfficiencyMetricsAction(
  tenantSlug: string
): Promise<{ success: boolean; data?: EfficiencyMetricsPayload; error?: string }> {
  try {
    if (!tenantSlug || typeof tenantSlug !== 'string') {
      return { success: false, error: 'Tenant slug is required' };
    }

    // 1. Authenticate caller session
    const supabase = await createServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return { success: false, error: 'Unauthorized: Valid user session required' };
    }

    // 2. Validate membership in target tenant
    const service = supabaseAdmin;
    const { data: membership } = await service
      .from('tenant_members')
      .select('role, tenants!inner(id, slug, deleted_at)')
      .eq('user_id', user.id)
      .eq('tenants.slug', tenantSlug)
      .is('tenants.deleted_at', null)
      .maybeSingle();

    if (!membership) {
      // Fallback: check direct ownership
      const { data: owned } = await service
        .from('tenants')
        .select('id')
        .eq('owner_id', user.id)
        .eq('slug', tenantSlug)
        .is('deleted_at', null)
        .maybeSingle();

      if (!owned) {
        return {
          success: false,
          error: `Forbidden: You do not have access to workspace "${tenantSlug}".`,
        };
      }
    }

    // 3. Authorized — fetch metrics
    const data = await getTenantEfficiencyMetrics(tenantSlug);
    return { success: true, data };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to fetch efficiency metrics',
    };
  }
}
