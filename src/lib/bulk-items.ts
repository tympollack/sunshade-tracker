import { supabaseAdmin } from '@/lib/db';
import { WorkItem, ProjectSettings } from '@/types/tracker';
import { validateHierarchyNesting } from '@/lib/fractional-index';
import { recordBulkAuditLogs, computeChangedFields } from '@/lib/audit-log';
import { getTenantMemberRecipients, dispatchItemNotifications } from '@/lib/notifications';


export const MAX_BULK_ITEMS = 100;

export interface BulkGetParams {
  ids?: string[];
  refs?: string[];
  projectSlug?: string;
  projectId?: string;
}

export interface BulkCreateItemInput {
  title: string;
  description?: string | null;
  item_type?: string;
  status?: string;
  assignee?: string | null;
  parent_id?: string | null;
  parent_ref_id?: string | null;
  external_ref_id?: string | null;
  metadata?: Record<string, any>;
  order_index?: number;
  project_id?: string;
  project_slug?: string;
}

export interface BulkCreatePayload {
  project_slug?: string;
  project_id?: string;
  items: BulkCreateItemInput[];
}

export interface BulkUpdateItemInput {
  id: string;
  title?: string;
  description?: string | null;
  status?: string;
  item_type?: string;
  assignee?: string | null;
  parent_id?: string | null;
  external_ref_id?: string | null;
  metadata?: Record<string, any>;
  order_index?: number;
}

export interface BulkUpdatePayload {
  ids?: string[];
  updates?: {
    title?: string;
    description?: string | null;
    status?: string;
    item_type?: string;
    assignee?: string | null;
    parent_id?: string | null;
    metadata?: Record<string, any>;
    order_index?: number;
  };
  items?: BulkUpdateItemInput[];
}

export interface BulkDeletePayload {
  ids: string[];
}

/**
 * Bulk retrieve items by IDs or external reference tags within tenant context
 */
export async function handleBulkGetItems(
  tenantId: string,
  params: BulkGetParams
): Promise<{ success: boolean; count: number; items: WorkItem[]; error?: string; status?: number }> {
  if (params.ids && params.ids.length > MAX_BULK_ITEMS) {
    return {
      success: false,
      count: 0,
      items: [],
      error: `Bulk operations are limited to a maximum of ${MAX_BULK_ITEMS} items`,
      status: 400,
    };
  }

  if (params.refs && params.refs.length > MAX_BULK_ITEMS) {
    return {
      success: false,
      count: 0,
      items: [],
      error: `Bulk operations are limited to a maximum of ${MAX_BULK_ITEMS} items`,
      status: 400,
    };
  }

  let resolvedProjectId = params.projectId;
  if (!resolvedProjectId && params.projectSlug) {
    let projQuery: any = supabaseAdmin
      .from('projects')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('slug', params.projectSlug);
    if (typeof projQuery.is === 'function') {
      projQuery = projQuery.is('deleted_at', null);
    }
    const { data: proj, error: projErr } = await projQuery.maybeSingle();
    if (projErr) {
      return { success: false, count: 0, items: [], error: projErr.message, status: 500 };
    }
    if (!proj) {
      return {
        success: false,
        count: 0,
        items: [],
        error: `Project with slug '${params.projectSlug}' not found`,
        status: 404,
      };
    }
    resolvedProjectId = proj.id;
  } else if (resolvedProjectId) {
    let projQuery: any = supabaseAdmin
      .from('projects')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('id', resolvedProjectId);
    if (typeof projQuery.is === 'function') {
      projQuery = projQuery.is('deleted_at', null);
    }
    const { data: proj, error: projErr } = await projQuery.maybeSingle();
    if (projErr) {
      return { success: false, count: 0, items: [], error: projErr.message, status: 500 };
    }
    if (!proj) {
      return {
        success: false,
        count: 0,
        items: [],
        error: `Project with ID '${resolvedProjectId}' not found`,
        status: 404,
      };
    }
  }

  let query: any = supabaseAdmin
    .from('work_items')
    .select('*')
    .eq('tenant_id', tenantId);

  if (typeof query.is === 'function') {
    query = query.is('deleted_at', null);
  }

  if (params.ids && params.ids.length > 0) {
    query = query.in('id', params.ids);
    if (resolvedProjectId) {
      query = query.eq('project_id', resolvedProjectId);
    }
  } else if (params.refs && params.refs.length > 0) {
    query = query.in('external_ref_id', params.refs);
    if (resolvedProjectId) {
      query = query.eq('project_id', resolvedProjectId);
    }
  } else {
    return {
      success: false,
      count: 0,
      items: [],
      error: 'Either "ids" or "refs" parameter must be specified',
      status: 400,
    };
  }

  query = query.order('order_index', { ascending: true });

  const { data: items, error } = await query;
  if (error) {
    return { success: false, count: 0, items: [], error: error.message, status: 500 };
  }

  return {
    success: true,
    count: items?.length || 0,
    items: (items || []) as WorkItem[],
  };
}

