'use client';

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  GitPullRequest,
  GitCommit,
  ExternalLink,
  Copy,
  Check,
  Github,
  Loader2,
  GitMerge,
} from 'lucide-react';

interface GitHubStats {
  title?: string;
  state?: string;
  merged?: boolean;
  additions?: number;
  deletions?: number;
  author?: string;
  authorAvatar?: string;
  comments?: number;
}

interface CacheEntry {
  data: GitHubStats;
  fetchedAt: number;
}

// 60-second TTL for cached PR stats
const CACHE_TTL_MS = 60 * 1000;
const statsCache = new Map<string, CacheEntry>();
const inFlightRequests = new Map<string, Promise<GitHubStats | null>>();

const GITHUB_SEGMENT_REGEX = /^[a-zA-Z0-9_.-]+$/;
const GITHUB_PR_NUMBER_REGEX = /^\d+$/;
const GITHUB_COMMIT_HASH_REGEX = /^[0-9a-fA-F]{7,40}$/;

export function isValidGitHubOwnerOrRepo(segment: string): boolean {
  if (!segment || typeof segment !== 'string') return false;
  const trimmed = segment.trim();
  if (trimmed === '.' || trimmed === '..') return false;
  return GITHUB_SEGMENT_REGEX.test(trimmed);
}

function fetchPrStats(owner: string, repo: string, prNumber: string, cacheKey: string): Promise<GitHubStats | null> {
  // Validate segments against path traversal / SSRF
  if (!isValidGitHubOwnerOrRepo(owner) || !isValidGitHubOwnerOrRepo(repo) || !GITHUB_PR_NUMBER_REGEX.test(prNumber)) {
    return Promise.resolve(null);
  }

  if (inFlightRequests.has(cacheKey)) {
    return inFlightRequests.get(cacheKey)!;
  }

  const req = fetch(`https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${encodeURIComponent(prNumber)}`, {
    headers: { Accept: 'application/vnd.github.v3+json' },
  })
    .then((res) => {
      if (!res.ok) throw new Error('API request failed');
      return res.json();
    })
    .then((data): GitHubStats => {
      const fetchedStats: GitHubStats = {
        title: data.title,
        state: data.state,
        merged: Boolean(data.merged_at),
        additions: data.additions,
        deletions: data.deletions,
        author: data.user?.login,
        authorAvatar: data.user?.avatar_url,
        comments: data.comments,
      };
      statsCache.set(cacheKey, { data: fetchedStats, fetchedAt: Date.now() });
      return fetchedStats;
    })
    .catch(() => null)
    .finally(() => {
      inFlightRequests.delete(cacheKey);
    });

  inFlightRequests.set(cacheKey, req);
  return req;
}

interface GitHubBadgeProps {
  type: 'pr' | 'commit';
  value: string; // PR URL or commit hash
  prUrl?: string; // Optional reference PR URL to derive repo context for commit hashes
  compact?: boolean;
  className?: string;
}

/**
 * Extracts and validates owner and repo from a GitHub URL
 */
