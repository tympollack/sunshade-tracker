'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import {
  X,
  Trash2,
  Save,
  User,
  Hash,
  Layers,
  GitFork,
  Calendar,
  AlertCircle,
  Plus,
  Tag,
  Copy,
  Check,
  Link2,
  History,
  Clock,
  ArrowRight,
  RefreshCw,
  Lock,
  Loader2,
} from 'lucide-react';
import { WorkItem, ProjectSettings, StatusDefinition, AuditLogEntry } from '@/types/tracker';
import { getHierarchyLevelColor, getDefaultLevelHex } from '@/lib/hierarchy-colors';
import { GitHubBadge } from '@/components/GitHubBadge';
import { ConfirmDeleteModal } from '@/components/ConfirmDeleteModal';
import { extractGitHubMetadata, isGitHubMetadataKey } from '@/lib/github-metadata';
import { isItemImmutableDueToCompletedSprint } from '@/lib/sprint-utils';
import { CopyableRefId } from '@/components/CopyableRefId';
import { copyToClipboard } from '@/lib/clipboard';
import { AssociatedItemsTab } from '@/components/AssociatedItemsTab';
import { QuickAddPayload } from '@/components/QuickAddModal';

interface ProjectInfo {
  id: string;
  slug: string;
  name: string;
  settings?: ProjectSettings;
}

interface WorkItemModalProps {
  item: WorkItem | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (id: string, updates: Partial<WorkItem>) => Promise<void> | void;
  onDelete: (id: string) => Promise<boolean | void> | boolean | void;
  projectSettings: ProjectSettings;
  allItems: WorkItem[];
  currentUser?: { full_name?: string; email?: string };
  workspaceMembers?: { full_name: string; email?: string }[];
  tenantSlug?: string;
  isReadOnly?: boolean;
  projects?: ProjectInfo[];
  onSelectItem?: (item: WorkItem) => void;
  onCreateChildItem?: (payload: QuickAddPayload) => Promise<WorkItem | void>;
  onRefresh?: () => Promise<void> | void;
}

function formatModalTimestamp(isoString?: string | null): string {
  if (!isoString) return '';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '';
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return '';
  }
}

