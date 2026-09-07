/**
 * Utility helper to extract GitHub PR and commit metadata case-insensitively,
 * supporting aliases like `pr`, `pr_url`, `commit`, `commit_hash`, `sha`.
 */

export interface GitHubMetadataResult {
  prUrl?: string;
  commitHash?: string;
  isGitHubField: (key: string) => boolean;
}

const GITHUB_KEYS = new Set([
  'pr_url',
  'pr',
  'github_pr',
  'pull_request',
  'pr_link',
  'commit_hash',
  'commit',
  'sha',
  'git_commit',
  'commit_sha',
]);

export function isGitHubMetadataKey(key: string): boolean {
  return GITHUB_KEYS.has(key.toLowerCase());
}

export function extractGitHubMetadata(metadata?: Record<string, any> | null): GitHubMetadataResult {
  if (!metadata || typeof metadata !== 'object') {
    return { isGitHubField: isGitHubMetadataKey };
  }

  let prUrl: string | undefined;
  let commitHash: string | undefined;

  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined || value === null || typeof value === 'object') continue;
    const lowerKey = key.toLowerCase();
    const strVal = String(value).trim();
    if (!strVal) continue;

    if (!prUrl && ['pr_url', 'pr', 'github_pr', 'pull_request', 'pr_link'].includes(lowerKey)) {
      prUrl = strVal;
    }
    if (!commitHash && ['commit_hash', 'commit', 'sha', 'git_commit', 'commit_sha'].includes(lowerKey)) {
      commitHash = strVal;
    }
  }

  return {
    prUrl,
    commitHash,
    isGitHubField: isGitHubMetadataKey,
  };
}