/**
 * Bulk create work items in one batch within tenant context
 */
export async function handleBulkCreateItems(
  tenantId: string,
  payload: BulkCreatePayload
): Promise<{ success: boolean; count: number; items: WorkItem[]; error?: string; status?: number }> {
  if (!payload || !Array.isArray(payload.items) || payload.items.length === 0) {
    return {
      success: false,
      count: 0,
      items: [],
      error: 'Body must include a non-empty "items" array',
      status: 400,
    };
  }

  if (payload.items.length > MAX_BULK_ITEMS) {
    return {
      success: false,
      count: 0,
      items: [],
      error: `Bulk operations are limited to a maximum of ${MAX_BULK_ITEMS} items`,
      status: 400,
    };
  }

  // Cache project lookups
  const projectCache = new Map<string, { id: string; settings: ProjectSettings }>();

  async function resolveProject(projId?: string, projSlug?: string) {
    const key = projId ? `id:${projId}` : projSlug ? `slug:${projSlug}` : null;
    if (!key) return null;
    if (projectCache.has(key)) return projectCache.get(key)!;

    let query: any = supabaseAdmin
      .from('projects')
      .select('id, settings')
      .eq('tenant_id', tenantId);

    if (projId) query = query.eq('id', projId);
    else if (projSlug) query = query.eq('slug', projSlug);

    if (typeof query.is === 'function') {
      query = query.is('deleted_at', null);
    }

    const { data: project } = await query.maybeSingle();
    if (project) {
      projectCache.set(key, project);
      projectCache.set(`id:${project.id}`, project);
    }
    return project || null;
  }

  // Resolve default project if specified at root
  const defaultProject = await resolveProject(payload.project_id, payload.project_slug);

  // Pre-calculate order indices per project
  const projectCurrentOrder = new Map<string, number>();

  async function getNextOrder(projectId: string): Promise<number> {
    if (projectCurrentOrder.has(projectId)) {
      const next = projectCurrentOrder.get(projectId)! + 1000.0;
      projectCurrentOrder.set(projectId, next);
      return next;
    }

    let lastItemQuery: any = supabaseAdmin
      .from('work_items')
      .select('order_index')
      .eq('project_id', projectId);

    if (typeof lastItemQuery.is === 'function') {
      lastItemQuery = lastItemQuery.is('deleted_at', null);
    }

    const { data: lastItem } = await lastItemQuery
      .order('order_index', { ascending: false })
      .limit(1)
      .maybeSingle();

    const startOrder = lastItem?.order_index ? lastItem.order_index + 1000.0 : 1000.0;
    projectCurrentOrder.set(projectId, startOrder);
    return startOrder;
  }

  // Pass 1: Pre-assign UUIDs to all items so same-batch forward and backward references can resolve
  const preassignedItems = payload.items.map((it) => ({
    ...it,
    id: (it as any).id || crypto.randomUUID(),
  }));

  const batchRefMap = new Map<string, (typeof preassignedItems)[0]>();
  const batchIdMap = new Map<string, (typeof preassignedItems)[0]>();

  for (const it of preassignedItems) {
    batchIdMap.set(it.id, it);
    if (it.external_ref_id && typeof it.external_ref_id === 'string' && it.external_ref_id.trim()) {
      batchRefMap.set(it.external_ref_id.trim(), it);
    }
  }

  const rowsToInsert: any[] = [];

  // Pass 2: Atomic validation of all items before inserting anything
  for (let i = 0; i < preassignedItems.length; i++) {
    const it = preassignedItems[i];
    if (!it.title || typeof it.title !== 'string' || it.title.trim() === '') {
      return {
        success: false,
        count: 0,
        items: [],
        error: `Item at index ${i} is missing required field "title"`,
        status: 400,
      };
    }

    const itemProject =
      (it.project_id || it.project_slug)
        ? await resolveProject(it.project_id, it.project_slug)
        : defaultProject;

    if (!itemProject) {
      return {
        success: false,
        count: 0,
        items: [],
        error: `Item at index ${i} does not have a valid project associated with it`,
        status: 400,
      };
    }

    // Reject self-parenting
    if (it.parent_id && it.parent_id === it.id) {
      return {
        success: false,
        count: 0,
        items: [],
        error: `Item "${it.title}" cannot be its own parent`,
        status: 400,
      };
    }
    if (it.parent_ref_id && it.external_ref_id && it.parent_ref_id.trim() === it.external_ref_id.trim()) {
      return {
        success: false,
        count: 0,
        items: [],
        error: `Item "${it.title}" cannot reference itself as parent`,
        status: 400,
      };
    }

    const settings = itemProject.settings || {};
    const defaultStatus = settings.statuses?.[0]?.id || 'not_started';
    const defaultType = settings.hierarchy?.[(settings.hierarchy?.length || 1) - 1]?.type || 'task';

    const resolvedStatus = it.status || defaultStatus;
    const resolvedType = it.item_type || defaultType;

    // Validate status if project defines statuses
    if (settings.statuses?.length && !settings.statuses.some((s: any) => s.id === resolvedStatus)) {
      return {
        success: false,
        count: 0,
        items: [],
        error: `Item "${it.title}" has invalid status '${resolvedStatus}'. Allowed: [${settings.statuses.map((s: any) => s.id).join(', ')}]`,
        status: 422,
      };
    }

    // Validate type if project defines hierarchy
    if (settings.hierarchy?.length && !settings.hierarchy.some((h: any) => h.type === resolvedType)) {
      return {
        success: false,
        count: 0,
        items: [],
        error: `Item "${it.title}" has invalid item_type '${resolvedType}'. Allowed: [${settings.hierarchy.map((h: any) => h.type).join(', ')}]`,
        status: 422,
      };
    }

    // Resolve parent_id (by direct ID or parent_ref_id)
    let resolvedParentId: string | null = it.parent_id || null;
    let resolvedParentType: string | null = null;
    let resolvedParentProjectId: string | null = null;

    if (it.parent_ref_id) {
      const refKey = it.parent_ref_id.trim();
      if (batchRefMap.has(refKey)) {
        const parentBatchItem = batchRefMap.get(refKey)!;
        resolvedParentId = parentBatchItem.id;
        const parentProj = (parentBatchItem.project_id || parentBatchItem.project_slug)
          ? await resolveProject(parentBatchItem.project_id, parentBatchItem.project_slug)
          : defaultProject;
        const parentSettings = parentProj?.settings || {};
        const parentDefaultType = parentSettings.hierarchy?.[(parentSettings.hierarchy?.length || 1) - 1]?.type || 'task';
        resolvedParentType = parentBatchItem.item_type || parentDefaultType;
        resolvedParentProjectId = parentProj?.id || itemProject.id;
      } else {
        let parentQuery: any = supabaseAdmin
          .from('work_items')
          .select('id, item_type, project_id')
          .eq('tenant_id', tenantId)
          .eq('external_ref_id', refKey);

        if (typeof parentQuery.is === 'function') {
          parentQuery = parentQuery.is('deleted_at', null);
        }

        const { data: parentItem } = await parentQuery.maybeSingle();
        if (!parentItem) {
          return {
            success: false,
            count: 0,
            items: [],
            error: `Parent with reference '${refKey}' not found`,
            status: 404,
          };
        }
        resolvedParentId = parentItem.id;
        resolvedParentType = parentItem.item_type;
        resolvedParentProjectId = parentItem.project_id;
      }
    } else if (resolvedParentId) {
      if (batchIdMap.has(resolvedParentId)) {
        const parentBatchItem = batchIdMap.get(resolvedParentId)!;
        const parentProj = (parentBatchItem.project_id || parentBatchItem.project_slug)
          ? await resolveProject(parentBatchItem.project_id, parentBatchItem.project_slug)
          : defaultProject;
        const parentSettings = parentProj?.settings || {};
        const parentDefaultType = parentSettings.hierarchy?.[(parentSettings.hierarchy?.length || 1) - 1]?.type || 'task';
        resolvedParentType = parentBatchItem.item_type || parentDefaultType;
        resolvedParentProjectId = parentProj?.id || itemProject.id;
      } else {
        let parentQuery: any = supabaseAdmin
          .from('work_items')
          .select('id, item_type, project_id')
          .eq('tenant_id', tenantId)
          .eq('id', resolvedParentId);

        if (typeof parentQuery.is === 'function') {
          parentQuery = parentQuery.is('deleted_at', null);
        }

        const { data: parentItem } = await parentQuery.maybeSingle();
        if (!parentItem) {
          return {
            success: false,
            count: 0,
            items: [],
            error: `Parent item '${resolvedParentId}' not found`,
            status: 404,
          };
        }
        resolvedParentType = parentItem.item_type;
        resolvedParentProjectId = parentItem.project_id;
      }
    }

    // Validate parent relationship
    if (resolvedParentId) {
      if (resolvedParentProjectId && resolvedParentProjectId !== itemProject.id) {
        return {
          success: false,
          count: 0,
          items: [],
          error: 'Parent item must belong to the same project',
          status: 400,
        };
      }

      if (settings.hierarchy?.length && resolvedParentType) {
        const nestCheck = validateHierarchyNesting(resolvedParentType, resolvedType, settings.hierarchy);
        if (!nestCheck.valid) {
          return {
            success: false,
            count: 0,
            items: [],
            error: nestCheck.message,
            status: 422,
          };
        }
      }
    }

    const orderIdx = it.order_index ?? (await getNextOrder(itemProject.id));
    const now = new Date().toISOString();

    rowsToInsert.push({
      id: it.id,
      tenant_id: tenantId,
      project_id: itemProject.id,
      parent_id: resolvedParentId,
      external_ref_id: it.external_ref_id || null,
      item_type: resolvedType,
      status: resolvedStatus,
      title: it.title.trim(),
      description: it.description || null,
      assignee: it.assignee || null,
      order_index: orderIdx,
      metadata: it.metadata || {},
      created_at: now,
      updated_at: now,
    });
  }

  const { data: inserted, error: insertErr } = await supabaseAdmin
    .from('work_items')
    .insert(rowsToInsert)
    .select('*');

  if (insertErr) {
    return {
      success: false,
      count: 0,
      items: [],
      error: insertErr.message,
      status: 400,
    };
  }

  const items = (inserted || []) as WorkItem[];

  // Record audit logs for bulk created items
  if (items.length > 0) {
    recordBulkAuditLogs(
      items.map((it) => ({
        tenant_id: tenantId,
        project_id: it.project_id,
        item_id: it.id,
        action: 'create',
        changed_fields: { created: { before: null, after: it } },
      }))
    ).catch(() => {});
  }

  // Dispatch notifications for assigned created items
  const assignedItems = items.filter((it) => it.assignee);
  if (assignedItems.length > 0) {
    getTenantMemberRecipients(tenantId)
      .then((resolver) => {
        for (const it of assignedItems) {
          const recipient = resolver.resolve(it.assignee);
          if (recipient) {
            dispatchItemNotifications({
              tenantId,
              projectId: it.project_id,
              item: it,
              beforeItem: null,
              recipientUser: recipient,
            }).catch(() => {});
          }
        }
      })
      .catch(() => {});
  }

  return {
    success: true,
    count: items.length,
    items,
  };
}

