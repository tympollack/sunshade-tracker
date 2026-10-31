import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { verifyHmacSignature } from '@/lib/webhooks/verify-hmac';
import { triggerAutomationEvent } from '@/lib/automation-engine';
import { extractObservabilityAlert, buildIncidentDescription } from '@/lib/webhooks/observability';

/**
 * POST /api/v1/webhooks/observability
 *
 * Ingests production observability alerts (Axiom, Better Stack, Sentry, generic),
 * fires the 'observability_alert' automation event, and automatically spawns/updates
 * Critical triage defect cards linked to the active sprint under the triage epic.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();

  // 1. Signature Verification
  const signature =
    req.headers.get('x-sunshade-signature') ||
    req.headers.get('x-hub-signature-256') ||
    req.headers.get('x-axiom-signature') ||
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
    process.env.OBSERVABILITY_WEBHOOK_SECRET ||
    process.env.SUNSHADE_ECOSYSTEM_WEBHOOK_SECRET ||
    process.env.SUNSHADE_WEBHOOK_SECRET ||
    '';
  const tenantSecret = tenant?.metadata?.observability_webhook_secret;

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

  // 3. Extract Normalized Alert Information
  const alertInfo = extractObservabilityAlert(body, req);

  // 4. Resolve Target Project
  const targetProjectSlug =
    req.headers.get('x-project-slug') ||
    body.project_slug ||
    body.project ||
    new URL(req.url).searchParams.get('project');

  let project: any = null;
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
      if (projs && projs.length > 0) {
        project =
          projs.find((p: any) => p.slug === targetProjectSlug) ||
          projs.find((p: any) => p.slug === alertInfo.service) ||
          projs[0];
      }
    } catch {
      // Non-blocking query failure
    }
  }

  const projectId = project?.id || '00000000-0000-0000-0000-000000000001';

  // 5. Synthesize Ref ID & Incident Payload
  const rawId = alertInfo.incidentId || alertInfo.errorSignature || 'alert';
  const cleanId = String(rawId).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24);
  const externalRefId = `BUG-${alertInfo.source.toUpperCase()}-${cleanId}`;
  const fullDescription = buildIncidentDescription(alertInfo);

  const automationPayload = {
    source: alertInfo.source,
    service: alertInfo.service,
    service_name: alertInfo.service,
    error_signature: alertInfo.errorSignature,
    title: alertInfo.title,
    description: fullDescription,
    priority: 'Critical',
    severity: 'Critical',
    external_ref_id: externalRefId,
    reported_at: alertInfo.timestamp || new Date().toISOString(),
    logs: alertInfo.logs,
    stack_trace: alertInfo.stackTrace,
    metadata: {
      observability_source: alertInfo.source,
      service_name: alertInfo.service,
      error_signature: alertInfo.errorSignature,
      incident_id: alertInfo.incidentId,
      reported_at: alertInfo.timestamp || new Date().toISOString(),
      priority: 'Critical',
      severity: 'Critical',
      agent_prompt: `### SYSTEM ROLE & OBJECTIVE\nYou are an Incident Management Specialist. Remediate production defect ${externalRefId}: ${alertInfo.title}.`,
    },
  };

  // 6. Trigger Automation Event
  const result = await triggerAutomationEvent({
    tenantId,
    projectId,
    settings: project?.settings || null,
    event: 'observability_alert',
    payload: automationPayload,
    actorName: `Observability Webhook: ${alertInfo.source}`,
  });

  const createdItem = result.createdItems[0] || null;
  const updatedItem = result.updatedItems[0] || null;
  const activeItem = createdItem || updatedItem;

  return NextResponse.json({
    success: true,
    event: 'observability_alert',
    action: createdItem ? 'created' : updatedItem ? 'updated' : 'processed',
    item: activeItem,
    external_ref_id: externalRefId,
    alert: alertInfo,
  });
}
