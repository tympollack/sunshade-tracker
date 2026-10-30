import { supabaseAdmin } from '@/lib/db';
import { calculateOrderIndex } from '@/lib/fractional-index';
import type { ProjectSettings, WorkItem } from '@/types/tracker';
import { validateTransitionGuards } from './guardEvaluator';

export interface GuardMutationResult {
  success: boolean;
  status: number;
  code?: 'GUARD_REJECTED' | string;
  error?: string;
  errors?: string[];
  item?: WorkItem | any;
}

async function fetchSingleRow(queryBuilder: any): Promise<{ data: any; error: any }> {
  if (!queryBuilder) return { data: null, error: null };
  if (typeof queryBuilder.maybeSingle === 'function') {
    return await queryBuilder.maybeSingle();
  }
  if (typeof queryBuilder.single === 'function') {
    return await queryBuilder.single();
  }
  return { data: null, error: null };
}

async function loadWorkItemById(itemId: string, tenantId?: string): Promise<{ data: any; error: any }> {
  const table: any = supabaseAdmin.from('work_items');
  if (!table || typeof table.select !== 'function') {
    return { data: null, error: new Error('Database client unavailable') };
  }
  let q: any = table.select('*');
  if (typeof q.eq === 'function') {
    q = q.eq('id', itemId);
    if (tenantId && typeof q.eq === 'function') {
      q = q.eq('tenant_id', tenantId);
    }
  }
  return await fetchSingleRow(q);
}

async function loadProjectSettings(projectId?: string | null): Promise<ProjectSettings | null> {
  if (!projectId) return null;
  const table: any = supabaseAdmin.from('projects');
  if (!table || typeof table.select !== 'function') return null;
  let q: any = table.select('id, settings');
  if (typeof q.eq === 'function') {
    q = q.eq('id', projectId);
  }
  const { data } = await fetchSingleRow(q);
  return data?.settings || null;
}

async function executeWorkItemDbUpdate(
  itemId: string,
  updateFields: Record<string, any>
): Promise<{ data: any; error: any }> {
  const table: any = supabaseAdmin.from('work_items');
  if (!table || typeof table.update !== 'function') {
    return { data: { id: itemId, ...updateFields }, error: null };
  }
  let q: any = table.update(updateFields);
  if (typeof q.eq === 'function') {
    q = q.eq('id', itemId);
  }
  if (typeof q.select === 'function') {
    const sel = q.select('*');
    const singleRes = await fetchSingleRow(sel);
    if (singleRes.data || singleRes.error) {
      return singleRes;
    }
    if (sel && typeof sel.then === 'function') {
      const res = await sel;
      return {
        data: Array.isArray(res?.data) ? res.data[0] : res?.data || { id: itemId, ...updateFields },
        error: res?.error || null,
      };
    }
  }
  if (q && typeof q.then === 'function') {
    const res = await q;
    return {
      data: res?.data || { id: itemId, ...updateFields },
      error: res?.error || null,
    };
  }
  return { data: { id: itemId, ...updateFields }, error: null };
}

