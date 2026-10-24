import { createHmac } from 'node:crypto';
import { supabaseAdmin } from '@/lib/db';
import { computeChangedFields, recordBulkAuditLogs } from '@/lib/audit-log';
import { isUuid, isMissingSprintIdColumnError } from '@/lib/bulk-items';
import type {
  AutomationAction,
  AutomationRule,
  AutomationTrigger,
  DispatchWebhookAction,
  ProjectSettings,
  ProjectTemplateItem,
  WorkItem,
} from '@/types/tracker';

/**
 * Checks if a given work item matches the criteria defined in an automation trigger.
 * Matches top-level fields (e.g. item_type, status) and nested metadata paths.
 */
export function matchesTrigger(
  trigger: AutomationTrigger | null | undefined,
  item: any,
  eventType: string = 'item_created'
): boolean {
  if (!trigger || !item) return false;

  // 1. Verify event if explicitly specified
  const expectedEvent = trigger.event || trigger.type;
  if (expectedEvent && expectedEvent !== eventType) {
    return false;
  }

  // 2. Reserved keys that should not be evaluated as field predicates
  const reservedKeys = new Set(['id', 'event', 'type', 'name', 'description', 'enabled', 'actions', 'action']);

  for (const [key, expectedValue] of Object.entries(trigger)) {
    if (reservedKeys.has(key)) continue;
    if (expectedValue === undefined || expectedValue === null) continue;

    if (key === 'metadata' && typeof expectedValue === 'object') {
      const itemMeta = item.metadata || {};
      for (const [metaKey, metaVal] of Object.entries(expectedValue)) {
        if (itemMeta[metaKey] !== metaVal) {
          return false;
        }
      }
      continue;
    }

    if (key.startsWith('metadata.')) {
      const metaKey = key.slice('metadata.'.length);
      const actualVal = item.metadata?.[metaKey];
      if (String(actualVal) !== String(expectedValue)) {
        return false;
      }
      continue;
    }

    // Top-level field check (item_type, status, assignee, etc.)
    const actualTopVal = item[key];
    if (actualTopVal !== undefined) {
      if (String(actualTopVal) !== String(expectedValue)) {
        return false;
      }
    } else if (item.metadata?.[key] !== undefined) {
      // Fallback: check metadata if property absent on top-level
      if (String(item.metadata[key]) !== String(expectedValue)) {
        return false;
      }
    } else {
      return false;
    }
  }

  return true;
}

/**
 * Replaces {{key}} and {{metadata.key}} mustache-style placeholders
 * in a template string with values from the context item.
 */
export function interpolate(templateString: string, contextItem: Record<string, any>): string {
  if (!templateString) return '';
  if (!contextItem) return templateString;

  return templateString.replace(/{{\s*([\w.]+)\s*}}/g, (_match, path: string) => {
    let resolved: any;

    if (path.startsWith('metadata.')) {
      const metaKey = path.slice('metadata.'.length);
      resolved = contextItem.metadata?.[metaKey];
    } else {
      resolved = contextItem[path];
      if (resolved === undefined && contextItem.metadata) {
        resolved = contextItem.metadata[path];
      }
    }

    if (resolved === undefined || resolved === null) {
      return '';
    }

    // Sanitize string output
    return String(resolved).trim();
  });
}

export interface ExpandTemplateOptions {
  tenantId: string;
  projectId: string;
  template: ProjectTemplateItem[];
  parentItem: WorkItem | any;
  settings?: ProjectSettings;
  actorId?: string | null;
  actorName?: string | null;
}

/**
 * Checks if a child item type is permitted under a given parent item type
 * based on project hierarchy definition.
 */
export function isAllowedChildType(
  parentType: string | undefined,
  childType: string,
  settings?: ProjectSettings
): boolean {
  if (!settings?.hierarchy || settings.hierarchy.length === 0 || !parentType) {
    return true;
  }
  const childLevel = settings.hierarchy.find((h) => h.type === childType);
  if (!childLevel) return false;
  if (Array.isArray(childLevel.allowed_parents)) {
    return childLevel.allowed_parents.includes(parentType);
  }
  return true;
}

/**
 * Resolves the default item_type compliant with project settings hierarchy.
 * Returns null if the parent is a leaf type that cannot have children.
 */
