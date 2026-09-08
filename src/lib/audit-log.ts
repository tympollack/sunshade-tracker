import { supabaseAdmin } from '@/lib/db';
import { AuditLogEntry, WorkItem } from '@/types/tracker';

export interface RecordAuditLogParams {
  tenant_id: string;
  project_id: string;
  item_id: string;
  actor_id?: string | null;
  actor_name?: string | null;
  action: 'create' | 'update' | 'delete' | 'restore';
  changed_fields?: Record<string, { before: any; after: any }>;
}

const AUDITED_FIELDS: (keyof WorkItem)[] = [
  'title',
  'description',
  'status',
  'item_type',
  'assignee',
  'parent_id',
  'order_index',
  'metadata',
  'external_ref_id',
  'deleted_at',
];

/**
 * Computes a map of before/after field diffs between two work item revisions.
 */
export function computeChangedFields(
  before: Partial<WorkItem> | null | undefined,
  after: Partial<WorkItem> | null | undefined
): Record<string, { before: any; after: any }> {
  const diffs: Record<string, { before: any; after: any }> = {};
  if (!before && !after) return diffs;

  const b = before || {};
  const a = after || {};

  for (const field of AUDITED_FIELDS) {
    if (field in b || field in a) {
      const valB = b[field];
      const valA = a[field];

      let isChanged = false;
      if (typeof valB === 'object' || typeof valA === 'object') {
        isChanged = JSON.stringify(valB ?? null) !== JSON.stringify(valA ?? null);
      } else {
        isChanged = (valB ?? null) !== (valA ?? null);
      }

      if (isChanged) {
        diffs[field] = {
          before: valB ?? null,
          after: valA ?? null,
        };
      }
    }
  }

  return diffs;
}

/**
 * Records an immutable audit log entry in tracker.audit_logs.
 * Safely catches and logs errors so that audit logging failures do not break
 * the primary business operation.
 */
export async function recordAuditLog(
  params: RecordAuditLogParams
): Promise<AuditLogEntry | null> {
  try {
    const payload = {
      tenant_id: params.tenant_id,
      project_id: params.project_id,
      item_id: params.item_id,
      actor_id: params.actor_id || null,
      actor_name: params.actor_name || null,
      action: params.action,
      changed_fields: params.changed_fields || {},
      created_at: new Date().toISOString(),
    };

    const table: any = supabaseAdmin.from('audit_logs');
    if (!table || typeof table.insert !== 'function') {
      return null;
    }

    const { data, error } = await table
      .insert(payload)
      .select('*')
      .single();

    if (error) {
      console.warn('[tracker:audit-log] Failed to record audit log:', error.message);
      return null;
    }

    return data as AuditLogEntry;
  } catch (err: any) {
    console.warn('[tracker:audit-log] Exception recording audit log:', err?.message || err);
    return null;
  }
}

/**
 * Records multiple audit log entries in a single batch.
 */
export async function recordBulkAuditLogs(
  entries: RecordAuditLogParams[]
): Promise<AuditLogEntry[]> {
  if (!entries || entries.length === 0) return [];
  try {
    const payloads = entries.map((entry) => ({
      tenant_id: entry.tenant_id,
      project_id: entry.project_id,
      item_id: entry.item_id,
      actor_id: entry.actor_id || null,
      actor_name: entry.actor_name || null,
      action: entry.action,
      changed_fields: entry.changed_fields || {},
      created_at: new Date().toISOString(),
    }));

    const table: any = supabaseAdmin.from('audit_logs');
    if (!table || typeof table.insert !== 'function') {
      return [];
    }

    const { data, error } = await table
      .insert(payloads)
      .select('*');

    if (error) {
      console.warn('[tracker:audit-log] Failed to record bulk audit logs:', error.message);
      return [];
    }

    return (data || []) as AuditLogEntry[];
  } catch (err: any) {
    console.warn('[tracker:audit-log] Exception recording bulk audit logs:', err?.message || err);
    return [];
  }
}

/**
 * Retrieves chronological audit trail for a specific work item within tenant isolation.
 */
export async function getAuditLogsForItem(
  tenantId: string,
  itemId: string,
  limit: number = 50
): Promise<AuditLogEntry[]> {
  try {
    let query: any = supabaseAdmin
      .from('audit_logs')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('item_id', itemId);

    if (typeof query.order === 'function') {
      query = query.order('created_at', { ascending: false });
    }
    if (typeof query.limit === 'function') {
      query = query.limit(limit);
    }

    const { data, error } = await query;
    if (error) {
      console.warn('[tracker:audit-log] Failed to fetch audit logs:', error.message);
      return [];
    }

    return (data || []) as AuditLogEntry[];
  } catch (err: any) {
    console.warn('[tracker:audit-log] Exception fetching audit logs:', err?.message || err);
    return [];
  }
}
