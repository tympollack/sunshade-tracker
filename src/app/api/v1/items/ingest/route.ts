import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';
import { IngestItemPayload } from '@/types/tracker';
import { recordBulkAuditLogs } from '@/lib/audit-log';


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
      } else {
        const { data: inserted, error: insertErr } = await supabaseAdmin
          .from('work_items')
          .insert(itemPayload)
          .select()
          .single();

        if (insertErr) throw insertErr;
        insertedItems.push(inserted);
      }
    }

    if (insertedItems.length > 0) {
      recordBulkAuditLogs(
        insertedItems.map((it: any) => ({
          tenant_id: tenant.id,
          project_id: it.project_id,
          item_id: it.id,
          actor_id: auth.context.userId || null,
          actor_name: auth.context.userId ? 'User' : 'Ingest Pipeline',
          action: 'create' as const,
          changed_fields: { created: { before: null, after: it } },
        }))
      ).catch(() => {});
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
