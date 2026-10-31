import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { verifyHmacSignature } from '@/lib/webhooks/verify-hmac';
import { triggerAutomationEvent } from '@/lib/automation-engine';
import { extractDeploymentInfo, itemMatchesDeployment, projectMatchesRepository } from '@/lib/webhooks/deployments';
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

      const { data: tData, error: tErr } = await tenantQuery.maybeSingle();
      if (tErr) {
        return NextResponse.json({ error: `Database error resolving tenant: ${tErr.message}` }, { status: 500 });
      }
      tenant = tData;
    } catch (err: any) {
      return NextResponse.json({ error: `Failed to resolve tenant: ${err.message}` }, { status: 500 });
    }
  }

  if (!tenant && supabaseAdmin && typeof supabaseAdmin.from === 'function') {
    return NextResponse.json({ error: `Tenant workspace "${tenantSlug}" not found` }, { status: 404 });
  }

  const tenantId = tenant?.id || '00000000-0000-0000-0000-000000000000';

  // Security Check: Tenant & Global HMAC Secrets
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
  } else if (process.env.NODE_ENV === 'production' && !process.env.ALLOW_UNSIGNED_WEBHOOKS) {
    // Production safety: reject unsigned webhooks when no secret is configured
    return NextResponse.json(
      { error: 'Unauthorized: Deployment webhooks require a secret configured on the workspace or platform' },
      { status: 401 }
    );
  } else if (signature) {
    // Signature header provided but secret was missing
    isValidSig = false;
  }

  if (!isValidSig) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing webhook HMAC signature' },
      { status: 401 }
    );
  }

  // 3. Extract Normalized Deployment Information
  const deploymentInfo = extractDeploymentInfo(body, req);

  // 4. Resolve Target Project(s)
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

      const { data: projs, error: pErr } = await projQuery;
      if (pErr) {
        return NextResponse.json({ error: `Database error resolving projects: ${pErr.message}` }, { status: 500 });
      }
      candidateProjects = projs || [];
    } catch (err: any) {
      return NextResponse.json({ error: `Failed to query projects: ${err.message}` }, { status: 500 });
    }
  }

  // Defend against Issue #1 (BUG_0001): If project slug was explicitly provided but not found, reject with 404
  if (targetProjectSlug && candidateProjects.length === 0) {
    return NextResponse.json(
      { error: `Target project "${targetProjectSlug}" not found in workspace "${tenantSlug}"` },
      { status: 404 }
    );
  }

  // Defend against Issue #7 (ANALYSIS_0002): Filter candidate projects by repository if multiple projects exist
  if (deploymentInfo.repository && candidateProjects.length > 1) {
    const repoMatched = candidateProjects.filter((p) => projectMatchesRepository(p, deploymentInfo.repository));
    if (repoMatched.length > 0) {
      candidateProjects = repoMatched;
    }
  }

  // 5. Query active work items constrained strictly to candidate projects
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

      if (candidateProjects.length > 0) {
        const allowedProjectIds = candidateProjects.map((p) => p.id);
        if (allowedProjectIds.length === 1) {
          itemsQuery = itemsQuery.eq('project_id', allowedProjectIds[0]);
        } else {
          itemsQuery = itemsQuery.in('project_id', allowedProjectIds);
        }
      }

      const { data: items, error: iErr } = await itemsQuery;
      if (iErr) {
        return NextResponse.json({ error: `Database error fetching work items: ${iErr.message}` }, { status: 500 });
      }
      candidateItems = items || [];
    } catch (err: any) {
      return NextResponse.json({ error: `Failed to fetch work items: ${err.message}` }, { status: 500 });
    }
  }

  // Match items using strict token boundary rules
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