export function resolveDefaultChildType(parentItem: any, settings?: ProjectSettings): string | null {
  if (!settings?.hierarchy || settings.hierarchy.length === 0) {
    return 'task';
  }

  const hierarchy = settings.hierarchy;
  const parentType = parentItem?.item_type;

  if (parentType) {
    // 1. Look for a child type that explicitly allows parentItem.item_type as an allowed parent
    const directChild = hierarchy.find(
      (h) => Array.isArray(h.allowed_parents) && h.allowed_parents.includes(parentType)
    );
    if (directChild) return directChild.type;

    // 2. Check if parent is at deepest level (leaf)
    const sorted = [...hierarchy].sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
    const deepestLevel = sorted[0]?.level ?? 0;
    const parentLevelObj = hierarchy.find((h) => h.type === parentType);
    if (parentLevelObj && parentLevelObj.level >= deepestLevel) {
      return null;
    }
  }

  const sorted = [...hierarchy].sort((a, b) => (b.level ?? 0) - (a.level ?? 0));
  return sorted[0]?.type || 'task';
}

/**
 * Resolves the default status compliant with project settings statuses.
 */
function resolveDefaultChildStatus(settings?: ProjectSettings): string {
  if (settings?.statuses && settings.statuses.length > 0) {
    return settings.statuses[0].id;
  }
  return 'not_started';
}

/**
 * Expands a child task template into database records, linking each child
 * to parentItem.id and generating deterministic external_ref_ids.
 */