/**
 * Helper to dispatch item notifications for bulk mutations where status or assignee changed.
 */
async function dispatchBulkNotifications(
  tenantId: string,
  updatedItems: WorkItem[],
  beforeLookup: (id: string) => any
): Promise<void> {
  const notificationCandidates = updatedItems.filter((updated) => {
    const before = beforeLookup(updated.id);
    if (!before) return false;
    const statusChanged = before.status !== undefined && before.status !== null && before.status !== updated.status;
    const assignmentChanged = updated.assignee !== undefined && updated.assignee !== null && updated.assignee !== before.assignee;
    return statusChanged || assignmentChanged;
  });

  if (notificationCandidates.length === 0) return;

  try {
    const resolver = await getTenantMemberRecipients(tenantId);
    for (const updated of notificationCandidates) {
      const before = beforeLookup(updated.id);
      const targetAssignee = updated.assignee || before?.assignee;
      const recipient = resolver.resolve(targetAssignee);
      if (recipient) {
        dispatchItemNotifications({
          tenantId,
          projectId: updated.project_id,
          item: updated,
          beforeItem: before,
          recipientUser: recipient,
        }).catch(() => {});
      }
    }
  } catch (err: any) {
    console.warn('[tracker:bulk-items] Failed to dispatch bulk notifications:', err?.message || err);
  }
}

