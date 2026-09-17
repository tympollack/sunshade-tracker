import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';
import { IngestItemPayload } from '@/types/tracker';
import { recordBulkAuditLogs, computeChangedFields } from '@/lib/audit-log';
import { getTenantMemberRecipients, dispatchItemNotifications } from '@/lib/notifications';
import { deriveProjectPrefix, generateSequentialRefsForBatch } from '@/lib/ref-generator';


export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate — supports both session cookies (dashboard Spark tab)
    //    and Bearer API keys (headless pipeline clients like Gemini Spark agents)
    const auth = await authenticate(req);
    if (auth.errorResponse) return auth.errorResponse;
    const { tenant } = auth.context;

    // 2. Parse Body & Resolve Target Project (with optional TRK-08 overrides)
    const body = await req.json();
    const { project_slug, items, override_project_slug, override_sprint, override_assignee } = body as {
      project_slug: string;
      items: IngestItemPayload[];
      override_project_slug?: string;
      override_sprint?: string | null;
      override_assignee?: string | null;
    };

    // Validate override fields
    if (override_project_slug !== undefined && override_project_slug !== null) {
      if (typeof override_project_slug !== 'string') {
        return NextResponse.json(
          { error: '"override_project_slug" must be a string' },
          { status: 400 }
        );
      }
      const trimmedProj = override_project_slug.trim();
      if (trimmedProj.length === 0 || trimmedProj.length > 100 || !/^[a-z0-9-_]+$/i.test(trimmedProj)) {
        return NextResponse.json(
          { error: 'Invalid "override_project_slug". Must be 1-100 alphanumeric, hyphen, or underscore characters.' },
          { status: 400 }
        );
      }
    }

    if (override_sprint !== undefined && override_sprint !== null) {
      if (typeof override_sprint !== 'string') {
        return NextResponse.json(
          { error: '"override_sprint" must be a string or null' },
          { status: 400 }
        );
      }
      const trimmedSprint = override_sprint.trim();
      if (trimmedSprint !== '__none__') {
        if (trimmedSprint.length === 0 || trimmedSprint.length > 100 || /[\r\n\t<>]/.test(trimmedSprint)) {
          return NextResponse.json(
            { error: 'Invalid "override_sprint". Must be 1-100 characters without illegal control characters.' },
            { status: 400 }
          );
        }
      }
    }

    if (override_assignee !== undefined && override_assignee !== null) {
      if (typeof override_assignee !== 'string') {
        return NextResponse.json(
          { error: '"override_assignee" must be a string or null' },
          { status: 400 }
        );
      }
      const trimmedAssignee = override_assignee.trim();
      if (trimmedAssignee !== '__unassigned__' && trimmedAssignee !== '') {
        if (trimmedAssignee.length > 100 || /[\r\n\t<>]/.test(trimmedAssignee)) {
          return NextResponse.json(
            { error: 'Invalid "override_assignee". Must be 1-100 characters without illegal control characters.' },
            { status: 400 }
          );
        }
      }
    }

    const effectiveProjectSlug = override_project_slug || project_slug;

    if (!effectiveProjectSlug || !Array.isArray(items) || items.length === 0) {
      return NextResponse.json(
        { error: 'Body must include "project_slug" and a non-empty "items" array' },
        { status: 400 }
      );
    }

    // Fetch Project Settings to validate types and statuses dynamically
    let projectQuery: any = supabaseAdmin
      .from('projects')
      .select('id, slug, name, settings')
      .eq('tenant_id', tenant.id)
      .eq('slug', effectiveProjectSlug);

    if (typeof projectQuery.is === 'function') {
      projectQuery = projectQuery.is('deleted_at', null); // only ingest into active projects
    }

    const { data: project, error: projErr } = await projectQuery.single();

    if (projErr || !project) {
      return NextResponse.json({ error: `Project '${effectiveProjectSlug}' not found` }, { status: 404 });
    }

    const settings = project.settings || {};

    // Validate override_sprint against managed_sprints if configured
    if (
      override_sprint &&
      override_sprint !== '__none__' &&
      Array.isArray(settings?.sprint_settings?.managed_sprints) &&
      settings.sprint_settings.managed_sprints.length > 0
    ) {
      const match = settings.sprint_settings.managed_sprints.some(
        (s: any) =>
          s.name?.toLowerCase() === override_sprint.trim().toLowerCase() ||
          s.id === override_sprint.trim()
      );
      if (!match) {
        return NextResponse.json(
          { error: `Invalid "override_sprint" '${override_sprint}'. Must match an existing sprint in this project.` },
          { status: 422 }
        );
      }
    }

    // Validate override_assignee against tenant members
    if (
      override_assignee &&
      override_assignee !== '__unassigned__' &&
      override_assignee.trim() !== ''
    ) {
      try {
        const resolver = await getTenantMemberRecipients(tenant.id);
        const recipient = resolver.resolve(override_assignee.trim());
        const membersTable: any = supabaseAdmin.from('tenant_members');
        if (membersTable && typeof membersTable.select === 'function') {
          const { count } = await membersTable
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', tenant.id);

          if (typeof count === 'number' && count > 0 && !recipient) {
            return NextResponse.json(
              { error: `Invalid "override_assignee" '${override_assignee}': member not found in workspace.` },
              { status: 422 }
            );
          }
        }
      } catch (err: any) {
        console.warn('[tracker:ingest] Error validating assignee against workspace members:', err);
      }
    }

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
    const itemMutationSnapshots: Array<{ item: any; prior: any }> = [];
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
      } catch (err) {
        console.warn('[tracker:ingest] Error checking prior external_refs:', err);
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

    // Pre-generate sequential reference tags for items without external_ref_id
    const prefix = deriveProjectPrefix({ slug: project.slug || project_slug, name: project.name, settings });
    const itemsNeedingRefs = items.filter((it) => !it.external_ref_id || !it.external_ref_id.trim());
    const generatedBatchRefs = await generateSequentialRefsForBatch(
      project.id,
      prefix,
      itemsNeedingRefs.length,
      new Set(items.map((it) => it.external_ref_id).filter(Boolean) as string[])
    );
    let genRefIdx = 0;

    for (const item of items) {
      const resolvedExternalRefId = (item.external_ref_id && item.external_ref_id.trim())
        ? item.external_ref_id.trim()
        : generatedBatchRefs[genRefIdx++];

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

      const effectiveMetadata = { ...(item.metadata || {}) };
      if (override_sprint !== undefined) {
        if (override_sprint === '__none__' || override_sprint === null) {
          delete effectiveMetadata.sprint;
        } else if (override_sprint) {
          effectiveMetadata.sprint = override_sprint;
        }
      }

      let effectiveAssignee = item.assignee || null;
      if (override_assignee !== undefined) {
        if (override_assignee === '__unassigned__' || override_assignee === null || override_assignee === '') {
          effectiveAssignee = null;
        } else {
          effectiveAssignee = override_assignee;
        }
      }

      const itemPayload = {
        tenant_id: tenant.id,
        project_id: project.id,
        parent_id: resolvedParentId,
        external_ref_id: resolvedExternalRefId || null,
        item_type: item.item_type || defaultType,
        status: item.status || defaultStatus,
        title: item.title,
        description: item.description || null,
        assignee: effectiveAssignee,
        order_index: item.order_index ?? currentOrder,
        metadata: effectiveMetadata,
        updated_at: new Date().toISOString()
      };

      currentOrder += 1000.0;

      // Upsert by project_id and external_ref_id if provided; otherwise insert.
      // Explicitly setting deleted_at: null restores any previously soft-deleted row
      // with the same external_ref_id rather than silently updating a hidden record.
      if (resolvedExternalRefId) {
        const prior = priorItemsMap.get(resolvedExternalRefId) || null;

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
        itemMutationSnapshots.push({ item: upserted, prior });

        if (upserted?.id && resolvedExternalRefId) {
          batchRefMap.set(resolvedExternalRefId, upserted.id);
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
        priorItemsMap.set(resolvedExternalRefId, upserted);

        if (action === 'create' || action === 'restore' || Object.keys(changed_fields).length > 0) {
          auditEntries.push({
            tenant_id: tenant.id,
            project_id: upserted.project_id,
            item_id: upserted.id,
            actor_id: auth.context.userId || null,
            actor_name: auth.context.userName || (auth.context.userId ? 'User' : 'Ingest Pipeline'),
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
        itemMutationSnapshots.push({ item: inserted, prior: null });

        auditEntries.push({
          tenant_id: tenant.id,
          project_id: inserted.project_id,
          item_id: inserted.id,
          actor_id: auth.context.userId || null,
          actor_name: auth.context.userName || (auth.context.userId ? 'User' : 'Ingest Pipeline'),
          action: 'create',
          changed_fields: { created: { before: null, after: inserted } },
        });
      }
    }

    if (auditEntries.length > 0) {
      await recordBulkAuditLogs(auditEntries).catch(() => {});
    }

    // Dispatch notifications for assigned items with preserved pre-mutation prior snapshot
    const assignedMutations = itemMutationSnapshots.filter((snap) => snap.item?.assignee);
    if (assignedMutations.length > 0) {
      try {
        const resolver = await getTenantMemberRecipients(tenant.id);
        const notificationPromises: Promise<any>[] = [];

        for (const { item: it, prior } of assignedMutations) {
          const recipient = resolver.resolve(it.assignee);
          if (recipient) {
            notificationPromises.push(
              dispatchItemNotifications({
                tenantId: tenant.id,
                tenantSlug: tenant.slug,
                projectId: it.project_id,
                projectSlug: project.slug || project_slug,
                item: it,
                beforeItem: prior || null,
                actorId: auth.context.userId || null,
                actorName: auth.context.userName || (auth.context.userId ? 'User' : 'Ingest Pipeline'),
                recipientUser: recipient,
              })
            );
          }
        }

        if (notificationPromises.length > 0) {
          await Promise.allSettled(notificationPromises);
        }
      } catch (notifErr) {
        console.warn('[tracker:ingest] Notification dispatch error:', notifErr);
      }
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
