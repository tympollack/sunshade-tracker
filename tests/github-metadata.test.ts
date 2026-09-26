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
      repo: undefined,
      owner: undefined,
      isGitHubField: isGitHubMetadataKey,
    });
    expect(extractGitHubMetadata(undefined)).toEqual({
      prUrl: undefined,
      commitHash: undefined,
      repo: undefined,
      owner: undefined,
      isGitHubField: isGitHubMetadataKey,
    });
    expect(extractGitHubMetadata({})).toEqual({
      prUrl: undefined,
      commitHash: undefined,
      repo: undefined,
      owner: undefined,
      isGitHubField: isGitHubMetadataKey,
    });
  });

  it('TRK-14: falls back to parent project github_repo when item metadata does not specify repo', () => {
    const result = extractGitHubMetadata(
      { commit_hash: 'a1b2c3d' },
      'tympollack/cozy'
    );
    expect(result.commitHash).toBe('a1b2c3d');
    expect(result.owner).toBe('tympollack');
    expect(result.repo).toBe('cozy');
  });

  it('TRK-14: item metadata repo overrides parent project github_repo fallback', () => {
    const result = extractGitHubMetadata(
      { commit_hash: 'a1b2c3d', repo: 'digitalcanopy/custom-service' },
      'tympollack/cozy'
    );
    expect(result.commitHash).toBe('a1b2c3d');
    expect(result.owner).toBe('digitalcanopy');
    expect(result.repo).toBe('custom-service');
  });

  it('TRK-14 / Review PR-62: project fallback owner/repo takes precedence over standalone metadata owner when metadata lacks repo', () => {
    const result = extractGitHubMetadata(
      { commit_hash: 'abcdef0', owner: 'alice' },
      'bob/service'
    );
    expect(result.commitHash).toBe('abcdef0');
    expect(result.owner).toBe('bob');
    expect(result.repo).toBe('service');
  });
});