/**
 * Bulk update work items (uniform or heterogeneous) within tenant context
 */
export async function handleBulkUpdateItems(
  tenantId: string,
  payload: BulkUpdatePayload
): Promise<{ success: boolean; updated_count: number; items: WorkItem[]; error?: string; status?: number }> {
  // Shared project settings cache
  const projectSettingsCache = new Map<string, ProjectSettings>();
  async function getProjectSettings(projectId: string): Promise<ProjectSettings> {
    if (projectSettingsCache.has(projectId)) return projectSettingsCache.get(projectId)!;
    let projQuery: any = supabaseAdmin
      .from('projects')
      .select('id, settings')
      .eq('tenant_id', tenantId)
      .eq('id', projectId);
    if (typeof projQuery.is === 'function') {
      projQuery = projQuery.is('deleted_at', null);
    }
    const { data: proj } = await projQuery.maybeSingle();
    const settings = proj?.settings || {};
    projectSettingsCache.set(projectId, settings);
    return settings;
  }

  // Modality A: Uniform update on `ids` with `updates` object
  if (Array.isArray(payload.ids) && payload.ids.length > 0 && payload.updates && typeof payload.updates === 'object') {
    const { ids, updates } = payload;

    if (ids.length > MAX_BULK_ITEMS) {
      return {
        success: false,
        updated_count: 0,
        items: [],
        error: `Bulk operations are limited to a maximum of ${MAX_BULK_ITEMS} items`,
        status: 400,
      };
    }

    // Fetch existing active items
    let fetchQuery: any = supabaseAdmin
      .from('work_items')
      .select('*')
      .in('id', ids)
      .eq('tenant_id', tenantId);

    if (typeof fetchQuery.is === 'function') {
      fetchQuery = fetchQuery.is('deleted_at', null);
    }

    const { data: existingItems, error: fetchErr } = await fetchQuery;
    if (fetchErr) {
      return { success: false, updated_count: 0, items: [], error: fetchErr.message, status: 500 };
    }

    if (!existingItems || existingItems.length === 0) {
      return {
        success: false,
        updated_count: 0,
        items: [],
        error: 'No matching active items found for the provided IDs',
        status: 404,
      };
    }

    const now = new Date().toISOString();
    const plannedUpdates: Array<{ id: string; fields: Record<string, any> }> = [];

    // Pre-validate all items before any writes are made
    for (const item of existingItems) {
      const projectSettings = await getProjectSettings(item.project_id);
      const effectiveType = updates.item_type !== undefined ? updates.item_type : item.item_type;
      const effectiveStatus = updates.status !== undefined ? updates.status : item.status;
      const effectiveParentId = updates.parent_id !== undefined ? updates.parent_id : item.parent_id;

      // Validate status
      if (updates.status !== undefined && projectSettings?.statuses?.length) {
        if (!projectSettings.statuses.some((s: any) => s.id === effectiveStatus)) {
          return {
            success: false,
            updated_count: 0,
            items: [],
            error: `Item "${item.title || item.id}" has invalid status '${effectiveStatus}'. Allowed: [${projectSettings.statuses.map((s: any) => s.id).join(', ')}]`,
            status: 422,
          };
        }
      }

      // Validate item_type
      if (updates.item_type !== undefined && projectSettings?.hierarchy?.length) {
        if (!projectSettings.hierarchy.some((h: any) => h.type === effectiveType)) {
          return {
            success: false,
            updated_count: 0,
            items: [],
            error: `Item "${item.title || item.id}" has invalid item_type '${effectiveType}'. Allowed: [${projectSettings.hierarchy.map((h: any) => h.type).join(', ')}]`,
            status: 422,
          };
        }
      }

      let targetParentId = updates.parent_id !== undefined ? updates.parent_id : item.parent_id;

      // Validate parent hierarchy
      if (effectiveParentId) {
        if (effectiveParentId === item.id) {
          return {
            success: false,
            updated_count: 0,
            items: [],
            error: 'Item cannot be its own parent',
            status: 400,
          };
        }

        let parentItem = existingItems.find((e: any) => e.id === effectiveParentId);
        if (!parentItem) {
          let parentQuery: any = supabaseAdmin
            .from('work_items')
            .select('id, item_type, project_id')
            .eq('tenant_id', tenantId)
            .eq('id', effectiveParentId);
          if (typeof parentQuery.is === 'function') {
            parentQuery = parentQuery.is('deleted_at', null);
          }
          const { data: p } = await parentQuery.maybeSingle();
          parentItem = p;
        }

        if (!parentItem) {
          return {
            success: false,
            updated_count: 0,
            items: [],
            error: `Parent item '${effectiveParentId}' not found`,
            status: 404,
          };
        }

        if (parentItem.project_id !== item.project_id) {
          return {
            success: false,
            updated_count: 0,
            items: [],
            error: 'Parent item must belong to the same project',
            status: 400,
          };
        }

        if (projectSettings?.hierarchy?.length) {
          const nestCheck = validateHierarchyNesting(parentItem.item_type, effectiveType, projectSettings.hierarchy);
          if (!nestCheck.valid) {
            if (updates.parent_id !== undefined) {
              return {
                success: false,
                updated_count: 0,
                items: [],
                error: nestCheck.message,
                status: 422,
              };
            }
            // Auto-clear incompatible parent if type was changed without explicitly setting parent_id
            targetParentId = null;
          }
        }
      }

      const itemUpdate: Record<string, any> = {
        updated_at: now,
      };

      if (updates.title !== undefined) itemUpdate.title = updates.title;
      if (updates.description !== undefined) itemUpdate.description = updates.description;
      if (updates.status !== undefined) itemUpdate.status = updates.status;
      if (updates.item_type !== undefined) itemUpdate.item_type = updates.item_type;
      if (updates.assignee !== undefined) itemUpdate.assignee = updates.assignee;
      if (updates.parent_id !== undefined || targetParentId !== item.parent_id) {
        itemUpdate.parent_id = targetParentId;
      }
      if (updates.order_index !== undefined) itemUpdate.order_index = updates.order_index;

      if (updates.metadata !== undefined) {
        itemUpdate.metadata = {
          ...(item.metadata || {}),
          ...updates.metadata,
        };
      }

      plannedUpdates.push({ id: item.id, fields: itemUpdate });
    }

    // Check if updates across all items are completely uniform without per-item differences
    const isCompletelyUniform =
      updates.metadata === undefined &&
      plannedUpdates.every((p) => {
        const keys1 = Object.keys(p.fields).sort();
        const keys2 = Object.keys(plannedUpdates[0].fields).sort();
        return (
          JSON.stringify(keys1) === JSON.stringify(keys2) &&
          keys1.every((k) => k === 'updated_at' || p.fields[k] === plannedUpdates[0].fields[k])
        );
      });

    if (isCompletelyUniform && plannedUpdates.length > 0) {
      let updateQuery: any = supabaseAdmin
        .from('work_items')
        .update(plannedUpdates[0].fields)
        .in('id', ids)
        .eq('tenant_id', tenantId);

      if (typeof updateQuery.is === 'function') {
        updateQuery = updateQuery.is('deleted_at', null);
      }

      const { data: updatedRows, error: updErr } = await updateQuery.select('*');
      if (updErr) {
        return { success: false, updated_count: 0, items: [], error: updErr.message, status: 400 };
      }
      const updatedList = (updatedRows || []) as WorkItem[];

      // Record audit logs for uniform bulk updates
      const auditEntries = updatedList
        .map((updated) => {
          const before = existingItems.find((e: any) => e.id === updated.id);
          const diff = computeChangedFields(before, updated);
          return {
            tenant_id: tenantId,
            project_id: updated.project_id,
            item_id: updated.id,
            action: 'update' as const,
            changed_fields: diff,
          };
        })
        .filter((entry) => Object.keys(entry.changed_fields).length > 0);

      if (auditEntries.length > 0) {
        recordBulkAuditLogs(auditEntries).catch(() => {});
      }

      // Dispatch notifications for uniform updates
      dispatchBulkNotifications(tenantId, updatedList, (id) =>
        existingItems.find((e: any) => e.id === id)
      ).catch(() => {});

      return {
        success: true,
        updated_count: updatedList.length,
        items: updatedList,
      };
    }

    // Execute concurrently using Promise.all to avoid serial request loops
    const updatePromises = plannedUpdates.map(async ({ id, fields }) => {
      return supabaseAdmin
        .from('work_items')
        .update(fields)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select('*')
        .single();
    });

    const results = await Promise.all(updatePromises);
    const updatedItems: WorkItem[] = [];

    for (const r of results) {
      if (r.error) {
        return {
          success: false,
          updated_count: updatedItems.length,
          items: updatedItems,
          error: r.error.message,
          status: 400,
        };
      }
      if (r.data) updatedItems.push(r.data as WorkItem);
    }

    // Record audit logs for updated items
    const auditEntries = updatedItems
      .map((updated) => {
        const before = existingItems.find((e: any) => e.id === updated.id);
        const diff = computeChangedFields(before, updated);
        return {
          tenant_id: tenantId,
          project_id: updated.project_id,
          item_id: updated.id,
          action: 'update' as const,
          changed_fields: diff,
        };
      })
      .filter((entry) => Object.keys(entry.changed_fields).length > 0);

    if (auditEntries.length > 0) {
      recordBulkAuditLogs(auditEntries).catch(() => {});
    }

    // Dispatch notifications for updated items
    dispatchBulkNotifications(tenantId, updatedItems, (id) =>
      existingItems.find((e: any) => e.id === id)
    ).catch(() => {});

    return {
      success: true,
      updated_count: updatedItems.length,
      items: updatedItems,
    };
  }

  // Modality B: Heterogeneous update array
  const itemList = payload.items || (Array.isArray(payload) ? (payload as any) : null);
  if (Array.isArray(itemList) && itemList.length > 0) {
    if (itemList.length > MAX_BULK_ITEMS) {
      return {
        success: false,
        updated_count: 0,
        items: [],
        error: `Bulk operations are limited to a maximum of ${MAX_BULK_ITEMS} items`,
        status: 400,
      };
    }

    for (let i = 0; i < itemList.length; i++) {
      if (!itemList[i]?.id) {
        return {
          success: false,
          updated_count: 0,
          items: [],
          error: `Item at index ${i} is missing required "id"`,
          status: 400,
        };
      }
    }

    const targetIds = itemList.map((it) => it.id);

    // Fetch existing active items
    let getBatchQuery: any = supabaseAdmin
      .from('work_items')
      .select('*')
      .in('id', targetIds)
      .eq('tenant_id', tenantId);

    if (typeof getBatchQuery.is === 'function') {
      getBatchQuery = getBatchQuery.is('deleted_at', null);
    }

    const { data: existingBatch, error: fetchErr } = await getBatchQuery;
    if (fetchErr) {
      return { success: false, updated_count: 0, items: [], error: fetchErr.message, status: 500 };
    }

    const existingMap = new Map<string, any>((existingBatch || []).map((e: any) => [e.id, e]));

    // Check for missing items
    for (const it of itemList) {
      if (!existingMap.has(it.id)) {
        return {
          success: false,
          updated_count: 0,
          items: [],
          error: `Item '${it.id}' not found`,
          status: 404,
        };
      }
    }

    const now = new Date().toISOString();
    const plannedUpdates: Array<{ id: string; fields: Record<string, any> }> = [];

    // Pre-validate all items before any writes are made
    for (const it of itemList) {
      const existing = existingMap.get(it.id)!;
      const projectSettings = await getProjectSettings(existing.project_id);

      const effectiveType = it.item_type !== undefined ? it.item_type : existing.item_type;
      const effectiveStatus = it.status !== undefined ? it.status : existing.status;
      const effectiveParentId = it.parent_id !== undefined ? it.parent_id : existing.parent_id;

      // Validate status
      if (it.status !== undefined && projectSettings?.statuses?.length) {
        if (!projectSettings.statuses.some((s: any) => s.id === effectiveStatus)) {
          return {
            success: false,
            updated_count: 0,
            items: [],
            error: `Item "${existing.title || existing.id}" has invalid status '${effectiveStatus}'. Allowed: [${projectSettings.statuses.map((s: any) => s.id).join(', ')}]`,
            status: 422,
          };
        }
      }

      // Validate item_type
      if (it.item_type !== undefined && projectSettings?.hierarchy?.length) {
        if (!projectSettings.hierarchy.some((h: any) => h.type === effectiveType)) {
          return {
            success: false,
            updated_count: 0,
            items: [],
            error: `Item "${existing.title || existing.id}" has invalid item_type '${effectiveType}'. Allowed: [${projectSettings.hierarchy.map((h: any) => h.type).join(', ')}]`,
            status: 422,
          };
        }
      }

      let targetParentId = it.parent_id !== undefined ? it.parent_id : existing.parent_id;

      // Validate parent hierarchy
      if (effectiveParentId) {
        if (effectiveParentId === existing.id) {
          return {
            success: false,
            updated_count: 0,
            items: [],
            error: 'Item cannot be its own parent',
            status: 400,
          };
        }

        let parentItem = existingMap.get(effectiveParentId);
        if (!parentItem) {
          let parentQuery: any = supabaseAdmin
            .from('work_items')
            .select('id, item_type, project_id')
            .eq('tenant_id', tenantId)
            .eq('id', effectiveParentId);
          if (typeof parentQuery.is === 'function') {
            parentQuery = parentQuery.is('deleted_at', null);
          }
          const { data: p } = await parentQuery.maybeSingle();
          parentItem = p;
        }

        if (!parentItem) {
          return {
            success: false,
            updated_count: 0,
            items: [],
            error: `Parent item '${effectiveParentId}' not found`,
            status: 404,
          };
        }

        if (parentItem.project_id !== existing.project_id) {
          return {
            success: false,
            updated_count: 0,
            items: [],
            error: 'Parent item must belong to the same project',
            status: 400,
          };
        }

        if (projectSettings?.hierarchy?.length) {
          const nestCheck = validateHierarchyNesting(parentItem.item_type, effectiveType, projectSettings.hierarchy);
          if (!nestCheck.valid) {
            if (it.parent_id !== undefined) {
              return {
                success: false,
                updated_count: 0,
                items: [],
                error: nestCheck.message,
                status: 422,
              };
            }
            targetParentId = null;
          }
        }
      }

      const patchFields: Record<string, any> = {
        updated_at: now,
      };

      if (it.title !== undefined) patchFields.title = it.title;
      if (it.description !== undefined) patchFields.description = it.description;
      if (it.status !== undefined) patchFields.status = it.status;
      if (it.item_type !== undefined) patchFields.item_type = it.item_type;
      if (it.assignee !== undefined) patchFields.assignee = it.assignee;
      if (it.parent_id !== undefined || targetParentId !== existing.parent_id) {
        patchFields.parent_id = targetParentId;
      }
      if (it.external_ref_id !== undefined) patchFields.external_ref_id = it.external_ref_id;
      if (it.order_index !== undefined) patchFields.order_index = it.order_index;

      if (it.metadata !== undefined) {
        patchFields.metadata = {
          ...(existing.metadata || {}),
          ...it.metadata,
        };
      }

      plannedUpdates.push({ id: it.id, fields: patchFields });
    }

    // Execute concurrently using Promise.all to avoid serial request loops
    const updatePromises = plannedUpdates.map(async ({ id, fields }) => {
      return supabaseAdmin
        .from('work_items')
        .update(fields)
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .select('*')
        .single();
    });

    const results = await Promise.all(updatePromises);
    const updatedItems: WorkItem[] = [];

    for (const r of results) {
      if (r.error) {
        return {
          success: false,
          updated_count: updatedItems.length,
          items: updatedItems,
          error: r.error.message,
          status: 400,
        };
      }
      if (r.data) updatedItems.push(r.data as WorkItem);
    }

    // Record audit logs for updated items
    const auditEntries = updatedItems
      .map((updated) => {
        const before = existingMap.get(updated.id);
        const diff = computeChangedFields(before, updated);
        return {
          tenant_id: tenantId,
          project_id: updated.project_id,
          item_id: updated.id,
          action: 'update' as const,
          changed_fields: diff,
        };
      })
      .filter((entry) => Object.keys(entry.changed_fields).length > 0);

    if (auditEntries.length > 0) {
      recordBulkAuditLogs(auditEntries).catch(() => {});
    }

    // Dispatch notifications for updated items
    dispatchBulkNotifications(tenantId, updatedItems, (id) =>
      existingMap.get(id)
    ).catch(() => {});

    return {
      success: true,
      updated_count: updatedItems.length,
      items: updatedItems,
    };
  }

  return {
    success: false,
    updated_count: 0,
    items: [],
    error: 'Payload must provide either { ids, updates } or { items: [...] }',
    status: 400,
  };
}

