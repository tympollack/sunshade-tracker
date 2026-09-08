import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';
import { IngestItemPayload } from '@/types/tracker';
import { recordBulkAuditLogs, computeChangedFields } from '@/lib/audit-log';
import { getTenantMemberRecipients, dispatchItemNotifications } from '@/lib/notifications';


export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate — supports both session cookies (dashboard Spark tab)
    //    and Bearer API keys (headless pipeline clients like Gemini Spark agents)
    const auth = await authenticate(req);
    if (auth.errorResponse) return auth.errorResponse;
    const { tenant } = auth.context;

    // 2. Parse Body & Resolve Target Project
    const body = await req.json();
    const { project_slug, items } = body as {
      project_slug: string;
      items: IngestItemPayload[];
    };

    if (!project_slug || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Body must include "project_slug" and a non-empty "items" array' },
        { status: 400 }
      );
    }

    // Fetch Project Settings to validate types and statuses dynamically
    let projectQuery: any = supabaseAdmin
      .from('projects')
      .select('id, settings')
      .eq('tenant_id', tenant.id)
      .eq('slug', project_slug);

    if (typeof projectQuery.is === 'function') {
      projectQuery = projectQuery.is('deleted_at', null); // only ingest into active projects
    }

    const { data: project, error: projErr } = await projectQuery.single();

    if (projErr || !project) {
      return NextResponse.json({ error: `Project '${project_slug}' not found` }, { status: 404 });
    }

    const settings = project.settings || {};
    const defaultStatus = settings.statuses?.[0]?.id || 'not_started';
    const defaultType = settings.hierarchy?.[settings.hierarchy.length - 1]?.type || 'task';

    // 3. Query existing maximum order_index to append sequentially
    let lastItemQuery: any = supabaseAdmin
      .from('work_items')
      .select('order_index')
      .eq('project_id', project.id);

    if (typeof lastItemQuery.is === 'function') {
      lastItemQuery = lastItemQuery.is('deleted_at', null);
    }

    const { data: lastItem } = await lastItemQuery
      .order('order_index', { ascending: false })
      .limit(1)
      .single();

    let currentOrder = lastItem?.order_index ? lastItem.order_index + 1000.0 : 1000.0;

    // 4. Batch Process Items
    const insertedItems = [];
    // Track batch external_ref_ids mapped to their resolved internal UUIDs for same-batch parent-child chaining
    const batchRefMap = new Map<string, string>();

    // Retrieve prior states for existing external_ref_ids to correctly classify audits
    const extRefIds = (items || []).map((it) => it.external_ref_id).filter(Boolean) as string[];
    const priorItemsMap = new Map<string, any>();

    if (extRefIds.length > 0) {
      try {
        let priorQuery: any = supabaseAdmin
          .from('work_items')
          .select('*')
          .eq('project_id', project.id);

        if (typeof priorQuery?.in === 'function') {
          priorQuery = priorQuery.in('external_ref_id', extRefIds);
          const { data: priorRows } = await priorQuery;
          for (const row of priorRows || []) {
            if (row.external_ref_id) {
              priorItemsMap.set(row.external_ref_id, row);
            }
          }
        }
      } catch {
        // Fall back gracefully if prior state lookup is unavailable
      }
    }

    const auditEntries: Array<{
      tenant_id: string;
      project_id: string;
      item_id: string;
      actor_id: string | null;
      actor_name: string;
      action: 'create' | 'update' | 'restore';
      changed_fields: Record<string, any>;
    }> = [];

    for (const item of items) {
      // Resolve Parent ID if parent_ref_id is supplied
      let resolvedParentId: string | null = null;
      if (item.parent_ref_id) {
        if (batchRefMap.has(item.parent_ref_id)) {
          resolvedParentId = batchRefMap.get(item.parent_ref_id)!;
        } else {
          let parentQuery: any = supabaseAdmin
            .from('work_items')
            .select('id')
            .eq('project_id', project.id)
            .eq('external_ref_id', item.parent_ref_id);

          if (typeof parentQuery.is === 'function') {
            parentQuery = parentQuery.is('deleted_at', null); // don't link to soft-deleted parents
          }

          const { data: parentItem } = await parentQuery.maybeSingle();

          if (parentItem) {
            resolvedParentId = parentItem.id;
          }
        }
      }

      const itemPayload = {
        tenant_id: tenant.id,
        project_id: project.id,
        parent_id: resolvedParentId,
        external_ref_id: item.external_ref_id || null,
        item_type: item.item_type || defaultType,
        status: item.status || defaultStatus,
        title: item.title,
        description: item.description || null,
        assignee: item.assignee || null,
        order_index: item.order_index ?? currentOrder,
        metadata: item.metadata || {},
        updated_at: new Date().toISOString()
      };

      currentOrder += 1000.0;

      // Upsert by project_id and external_ref_id if provided; otherwise insert.
      // Explicitly setting deleted_at: null restores any previously soft-deleted row
      // with the same external_ref_id rather than silently updating a hidden record.
      if (item.external_ref_id) {
        const prior = priorItemsMap.get(item.external_ref_id);

        const { data: upserted, error: upsertErr } = await supabaseAdmin
          .from('work_items')
          .upsert(
            { ...itemPayload, deleted_at: null }, // clear deleted_at to restore soft-deleted rows
            { onConflict: 'project_id, external_ref_id' }
          )
          .select()
          .single();

        if (upsertErr) throw upsertErr;
        insertedItems.push(upserted);
        if (upserted?.id && item.external_ref_id) {
          batchRefMap.set(item.external_ref_id, upserted.id);
        }

        // Classify audit action: create, restore, or update
        let action: 'create' | 'update' | 'restore' = 'create';
        let changed_fields: Record<string, any> = {};

        if (!prior) {
          action = 'create';
          changed_fields = { created: { before: null, after: upserted } };
        } else if (prior.deleted_at !== null) {
          action = 'restore';
          changed_fields = {
            deleted_at: { before: prior.deleted_at, after: null },
            ...computeChangedFields(prior, upserted),
          };
        } else {
          action = 'update';
          changed_fields = computeChangedFields(prior, upserted);
        }

        // Keep local cache up to date for subsequent items in batch
        priorItemsMap.set(item.external_ref_id, upserted);

        if (action === 'create' || action === 'restore' || Object.keys(changed_fields).length > 0) {
          auditEntries.push({
            tenant_id: tenant.id,
            project_id: upserted.project_id,
            item_id: upserted.id,
            actor_id: auth.context.userId || null,
            actor_name: auth.context.userId ? 'User' : 'Ingest Pipeline',
            action,
            changed_fields,
          });
        }
      } else {
        const { data: inserted, error: insertErr } = await supabaseAdmin
          .from('work_items')
          .insert(itemPayload)
          .select()
          .single();

        if (insertErr) throw insertErr;
        insertedItems.push(inserted);

        auditEntries.push({
          tenant_id: tenant.id,
          project_id: inserted.project_id,
          item_id: inserted.id,
          actor_id: auth.context.userId || null,
          actor_name: auth.context.userId ? 'User' : 'Ingest Pipeline',
          action: 'create',
          changed_fields: { created: { before: null, after: inserted } },
        });
      }
    }

    if (auditEntries.length > 0) {
      recordBulkAuditLogs(auditEntries).catch(() => {});
    }

    // Dispatch notifications for assigned items
    const assignedIngested = insertedItems.filter((it: any) => it.assignee);
    if (assignedIngested.length > 0) {
      getTenantMemberRecipients(tenant.id)
        .then((resolver) => {
          for (const it of assignedIngested) {
            const prior = priorItemsMap.get(it.external_ref_id);
            const recipient = resolver.resolve(it.assignee);
            if (recipient) {
              dispatchItemNotifications({
                tenantId: tenant.id,
                projectId: it.project_id,
                item: it,
                beforeItem: prior || null,
                actorId: auth.context.userId || null,
                actorName: auth.context.userId ? 'User' : 'Ingest Pipeline',
                recipientUser: recipient,
              }).catch(() => {});
            }
          }
        })
        .catch(() => {});
    }

    return NextResponse.json({
      success: true,
      count: insertedItems.length,
      items: insertedItems
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