export function buildTemplateRecords(options: ExpandTemplateOptions): any[] {
  const { tenantId, projectId, template, parentItem, settings } = options;
  const parentRef = parentItem.external_ref_id || parentItem.id || 'ITEM';
  const baseOrder = typeof parentItem.order_index === 'number' ? parentItem.order_index : 1000.0;

  const defaultType = resolveDefaultChildType(parentItem, settings);
  const defaultStatus = resolveDefaultChildStatus(settings);

  const projectSprints: any[] = settings?.sprint_settings?.sprints || [];
  const seenRefs = new Set<string>();
  const records: any[] = [];

  for (let index = 0; index < template.length; index++) {
    const tmplItem = template[index];
    const targetType = tmplItem.item_type || defaultType;

    // Hierarchy validation: skip if target child type is disallowed under parent
    if (!targetType || !isAllowedChildType(parentItem?.item_type, targetType, settings)) {
      continue;
    }

    let childRefId: string | null = null;
    if (tmplItem.external_ref_id) {
      const interpolatedSuffix = interpolate(tmplItem.external_ref_id, parentItem);
      const suffix = interpolatedSuffix.startsWith('-') ? interpolatedSuffix : `-${interpolatedSuffix}`;
      childRefId = `${parentRef}${suffix}`;
    } else {
      childRefId = `${parentRef}-SUB-${index + 1}`;
    }

    // Ensure uniqueness within batch to avoid PostgreSQL upsert conflict collisions
    if (seenRefs.has(childRefId)) {
      childRefId = `${childRefId}-${index + 1}`;
    }
    seenRefs.add(childRefId);

    const title = interpolate(tmplItem.title, parentItem);
    const description = tmplItem.description ? interpolate(tmplItem.description, parentItem) : null;

    const childMetadata: Record<string, any> = { ...(tmplItem.metadata || {}) };
    for (const [k, v] of Object.entries(childMetadata)) {
      if (typeof v === 'string') {
        childMetadata[k] = interpolate(v, parentItem);
      }
    }

    // Sprint assignment: if child template provides ANY sprint information, override completely.
    // Otherwise, inherit from parent.
    const tmplHasSprint =
      tmplItem.sprint_id !== undefined ||
      (tmplItem.metadata &&
        (tmplItem.metadata.sprint !== undefined || tmplItem.metadata.sprint_id !== undefined));

    let resolvedRelationalSprintId: string | null = null;

    if (tmplHasSprint) {
      // Child template explicitly overrides sprint assignment
      const rawSprintName = tmplItem.metadata?.sprint;
      const rawSprintId = tmplItem.sprint_id ?? tmplItem.metadata?.sprint_id;

      if (rawSprintName) {
        const matched = projectSprints.find((s) => s.name === rawSprintName || s.id === rawSprintName);
        childMetadata.sprint = matched?.name || rawSprintName;
        if (matched?.id && isUuid(matched.id)) {
          childMetadata.sprint_id = matched.id;
          resolvedRelationalSprintId = matched.id;
        } else if (rawSprintId && isUuid(rawSprintId)) {
          childMetadata.sprint_id = rawSprintId;
          resolvedRelationalSprintId = rawSprintId;
        } else if (rawSprintId) {
          childMetadata.sprint_id = rawSprintId;
          resolvedRelationalSprintId = null;
        } else {
          delete childMetadata.sprint_id;
        }
      } else if (rawSprintId) {
        const matched = projectSprints.find((s) => s.id === rawSprintId || s.name === rawSprintId);
        if (matched) {
          childMetadata.sprint = matched.name || null;
          if (matched.id && isUuid(matched.id)) {
            childMetadata.sprint_id = matched.id;
            resolvedRelationalSprintId = matched.id;
          } else if (isUuid(rawSprintId)) {
            childMetadata.sprint_id = rawSprintId;
            resolvedRelationalSprintId = rawSprintId;
          } else {
            childMetadata.sprint_id = rawSprintId;
            resolvedRelationalSprintId = null;
          }
        } else {
          delete childMetadata.sprint;
          if (isUuid(rawSprintId)) {
            childMetadata.sprint_id = rawSprintId;
            resolvedRelationalSprintId = rawSprintId;
          } else {
            childMetadata.sprint_id = rawSprintId;
            resolvedRelationalSprintId = null;
          }
        }
      } else {
        // Explicit null / cleared sprint
        delete childMetadata.sprint;
        delete childMetadata.sprint_id;
      }
    } else {
      // Inherit parent's sprint assignment
      const rawParentSprint = parentItem.metadata?.sprint;
      const rawParentSprintId = parentItem.sprint_id || parentItem.metadata?.sprint_id;

      if (rawParentSprint) {
        const matched = projectSprints.find((s) => s.name === rawParentSprint || s.id === rawParentSprint);
        childMetadata.sprint = matched?.name || rawParentSprint;
        if (matched?.id && isUuid(matched.id)) {
          childMetadata.sprint_id = matched.id;
          resolvedRelationalSprintId = matched.id;
        } else if (rawParentSprintId && isUuid(rawParentSprintId)) {
          childMetadata.sprint_id = rawParentSprintId;
          resolvedRelationalSprintId = rawParentSprintId;
        } else if (rawParentSprintId) {
          // Legacy sprint identifier kept in metadata only
          childMetadata.sprint_id = rawParentSprintId;
          resolvedRelationalSprintId = null;
        }
      } else if (rawParentSprintId) {
        const matched = projectSprints.find((s) => s.id === rawParentSprintId || s.name === rawParentSprintId);
        if (matched) {
          childMetadata.sprint = matched.name;
          if (matched.id && isUuid(matched.id)) {
            childMetadata.sprint_id = matched.id;
            resolvedRelationalSprintId = matched.id;
          } else if (isUuid(rawParentSprintId)) {
            childMetadata.sprint_id = rawParentSprintId;
            resolvedRelationalSprintId = rawParentSprintId;
          } else {
            childMetadata.sprint_id = rawParentSprintId;
            resolvedRelationalSprintId = null;
          }
        } else if (isUuid(rawParentSprintId)) {
          childMetadata.sprint_id = rawParentSprintId;
          resolvedRelationalSprintId = rawParentSprintId;
        } else {
          childMetadata.sprint_id = rawParentSprintId;
          resolvedRelationalSprintId = null;
        }
      }
    }

    records.push({
      tenant_id: tenantId,
      project_id: projectId,
      parent_id: parentItem.id,
      external_ref_id: childRefId,
      item_type: targetType,
      status: tmplItem.status || defaultStatus,
      title,
      description,
      assignee: tmplItem.assignee ?? null,
      order_index: tmplItem.order_index ?? baseOrder + (index + 1) * 100.0,
      sprint_id: resolvedRelationalSprintId,
      metadata: childMetadata,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    });
  }

  return records;
}

/**
 * Expands and persists child template tasks into tracker.work_items,
 * maintaining full audit trail history and preserving existing child edits.
 */
