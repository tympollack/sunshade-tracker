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
  tenantSlug?: string,
  overrides?: { status?: string; item_type?: string }
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
    } else if (membership.role === 'viewer') {
      const { data: owned } = await service
        .from('tenants')
        .select('id')
        .eq('owner_id', user.id)
        .eq('id', tenantId)
        .is('deleted_at', null)
        .maybeSingle();

      if (!owned) {
        return {
          success: false,
          error: 'Forbidden: Workspace viewers have read-only access and cannot move items',
        };
      }
    }

    // 4. Verify destination project exists in tenant
    const { data: destProject, error: projErr } = await service
      .from('projects')
      .select('id, slug, name, settings')
      .eq('tenant_id', tenantId)
      .eq('id', newProjectId)
      .single();

    if (projErr || !destProject) {
      return { success: false, error: 'Destination project not found in this workspace' };
    }

    // Validate target item type and status against destination project schema (accounting for overrides)
    const effectiveType = overrides?.item_type || targetItem.item_type;
    const effectiveStatus = overrides?.status || targetItem.status;

    if (destProject.settings?.hierarchy?.length) {
      const allowedTypes = destProject.settings.hierarchy.map((h: any) => h.type);
      if (!allowedTypes.includes(effectiveType)) {
        return {
          success: false,
          error: `Item type '${effectiveType}' is not supported in destination project '${destProject.name}'. Allowed types: [${allowedTypes.join(', ')}]`,
        };
      }
    }

    if (destProject.settings?.statuses?.length) {
      const allowedStatuses = destProject.settings.statuses.map((s: any) => s.id);
      if (!allowedStatuses.includes(effectiveStatus)) {
        return {
          success: false,
          error: `Status '${effectiveStatus}' is not supported in destination project '${destProject.name}'. Allowed statuses: [${allowedStatuses.join(', ')}]`,
        };
      }
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
    if (overrides?.status) {
      targetUpdateFields.status = overrides.status;
    }
    if (overrides?.item_type) {
      targetUpdateFields.item_type = overrides.item_type;
    }
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
        // Roll back the target item reassignment to prevent partial migrations
        await service
          .from('work_items')
          .update({
            project_id: targetItem.project_id,
            parent_id: targetItem.parent_id,
            status: targetItem.status,
            item_type: targetItem.item_type,
            updated_at: new Date().toISOString(),
          })
          .eq('id', itemId);

        return {
          success: false,
          error: `Failed to update descendant items: ${updateDescErr.message}. Reassignment was rolled back.`,
        };
      }
    }

    // Synchronize audit logs project_id to match destination project
    const auditTable = service.from('audit_logs') as any;
    if (typeof auditTable?.update === 'function') {
      await auditTable
        .update({ project_id: newProjectId })
        .in('item_id', allAffectedIds)
        .eq('tenant_id', tenantId);
    }

    // 7. Audit log for migration
    const userName =
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      (user.email ? user.email.split('@')[0] : 'User');

    const changedFields: Record<string, any> = {
      project_id: { before: targetItem.project_id, after: newProjectId },
    };
    if (overrides?.status && overrides.status !== targetItem.status) {
      changedFields.status = { before: targetItem.status, after: overrides.status };
    }
    if (overrides?.item_type && overrides.item_type !== targetItem.item_type) {
      changedFields.item_type = { before: targetItem.item_type, after: overrides.item_type };
    }
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

/**
 * Server action to reassign a batch of work items and all their recursive descendants to a new project.
 */