export function parseGitHubUrl(url: string): { owner: string; repo: string; prNumber?: string; commitHash?: string } | null {
  if (!url) return null;
  // Guard against path traversal sequences in the raw input URL
  if (url.includes('..') || url.includes('%2e') || url.includes('%2E')) return null;
  try {
    const parsed = new URL(url);
    if (!parsed.hostname.includes('github.com')) return null;
    const parts = parsed.pathname.split('/').filter(Boolean);
    if (parts.length >= 2) {
      const owner = parts[0];
      const repo = parts[1];
      if (!isValidGitHubOwnerOrRepo(owner) || !isValidGitHubOwnerOrRepo(repo)) {
        return null;
      }
      if (parts[2] === 'pull' && parts[3]) {
        const cleanPr = parts[3].split(/[?#]/)[0];
        if (!GITHUB_PR_NUMBER_REGEX.test(cleanPr)) return null;
        return { owner, repo, prNumber: cleanPr };
      }
      if (parts[2] === 'commit' && parts[3]) {
        const cleanHash = parts[3].split(/[?#]/)[0];
        if (!GITHUB_COMMIT_HASH_REGEX.test(cleanHash)) return null;
        return { owner, repo, commitHash: cleanHash };
      }
      return { owner, repo };
    }
  } catch {
    // Not a valid URL
  }
  return null;
}

export function GitHubBadge({
  type,
  value,
  prUrl,
  compact = false,
  className = '',
}: GitHubBadgeProps) {
  const [isHovered, setIsHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [stats, setStats] = useState<GitHubStats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; placeAbove: boolean } | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const hoverTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const badgeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Derive target URL and repo context
  let targetUrl = '';
  let displayLabel = '';
  let owner = 'tympollack';
  let repo = 'sunshade-tracker';
  let prNumber: string | undefined;
  let commitHash: string | undefined;

  // Extract from PR URL context if available
  const contextParsed = prUrl ? parseGitHubUrl(prUrl) : null;
  if (contextParsed) {
    owner = contextParsed.owner;
    repo = contextParsed.repo;
  }

  if (type === 'pr') {
    targetUrl = value.startsWith('http') ? value : `https://github.com/${owner}/${repo}/pull/${value.replace(/^#/, '')}`;
    const parsed = parseGitHubUrl(targetUrl);
    if (parsed) {
      owner = parsed.owner;
      repo = parsed.repo;
      prNumber = parsed.prNumber;
    }
    displayLabel = prNumber ? `#${prNumber}` : 'PR';
  } else {
    // Commit type
    if (value.startsWith('http')) {
      targetUrl = value;
      const parsed = parseGitHubUrl(targetUrl);
      if (parsed) {
        owner = parsed.owner;
        repo = parsed.repo;
        commitHash = parsed.commitHash;
      }
    } else {
      commitHash = value.trim();
      targetUrl = `https://github.com/${owner}/${repo}/commit/${commitHash}`;
    }
    const shortHash = commitHash ? commitHash.slice(0, 7) : value.slice(0, 7);
    displayLabel = shortHash;
  }

  const cacheKey = type === 'pr' && prNumber ? `${owner}/${repo}#${prNumber}` : null;

  // Fetch GitHub stats with stale-while-revalidate & duplicate suppression
  useEffect(() => {
    if (!isHovered || type !== 'pr' || !prNumber || !cacheKey) return;

    let active = true;
    const cached = statsCache.get(cacheKey);

    if (cached) {
      setStats(cached.data);
      const isStale = Date.now() - cached.fetchedAt > CACHE_TTL_MS;
      if (!isStale) {
        return;
      }
      // Background revalidation
      fetchPrStats(owner, repo, prNumber, cacheKey).then((fresh) => {
        if (active && fresh) {
          setStats(fresh);
        }
      });
    } else {
      setLoadingStats(true);
      fetchPrStats(owner, repo, prNumber, cacheKey)
        .then((fresh) => {
          if (active && fresh) {
            setStats(fresh);
          }
        })
        .finally(() => {
          if (active) setLoadingStats(false);
        });
    }

    return () => {
      active = false;
    };
  }, [isHovered, type, prNumber, cacheKey, owner, repo]);

  const updateCoordinates = () => {
    if (!badgeRef.current) return;
    const rect = badgeRef.current.getBoundingClientRect();
    const popoverWidth = 288; // 18rem / w-72
    const popoverHeight = 180;
    const placeAbove = rect.top >= popoverHeight + 12;

    const top = placeAbove
      ? rect.top - 8
      : rect.bottom + 8;

    let left = rect.left;
    if (typeof window !== 'undefined') {
      if (left + popoverWidth > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - popoverWidth - 12);
      }
      if (left < 12) {
        left = 12;
      }
    }

    setCoords({ top, left, placeAbove });
  };

  const handleMouseEnter = () => {
    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
    updateCoordinates();
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    hoverTimeoutRef.current = setTimeout(() => {
      setIsHovered(false);
    }, 200);
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      const textToCopy = type === 'commit' ? (commitHash || value) : targetUrl;
      await navigator.clipboard.writeText(textToCopy);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const isPr = type === 'pr';

  const popoverContent = isHovered && coords && (
    <div
      className="fixed z-[9999] w-72 p-3.5 bg-slate-900/95 backdrop-blur-md border border-slate-700/80 rounded-xl shadow-2xl text-xs space-y-2.5 animate-in fade-in zoom-in-95 duration-150 text-slate-100 cursor-default"
      style={{
        top: coords.top,
        left: coords.left,
        transform: coords.placeAbove ? 'translateY(-100%)' : 'none',
      }}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Popover Header */}
      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
        <div className="flex items-center space-x-1.5 min-w-0">
          <Github className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <span className="text-[11px] font-mono text-slate-300 truncate" title={`${owner}/${repo}`}>
            {owner}/{repo}
          </span>
        </div>
        <div className="flex items-center space-x-1 shrink-0">
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title={type === 'commit' ? 'Copy commit SHA' : 'Copy PR URL'}
          >
            {copied ? (
              <Check className="w-3 h-3 text-emerald-400" />
            ) : (
              <Copy className="w-3 h-3" />
            )}
          </button>
          <a
            href={targetUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Open in GitHub"
          >
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Body */}
      {isPr ? (
        <div className="space-y-2">
          <div className="flex items-start justify-between gap-2">
            <div className="space-y-0.5 min-w-0">
              <div className="flex items-center space-x-1.5">
                <span className="font-semibold text-white font-mono">
                  #{prNumber}
                </span>
                {stats?.merged ? (
                  <span className="inline-flex items-center space-x-1 text-[10px] px-1.5 py-0.2 rounded-full bg-purple-500/20 text-purple-300 border border-purple-500/40">
                    <GitMerge className="w-2.5 h-2.5" />
                    <span>Merged</span>
                  </span>
                ) : stats?.state ? (
                  <span
                    className={`text-[10px] px-1.5 py-0.2 rounded-full font-sans capitalize border ${
                      stats.state === 'open'
                        ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40'
                        : 'bg-red-500/20 text-red-300 border-red-500/40'
                    }`}
                  >
                    {stats.state}
                  </span>
                ) : null}
              </div>
              {stats?.title ? (
                <p className="text-[11px] text-slate-200 line-clamp-2 leading-snug pt-0.5">
                  {stats.title}
                </p>
              ) : loadingStats ? (
                <div className="flex items-center space-x-1.5 text-[10px] text-slate-500 pt-1">
                  <Loader2 className="w-3 h-3 animate-spin text-purple-400" />
                  <span>Fetching GitHub stats...</span>
                </div>
              ) : (
                <p className="text-[11px] text-slate-400 line-clamp-2 leading-snug pt-0.5 font-mono">
                  Pull Request #{prNumber}
                </p>
              )}
            </div>
          </div>

          {/* Stats additions / deletions */}
          {stats && (stats.additions !== undefined || stats.deletions !== undefined) && (
            <div className="flex items-center space-x-2 text-[10px] font-mono pt-1 border-t border-slate-800/60 text-slate-400">
              {stats.additions !== undefined && (
                <span className="text-emerald-400 font-medium">+{stats.additions}</span>
              )}
              {stats.deletions !== undefined && (
                <span className="text-red-400 font-medium">-{stats.deletions}</span>
              )}
              {stats.author && (
                <span className="text-slate-500 ml-auto">by @{stats.author}</span>
              )}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <div className="flex items-center space-x-1.5 font-mono text-[11px]">
            <GitCommit className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-cyan-200 font-semibold">{commitHash ? commitHash.slice(0, 10) : displayLabel}</span>
          </div>
          <p className="text-[10px] text-slate-400 font-mono break-all bg-slate-950 p-1.5 rounded border border-slate-800">
            {commitHash || value}
          </p>
        </div>
      )}

      {/* Footer Action */}
      <div className="pt-1">
        <a
          href={targetUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="w-full py-1 px-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 hover:text-white flex items-center justify-center space-x-1.5 transition-colors font-medium text-[11px]"
        >
          <span>View on GitHub</span>
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );

  return (
    <div
      ref={badgeRef}
      className={`relative inline-block ${className}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={(e) => e.stopPropagation()}
    >
      <a
        href={targetUrl}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => e.stopPropagation()}
        className={`inline-flex items-center space-x-1 font-mono rounded transition-all select-none border group ${
          isPr
            ? 'bg-purple-950/40 hover:bg-purple-900/50 text-purple-300 border-purple-800/70 hover:border-purple-600'
            : 'bg-cyan-950/40 hover:bg-cyan-900/50 text-cyan-300 border-cyan-800/70 hover:border-cyan-600'
        } ${compact ? 'text-[9px] px-1.5 py-0.5' : 'text-[10px] px-2 py-0.5'}`}
        title={`Open GitHub ${isPr ? 'PR' : 'Commit'} in new tab`}
      >
        {isPr ? (
          <GitPullRequest className="w-3 h-3 text-purple-400 shrink-0" />
        ) : (
          <GitCommit className="w-3 h-3 text-cyan-400 shrink-0" />
        )}
        <span className="font-semibold tracking-tight">{displayLabel}</span>
        <ExternalLink className="w-2.5 h-2.5 opacity-40 group-hover:opacity-100 transition-opacity ml-0.5 shrink-0" />
      </a>

      {/* Render popover into document.body to avoid clipping by overflow ancestors */}
      {isMounted && typeof document !== 'undefined' && popoverContent && createPortal(popoverContent, document.body)}
    </div>
  );
}
