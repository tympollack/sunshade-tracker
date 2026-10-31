import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { verifyHmacSignature } from '@/lib/webhooks/verify-hmac';
import { triggerAutomationEvent } from '@/lib/automation-engine';
import { extractDeploymentInfo, itemMatchesDeployment } from '@/lib/webhooks/deployments';
import type { WorkItem } from '@/types/tracker';

/**
 * POST /api/v1/webhooks/deployments
 *
 * Ingests CI/CD deployment payloads (GitHub, Vercel, Cloudflare Pages), matches active work items
 * by commit SHA or branch reference, fires the 'deployment_completed' automation event,
 * and updates item metadata with live preview links.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // 1. Signature Verification
  const signature =
    req.headers.get('x-hub-signature-256') ||
    req.headers.get('x-vercel-signature') ||
    req.headers.get('x-sunshade-signature') ||
    req.headers.get('x-signature');

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }

  // 2. Tenant Resolution
  const tenantSlug =
    req.headers.get('x-tenant-slug') ||
    body.tenant_slug ||
    body.tenant ||
    new URL(req.url).searchParams.get('tenant') ||
    process.env.TRACKER_TENANT ||
    'pym-energy';

  let tenant: any = null;
  if (supabaseAdmin && typeof supabaseAdmin.from === 'function') {
    try {
      let tenantQuery: any = supabaseAdmin
        .from('tenants')
        .select('id, slug, name, tier, metadata')
        .eq('slug', tenantSlug);

      if (typeof tenantQuery.is === 'function') {
        tenantQuery = tenantQuery.is('deleted_at', null);
      }

      const { data: tData } = await tenantQuery.maybeSingle();
      tenant = tData;
    } catch {
      // Non-blocking query failure
    }
  }

  const globalSecret =
    process.env.DEPLOYMENT_WEBHOOK_SECRET ||
    process.env.SUNSHADE_ECOSYSTEM_WEBHOOK_SECRET ||
    process.env.SUNSHADE_WEBHOOK_SECRET ||
    '';
  const tenantSecret = tenant?.metadata?.deployment_webhook_secret;

  let isValidSig = true;
  if (tenantSecret) {
    isValidSig = Boolean(signature && verifyHmacSignature(rawBody, signature, tenantSecret));
  } else if (globalSecret) {
    // Cross-tenant boundary protection: prevent globalSecret from authenticating arbitrary external tenants
    const isPlatformWorkspace =
      tenant?.slug === 'pym-energy' ||
      tenant?.slug === 'sunshade' ||
      tenant?.tier === 'demo' ||
      Boolean(tenant?.metadata?.allow_global_webhook_secret);

    if (!isPlatformWorkspace && tenant) {
      return NextResponse.json(
        { error: `Unauthorized: Workspace "${tenant.slug}" requires tenant-specific webhook HMAC signature` },
        { status: 401 }
      );
    }
    isValidSig = Boolean(signature && verifyHmacSignature(rawBody, signature, globalSecret));
  }

  if (!isValidSig) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing webhook HMAC signature' },
      { status: 401 }
    );
  }

  if (!tenant && supabaseAdmin && typeof supabaseAdmin.from === 'function') {
    return NextResponse.json({ error: `Tenant workspace "${tenantSlug}" not found` }, { status: 404 });
  }

  const tenantId = tenant?.id || '00000000-0000-0000-0000-000000000000';

  // 3. Extract Normalized Deployment Information
  const deploymentInfo = extractDeploymentInfo(body, req);

  // 4. Resolve Project(s) and Items
  const targetProjectSlug =
    req.headers.get('x-project-slug') ||
    body.project_slug ||
    body.project ||
    new URL(req.url).searchParams.get('project');

  let candidateProjects: any[] = [];
  if (supabaseAdmin && typeof supabaseAdmin.from === 'function') {
    try {
      let projQuery: any = supabaseAdmin
        .from('projects')
        .select('id, slug, name, settings')
        .eq('tenant_id', tenantId);

      if (typeof projQuery.is === 'function') {
        projQuery = projQuery.is('deleted_at', null);
      }

      if (targetProjectSlug) {
        projQuery = projQuery.eq('slug', targetProjectSlug);
      }

      const { data: projs } = await projQuery;
      candidateProjects = projs || [];
    } catch {
      // Non-blocking project fetch
    }
  }

  // 5. Query active work items in tenant or targeted project(s)
  let candidateItems: WorkItem[] = [];
  if (supabaseAdmin && typeof supabaseAdmin.from === 'function') {
    try {
      let itemsQuery: any = supabaseAdmin
        .from('work_items')
        .select('*')
        .eq('tenant_id', tenantId);

      if (typeof itemsQuery.is === 'function') {
        itemsQuery = itemsQuery.is('deleted_at', null);
      }

      if (targetProjectSlug && candidateProjects.length === 1) {
        itemsQuery = itemsQuery.eq('project_id', candidateProjects[0].id);
      }

      const { data: items } = await itemsQuery;
      candidateItems = items || [];
    } catch {
      // Non-blocking items query
    }
  }

  // Match items
  const matchedItems = candidateItems.filter((it) =>
    itemMatchesDeployment(it, deploymentInfo.commitSha, deploymentInfo.branch)
  );

  // 6. Group matched items by project and trigger automation event
  const updatedItems: WorkItem[] = [];
  const itemsByProject = new Map<string, WorkItem[]>();

  for (const item of matchedItems) {
    const list = itemsByProject.get(item.project_id) || [];
    list.push(item);
    itemsByProject.set(item.project_id, list);
  }

  const automationPayload = {
    deployment_url: deploymentInfo.deploymentUrl,
    deployment_status: deploymentInfo.deploymentStatus,
    environment: deploymentInfo.environment,
    branch: deploymentInfo.branch,
    commit_sha: deploymentInfo.commitSha,
    source: deploymentInfo.source,
    repository: deploymentInfo.repository,
    deployed_at: new Date().toISOString(),
  };

  for (const [projectId, projectItems] of itemsByProject.entries()) {
    const proj = candidateProjects.find((p) => p.id === projectId);
    const result = await triggerAutomationEvent({
      tenantId,
      projectId,
      settings: proj?.settings || null,
      event: 'deployment_completed',
      payload: automationPayload,
      matchedItems: projectItems,
      actorName: `CI/CD Webhook: ${deploymentInfo.source}`,
    });

    updatedItems.push(...result.updatedItems);
  }

  return NextResponse.json({
    success: true,
    event: 'deployment_completed',
    matched_count: matchedItems.length,
    matched_items: matchedItems,
    updated_items: updatedItems,
    deployment: deploymentInfo,
  });
}
