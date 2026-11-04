import { NextRequest, NextResponse, after } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { verifyHmacSignature } from '@/lib/webhooks/verify-hmac';
import { executeProjectAutomations } from '@/lib/automation-engine';

/**
 * POST /api/v1/webhooks/ci-runner
 *
 * Ingests external CI test/build failure webhooks, verifies HMAC signature or Bearer token,
 * resolves target project by project_slug within the authenticated tenant boundary,
 * and emits non-blocking automation events via Next.js after() to auto-stage critical
 * bug remediation tasks in tracker.work_items.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // 1. Authorization Verification
  const authHeader = req.headers.get('authorization') || req.headers.get('Authorization');
  const signature =
    req.headers.get('x-hub-signature-256') ||
    req.headers.get('x-sunshade-signature') ||
    req.headers.get('x-signature');

  let bearerToken: string | null = null;
  if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
    bearerToken = authHeader.slice(7).trim();
  }

  if (!bearerToken && !signature) {
    return NextResponse.json(
      { error: 'Unauthorized: Missing authorization credentials (Bearer token or X-Hub-Signature-256 required)' },
      { status: 401 }
    );
  }

  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }

  const {
    project_slug,
    branch,
    commit_sha,
    failed_step,
    error_log,
    actor,
    run_id,
  } = body || {};

  if (!project_slug || typeof project_slug !== 'string') {
    return NextResponse.json({ error: 'Missing required field: project_slug' }, { status: 400 });
  }

  // 2. Tenant Resolution & Strict Workspace Scoping
  const requestedTenantSlug =
    req.headers.get('x-tenant-slug') ||
    body.tenant_slug ||
    body.tenant ||
    new URL(req.url).searchParams.get('tenant');
  const defaultTenantSlug = process.env.TRACKER_TENANT || 'pym-energy';
  const tenantSlug = requestedTenantSlug || defaultTenantSlug;
  const isDefaultTenant = !requestedTenantSlug || requestedTenantSlug === defaultTenantSlug;

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
      tenant = null;
    }
  }

  const globalSecret =
    process.env.WEBHOOK_SIGNING_SECRET ||
    process.env.CI_RUNNER_WEBHOOK_SECRET ||
    process.env.SUNSHADE_ECOSYSTEM_WEBHOOK_SECRET ||
    process.env.SUNSHADE_WEBHOOK_SECRET ||
    '';

  const tenantSecret =
    tenant?.metadata?.ci_webhook_secret ||
    tenant?.metadata?.webhook_signing_secret;

  let isAuthorized = false;

  if (tenantSecret) {
    // If the workspace has a dedicated secret configured, it MUST match the workspace's secret.
    // Platform/global secret is rejected to prevent cross-workspace unauthorized access.
    if (bearerToken && bearerToken === tenantSecret) {
      isAuthorized = true;
    } else if (signature && verifyHmacSignature(rawBody, signature, tenantSecret)) {
      isAuthorized = true;
    }
  } else if (globalSecret && isDefaultTenant) {
    // Platform/global secret is only permitted for the platform default workspace when no dedicated secret is configured.
    // Callers cannot use the global secret to unlock arbitrary workspaces via x-tenant-slug.
    if (bearerToken && bearerToken === globalSecret) {
      isAuthorized = true;
    } else if (signature && verifyHmacSignature(rawBody, signature, globalSecret)) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid authorization credentials' },
      { status: 401 }
    );
  }

  if (!tenant) {
    return NextResponse.json(
      { error: `Tenant '${tenantSlug}' not found` },
      { status: 404 }
    );
  }

  const tenantId = tenant.id;

  // 3. Resolve Target Project by project_slug strictly within tenant boundary
  let project: any = null;
  if (supabaseAdmin && typeof supabaseAdmin.from === 'function') {
    try {
      let projQuery: any = supabaseAdmin
        .from('projects')
        .select('id, slug, name, settings, tenant_id')
        .eq('slug', project_slug)
        .eq('tenant_id', tenantId);

      if (typeof projQuery.is === 'function') {
        projQuery = projQuery.is('deleted_at', null);
      }

      const { data: projs } = await projQuery;
      if (Array.isArray(projs) && projs.length > 0) {
        project = projs.find((p: any) => p.slug === project_slug) || projs[0];
      }
    } catch (err: any) {
      return NextResponse.json({ error: `Database error querying projects: ${err.message}` }, { status: 500 });
    }
  }

  if (!project) {
    return NextResponse.json(
      { error: `Project '${project_slug}' not found` },
      { status: 404 }
    );
  }

  // 4. Secure Payload Construction (body spread cannot override system source/event_type)
  const payload = {
    ...body,
    project_slug,
    branch,
    commit_sha,
    failed_step,
    error_log,
    actor,
    run_id,
    source: 'ci_runner',
    event_type: 'build_failed',
  };

  // 5. Non-blocking automation event emission using Next.js after() to prevent premature termination
  const runAutomations = () => {
    executeProjectAutomations({
      tenantId: project.tenant_id || tenantId,
      projectId: project.id,
      settings: project.settings || {},
      eventType: 'webhook_received',
      event: 'webhook_received',
      source: 'ci_runner',
      event_type: 'build_failed',
      eventPayload: payload,
      payload,
    }).catch((err) => {
      console.error('[ci-runner-webhook] Automation execution failed:', err);
    });
  };

  try {
    if (typeof after === 'function') {
      after(runAutomations);
    } else {
      queueMicrotask(runAutomations);
    }
  } catch {
    queueMicrotask(runAutomations);
  }

  return NextResponse.json({ success: true, queued: true }, { status: 200 });
}
