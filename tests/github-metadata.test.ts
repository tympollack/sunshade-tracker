import { describe, it, expect } from 'vitest';
import { extractGitHubMetadata, isGitHubMetadataKey } from '@/lib/github-metadata';

describe('extractGitHubMetadata utility', () => {
  it('extracts PR URL and commit hash with standard lowercase keys', () => {
    const result = extractGitHubMetadata({
      pr_url: 'https://github.com/org/repo/pull/1',
      commit_hash: '364ae73',
      priority: 'High',
    });

    expect(result.prUrl).toBe('https://github.com/org/repo/pull/1');
    expect(result.commitHash).toBe('364ae73');
    expect(result.isGitHubField('pr_url')).toBe(true);
    expect(result.isGitHubField('priority')).toBe(false);
  });

  it('extracts PR and commit from mixed-case and uppercase keys', () => {
    const result = extractGitHubMetadata({
      PR_URL: 'https://github.com/org/repo/pull/42',
      COMMIT_HASH: 'f7d090e',
      Complexity: 3,
    });

    expect(result.prUrl).toBe('https://github.com/org/repo/pull/42');
    expect(result.commitHash).toBe('f7d090e');
    expect(result.isGitHubField('PR_URL')).toBe(true);
    expect(result.isGitHubField('COMMIT_HASH')).toBe(true);
    expect(result.isGitHubField('Complexity')).toBe(false);
  });

  it('supports alias keys like pr and sha', () => {
    const result = extractGitHubMetadata({
      pr: 'https://github.com/custom/repo/pull/88',
      sha: 'a1b2c3d4e5f6',
    });

    expect(result.prUrl).toBe('https://github.com/custom/repo/pull/88');
    expect(result.commitHash).toBe('a1b2c3d4e5f6');
  });

  it('handles null, undefined, and empty metadata gracefully', () => {
    expect(extractGitHubMetadata(null)).toEqual({
      prUrl: undefined,
      commitHash: undefined,
      isGitHubField: isGitHubMetadataKey,
    });
    expect(extractGitHubMetadata(undefined)).toEqual({
      prUrl: undefined,
      commitHash: undefined,
      isGitHubField: isGitHubMetadataKey,
    });
    expect(extractGitHubMetadata({})).toEqual({
      prUrl: undefined,
      commitHash: undefined,
      isGitHubField: isGitHubMetadataKey,
    });
  });
});