export function WorkItemModal({
  item,
  isOpen,
  onClose,
  onSave,
  onDelete,
  projectSettings,
  allItems,
  currentUser,
  workspaceMembers = [],
  tenantSlug,
  isReadOnly = false,
  projects = [],
  onSelectItem,
  onCreateChildItem,
  onRefresh,
}: WorkItemModalProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('');
  const [itemType, setItemType] = useState('');
  const [parentId, setParentId] = useState<string>('');
  const [assignee, setAssignee] = useState('');
  const [externalRef, setExternalRef] = useState('');
  const [selectedProjectId, setSelectedProjectId] = useState<string>('');
  const [metadata, setMetadata] = useState<Record<string, any>>({});
  const [metaDrafts, setMetaDrafts] = useState<Record<string, string>>({});
  const [metaErrors, setMetaErrors] = useState<Record<string, string | null>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [newMetaKey, setNewMetaKey] = useState('');
  const [newMetaVal, setNewMetaVal] = useState('');
  const [showAddMeta, setShowAddMeta] = useState(false);
  const [copiedGetUrl, setCopiedGetUrl] = useState(false);
  const [copiedId, setCopiedId] = useState(false);
  const copyIdTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const copyGetUrlTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (copyIdTimeoutRef.current) clearTimeout(copyIdTimeoutRef.current);
      if (copyGetUrlTimeoutRef.current) clearTimeout(copyGetUrlTimeoutRef.current);
    };
  }, []);

  const [showConfirmDelete, setShowConfirmDelete] = useState(false);

  const effectiveProjectSettings = useMemo(() => {
    if (selectedProjectId && projects && projects.length > 0) {
      const destProj = projects.find((p) => p.id === selectedProjectId || p.slug === selectedProjectId);
      if (destProj?.settings) {
        return {
          ...destProj.settings,
          hierarchy: (destProj.settings.hierarchy || []).map((h: any) => ({
            ...h,
            color: h.color || getDefaultLevelHex(h.level),
          })),
        };
      }
    }
    return projectSettings;
  }, [selectedProjectId, projects, projectSettings]);

  // Keep itemType and status aligned with effectiveProjectSettings when selectedProjectId changes
  useEffect(() => {
    if (!effectiveProjectSettings) return;
    if (itemType && effectiveProjectSettings.hierarchy?.length) {
      const isTypeValid = effectiveProjectSettings.hierarchy.some((h) => h.type === itemType);
      if (!isTypeValid) {
        setItemType(effectiveProjectSettings.hierarchy[0]?.type || 'task');
      }
    }
    if (status && effectiveProjectSettings.statuses?.length) {
      const isStatusValid = effectiveProjectSettings.statuses.some((s) => s.id === status);
      if (!isStatusValid) {
        setStatus(effectiveProjectSettings.statuses[0]?.id || 'backlog');
      }
    }
  }, [selectedProjectId, effectiveProjectSettings]);

  const isSprintLocked = item ? isItemImmutableDueToCompletedSprint(item, effectiveProjectSettings) : false;
  const isLocked = isSprintLocked || isReadOnly;

  // Navigation tabs: details | associated | activity (supporting 'children' as alias)
  const [activeTab, setActiveTab] = useState<'details' | 'associated' | 'children' | 'activity'>('details');
  const isAssociatedTab = activeTab === 'associated' || activeTab === 'children';
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);
  const lastFetchedItemIdRef = useRef<string | null>(null);

  const childItems = item ? allItems.filter((it) => it.parent_id === item.id) : [];

  const fetchAuditLogs = async (itemId: string) => {
    lastFetchedItemIdRef.current = itemId;
    setIsLoadingLogs(true);
    try {
      const res = await fetch(`/api/v1/audit-logs?item_id=${itemId}`, {
        headers: tenantSlug ? { 'x-tenant-slug': tenantSlug } : {},
      });
      if (res.ok) {
        const data = await res.json();
        if (lastFetchedItemIdRef.current === itemId) {
          setAuditLogs(data.audit_logs || []);
        }
      }
    } catch {
      // Graceful ignore
    } finally {
      if (lastFetchedItemIdRef.current === itemId) {
        setIsLoadingLogs(false);
      }
    }
  };

  // Sync form state when item changes
  useEffect(() => {
    if (item) {
      setActiveTab('details');
      setTitle(item.title || '');
      setDescription(item.description || '');
      setStatus(item.status || projectSettings.statuses[0]?.id || 'backlog');
      setItemType(item.item_type || projectSettings.hierarchy[0]?.type || 'task');
      setParentId(item.parent_id || '');
      setAssignee(item.assignee || '');
      setExternalRef(item.external_ref_id || '');
      setSelectedProjectId(item.project_id || '');
      const rawMeta = item.metadata ? { ...item.metadata } : {};
      setMetadata(rawMeta);
      const drafts: Record<string, string> = {};
      Object.entries(rawMeta).forEach(([k, v]) => {
        drafts[k] = typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v ?? '');
      });
      setMetaDrafts(drafts);
      setMetaErrors({});
      setShowAddMeta(false);
      setSaveError(null);

      if (item.id) {
        setAuditLogs([]);
        fetchAuditLogs(item.id);
      } else {
        lastFetchedItemIdRef.current = null;
        setAuditLogs([]);
      }
    }
  }, [item, projectSettings]);

  // Handle ESC key to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (!isOpen || showConfirmDelete) return;
      if (e.key === 'Escape') {
        onClose();
      } else if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
        handleSave();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, showConfirmDelete, title, description, status, itemType, parentId, assignee, externalRef, metadata, metaErrors]);

  const [projectCandidateItems, setProjectCandidateItems] = useState<WorkItem[]>([]);
  const [isLoadingParents, setIsLoadingParents] = useState(false);

  // Dynamically refresh parent item options when reassigning project (BUG-TRK-REASSIGN-PARENT-OPTIONS)
  useEffect(() => {
    if (!item) return;
    const targetProjId = selectedProjectId || item.project_id;
    if (!targetProjId) return;

    // If changing project, check if current parent belongs to new project. If not, reset to None.
    const knownMatching = allItems.filter((i) => i.project_id === targetProjId);
    if (parentId && targetProjId !== item.project_id) {
      const parentMatches = knownMatching.some((i) => i.id === parentId);
      if (!parentMatches) {
        setParentId('');
      }
    }

    if (targetProjId === item.project_id) {
      setProjectCandidateItems(allItems.filter((i) => i.project_id === item.project_id));
      setIsLoadingParents(false);
      return;
    }

    if (knownMatching.length > 0) {
      setProjectCandidateItems(knownMatching);
    }

    let isCancelled = false;
    setIsLoadingParents(true);
    fetch(`/api/v1/items?project_id=${targetProjId}`, {
      headers: tenantSlug ? { 'x-tenant-slug': tenantSlug } : {},
    })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isCancelled && data?.items) {
          setProjectCandidateItems(data.items);
          if (parentId && !data.items.some((it: WorkItem) => it.id === parentId)) {
            setParentId('');
          }
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!isCancelled) setIsLoadingParents(false);
      });

    return () => {
      isCancelled = true;
    };
  }, [selectedProjectId, item?.id, item?.project_id, allItems, tenantSlug]);

  if (!isOpen || !item) return null;

  // Determine allowed parents based on selected itemType and effective project
  const currentHierarchyConfig = effectiveProjectSettings.hierarchy.find((h) => h.type === itemType);
  const allowedParentTypes = currentHierarchyConfig?.allowed_parents || [];
  const targetProjId = selectedProjectId || item.project_id;
  const parentPool =
    projectCandidateItems.length > 0
      ? projectCandidateItems
      : allItems.filter((other) => other.project_id === targetProjId);

  const eligibleParents = parentPool.filter(
    (other) =>
      other.id !== item.id &&
      other.project_id === targetProjId &&
      allowedParentTypes.includes(other.item_type)
  );

  // Derive assignee options
  const myDisplayName = currentUser?.full_name
    ? `Me (${currentUser.full_name})`
    : currentUser?.email
    ? `Me (${currentUser.email.split('@')[0]})`
    : 'Me';

  const memberNames = Array.from(
    new Set([
      ...workspaceMembers.map((m) => m.full_name).filter(Boolean),
      ...allItems
        .map((i) => i.assignee)
        .filter((a): a is string => typeof a === 'string' && a.length > 0 && !a.startsWith('Me (')),
    ])
  );

  const levelColor = getHierarchyLevelColor(itemType, effectiveProjectSettings.hierarchy);
  const { prUrl: modalPrUrl, commitHash: modalCommitHash, repo: modalRepo, owner: modalOwner } = extractGitHubMetadata(metadata);

  const handleSave = async () => {
    if (isLocked) {
      setSaveError(`This item was completed in closed sprint "${item?.metadata?.sprint}" and is immutable.`);
      return;
    }
    if (!title.trim()) return;
    const hasErrors = Object.values(metaErrors).some(Boolean);
    if (hasErrors) {
      setSaveError('Please correct invalid metadata values before saving.');
      return;
    }
    setIsSaving(true);
    setSaveError(null);
    try {
      const updates: Partial<WorkItem> = {
        title: title.trim(),
        description: description.trim() || null,
        status,
        item_type: itemType,
        parent_id: parentId || null,
        assignee: assignee || null,
        external_ref_id: externalRef.trim() || null,
        metadata,
      };
      if (selectedProjectId && selectedProjectId !== item.project_id) {
        updates.project_id = selectedProjectId;
      }
      await onSave(item.id, updates);
      onClose();
    } catch (err: any) {
      setSaveError(err.message || 'Failed to save changes');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async () => {
    setIsSaving(true);
    try {
      const deleted = await onDelete(item.id);
      if (deleted !== false) {
        onClose();
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddMetaField = () => {
    const key = newMetaKey.trim();
    if (!key) return;

    let parsedVal: any = newMetaVal.trim();
    if (parsedVal === 'true') parsedVal = true;
    else if (parsedVal === 'false') parsedVal = false;
    else if (parsedVal === 'null') parsedVal = null;
    else if (!isNaN(Number(parsedVal)) && parsedVal !== '') parsedVal = Number(parsedVal);
    else if (
      (parsedVal.startsWith('{') && parsedVal.endsWith('}')) ||
      (parsedVal.startsWith('[') && parsedVal.endsWith(']'))
    ) {
      try {
        parsedVal = JSON.parse(parsedVal);
      } catch {
        // preserve as string
      }
    }

    setMetadata((prev) => ({ ...prev, [key]: parsedVal }));
    setMetaDrafts((prev) => ({
      ...prev,
      [key]:
        typeof parsedVal === 'object' && parsedVal !== null
          ? JSON.stringify(parsedVal, null, 2)
          : String(parsedVal ?? ''),
    }));
    setMetaErrors((prev) => ({ ...prev, [key]: null }));
    setNewMetaKey('');
    setNewMetaVal('');
    setShowAddMeta(false);
  };

  const handleCopyGetUrl = async () => {
    if (!item) return;
    const tenantParam = tenantSlug ? `&tenant_slug=${encodeURIComponent(tenantSlug)}` : '';
    const url = `${window.location.origin}/api/v1/items?id=${item.id}${tenantParam}`;
    const ok = await copyToClipboard(url);
    if (ok) {
      if (copyGetUrlTimeoutRef.current) clearTimeout(copyGetUrlTimeoutRef.current);
      setCopiedGetUrl(true);
      copyGetUrlTimeoutRef.current = setTimeout(() => setCopiedGetUrl(false), 2000);
    }
  };

  const handleCopyId = async (idOverride?: string) => {
    if (!item) return;
    const textToCopy = idOverride || item.external_ref_id || item.id;
    const ok = await copyToClipboard(textToCopy);
    if (ok) {
      if (copyIdTimeoutRef.current) clearTimeout(copyIdTimeoutRef.current);
      setCopiedId(true);
      copyIdTimeoutRef.current = setTimeout(() => setCopiedId(false), 2000);
    }
  };

  const handleUpdateMetaField = (key: string, rawText: string) => {
    setMetaDrafts((prev) => ({ ...prev, [key]: rawText }));

    const currentVal = metadata[key];
    const isOriginalObject = typeof currentVal === 'object' && currentVal !== null;
    const looksLikeJson = rawText.trim().startsWith('{') || rawText.trim().startsWith('[');

    if (isOriginalObject || looksLikeJson) {
      try {
        const parsed = JSON.parse(rawText);
        setMetadata((prev) => ({ ...prev, [key]: parsed }));
        setMetaErrors((prev) => ({ ...prev, [key]: null }));
      } catch {
        setMetaErrors((prev) => ({ ...prev, [key]: 'Invalid JSON format' }));
      }
      return;
    }

    if (typeof currentVal === 'number') {
      const trimmed = rawText.trim();
      if (trimmed === '') {
        setMetadata((prev) => ({ ...prev, [key]: null }));
        setMetaErrors((prev) => ({ ...prev, [key]: null }));
      } else {
        const num = Number(trimmed);
        if (isNaN(num)) {
          setMetaErrors((prev) => ({ ...prev, [key]: 'Must be a valid number' }));
        } else {
          setMetadata((prev) => ({ ...prev, [key]: num }));
          setMetaErrors((prev) => ({ ...prev, [key]: null }));
        }
      }
      return;
    }

    if (currentVal === null) {
      const trimmed = rawText.trim();
      if (trimmed === '') {
        setMetadata((prev) => ({ ...prev, [key]: null }));
        setMetaErrors((prev) => ({ ...prev, [key]: null }));
        return;
      }
      if (rawText === 'true' || rawText === 'false') {
        setMetadata((prev) => ({ ...prev, [key]: rawText === 'true' }));
        setMetaErrors((prev) => ({ ...prev, [key]: null }));
        return;
      }
      setMetadata((prev) => ({ ...prev, [key]: rawText }));
      setMetaErrors((prev) => ({ ...prev, [key]: null }));
      return;
    }

    if (typeof currentVal === 'boolean') {
      const boolVal = rawText === 'true';
      setMetadata((prev) => ({ ...prev, [key]: boolVal }));
      setMetaErrors((prev) => ({ ...prev, [key]: null }));
      return;
    }

    // Default string
    setMetadata((prev) => ({ ...prev, [key]: rawText }));
    setMetaErrors((prev) => ({ ...prev, [key]: null }));
  };

  const handleRemoveMetaField = (key: string) => {
    setMetadata((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setMetaDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    setMetaErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl flex flex-col max-h-[90vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="px-4 sm:px-6 py-3 sm:py-4 border-b border-slate-800 flex items-center justify-between gap-2 bg-slate-950/50">
          <div className="flex items-center space-x-2 sm:space-x-3 min-w-0 flex-1 overflow-hidden flex-wrap sm:flex-nowrap gap-y-1">
            <span
              className={`text-xs uppercase font-mono px-2.5 py-1 rounded-md border font-semibold shrink-0 ${levelColor.badgeBg} ${levelColor.badgeText} ${levelColor.badgeBorder}`}
            >
              {itemType}
            </span>
            {item.external_ref_id ? (
              <CopyableRefId
                id={item.external_ref_id}
                showHash
                className="text-xs shrink-0"
              />
            ) : (
              <CopyableRefId
                id={item.id}
                displayId={item.id.slice(0, 8)}
                showHash
                className="text-xs shrink-0"
                title="Click to copy UUID"
              />
            )}
            {modalPrUrl && (
              <GitHubBadge
                type="pr"
                value={modalPrUrl}
              />
            )}
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
                onClick={() => setShowConfirmDelete(true)}
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

        {/* Modal Navigation Tabs */}
        <div className="flex items-center border-b border-slate-800 px-6 bg-slate-950/40">
          <button
            type="button"
            onClick={() => setActiveTab('details')}
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
            onClick={() => setActiveTab('associated')}
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
              {childItems.length > 0 && (
                <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800/60">
                  {childItems.length}
                </span>
              )}
            </span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('activity');
              if (item?.id) fetchAuditLogs(item.id);
            }}
            className={`py-2.5 px-3 text-xs font-semibold border-b-2 flex items-center space-x-1.5 transition-colors ${
              activeTab === 'activity'
                ? 'border-emerald-500 text-emerald-400'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            <span>Activity Log</span>
            {auditLogs.length > 0 && (
              <span className="px-1.5 py-0.5 text-[10px] font-mono rounded-full bg-slate-800 text-slate-300">
                {auditLogs.length}
              </span>
            )}
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto custom-scrollbar flex-1">
          {isAssociatedTab ? (
            item ? (
              <AssociatedItemsTab
                item={item}
                allItems={allItems}
                projectSettings={effectiveProjectSettings}
                workspaceMembers={workspaceMembers}
                isReadOnly={isReadOnly}
                tenantSlug={tenantSlug}
                onSelectItem={onSelectItem}
                onCreateChildItem={onCreateChildItem}
                onRefresh={onRefresh}
              />
            ) : null
          ) : activeTab === 'activity' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Clock className="w-4 h-4 text-emerald-400" />
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                    Change History & Audit Trail
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => item?.id && fetchAuditLogs(item.id)}
                  disabled={isLoadingLogs}
                  className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
                  title="Refresh activity"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin text-emerald-400' : ''}`} />
                </button>
              </div>

              {isLoadingLogs && auditLogs.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-400" />
                  Loading activity log...
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <History className="w-8 h-8 text-slate-600 mx-auto" />
                  <p className="text-xs font-medium text-slate-400">No activity logged yet</p>
                  <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
                    Mutations, reassignments, and status transitions for this work item will appear here.
                  </p>
                </div>
              ) : (
                <div className="relative pl-6 space-y-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
                  {auditLogs.map((log) => {
                    const actionBadge =
                      log.action === 'create'
                        ? { bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', label: 'Created' }
                        : log.action === 'delete'
                        ? { bg: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Deleted' }
                        : log.action === 'restore'
                        ? { bg: 'bg-purple-500/20 text-purple-400 border-purple-500/30', label: 'Restored' }
                        : { bg: 'bg-sky-500/20 text-sky-400 border-sky-500/30', label: 'Updated' };

                    const changedKeys = Object.keys(log.changed_fields || {});

                    return (
                      <div key={log.id} className="relative">
                        {/* Timeline dot */}
                        <div className="absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full bg-slate-900 border-2 border-emerald-500" />

                        <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-semibold text-white">
                                {log.actor_name || 'User'}
                              </span>
                              <span
                                className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border ${actionBadge.bg}`}
                              >
                                {actionBadge.label}
                              </span>
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {new Date(log.created_at).toLocaleString(undefined, {
                                month: 'short',
                                day: 'numeric',
                                hour: '2-digit',
                                minute: '2-digit',
                              })}
                            </span>
                          </div>

                          {/* Field diffs */}
                          {changedKeys.length > 0 && (
                            <div className="space-y-1.5 pt-1 border-t border-slate-900">
                              {changedKeys.map((key) => {
                                const diff = log.changed_fields[key];
                                if (!diff) return null;

                                if (key === 'status') {
                                  const beforeDef = effectiveProjectSettings.statuses.find((s) => s.id === diff.before);
                                  const afterDef = effectiveProjectSettings.statuses.find((s) => s.id === diff.after);
                                  return (
                                    <div key={key} className="flex items-center space-x-2 text-xs">
                                      <span className="text-slate-500 capitalize">Status:</span>
                                      <span
                                        className="px-2 py-0.5 rounded text-[11px] font-medium"
                                        style={{ backgroundColor: `${beforeDef?.color || '#64748b'}25`, color: beforeDef?.color || '#cbd5e1' }}
                                      >
                                        {beforeDef?.label || diff.before || 'None'}
                                      </span>
                                      <ArrowRight className="w-3 h-3 text-slate-600" />
                                      <span
                                        className="px-2 py-0.5 rounded text-[11px] font-medium"
                                        style={{ backgroundColor: `${afterDef?.color || '#10b981'}25`, color: afterDef?.color || '#10b981' }}
                                      >
                                        {afterDef?.label || diff.after}
                                      </span>
                                    </div>
                                  );
                                }

                                if (key === 'assignee') {
                                  return (
                                    <div key={key} className="flex items-center space-x-2 text-xs text-slate-300">
                                      <span className="text-slate-500">Assignee:</span>
                                      <span className="font-mono text-slate-400">{diff.before || 'Unassigned'}</span>
                                      <ArrowRight className="w-3 h-3 text-slate-600" />
                                      <span className="font-mono text-emerald-400 font-semibold">{diff.after || 'Unassigned'}</span>
                                    </div>
                                  );
                                }

                                if (key === 'title') {
                                  return (
                                    <div key={key} className="text-xs text-slate-300">
                                      <span className="text-slate-500">Title:</span>{' '}
                                      <span className="line-through text-slate-500 mr-2">{String(diff.before || '')}</span>
                                      <span className="text-white">{String(diff.after || '')}</span>
                                    </div>
                                  );
                                }

                                return (
                                  <div key={key} className="flex items-center space-x-2 text-xs text-slate-400">
                                    <span className="capitalize">{key.replace(/_/g, ' ')}:</span>
                                    <span className="text-slate-300 truncate max-w-[240px]">
                                      {typeof diff.after === 'object' ? JSON.stringify(diff.after) : String(diff.after ?? '')}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ) : (
            <>
              {isLocked && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center space-x-2 animate-in fade-in ${
                    isReadOnly
                      ? 'bg-sky-950/70 border border-sky-800/60 text-sky-300'
                      : 'bg-purple-950/70 border border-purple-800/60 text-purple-300'
                  }`}
                >
                  <Lock className={`w-4 h-4 shrink-0 ${isReadOnly ? 'text-sky-400' : 'text-purple-400'}`} />
                  <span>
                    {isReadOnly
                      ? 'This workspace is currently in read-only guest mode. Sign in to edit items.'
                      : `This item was completed in closed sprint "${item?.metadata?.sprint}" and is immutable (read-only).`}
                  </span>
                </div>
              )}

              {saveError && (
                <div className="p-3 bg-red-950/70 border border-red-800/60 rounded-xl text-red-300 text-xs flex items-center space-x-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 shrink-0 text-red-400" />
                  <span>{saveError}</span>
                </div>
              )}

              {/* Title */}
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                  Title
                </label>
                <input
                  type="text"
                  value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3.5 py-2 text-sm bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500 transition-colors"
              placeholder="Work item title..."
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
              Description
            </label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-slate-200 focus:outline-none focus:border-emerald-500 leading-relaxed transition-colors"
              placeholder="Detailed description, context, or acceptance criteria..."
            />
          </div>

          {/* Core Properties Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Status */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
              >
                {effectiveProjectSettings.statuses.map((st: StatusDefinition) => (
                  <option key={st.id} value={st.id}>
                    {st.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Hierarchy Level / Type */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Hierarchy Level
              </label>
              <select
                value={itemType}
                onChange={(e) => {
                  setItemType(e.target.value);
                  // Reset parent if current parent doesn't match new allowed parents
                  const newCfg = effectiveProjectSettings.hierarchy.find((h) => h.type === e.target.value);
                  const allowed = newCfg?.allowed_parents || [];
                  const parentItem = allItems.find((i) => i.id === parentId);
                  if (parentItem && !allowed.includes(parentItem.item_type)) {
                    setParentId('');
                  }
                }}
                className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
              >
                {effectiveProjectSettings.hierarchy.map((h) => (
                  <option key={h.type} value={h.type}>
                    {h.label} (Level {h.level})
                  </option>
                ))}
              </select>
            </div>

            {/* Assignee */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                Assignee
              </label>
              <div className="relative">
                <select
                  value={assignee}
                  onChange={(e) => setAssignee(e.target.value)}
                  className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500"
                >
                  <option value="">Unassigned</option>
                  <option value={myDisplayName}>{myDisplayName}</option>
                  {memberNames
                    .filter((name) => name !== myDisplayName)
                    .map((name) => (
                      <option key={name} value={name}>
                        {name}
                      </option>
                    ))}
                </select>
              </div>
            </div>

            {/* External Ref ID */}
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">
                External Ref ID
              </label>
              <input
                type="text"
                value={externalRef}
                onChange={(e) => setExternalRef(e.target.value)}
                placeholder="e.g. TASK-101"
                className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
            </div>

            {/* Project (Reassignment with recursive cascade) */}
            {projects && projects.length > 0 && (
              <div className="space-y-1.5 sm:col-span-2">
                <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center justify-between">
                  <span>Project</span>
                  {selectedProjectId && selectedProjectId !== item?.project_id && (
                    <span className="text-[10px] text-amber-400 font-normal">
                      Reassigning project cascades to all child items
                    </span>
                  )}
                </label>
                <select
                  value={selectedProjectId}
                  onChange={(e) => setSelectedProjectId(e.target.value)}
                  data-testid="item-project-select"
                  className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.slug})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Parent Item */}
            <div className="space-y-1.5 sm:col-span-2">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>
                  Parent Item{' '}
                  {allowedParentTypes.length > 0 && (
                    <span className="text-slate-500 normal-case font-mono">
                      (Allowed: {allowedParentTypes.join(', ')})
                    </span>
                  )}
                </span>
                {isLoadingParents && (
                  <span className="text-[11px] text-emerald-400 flex items-center space-x-1 lowercase font-normal">
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>loading parents...</span>
                  </span>
                )}
              </label>
              <select
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
                disabled={isLoadingParents}
                className="w-full px-3.5 py-2 text-xs bg-slate-950 border border-slate-800 rounded-xl text-white focus:outline-none focus:border-emerald-500 disabled:opacity-60"
                data-testid="item-parent-select"
              >
                <option value="">None (Top Level)</option>
                {eligibleParents.map((p) => (
                  <option key={p.id} value={p.id}>
                    [{p.item_type}] {p.external_ref_id ? `(${p.external_ref_id}) ` : ''}
                    {p.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Metadata Section */}
          <div className="space-y-2 pt-2 border-t border-slate-800/80">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Tag className="w-3.5 h-3.5 text-slate-500" />
                <span>Custom Metadata Fields</span>
              </label>
              <button
                type="button"
                onClick={() => setShowAddMeta(!showAddMeta)}
                className="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center space-x-1 font-medium transition-colors"
              >
                <Plus className="w-3 h-3" />
                <span>Add Field</span>
              </button>
            </div>

            {/* Suggested Fields from Project Schema */}
            {effectiveProjectSettings.custom_fields && effectiveProjectSettings.custom_fields.length > 0 && (
              <div className="flex items-center flex-wrap gap-1.5 pt-1">
                <span className="text-[10px] text-slate-500 font-mono">Suggested fields:</span>
                {effectiveProjectSettings.custom_fields
                  .filter((f) => !(f in metadata))
                  .map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => handleUpdateMetaField(f, '')}
                      className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-emerald-400 transition-colors flex items-center space-x-1"
                      title={`Add ${f} field`}
                    >
                      <Plus className="w-2.5 h-2.5" />
                      <span>{f}</span>
                    </button>
                  ))}
              </div>
            )}

            {/* Editable Metadata Fields List */}
            <div className="space-y-2 pt-1">
              {Object.entries(metadata).length === 0 ? (
                <p className="text-xs text-slate-600 italic py-1">No custom metadata attributes defined.</p>
              ) : (
                Object.entries(metadata).map(([k, v]) => {
                  const draftVal =
                    metaDrafts[k] ??
                    (typeof v === 'object' && v !== null ? JSON.stringify(v, null, 2) : String(v ?? ''));
                  const isObjectOrArray = typeof v === 'object' && v !== null;
                  const isMultiline =
                    isObjectOrArray ||
                    (typeof v === 'string' && (v.includes('\n') || v.length > 60 || k === 'agent_prompt'));
                  const error = metaErrors[k];
                  const typeLabel = isObjectOrArray
                    ? Array.isArray(v)
                      ? 'array'
                      : 'object'
                    : typeof v;

                  return (
                    <div
                      key={k}
                      className={`flex flex-col sm:flex-row sm:items-start gap-2 p-2.5 rounded-xl bg-slate-950 border text-xs transition-colors ${
                        error ? 'border-red-500/60 bg-red-950/10' : 'border-slate-800 hover:border-slate-700/80'
                      }`}
                    >
                      <div className="flex items-center justify-between sm:w-36 shrink-0 pt-1">
                        <div className="flex flex-col min-w-0 pr-1">
                          <span className="font-mono text-slate-300 font-semibold truncate" title={k}>
                            {k}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">({typeLabel})</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveMetaField(k)}
                          className="sm:hidden text-slate-600 hover:text-red-400 transition-colors p-1"
                          title={`Remove ${k}`}
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      <div className="flex-1 flex flex-col space-y-1">
                        {typeof v === 'boolean' ? (
                          <select
                            value={String(v)}
                            onChange={(e) => handleUpdateMetaField(k, e.target.value)}
                            className="px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-emerald-300 font-mono focus:outline-none focus:border-emerald-500 cursor-pointer"
                          >
                            <option value="true">true</option>
                            <option value="false">false</option>
                          </select>
                        ) : isMultiline ? (
                          <textarea
                            rows={isObjectOrArray ? 4 : 3}
                            value={draftVal}
                            onChange={(e) => handleUpdateMetaField(k, e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-emerald-300 font-mono focus:outline-none focus:border-emerald-500 custom-scrollbar resize-y leading-relaxed"
                            placeholder={`Enter ${k}...`}
                          />
                        ) : (
                          <input
                            type={typeof v === 'number' ? 'number' : 'text'}
                            value={draftVal}
                            onChange={(e) => handleUpdateMetaField(k, e.target.value)}
                            className="w-full px-2.5 py-1.5 text-xs bg-slate-900 border border-slate-800 rounded-lg text-emerald-300 font-mono focus:outline-none focus:border-emerald-500"
                            placeholder={`Enter ${k}...`}
                          />
                        )}
                        {error && (
                          <span className="text-[11px] text-red-400 font-mono flex items-center space-x-1">
                            <span>⚠ {error}</span>
                          </span>
                        )}
                        {(isGitHubMetadataKey(k) && draftVal) && (
                          <div className="pt-0.5">
                            <GitHubBadge
                              type={k.toLowerCase().includes('commit') || k.toLowerCase() === 'sha' ? 'commit' : 'pr'}
                              value={draftVal}
                              prUrl={modalPrUrl}
                              repo={modalRepo}
                              owner={modalOwner}
                              compact
                            />
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemoveMetaField(k)}
                        className="hidden sm:inline-flex p-1.5 rounded text-slate-600 hover:text-red-400 hover:bg-slate-900 transition-colors shrink-0 mt-0.5"
                        title={`Remove ${k}`}
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })
              )}
            </div>

            {/* Add Field Inputs */}
            {showAddMeta && (
              <div className="flex items-center gap-2 p-2.5 rounded-xl bg-slate-950 border border-slate-800 animate-in fade-in">
                <input
                  type="text"
                  placeholder="Key (e.g. priority)"
                  value={newMetaKey}
                  onChange={(e) => setNewMetaKey(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500 w-36"
                />
                <input
                  type="text"
                  placeholder="Value (e.g. High)"
                  value={newMetaVal}
                  onChange={(e) => setNewMetaVal(e.target.value)}
                  className="px-2.5 py-1 text-xs bg-slate-900 border border-slate-800 rounded-lg text-white font-mono focus:outline-none focus:border-emerald-500 flex-1"
                />
                <button
                  type="button"
                  onClick={handleAddMetaField}
                  disabled={!newMetaKey.trim()}
                  className="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition-colors disabled:opacity-50"
                >
                  Add
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>

    {/* Modal Footer */}
    <div className="px-6 py-3.5 border-t border-slate-800 bg-slate-950/60 flex items-center justify-between gap-4">
      <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 sm:gap-3 text-[11px] text-slate-400 font-mono">
        {item?.created_at && (
          <span>
            Created: <span className="text-slate-300">{formatModalTimestamp(item.created_at)}</span>
          </span>
        )}
        {item?.updated_at && (
          <span>
            Updated: <span className="text-slate-300">{formatModalTimestamp(item.updated_at)}</span>
          </span>
        )}
      </div>
      <div className="flex items-center space-x-2.5 shrink-0">
        <button
          type="button"
          onClick={onClose}
          className="px-4 py-2 text-xs font-medium rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          Close
        </button>
        {activeTab === 'details' ? (
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving || !title.trim() || isLocked}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 flex items-center space-x-1.5 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving ? 'Saving...' : 'Save Changes'}</span>
          </button>
        ) : (
          <button
            type="button"
            onClick={() => setActiveTab('details')}
            className="px-4 py-2 text-xs font-semibold rounded-xl bg-slate-800 hover:bg-slate-700 text-white flex items-center space-x-1.5 transition-colors"
          >
            <span>Edit Details</span>
          </button>
        )}
      </div>
    </div>
      </div>

      {item && (
        <ConfirmDeleteModal
          isOpen={showConfirmDelete}
          itemTitle={item.title}
          itemRef={item.external_ref_id}
          onClose={() => setShowConfirmDelete(false)}
          onConfirm={handleDelete}
        />
      )}
    </div>
  );
}
