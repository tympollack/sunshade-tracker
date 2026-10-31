import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { verifyHmacSignature } from '@/lib/webhooks/verify-hmac';
import { sanitizeLogSecrets } from '@/lib/ci/failureReporter';
import { triggerAutomationEvent } from '@/lib/automation-engine';

export interface ExtractedObservabilityAlert {
  source: 'axiom' | 'betterstack' | 'sentry' | 'observability';
  service: string;
  errorSignature: string;
  title: string;
  description: string;
  logs: string;
  stackTrace: string;
  incidentId?: string;
  severity?: string;
  timestamp?: string;
}

/**
 * Normalizes multi-platform observability alert payloads (Axiom, Better Stack, Sentry, generic).
 */
export function extractObservabilityAlert(body: any, req?: NextRequest): ExtractedObservabilityAlert {
  const sentryHook = req?.headers?.get('sentry-hook-resource');
  const axiomSig = req?.headers?.get('x-axiom-signature');

  // 1. Sentry Webhook Payload
  if (sentryHook || body.action === 'triggered' || body.data?.issue || body.issue) {
    const issue = body.data?.issue || body.issue || {};
    const event = body.data?.event || body.event || {};
    const tags: [string, string][] = event.tags || [];
    const serviceTag = tags.find((t) => t[0] === 'service')?.[1];
    const service = serviceTag || issue.culprit || body.service || 'sentry-service';

    const errorSignature =
      issue.title ||
      issue.metadata?.value ||
      issue.metadata?.type ||
      event.logentry?.formatted ||
      'Sentry Error Anomaly';

    const title = body.title || `[Sentry Alert] ${service}: ${errorSignature}`;
    const rawLogs = event.logentry?.formatted || JSON.stringify(issue.metadata || {});

    let rawStack = '';
    const exceptions = event.exception?.values || [];
    if (exceptions.length > 0) {
      rawStack = exceptions
        .map((ex: any) => {
          const frames = ex.stacktrace?.frames || [];
          const frameStr = frames
            .map((f: any) => `    at ${f.function || 'anonymous'} (${f.filename || f.module}:${f.lineno || 0})`)
            .join('\n');
          return `${ex.type || 'Error'}: ${ex.value || ''}\n${frameStr}`;
        })
        .join('\n\n');
    }

    return {
      source: 'sentry',
      service,
      errorSignature,
      title,
      description: body.description || issue.metadata?.value || errorSignature,
      logs: sanitizeLogSecrets(rawLogs),
      stackTrace: sanitizeLogSecrets(rawStack),
      incidentId: issue.id || event.event_id,
      severity: issue.level || event.level || 'error',
      timestamp: event.timestamp ? new Date(event.timestamp * 1000).toISOString() : new Date().toISOString(),
    };
  }

  // 2. Axiom Alert Payload
  const isAxiom =
    Boolean(axiomSig) ||
    body.source === 'axiom' ||
    Boolean(body.query?.apl) ||
    Boolean(body.matches) ||
    Boolean(body.event?.apl);

  if (isAxiom) {
    const service =
      body.service ||
      body.service_name ||
      body.event?.service ||
      body.matches?.[0]?.service ||
      'axiom-monitored-service';

    const errorSignature =
      body.error_signature ||
      body.name ||
      body.title ||
      body.event?.error ||
      body.matches?.[0]?.message ||
      'Axiom Error Rate Spike';

    const title = body.title || body.name || `[Axiom Alert] ${service}: ${errorSignature}`;

    const rawLogs = body.logs
      ? (typeof body.logs === 'string' ? body.logs : JSON.stringify(body.logs))
      : (body.matches || []).map((m: any) => m.message || JSON.stringify(m)).join('\n') || (body.event ? JSON.stringify(body.event) : '');

    const rawStack =
      body.stack_trace ||
      body.stack ||
      body.matches?.[0]?.stack_trace ||
      body.matches?.[0]?.stack ||
      body.event?.stack ||
      '';

    return {
      source: 'axiom',
      service,
      errorSignature,
      title,
      description: body.description || `High error rate anomaly detected by Axiom monitor "${body.name || 'Error Rate'}"`,
      logs: sanitizeLogSecrets(rawLogs),
      stackTrace: sanitizeLogSecrets(rawStack),
      incidentId: body.id || body.alert_id,
      severity: body.severity || 'critical',
      timestamp: body.timestamp || new Date().toISOString(),
    };
  }

  // 3. Better Stack (Better Uptime / Logtail) Payload
  const isBetterStack =
    body.source === 'betterstack' ||
    body.source === 'better_stack' ||
    Boolean(body.incident_id) ||
    Boolean(body.incident?.id);

  if (isBetterStack) {
    const incident = body.incident || body;
    const service =
      body.service ||
      body.service_name ||
      incident.service ||
      incident.component_name ||
      'betterstack-service';

    const errorSignature =
      body.error_signature ||
      incident.summary ||
      incident.name ||
      `Incident #${incident.incident_id || incident.id || 'N/A'}`;

    const title = body.title || `[Better Stack Alert] ${service}: ${errorSignature}`;

    let rawLogs = '';
    if (body.logs) {
      if (Array.isArray(body.logs)) {
        rawLogs = body.logs
          .map((l: any) => (typeof l === 'string' ? l : `${l.level || 'ERROR'}: ${l.message || l.text || JSON.stringify(l)}`))
          .join('\n');
      } else {
        rawLogs = String(body.logs);
      }
    } else if (incident.cause) {
      rawLogs = String(incident.cause);
    }

    const rawStack = body.stack_trace || body.stack || incident.stack_trace || '';

    return {
      source: 'betterstack',
      service,
      errorSignature,
      title,
      description: body.description || incident.summary || incident.description || 'Production outage / error spike reported by Better Stack.',
      logs: sanitizeLogSecrets(rawLogs),
      stackTrace: sanitizeLogSecrets(rawStack),
      incidentId: incident.incident_id || incident.id,
      severity: incident.severity || 'critical',
      timestamp: incident.started_at || body.timestamp || new Date().toISOString(),
    };
  }

  // 4. Generic Observability Ingestion Fallback
  const service = body.service || body.service_name || body.app || 'observability-service';
  const errorSignature = body.error_signature || body.error || body.title || 'Production Error Anomaly';
  const title = body.title || `[Observability Alert] ${service}: ${errorSignature}`;
  const rawLogs = typeof body.logs === 'string' ? body.logs : JSON.stringify(body.logs || '');
  const rawStack = body.stack_trace || body.stack || '';

  return {
    source: (body.source as any) || 'observability',
    service,
    errorSignature,
    title,
    description: body.description || body.summary || 'Production error anomaly detected by observability monitors.',
    logs: sanitizeLogSecrets(rawLogs),
    stackTrace: sanitizeLogSecrets(rawStack),
    incidentId: body.incident_id || body.id,
    severity: body.severity || 'critical',
    timestamp: body.timestamp || new Date().toISOString(),
  };
}

