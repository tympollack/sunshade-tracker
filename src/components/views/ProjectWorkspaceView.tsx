'use client';

import React, { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, XCircle } from 'lucide-react';

import { WorkItem, WorkItemNode, ProjectSettings, StatusDefinition, HierarchyLevel, SprintDefinition } from '@/types/tracker';
import { buildTree, isDescendantOf, getDescendantIds, isEffectivelyUnparented } from '@/lib/tree';
import { calculateOrderIndex, validateHierarchyNesting, DEFAULT_ORDER_STEP } from '@/lib/fractional-index';
import { getHierarchyLevelColor, getDefaultLevelHex } from '@/lib/hierarchy-colors';
import { ProjectHeader } from '@/components/board/ProjectHeader';
import { BoardViewContainer } from '@/components/views/BoardViewContainer';
import { TreeViewContainer } from '@/components/views/TreeViewContainer';
import { SprintViewContainer } from '@/components/views/SprintViewContainer';
import { SparkViewContainer } from '@/components/views/SparkViewContainer';
import { SchemaViewContainer } from '@/components/views/SchemaViewContainer';
import { ProjectModals } from '@/components/board/ProjectModals';
import { QuickAddPayload } from '@/components/QuickAddModal';
import { BulkActionsToolbar } from '@/components/BulkActionsToolbar';
import { MobileBottomNav } from '@/components/MobileBottomNav';
import { useTabUrlSync } from '@/components/rev_trk_02';
import { detectSchemaDeviations, SchemaDeviation } from '@/lib/schema-deviation';
import {
  sortSprintNames,
  isItemImmutableDueToCompletedSprint,
} from '@/lib/sprint-utils';
import { mergeProjectSettings, getItemProjectSettings as getEffectiveItemProjectSettings } from '@/lib/portfolio-merge';
import { bulkReassignProjects, reassignWorkItemProject } from '@/app/actions/trackerActions';

interface ProjectWorkspaceViewProps {
  tenantSlug: string;
  projectSlug: string;
  searchParams?: { [key: string]: string | string[] | undefined };
}

interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  tier: string;
  api_key_preview: string | null;
  role?: string;
}

interface ProjectInfo {
  id: string;
  slug: string;
  name: string;
  settings?: ProjectSettings;
}