export async function bulkReassignProjects(
  itemIds: string[],
  newProjectId: string,
  tenantSlug?: string
): Promise<{ success: boolean; updatedCount?: number; error?: string }> {
  try {
    if (!itemIds || itemIds.length === 0 || !newProjectId) {
      return { success: false, error: 'Item IDs and new project ID are required' };
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

    // 2. Fetch the target items to identify tenant
    const { data: targetItems, error: itemsErr } = await service
      .from('work_items')
      .select('id, tenant_id, project_id, parent_id, item_type, status')
      .in('id', itemIds);

    if (itemsErr || !targetItems || targetItems.length === 0) {
      return { success: false, error: 'No valid work items found' };
    }

    const tenantId = targetItems[0].tenant_id;
    const hasMixedTenants = targetItems.some((it) => it.tenant_id !== tenantId);
    if (hasMixedTenants || targetItems.length !== itemIds.length) {
      return { success: false, error: 'All items must belong to the same authorized workspace' };
    }

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
    } else if (membership.role === 'viewer') {
      const { data: owned } = await service
        .from('tenants')
        .select('id')
        .eq('owner_id', user.id)
        .eq('id', tenantId)
        .is('deleted_at', null)
        .maybeSingle();

      if (!owned) {
        return {
          success: false,
          error: 'Forbidden: Workspace viewers have read-only access and cannot move items',
        };
      }
    }

    // 4. Verify destination project exists in tenant
    const { data: destProject, error: projErr } = await service
      .from('projects')
      .select('id, slug, name, settings')
      .eq('tenant_id', tenantId)
      .eq('id', newProjectId)
      .single();

    if (projErr || !destProject) {
      return { success: false, error: 'Destination project not found in this workspace' };
    }

    // 5. Recursively find all descendant item IDs across all selected items
    const { data: tenantItems } = await service
      .from('work_items')
      .select('id, parent_id')
      .eq('tenant_id', tenantId);

    const { getDescendantIds } = await import('@/lib/tree');
    const allDescendantIds = new Set<string>();
    for (const id of itemIds) {
      const descendants = getDescendantIds(tenantItems || [], id);
      descendants.forEach((d) => allDescendantIds.add(d));
    }

    const allAffectedIds = Array.from(new Set([...itemIds, ...allDescendantIds]));
    const affectedIdSet = new Set(allAffectedIds);

    // Validate destination project schema compatibility (DEVIN-REVIEW)
    const destSettings = destProject.settings as any;
    if (destSettings?.hierarchy?.length || destSettings?.statuses?.length) {
      const { data: affectedDetails } = await service
        .from('work_items')
        .select('id, title, item_type, status')
        .in('id', allAffectedIds);

      const validTypes = destSettings?.hierarchy?.length
        ? new Set(destSettings.hierarchy.map((h: any) => String(h.type).toLowerCase()))
        : null;
      const validStatuses = destSettings?.statuses?.length
        ? new Set(destSettings.statuses.map((s: any) => String(s.id).toLowerCase()))
        : null;

      for (const it of affectedDetails || []) {
        if (validTypes && it.item_type && !validTypes.has(String(it.item_type).toLowerCase())) {
          return {
            success: false,
            error: `Cannot move items: item "${it.title || it.id}" has type "${it.item_type}" which is not supported in destination project.`,
          };
        }
        if (validStatuses && it.status && !validStatuses.has(String(it.status).toLowerCase())) {
          return {
            success: false,
            error: `Cannot move items: item "${it.title || it.id}" has status "${it.status}" which is not supported in destination project.`,
          };
        }
      }
    }

    // 6. Disconnect parent_id for any migrated item whose parent is NOT in allAffectedIds
    // and whose parent belongs to a different project
    const itemsWithParents = targetItems.filter((it) => it.parent_id && !affectedIdSet.has(it.parent_id));
    const parentIdsToDetach: string[] = [];
    if (itemsWithParents.length > 0) {
      const parentIdsToCheck = Array.from(new Set(itemsWithParents.map((it) => it.parent_id!)));
      const { data: parents } = await service
        .from('work_items')
        .select('id, project_id')
        .in('id', parentIdsToCheck);

      const parentProjectMap = new Map((parents || []).map((p) => [p.id, p.project_id]));
      for (const it of itemsWithParents) {
        if (it.parent_id && parentProjectMap.get(it.parent_id) !== newProjectId) {
          parentIdsToDetach.push(it.id);
        }
      }
    }

    const nowIso = new Date().toISOString();

    if (parentIdsToDetach.length > 0) {
      let detachQuery: any = service
        .from('work_items')
        .update({ parent_id: null, updated_at: nowIso })
        .in('id', parentIdsToDetach);

      if (typeof detachQuery?.eq === 'function') {
        detachQuery = detachQuery.eq('tenant_id', tenantId);
      }
      const { error: detachErr } = await detachQuery;

      if (detachErr) {
        return {
          success: false,
          error: `Failed to disconnect cross-project parents: ${detachErr.message}`,
        };
      }
    }

    // Update all affected items to new project_id
    let updateQuery: any = service
      .from('work_items')
      .update({
        project_id: newProjectId,
        updated_at: nowIso,
      })
      .in('id', allAffectedIds);

    if (typeof updateQuery?.eq === 'function') {
      updateQuery = updateQuery.eq('tenant_id', tenantId);
    }
    const { error: updateErr } = await updateQuery;

    if (updateErr) {
      return { success: false, error: updateErr.message };
    }

    // Synchronize audit logs project_id to match destination project so fk constraint is satisfied and audit history moves with item
    const auditTable = service.from('audit_logs') as any;
    if (typeof auditTable?.update === 'function') {
      await auditTable
        .update({ project_id: newProjectId })
        .in('item_id', allAffectedIds)
        .eq('tenant_id', tenantId);
    }

    // 7. Record bulk audit log
    const userName =
      user.user_metadata?.full_name ??
      user.user_metadata?.name ??
      (user.email ? user.email.split('@')[0] : 'User');

    const { recordBulkAuditLogs } = await import('@/lib/audit-log');
    const auditEntries = allAffectedIds.map((itemId) => ({
      tenant_id: tenantId,
      project_id: newProjectId,
      item_id: itemId,
      actor_id: user.id,
      actor_name: userName,
      action: 'update' as const,
      changed_fields: {
        project_id: { before: null, after: newProjectId },
      },
    }));
    await recordBulkAuditLogs(auditEntries).catch(() => {});

    return { success: true, updatedCount: allAffectedIds.length };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Failed to reassign work items to new project',
    };
  }
}

