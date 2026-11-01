import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { verifyHmacSignature } from '@/lib/webhooks/verify-hmac';
import { executeProjectAutomations } from '@/lib/automation-engine';

/**
 * POST /api/v1/webhooks/ci-runner
 *
 * Ingests external CI test/build failure webhooks, verifies HMAC signature or Bearer token,
 * resolves target project by project_slug, and emits non-blocking automation events via queueMicrotask
 * to auto-stage critical bug remediation tasks in tracker.work_items.
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
      // Fallback to default
    }
  }

  const tenantId = tenant?.id || '00000000-0000-0000-0000-000000000000';

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

  if (bearerToken) {
    if (tenantSecret && bearerToken === tenantSecret) {
      isAuthorized = true;
    } else if (globalSecret && bearerToken === globalSecret) {
      isAuthorized = true;
    }
  } else if (signature) {
    if (tenantSecret && verifyHmacSignature(rawBody, signature, tenantSecret)) {
      isAuthorized = true;
    } else if (globalSecret && verifyHmacSignature(rawBody, signature, globalSecret)) {
      isAuthorized = true;
    }
  }

  if (!isAuthorized) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid authorization credentials' },
      { status: 401 }
    );
  }

  // 3. Resolve Target Project by project_slug
  let project: any = null;
  if (supabaseAdmin && typeof supabaseAdmin.from === 'function') {
    try {
      let projQuery: any = supabaseAdmin
        .from('projects')
        .select('id, slug, name, settings, tenant_id')
        .eq('slug', project_slug);

      if (tenantId && tenantId !== '00000000-0000-0000-0000-000000000000') {
        projQuery = projQuery.eq('tenant_id', tenantId);
      }

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

  // 4. Non-blocking automation event emission via queueMicrotask (< 100ms response)
  const payload = {
    project_slug,
    branch,
    commit_sha,
    failed_step,
    error_log,
    actor,
    run_id,
    source: 'ci_runner',
    event_type: 'build_failed',
    ...body,
  };

  queueMicrotask(() => {
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
  });

  return NextResponse.json({ success: true, queued: true }, { status: 200 });
}