export function ProjectWorkspaceView(props: ProjectWorkspaceViewProps) {
  const router = useRouter();
  const { tenantSlug, projectSlug, searchParams = {} } = props;
  const requestedSprint = typeof searchParams?.sprint === 'string' ? searchParams.sprint : null;
  const { activeTab, handleTabChange, setActiveTab } = useTabUrlSync({
    initialTab: typeof searchParams?.tab === 'string' ? searchParams.tab : null,
  });

  const [selectedSprint, setSelectedSprint] = useState<string>('all');
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<WorkItem | null>(null);
  const [items, setItems] = useState<WorkItem[]>([]);

  // Tree View Filtering & Sorting States
  const [treeSelectedStatuses, setTreeSelectedStatuses] = useState<string[] | null>(null);
  const [treeSelectedLevels, setTreeSelectedLevels] = useState<string[] | null>(null);
  const [treeSelectedAssignees, setTreeSelectedAssignees] = useState<string[] | null>(null);
  const [treeSortBy, setTreeSortBy] = useState<string>('order_index');

  // Sprint Planning View Filtering & Sorting States
  const [sprintSelectedStatuses, setSprintSelectedStatuses] = useState<string[] | null>(null);
  const [sprintSelectedLevels, setSprintSelectedLevels] = useState<string[] | null>(null);
  const [sprintSortBy, setSprintSortBy] = useState<string>('order_index');
  const [activeSprintPopover, setActiveSprintPopover] = useState<string | null>(null);

  const treeSortComparator = useMemo(() => {
    return (a: WorkItem, b: WorkItem): number => {
      if (treeSortBy === 'points_desc') {
        const pA = Number(a.metadata?.story_points ?? a.metadata?.points ?? a.metadata?.estimate ?? 0) || 0;
        const pB = Number(b.metadata?.story_points ?? b.metadata?.points ?? b.metadata?.estimate ?? 0) || 0;
        if (pB !== pA) return pB - pA;
      } else if (treeSortBy === 'points_asc') {
        const pA = Number(a.metadata?.story_points ?? a.metadata?.points ?? a.metadata?.estimate ?? 0) || 0;
        const pB = Number(b.metadata?.story_points ?? b.metadata?.points ?? b.metadata?.estimate ?? 0) || 0;
        if (pA !== pB) return pA - pB;
      } else if (treeSortBy === 'title_asc') {
        const cmp = (a.title || '').localeCompare(b.title || '');
        if (cmp !== 0) return cmp;
      } else if (treeSortBy === 'title_desc') {
        const cmp = (b.title || '').localeCompare(a.title || '');
        if (cmp !== 0) return cmp;
      }
      return (a.order_index ?? 0) - (b.order_index ?? 0);
    };
  }, [treeSortBy]);

  const sprintComparator = useMemo(() => {
    return (a: WorkItem, b: WorkItem): number => {
      if (sprintSortBy === 'points_desc') {
        const pA = Number(a.metadata?.story_points ?? a.metadata?.points ?? a.metadata?.estimate ?? 0) || 0;
        const pB = Number(b.metadata?.story_points ?? b.metadata?.points ?? b.metadata?.estimate ?? 0) || 0;
        if (pB !== pA) return pB - pA;
      } else if (sprintSortBy === 'points_asc') {
        const pA = Number(a.metadata?.story_points ?? a.metadata?.points ?? a.metadata?.estimate ?? 0) || 0;
        const pB = Number(b.metadata?.story_points ?? b.metadata?.points ?? b.metadata?.estimate ?? 0) || 0;
        if (pA !== pB) return pA - pB;
      } else if (sprintSortBy === 'title_asc') {
        const cmp = (a.title || '').localeCompare(b.title || '');
        if (cmp !== 0) return cmp;
      } else if (sprintSortBy === 'title_desc') {
        const cmp = (b.title || '').localeCompare(a.title || '');
        if (cmp !== 0) return cmp;
      }
      return (a.order_index ?? 0) - (b.order_index ?? 0);
    };
  }, [sprintSortBy]);

  // Interactive Hierarchy Tree states
  const [collapsedTreeNodes, setCollapsedTreeNodes] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem(`tracker_collapsed_tree_nodes_${projectSlug}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const stored = localStorage.getItem(`tracker_collapsed_tree_nodes_${projectSlug}`);
      setCollapsedTreeNodes(stored ? new Set(JSON.parse(stored)) : new Set());
    } catch {
      setCollapsedTreeNodes(new Set());
    }
  }, [projectSlug]);

  const [treeDraggedItemId, setTreeDraggedItemId] = useState<string | null>(null);
  const [isTreeRootOver, setIsTreeRootOver] = useState(false);

  const handleToggleCollapseTreeNode = (nodeId: string) => {
    setCollapsedTreeNodes((prev) => {
      const next = new Set(prev);
      if (next.has(nodeId)) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      try {
        localStorage.setItem(
          `tracker_collapsed_tree_nodes_${projectSlug}`,
          JSON.stringify(Array.from(next))
        );
      } catch {}
      return next;
    });
  };

  const handleExpandAllTreeNodes = () => {
    setCollapsedTreeNodes(new Set());
    try {
      localStorage.removeItem(`tracker_collapsed_tree_nodes_${projectSlug}`);
    } catch {}
  };

  const handleCollapseAllTreeNodes = () => {
    const parentIds = new Set<string>();
    const collectParents = (nodes: WorkItemNode[]) => {
      for (const n of nodes) {
        if (n.children && n.children.length > 0) {
          parentIds.add(n.id);
          collectParents(n.children);
        }
      }
    };
    collectParents(treeItems);
    setCollapsedTreeNodes(parentIds);
    try {
      localStorage.setItem(
        `tracker_collapsed_tree_nodes_${projectSlug}`,
        JSON.stringify(Array.from(parentIds))
      );
    } catch {}
  };

  // Sprint View Mode: 'flat' or 'tree'
  const [sprintViewMode, setSprintViewMode] = useState<'flat' | 'tree'>('flat');

  // Multi-Selection State for Bulk Actions
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const lastSelectedIdRef = useRef<string | null>(null);

  // Sprint Swimlane Collapse State
  const [collapsedSprints, setCollapsedSprints] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set();
    try {
      const stored = localStorage.getItem(`tracker_collapsed_sprints_${projectSlug}`);
      return stored ? new Set(JSON.parse(stored)) : new Set();
    } catch {
      return new Set();
    }
  });

  const [hideCompletedSprints, setHideCompletedSprints] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      const stored = localStorage.getItem(`tracker_hide_completed_sprints_${projectSlug}`);
      return stored === 'true';
    } catch {
      return false;
    }
  });

  const handleToggleHideCompletedSprints = () => {
    setHideCompletedSprints((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(`tracker_hide_completed_sprints_${projectSlug}`, String(next));
      } catch {}
      return next;
    });
  };

  // Point Mode: 'macro' vs 'granular'
  const [pointMode, setPointMode] = useState<'macro' | 'granular'>('macro');

  useEffect(() => {
    try {
      const stored = localStorage.getItem('tracker_point_mode');
      if (stored === 'macro' || stored === 'granular') {
        setPointMode(stored);
      }
    } catch {}
  }, []);

  const handlePointModeChange = (mode: 'macro' | 'granular') => {
    setPointMode(mode);
    try {
      localStorage.setItem('tracker_point_mode', mode);
    } catch {}
  };

  // Clear selection on tab change or project switch
  useEffect(() => {
    setSelectedItemIds(new Set());
    lastSelectedIdRef.current = null;
  }, [activeTab, projectSlug]);

  const [isBulkApplying, setIsBulkApplying] = useState(false);
  const [bulkToast, setBulkToast] = useState<string | null>(null);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({
    schema_version: '1.0',
    hierarchy: [
      { type: 'project', label: 'Project', level: 1, allowed_parents: [], color: '#c084fc' },
      { type: 'epic', label: 'Epic', level: 2, allowed_parents: ['project'], color: '#38bdf8' },
      { type: 'story', label: 'Story', level: 3, allowed_parents: ['epic'], color: '#34d399' },
      { type: 'task', label: 'Task', level: 4, allowed_parents: ['story', 'epic'], color: '#fbbf24' },
    ],
    statuses: [
      { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
      { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      { id: 'planned', label: 'Planned', color: '#a855f7', order: 3 },
      { id: 'complete', label: 'Complete', color: '#22c55e', order: 4 },
    ],
    custom_fields: ['priority', 'complexity', 'timeline', 'commit_hash', 'source_type'],
  });
  const [isSavingSchema, setIsSavingSchema] = useState(false);

  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [allProjects, setAllProjects] = useState<ProjectInfo[]>([]);
  const isOverviewSlug = projectSlug === 'all' || projectSlug === 'portfolio';
  const hasMatchingProject = useMemo(
    () => allProjects.some((p) => p.slug === projectSlug),
    [allProjects, projectSlug]
  );
  const isAllProjects = isOverviewSlug && !hasMatchingProject;
  const [allWorkspaces, setAllWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Spark Ingestion state
  const [sparkPayload, setSparkPayload] = useState<string>(
    JSON.stringify(
      {
        project_slug: projectSlug,
        items: [
          {
            external_ref_id: 'SPEC-HUB-11',
            title: 'Deploy Sovereign Event Bus to PatchWork',
            description: 'Auto-generate maintenance tasks from citizen reports.',
            item_type: 'story',
            status: 'in_progress',
            assignee: 'tympollack',
            metadata: { complexity: 3, priority: 'High', origin_agent: 'Gemini Spark' },
          },
          {
            external_ref_id: 'TASK-HUB-11-A',
            parent_ref_id: 'SPEC-HUB-11',
            title: 'Implement POST /api/events Webhook Route',
            item_type: 'task',
            status: 'planned',
            metadata: { complexity: 1 },
          },
        ],
      },
      null,
      2
    )
  );
  const [ingestResponse, setIngestResponse] = useState<any>(null);
  const [isIngesting, setIsIngesting] = useState(false);

  // Spark Ingestion Overrides
  const [sparkOverrideProject, setSparkOverrideProject] = useState<string>('');
  const [sparkOverrideSprint, setSparkOverrideSprint] = useState<string>('');
  const [sparkOverrideAssignee, setSparkOverrideAssignee] = useState<string>('');

  // Quick Add modal state
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [quickAddInitialStatus, setQuickAddInitialStatus] = useState<string | undefined>(undefined);
  const [quickAddInitialSprint, setQuickAddInitialSprint] = useState<string | undefined>(undefined);
  const [quickAddParentItem, setQuickAddParentItem] = useState<WorkItem | null>(null);
  const [selectedSchemaProjectSlug, setSelectedSchemaProjectSlug] = useState('');

  // User & Workspace Members
  const [currentUser, setCurrentUser] = useState<{ id?: string; email?: string; full_name?: string } | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<{ user_id: string; full_name: string; email?: string }[]>([]);

  // Project Archive state
  const [isArchiveModalOpen, setIsArchiveModalOpen] = useState(false);

  // Read-only guest mode
  const isReadOnly = !loading && (currentUser === null || tenantInfo?.role === 'viewer');

  const handleArchiveCurrentProject = async () => {
    const proj = allProjects.find((p) => p.slug === projectSlug);
    if (!proj || isAllProjects) return;
    try {
      const res = await apiFetch('/api/v1/projects', {
        method: 'DELETE',
        body: JSON.stringify({ id: proj.id }),
      });
      if (res.ok) {
        setIsArchiveModalOpen(false);
        router.push(`/${tenantSlug}/portfolio`);
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to archive project.');
      }
    } catch (err: any) {
      alert(err.message || 'Error communicating with server.');
    }
  };

  // Board View Controls
  const [boardHeight, setBoardHeight] = useState<'compact' | 'standard' | 'full'>('standard');
  const [collapsedSideways, setCollapsedSideways] = useState<Set<string>>(new Set());
  const [collapsedUp, setCollapsedUp] = useState<Set<string>>(new Set());
  const boardScrollRef = useRef<HTMLDivElement | null>(null);

  // Cascade & Confirmation Modal States
  const [cascadeCompletionState, setCascadeCompletionState] = useState<{
    parentItem: WorkItem;
    unfinishedChildren: WorkItem[];
    targetStatus: string;
    targetStatusLabel: string;
    prevOrder?: number;
    nextOrder?: number;
  } | null>(null);

  const [cascadePromptState, setCascadePromptState] = useState<{
    type: 'advance_children_to_in_progress' | 'advance_parent_to_complete';
    targetItem: WorkItem;
    relatedItems: WorkItem[];
    targetStatus: string;
    prevOrder?: number;
    nextOrder?: number;
  } | null>(null);

  // Filter States
  const [selectedStatuses, setSelectedStatuses] = useState<string[] | null>(null);
  const [selectedLevels, setSelectedLevels] = useState<string[] | null>(null);

  const effectiveSelectedStatuses = useMemo(() => {
    if (selectedStatuses !== null) return selectedStatuses;
    return projectSettings.statuses.map((s) => s.id);
  }, [selectedStatuses, projectSettings.statuses]);

  const effectiveSelectedLevels = useMemo(() => {
    if (selectedLevels !== null) return selectedLevels;
    return projectSettings.hierarchy.map((h) => h.type);
  }, [selectedLevels, projectSettings.hierarchy]);

  // Tree and Sprint Planning Multi-Select Effective Filters
  const effectiveTreeStatuses = useMemo(() => {
    if (treeSelectedStatuses !== null) return treeSelectedStatuses;
    return projectSettings.statuses.map((s) => s.id);
  }, [treeSelectedStatuses, projectSettings.statuses]);

  const effectiveTreeLevels = useMemo(() => {
    if (treeSelectedLevels !== null) return treeSelectedLevels;
    return projectSettings.hierarchy.map((h) => h.type);
  }, [treeSelectedLevels, projectSettings.hierarchy]);

  const effectiveSprintStatuses = useMemo(() => {
    if (sprintSelectedStatuses !== null) return sprintSelectedStatuses;
    return projectSettings.statuses.map((s) => s.id);
  }, [sprintSelectedStatuses, projectSettings.statuses]);

  const effectiveSprintLevels = useMemo(() => {
    if (sprintSelectedLevels !== null) return sprintSelectedLevels;
    return projectSettings.hierarchy.map((h) => h.type);
  }, [sprintSelectedLevels, projectSettings.hierarchy]);

  // Tree items filtered by selectedSprint, status, level, and assignee
  const treeFilteredItems = useMemo(() => {
    let res = items;
    if (selectedSprint !== 'all') {
      if (selectedSprint === '__none__') {
        res = res.filter((it) => !it.metadata?.sprint);
      } else {
        res = res.filter((it) => it.metadata?.sprint === selectedSprint);
      }
    }
    if (treeSelectedStatuses !== null) {
      res = res.filter((it) => effectiveTreeStatuses.includes(it.status));
    }
    if (treeSelectedLevels !== null) {
      res = res.filter((it) => effectiveTreeLevels.includes(it.item_type));
    }
    if (treeSelectedAssignees !== null) {
      res = res.filter((it) => {
        if (!it.assignee) return treeSelectedAssignees.includes('__unassigned__');
        return treeSelectedAssignees.includes(it.assignee);
      });
    }
    return res;
  }, [items, selectedSprint, treeSelectedStatuses, effectiveTreeStatuses, treeSelectedLevels, effectiveTreeLevels, treeSelectedAssignees]);

  const treeItems = useMemo(
    () => buildTree(treeFilteredItems, null, 0, new Set(), treeSortComparator),
    [treeFilteredItems, treeSortComparator]
  );
  const allTreeItems = useMemo(() => buildTree(items), [items]);

  const filterSprintItems = useCallback(
    (itemsList: WorkItem[]) => {
      let res = itemsList;
      if (sprintSelectedStatuses !== null) {
        res = res.filter((it) => effectiveSprintStatuses.includes(it.status));
      }
      if (sprintSelectedLevels !== null) {
        res = res.filter((it) => effectiveSprintLevels.includes(it.item_type));
      }
      return [...res].sort(sprintComparator);
    },
    [sprintSelectedStatuses, effectiveSprintStatuses, sprintSelectedLevels, effectiveSprintLevels, sprintComparator]
  );

  // Detect schema deviations
  const deviations = useMemo(() => {
    return detectSchemaDeviations(items, projectSettings, allProjects, isAllProjects);
  }, [items, projectSettings, allProjects, isAllProjects]);

  const [isReconciliationModalOpen, setIsReconciliationModalOpen] = useState(false);
  const [dismissedBoardDeviationBanner, setDismissedBoardDeviationBanner] = useState(false);
  const [focusedDeviationId, setFocusedDeviationId] = useState<string | null>(null);
  const [lastIngestedItemIds, setLastIngestedItemIds] = useState<string[] | null>(null);

  // Identify items hidden from Kanban board columns
  const hiddenBoardItems = useMemo(() => {
    const unmappedItemIds = new Set(
      deviations
        .filter((d) => d.deviationType === 'unmapped_level' || d.deviationType === 'unmapped_status')
        .map((d) => d.itemId)
    );
    return items.filter((it) => unmappedItemIds.has(it.id));
  }, [items, deviations]);

  const ingestedAffectedItemCount = useMemo(() => {
    if (!lastIngestedItemIds || lastIngestedItemIds.length === 0) return 0;
    const ingestedIdSet = new Set(lastIngestedItemIds);
    const affectedItemIds = new Set(
      deviations.filter((d) => ingestedIdSet.has(d.itemId)).map((d) => d.itemId)
    );
    return affectedItemIds.size;
  }, [lastIngestedItemIds, deviations]);

  // Derive all available sprints
  const availableSprints = useMemo(() => {
    const set = new Set<string>();
    (projectSettings.sprint_settings?.sprints || []).forEach((s: any) => {
      if (s.name && s.status !== 'unplanned' && s.name.toLowerCase() !== 'unplanned') {
        set.add(s.name);
      }
    });
    items.forEach((it) => {
      if (it.metadata?.sprint) {
        const s = String(it.metadata.sprint).trim();
        if (s && s.toLowerCase() !== 'unplanned' && s !== '__none__') {
          set.add(s);
        }
      }
    });
    return sortSprintNames(Array.from(set), projectSettings.sprint_settings?.sprints);
  }, [items, projectSettings.sprint_settings]);

  const hiddenCompletedSprintsCount = useMemo(() => {
    return availableSprints.filter((sprintName) => {
      const sprintDef = projectSettings.sprint_settings?.sprints?.find(
        (s: any) => s.name === sprintName || s.id === sprintName
      );
      return sprintDef?.status?.toLowerCase() === 'completed';
    }).length;
  }, [availableSprints, projectSettings.sprint_settings]);

  const visibleSprints = useMemo(() => {
    if (!hideCompletedSprints) return availableSprints;
    return availableSprints.filter((sprintName) => {
      const sprintDef = projectSettings.sprint_settings?.sprints?.find(
        (s: any) => s.name === sprintName || s.id === sprintName
      );
      return sprintDef?.status?.toLowerCase() !== 'completed';
    });
  }, [availableSprints, hideCompletedSprints, projectSettings.sprint_settings]);

  const [loadedProjectSlug, setLoadedProjectSlug] = useState<string | null>(null);
  const lastSprintInitializedProjectRef = useRef<string | null>(null);

  useEffect(() => {
    if (loadedProjectSlug !== projectSlug) return;
    if (lastSprintInitializedProjectRef.current === projectSlug) return;
    if (requestedSprint && (requestedSprint === 'all' || requestedSprint === '__none__' || availableSprints.includes(requestedSprint))) {
      setSelectedSprint(requestedSprint);
      lastSprintInitializedProjectRef.current = projectSlug;
      return;
    }
    if (projectSettings.sprint_settings?.default_sprint) {
      const def = projectSettings.sprint_settings.default_sprint;
      if (def === 'all') {
        setSelectedSprint('all');
        lastSprintInitializedProjectRef.current = projectSlug;
      } else if (def === 'current') {
        const curr = projectSettings.sprint_settings.sprints?.find((s: any) => s.is_current)?.name;
        if (curr) {
          setSelectedSprint(curr);
          lastSprintInitializedProjectRef.current = projectSlug;
        } else if (availableSprints.length > 0) {
          setSelectedSprint(availableSprints[0]);
          lastSprintInitializedProjectRef.current = projectSlug;
        }
      } else if (availableSprints.includes(def)) {
        setSelectedSprint(def);
        lastSprintInitializedProjectRef.current = projectSlug;
      }
    }
  }, [projectSlug, loadedProjectSlug, projectSettings.sprint_settings, availableSprints, requestedSprint]);

  useEffect(() => {
    setSelectedStatuses(null);
    setSelectedLevels(null);
    setTreeSelectedStatuses(null);
    setTreeSelectedLevels(null);
    setSprintSelectedStatuses(null);
    setSprintSelectedLevels(null);
    setSelectedSprint('all');
    setLoadedProjectSlug(null);
    setDismissedBoardDeviationBanner(false);
    lastSprintInitializedProjectRef.current = null;
  }, [projectSlug]);

  // Drag & Drop
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ colId: string; index: number } | null>(null);

  // Edit Modal
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);

  const deepLinkedItemId = typeof searchParams?.item === 'string' ? searchParams.item : null;
  const deepLinkHandledRef = useRef<string | null>(null);
  useEffect(() => {
    if (deepLinkedItemId && deepLinkHandledRef.current !== deepLinkedItemId) {
      const matched = items.find(
        (it) => it.id === deepLinkedItemId || it.external_ref_id === deepLinkedItemId
      );
      if (matched) {
        deepLinkHandledRef.current = deepLinkedItemId;
        setEditingItem(matched);
      } else if (items.length > 0) {
        fetch(`/api/v1/items/bulk?ids=${encodeURIComponent(deepLinkedItemId)}`, {
          headers: { 'x-tenant-slug': tenantSlug },
        })
          .then((res) => res.json())
          .then((data) => {
            if (data.items && data.items.length > 0) {
              deepLinkHandledRef.current = deepLinkedItemId;
              setEditingItem(data.items[0]);
            }
          })
          .catch(() => {});
      }
    }
  }, [deepLinkedItemId, items, tenantSlug]);

  const modalProjectSettings = useMemo(() => {
    if (!editingItem) return projectSettings;
    const proj = allProjects.find(
      (p) => p.id === editingItem.project_id || p.slug === editingItem.project_id
    );
    if (proj && proj.settings) {
      return {
        ...proj.settings,
        hierarchy: (proj.settings.hierarchy || []).map((h: any) => ({
          ...h,
          color: h.color || getDefaultLevelHex(h.level),
        })),
      };
    }
    return projectSettings;
  }, [editingItem, allProjects, projectSettings]);

  const getItemProjectSettings = useCallback((item: WorkItem | null | undefined): ProjectSettings => {
    return getEffectiveItemProjectSettings(item, allProjects, projectSettings, isAllProjects);
  }, [isAllProjects, allProjects, projectSettings]);

  const getItemHierarchy = useCallback((item: WorkItem): HierarchyLevel[] => {
    return getItemProjectSettings(item).hierarchy || projectSettings.hierarchy;
  }, [getItemProjectSettings, projectSettings.hierarchy]);

  const getItemStatuses = useCallback((item: WorkItem): StatusDefinition[] => {
    return getItemProjectSettings(item).statuses || projectSettings.statuses;
  }, [getItemProjectSettings, projectSettings.statuses]);

  const activeSchemaSettings = useMemo(() => {
    if (isAllProjects) {
      const p = allProjects.find(
        (proj) => proj.slug === (selectedSchemaProjectSlug || allProjects[0]?.slug)
      );
      if (p && p.settings) {
        return {
          ...p.settings,
          hierarchy: (p.settings.hierarchy || []).map((h: any) => ({
            ...h,
            color: h.color || getDefaultLevelHex(h.level),
          })),
        };
      }
    }
    return projectSettings;
  }, [isAllProjects, allProjects, selectedSchemaProjectSlug, projectSettings]);

  const apiFetch = useCallback(
    (path: string, options?: RequestInit) =>
      fetch(path, {
        ...options,
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-slug': tenantSlug,
          ...(options?.headers || {}),
        },
      }),
    [tenantSlug]
  );

  const fetchTenantInfo = useCallback(async () => {
    const res = await apiFetch('/api/v1/tenants/me');
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        setCurrentUser(data.user);
      }
      setAllWorkspaces(data.workspaces || []);
      const currentWs = (data.workspaces || []).find((w: any) => w.slug === tenantSlug);
      const ws = currentWs || data.primary_workspace;
      if (ws) {
        setTenantInfo({
          id: ws.id,
          slug: ws.slug,
          name: ws.name,
          tier: ws.tier,
          api_key_preview: ws.api_key_preview,
          role: ws.role,
        });
        setAllProjects(ws.projects || []);
        if (ws.members) {
          setWorkspaceMembers(ws.members);
        }
      }
    }
  }, [apiFetch, tenantSlug]);

  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    setFetchError(null);
    try {
      const settingsRes = await apiFetch(`/api/v1/projects?tenant_slug=${tenantSlug}`);
      if (settingsRes.ok) {
        const sData = await settingsRes.json();
        if (Array.isArray(sData.projects)) {
          setAllProjects(sData.projects);
        }
        if (isAllProjects && Array.isArray(sData.projects) && sData.projects.length > 0) {
          setSelectedSchemaProjectSlug((prev) => prev || sData.projects[0].slug);
          const portfolioSettings = mergeProjectSettings(sData.projects);
          setProjectSettings(portfolioSettings);
          setLoadedProjectSlug(projectSlug);
        } else if (!isAllProjects) {
          const proj = (sData.projects || []).find((p: ProjectInfo) => p.slug === projectSlug);
          if (proj) {
            const detailRes = await apiFetch(`/api/v1/projects/${proj.id}/settings`);
            if (detailRes.ok) {
              const detail = await detailRes.json();
              if (detail.settings) {
                const enrichedHierarchy = (detail.settings.hierarchy || []).map((h: any) => ({
                  ...h,
                  color: h.color || getDefaultLevelHex(h.level),
                }));
                const enrichedSettings: ProjectSettings = {
                  ...detail.settings,
                  hierarchy: enrichedHierarchy,
                };
                setProjectSettings(enrichedSettings);
                if (detail.settings.statuses?.length) {
                  setSelectedStatuses((prev) => {
                    if (prev === null) return null;
                    const validIds = new Set(detail.settings.statuses.map((s: any) => s.id));
                    return prev.filter((id) => validIds.has(id));
                  });
                }
                if (detail.settings.hierarchy?.length) {
                  setSelectedLevels((prev) => {
                    if (prev === null) return null;
                    const validTypes = new Set(detail.settings.hierarchy.map((h: any) => h.type));
                    return prev.filter((t) => validTypes.has(t));
                  });
                }
              }
            }
            setLoadedProjectSlug(projectSlug);
          }
        }
      }

      const itemsUrl = isAllProjects
        ? `/api/v1/items?all_projects=true&tenant_slug=${tenantSlug}`
        : `/api/v1/items?project_slug=${projectSlug}`;
      const itemsRes = await apiFetch(itemsUrl);
      if (itemsRes.ok) {
        const iData = await itemsRes.json();
        setItems(iData.items || []);
      } else if (itemsRes.status === 401) {
        setFetchError('Session expired. Please sign in again.');
      } else {
        const err = await itemsRes.json().catch(() => ({}));
        setFetchError(err.error || `Failed to load items (${itemsRes.status})`);
      }
    } catch (err: any) {
      setFetchError(err.message || 'Network error. Check your connection.');
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, [apiFetch, tenantSlug, projectSlug, isAllProjects]);

  const handleSaveSchema = async (newSettings: ProjectSettings, targetSlugParam?: string) => {
    if (isReadOnly) {
      throw new Error('You have read-only access and cannot modify schema settings.');
    }
    const targetSlug =
      targetSlugParam ||
      (isAllProjects ? (selectedSchemaProjectSlug || allProjects[0]?.slug) : projectSlug);
    if (!targetSlug || targetSlug === 'all') {
      throw new Error('No target project specified for schema save.');
    }
    setIsSavingSchema(true);
    try {
      const res = await apiFetch(`/api/v1/projects/${targetSlug}/settings`, {
        method: 'PUT',
        body: JSON.stringify({ settings: newSettings }),
      });
      if (res.ok) {
        setAllProjects((prev) =>
          prev.map((p) => (p.slug === targetSlug ? { ...p, settings: newSettings } : p))
        );
        if (!isAllProjects) {
          setProjectSettings(newSettings);
        } else {
          fetchData();
        }
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || err.message || 'Failed to update schema');
      }
    } finally {
      setIsSavingSchema(false);
    }
  };

  useEffect(() => {
    fetchTenantInfo();
    fetchData();
  }, [fetchTenantInfo, fetchData]);

  const isCompleteStatus = useCallback((statusId: string) => {
    const norm = (statusId || '').toLowerCase().trim();
    return ['complete', 'done', 'closed', 'resolved'].includes(norm);
  }, []);

  const isNotStartedStatus = useCallback((statusId: string) => {
    const norm = (statusId || '').toLowerCase().trim();
    return ['not_started', 'unplanned', 'backlog', 'todo'].includes(norm);
  }, []);

  const isInProgressStatus = useCallback((statusId: string) => {
    const norm = (statusId || '').toLowerCase().trim();
    return ['in_progress', 'started', 'doing', 'in_review', 'active'].includes(norm);
  }, []);

  const handleBoardWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.shiftKey) return;

    const target = e.target as HTMLElement;
    const columnScroll = target.closest('.board-column-scroll') as HTMLElement | null;

    if (columnScroll) {
      const isScrollable = columnScroll.scrollHeight > columnScroll.clientHeight;
      if (isScrollable) {
        const isAtTop = columnScroll.scrollTop <= 0 && e.deltaY < 0;
        const isAtBottom =
          columnScroll.scrollTop + columnScroll.clientHeight >= columnScroll.scrollHeight - 1 &&
          e.deltaY > 0;

        if (!isAtTop && !isAtBottom) {
          return;
        }
      }
    }

    if (boardScrollRef.current && typeof window !== 'undefined' && window.innerWidth >= 768) {
      if (Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
        boardScrollRef.current.scrollLeft += e.deltaY;
      }
    }
  }, []);

  const executeStatusChange = useCallback(
    async (
      itemId: string,
      newStatus: string,
      prevOrder?: number,
      nextOrder?: number
    ) => {
      const item = items.find((i) => i.id === itemId);
      if (!item) return;

      let newOrder = item.order_index;
      if (prevOrder !== undefined || nextOrder !== undefined) {
        newOrder = calculateOrderIndex(prevOrder, nextOrder);
      }

      setItems((prev) =>
        prev
          .map((it) =>
            it.id === itemId ? { ...it, status: newStatus, order_index: newOrder } : it
          )
          .sort((a, b) => a.order_index - b.order_index)
      );

      try {
        const res = await apiFetch('/api/v1/items', {
          method: 'PATCH',
          body: JSON.stringify({
            id: itemId,
            status: newStatus,
            prev_order: prevOrder,
            next_order: nextOrder,
          }),
        });
        if (!res.ok) {
          fetchData();
          return;
        }

        if (isCompleteStatus(newStatus) && item.parent_id) {
          const parentItem = items.find((p) => p.id === item.parent_id);
          if (parentItem && !isCompleteStatus(parentItem.status)) {
            const siblingChildren = items.filter(
              (c) => c.parent_id === parentItem.id && c.id !== item.id
            );
            const allSiblingsComplete =
              siblingChildren.length === 0 ||
              siblingChildren.every((c) => isCompleteStatus(c.status));

            if (allSiblingsComplete) {
              setCascadePromptState({
                type: 'advance_parent_to_complete',
                targetItem: parentItem,
                relatedItems: [item, ...siblingChildren],
                targetStatus: newStatus,
              });
            }
          }
        }
      } catch {
        fetchData();
      }
    },
    [items, apiFetch, fetchData, isCompleteStatus]
  );

  const initiateStatusChange = useCallback(
    (
      itemId: string,
      targetStatus: string,
      prevOrder?: number,
      nextOrder?: number
    ) => {
      const item = items.find((i) => i.id === itemId);
      if (!item || item.status === targetStatus) return;

      if (isItemImmutableDueToCompletedSprint(item, projectSettings)) {
        setBulkToast('Completed items in closed sprints are immutable.');
        setTimeout(() => setBulkToast(null), 3000);
        return;
      }

      if (isCompleteStatus(targetStatus)) {
        const unfinishedChildren = items.filter(
          (c) => c.parent_id === item.id && !isCompleteStatus(c.status)
        );
        if (unfinishedChildren.length > 0) {
          const targetDef = projectSettings.statuses.find((s) => s.id === targetStatus);
          setCascadeCompletionState({
            parentItem: item,
            unfinishedChildren,
            targetStatus,
            targetStatusLabel: targetDef?.label || targetStatus,
            prevOrder,
            nextOrder,
          });
          return;
        }
      }

      if (isNotStartedStatus(item.status) && isInProgressStatus(targetStatus)) {
        const unstartedChildren = items.filter(
          (c) => c.parent_id === item.id && isNotStartedStatus(c.status)
        );
        if (unstartedChildren.length > 0) {
          setCascadePromptState({
            type: 'advance_children_to_in_progress',
            targetItem: item,
            relatedItems: unstartedChildren,
            targetStatus,
            prevOrder,
            nextOrder,
          });
          return;
        }
      }

      executeStatusChange(itemId, targetStatus, prevOrder, nextOrder);
    },
    [items, isCompleteStatus, isNotStartedStatus, isInProgressStatus, projectSettings, executeStatusChange]
  );

  const handleUpdateStatus = async (itemId: string, newStatus: string) => {
    initiateStatusChange(itemId, newStatus);
  };

  const handleUpdateItemSprint = async (itemId: string, newSprint: string | null) => {
    const item = items.find((it) => it.id === itemId);
    if (!item) return;

    if (isItemImmutableDueToCompletedSprint(item, projectSettings)) {
      setBulkToast('Completed items in closed sprints are immutable.');
      setTimeout(() => setBulkToast(null), 3000);
      return;
    }

    const descendantIds = getDescendantIds(items, itemId);
    const targetIds = [itemId, ...descendantIds];
    const targetIdSet = new Set(targetIds);

    const newMetadata = { ...(item.metadata || {}) };
    if (newSprint && newSprint !== '__none__') {
      newMetadata.sprint = newSprint;
    } else {
      delete newMetadata.sprint;
    }

    setItems((prev) =>
      prev.map((it) => {
        if (targetIdSet.has(it.id)) {
          const nextMeta = { ...(it.metadata || {}) };
          if (newSprint && newSprint !== '__none__') {
            nextMeta.sprint = newSprint;
          } else {
            delete nextMeta.sprint;
          }
          return { ...it, metadata: nextMeta };
        }
        return it;
      })
    );

    try {
      const res = await apiFetch('/api/v1/items', {
        method: 'PATCH',
        body: JSON.stringify({ id: itemId, metadata: newMetadata }),
      });
      if (!res.ok) fetchData();
    } catch {
      fetchData();
    }
  };

  const handleUpdateType = async (itemId: string, newType: string) => {
    const item = items.find((it) => it.id === itemId);
    if (!item) return;

    if (isItemImmutableDueToCompletedSprint(item, projectSettings)) {
      setBulkToast('Completed items in closed sprints are immutable.');
      setTimeout(() => setBulkToast(null), 3000);
      return;
    }

    const itemHierarchy = getItemHierarchy(item);
    const newHierarchyConfig = itemHierarchy.find((h) => h.type === newType);
    const allowedParents = newHierarchyConfig?.allowed_parents || [];
    let newParentId = item.parent_id;

    if (item.parent_id) {
      const parentItem = items.find((it) => it.id === item.parent_id);
      if (parentItem && !allowedParents.includes(parentItem.item_type)) {
        newParentId = null;
      }
    }

    setItems((prev) =>
      prev.map((it) =>
        it.id === itemId ? { ...it, item_type: newType, parent_id: newParentId } : it
      )
    );
    try {
      const res = await apiFetch('/api/v1/items', {
        method: 'PATCH',
        body: JSON.stringify({ id: itemId, item_type: newType, parent_id: newParentId }),
      });
      if (!res.ok) fetchData();
    } catch {
      fetchData();
    }
  };

  const handleTreeUpdateAssignee = async (itemId: string, newAssignee: string | null) => {
    const item = items.find((it) => it.id === itemId);
    if (!item) return;

    if (isItemImmutableDueToCompletedSprint(item, getItemProjectSettings(item))) {
      setBulkToast('Completed items in closed sprints are immutable.');
      setTimeout(() => setBulkToast(null), 3000);
      return;
    }

    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, assignee: newAssignee } : it))
    );

    try {
      const res = await apiFetch('/api/v1/items', {
        method: 'PATCH',
        body: JSON.stringify({ id: itemId, assignee: newAssignee }),
      });
      if (!res.ok) fetchData();
    } catch {
      fetchData();
    }
  };

  const handleTreeCreateChild = async (parentId: string, title: string, itemType: string) => {
    const parent = items.find((it) => it.id === parentId);
    if (!parent) return;

    const parentProjectSettings = getItemProjectSettings(parent);
    const siblings = items.filter((it) => it.parent_id === parentId);
    const maxOrder = siblings.reduce((max, it) => Math.max(max, it.order_index ?? 0), 0);
    const nextOrder = maxOrder + DEFAULT_ORDER_STEP;

    const sprintToAssign =
      parent.metadata?.sprint ||
      (selectedSprint !== 'all' && selectedSprint !== '__none__' ? selectedSprint : undefined);

    const defaultStatus =
      (parentProjectSettings.statuses && parentProjectSettings.statuses[0]?.id) || 'not_started';

    const payload: Partial<WorkItem> & { project_id: string; prev_order?: number } = {
      project_id: parent.project_id,
      parent_id: parentId,
      title,
      item_type: itemType,
      status: defaultStatus,
      order_index: nextOrder,
      prev_order: maxOrder > 0 ? maxOrder : undefined,
      metadata: sprintToAssign ? { sprint: sprintToAssign } : {},
    };

    const res = await apiFetch('/api/v1/items', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to create child item (${res.status})`);
    }
    const created = await res.json();
    if (created.item) {
      setItems((prev) => [...prev, created.item]);
      setCollapsedTreeNodes((prev) => {
        const next = new Set(prev);
        next.delete(parentId);
        try {
          localStorage.setItem(
            `tracker_collapsed_tree_nodes_${projectSlug}`,
            JSON.stringify(Array.from(next))
          );
        } catch {}
        return next;
      });
    } else {
      fetchData();
    }
  };

  const handleTreeReparent = async (
    draggedId: string,
    targetId: string | null,
    position: 'inside' | 'before' | 'after'
  ) => {
    const draggedItem = items.find((it) => it.id === draggedId);
    if (!draggedItem) return;

    const draggedProjectSettings = getItemProjectSettings(draggedItem);

    if (isItemImmutableDueToCompletedSprint(draggedItem, draggedProjectSettings)) {
      setBulkToast('Completed items in closed sprints are immutable.');
      setTimeout(() => setBulkToast(null), 3000);
      return;
    }

    if (!targetId) {
      const rootSiblings = items
        .filter((it) => !it.parent_id && it.id !== draggedId)
        .sort((a, b) => a.order_index - b.order_index);

      const prevRoot = rootSiblings.length > 0 ? rootSiblings[rootSiblings.length - 1] : null;
      const newOrderIndex = prevRoot
        ? calculateOrderIndex(prevRoot.order_index, null)
        : DEFAULT_ORDER_STEP;

      setItems((prev) =>
        prev.map((it) =>
          it.id === draggedId ? { ...it, parent_id: null, order_index: newOrderIndex } : it
        )
      );

      try {
        const res = await apiFetch('/api/v1/items', {
          method: 'PATCH',
          body: JSON.stringify({
            id: draggedId,
            parent_id: null,
            order_index: newOrderIndex,
            prev_order: prevRoot?.order_index,
          }),
        });
        if (!res.ok) fetchData();
      } catch {
        fetchData();
      }
      return;
    }

    if (draggedId === targetId) return;
    const targetItem = items.find((it) => it.id === targetId);
    if (!targetItem) return;

    if (draggedItem.project_id !== targetItem.project_id) {
      setBulkToast('Cannot move items between different projects in the hierarchy tree.');
      setTimeout(() => setBulkToast(null), 4000);
      return;
    }

    if (isDescendantOf(allTreeItems, draggedId, targetId)) {
      setBulkToast('Cannot move an item into its own descendant.');
      setTimeout(() => setBulkToast(null), 3000);
      return;
    }

    if (position === 'inside') {
      const validation = validateHierarchyNesting(
        targetItem.item_type,
        draggedItem.item_type,
        draggedProjectSettings.hierarchy
      );
      if (!validation.valid) {
        setBulkToast(validation.message || 'Invalid hierarchy nesting');
        setTimeout(() => setBulkToast(null), 4000);
        return;
      }

      const existingChildren = items
        .filter((it) => it.parent_id === targetId && it.id !== draggedId)
        .sort((a, b) => a.order_index - b.order_index);

      const prevChild = existingChildren.length > 0 ? existingChildren[existingChildren.length - 1] : null;
      const newOrderIndex = prevChild
        ? calculateOrderIndex(prevChild.order_index, null)
        : DEFAULT_ORDER_STEP;

      setItems((prev) =>
        prev.map((it) =>
          it.id === draggedId ? { ...it, parent_id: targetId, order_index: newOrderIndex } : it
        )
      );

      setCollapsedTreeNodes((prev) => {
        const next = new Set(prev);
        next.delete(targetId);
        return next;
      });

      try {
        const res = await apiFetch('/api/v1/items', {
          method: 'PATCH',
          body: JSON.stringify({
            id: draggedId,
            parent_id: targetId,
            order_index: newOrderIndex,
            prev_order: prevChild?.order_index,
          }),
        });
        if (!res.ok) fetchData();
      } catch {
        fetchData();
      }
    } else {
      const newParentId = targetItem.parent_id;

      if (newParentId) {
        const parentItem = items.find((it) => it.id === newParentId);
        if (parentItem) {
          const validation = validateHierarchyNesting(
            parentItem.item_type,
            draggedItem.item_type,
            draggedProjectSettings.hierarchy
          );
          if (!validation.valid) {
            setBulkToast(validation.message || 'Invalid hierarchy nesting');
            setTimeout(() => setBulkToast(null), 4000);
            return;
          }
        }
      }

      const siblings = items
        .filter((it) => it.parent_id === newParentId && it.id !== draggedId)
        .sort((a, b) => a.order_index - b.order_index);

      const targetIdx = siblings.findIndex((s) => s.id === targetId);
      let newOrderIndex: number;
      let prevOrder: number | undefined;
      let nextOrder: number | undefined;

      if (position === 'before') {
        const prevSibling = targetIdx > 0 ? siblings[targetIdx - 1] : null;
        prevOrder = prevSibling?.order_index;
        nextOrder = targetItem.order_index;
        newOrderIndex = calculateOrderIndex(prevOrder, nextOrder);
      } else {
        const nextSibling = targetIdx < siblings.length - 1 ? siblings[targetIdx + 1] : null;
        prevOrder = targetItem.order_index;
        nextOrder = nextSibling?.order_index;
        newOrderIndex = calculateOrderIndex(prevOrder, nextOrder);
      }

      setItems((prev) =>
        prev.map((it) =>
          it.id === draggedId ? { ...it, parent_id: newParentId, order_index: newOrderIndex } : it
        )
      );

      try {
        const res = await apiFetch('/api/v1/items', {
          method: 'PATCH',
          body: JSON.stringify({
            id: draggedId,
            parent_id: newParentId,
            order_index: newOrderIndex,
            prev_order: prevOrder,
            next_order: nextOrder,
          }),
        });
        if (!res.ok) fetchData();
      } catch {
        fetchData();
      }
    }
  };

  const handleSaveModalItem = async (itemId: string, updates: Partial<WorkItem>) => {
    const currentProj = allProjects.find((p) => p.slug === projectSlug);
    const isMovingProject = Boolean(
      updates.project_id && (!currentProj || updates.project_id !== currentProj.id)
    );

    if (isMovingProject && updates.project_id) {
      const moveResult = await reassignWorkItemProject(itemId, updates.project_id, tenantSlug);
      if (!moveResult.success) {
        throw new Error(moveResult.error || 'Failed to reassign work item project');
      }

      const otherUpdates = { ...updates };
      delete otherUpdates.project_id;
      if (Object.keys(otherUpdates).length > 0) {
        const res = await apiFetch('/api/v1/items', {
          method: 'PATCH',
          body: JSON.stringify({ id: itemId, ...otherUpdates }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || `Failed to save changes (${res.status})`);
        }
      }

      const destProject = allProjects.find((p) => p.id === updates.project_id);
      const childCount = Math.max(0, (moveResult.updatedCount ?? 1) - 1);
      const projName = destProject?.name || 'new project';
      setBulkToast(`Moved item and ${childCount} child task${childCount !== 1 ? 's' : ''} to ${projName}`);
      setTimeout(() => setBulkToast(null), 4000);
      fetchData();
      return;
    }

    const res = await apiFetch('/api/v1/items', {
      method: 'PATCH',
      body: JSON.stringify({ id: itemId, ...updates }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Failed to save changes (${res.status})`);
    }
    const data = await res.json();
    setItems((prev) =>
      prev
        .map((it) => (it.id === itemId ? { ...it, ...updates, ...(data.item || {}) } : it))
        .sort((a, b) => a.order_index - b.order_index)
    );
    if (updates.project_id || (updates.metadata && 'sprint' in updates.metadata)) {
      fetchData();
    }
  };

  const handleDeleteItem = async (itemId: string): Promise<boolean> => {
    const item = items.find((it) => it.id === itemId);
    if (item && isItemImmutableDueToCompletedSprint(item, projectSettings)) {
      setBulkToast('Cannot delete locked items in closed sprints.');
      setTimeout(() => setBulkToast(null), 3000);
      return false;
    }
    setItems((prev) => prev.filter((it) => it.id !== itemId));
    try {
      const res = await apiFetch('/api/v1/items', {
        method: 'DELETE',
        body: JSON.stringify({ id: itemId }),
      });
      if (!res.ok) {
        fetchData();
        return false;
      }
      return true;
    } catch {
      fetchData();
      return false;
    }
  };

  const toggleSprintCollapse = (sprintKey: string) => {
    setCollapsedSprints((prev) => {
      const next = new Set(prev);
      if (next.has(sprintKey)) {
        next.delete(sprintKey);
      } else {
        next.add(sprintKey);
      }
      try {
        localStorage.setItem(
          `tracker_collapsed_sprints_${projectSlug}`,
          JSON.stringify(Array.from(next))
        );
      } catch {}
      return next;
    });
  };

  const handleToggleCollapseAllSprints = () => {
    const allKeys = [...visibleSprints, '__backlog__'];
    setCollapsedSprints((prev) => {
      const next = prev.size === allKeys.length ? new Set<string>() : new Set<string>(allKeys);
      try {
        localStorage.setItem(
          `tracker_collapsed_sprints_${projectSlug}`,
          JSON.stringify(Array.from(next))
        );
      } catch {}
      return next;
    });
  };

  const handleSaveSprints = async (sprints: SprintDefinition[]) => {
    if (isReadOnly) return;
    const newSettings: ProjectSettings = {
      ...projectSettings,
      sprint_settings: {
        ...projectSettings.sprint_settings,
        sprints,
      },
    };
    setProjectSettings(newSettings);
    try {
      const res = await apiFetch(`/api/v1/projects/${projectSlug}/settings`, {
        method: 'PUT',
        body: JSON.stringify({ settings: newSettings }),
      });
      if (!res.ok) {
        fetchData();
      } else {
        setBulkToast('Sprint configurations saved.');
        setTimeout(() => setBulkToast(null), 3000);
      }
    } catch (err) {
      console.error('Error saving sprint settings:', err);
      fetchData();
    }
  };

  const handleToggleSelectItem = useCallback(
    (
      itemId: string,
      e?: React.MouseEvent | React.ChangeEvent,
      listContext?: WorkItem[],
      cascade = false
    ) => {
      const isShiftKey = (e as React.MouseEvent)?.shiftKey;
      const pool = listContext || items;

      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        if (isShiftKey && lastSelectedIdRef.current) {
          const lastIdx = pool.findIndex((it) => it.id === lastSelectedIdRef.current);
          const currIdx = pool.findIndex((it) => it.id === itemId);
          if (lastIdx !== -1 && currIdx !== -1) {
            const start = Math.min(lastIdx, currIdx);
            const end = Math.max(lastIdx, currIdx);
            for (let i = start; i <= end; i++) {
              next.add(pool[i].id);
            }
            lastSelectedIdRef.current = itemId;
            return next;
          }
        }

        const isCurrentlySelected = next.has(itemId);
        const descendants = cascade ? getDescendantIds(items, itemId) : [];

        if (isCurrentlySelected) {
          next.delete(itemId);
          if (cascade) {
            descendants.forEach((dId) => next.delete(dId));
            let parentId = items.find((it) => it.id === itemId)?.parent_id;
            while (parentId) {
              next.delete(parentId);
              parentId = items.find((it) => it.id === parentId)?.parent_id;
            }
          }
        } else {
          next.add(itemId);
          if (cascade) {
            descendants.forEach((dId) => next.add(dId));
          }
        }
        lastSelectedIdRef.current = itemId;
        return next;
      });
    },
    [items]
  );

  const handleSelectAllInPool = useCallback((poolItems: WorkItem[]) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      const allSelected = poolItems.length > 0 && poolItems.every((it) => next.has(it.id));
      if (allSelected) {
        poolItems.forEach((it) => next.delete(it.id));
      } else {
        poolItems.forEach((it) => next.add(it.id));
      }
      return next;
    });
  }, []);

  const handleDeselectAll = useCallback(() => {
    setSelectedItemIds(new Set());
    lastSelectedIdRef.current = null;
  }, []);

  const handleBulkMoveSprint = async (targetSprint: string | null) => {
    const selectedList = items.filter((it) => selectedItemIds.has(it.id));
    const mutableItems = selectedList.filter(
      (it) => !isItemImmutableDueToCompletedSprint(it, projectSettings)
    );
    if (mutableItems.length === 0) {
      if (selectedList.length > 0) {
        setBulkToast('Completed items in completed sprints are locked and cannot be moved.');
        setTimeout(() => setBulkToast(null), 3500);
      }
      return;
    }
    if (mutableItems.length < selectedList.length) {
      setBulkToast(
        `Moving ${mutableItems.length} items. Skipped ${selectedList.length - mutableItems.length} locked items.`
      );
      setTimeout(() => setBulkToast(null), 3500);
    }

    const mutableIds = mutableItems.map((it) => it.id);
    const idSet = new Set(mutableIds);

    setItems((prev) =>
      prev.map((it) => {
        if (!idSet.has(it.id)) return it;
        const newMeta = { ...(it.metadata || {}) };
        if (targetSprint && targetSprint !== '__none__') {
          newMeta.sprint = targetSprint;
        } else {
          delete newMeta.sprint;
        }
        return { ...it, metadata: newMeta };
      })
    );

    setIsBulkApplying(true);
    try {
      const res = await apiFetch('/api/v1/items/bulk', {
        method: 'PATCH',
        body: JSON.stringify({
          ids: mutableIds,
          updates: {
            metadata: {
              sprint: targetSprint && targetSprint !== '__none__' ? targetSprint : null,
            },
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setBulkToast(`Failed to move sprint: ${err.error || 'Server rejected update'}`);
        setTimeout(() => setBulkToast(null), 4000);
        fetchData();
      } else {
        setBulkToast(`Moved ${mutableIds.length} items to ${targetSprint && targetSprint !== '__none__' ? targetSprint : 'Backlog'}.`);
        setTimeout(() => setBulkToast(null), 3000);
        setSelectedItemIds(new Set());
      }
    } catch (err: any) {
      setBulkToast(`Network error moving items: ${err?.message || 'Failed to communicate with server'}`);
      setTimeout(() => setBulkToast(null), 4000);
      fetchData();
    } finally {
      setIsBulkApplying(false);
    }
  };

  const handleBulkChangeProject = async (targetProjectId: string) => {
    const selectedList = items.filter((it) => selectedItemIds.has(it.id));
    if (selectedList.length === 0 || !targetProjectId) return;

    const lockedItems = selectedList.filter((it) =>
      isItemImmutableDueToCompletedSprint(it, projectSettings)
    );
    if (lockedItems.length > 0) {
      setBulkToast(
        `Cannot change project: ${lockedItems.length} item(s) are locked in completed sprints.`
      );
      setTimeout(() => setBulkToast(null), 4000);
      return;
    }

    const targetProj = allProjects.find(
      (p) => p.id === targetProjectId || p.slug === targetProjectId
    );
    const targetProjectName = targetProj ? targetProj.name : 'new project';

    setIsBulkApplying(true);
    try {
      const selectedIds = selectedList.map((it) => it.id);
      const res = await bulkReassignProjects(selectedIds, targetProjectId, tenantSlug);

      if (!res.success) {
        setBulkToast(`Failed to change project: ${res.error || 'Server rejected migration'}`);
        setTimeout(() => setBulkToast(null), 4000);
      } else {
        const movedCount = res.updatedCount || selectedIds.length;
        setBulkToast(`Moved ${movedCount} items to ${targetProjectName}.`);
        setTimeout(() => setBulkToast(null), 3000);
        setSelectedItemIds(new Set());
        fetchData();
      }
    } catch (err: any) {
      setBulkToast(`Error changing project: ${err?.message || 'Failed to communicate with server'}`);
      setTimeout(() => setBulkToast(null), 4000);
    } finally {
      setIsBulkApplying(false);
    }
  };

  const handleBulkSetStatus = async (targetStatus: string) => {
    const selectedList = items.filter((it) => selectedItemIds.has(it.id));
    const mutableItems = selectedList.filter(
      (it) => !isItemImmutableDueToCompletedSprint(it, projectSettings)
    );
    if (mutableItems.length === 0) {
      if (selectedList.length > 0) {
        setBulkToast('Completed items in completed sprints are locked and cannot be changed.');
        setTimeout(() => setBulkToast(null), 3500);
      }
      return;
    }

    const mutableIds = mutableItems.map((it) => it.id);
    const idSet = new Set(mutableIds);

    setItems((prev) =>
      prev.map((it) => (idSet.has(it.id) ? { ...it, status: targetStatus } : it))
    );

    setIsBulkApplying(true);
    try {
      const res = await apiFetch('/api/v1/items/bulk', {
        method: 'PATCH',
        body: JSON.stringify({
          ids: mutableIds,
          updates: { status: targetStatus },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setBulkToast(`Failed to update status: ${err.error || 'Server rejected update'}`);
        setTimeout(() => setBulkToast(null), 4000);
        fetchData();
      } else {
        setBulkToast(`Updated status for ${mutableIds.length} items.`);
        setTimeout(() => setBulkToast(null), 3000);
        setSelectedItemIds(new Set());
      }
    } catch (err: any) {
      setBulkToast(`Network error: ${err?.message || 'Failed to communicate with server'}`);
      setTimeout(() => setBulkToast(null), 4000);
      fetchData();
    } finally {
      setIsBulkApplying(false);
    }
  };

  const handleBulkAssign = async (assignee: string | null) => {
    const selectedList = items.filter((it) => selectedItemIds.has(it.id));
    const mutableItems = selectedList.filter(
      (it) => !isItemImmutableDueToCompletedSprint(it, projectSettings)
    );
    if (mutableItems.length === 0) {
      if (selectedList.length > 0) {
        setBulkToast('Completed items in completed sprints are locked.');
        setTimeout(() => setBulkToast(null), 3500);
      }
      return;
    }

    const mutableIds = mutableItems.map((it) => it.id);
    const idSet = new Set(mutableIds);

    setItems((prev) =>
      prev.map((it) => (idSet.has(it.id) ? { ...it, assignee: assignee || null } : it))
    );

    setIsBulkApplying(true);
    try {
      const res = await apiFetch('/api/v1/items/bulk', {
        method: 'PATCH',
        body: JSON.stringify({
          ids: mutableIds,
          updates: { assignee: assignee || null },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setBulkToast(`Failed to assign: ${err.error || 'Server rejected update'}`);
        setTimeout(() => setBulkToast(null), 4000);
        fetchData();
      } else {
        setBulkToast(`Assigned ${mutableIds.length} items to ${assignee || 'Unassigned'}.`);
        setTimeout(() => setBulkToast(null), 3000);
        setSelectedItemIds(new Set());
      }
    } catch (err: any) {
      setBulkToast(`Network error: ${err?.message || 'Failed to communicate with server'}`);
      setTimeout(() => setBulkToast(null), 4000);
      fetchData();
    } finally {
      setIsBulkApplying(false);
    }
  };

  const handleBulkAdjustPoints = async (points: number | null) => {
    const selectedList = items.filter((it) => selectedItemIds.has(it.id));
    const mutableItems = selectedList.filter(
      (it) => !isItemImmutableDueToCompletedSprint(it, projectSettings)
    );
    if (mutableItems.length === 0) {
      if (selectedList.length > 0) {
        setBulkToast('Completed items in completed sprints are locked.');
        setTimeout(() => setBulkToast(null), 3500);
      }
      return;
    }

    const mutableIds = mutableItems.map((it) => it.id);
    const idSet = new Set(mutableIds);

    setItems((prev) =>
      prev.map((it) => {
        if (!idSet.has(it.id)) return it;
        const newMeta = { ...(it.metadata || {}) };
        if (points !== null) {
          newMeta.story_points = points;
        } else {
          delete newMeta.story_points;
          delete newMeta.points;
        }
        return { ...it, metadata: newMeta };
      })
    );

    setIsBulkApplying(true);
    try {
      const res = await apiFetch('/api/v1/items/bulk', {
        method: 'PATCH',
        body: JSON.stringify({
          ids: mutableIds,
          updates: {
            metadata: { story_points: points },
          },
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setBulkToast(`Failed to update points: ${err.error || 'Server rejected update'}`);
        setTimeout(() => setBulkToast(null), 4000);
        fetchData();
      } else {
        setBulkToast(`Updated story points for ${mutableIds.length} items.`);
        setTimeout(() => setBulkToast(null), 3000);
        setSelectedItemIds(new Set());
      }
    } catch (err: any) {
      setBulkToast(`Network error: ${err?.message || 'Failed to communicate with server'}`);
      setTimeout(() => setBulkToast(null), 4000);
      fetchData();
    } finally {
      setIsBulkApplying(false);
    }
  };

  const handleBulkDelete = async () => {
    const selectedList = items.filter((it) => selectedItemIds.has(it.id));
    const mutableItems = selectedList.filter(
      (it) => !isItemImmutableDueToCompletedSprint(it, projectSettings)
    );
    if (mutableItems.length === 0) {
      if (selectedList.length > 0) {
        setBulkToast('Cannot delete locked items in completed sprints.');
        setTimeout(() => setBulkToast(null), 3500);
      }
      return;
    }

    if (
      !window.confirm(
        `Are you sure you want to permanently delete ${mutableItems.length} selected item(s)?`
      )
    ) {
      return;
    }

    const mutableIds = mutableItems.map((it) => it.id);
    const idSet = new Set(mutableIds);

    setItems((prev) => prev.filter((it) => !idSet.has(it.id)));
    setIsBulkApplying(true);
    try {
      const res = await apiFetch('/api/v1/items/bulk', {
        method: 'DELETE',
        body: JSON.stringify({
          ids: mutableIds,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        setBulkToast(`Failed to delete items: ${err.error || 'Server rejected update'}`);
        setTimeout(() => setBulkToast(null), 4000);
        fetchData();
      } else {
        setBulkToast(`Deleted ${mutableIds.length} items.`);
        setTimeout(() => setBulkToast(null), 3000);
        setSelectedItemIds(new Set());
      }
    } catch (err: any) {
      setBulkToast(`Network error: ${err?.message || 'Failed to communicate with server'}`);
      setTimeout(() => setBulkToast(null), 4000);
      fetchData();
    } finally {
      setIsBulkApplying(false);
    }
  };

  // Drag and Drop Handlers
  const handleDragStart = (e: React.DragEvent, item: WorkItem) => {
    if (isReadOnly || isItemImmutableDueToCompletedSprint(item, projectSettings)) {
      e.preventDefault();
      return;
    }
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedItemId(item.id);
  };

  const handleDragOverCard = (e: React.DragEvent, colId: string, index: number) => {
    if (isReadOnly) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget({ colId, index });
  };

  const handleDragEnd = () => {
    setDraggedItemId(null);
    setDragOverTarget(null);
  };

  const handleDrop = async (e: React.DragEvent, targetColId: string, dropIndex?: number) => {
    e.preventDefault();
    if (isReadOnly) return;
    const itemId = e.dataTransfer.getData('text/plain') || draggedItemId;
    if (!itemId) return;

    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    if (isItemImmutableDueToCompletedSprint(item, projectSettings)) {
      setDraggedItemId(null);
      setDragOverTarget(null);
      return;
    }

    const allColItems = items
      .filter((it) => it.status === targetColId && it.id !== itemId)
      .sort((a, b) => a.order_index - b.order_index);

    const visibleColItems = items
      .filter((it) => {
        if (it.status !== targetColId) return false;
        if (!effectiveSelectedLevels.includes(it.item_type)) return false;
        if (selectedSprint !== 'all') {
          if (selectedSprint === '__none__') {
            return !it.metadata?.sprint;
          }
          return it.metadata?.sprint === selectedSprint;
        }
        return true;
      })
      .sort((a, b) => a.order_index - b.order_index);

    let prevItem: WorkItem | null = null;
    let nextItem: WorkItem | null = null;

    if (
      typeof dropIndex === 'number' &&
      dropIndex >= 0 &&
      dropIndex < visibleColItems.length
    ) {
      const targetCard = visibleColItems[dropIndex];
      const targetPos = allColItems.findIndex((it) => it.id === targetCard.id);
      if (targetPos >= 0) {
        prevItem = targetPos > 0 ? allColItems[targetPos - 1] : null;
        nextItem = allColItems[targetPos];
      } else {
        prevItem = allColItems.length > 0 ? allColItems[allColItems.length - 1] : null;
        nextItem = null;
      }
    } else {
      prevItem = allColItems.length > 0 ? allColItems[allColItems.length - 1] : null;
      nextItem = null;
    }

    setDraggedItemId(null);
    setDragOverTarget(null);

    initiateStatusChange(itemId, targetColId, prevItem?.order_index, nextItem?.order_index);
  };

  const handleDropOnColEnd = (e: React.DragEvent, colId: string) => {
    handleDrop(e, colId, undefined);
  };

  // Column Collapse Toggles
  const toggleCollapseSideways = (colId: string) => {
    setCollapsedSideways((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      return next;
    });
  };

  const toggleCollapseUp = (colId: string) => {
    setCollapsedUp((prev) => {
      const next = new Set(prev);
      if (next.has(colId)) next.delete(colId);
      else next.add(colId);
      return next;
    });
  };

  const collapseAllColumns = () => {
    setCollapsedSideways(new Set(projectSettings.statuses.map((s) => s.id)));
  };

  const expandAllColumns = () => {
    setCollapsedSideways(new Set());
  };

  // Filter Options and Lookups
  const statusFilterOptions = useMemo(() => {
    return projectSettings.statuses.map((s) => ({
      id: s.id,
      label: s.label,
      color: s.color,
      count: items.filter((it) => it.status === s.id).length,
    }));
  }, [projectSettings.statuses, items]);

  const levelFilterOptions = useMemo(() => {
    return projectSettings.hierarchy.map((h) => ({
      id: h.type,
      label: h.label,
      color: getHierarchyLevelColor(h.type, projectSettings.hierarchy).hex,
      count: items.filter((it) => it.item_type === h.type).length,
    }));
  }, [projectSettings.hierarchy, items]);

  const assigneeFilterOptions = useMemo(() => {
    const unassignedCount = items.filter((it) => !it.assignee).length;
    const knownAssignees = Array.from(new Set(items.map((it) => it.assignee).filter(Boolean) as string[]));
    workspaceMembers.forEach((m) => {
      if (m.full_name && !knownAssignees.includes(m.full_name)) {
        knownAssignees.push(m.full_name);
      }
    });

    return [
      { id: '__unassigned__', label: 'Unassigned', count: unassignedCount },
      ...knownAssignees.sort().map((name) => ({
        id: name,
        label: name,
        count: items.filter((it) => it.assignee === name).length,
      })),
    ];
  }, [workspaceMembers, items]);

  const effectiveTreeAssignees = useMemo(() => {
    if (treeSelectedAssignees !== null) return treeSelectedAssignees;
    return assigneeFilterOptions.map((o) => o.id);
  }, [treeSelectedAssignees, assigneeFilterOptions]);

  const knownStatusIds = useMemo(
    () => new Set(projectSettings.statuses.map((s) => s.id)),
    [projectSettings.statuses]
  );

  const unmappedItems = useMemo(
    () =>
      items
        .filter((it) => {
          if (knownStatusIds.has(it.status)) return false;
          if (!effectiveSelectedLevels.includes(it.item_type)) return false;
          if (selectedSprint !== 'all') {
            if (selectedSprint === '__none__') {
              return !it.metadata?.sprint;
            }
            return it.metadata?.sprint === selectedSprint;
          }
          return true;
        })
        .sort((a, b) => a.order_index - b.order_index),
    [items, knownStatusIds, effectiveSelectedLevels, selectedSprint]
  );

  const handleCreateItem = async (payload: QuickAddPayload) => {
    if (isReadOnly) return;
    try {
      const res = await apiFetch('/api/v1/items', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.item) {
          setItems((prev) => [...prev, data.item]);
          return data.item;
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to create work item');
      }
    } catch (err) {
      console.error('Error creating item:', err);
      throw err;
    }
  };

  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isManageSprintsOpen, setIsManageSprintsOpen] = useState(false);

  // Global Keyboard Shortcuts for Quick Add
  useEffect(() => {
    if (isReadOnly) return;

    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key !== 'c' && e.key !== 'n' && e.key !== 'C' && e.key !== 'N') return;

      const activeEl = document.activeElement as HTMLElement | null;
      if (activeEl) {
        const tag = activeEl.tagName?.toUpperCase();
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || activeEl.isContentEditable) {
          return;
        }
      }

      if (
        isQuickAddOpen ||
        isSearchOpen ||
        editingItem ||
        isManageSprintsOpen ||
        isReconciliationModalOpen ||
        isArchiveModalOpen ||
        !!deleteConfirmItem ||
        !!cascadePromptState ||
        !!cascadeCompletionState
      ) {
        return;
      }

      e.preventDefault();
      setIsQuickAddOpen(true);
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    isReadOnly,
    isQuickAddOpen,
    isSearchOpen,
    editingItem,
    isManageSprintsOpen,
    isReconciliationModalOpen,
    isArchiveModalOpen,
    deleteConfirmItem,
    cascadePromptState,
    cascadeCompletionState,
  ]);

  useEffect(() => {
    const handleSearchKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsSearchOpen((prev) => !prev);
        return;
      }

      if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const activeEl = document.activeElement as HTMLElement | null;
        if (activeEl) {
          const tag = activeEl.tagName?.toUpperCase();
          if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || activeEl.isContentEditable) {
            return;
          }
        }
        e.preventDefault();
        setIsSearchOpen(true);
      }
    };

    window.addEventListener('keydown', handleSearchKeyDown);
    return () => window.removeEventListener('keydown', handleSearchKeyDown);
  }, []);

  const handleRunSparkIngest = async () => {
    if (isReadOnly) return;
    setIsIngesting(true);
    setIngestResponse(null);
    setLastIngestedItemIds(null);
    try {
      const parsed = JSON.parse(sparkPayload);
      if (sparkOverrideProject) {
        parsed.override_project_slug = sparkOverrideProject;
      }
      if (sparkOverrideSprint) {
        parsed.override_sprint = sparkOverrideSprint;
      }
      if (sparkOverrideAssignee) {
        parsed.override_assignee = sparkOverrideAssignee;
      }
      const res = await apiFetch('/api/v1/items/ingest', {
        method: 'POST',
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      setIngestResponse(data);
      if (data.success) {
        if (Array.isArray(data.items)) {
          setLastIngestedItemIds(data.items.map((it: any) => it.id).filter(Boolean));
        } else {
          setLastIngestedItemIds([]);
        }
        fetchData();
      } else {
        setLastIngestedItemIds(null);
      }
    } catch (err: any) {
      setIngestResponse({ error: err.message || 'Failed to parse/send payload' });
      setLastIngestedItemIds(null);
    } finally {
      setIsIngesting(false);
    }
  };

  const getStatusColor = (statusId: string) => {
    const s = projectSettings.statuses.find((st: StatusDefinition) => st.id === statusId);
    return s?.color || '#94a3b8';
  };

  // Inline Quick Add state on Board
  const [quickAddColId, setQuickAddColId] = useState<string | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState('');
  const [isCreatingQuickItem, setIsCreatingQuickItem] = useState(false);

  const handleCreateQuickInlineItem = async (colId: string) => {
    if (!quickAddTitle.trim() || isCreatingQuickItem || isReadOnly) return;
    setIsCreatingQuickItem(true);
    try {
      const targetProj = allProjects.find((p) => p.slug === projectSlug);
      const projId = targetProj ? targetProj.id : projectSlug;

      const lowestLevel = projectSettings.hierarchy.reduce((max, h) => (h.level > max.level ? h : max), projectSettings.hierarchy[0]);
      const itemType = lowestLevel?.type || 'task';

      const colItems = items.filter((it) => it.status === colId).sort((a, b) => a.order_index - b.order_index);
      const lastItem = colItems[colItems.length - 1];
      const newOrder = calculateOrderIndex(lastItem?.order_index, null);

      const metadata: Record<string, any> = {};
      if (selectedSprint !== 'all' && selectedSprint !== '__none__') {
        metadata.sprint = selectedSprint;
      }

      await handleCreateItem({
        title: quickAddTitle.trim(),
        item_type: itemType,
        status: colId,
        assignee: null,
        project_id: projId,
        metadata: {
          ...metadata,
          order_index: newOrder,
        },
      });

      setQuickAddTitle('');
      setQuickAddColId(null);
    } finally {
      setIsCreatingQuickItem(false);
    }
  };

  // Cascade handlers
  const handleExecuteCascadeCompletion = async () => {
    if (!cascadeCompletionState) return;
    const { parentItem, unfinishedChildren, targetStatus, prevOrder, nextOrder } = cascadeCompletionState;

    setCascadeCompletionState(null);
    executeStatusChange(parentItem.id, targetStatus, prevOrder, nextOrder);

    const childIds = unfinishedChildren.map((c) => c.id);
    const childIdSet = new Set(childIds);

    setItems((prev) =>
      prev.map((it) => (childIdSet.has(it.id) ? { ...it, status: targetStatus } : it))
    );

    try {
      await apiFetch('/api/v1/items/bulk', {
        method: 'PATCH',
        body: JSON.stringify({
          ids: childIds,
          updates: { status: targetStatus },
        }),
      });
      setBulkToast(`Completed parent and cascaded to ${childIds.length} subtask${childIds.length === 1 ? '' : 's'}.`);
      setTimeout(() => setBulkToast(null), 3000);
    } catch {
      fetchData();
    }
  };

  const handleExecuteKeepParentOnly = async () => {
    if (!cascadeCompletionState) return;
    const { parentItem, targetStatus, prevOrder, nextOrder } = cascadeCompletionState;
    setCascadeCompletionState(null);
    executeStatusChange(parentItem.id, targetStatus, prevOrder, nextOrder);
  };

  const handleExecuteCascadePrompt = async () => {
    if (!cascadePromptState) return;
    const { type, targetItem, relatedItems, targetStatus, prevOrder, nextOrder } = cascadePromptState;
    setCascadePromptState(null);

    if (type === 'advance_children_to_in_progress') {
      executeStatusChange(targetItem.id, targetStatus, prevOrder, nextOrder);
      const childIds = relatedItems.map((c) => c.id);
      const childIdSet = new Set(childIds);

      setItems((prev) =>
        prev.map((it) => (childIdSet.has(it.id) ? { ...it, status: targetStatus } : it))
      );

      try {
        await apiFetch('/api/v1/items/bulk', {
          method: 'PATCH',
          body: JSON.stringify({
            ids: childIds,
            updates: { status: targetStatus },
          }),
        });
      } catch {
        fetchData();
      }
    } else if (type === 'advance_parent_to_complete') {
      executeStatusChange(targetItem.id, targetStatus);
    }
  };

  const handleExecuteKeepParentOnlyPrompt = async () => {
    if (!cascadePromptState) return;
    const { type, targetItem, targetStatus, prevOrder, nextOrder } = cascadePromptState;
    setCascadePromptState(null);

    if (type === 'advance_children_to_in_progress') {
      executeStatusChange(targetItem.id, targetStatus, prevOrder, nextOrder);
    }
  };

  // Schema reconciliation handler
  const handleApplyReconciliation = async (dev: SchemaDeviation, fix: any) => {
    if (isReadOnly) return;
    try {
      const res = await apiFetch('/api/v1/items/reconcile', {
        method: 'POST',
        body: JSON.stringify({ deviation: dev, fix }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Error reconciling deviation:', err);
    }
  };

  const handleBatchReconcile = async (fixes: any[]) => {
    if (isReadOnly) return;
    try {
      const res = await apiFetch('/api/v1/items/reconcile/batch', {
        method: 'POST',
        body: JSON.stringify({ fixes }),
      });
      if (res.ok) {
        fetchData();
      }
    } catch (err) {
      console.error('Error batch reconciling:', err);
    }
  };

  // Child and rollup calculations
  const childCountMap = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach((it) => {
      if (it.parent_id) {
        map.set(it.parent_id, (map.get(it.parent_id) || 0) + 1);
      }
    });
    return map;
  }, [items]);

  const pointsRollupMap = useMemo(() => {
    const map = new Map<string, number>();
    const getSubtree = (id: string): number => {
      const children = items.filter((it) => it.parent_id === id);
      if (children.length === 0) {
        const item = items.find((it) => it.id === id);
        return Number(item?.metadata?.story_points ?? item?.metadata?.points ?? item?.metadata?.estimate ?? 0) || 0;
      }
      let sum = 0;
      for (const c of children) {
        sum += getSubtree(c.id);
      }
      return sum;
    };

    items.forEach((it) => {
      if ((childCountMap.get(it.id) || 0) > 0) {
        map.set(it.id, getSubtree(it.id));
      }
    });
    return map;
  }, [items, childCountMap]);

  // Board columns data
  const displayedStatuses = useMemo(() => {
    return projectSettings.statuses.filter((s) => effectiveSelectedStatuses.includes(s.id));
  }, [projectSettings.statuses, effectiveSelectedStatuses]);

  const columnsItemsMap = useMemo(() => {
    const map: Record<string, WorkItem[]> = {};
    displayedStatuses.forEach((s) => {
      map[s.id] = items
        .filter((it) => {
          if (it.status !== s.id) return false;
          if (!effectiveSelectedLevels.includes(it.item_type)) return false;
          if (selectedSprint !== 'all') {
            if (selectedSprint === '__none__') {
              return !it.metadata?.sprint;
            }
            return it.metadata?.sprint === selectedSprint;
          }
          return true;
        })
        .sort((a, b) => a.order_index - b.order_index);
    });
    return map;
  }, [displayedStatuses, items, effectiveSelectedLevels, selectedSprint]);

  const columnCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    Object.keys(columnsItemsMap).forEach((colId) => {
      counts[colId] = columnsItemsMap[colId].length;
    });
    return counts;
  }, [columnsItemsMap]);

  if (!loading && fetchError && !isAllProjects) {
    const isNotFound = fetchError.toLowerCase().includes('not found');

    return (
      <div className="min-h-screen flex items-center justify-center bg-[#090d16]">
        <div className="max-w-md text-center space-y-4 p-8">
          <XCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">
            {isNotFound ? 'Project Not Found' : 'Failed to Load'}
          </h2>
          <p className="text-sm text-slate-400">
            {isNotFound
              ? `Project "${projectSlug}" does not exist in workspace "@${tenantSlug}".`
              : fetchError}
          </p>
          <div className="flex items-center justify-center space-x-3">
            {isNotFound ? (
              <Link
                href={`/${tenantSlug}`}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
              >
                Go to Workspace
              </Link>
            ) : (
              <button
                onClick={fetchData}
                className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition-colors"
              >
                Try Again
              </button>
            )}
            <Link
              href={`/login?next=${encodeURIComponent(`/${tenantSlug}/${projectSlug}`)}`}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-sm font-medium transition-colors"
            >
              Sign In
            </Link>
          </div>
        </div>
      </div>
    );
  }

  const draggedItem = draggedItemId ? items.find((i) => i.id === draggedItemId) || null : null;

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100">
      {/* ── Top App Header ── */}
      <ProjectHeader
        tenantSlug={tenantSlug}
        projectSlug={projectSlug}
        allWorkspaces={allWorkspaces}
        allProjects={allProjects}
        isReadOnly={isReadOnly}
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenQuickAdd={() => setIsQuickAddOpen(true)}
        deviations={deviations}
        onOpenReconciliation={() => {
          setFocusedDeviationId(null);
          setIsReconciliationModalOpen(true);
        }}
        isRefreshing={isRefreshing}
        onRefresh={() => {
          fetchTenantInfo();
          fetchData();
        }}
        items={items}
        onSelectItem={(item) => setEditingItem(item)}
        loading={loading}
        currentUser={currentUser}
        tenantInfo={tenantInfo}
        onArchiveProject={() => setIsArchiveModalOpen(true)}
      />

      {/* ── Error banner ── */}
      {fetchError && !loading && (
        <div className="px-6 py-2 bg-red-950/60 border-b border-red-800/40 flex items-center space-x-2 text-sm text-red-300">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{fetchError}</span>
          <button
            onClick={() => setFetchError(null)}
            className="ml-auto text-red-400 hover:text-red-300"
          >
            ✕
          </button>
        </div>
      )}

      {/* ── Main Content ── */}
      <main className="flex-1 p-3 sm:p-4 md:p-6 main-mobile-clearance max-w-[1700px] mx-auto w-full max-w-full overflow-x-hidden">
        {activeTab === 'board' && (
          <BoardViewContainer
            hiddenBoardItems={hiddenBoardItems}
            dismissedBoardDeviationBanner={dismissedBoardDeviationBanner}
            setDismissedBoardDeviationBanner={setDismissedBoardDeviationBanner}
            onOpenReconciliation={() => {
              setFocusedDeviationId(null);
              setIsReconciliationModalOpen(true);
            }}
            isReadOnly={isReadOnly}
            loading={loading}
            tenantSlug={tenantSlug}
            projectSlug={projectSlug}
            statusFilterOptions={statusFilterOptions}
            effectiveSelectedStatuses={effectiveSelectedStatuses}
            setSelectedStatuses={setSelectedStatuses}
            levelFilterOptions={levelFilterOptions}
            effectiveSelectedLevels={effectiveSelectedLevels}
            setSelectedLevels={setSelectedLevels}
            selectedSprint={selectedSprint}
            setSelectedSprint={setSelectedSprint}
            availableSprints={availableSprints}
            items={items}
            projectSettings={projectSettings}
            pointMode={pointMode}
            handlePointModeChange={handlePointModeChange}
            boardHeightMode={boardHeight}
            setBoardHeightMode={setBoardHeight}
            collapsedColumnsUp={collapsedUp}
            toggleCollapseUp={toggleCollapseUp}
            collapsedColumnsSideways={collapsedSideways}
            toggleCollapseSideways={toggleCollapseSideways}
            collapseAllColumns={collapseAllColumns}
            expandAllColumns={expandAllColumns}
            boardScrollRef={boardScrollRef}
            handleBoardWheel={handleBoardWheel}
            displayedStatuses={displayedStatuses}
            columnCounts={columnCounts}
            columnsItemsMap={columnsItemsMap}
            quickAddColId={quickAddColId}
            setQuickAddColId={setQuickAddColId}
            quickAddTitle={quickAddTitle}
            setQuickAddTitle={setQuickAddTitle}
            isCreatingQuickItem={isCreatingQuickItem}
            handleCreateQuickInlineItem={handleCreateQuickInlineItem}
            draggedItemId={draggedItemId}
            dragOverTarget={dragOverTarget}
            childCountMap={childCountMap}
            pointsRollupMap={pointsRollupMap}
            getItemHierarchy={getItemHierarchy}
            allProjects={allProjects}
            isAllProjects={isAllProjects}
            setEditingItem={setEditingItem}
            setDeleteConfirmItem={setDeleteConfirmItem}
            handleUpdateStatus={handleUpdateStatus}
            handleUpdateType={handleUpdateType}
            getItemStatuses={getItemStatuses}
            handleDragStart={handleDragStart}
            handleDragEnd={handleDragEnd}
            handleDragOverCard={handleDragOverCard}
            handleDrop={handleDrop}
            handleDropOnColEnd={handleDropOnColEnd}
            unmappedItems={unmappedItems}
            draggedItem={draggedItem}
          />
        )}

        {activeTab === 'tree' && (
          <TreeViewContainer
            handleExpandAllTreeNodes={handleExpandAllTreeNodes}
            handleCollapseAllTreeNodes={handleCollapseAllTreeNodes}
            selectedSprint={selectedSprint}
            setSelectedSprint={setSelectedSprint}
            availableSprints={availableSprints}
            statusFilterOptions={statusFilterOptions}
            effectiveTreeStatuses={effectiveTreeStatuses}
            setTreeSelectedStatuses={setTreeSelectedStatuses}
            levelFilterOptions={levelFilterOptions}
            effectiveTreeLevels={effectiveTreeLevels}
            setTreeSelectedLevels={setTreeSelectedLevels}
            assigneeFilterOptions={assigneeFilterOptions}
            effectiveTreeAssignees={effectiveTreeAssignees}
            setTreeSelectedAssignees={setTreeSelectedAssignees}
            treeSortBy={treeSortBy}
            setTreeSortBy={setTreeSortBy}
            pointMode={pointMode}
            handlePointModeChange={handlePointModeChange}
            treeFilteredItems={treeFilteredItems}
            projectSettings={projectSettings}
            isReadOnly={isReadOnly}
            loading={loading}
            items={items}
            treeItems={treeItems}
            isTreeRootOver={isTreeRootOver}
            setIsTreeRootOver={setIsTreeRootOver}
            treeDraggedItemId={treeDraggedItemId}
            setTreeDraggedItemId={setTreeDraggedItemId}
            handleTreeReparent={handleTreeReparent}
            getStatusColor={getStatusColor}
            deviations={deviations}
            onOpenReconciliation={(dev) => {
              setFocusedDeviationId(dev?.id || null);
              setIsReconciliationModalOpen(true);
            }}
            getItemStatuses={getItemStatuses}
            getItemHierarchy={getItemHierarchy}
            workspaceMembers={workspaceMembers}
            getItemProjectSettings={getItemProjectSettings}
            collapsedTreeNodes={collapsedTreeNodes}
            handleToggleCollapseTreeNode={handleToggleCollapseTreeNode}
            handleUpdateStatus={handleUpdateStatus}
            handleTreeUpdateAssignee={handleTreeUpdateAssignee}
            handleTreeCreateChild={handleTreeCreateChild}
            setEditingItem={setEditingItem}
          />
        )}

        {activeTab === 'sprint' && (
          <SprintViewContainer
            items={items}
            projectSettings={projectSettings}
            isReadOnly={isReadOnly}
            pointMode={pointMode}
            handlePointModeChange={handlePointModeChange}
            sprintViewMode={sprintViewMode}
            setSprintViewMode={setSprintViewMode}
            handleToggleCollapseAllSprints={handleToggleCollapseAllSprints}
            collapsedSprints={collapsedSprints}
            toggleSprintCollapse={toggleSprintCollapse}
            handleToggleHideCompletedSprints={handleToggleHideCompletedSprints}
            hideCompletedSprints={hideCompletedSprints}
            hiddenCompletedSprintsCount={hiddenCompletedSprintsCount}
            statusFilterOptions={statusFilterOptions}
            effectiveSprintStatuses={effectiveSprintStatuses}
            setSprintSelectedStatuses={setSprintSelectedStatuses}
            levelFilterOptions={levelFilterOptions}
            effectiveSprintLevels={effectiveSprintLevels}
            setSprintSelectedLevels={setSprintSelectedLevels}
            sprintSortBy={sprintSortBy}
            setSprintSortBy={setSprintSortBy}
            setIsManageSprintsOpen={setIsManageSprintsOpen}
            visibleSprints={visibleSprints}
            availableSprints={availableSprints}
            filterSprintItems={filterSprintItems}
            sprintComparator={sprintComparator}
            selectedItemIds={selectedItemIds}
            handleToggleSelectItem={handleToggleSelectItem}
            handleSelectAllInPool={handleSelectAllInPool}
            activeSprintPopover={activeSprintPopover}
            setActiveSprintPopover={setActiveSprintPopover}
            setEditingItem={setEditingItem}
            getItemHierarchy={getItemHierarchy}
            getItemStatuses={getItemStatuses}
            deviations={deviations}
            setFocusedDeviationId={setFocusedDeviationId}
            setIsReconciliationModalOpen={setIsReconciliationModalOpen}
            isAllProjects={isAllProjects}
            allProjects={allProjects}
            handleUpdateStatus={handleUpdateStatus}
            handleUpdateItemSprint={handleUpdateItemSprint}
          />
        )}

        {activeTab === 'spark' && (
          <SparkViewContainer
            isReadOnly={isReadOnly}
            sparkOverrideProject={sparkOverrideProject}
            setSparkOverrideProject={setSparkOverrideProject}
            sparkOverrideSprint={sparkOverrideSprint}
            setSparkOverrideSprint={setSparkOverrideSprint}
            sparkOverrideAssignee={sparkOverrideAssignee}
            setSparkOverrideAssignee={setSparkOverrideAssignee}
            allProjects={allProjects}
            projectSlug={projectSlug}
            availableSprints={availableSprints}
            workspaceMembers={workspaceMembers}
            items={items}
            sparkPayload={sparkPayload}
            setSparkPayload={setSparkPayload}
            isIngesting={isIngesting}
            handleRunSparkIngest={handleRunSparkIngest}
            ingestResponse={ingestResponse}
            ingestedAffectedItemCount={ingestedAffectedItemCount}
            onOpenReconciliation={() => {
              setFocusedDeviationId(null);
              setIsReconciliationModalOpen(true);
            }}
          />
        )}

        {activeTab === 'schema' && (
          <SchemaViewContainer
            isReadOnly={isReadOnly}
            isAllProjects={isAllProjects}
            allProjects={allProjects}
            selectedSchemaProjectSlug={selectedSchemaProjectSlug}
            setSelectedSchemaProjectSlug={setSelectedSchemaProjectSlug}
            activeSchemaSettings={activeSchemaSettings}
            handleSaveSchema={handleSaveSchema}
            isSavingSchema={isSavingSchema}
            setIsArchiveModalOpen={setIsArchiveModalOpen}
          />
        )}
      </main>

      {/* Project Modals Orchestrator */}
      <ProjectModals
        isReadOnly={isReadOnly}
        tenantSlug={tenantSlug}
        projectSlug={projectSlug}
        items={items}
        allProjects={allProjects}
        projectSettings={projectSettings}
        modalProjectSettings={modalProjectSettings}
        currentUser={currentUser}
        workspaceMembers={workspaceMembers}
        editingItem={editingItem}
        setEditingItem={setEditingItem}
        handleSaveModalItem={handleSaveModalItem}
        handleDeleteItem={handleDeleteItem}
        handleModalCreateChildItem={async (payload) => {
          return await handleCreateItem(payload);
        }}
        fetchData={fetchData}
        isQuickAddOpen={isQuickAddOpen}
        setIsQuickAddOpen={setIsQuickAddOpen}
        quickAddInitialStatus={quickAddInitialStatus}
        setQuickAddInitialStatus={setQuickAddInitialStatus}
        quickAddInitialSprint={quickAddInitialSprint}
        setQuickAddInitialSprint={setQuickAddInitialSprint}
        quickAddParentItem={quickAddParentItem}
        setQuickAddParentItem={setQuickAddParentItem}
        handleCreateItem={async (payload) => {
          await handleCreateItem(payload);
        }}
        deleteConfirmItem={deleteConfirmItem}
        setDeleteConfirmItem={setDeleteConfirmItem}
        showCascadeCompletionModal={!!cascadeCompletionState}
        setShowCascadeCompletionModal={(open) => !open && setCascadeCompletionState(null)}
        cascadeStatusTarget={
          cascadeCompletionState
            ? { item: cascadeCompletionState.parentItem, newStatus: cascadeCompletionState.targetStatus }
            : null
        }
        setCascadeStatusTarget={() => {}}
        cascadeStatusChildren={cascadeCompletionState?.unfinishedChildren || []}
        setCascadeStatusChildren={() => {}}
        handleExecuteCascadeCompletion={handleExecuteCascadeCompletion}
        handleExecuteKeepParentOnly={handleExecuteKeepParentOnly}
        showCascadePromptModal={!!cascadePromptState}
        setShowCascadePromptModal={(open) => !open && setCascadePromptState(null)}
        cascadePromptTarget={
          cascadePromptState
            ? { item: cascadePromptState.targetItem, newStatus: cascadePromptState.targetStatus }
            : null
        }
        setCascadePromptTarget={() => {}}
        cascadePromptChildren={cascadePromptState?.relatedItems || []}
        setCascadePromptChildren={() => {}}
        handleExecuteCascadePrompt={handleExecuteCascadePrompt}
        handleExecuteKeepParentOnlyPrompt={handleExecuteKeepParentOnlyPrompt}
        isArchiveModalOpen={isArchiveModalOpen}
        setIsArchiveModalOpen={setIsArchiveModalOpen}
        currentProject={allProjects.find((p) => p.slug === projectSlug)}
        handleArchiveProject={handleArchiveCurrentProject}
        isReconciliationModalOpen={isReconciliationModalOpen}
        setIsReconciliationModalOpen={setIsReconciliationModalOpen}
        deviations={deviations}
        focusedDeviationId={focusedDeviationId}
        setFocusedDeviationId={setFocusedDeviationId}
        handleApplyReconciliation={handleApplyReconciliation}
        handleBatchReconcile={handleBatchReconcile}
        isManageSprintsOpen={isManageSprintsOpen}
        setIsManageSprintsOpen={setIsManageSprintsOpen}
        handleSaveSprints={handleSaveSprints}
        isSearchOpen={isSearchOpen}
        setIsSearchOpen={setIsSearchOpen}
      />

      {/* Floating Multi-Item Bulk Actions Toolbar */}
      {!isReadOnly && activeTab === 'sprint' && selectedItemIds.size > 0 && (
        <BulkActionsToolbar
          selectedCount={selectedItemIds.size}
          availableSprints={availableSprints}
          statuses={projectSettings.statuses || []}
          projects={allProjects}
          currentProjectId={allProjects.find((p) => p.slug === projectSlug)?.id}
          onMoveToSprint={handleBulkMoveSprint}
          onSetStatus={handleBulkSetStatus}
          onAssignMember={handleBulkAssign}
          onAdjustPoints={handleBulkAdjustPoints}
          onChangeProject={handleBulkChangeProject}
          onDeleteSelected={handleBulkDelete}
          onClearSelection={handleDeselectAll}
          isApplying={isBulkApplying}
        />
      )}

      {/* Floating Bulk Toast Notification */}
      {bulkToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg bg-slate-900 text-slate-100 border border-slate-700 shadow-xl text-xs flex items-center space-x-2 animate-in fade-in slide-in-from-bottom-2 duration-200"
        >
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span>{bulkToast}</span>
        </div>
      )}

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        activeTab={activeTab}
        onTabChange={handleTabChange}
        pointMode={pointMode}
        onPointModeChange={handlePointModeChange}
      />
    </div>
  );
}