/**
 * Builds standard Markdown incident report body with remediation instructions.
 */
function buildIncidentDescription(alert: ExtractedObservabilityAlert): string {
  const stackSection = alert.stackTrace
    ? `#### Stack Trace
\`\`\`
${alert.stackTrace}
\`\`\`
`
    : '';

  const logSection = alert.logs
    ? `#### Recent Log Context
\`\`\`
${alert.logs}
\`\`\`
`
    : '';

  return `### Observability Incident Report: ${alert.service}
> **Source:** \`${alert.source.toUpperCase()}\`  
> **Error Signature:** \`${alert.errorSignature}\`  
> **Service:** \`${alert.service}\`  
> **Reported At:** \`${alert.timestamp || new Date().toISOString()}\`  

#### Incident Summary
${alert.description}

${stackSection}${logSection}
### Autonomous Remediation Instructions
\`\`\`markdown
### SYSTEM ROLE & OBJECTIVE
You are an Autonomous Site Reliability & Remediation Engineer.
Investigate and repair the production anomaly reported by ${alert.source.toUpperCase()} for service "${alert.service}".

### REMEDIATION INSTRUCTIONS
1. Analyze the stack trace and recent logs in this incident description.
2. Locate the originating code path and identify the failure root cause.
3. Formulate a minimal bugfix that restores stability without introducing regressions.
4. Verify with \`npx tsc --noEmit\` and \`npm test\`.
5. Transition this defect to \`in_review\` upon opening the remediation pull request.
\`\`\`
`;
}

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
        .select('id, slug, name, metadata')
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
