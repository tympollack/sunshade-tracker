/**
 * Utility helper to extract GitHub PR and commit metadata case-insensitively,
 * supporting aliases like `pr`, `pr_url`, `commit`, `commit_hash`, `sha`.
 */

export interface GitHubMetadataResult {
  prUrl?: string;
  commitHash?: string;
  repo?: string;
  owner?: string;
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
  'repo',
  'repository',
  'github_repo',
  'github_repository',
  'repo_name',
  'owner',
  'github_owner',
  'repo_owner',
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
  let repo: string | undefined;
  let owner: string | undefined;

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
    if (!repo && ['repo', 'repository', 'github_repo', 'github_repository', 'repo_name'].includes(lowerKey)) {
      repo = strVal;
    }
    if (!owner && ['owner', 'github_owner', 'repo_owner'].includes(lowerKey)) {
      owner = strVal;
    }
  }

  if (repo && repo.includes('/')) {
    const parts = repo.split('/');
    if (parts.length === 2 && parts[0] && parts[1]) {
      if (!owner) owner = parts[0];
      repo = parts[1];
    }
  }

  return {
    prUrl,
    commitHash,
    repo,
    owner,
    isGitHubField: isGitHubMetadataKey,
  };
}
