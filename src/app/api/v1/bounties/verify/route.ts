import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';

const STANDARD_PREFIX_PATTERN = /\b((?:TASK|BUG|STORY|EPIC|FEAT|EVT|SUBTASK|PRD|RFC|TRK|PW|VAL)-[A-Za-z0-9_-]+)\b/i;
const BRACKETED_REF_PATTERN = /\[([A-Za-z0-9_]+-[A-Za-z0-9_]+(?:-[A-Za-z0-9_]+)*)\]/i;
const GENERAL_REF_PATTERN = /\b([A-Z]{2,8}-\d+(?:-[A-Za-z0-9_]+)*)\b/i;

export function extractTaskRefId(texts: Array<string | null | undefined>): string | null {
  for (const text of texts) {
    if (!text) continue;

    // 1. Bracketed ref: [TASK-101]
    const bracketMatch = text.match(BRACKETED_REF_PATTERN);
    if (bracketMatch && !/^patch-\d+$/i.test(bracketMatch[1])) {
      return bracketMatch[1].toUpperCase();
    }

    // 2. Known ecosystem prefix: TASK-*, BUG-*, STORY-*, etc.
    const standardMatch = text.match(STANDARD_PREFIX_PATTERN);
    if (standardMatch) {
      return standardMatch[1].toUpperCase();
    }

    // 3. General uppercase prefix with number (e.g. PROJ-101)
    const generalMatch = text.match(GENERAL_REF_PATTERN);
    if (generalMatch && !/^patch-\d+$/i.test(generalMatch[1])) {
      return generalMatch[1].toUpperCase();
    }
  }
  return null;
}

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

  // 2. Query work item
  let itemQuery: any = supabaseAdmin
    .from('work_items')
    .select('*')
    .eq('external_ref_id', targetRefId);

  if (typeof itemQuery.is === 'function') {
    itemQuery = itemQuery.is('deleted_at', null);
  }

  const { data: item, error: itemErr } = await itemQuery.maybeSingle();

  if (itemErr || !item) {
    return NextResponse.json({
      success: false,
      message: `Work item "${targetRefId}" not found in tracker database.`,
    }, { status: 404 });
  }

  // 3. Determine status transition
  const existingMetadata = (item.metadata || {}) as Record<string, any>;
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