/**
 * Bulk soft-delete work items within tenant context
 */
export async function handleBulkDeleteItems(
  tenantId: string,
  payload: BulkDeletePayload
): Promise<{ success: boolean; deleted_count: number; deleted_ids: string[]; error?: string; status?: number }> {
  if (!payload || !Array.isArray(payload.ids) || payload.ids.length === 0) {
    return {
      success: false,
      deleted_count: 0,
      deleted_ids: [],
      error: 'Body must include a non-empty "ids" array of string UUIDs',
      status: 400,
    };
  }

  if (payload.ids.length > MAX_BULK_ITEMS) {
    return {
      success: false,
      deleted_count: 0,
      deleted_ids: [],
      error: `Bulk operations are limited to a maximum of ${MAX_BULK_ITEMS} items`,
      status: 400,
    };
  }

  const now = new Date().toISOString();
  let query: any = supabaseAdmin
    .from('work_items')
    .update({
      deleted_at: now,
      updated_at: now,
    })
    .in('id', payload.ids)
    .eq('tenant_id', tenantId);

  if (typeof query.is === 'function') {
    query = query.is('deleted_at', null);
  }

  const { data: deleted, error } = await query.select('id, project_id, deleted_at');
  if (error) {
    return {
      success: false,
      deleted_count: 0,
      deleted_ids: [],
      error: error.message,
      status: 500,
    };
  }

  const deletedRows = (deleted || []) as Array<{ id: string; project_id: string; deleted_at: string }>;
  if (deletedRows.length > 0) {
    recordBulkAuditLogs(
      deletedRows.map((d) => ({
        tenant_id: tenantId,
        project_id: d.project_id,
        item_id: d.id,
        action: 'delete' as const,
        changed_fields: { deleted_at: { before: null, after: d.deleted_at } },
      }))
    ).catch(() => {});
  }

  const deletedIds = deletedRows.map((d) => d.id);
  return {
    success: true,
    deleted_count: deletedIds.length,
    deleted_ids: deletedIds,
  };
}
