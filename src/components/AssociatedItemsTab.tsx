'use client';

import React, { useState, useMemo } from 'react';
import {
  Layers,
  GitFork,
  Plus,
  ArrowRight,
  User,
  Check,
  ChevronDown,
  ChevronRight,
  Link2,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { WorkItem, ProjectSettings, HierarchyLevel } from '@/types/tracker';
import { getHierarchyLevelColor } from '@/lib/hierarchy-colors';
import { CopyableRefId } from '@/components/CopyableRefId';
import { QuickAddPayload } from '@/components/QuickAddModal';

export interface AssociatedItemsTabProps {
  item: WorkItem;
  allItems: WorkItem[];
  projectSettings: ProjectSettings;
  workspaceMembers?: { full_name: string; email?: string }[];
  isReadOnly?: boolean;
  tenantSlug?: string;
  onSelectItem?: (item: WorkItem) => void;
  onCreateChildItem?: (payload: QuickAddPayload) => Promise<WorkItem | void>;
  onRefresh?: () => Promise<void> | void;
}

/**
 * Resolves the allowed child item types for a given parent item type
 * according to the project's hierarchy configuration.
 */
export function getAllowedChildTypes(
  parentType: string,
  hierarchy: HierarchyLevel[] = []
): string[] {
  if (!hierarchy || hierarchy.length === 0) {
    if (parentType === 'epic') return ['story'];
    if (parentType === 'story') return ['task'];
    if (parentType === 'task') return ['subtask'];
    return ['task', 'story', 'subtask'];
  }

  // 1. Explicit allowed_parents check
  const explicit = hierarchy
    .filter((h) => h.allowed_parents && h.allowed_parents.includes(parentType))
    .map((h) => h.type);
  if (explicit.length > 0) return explicit;

  // 2. Next numerical level check (e.g. Level 1 -> Level 2)
  const parentLevelDef = hierarchy.find((h) => h.type === parentType);
  if (parentLevelDef) {
    const nextLevels = hierarchy
      .filter((h) => h.level > parentLevelDef.level)
      .sort((a, b) => a.level - b.level);
    if (nextLevels.length > 0) {
      const immediateLevel = nextLevels[0].level;
      return nextLevels.filter((h) => h.level === immediateLevel).map((h) => h.type);
    }
  }

  // 3. Fallback defaults
  if (parentType === 'epic') return ['story'];
  if (parentType === 'story') return ['task'];
  if (parentType === 'task') return ['subtask'];

  return hierarchy.map((h) => h.type);
}

export function AssociatedItemsTab({
  item,
  allItems,
  projectSettings,
  workspaceMembers = [],
  isReadOnly = false,
  tenantSlug,
  onSelectItem,
  onCreateChildItem,
  onRefresh,
}: AssociatedItemsTabProps) {
  // Resolve parent item if parent_id exists
  const parentItem = useMemo(() => {
    if (!item.parent_id) return null;
    return allItems.find((it) => it.id === item.parent_id) || null;
  }, [item.parent_id, allItems]);

  // Resolve child items
  const childItems = useMemo(() => {
    return allItems.filter((it) => it.parent_id === item.id);
  }, [item.id, allItems]);

  // Allowed child types for the current item's type
  const allowedChildTypes = useMemo(() => {
    return getAllowedChildTypes(item.item_type, projectSettings.hierarchy);
  }, [item.item_type, projectSettings.hierarchy]);

  // Inline child creation state
  const [isCreatingChild, setIsCreatingChild] = useState(false);
  const [childTitle, setChildTitle] = useState('');
  const [childType, setChildType] = useState(() => allowedChildTypes[0] || 'task');
  const [childStatus, setChildStatus] = useState(() => projectSettings.statuses?.[0]?.id || 'backlog');
  const [childAssignee, setChildAssignee] = useState('');
  const [isSubmittingChild, setIsSubmittingChild] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);

  // Extensibility section toggle
  const [isRelatedExpanded, setIsRelatedExpanded] = useState(false);

  // Keep childType valid if allowed types change
  React.useEffect(() => {
    if (allowedChildTypes.length > 0 && !allowedChildTypes.includes(childType)) {
      setChildType(allowedChildTypes[0]);
    }
  }, [allowedChildTypes, childType]);

  const handleCreateChildSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!childTitle.trim()) return;

    setIsSubmittingChild(true);
    setCreationError(null);

    const payload: QuickAddPayload = {
      project_id: item.project_id,
      parent_id: item.id,
      title: childTitle.trim(),
      item_type: childType,
      status: childStatus,
      assignee: childAssignee || null,
      external_ref_id: null,
      metadata: {
        sprint: item.metadata?.sprint || undefined,
      },
    };

    try {
      if (onCreateChildItem) {
        await onCreateChildItem(payload);
      } else {
        const res = await fetch('/api/v1/items', {
          method: 'POST',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json',
            ...(tenantSlug ? { 'x-tenant-slug': tenantSlug } : {}),
          },
          body: JSON.stringify(payload),
        });
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.error || `Failed to create child item (${res.status})`);
        }
      }

      setChildTitle('');
      setIsCreatingChild(false);
      if (onRefresh) {
        await onRefresh();
      }
    } catch (err: any) {
      setCreationError(err.message || 'Failed to create child item');
    } finally {
      setIsSubmittingChild(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* ─── 1. Parent Work Item Section ───────────────────────────────────── */}
      <div className="space-y-2.5">
        <div className="flex items-center space-x-2">
          <GitFork className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Parent Work Item
          </span>
        </div>

        {parentItem ? (
          (() => {
            const parentColor = getHierarchyLevelColor(
              parentItem.item_type,
              projectSettings.hierarchy
            );
            const parentStatus = projectSettings.statuses?.find(
              (s) => s.id === parentItem.status
            );
            const parentPoints =
              parentItem.metadata?.story_points ??
              parentItem.metadata?.points ??
              parentItem.metadata?.estimate;

            return (
              <div
                data-testid="parent-item-card"
                onClick={() => onSelectItem?.(parentItem)}
                className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/60 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                title="Click to view parent item"
              >
                <div className="flex items-center space-x-3 min-w-0 flex-1">
                  <span
                    className={`text-[10px] uppercase font-mono font-semibold px-2 py-0.5 rounded border shrink-0 ${parentColor.badgeBg} ${parentColor.badgeText} ${parentColor.badgeBorder}`}
                  >
                    {parentItem.item_type}
                  </span>
                  {parentItem.external_ref_id && (
                    <CopyableRefId
                      id={parentItem.external_ref_id}
                      className="text-xs shrink-0"
                    />
                  )}
                  <span className="text-xs font-medium text-slate-200 group-hover:text-white truncate">
                    {parentItem.title}
                  </span>
                </div>

                <div className="flex items-center space-x-3 shrink-0">
                  {parentPoints !== undefined && parentPoints !== null && (
                    <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                      {parentPoints} pts
                    </span>
                  )}
                  {parentItem.assignee && (
                    <span className="text-xs text-slate-400 flex items-center space-x-1">
                      <User className="w-3 h-3 text-slate-500" />
                      <span className="truncate max-w-[100px]">{parentItem.assignee}</span>
                    </span>
                  )}
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                    {parentStatus?.label || parentItem.status}
                  </span>
                  <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-emerald-400 transition-colors" />
                </div>
              </div>
            );
          })()
        ) : item.parent_id ? (
          <div
            data-testid="parent-item-card"
            className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-400 flex items-center justify-between"
          >
            <div className="flex items-center space-x-2">
              <span className="text-amber-400">Parent Ref ID:</span>
              <span className="font-mono text-slate-300">{item.parent_id}</span>
            </div>
            <span className="text-[11px] text-slate-500">(Item outside current view)</span>
          </div>
        ) : (
          <div
            data-testid="parent-item-none"
            className="p-3.5 rounded-xl border border-dashed border-slate-800 bg-slate-950/40 text-slate-400 text-xs flex items-center space-x-2.5"
          >
            <GitFork className="w-4 h-4 text-slate-600 shrink-0" />
            <span className="font-medium text-slate-300">None (Top Level)</span>
            <span className="text-slate-500 text-[11px] hidden sm:inline">
              — This item has no parent and resides at the top of the hierarchy.
            </span>
          </div>
        )}
      </div>

      {/* ─── 2. Child Work Items Section ───────────────────────────────────── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Layers className="w-4 h-4 text-emerald-400" />
            <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Child Work Items
            </span>
            <span
              className="px-2 py-0.5 text-xs font-mono rounded-full bg-slate-800 text-slate-300"
              data-testid="child-items-count"
            >
              {childItems.length}
            </span>
          </div>

          {!isReadOnly && !isCreatingChild && (
            <button
              type="button"
              onClick={() => setIsCreatingChild(true)}
              className="px-2.5 py-1 text-xs font-medium rounded-lg bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center space-x-1 transition-colors cursor-pointer"
              data-testid="add-child-item-btn"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Child Item</span>
            </button>
          )}
        </div>

        {/* Inline Child Creation Form */}
        {isCreatingChild && (
          <form
            onSubmit={handleCreateChildSubmit}
            className="p-4 rounded-xl border border-emerald-500/30 bg-slate-900/90 space-y-3 shadow-lg"
            data-testid="add-child-form"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="text-xs font-semibold text-emerald-400 flex items-center space-x-1.5">
                <Plus className="w-3.5 h-3.5" />
                <span>New Child Item for {item.external_ref_id || item.title}</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  setIsCreatingChild(false);
                  setCreationError(null);
                }}
                className="text-slate-400 hover:text-slate-200 text-xs cursor-pointer"
                data-testid="cancel-child-btn"
              >
                Cancel
              </button>
            </div>

            {creationError && (
              <div className="p-2 rounded bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center space-x-2">
                <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                <span>{creationError}</span>
              </div>
            )}

            <div>
              <label className="block text-[11px] font-medium text-slate-400 mb-1">
                Title <span className="text-rose-400">*</span>
              </label>
              <input
                type="text"
                value={childTitle}
                onChange={(e) => setChildTitle(e.target.value)}
                placeholder="Enter child work item title..."
                required
                autoFocus
                data-testid="child-title-input"
                className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-slate-200 focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Item Type</label>
                <select
                  value={childType}
                  onChange={(e) => setChildType(e.target.value)}
                  data-testid="child-type-select"
                  className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer capitalize"
                >
                  {allowedChildTypes.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Status</label>
                <select
                  value={childStatus}
                  onChange={(e) => setChildStatus(e.target.value)}
                  data-testid="child-status-select"
                  className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  {(projectSettings.statuses || []).map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-slate-400 mb-1">Assignee</label>
                <select
                  value={childAssignee}
                  onChange={(e) => setChildAssignee(e.target.value)}
                  data-testid="child-assignee-select"
                  className="w-full text-xs bg-slate-950 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer"
                >
                  <option value="">Unassigned</option>
                  {workspaceMembers.map((m) => (
                    <option key={m.full_name} value={m.full_name}>
                      {m.full_name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center justify-end space-x-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setIsCreatingChild(false);
                  setCreationError(null);
                }}
                className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmittingChild || !childTitle.trim()}
                className="px-3.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white transition-colors flex items-center space-x-1.5 cursor-pointer"
                data-testid="submit-child-btn"
              >
                {isSubmittingChild ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Creating...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Create Child</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}

        {/* Child Items List or Empty State */}
        {childItems.length === 0 ? (
          <div
            className="p-8 text-center border border-dashed border-slate-800 rounded-xl space-y-2"
            data-testid="no-child-items"
          >
            <Layers className="w-8 h-8 text-slate-600 mx-auto" />
            <p className="text-xs text-slate-400 font-medium">No child items found</p>
            <p className="text-[11px] text-slate-500">
              Tasks, stories, or sub-items can be linked to this item by creating a child item above or selecting this item as their parent.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {childItems.map((child) => {
              const childColor = getHierarchyLevelColor(
                child.item_type,
                projectSettings.hierarchy
              );
              const childStatus = projectSettings.statuses?.find(
                (s) => s.id === child.status
              );
              const childPoints =
                child.metadata?.story_points ??
                child.metadata?.points ??
                child.metadata?.estimate;

              return (
                <div
                  key={child.id}
                  onClick={() => onSelectItem?.(child)}
                  data-testid={`child-item-row-${child.id}`}
                  className="p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 hover:bg-slate-900/60 transition-colors flex items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="flex items-center space-x-3 min-w-0 flex-1">
                    <span
                      className={`text-[10px] uppercase font-mono font-semibold px-2 py-0.5 rounded border shrink-0 ${childColor.badgeBg} ${childColor.badgeText} ${childColor.badgeBorder}`}
                    >
                      {child.item_type}
                    </span>
                    {child.external_ref_id && (
                      <CopyableRefId
                        id={child.external_ref_id}
                        className="text-xs shrink-0"
                      />
                    )}
                    <span className="text-xs font-medium text-slate-200 group-hover:text-white truncate">
                      {child.title}
                    </span>
                  </div>

                  <div className="flex items-center space-x-3 shrink-0">
                    {childPoints !== undefined && childPoints !== null && (
                      <span className="text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800/40 px-1.5 py-0.5 rounded">
                        {childPoints} pts
                      </span>
                    )}
                    {child.assignee && (
                      <span className="text-xs text-slate-400 flex items-center space-x-1">
                        <User className="w-3 h-3 text-slate-500" />
                        <span className="truncate max-w-[100px]">{child.assignee}</span>
                      </span>
                    )}
                    <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300">
                      {childStatus?.label || child.status}
                    </span>
                    <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-emerald-400 transition-colors" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── 3. Future Extensibility: Collapsible Related Items / References ── */}
      <div className="pt-2 border-t border-slate-800/80" data-testid="related-items-section">
        <button
          type="button"
          onClick={() => setIsRelatedExpanded((prev) => !prev)}
          className="flex items-center justify-between w-full text-xs font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200 transition-colors py-1 cursor-pointer"
          data-testid="related-items-toggle"
        >
          <div className="flex items-center space-x-2">
            <Link2 className="w-4 h-4 text-slate-500" />
            <span>Related Items &amp; References</span>
            <span className="text-[10px] lowercase font-normal px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400">
              extensible
            </span>
          </div>
          {isRelatedExpanded ? (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500" />
          )}
        </button>

        {isRelatedExpanded && (
          <div className="mt-2.5 p-4 rounded-xl border border-slate-800 bg-slate-950/40 space-y-2.5">
            <p className="text-xs text-slate-400">
              Cross-item dependencies, blockers, and external references can be linked here.
            </p>
            <div className="flex items-center space-x-2">
              <input
                type="text"
                disabled
                placeholder="Enter item ID or reference (e.g. TASK-102)..."
                className="flex-1 text-xs bg-slate-900 border border-slate-800 rounded-lg px-3 py-1.5 text-slate-500 cursor-not-allowed"
                data-testid="related-item-input"
              />
              <button
                type="button"
                disabled
                title="Cross-item linking will be enabled in a future release"
                className="px-3 py-1.5 text-xs rounded-lg border border-slate-800 text-slate-500 cursor-not-allowed bg-slate-900"
                data-testid="link-related-item-btn"
              >
                + Link
              </button>
            </div>
            <p className="text-[11px] text-slate-500 italic">
              Direct cross-item relationships will be enabled in upcoming releases.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