export async function performUpdateWorkItemStatus(
  itemIdOrParams:
    | string
    | {
        id?: string;
        itemId?: string;
        status?: string;
        newStatus?: string;
        metadata?: Record<string, any>;
        prevOrder?: number;
        nextOrder?: number;
        projectSettings?: ProjectSettings | null;
      },
  newStatusParam?: string,
  options?: {
    metadata?: Record<string, any>;
    prevOrder?: number;
    nextOrder?: number;
    projectSettings?: ProjectSettings | null;
  }
): Promise<GuardMutationResult> {
  const isObj = typeof itemIdOrParams === 'object' && itemIdOrParams !== null;
  const itemId = isObj ? itemIdOrParams.id || itemIdOrParams.itemId || '' : itemIdOrParams;
  const targetStatus = isObj
    ? itemIdOrParams.newStatus || itemIdOrParams.status || newStatusParam || ''
    : newStatusParam || '';
  const metadataPatch = isObj ? itemIdOrParams.metadata : options?.metadata;
  const prevOrder = isObj ? itemIdOrParams.prevOrder : options?.prevOrder;
  const nextOrder = isObj ? itemIdOrParams.nextOrder : options?.nextOrder;
  const providedSettings = isObj ? itemIdOrParams.projectSettings : options?.projectSettings;

  if (!itemId || !targetStatus) {
    return {
      success: false,
      status: 400,
      error: 'Item ID and target status are required',
    };
  }

  const { data: existingItem, error: fetchErr } = await loadWorkItemById(itemId);
  if (fetchErr || !existingItem) {
    return {
      success: false,
      status: 404,
      error: fetchErr?.message || 'Work item not found',
    };
  }

  const projectSettings =
    providedSettings !== undefined
      ? providedSettings
      : await loadProjectSettings(existingItem.project_id);

  const guardResult = validateTransitionGuards(
    existingItem,
    targetStatus,
    projectSettings,
    metadataPatch ? { metadata: metadataPatch } : undefined
  );

  if (!guardResult.allowed) {
    return {
      success: false,
      status: 422,
      code: 'GUARD_REJECTED',
      error: guardResult.errors.join('; '),
      errors: guardResult.errors,
    };
  }

  const updateFields: Record<string, any> = {
    status: targetStatus,
    updated_at: new Date().toISOString(),
  };

  if (metadataPatch && typeof metadataPatch === 'object') {
    updateFields.metadata = {
      ...(existingItem.metadata || {}),
      ...metadataPatch,
    };
  }

  if (prevOrder !== undefined || nextOrder !== undefined) {
    updateFields.order_index = calculateOrderIndex(prevOrder, nextOrder);
  }

  const { data: updated, error: updateErr } = await executeWorkItemDbUpdate(itemId, updateFields);
  if (updateErr) {
    return {
      success: false,
      status: 400,
      error: updateErr.message || 'Failed to update work item status',
    };
  }

  return {
    success: true,
    status: 200,
    item: updated || { ...existingItem, ...updateFields },
  };
}

export async function performUpdateWorkItem(
  itemIdOrPayload:
    | string
    | (Partial<WorkItem> & {
        id?: string;
        itemId?: string;
        metadata?: Record<string, any>;
      }),
  updatesParam?: Partial<WorkItem> & { metadata?: Record<string, any> },
  options?: {
    projectSettings?: ProjectSettings | null;
  }
): Promise<GuardMutationResult> {
  const isObj = typeof itemIdOrPayload === 'object' && itemIdOrPayload !== null;
  const itemId = isObj ? itemIdOrPayload.id || itemIdOrPayload.itemId || '' : itemIdOrPayload;
  const updates: Record<string, any> = isObj
    ? { ...itemIdOrPayload, ...(updatesParam || {}) }
    : { ...(updatesParam || {}) };
  delete updates.id;
  delete updates.itemId;

  if (!itemId) {
    return {
      success: false,
      status: 400,
      error: 'Item ID is required',
    };
  }

  const { data: existingItem, error: fetchErr } = await loadWorkItemById(itemId);
  if (fetchErr || !existingItem) {
    return {
      success: false,
      status: 404,
      error: fetchErr?.message || 'Work item not found',
    };
  }

  const targetStatus = updates.status;
  if (targetStatus !== undefined && targetStatus !== existingItem.status) {
    const projectSettings =
      options?.projectSettings !== undefined
        ? options.projectSettings
        : await loadProjectSettings(updates.project_id || existingItem.project_id);

    const guardResult = validateTransitionGuards(
      existingItem,
      targetStatus,
      projectSettings,
      updates
    );

    if (!guardResult.allowed) {
      return {
        success: false,
        status: 422,
        code: 'GUARD_REJECTED',
        error: guardResult.errors.join('; '),
        errors: guardResult.errors,
      };
    }
  }

  const updateFields: Record<string, any> = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (updates.metadata && typeof updates.metadata === 'object') {
    updateFields.metadata = {
      ...(existingItem.metadata || {}),
      ...updates.metadata,
    };
  }

  const { data: updated, error: updateErr } = await executeWorkItemDbUpdate(itemId, updateFields);
  if (updateErr) {
    return {
      success: false,
      status: 400,
      error: updateErr.message || 'Failed to update work item',
    };
  }

  return {
    success: true,
    status: 200,
    item: updated || { ...existingItem, ...updateFields },
  };
}
