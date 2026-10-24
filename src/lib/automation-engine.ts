import { createHmac } from 'node:crypto';
import { supabaseAdmin } from '@/lib/db';
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
export function matchesTrigger(trigger: AutomationTrigger | null | undefined, item: any): boolean {
  if (!trigger || !item) return false;

  // 1. Verify event if explicitly specified
  if (trigger.event && trigger.event !== 'item_created' && trigger.event !== trigger.type) {
    // If event is specified and not item_created (the current ingestion event), do not match
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
}

/**
 * Expands a child task template into database records, linking each child
 * to parentItem.id and generating deterministic external_ref_ids.
 */
export function buildTemplateRecords(options: ExpandTemplateOptions): any[] {
  const { tenantId, projectId, template, parentItem } = options;
  const parentRef = parentItem.external_ref_id || parentItem.id || 'ITEM';
  const baseOrder = typeof parentItem.order_index === 'number' ? parentItem.order_index : 1000.0;

  return template.map((tmplItem, index) => {
    let childRefId: string | null = null;
    if (tmplItem.external_ref_id) {
      const interpolatedSuffix = interpolate(tmplItem.external_ref_id, parentItem);
      const suffix = interpolatedSuffix.startsWith('-') ? interpolatedSuffix : `-${interpolatedSuffix}`;
      childRefId = `${parentRef}${suffix}`;
    } else {
      childRefId = `${parentRef}-SUB-${index + 1}`;
    }

    const title = interpolate(tmplItem.title, parentItem);
    const description = tmplItem.description ? interpolate(tmplItem.description, parentItem) : null;

    const childMetadata: Record<string, any> = { ...(tmplItem.metadata || {}) };
    for (const [k, v] of Object.entries(childMetadata)) {
      if (typeof v === 'string') {
        childMetadata[k] = interpolate(v, parentItem);
      }
    }

    return {
      tenant_id: tenantId,
      project_id: projectId,
      parent_id: parentItem.id,
      external_ref_id: childRefId,
      item_type: tmplItem.item_type || 'task',
      status: tmplItem.status || 'not_started',
      title,
      description,
      assignee: tmplItem.assignee ?? null,
      order_index: tmplItem.order_index ?? baseOrder + (index + 1) * 100.0,
      metadata: childMetadata,
      deleted_at: null,
      updated_at: new Date().toISOString(),
    };
  });
}

/**
 * Expands and persists child template tasks into tracker.work_items.
 */
export async function expandTemplate(options: ExpandTemplateOptions): Promise<WorkItem[]> {
  const records = buildTemplateRecords(options);
  if (records.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from('work_items')
    .upsert(records, { onConflict: 'project_id, external_ref_id' })
    .select();

  if (error) {
    throw error;
  }

  return (data || []) as WorkItem[];
}

/**
 * Dispatches an HTTP webhook with standard 5000ms timeout and optional HMAC signature.
 */
export async function dispatchWebhook(
  action: DispatchWebhookAction,
  payload: any,
  secret?: string
): Promise<Response> {
  const webhookUrl = action.url;
  if (!webhookUrl) {
    throw new Error('Missing webhook URL in dispatch_webhook action');
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
    signal: AbortSignal.timeout(5000),
  });
}

export interface ExecuteAutomationsOptions {
  tenantId: string;
  projectId: string;
  settings: ProjectSettings;
  items: WorkItem[];
}

/**
 * Evaluates active project automations against newly ingested items
 * and triggers templates or webhooks accordingly.
 */
export async function executeProjectAutomations(options: ExecuteAutomationsOptions): Promise<void> {
  const { tenantId, projectId, settings, items } = options;
  if (!settings?.automations || !Array.isArray(settings.automations) || settings.automations.length === 0) {
    return;
  }
  if (!items || !Array.isArray(items) || items.length === 0) {
    return;
  }

  for (const rule of settings.automations) {
    if (rule.enabled === false) continue;

    for (const item of items) {
      if (!matchesTrigger(rule.trigger, item)) continue;

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
                parentContext = parentData || null;
              } catch {
                // Ignore failure to fetch parent context
              }
            }

            const payload = {
              event: rule.trigger.event || 'item_created',
              item,
              parent: parentContext,
              timestamp: new Date().toISOString(),
            };

            await dispatchWebhook(webhookAction, payload, webhookAction.secret);
          }
        } catch (actionErr) {
          console.error(`[tracker:automation] Error executing action in rule "${rule.name || rule.id}":`, actionErr);
        }
      }
    }
  }
}