export async function expandTemplate(options: ExpandTemplateOptions): Promise<WorkItem[]> {
  const records = buildTemplateRecords(options);
  if (records.length === 0) return [];

  // 1. Fetch prior child records to determine audit create vs update vs restore
  const extRefIds = records.map((r) => r.external_ref_id).filter(Boolean) as string[];
  const priorChildMap = new Map<string, any>();

  if (extRefIds.length > 0) {
    try {
      const { data: priors } = await supabaseAdmin
        .from('work_items')
        .select('*')
        .eq('project_id', options.projectId)
        .in('external_ref_id', extRefIds);

      (priors || []).forEach((p: any) => {
        if (p?.external_ref_id) {
          priorChildMap.set(p.external_ref_id, p);
        }
      });
    } catch {
      // Non-blocking query failure
    }
  }

  // Preserve user edits on existing children: only persist missing children or restore soft-deleted
  const recordsToUpsert = records.filter((rec) => {
    if (!rec.external_ref_id) return true;
    const prior = priorChildMap.get(rec.external_ref_id);
    if (!prior) return true; // Newly created child
    if (prior.deleted_at !== null) return true; // Restoring soft-deleted child
    return false; // Active existing child; do not overwrite user modifications
  });

  if (recordsToUpsert.length === 0) {
    return Array.from(priorChildMap.values());
  }

  // 2. Upsert child records
  let { data, error } = await supabaseAdmin
    .from('work_items')
    .upsert(recordsToUpsert, { onConflict: 'project_id, external_ref_id' })
    .select();

  if (error && isMissingSprintIdColumnError(error)) {
    // Relational sprint_id column missing from PostgREST schema cache: retry without sprint_id column
    const fallbackRecords = recordsToUpsert.map((rec) => {
      const copy = { ...rec };
      delete copy.sprint_id;
      return copy;
    });
    const retry = await supabaseAdmin
      .from('work_items')
      .upsert(fallbackRecords, { onConflict: 'project_id, external_ref_id' })
      .select();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    throw error;
  }

  const upsertedItems = (data || []) as WorkItem[];

  // 3. Record audit logs for modified/inserted child items
  const auditEntries: any[] = [];
  for (const item of upsertedItems) {
    if (!item.external_ref_id) continue;
    const prior = priorChildMap.get(item.external_ref_id);

    let action: 'create' | 'update' | 'restore' = 'create';
    let changed_fields: Record<string, any> = {};

    if (!prior) {
      action = 'create';
      changed_fields = { created: { before: null, after: item } };
    } else if (prior.deleted_at !== null) {
      action = 'restore';
      changed_fields = {
        deleted_at: { before: prior.deleted_at, after: null },
        ...computeChangedFields(prior, item),
      };
    } else {
      action = 'update';
      changed_fields = computeChangedFields(prior, item);
    }

    auditEntries.push({
      tenant_id: options.tenantId,
      project_id: options.projectId,
      item_id: item.id,
      actor_id: options.actorId || null,
      actor_name: options.actorName || 'Ingest Pipeline: Automation',
      action,
      changed_fields,
    });
  }

  if (auditEntries.length > 0) {
    await recordBulkAuditLogs(auditEntries).catch(() => {});
  }

  return upsertedItems;
}

/**
 * Validates that webhook URLs do not target loopback or private networks (SSRF prevention).
 */
export function isAllowedWebhookUrl(urlStr: string): boolean {
  try {
    const parsed = new URL(urlStr);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    if (process.env.NODE_ENV === 'test' || process.env.ALLOW_LOCAL_WEBHOOKS === 'true') {
      return true;
    }

    const host = parsed.hostname.toLowerCase();
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host === '169.254.169.254' ||
      /^10\./.test(host) ||
      /^192\.168\./.test(host) ||
      /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(host)
    ) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

/**
 * Sanitizes work item payload before transmitting to external webhook targets.
 */
export function sanitizeItemForWebhook(item: any): Record<string, any> {
  if (!item || typeof item !== 'object') return {};
  return {
    id: item.id,
    external_ref_id: item.external_ref_id,
    item_type: item.item_type,
    status: item.status,
    title: item.title,
    description: item.description,
    assignee: item.assignee,
    parent_id: item.parent_id,
    order_index: item.order_index,
    metadata: item.metadata,
    created_at: item.created_at,
    updated_at: item.updated_at,
  };
}

/**
 * Dispatches an HTTP webhook with standard 5000ms timeout, redirect: 'manual' (preventing SSRF redirection),
 * and optional HMAC signature.
 */
export async function dispatchWebhook(
  action: DispatchWebhookAction,
  payload: any,
  secret?: string
): Promise<Response> {
  const webhookUrl = action.url || (action as any).target;
  if (!webhookUrl) {
    throw new Error('Missing webhook URL in dispatch_webhook action');
  }

  if (!isAllowedWebhookUrl(webhookUrl)) {
    throw new Error(`Webhook URL cannot target private/loopback addresses: ${webhookUrl}`);
  }

  const rawPayload = JSON.stringify(payload);
  const effectiveSecret = secret || action.secret || process.env.TRACKER_WEBHOOK_SECRET;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'SunShade-Tracker-Automation/1.0',
  };

  if (effectiveSecret) {
    const signature = createHmac('sha256', effectiveSecret).update(rawPayload).digest('hex');
    headers['X-Tracker-Signature'] = `sha256=${signature}`;
    headers['X-Hub-Signature-256'] = `sha256=${signature}`;
  }

  return await fetch(webhookUrl, {
    method: 'POST',
    headers,
    body: rawPayload,
    redirect: 'manual', // Prevent SSRF redirection to internal/private services
    signal: AbortSignal.timeout(5000),
  });
}

