'use client';

import React, { useState, useRef } from 'react';
import {
  X,
  Trash2,
  Layers,
  Copy,
  Check,
  History,
} from 'lucide-react';
import { WorkItem, HierarchyLevel, AuditLogEntry } from '@/types/tracker';
import { CopyableRefId } from '@/components/CopyableRefId';
import { GitHubBadge } from '@/components/GitHubBadge';
import { extractGitHubMetadata } from '@/lib/github-metadata';
import { copyToClipboard } from '@/lib/clipboard';

export interface WorkItemModalHeaderProps {
  item: WorkItem;
  itemType: string;
  levelColor: { hex: string; badgeBg: string; badgeText: string; badgeBorder: string };
  isLocked: boolean;
  activeTab: 'details' | 'associated' | 'children' | 'activity';
  onTabChange: (tab: 'details' | 'associated' | 'children' | 'activity') => void;
  childCount: number;
  auditLogsCount: number;
  tenantSlug?: string;
  projectSettings?: any;
  githubRepo?: string;
  onClose: () => void;
  onRequestDelete: () => void;
  onRefreshAuditLogs?: (itemId: string) => void;
}

export function WorkItemModalHeader({
  item,
  itemType,
  levelColor,
  isLocked,
  activeTab,
  onTabChange,
  childCount,
  auditLogsCount,
  tenantSlug,
  projectSettings,
  githubRepo,
  onClose,
  onRequestDelete,
  onRefreshAuditLogs,
}: WorkItemModalHeaderProps) {
  const [copiedId, setCopiedId] = useState(false);
  const [copiedGetUrl, setCopiedGetUrl] = useState(false);
  const copyIdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const copyGetUrlTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const effectiveGithubRepo = githubRepo || projectSettings?.github_repo || projectSettings?.github_repository;
  const { prUrl: modalPrUrl, commitHash: modalCommitHash, repo: modalRepo, owner: modalOwner } =
    extractGitHubMetadata(item.metadata, effectiveGithubRepo);

  const isAssociatedTab = activeTab === 'associated' || activeTab === 'children';

  const handleCopyId = async (idOverride?: string) => {
    const textToCopy = idOverride || item.external_ref_id || item.id;
    const ok = await copyToClipboard(textToCopy);
    if (ok) {
      if (copyIdTimeoutRef.current) clearTimeout(copyIdTimeoutRef.current);
      setCopiedId(true);
      copyIdTimeoutRef.current = setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleCopyGetUrl = async () => {
    const tenantParam = tenantSlug ? `&tenant_slug=${encodeURIComponent(tenantSlug)}` : '';
    const url = `${typeof window !== 'undefined' ? window.location.origin : ''}/api/v1/items?id=${item.id}${tenantParam}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      if (copyGetUrlTimeoutRef.current) clearTimeout(copyGetUrlTimeoutRef.current);
      setCopiedGetUrl(true);
      copyGetUrlTimeoutRef.current = setTimeout(() => setCopiedGetUrl(false), 2000);
    }
  };

  return (
    <>
      {/* Header Top Bar */}
      <div className="px-6 py-4 border-b border-slate-800 flex items-center justify-between gap-3">
        <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1 overflow-hidden flex-wrap sm:flex-nowrap gap-y-1">
          <span
            className={`text-xs uppercase font-mono px-2.5 py-1 rounded-md border font-semibold shrink-0 ${levelColor.badgeBg} ${levelColor.badgeText} ${levelColor.badgeBorder}`}
          >
            {itemType}
          </span>
          {item.external_ref_id ? (
            <CopyableRefId id={item.external_ref_id} showHash className="text-xs shrink-0" />
          ) : (
            <CopyableRefId
              id={item.id}
              displayId={item.id.slice(0, 8)}
              showHash
              className="text-xs shrink-0"
              title="Click to copy UUID"
            />
          )}
          {modalPrUrl && <GitHubBadge type="pr" value={modalPrUrl} repo={modalRepo} owner={modalOwner} />}
          {modalCommitHash && (
            <GitHubBadge
              type="commit"
              value={modalCommitHash}
              prUrl={modalPrUrl}
              repo={modalRepo}
              owner={modalOwner}
            />
          )}
        </div>

        <div className="flex items-center space-x-1.5 sm:space-x-2 shrink-0 ml-auto">
          {/* One-Click Copy Work Item ID (TRK-05) */}
          <button
            type="button"
            onClick={() => handleCopyId()}
            data-testid="modal-copy-id-btn"
            className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg text-xs font-mono bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 flex items-center space-x-1 sm:space-x-1.5 transition-colors border border-slate-700/60 shadow-sm cursor-pointer"
            title="Copy work item ID"
            aria-label="Copy work item ID"
          >
            {copiedId ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-emerald-400 hidden sm:inline">Copied ID</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">Copy ID</span>
              </>
            )}
          </button>

          {/* Copy GET URL */}
          <button
            type="button"
            onClick={handleCopyGetUrl}
            className="p-1.5 sm:px-2.5 sm:py-1 rounded-lg text-xs font-mono bg-slate-800/90 hover:bg-slate-700 text-slate-300 hover:text-emerald-400 flex items-center space-x-1 sm:space-x-1.5 transition-colors border border-slate-700/60 shadow-sm cursor-pointer"
            title="Copy item GET API URL"
            aria-label="Copy item GET API URL"
          >
            {copiedGetUrl ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span className="text-emerald-400 hidden sm:inline">Copied</span>
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 shrink-0" />
                <span className="hidden sm:inline">GET URL</span>
              </>
            )}
          </button>

          {!isLocked && (
            <button
              type="button"
              onClick={onRequestDelete}
              className="p-1.5 rounded-lg text-slate-500 hover:text-red-400 hover:bg-slate-800 transition-colors cursor-pointer"
              title="Delete work item"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            data-testid="modal-close-btn"
            className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
            title="Close (Esc)"
            aria-label="Close (Esc)"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="flex items-center border-b border-slate-800 px-6 bg-slate-950/40">
        <button
          type="button"
          onClick={() => onTabChange('details')}
          className={`py-2.5 px-3 text-xs font-semibold border-b-2 flex items-center space-x-1.5 transition-colors ${
            activeTab === 'details'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span>Details</span>
        </button>
        <button
          type="button"
          onClick={() => onTabChange('associated')}
          data-testid="modal-tab-children"
          className={`py-2.5 px-3 text-xs font-semibold border-b-2 flex items-center space-x-1.5 transition-colors ${
            isAssociatedTab
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <span data-testid="modal-tab-associated" className="flex items-center space-x-1.5">
            <Layers className="w-3.5 h-3.5" />
            <span>Associated Items</span>
            <span className="sr-only"> Children</span>
            {childCount > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                {childCount}
              </span>
            )}
          </span>
        </button>
        <button
          type="button"
          onClick={() => {
            onTabChange('activity');
            if (item.id && onRefreshAuditLogs) onRefreshAuditLogs(item.id);
          }}
          className={`py-2.5 px-3 text-xs font-semibold border-b-2 flex items-center space-x-1.5 transition-colors ${
            activeTab === 'activity'
              ? 'border-emerald-500 text-emerald-400'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <History className="w-3.5 h-3.5" />
          <span>Activity Log</span>
          {auditLogsCount > 0 && (
            <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-full bg-slate-800 text-slate-300">
              {auditLogsCount}
            </span>
          )}
        </button>
      </div>
    </>
  );
}
