'use server';

import { getTenantEfficiencyMetrics } from '@/lib/services/valueLedgerServer';
import type { EfficiencyMetricsPayload } from '@/lib/services/valueLedgerService';

/**
 * Server action to fetch efficiency and value realization metrics for a tenant workspace.
 */
export async function getTenantEfficiencyMetricsAction(
  tenantSlug: string
): Promise<{ success: boolean; data?: EfficiencyMetricsPayload; error?: string }> {
  try {
    if (!tenantSlug || typeof tenantSlug !== 'string') {
      return { success: false, error: 'Tenant slug is required' };
    }
    const data = await getTenantEfficiencyMetrics(tenantSlug);
    return { success: true, data };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to fetch efficiency metrics',
    };
  }
}

// Re-export the server action as getTenantEfficiencyMetrics to satisfy spec:
// "Write a server action getTenantEfficiencyMetrics(tenantSlug: string) that queries the tenant's workspace"
export { getTenantEfficiencyMetrics };
