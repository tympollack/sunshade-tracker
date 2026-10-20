import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { verifyHmacSignature } from '@/lib/webhooks/verify-hmac';

function mapPatchworkSeverityToPriority(severity?: string): 'Critical' | 'High' | 'Medium' | 'Low' {
  const s = String(severity || '').toLowerCase();
  if (s === 'critical' || s === 'severe' || s === 'urgent') return 'Critical';
  if (s === 'high' || s === 'major') return 'High';
  if (s === 'medium' || s === 'moderate') return 'Medium';
  return 'Low';
}

function mapValerieControversyToPriority(
  controversyScore?: number,
  severity?: string
): 'Critical' | 'High' | 'Medium' | 'Low' {
  const s = String(severity || '').toLowerCase();
  if (s === 'critical' || (controversyScore !== undefined && controversyScore >= 0.8)) return 'Critical';
  if (s === 'high' || (controversyScore !== undefined && controversyScore >= 0.6)) return 'High';
  if (s === 'medium' || (controversyScore !== undefined && controversyScore >= 0.4)) return 'Medium';
  return 'Low';
}

/**
 * POST /api/v1/webhooks/ecosystem
 *
 * Cross-Utility Webhook Dispatcher for Ecosystem Apps.
 * Receives signed events from PatchWork (field infrastructure hazard reports)
 * and Project Valerie (voter controversy flags), normalizes payloads into deterministic
 * external_ref_ids, and persists them into tracker.work_items idempotently.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature =
    req.headers.get('x-sunshade-signature') ||
    req.headers.get('x-hub-signature-256') ||
    req.headers.get('x-signature');

  if (!signature) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing webhook HMAC signature' },
      { status: 401 }
    );
  }

  // 1. Parse Body
  let body: any;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
  }

  const source = String(body.source || '').toLowerCase();
  if (source !== 'patchwork' && source !== 'valerie') {
    return NextResponse.json(
      { error: 'Unsupported ecosystem source. Supported sources: "patchwork", "valerie"' },
      { status: 400 }
    );
  }

  // 2. Resolve Tenant
  const tenantSlug =
    req.headers.get('x-tenant-slug') ||
    body.tenant_slug ||
    process.env.TRACKER_TENANT ||
    'pym-energy';

  let tenant: any = null;
  if (supabaseAdmin && typeof supabaseAdmin.from === 'function') {
    let tenantQuery: any = supabaseAdmin.from('tenants');
    if (tenantQuery && typeof tenantQuery.select === 'function') {
      tenantQuery = tenantQuery
        .select('id, slug, name, tier, metadata')
        .eq('slug', tenantSlug);

      if (typeof tenantQuery.is === 'function') {
        tenantQuery = tenantQuery.is('deleted_at', null);
      }

      if (typeof tenantQuery.maybeSingle === 'function') {
        const { data: tData } = await tenantQuery.maybeSingle();
        tenant = tData;
      }
    }
  }

  // 3. Security & Signature Verification
  const globalSecret =
    process.env.SUNSHADE_ECOSYSTEM_WEBHOOK_SECRET ||
    process.env.SUNSHADE_WEBHOOK_SECRET ||
    '';
  const tenantSecret = tenant?.metadata?.ecosystem_webhook_secret;

  let isValidSig = false;
  if (tenantSecret && verifyHmacSignature(rawBody, signature, tenantSecret)) {
    isValidSig = true;
  } else if (globalSecret && verifyHmacSignature(rawBody, signature, globalSecret)) {
    isValidSig = true;
  }

  if (!isValidSig) {
    return NextResponse.json(
      { error: 'Unauthorized: Invalid or missing webhook HMAC signature' },
      { status: 401 }
    );
  }

  if (!tenant) {
    return NextResponse.json({ error: `Tenant workspace "${tenantSlug}" not found` }, { status: 404 });
  }

  // Verify that the destination tenant has ecosystem webhooks enabled
  const isEcosystemAllowed =
    tenant.slug === 'pym-energy' ||
    tenant.slug === 'sunshade' ||
    tenant.tier === 'demo' ||
    Boolean(tenant.metadata?.ecosystem_enabled);

  if (!isEcosystemAllowed) {
    return NextResponse.json(
      { error: `Workspace "${tenant.slug}" is not authorized to ingest cross-utility ecosystem events.` },
      { status: 403 }
    );
  }

  // 4. Normalize external payload & generate deterministic external_ref_id
  let targetProjectSlug = '';
  let externalRefId = '';
  let itemTitle = '';
  let itemDescription = '';
  let priority: 'Critical' | 'High' | 'Medium' | 'Low' = 'Medium';
  let metadata: Record<string, any> = {};

  if (source === 'patchwork') {
    targetProjectSlug = 'patchwork';
    const incidentId = body.incident_id || body.hazard_id || body.id;
    if (!incidentId) {
      return NextResponse.json({ error: 'Missing required "incident_id" in PatchWork payload' }, { status: 400 });
    }

    externalRefId = `EVT-PW-${incidentId}`;
    itemTitle = body.title || `Citizen Infrastructure Hazard Report #${incidentId}`;
    priority = mapPatchworkSeverityToPriority(body.severity);

    itemDescription = `### PatchWork Citizen Incident Report
> **Incident ID:** \`${incidentId}\`  
> **Severity:** \`${body.severity || 'normal'}\`  
> **Location:** ${body.location ? JSON.stringify(body.location) : 'Unspecified'}

${body.description || body.details || 'Citizen reported field infrastructure hazard.'}
`;

    metadata = {
      ecosystem_source: 'patchwork',
      incident_id: incidentId,
      severity: body.severity,
      location: body.location,
      priority,
      reported_at: body.timestamp || new Date().toISOString(),
      agent_prompt: `### SYSTEM ROLE & OBJECTIVE\nYou are a Field Engineering & Municipal Safety Specialist.\nResolve infrastructure incident #${incidentId}: ${itemTitle}.`,
    };
  } else if (source === 'valerie') {
    targetProjectSlug = 'valerie';
    const pollId = body.poll_id || body.topic_id || body.id;
    if (!pollId) {
      return NextResponse.json({ error: 'Missing required "poll_id" in Project Valerie payload' }, { status: 400 });
    }

    externalRefId = `EVT-VAL-${pollId}`;
    itemTitle = body.title || body.topic || `Controversial Poll Topic Investigation #${pollId}`;
    priority = mapValerieControversyToPriority(body.controversy_score, body.severity);

    itemDescription = `### Project Valerie Voter Controversy Flag
> **Poll ID:** \`${pollId}\`  
> **Controversy Score:** \`${body.controversy_score !== undefined ? body.controversy_score : 'N/A'}\`  
> **Polarization Level:** \`${body.polarization_level || 'Moderate'}\`

${body.description || body.summary || 'Voter research backlog item generated from polarized community feedback.'}
`;

    metadata = {
      ecosystem_source: 'valerie',
      poll_id: pollId,
      controversy_score: body.controversy_score,
      polarization_level: body.polarization_level,
      priority,
      flagged_at: body.timestamp || new Date().toISOString(),
      agent_prompt: `### SYSTEM ROLE & OBJECTIVE\nYou are a Neutral Policy & Voter Research Specialist.\nInvestigate controversy around poll topic #${pollId}: ${itemTitle}.`,
    };
  }

  // 5. Strictly resolve target project for the ecosystem source
  let projectQuery: any = supabaseAdmin
    .from('projects')
    .select('id, slug, name')
    .eq('tenant_id', tenant.id)
    .eq('slug', targetProjectSlug);

  if (typeof projectQuery.is === 'function') {
    projectQuery = projectQuery.is('deleted_at', null);
  }

  const { data: project } = await projectQuery.maybeSingle();

  if (!project) {
    return NextResponse.json(
      { error: `Target project "${targetProjectSlug}" not found in tenant "${tenant.slug}". Ecosystem events must not be routed to unrelated projects.` },
      { status: 404 }
    );
  }

  // 6. Idempotent Upsert into tracker.work_items
  let existingItemQuery: any = supabaseAdmin
    .from('work_items')
    .select('*')
    .eq('tenant_id', tenant.id)
    .eq('external_ref_id', externalRefId);

  if (typeof existingItemQuery.is === 'function') {
    existingItemQuery = existingItemQuery.is('deleted_at', null);
  }

  const { data: existingItem } = await existingItemQuery.maybeSingle();

  if (existingItem) {
    // Update existing item idempotently
    const { data: updatedItem, error: updateErr } = await supabaseAdmin
      .from('work_items')
      .update({
        title: itemTitle,
        description: itemDescription,
        metadata: {
          ...existingItem.metadata,
          ...metadata,
          priority,
          last_webhook_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingItem.id)
      .select()
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      action: 'updated',
      item: updatedItem || existingItem,
      external_ref_id: externalRefId,
    });
  }

  // Insert new item
  const newItemPayload = {
    tenant_id: tenant.id,
    project_id: project.id,
    external_ref_id: externalRefId,
    item_type: 'task',
    status: 'not_started',
    title: itemTitle,
    description: itemDescription,
    order_index: 1000.0,
    metadata: {
      ...metadata,
      priority,
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { data: createdItem, error: insertErr } = await supabaseAdmin
    .from('work_items')
    .insert(newItemPayload)
    .select()
    .single();

  if (insertErr) {
    return NextResponse.json({ error: insertErr.message }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    action: 'created',
    item: createdItem || newItemPayload,
    external_ref_id: externalRefId,
  });
}
