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

/**
 * Server action to reassign a work item and all its recursive descendants to a new project.
 */
export async function reassignWorkItemProject(
  itemId: string,
  newProjectId: string,
  tenantSlug?: string
): Promise<{ success: boolean; updatedCount?: number; error?: string }> {
  try {
    if (!itemId || !newProjectId) {
      return { success: false, error: 'Item ID and new project ID are required' };
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

    const service = supabaseAdmin;

    // 2. Fetch the target item
    const { data: targetItem, error: itemErr } = await service
      .from('work_items')
      .select('*')
      .eq('id', itemId)
      .single();

    if (itemErr || !targetItem) {
      return { success: false, error: 'Work item not found' };
    }

    const tenantId = targetItem.tenant_id;

    // 3. Validate user access to tenant
    const { data: membership } = await service
      .from('tenant_members')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (!membership) {
      const { data: owned } = await service
        .from('tenants')
        .select('id')
        .eq('owner_id', user.id)
        .eq('id', tenantId)
        .is('deleted_at', null)
        .maybeSingle();

      if (!owned) {
        return { success: false, error: 'Forbidden: Access to workspace denied' };
      }
    }

    // 4. Verify destination project exists in tenant
    const { data: destProject, error: projErr } = await service
      .from('projects')
      .select('id, slug, name')
      .eq('tenant_id', tenantId)
      .eq('id', newProjectId)
      .single();

    if (projErr || !destProject) {
      return { success: false, error: 'Destination project not found in this workspace' };
    }

    // 5. Recursively find all descendant item IDs
    const { data: tenantItems } = await service
      .from('work_items')
      .select('id, parent_id')
      .eq('tenant_id', tenantId);

    const { getDescendantIds } = await import('@/lib/tree');
    const descendantIds = getDescendantIds(tenantItems || [], itemId);
    const allAffectedIds = [itemId, ...descendantIds];

    // 6. Check if target item's existing parent belongs to a different project than newProjectId
    let shouldDisconnectParent = false;
    const oldParentId = targetItem.parent_id;
    if (oldParentId) {
      const { data: parentItem } = await service
        .from('work_items')
        .select('id, project_id')
        .eq('id', oldParentId)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!parentItem || parentItem.project_id !== newProjectId) {
        shouldDisconnectParent = true;
      }
    }

    const nowIso = new Date().toISOString();
    const targetUpdateFields: Record<string, any> = {
      project_id: newProjectId,
      updated_at: nowIso,
    };
    if (shouldDisconnectParent) {
      targetUpdateFields.parent_id = null;
    }

    const { error: updateTargetErr } = await service
      .from('work_items')
      .update(targetUpdateFields)
      .eq('id', itemId);

    if (updateTargetErr) {
      return { success: false, error: updateTargetErr.message };
    }

    // Update descendants to new project_id
    if (descendantIds.length > 0) {
      const { error: updateDescErr } = await service
        .from('work_items')
        .update({
          project_id: newProjectId,
          updated_at: nowIso,
        })
        .in('id', descendantIds);

      if (updateDescErr) {
        return { success: false, error: updateDescErr.message };
      }
    }

    // 7. Audit log for migration
    const userName =
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      (user.email ? user.email.split('@')[0] : 'User');

    const changedFields: Record<string, any> = {
      project_id: { before: targetItem.project_id, after: newProjectId },
    };
    if (shouldDisconnectParent) {
      changedFields.parent_id = {
        before: oldParentId,
        after: null,
        note: 'Parent detached due to project migration',
      };
    }

    const { recordAuditLog } = await import('@/lib/audit-log');
    await recordAuditLog({
      tenant_id: tenantId,
      project_id: newProjectId,
      item_id: itemId,
      actor_id: user.id,
      actor_name: userName,
      action: 'update',
      changed_fields: changedFields,
    }).catch(() => {});

    return { success: true, updatedCount: allAffectedIds.length };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to reassign work item project',
    };
  }
}