/**
 * Server action to validate incoming work item against active sprint scope guardrails.
 */
export async function validateSprintIntakeAction(
  tenantSlug: string,
  sprintId: string,
  incomingItem: any,
  options?: import('@/lib/services/sprintGuardrailService').IntakeValidationOptions
): Promise<{
  success: boolean;
  result?: import('@/lib/services/sprintGuardrailService').IntakeValidationResult;
  error?: string;
  code?: string;
  required_ejection_points?: number;
}> {
  try {
    if (!tenantSlug || !sprintId || !incomingItem) {
      return { success: false, error: 'tenantSlug, sprintId, and incomingItem are required' };
    }

    // Authenticate session
    const supabase = await createServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return { success: false, error: 'Unauthorized: Valid user session required' };
    }

    const service = supabaseAdmin;

    // Verify workspace access
    const { data: tenant } = await service
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .is('deleted_at', null)
      .maybeSingle();

    if (!tenant) {
      return { success: false, error: `Workspace @${tenantSlug} not found` };
    }

    const { data: member } = await service
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenant.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!member) {
      const { data: owned } = await service
        .from('tenants')
        .select('id')
        .eq('id', tenant.id)
        .eq('owner_id', user.id)
        .maybeSingle();

      if (!owned) {
        return { success: false, error: 'Forbidden: Access to workspace denied' };
      }
    }

    const { validateSprintIntake, SprintGuardrailError } = await import(
      '@/lib/services/sprintGuardrailServer'
    );

    try {
      const result = await validateSprintIntake(tenantSlug, sprintId, incomingItem, options);
      return { success: true, result };
    } catch (err: any) {
      if (err instanceof SprintGuardrailError) {
        return {
          success: false,
          error: err.message,
          code: err.code,
          required_ejection_points: err.required_ejection_points,
        };
      }
      return { success: false, error: err.message || 'Intake validation failed' };
    }
  } catch (err: any) {
    return { success: false, error: err.message || 'Server action failed' };
  }
}

/**
 * Server action to execute an atomic sprint swap:
 * Assigns incomingItem (and any descendants) to sprint while ejecting specified unstarted items back to backlog.
 */
