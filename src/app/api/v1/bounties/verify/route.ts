import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { extractTaskRefId } from '@/lib/bounties/extractRef';

/**
 * POST /api/v1/bounties/verify
 *
 * Automated GitHub PR verification webhook for open-source contributors and agent runners.
 * Listens for GitHub PR events, parses work item reference from the PR title/body/branch,
 * transitions item status to 'in_review' when opened, and transitions to 'complete' upon merge.
 */
export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }

  const { action, pull_request } = body;

  if (!pull_request) {
    return NextResponse.json({ error: 'Missing pull_request object in webhook payload' }, { status: 400 });
  }

  const prTitle = pull_request.title || '';
  const prBody = pull_request.body || '';
  const prBranch = pull_request.head?.ref || '';
  const prUrl = pull_request.html_url || '';
  const commitHash = pull_request.head?.sha || '';
  const isMerged = Boolean(pull_request.merged);

  // 1. Extract external_ref_id
  const targetRefId = extractTaskRefId([prTitle, prBody, prBranch]);

  if (!targetRefId) {
    return NextResponse.json({
      success: true,
      action: 'ignored',
      message: 'No matching work item reference ID found in PR title, body, or head branch.',
    });
  }

  // 2. Extract scoping parameters (tenant, project, repository) to prevent cross-workspace PR collisions
  const searchParams = req.nextUrl.searchParams;
  const tenantSlug =
    searchParams.get('tenant') ||
    searchParams.get('tenant_slug') ||
    req.headers.get('x-tenant-slug') ||
    body.tenant_slug;

  const tenantId =
    searchParams.get('tenant_id') ||
    req.headers.get('x-tenant-id') ||
    body.tenant_id;

  const projectSlug =
    searchParams.get('project') ||
    searchParams.get('project_slug') ||
    req.headers.get('x-project-slug') ||
    body.project_slug;

  const projectId =
    searchParams.get('project_id') ||
    req.headers.get('x-project-id') ||
    body.project_id;

  let scopedTenantId = tenantId;
  let scopedTenant: any = null;

  if (tenantSlug && !scopedTenantId) {
    const tAdmin = supabaseAdmin.from('tenants');
    if (tAdmin && typeof tAdmin.select === 'function') {
      let tQuery: any = tAdmin
        .select('id, slug, tier, metadata')
        .eq('slug', tenantSlug);
      if (typeof tQuery.is === 'function') {
        tQuery = tQuery.is('deleted_at', null);
      }
      if (typeof tQuery.maybeSingle === 'function') {
        const { data: tenantData } = await tQuery.maybeSingle();
        if (tenantData) {
          scopedTenantId = tenantData.id;
          scopedTenant = tenantData;
        } else {
          return NextResponse.json(
            { success: false, error: `Tenant "${tenantSlug}" not found.` },
            { status: 404 }
          );
        }
      }
    }
  }

  let scopedProjectId = projectId;
  if (projectSlug && !scopedProjectId) {
    const pAdmin = supabaseAdmin.from('projects');
    if (pAdmin && typeof pAdmin.select === 'function') {
      let pQuery: any = pAdmin
        .select('id, slug, tenant_id')
        .eq('slug', projectSlug);
      if (scopedTenantId && typeof pQuery.eq === 'function') {
        pQuery = pQuery.eq('tenant_id', scopedTenantId);
      }
      if (typeof pQuery.is === 'function') {
        pQuery = pQuery.is('deleted_at', null);
      }
      if (typeof pQuery.maybeSingle === 'function') {
        const { data: projData } = await pQuery.maybeSingle();
        if (projData) {
          scopedProjectId = projData.id;
          if (!scopedTenantId) scopedTenantId = projData.tenant_id;
        }
      }
    }
  }

  // 3. Query work item scoped by external_ref_id and tenant/project if provided
  let itemQuery: any = supabaseAdmin
    .from('work_items')
    .select('*')
    .eq('external_ref_id', targetRefId);

  if (scopedTenantId && typeof itemQuery.eq === 'function') {
    itemQuery = itemQuery.eq('tenant_id', scopedTenantId);
  }
  if (scopedProjectId && typeof itemQuery.eq === 'function') {
    itemQuery = itemQuery.eq('project_id', scopedProjectId);
  }

  if (typeof itemQuery.is === 'function') {
    itemQuery = itemQuery.is('deleted_at', null);
  }

  const { data: item, error: itemErr } = await itemQuery.maybeSingle();

  if (itemErr) {
    return NextResponse.json({
      success: false,
      error: `Error querying work item: ${itemErr.message}. If this reference exists in multiple workspaces, specify tenant or repository scope.`,
    }, { status: 400 });
  }

  if (!item) {
    return NextResponse.json({
      success: false,
      message: `Work item "${targetRefId}" not found in tracker database${scopedTenantId ? ' for the specified workspace' : ''}.`,
    }, { status: 404 });
  }

  // 4. Security Check: Only active bounty items can be verified via this endpoint
  const existingMetadata = (item.metadata || {}) as Record<string, any>;
  if (existingMetadata.bounty_active !== true) {
    return NextResponse.json({
      success: false,
      error: `Work item "${targetRefId}" is not designated as an active bounty.`,
    }, { status: 403 });
  }

  // Verify repository match if item defines a target github_repo
  const targetRepo = pull_request.base?.repo?.full_name || body.repository?.full_name;
  if (targetRepo && existingMetadata.github_repo) {
    const expectedRepo = String(existingMetadata.github_repo).toLowerCase();
    const actualRepo = String(targetRepo).toLowerCase();
    if (!expectedRepo.endsWith(actualRepo) && !actualRepo.endsWith(expectedRepo)) {
      return NextResponse.json({
        success: false,
        error: `PR repository "${targetRepo}" does not match work item repository "${existingMetadata.github_repo}".`,
      }, { status: 403 });
    }
  }

  // Verify workspace allows public bounties if tenant is loaded
  if (!scopedTenant && item.tenant_id) {
    const tAdmin = supabaseAdmin.from('tenants');
    if (tAdmin && typeof tAdmin.select === 'function') {
      let tQuery: any = tAdmin
        .select('id, slug, tier, metadata')
        .eq('id', item.tenant_id);
      if (typeof tQuery.is === 'function') {
        tQuery = tQuery.is('deleted_at', null);
      }
      if (typeof tQuery.maybeSingle === 'function') {
        const { data: tData } = await tQuery.maybeSingle();
        if (tData) scopedTenant = tData;
      }
    }
  }

  if (scopedTenant) {
    const isPublicWorkspace =
      scopedTenant.slug === 'sunshade' ||
      scopedTenant.tier === 'demo' ||
      Boolean(scopedTenant.metadata?.is_public) ||
      Boolean(scopedTenant.metadata?.public_bounties);

    if (!isPublicWorkspace) {
      return NextResponse.json({
        success: false,
        error: `Workspace "${scopedTenant.slug}" is private and does not allow public bounty verification.`,
      }, { status: 403 });
    }
  }

  // 5. Determine status transition
  const updatedMetadata: Record<string, any> = { ...existingMetadata };

  if (prUrl) {
    updatedMetadata.pr_url = prUrl;
    const prs = Array.isArray(existingMetadata.pr_urls) ? [...existingMetadata.pr_urls] : [];
    if (!prs.includes(prUrl)) prs.push(prUrl);
    updatedMetadata.pr_urls = prs;
  }

  if (commitHash) {
    updatedMetadata.commit_hash = commitHash;
    const hashes = Array.isArray(existingMetadata.commit_hashes) ? [...existingMetadata.commit_hashes] : [];
    if (!hashes.includes(commitHash)) hashes.push(commitHash);
    updatedMetadata.commit_hashes = hashes;
  }

  let newStatus = item.status;

  if (action === 'closed' && isMerged) {
    newStatus = 'complete';
    updatedMetadata.bounty_status = 'reward_eligible';
    updatedMetadata.merged_at = pull_request.merged_at || new Date().toISOString();
  } else if (action === 'opened' || action === 'reopened' || action === 'synchronize') {
    if (item.status === 'not_started' || item.status === 'in_progress') {
      newStatus = 'in_review';
    }
  }

  // 4. Update work item in database
  const { data: updatedItem, error: updateErr } = await supabaseAdmin
    .from('work_items')
    .update({
      status: newStatus,
      metadata: updatedMetadata,
      updated_at: new Date().toISOString(),
    })
    .eq('id', item.id)
    .select()
    .single();

  if (updateErr) {
    return NextResponse.json({ error: updateErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    action: isMerged ? 'completed' : 'updated',
    status: newStatus,
    external_ref_id: targetRefId,
    item: updatedItem || { ...item, status: newStatus, metadata: updatedMetadata },
  });
}