export interface ExecuteAutomationsOptions {
  tenantId: string;
  projectId: string;
  settings: ProjectSettings;
  items: WorkItem[];
  itemMutationSnapshots?: Array<{ item: any; prior: any }>;
  actorId?: string | null;
  actorName?: string | null;
}

/**
 * Evaluates active project automations against newly ingested items
 * and triggers templates or webhooks accordingly.
 */
export async function executeProjectAutomations(options: ExecuteAutomationsOptions): Promise<void> {
  const { tenantId, projectId, settings, items, itemMutationSnapshots, actorId, actorName } = options;
  if (!settings?.automations || !Array.isArray(settings.automations) || settings.automations.length === 0) {
    return;
  }
  if (!items || !Array.isArray(items) || items.length === 0) {
    return;
  }

  const pendingWebhooks: Promise<any>[] = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const snap = itemMutationSnapshots?.[i];

    let eventType: 'item_created' | 'item_updated' | 'item_restored' = 'item_created';
    if (snap) {
      if (!snap.prior) {
        eventType = 'item_created';
      } else if (snap.prior.deleted_at !== null) {
        eventType = 'item_restored';
      } else {
        eventType = 'item_updated';
      }
    }

    for (const rule of settings.automations) {
      if (rule.enabled === false) continue;
      if (!matchesTrigger(rule.trigger, item, eventType)) continue;

      const actionsList: AutomationAction[] = Array.isArray(rule.actions)
        ? rule.actions
        : rule.action
        ? [rule.action]
        : [];

      for (const action of actionsList) {
        try {
          const actionType = action.type;
          const isTemplateAction =
            actionType === 'expand_children_template' ||
            actionType === 'apply_template' ||
            actionType === 'template' ||
            actionType === 'execute_template';

          if (isTemplateAction) {
            const templateId = (action as any).template_id || (action as any).target || (action as any).template;
            let templateItems: ProjectTemplateItem[] | undefined;

            if (settings.templates) {
              if (Array.isArray(settings.templates)) {
                const found = settings.templates.find(
                  (t: any) => t.id === templateId || t.name === templateId
                );
                templateItems = found?.items || found?.actions;
              } else if (typeof settings.templates === 'object') {
                templateItems = settings.templates[templateId];
              }
            }

            if (templateItems && Array.isArray(templateItems) && templateItems.length > 0) {
              await expandTemplate({
                tenantId,
                projectId,
                template: templateItems,
                parentItem: item,
                settings,
                actorId,
                actorName,
              });
            }
          } else if (actionType === 'dispatch_webhook') {
            const webhookAction = action as DispatchWebhookAction;
            let parentContext: any = null;

            if (webhookAction.include_parent_context && item.parent_id) {
              try {
                const { data: parentData } = await supabaseAdmin
                  .from('work_items')
                  .select('*')
                  .eq('id', item.parent_id)
                  .single();
                parentContext = parentData ? sanitizeItemForWebhook(parentData) : null;
              } catch {
                // Ignore failure to fetch parent context
              }
            }

            const payload = {
              event: rule.trigger.event || eventType,
              item: sanitizeItemForWebhook(item),
              parent: parentContext,
              timestamp: new Date().toISOString(),
            };

            pendingWebhooks.push(
              dispatchWebhook(webhookAction, payload, webhookAction.secret).catch((actionErr) => {
                console.error(`[tracker:automation] Webhook dispatch error in rule "${rule.name || rule.id}":`, actionErr);
              })
            );
          }
        } catch (actionErr) {
          console.error(`[tracker:automation] Error executing action in rule "${rule.name || rule.id}":`, actionErr);
        }
      }
    }
  }

  // Await concurrent webhook deliveries so batches do not accumulate sequential 5s timeouts
  if (pendingWebhooks.length > 0) {
    await Promise.allSettled(pendingWebhooks);
  }
}
