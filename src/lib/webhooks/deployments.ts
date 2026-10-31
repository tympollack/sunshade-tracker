import type { NextRequest } from 'next/server';
import type { WorkItem } from '@/types/tracker';

export interface ExtractedDeploymentInfo {
  branch?: string;
  commitSha?: string;
  environment: 'preview' | 'production';
  deploymentUrl?: string;
  deploymentStatus: string;
  source: string;
  repository?: string;
}

function formatUrl(rawUrl: string): string {
  const trimmed = String(rawUrl).trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) {
    return trimmed;
  }
  return `https://${trimmed}`;
}

/**
 * Normalizes multi-platform CI/CD deployment payloads (GitHub, Vercel, Cloudflare Pages, etc.)
 */
export function extractDeploymentInfo(body: any, req?: NextRequest): ExtractedDeploymentInfo {
  const ghEvent = req?.headers?.get('x-github-event');
  const vercelSig = req?.headers?.get('x-vercel-signature');

  // 1. GitHub Deployment Status
  if (ghEvent === 'deployment_status' || ghEvent === 'deployment' || body.deployment_status) {
    const deployment = body.deployment || {};
    const deploymentStatus = body.deployment_status || {};
    const ref = deployment.ref || body.ref || '';
    const branch = ref.replace(/^refs\/heads\//, '') || undefined;
    const commitSha = deployment.sha || deploymentStatus.commit_sha || body.sha || body.commit_hash;
    const targetUrl = deploymentStatus.target_url || deploymentStatus.environment_url || deployment.payload?.web_url || body.target_url;
    const rawEnv = (deploymentStatus.environment || deployment.environment || body.environment || '').toLowerCase();
    const environment: 'preview' | 'production' = rawEnv === 'production' || rawEnv === 'prod' ? 'production' : 'preview';
    const state = deploymentStatus.state || body.state || 'succeeded';
    const status = state === 'success' ? 'succeeded' : state;

    return {
      branch,
      commitSha,
      environment,
      deploymentUrl: targetUrl ? formatUrl(targetUrl) : undefined,
      deploymentStatus: status,
      source: 'github',
      repository: body.repository?.name || body.repository?.full_name,
    };
  }

  // 2. Vercel Deployment Webhook
  const isVercel =
    Boolean(vercelSig) ||
    String(body.type || '').startsWith('deployment') ||
    Boolean(body.payload?.deployment) ||
    Boolean(body.deployment?.meta);

  if (isVercel) {
    const dpl = body.payload?.deployment || body.deployment || body;
    const meta = dpl.meta || body.payload?.meta || body.meta || {};

    const branch = meta.githubCommitRef || meta.gitlabCommitRef || meta.branch || dpl.branch || body.branch;
    const commitSha = meta.githubCommitSha || meta.gitlabCommitSha || meta.commitSha || dpl.commit_sha || body.commit_sha || body.commit_hash || body.sha;
    const rawUrl = dpl.url || body.payload?.url || body.url || body.payload?.alias?.[0] || body.alias?.[0];
    const target = dpl.target || body.payload?.target || body.target || meta.environment;
    const environment: 'preview' | 'production' = target === 'production' || target === 'prod' ? 'production' : 'preview';

    let status = 'succeeded';
    const eventType = String(body.type || body.event || '');
    if (eventType.includes('error') || eventType.includes('failed')) {
      status = 'failed';
    } else if (eventType.includes('canceled') || eventType.includes('cancelled')) {
      status = 'canceled';
    } else if (eventType.includes('created') || eventType.includes('building')) {
      status = 'in_progress';
    }

    return {
      branch,
      commitSha,
      environment,
      deploymentUrl: rawUrl ? formatUrl(rawUrl) : undefined,
      deploymentStatus: status,
      source: 'vercel',
      repository: meta.githubCommitRepo || body.name,
    };
  }

  // 3. Cloudflare Pages
  if (body.stage === 'deployment' || body.deployment?.deployment_trigger) {
    const dpl = body.deployment || body;
    const triggerMeta = dpl.deployment_trigger?.metadata || {};
    const branch = triggerMeta.branch || body.branch || dpl.branch;
    const commitSha = triggerMeta.commit_hash || body.commit_hash || dpl.commit_hash || body.sha;
    const rawUrl = dpl.url || body.url;
    const rawEnv = (dpl.environment || body.environment || '').toLowerCase();
    const environment: 'preview' | 'production' = rawEnv === 'production' ? 'production' : 'preview';
    const status = body.status === 'success' || dpl.status === 'success' ? 'succeeded' : (body.status || 'succeeded');

    return {
      branch,
      commitSha,
      environment,
      deploymentUrl: rawUrl ? formatUrl(rawUrl) : undefined,
      deploymentStatus: status,
      source: 'cloudflare',
      repository: body.project?.name || body.project,
    };
  }

  // 4. Generic / Direct Ingestion Fallback
  const ref = body.branch || body.ref || '';
  const branch = ref.replace(/^refs\/heads\//, '') || undefined;
  const commitSha = body.commit_sha || body.commit_hash || body.sha || body.commit;
  const rawUrl = body.deployment_url || body.target_url || body.preview_url || body.url;
  const rawEnv = (body.environment || body.target || '').toLowerCase();
  const environment: 'preview' | 'production' = rawEnv === 'production' || rawEnv === 'prod' ? 'production' : 'preview';
  const status = body.deployment_status || body.status || 'succeeded';

  return {
    branch,
    commitSha,
    environment,
    deploymentUrl: rawUrl ? formatUrl(rawUrl) : undefined,
    deploymentStatus: status,
    source: body.source || 'generic',
    repository: body.repository || body.project_slug || body.project,
  };
}

/**
 * Checks if a work item matches the deployment based on commitSha or branch reference.
 */
export function itemMatchesDeployment(item: WorkItem | any, commitSha?: string, branch?: string): boolean {
  if (!item) return false;

  // 1. Match by commit_hash
  if (commitSha) {
    const itemSha = item.metadata?.commit_hash || item.metadata?.commitSha;
    if (itemSha) {
      const cleanSha = String(commitSha).toLowerCase().trim();
      const cleanItemSha = String(itemSha).toLowerCase().trim();
      if (cleanSha === cleanItemSha || cleanSha.startsWith(cleanItemSha) || cleanItemSha.startsWith(cleanSha)) {
        return true;
      }
    }
  }

  // 2. Match by external_ref_id or title in branch name
  if (branch) {
    const branchUpper = String(branch).toUpperCase();

    // Check external_ref_id
    if (item.external_ref_id) {
      const refUpper = String(item.external_ref_id).toUpperCase();
      if (branchUpper.includes(refUpper)) {
        return true;
      }
    }

    // Check ref tags embedded in branch (e.g. feat/STORY-123-abc)
    const refMatches = branchUpper.match(/[A-Z0-9]+-[A-Z0-9-]+/g) || [];
    if (item.external_ref_id && refMatches.some((r) => r === item.external_ref_id.toUpperCase())) {
      return true;
    }

    // Check item title slug (if title has meaningful distinctive words)
    if (item.title) {
      const cleanTitleWords = item.title
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .split(/\s+/)
        .filter((w: string) => w.length >= 5);

      const branchLower = String(branch).toLowerCase();
      if (cleanTitleWords.length > 0 && cleanTitleWords.every((w: string) => branchLower.includes(w))) {
        return true;
      }
    }
  }

  return false;
}