export async function atomicSprintSwapAction(params: {
  tenantSlug: string;
  sprintName: string;
  incomingItemId: string;
  ejectedItemIds: string[];
  options?: import('@/lib/services/sprintGuardrailService').IntakeValidationOptions;
}): Promise<{ success: boolean; error?: string; code?: string; required_ejection_points?: number }> {
  try {
    const { tenantSlug, sprintName, incomingItemId, ejectedItemIds, options } = params;

    if (!tenantSlug || !sprintName || !incomingItemId) {
      return { success: false, error: 'tenantSlug, sprintName, and incomingItemId are required' };
    }

    // 1. Authenticate caller
    const supabase = await createServerClient();
    const {
      data: { user },
      error: userErr,
    } = await supabase.auth.getUser();

    if (userErr || !user) {
      return { success: false, error: 'Unauthorized: Valid user session required' };
    }

    const service = supabaseAdmin;

    // Verify workspace membership
    const { data: tenant } = await service
      .from('tenants')
      .select('id')
      .eq('slug', tenantSlug)
      .is('deleted_at', null)
      .maybeSingle();

    if (!tenant) {
      return { success: false, error: `Workspace @${tenantSlug} not found` };
    }

    const { data: member } = await service
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenant.id)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!member) {
      const { data: owned } = await service
        .from('tenants')
        .select('id')
        .eq('id', tenant.id)
        .eq('owner_id', user.id)
        .maybeSingle();

      if (!owned) {
        return { success: false, error: 'Forbidden: Access to workspace denied' };
      }
    }

    // 2. Fetch incoming item scoped to tenant
    const { data: incomingItem, error: incErr } = await service
      .from('work_items')
      .select('*')
      .eq('id', incomingItemId)
      .eq('tenant_id', tenant.id)
      .single();

    if (incErr || !incomingItem) {
      return { success: false, error: 'Incoming work item not found in this workspace' };
    }

    // 3. Fetch ejected items scoped to tenant
    let ejectedItems: any[] = [];
    if (ejectedItemIds && ejectedItemIds.length > 0) {
      const { data: ejects, error: ejectErr } = await service
        .from('work_items')
        .select('*')
        .in('id', ejectedItemIds)
        .eq('tenant_id', tenant.id);

      if (ejectErr || !ejects || ejects.length !== ejectedItemIds.length) {
        return { success: false, error: 'One or more items specified for ejection were not found in this workspace' };
      }
      ejectedItems = ejects;
    }

    // 4. Validate through sprintGuardrailService
    const { validateSprintIntake, SprintGuardrailError } = await import(
      '@/lib/services/sprintGuardrailServer'
    );

    try {
      await validateSprintIntake(tenantSlug, sprintName, incomingItem, {
        ...options,
        ejectedItems,
        ejectedItemIds,
      });
    } catch (err: any) {
      if (err instanceof SprintGuardrailError) {
        return {
          success: false,
          error: err.message,
          code: err.code,
          required_ejection_points: err.required_ejection_points,
        };
      }
      return { success: false, error: err.message || 'Sprint intake rejected' };
    }

    const nowIso = new Date().toISOString();

    // 5. Gather incoming item and any descendants to prevent stranding child tasks
    const { data: projectItems } = await service
      .from('work_items')
      .select('id, parent_id, metadata')
      .eq('project_id', incomingItem.project_id)
      .eq('tenant_id', tenant.id);

    const getDescendants = (parentId: string): string[] => {
      const children = (projectItems || []).filter((it: any) => it.parent_id === parentId);
      let desc: string[] = [];
      for (const ch of children) {
        desc.push(ch.id);
        desc = desc.concat(getDescendants(ch.id));
      }
      return desc;
    };
    const incomingDescendantIds = getDescendants(incomingItemId);

    // 6. Atomic database updates: assign incoming item and descendants to sprint
    const incomingMeta = {
      ...(incomingItem.metadata || {}),
      sprint: sprintName,
      added_mid_sprint: true,
    };
    const { error: assignErr } = await service
      .from('work_items')
      .update({ metadata: incomingMeta, updated_at: nowIso })
      .eq('id', incomingItemId)
      .eq('tenant_id', tenant.id);

    if (assignErr) {
      return { success: false, error: `Failed to assign item to sprint: ${assignErr.message}` };
    }

    for (const descId of incomingDescendantIds) {
      const origChild = (projectItems || []).find((it: any) => it.id === descId);
      const childMeta = { ...(origChild?.metadata || {}), sprint: sprintName, added_mid_sprint: true };
      await service
        .from('work_items')
        .update({ metadata: childMeta, updated_at: nowIso })
        .eq('id', descId)
        .eq('tenant_id', tenant.id);
    }

    // 7. Eject selected items back to backlog with verified atomic status
    const updatedEjectedIds: string[] = [];
    if (ejectedItemIds && ejectedItemIds.length > 0) {
      for (const ej of ejectedItems) {
        const nextMeta = { ...(ej.metadata || {}) };
        delete nextMeta.sprint;
        delete nextMeta.sprint_id;
        const { error: ejectUpdateErr } = await service
          .from('work_items')
          .update({ metadata: nextMeta, updated_at: nowIso })
          .eq('id', ej.id)
          .eq('tenant_id', tenant.id);

        if (ejectUpdateErr) {
          // Rollback incoming item assignment and any completed ejections
          await service
            .from('work_items')
            .update({ metadata: incomingItem.metadata || {}, updated_at: nowIso })
            .eq('id', incomingItemId)
            .eq('tenant_id', tenant.id);

          for (const descId of incomingDescendantIds) {
            const origChild = (projectItems || []).find((it: any) => it.id === descId);
            await service
              .from('work_items')
              .update({ metadata: origChild?.metadata || {}, updated_at: nowIso })
              .eq('id', descId)
              .eq('tenant_id', tenant.id);
          }

          for (const revertedId of updatedEjectedIds) {
            const orig = ejectedItems.find((i) => i.id === revertedId);
            if (orig) {
              await service
                .from('work_items')
                .update({ metadata: orig.metadata || {}, updated_at: nowIso })
                .eq('id', revertedId)
                .eq('tenant_id', tenant.id);
            }
          }

          return { success: false, error: `Failed to eject item ${ej.id}: ${ejectUpdateErr.message}` };
        }
        updatedEjectedIds.push(ej.id);
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Atomic swap failed' };
  }
}



