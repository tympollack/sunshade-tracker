'use client';

import { use, useEffect, useState, useCallback, useMemo, useRef } from 'react';
import Link from 'next/link';
import {
  Layers,
  Kanban,
  GitFork,
  Cpu,
  Settings,
  Plus,
  RefreshCw,
  User,
  ArrowRight,
  Code2,
  Send,
  AlertCircle,
  Hash,
  Trash2,
  XCircle,
  Pencil,
  ChevronsLeftRight,
  ChevronUp,
  ChevronDown,
  ChevronRight,
  Minimize2,
  GripVertical,
  Calendar,
} from 'lucide-react';
import { WorkItem, WorkItemNode, ProjectSettings, StatusDefinition } from '@/types/tracker';
import { buildTree } from '@/lib/tree';
import { calculateOrderIndex } from '@/lib/fractional-index';
import { getHierarchyLevelColor, getDefaultLevelHex } from '@/lib/hierarchy-colors';
import { TreeNode } from '@/components/TreeNode';
import { UserMenu } from '@/components/UserMenu';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import { SunShadeLogo } from '@/components/SunShadeLogo';
import { BoardSkeleton } from '@/components/LoadingSkeleton';
import { FilterMultiSelect, FilterOption } from '@/components/FilterMultiSelect';
import { WorkItemModal } from '@/components/WorkItemModal';
import { JsonSchemaEditor } from '@/components/JsonSchemaEditor';

interface PageProps {
  params: Promise<{
    tenantSlug: string;
    projectSlug: string;
  }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}

interface TenantInfo {
  id: string;
  slug: string;
  name: string;
  tier: string;
  api_key_preview: string | null;
}

interface ProjectInfo {
  id: string;
  slug: string;
  name: string;
}

export default function ProjectTrackerDashboard(props: PageProps) {
  const { tenantSlug, projectSlug } = use(props.params);
  const isAllProjects = projectSlug === 'all';
  const searchParams = props.searchParams ? use(props.searchParams) : {};
  const requestedTab =
    typeof searchParams?.tab === 'string' &&
    ['board', 'tree', 'sprint', 'spark', 'schema'].includes(searchParams.tab)
      ? (searchParams.tab as 'board' | 'tree' | 'sprint' | 'spark' | 'schema')
      : 'board';

  const [activeTab, setActiveTab] = useState<'board' | 'tree' | 'sprint' | 'spark' | 'schema'>(requestedTab);

  const handleTabChange = (tab: 'board' | 'tree' | 'sprint' | 'spark' | 'schema') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (tab === 'board') {
        url.searchParams.delete('tab');
      } else {
        url.searchParams.set('tab', tab);
      }
      window.history.replaceState({}, '', url.toString());
    }
  };

  useEffect(() => {
    if (
      typeof searchParams?.tab === 'string' &&
      ['board', 'tree', 'sprint', 'spark', 'schema'].includes(searchParams.tab)
    ) {
      setActiveTab(searchParams.tab as any);
    }
  }, [searchParams?.tab]);

  const [selectedSprint, setSelectedSprint] = useState<string>('all');
  const [items, setItems] = useState<WorkItem[]>([]);
  const treeItems = useMemo(() => buildTree(items), [items]);
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

  // Quick Add form state
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemType, setNewItemType] = useState('task');
  const [newItemStatus, setNewItemStatus] = useState('not_started');
  const [newItemAssignee, setNewItemAssignee] = useState('');
  const [newItemExtRef, setNewItemExtRef] = useState('');
  const [newItemProjectSlug, setNewItemProjectSlug] = useState('');

  // User & Workspace Members
  const [currentUser, setCurrentUser] = useState<{ id?: string; email?: string; full_name?: string } | null>(null);
  const [workspaceMembers, setWorkspaceMembers] = useState<{ user_id: string; full_name: string; email?: string }[]>([]);
  const [assigneeDropdownOpen, setAssigneeDropdownOpen] = useState(false);
  const assigneeDropdownRef = useRef<HTMLDivElement>(null);

  // Board View Controls
  const [boardHeight, setBoardHeight] = useState<'compact' | 'standard' | 'full'>('standard');
  const [collapsedSideways, setCollapsedSideways] = useState<Set<string>>(new Set());
  const [collapsedUp, setCollapsedUp] = useState<Set<string>>(new Set());

  // Filter States: null means unconfigured/all-selected (default), [] means explicitly none selected
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

  // Derive all available sprints from projectSettings and items
  const availableSprints = useMemo(() => {
    const set = new Set<string>();
    (projectSettings.sprint_settings?.sprints || []).forEach((s: any) => {
      if (s.name) set.add(s.name);
    });
    items.forEach((it) => {
      if (it.metadata?.sprint) {
        set.add(String(it.metadata.sprint));
      }
    });
    return Array.from(set).sort();
  }, [items, projectSettings.sprint_settings]);

  // Set default sprint based on projectSettings.sprint_settings
  useEffect(() => {
    if (projectSettings.sprint_settings?.default_sprint) {
      const def = projectSettings.sprint_settings.default_sprint;
      if (def === 'all') {
        setSelectedSprint('all');
      } else if (def === 'current') {
        const curr = projectSettings.sprint_settings.sprints?.find((s: any) => s.is_current)?.name;
        if (curr) {
          setSelectedSprint(curr);
        } else if (availableSprints.length > 0) {
          setSelectedSprint(availableSprints[0]);
        }
      } else if (availableSprints.includes(def)) {
        setSelectedSprint(def);
      }
    }
  }, [projectSettings.sprint_settings, availableSprints]);

  // Reset filters when switching to a different project
  useEffect(() => {
    setSelectedStatuses(null);
    setSelectedLevels(null);
    setSelectedSprint('all');
  }, [projectSlug]);

  // Drag & Drop
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverTarget, setDragOverTarget] = useState<{ colId: string; index: number } | null>(null);

  // Edit Modal
  const [editingItem, setEditingItem] = useState<WorkItem | null>(null);

  const myDisplayName = useMemo(() => {
    if (currentUser?.full_name) return `Me (${currentUser.full_name})`;
    if (currentUser?.email) return `Me (${currentUser.email.split('@')[0]})`;
    return 'Me';
  }, [currentUser]);

  // Click outside for assignee dropdown
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (assigneeDropdownRef.current && !assigneeDropdownRef.current.contains(e.target as Node)) {
        setAssigneeDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // ─── Session-authenticated fetch with workspace context ─────────────────
  const apiFetch = useCallback(
    (path: string, options?: RequestInit) =>
      fetch(path, {
        ...options,
        credentials: 'include', // send session cookies
        headers: {
          'Content-Type': 'application/json',
          // Tell the auth guard which workspace we're operating in
          'x-tenant-slug': tenantSlug,
          ...(options?.headers || {}),
        },
      }),
    [tenantSlug]
  );

  // ─── Load all workspaces + set current tenant info ───────────────────────
  const fetchTenantInfo = useCallback(async () => {
    const res = await apiFetch('/api/v1/tenants/me');
    if (res.ok) {
      const data = await res.json();
      if (data.user) {
        setCurrentUser(data.user);
        const name = data.user.full_name
          ? `Me (${data.user.full_name})`
          : data.user.email
          ? `Me (${data.user.email.split('@')[0]})`
          : 'Me';
        setNewItemAssignee((prev) => (!prev ? name : prev));
      }
      // data.workspaces is an array of all the user's workspaces
      setAllWorkspaces(data.workspaces || []);
      // Identify the current workspace from the URL slug
      const currentWs = (data.workspaces || []).find((w: any) => w.slug === tenantSlug);
      const ws = currentWs || data.primary_workspace;
      if (ws) {
        setTenantInfo({
          id: ws.id,
          slug: ws.slug,
          name: ws.name,
          tier: ws.tier,
          api_key_preview: ws.api_key_preview,
        });
        setAllProjects(ws.projects || []);
        if (ws.members) {
          setWorkspaceMembers(ws.members);
        }
      }
    }
  }, [apiFetch, tenantSlug]);

  // ─── Load project settings + items ───────────────────────────────────────
  const fetchData = useCallback(async () => {
    setIsRefreshing(true);
    setFetchError(null);
    try {
      // Fetch project settings
      const settingsRes = await apiFetch(
        `/api/v1/projects?tenant_slug=${tenantSlug}`
      );
      if (settingsRes.ok) {
        const sData = await settingsRes.json();
        if (Array.isArray(sData.projects)) {
          setAllProjects(sData.projects);
          if (sData.projects.length > 0) {
            setNewItemProjectSlug((prev) => prev || sData.projects[0].slug);
          }
        }
        if (!isAllProjects) {
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
                  setNewItemStatus((prev) => {
                    const exists = detail.settings.statuses.some((s: any) => s.id === prev);
                    return exists ? prev : detail.settings.statuses[0].id;
                  });
                  setSelectedStatuses((prev) => {
                    if (prev === null) return null;
                    const validIds = new Set(detail.settings.statuses.map((s: any) => s.id));
                    return prev.filter((id) => validIds.has(id));
                  });
                }
                if (detail.settings.hierarchy?.length) {
                  setNewItemType((prev) => {
                    const exists = detail.settings.hierarchy.some((h: any) => h.type === prev);
                    return exists
                      ? prev
                      : detail.settings.hierarchy[detail.settings.hierarchy.length - 1].type;
                  });
                  setSelectedLevels((prev) => {
                    if (prev === null) return null;
                    const validTypes = new Set(detail.settings.hierarchy.map((h: any) => h.type));
                    return prev.filter((t) => validTypes.has(t));
                  });
                }
              }
            }
          }
        }
      }

      // Fetch items (session-authenticated)
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

  const handleSaveSchema = async (newSettings: ProjectSettings) => {
    setIsSavingSchema(true);
    try {
      const res = await apiFetch(`/api/v1/projects/${projectSlug}/settings`, {
        method: 'PUT',
        body: JSON.stringify({ settings: newSettings }),
      });
      if (res.ok) {
        setProjectSettings(newSettings);
      } else {
        const err = await res.json().catch(() => ({}));
        console.error('Failed to update schema:', err);
      }
    } catch (err) {
      console.error('Network error updating schema:', err);
    } finally {
      setIsSavingSchema(false);
    }
  };

  useEffect(() => {
    fetchTenantInfo();
    fetchData();
  }, [fetchTenantInfo, fetchData]);

  // ─── Update item status ──────────────────────────────────────────────────
  const handleUpdateStatus = async (itemId: string, newStatus: string) => {
    // Optimistic update
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, status: newStatus } : it))
    );
    try {
      const res = await apiFetch('/api/v1/items', {
        method: 'PATCH',
        body: JSON.stringify({ id: itemId, status: newStatus }),
      });
      if (!res.ok) {
        // Revert on failure
        fetchData();
      }
    } catch {
      fetchData();
    }
  };

  // ─── Update item sprint ──────────────────────────────────────────────────
  const handleUpdateItemSprint = async (itemId: string, newSprint: string | null) => {
    const item = items.find((it) => it.id === itemId);
    if (!item) return;

    const newMetadata = { ...(item.metadata || {}) };
    if (newSprint && newSprint !== '__none__') {
      newMetadata.sprint = newSprint;
    } else {
      delete newMetadata.sprint;
    }

    // Optimistic update
    setItems((prev) =>
      prev.map((it) => (it.id === itemId ? { ...it, metadata: newMetadata } : it))
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

  // ─── Update item hierarchy type / level ──────────────────────────────────
  const handleUpdateType = async (itemId: string, newType: string) => {
    const item = items.find((it) => it.id === itemId);
    if (!item) return;

    // Check if current parent is valid for newType
    const newHierarchyConfig = projectSettings.hierarchy.find((h) => h.type === newType);
    const allowedParents = newHierarchyConfig?.allowed_parents || [];
    let newParentId = item.parent_id;

    if (item.parent_id) {
      const parentItem = items.find((it) => it.id === item.parent_id);
      if (parentItem && !allowedParents.includes(parentItem.item_type)) {
        newParentId = null; // Clear incompatible parent
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

  // ─── Save work item from modal ───────────────────────────────────────────
  const handleSaveModalItem = async (itemId: string, updates: Partial<WorkItem>) => {
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
  };

  // ─── Delete item ─────────────────────────────────────────────────────────
  const handleDeleteItem = async (itemId: string): Promise<boolean> => {
    if (!confirm('Delete this item? This cannot be undone.')) return false;
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

  // ─── Drag and Drop Handlers ──────────────────────────────────────────────
  const handleDragStart = (e: React.DragEvent, item: WorkItem) => {
    e.dataTransfer.setData('text/plain', item.id);
    e.dataTransfer.effectAllowed = 'move';
    setDraggedItemId(item.id);
  };

  const handleDragOverColumn = (e: React.DragEvent, colId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverTarget({ colId, index: -1 });
  };

  const handleDragOverCard = (e: React.DragEvent, colId: string, index: number) => {
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
    const itemId = e.dataTransfer.getData('text/plain') || draggedItemId;
    if (!itemId) return;

    const item = items.find((i) => i.id === itemId);
    if (!item) return;

    // All items in the target column sorted by order_index, excluding the dragged item
    const allColItems = items
      .filter((it) => it.status === targetColId && it.id !== itemId)
      .sort((a, b) => a.order_index - b.order_index);

    // Visible items in the target column based on current hierarchy and sprint filters
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

    const newOrder = calculateOrderIndex(prevItem?.order_index, nextItem?.order_index);

    // Optimistically update and keep items sorted by order_index
    setItems((prev) =>
      prev
        .map((it) =>
          it.id === itemId ? { ...it, status: targetColId, order_index: newOrder } : it
        )
        .sort((a, b) => a.order_index - b.order_index)
    );

    setDraggedItemId(null);
    setDragOverTarget(null);

    try {
      const res = await apiFetch('/api/v1/items', {
        method: 'PATCH',
        body: JSON.stringify({
          id: itemId,
          status: targetColId,
          prev_order: prevItem?.order_index,
          next_order: nextItem?.order_index,
        }),
      });
      if (!res.ok) fetchData();
    } catch {
      fetchData();
    }
  };

  // ─── Column Collapse Toggles ─────────────────────────────────────────────
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

  const handleToggleCollapseAll = () => {
    if (collapsedSideways.size > 0) {
      setCollapsedSideways(new Set());
    } else {
      setCollapsedSideways(new Set(projectSettings.statuses.map((s) => s.id)));
    }
  };

  // ─── Filter Options and Lookups ──────────────────────────────────────────
  const statusFilterOptions: FilterOption[] = useMemo(() => {
    return projectSettings.statuses.map((s) => ({
      id: s.id,
      label: s.label,
      color: s.color,
      count: items.filter((it) => it.status === s.id).length,
    }));
  }, [projectSettings.statuses, items]);

  const levelFilterOptions: FilterOption[] = useMemo(() => {
    return projectSettings.hierarchy.map((h) => ({
      id: h.type,
      label: h.label,
      color: getHierarchyLevelColor(h.type, projectSettings.hierarchy).hex,
      count: items.filter((it) => it.item_type === h.type).length,
    }));
  }, [projectSettings.hierarchy, items]);

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

  // ─── Create item ─────────────────────────────────────────────────────────
  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemTitle.trim()) return;
    const targetProjectSlug = isAllProjects
      ? (newItemProjectSlug || allProjects[0]?.slug || 'sunshade-tracker')
      : projectSlug;
    try {
      const res = await apiFetch('/api/v1/items', {
        method: 'POST',
        body: JSON.stringify({
          project_slug: targetProjectSlug,
          title: newItemTitle,
          item_type: newItemType,
          status: newItemStatus,
          assignee: newItemAssignee || null,
          external_ref_id: newItemExtRef || null,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.item) {
          setItems((prev) => [...prev, data.item]);
          setNewItemTitle('');
          setNewItemExtRef('');
        }
      }
    } catch (err) {
      console.error('Error creating item:', err);
    }
  };

  // ─── Gemini Spark ingest ─────────────────────────────────────────────────
  const handleRunSparkIngest = async () => {
    setIsIngesting(true);
    setIngestResponse(null);
    try {
      const parsed = JSON.parse(sparkPayload);
      // Now uses session-based apiFetch — the ingest endpoint accepts both
      // session cookies (dashboard) and Bearer API keys (headless pipelines)
      const res = await apiFetch('/api/v1/items/ingest', {
        method: 'POST',
        body: JSON.stringify(parsed),
      });
      const data = await res.json();
      setIngestResponse(data);
      if (data.success) fetchData();
    } catch (err: any) {
      setIngestResponse({ error: err.message || 'Failed to parse/send payload' });
    } finally {
      setIsIngesting(false);
    }
  };

  const getStatusColor = (statusId: string) => {
    const s = projectSettings.statuses.find((st: StatusDefinition) => st.id === statusId);
    return s?.color || '#94a3b8';
  };

  // ─── Error state ─────────────────────────────────────────────────────────
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

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100">
      {/* ── Top App Header ──────────────────────────────────────────────── */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center space-x-2">
          <SunShadeLogo variant="horizontal" size="xs" href="/" className="mr-1" />
          <span className="text-slate-700">/</span>
          {/* Workspace Switcher */}
          <WorkspaceSwitcher
            currentTenantSlug={tenantSlug}
            workspaces={allWorkspaces}
          />
          <span className="text-slate-700">/</span>
          {/* Project Switcher */}
          <ProjectSwitcher
            tenantSlug={tenantSlug}
            currentProjectSlug={projectSlug}
            projects={allProjects}
          />
        </div>

        <div className="flex items-center space-x-3">
          {/* View tabs */}
          <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 p-1 rounded-lg text-xs">
            {(['board', 'tree', 'sprint', 'spark', 'schema'] as const).map((tab) => {
              const icons = {
                board: <Kanban className="w-3.5 h-3.5" />,
                tree: <GitFork className="w-3.5 h-3.5" />,
                sprint: <Calendar className="w-3.5 h-3.5" />,
                spark: <Cpu className="w-3.5 h-3.5" />,
                schema: <Settings className="w-3.5 h-3.5" />,
              };
              const labels = {
                board: 'Board',
                tree: 'Hierarchy Tree',
                sprint: 'Sprint Planning',
                spark: 'Gemini Spark Ingestion',
                schema: 'Dynamic Schema',
              };
              return (
                <button
                  key={tab}
                  onClick={() => handleTabChange(tab)}
                  className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                    activeTab === tab
                      ? 'bg-emerald-500 text-slate-950 shadow'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  {icons[tab]}
                  <span className="hidden md:block">{labels[tab]}</span>
                </button>
              );
            })}
          </div>

          {/* Refresh */}
          <button
            onClick={() => {
              fetchTenantInfo();
              fetchData();
            }}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          {/* User Menu */}
          {tenantInfo ? (
            <UserMenu
              tenantName={tenantInfo.name}
              tenantSlug={tenantInfo.slug}
              apiKeyPreview={tenantInfo.api_key_preview ?? undefined}
            />
          ) : (
            <Link
              href="/login"
              className="text-xs px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-medium transition-colors"
            >
              Sign In
            </Link>
          )}
        </div>
      </header>

      {/* ── Error banner ───────────────────────────────────────────────── */}
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

      {/* ── Main Content ───────────────────────────────────────────────── */}
      <main className="flex-1 p-6 max-w-[1700px] mx-auto w-full">
        {/* TAB 1: KANBAN BOARD */}
        {activeTab === 'board' && (
          <div className="space-y-4">
            {/* Quick Add Form */}
            <form
              onSubmit={handleCreateItem}
              className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-wrap items-center gap-3"
            >
              {isAllProjects && allProjects.length > 0 && (
                <select
                  value={newItemProjectSlug || allProjects[0]?.slug}
                  onChange={(e) => setNewItemProjectSlug(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-emerald-300 focus:outline-none focus:border-emerald-500 font-sans cursor-pointer font-medium"
                >
                  {allProjects.map((p) => (
                    <option key={p.id} value={p.slug}>
                      {p.name}
                    </option>
                  ))}
                </select>
              )}

              <div className="flex-1 min-w-[240px]">
                <input
                  type="text"
                  placeholder="New item title (e.g. Implement Webhook Dispatcher)..."
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500 font-sans transition-colors"
                />
              </div>

              {/* Item Hierarchy Type */}
              <select
                value={newItemType}
                onChange={(e) => setNewItemType(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-emerald-500 font-mono cursor-pointer"
              >
                {projectSettings.hierarchy.map((h) => (
                  <option key={h.type} value={h.type}>
                    {h.label} (Level {h.level})
                  </option>
                ))}
              </select>

              {/* Item Status */}
              <select
                value={newItemStatus}
                onChange={(e) => setNewItemStatus(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-emerald-500 font-mono cursor-pointer"
              >
                {projectSettings.statuses.map((s: StatusDefinition) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>

              {/* Assignee Dropdown Picker */}
              <div className="relative" ref={assigneeDropdownRef}>
                <button
                  type="button"
                  onClick={() => setAssigneeDropdownOpen((v) => !v)}
                  className="flex items-center space-x-1.5 px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 hover:border-slate-700 rounded-lg text-slate-200 focus:outline-none transition-colors max-w-[190px]"
                >
                  <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span className="truncate">{newItemAssignee || 'Unassigned'}</span>
                  <ChevronDown
                    className={`w-3 h-3 text-slate-500 shrink-0 transition-transform ${
                      assigneeDropdownOpen ? 'rotate-180' : ''
                    }`}
                  />
                </button>

                {assigneeDropdownOpen && (
                  <div className="absolute left-0 top-full mt-1.5 w-60 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/80 z-50 p-1.5 space-y-1">
                    <div className="px-2 py-1 text-[10px] font-semibold text-slate-400 uppercase tracking-wider">
                      Select Assignee
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setNewItemAssignee(myDisplayName);
                        setAssigneeDropdownOpen(false);
                      }}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors ${
                        newItemAssignee === myDisplayName
                          ? 'bg-emerald-500/15 text-emerald-300 font-medium'
                          : 'text-slate-300 hover:bg-slate-800'
                      }`}
                    >
                      <User className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                      <span className="truncate">{myDisplayName}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        setNewItemAssignee('');
                        setAssigneeDropdownOpen(false);
                      }}
                      className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors ${
                        !newItemAssignee
                          ? 'bg-slate-800 text-white font-medium'
                          : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
                      }`}
                    >
                      <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>Unassigned</span>
                    </button>

                    {workspaceMembers.length > 0 && (
                      <div className="pt-1 border-t border-slate-800">
                        <div className="px-2 py-0.5 text-[9px] font-semibold text-slate-500 uppercase tracking-wider">
                          Workspace Members
                        </div>
                        {workspaceMembers
                          .filter((m) => m.full_name && m.full_name !== myDisplayName)
                          .map((m) => (
                            <button
                              key={m.user_id}
                              type="button"
                              onClick={() => {
                                setNewItemAssignee(m.full_name);
                                setAssigneeDropdownOpen(false);
                              }}
                              className={`w-full flex items-center space-x-2 px-2.5 py-1.5 rounded-lg text-xs text-left transition-colors ${
                                newItemAssignee === m.full_name
                                  ? 'bg-emerald-500/15 text-emerald-300 font-medium'
                                  : 'text-slate-300 hover:bg-slate-800'
                              }`}
                            >
                              <div className="w-4 h-4 rounded-full bg-slate-800 text-slate-300 flex items-center justify-center text-[9px] font-bold">
                                {m.full_name[0]?.toUpperCase() || 'M'}
                              </div>
                              <span className="truncate">{m.full_name}</span>
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* External Ref ID */}
              <input
                type="text"
                placeholder="Ref (e.g. SPEC-01)"
                value={newItemExtRef}
                onChange={(e) => setNewItemExtRef(e.target.value)}
                className="w-32 px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500 font-mono"
              />

              <button
                type="submit"
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </form>

            {/* Board Controls Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 px-1 py-1">
              <div className="flex items-center flex-wrap gap-2">
                <FilterMultiSelect
                  label="Status"
                  options={statusFilterOptions}
                  selectedIds={effectiveSelectedStatuses}
                  onChange={setSelectedStatuses}
                />
                <FilterMultiSelect
                  label="Level"
                  options={levelFilterOptions}
                  selectedIds={effectiveSelectedLevels}
                  onChange={setSelectedLevels}
                />
                <div className="flex items-center space-x-1.5 bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-[11px] font-medium text-slate-400">Sprint:</span>
                  <select
                    value={selectedSprint}
                    onChange={(e) => setSelectedSprint(e.target.value)}
                    className="bg-transparent text-xs text-slate-200 focus:outline-none cursor-pointer"
                  >
                    <option value="all" className="bg-slate-900 text-slate-200">All Sprints</option>
                    <option value="__none__" className="bg-slate-900 text-slate-200">Backlog (No Sprint)</option>
                    {availableSprints.map((s) => (
                      <option key={s} value={s} className="bg-slate-900 text-slate-200">
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                {(effectiveSelectedStatuses.length < projectSettings.statuses.length ||
                  effectiveSelectedLevels.length < projectSettings.hierarchy.length ||
                  selectedSprint !== 'all') && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedStatuses(null);
                      setSelectedLevels(null);
                      setSelectedSprint('all');
                    }}
                    className="text-[11px] text-emerald-400 hover:text-emerald-300 font-medium px-2 py-1 rounded hover:bg-slate-800 transition-colors"
                  >
                    Reset Filters
                  </button>
                )}
              </div>

              <div className="flex items-center space-x-3">
                {/* Board Height Presets */}
                <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 p-0.5 rounded-lg text-xs">
                  <span className="text-[10px] uppercase font-semibold text-slate-500 px-2">Height:</span>
                  {(['compact', 'standard', 'full'] as const).map((h) => (
                    <button
                      key={h}
                      type="button"
                      onClick={() => setBoardHeight(h)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                        boardHeight === h
                          ? 'bg-slate-800 text-white shadow-sm'
                          : 'text-slate-400 hover:text-slate-200'
                      }`}
                      title={`${h.charAt(0).toUpperCase() + h.slice(1)} board height`}
                    >
                      {h.charAt(0).toUpperCase() + h.slice(1)}
                    </button>
                  ))}
                </div>

                {/* Collapse / Expand all */}
                <button
                  type="button"
                  onClick={handleToggleCollapseAll}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 text-xs transition-colors flex items-center space-x-1.5"
                  title="Toggle collapse all columns sideways"
                >
                  <ChevronsLeftRight className="w-3.5 h-3.5 text-slate-400" />
                  <span>{collapsedSideways.size > 0 ? 'Expand All' : 'Collapse All'}</span>
                </button>
              </div>
            </div>

            {/* Board columns container */}
            {loading ? (
              <BoardSkeleton />
            ) : (
              <div
                className={`flex flex-row items-start gap-4 overflow-x-auto pb-4 pt-1 select-none ${
                  boardHeight === 'compact'
                    ? 'h-[440px]'
                    : boardHeight === 'full'
                    ? 'h-[calc(100vh-250px)]'
                    : 'h-[620px]'
                }`}
              >
                {projectSettings.statuses
                  .filter((col) => effectiveSelectedStatuses.includes(col.id))
                  .map((col: StatusDefinition) => {
                    const colItems = items
                      .filter((it) => {
                        if (it.status !== col.id) return false;
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

                    const isCollapsedSideways = collapsedSideways.has(col.id);
                    const isCollapsedUp = collapsedUp.has(col.id);

                    // ── Case 1: Column Collapsed Sideways ──
                    if (isCollapsedSideways) {
                      return (
                        <div
                          key={col.id}
                          onClick={() => toggleCollapseSideways(col.id)}
                          onDragOver={(e) => handleDragOverColumn(e, col.id)}
                          onDrop={(e) => handleDrop(e, col.id)}
                          className={`w-14 min-w-[56px] max-w-[56px] shrink-0 h-full rounded-xl bg-slate-900/60 border cursor-pointer hover:border-slate-600 transition-all flex flex-col items-center justify-between py-4 shadow-sm group ${
                            dragOverTarget?.colId === col.id
                              ? 'border-emerald-500 bg-emerald-500/10'
                              : 'border-slate-800/80'
                          }`}
                          title={`Click to expand ${col.label}`}
                        >
                          <div className="flex flex-col items-center space-y-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: col.color }}
                            />
                            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-white transition-colors" />
                          </div>

                          <div className="[writing-mode:vertical-rl] rotate-180 text-xs font-semibold tracking-wider uppercase text-slate-300 whitespace-nowrap py-4">
                            {col.label}
                          </div>

                          <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono">
                            {colItems.length}
                          </span>
                        </div>
                      );
                    }

                    // ── Case 2: Column Collapsed Upward (Header only) ──
                    if (isCollapsedUp) {
                      return (
                        <div
                          key={col.id}
                          className="w-80 min-w-[320px] max-w-[320px] shrink-0 bg-slate-900/40 border border-slate-800/80 rounded-xl flex flex-col shadow-sm"
                        >
                          <div className="px-4 py-3 flex items-center justify-between">
                            <div className="flex items-center space-x-2">
                              <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{ backgroundColor: col.color }}
                              />
                              <span className="font-semibold text-xs tracking-wider uppercase text-slate-200">
                                {col.label}
                              </span>
                              <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                                {colItems.length}
                              </span>
                            </div>

                            <div className="flex items-center space-x-1">
                              <button
                                type="button"
                                onClick={() => toggleCollapseUp(col.id)}
                                className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
                                title="Expand column downward"
                              >
                                <ChevronDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => toggleCollapseSideways(col.id)}
                                className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
                                title="Collapse column sideways"
                              >
                                <Minimize2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    // ── Case 3: Expanded Full Column ──
                    return (
                      <div
                        key={col.id}
                        onDragOver={(e) => handleDragOverColumn(e, col.id)}
                        onDrop={(e) => handleDrop(e, col.id)}
                        className={`w-80 min-w-[320px] max-w-[320px] shrink-0 bg-slate-900/40 border rounded-xl flex flex-col h-full shadow-sm transition-colors ${
                          dragOverTarget?.colId === col.id && dragOverTarget?.index === -1
                            ? 'border-emerald-500/70 bg-emerald-500/5'
                            : 'border-slate-800/80'
                        }`}
                      >
                        {/* Column Header */}
                        <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between shrink-0 bg-slate-950/40 rounded-t-xl">
                          <div className="flex items-center space-x-2">
                            <span
                              className="w-2.5 h-2.5 rounded-full"
                              style={{ backgroundColor: col.color }}
                            />
                            <span className="font-semibold text-xs tracking-wider uppercase text-slate-200">
                              {col.label}
                            </span>
                            <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                              {colItems.length}
                            </span>
                          </div>

                          <div className="flex items-center space-x-1">
                            <button
                              type="button"
                              onClick={() => toggleCollapseUp(col.id)}
                              className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
                              title="Collapse column upward"
                            >
                              <ChevronUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => toggleCollapseSideways(col.id)}
                              className="p-1 rounded text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
                              title="Collapse column sideways"
                            >
                              <Minimize2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Column Item Cards Container */}
                        <div className="p-3 space-y-3 flex-1 overflow-y-auto min-h-0">
                          {colItems.length === 0 ? (
                            <div className="h-32 border border-dashed border-slate-800/90 rounded-lg flex items-center justify-center text-slate-600 text-xs">
                              No items
                            </div>
                          ) : (
                            colItems.map((item, index) => {
                              const lvlColor = getHierarchyLevelColor(
                                item.item_type,
                                projectSettings.hierarchy
                              );
                              const isBeingDragged = draggedItemId === item.id;
                              const isDragTarget =
                                dragOverTarget?.colId === col.id && dragOverTarget?.index === index;

                              return (
                                <div key={item.id} className="relative">
                                  {/* Insertion Indicator line */}
                                  {isDragTarget && (
                                    <div className="h-1 bg-emerald-400 rounded-full my-1 shadow-lg shadow-emerald-400/50 animate-pulse" />
                                  )}

                                  <div
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, item)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={(e) => handleDragOverCard(e, col.id, index)}
                                    onDrop={(e) => {
                                      e.stopPropagation();
                                      handleDrop(e, col.id, index);
                                    }}
                                    onDoubleClick={() => setEditingItem(item)}
                                    className={`p-3.5 rounded-xl bg-slate-950 border transition-all space-y-2.5 shadow-sm group cursor-grab active:cursor-grabbing hover:border-slate-700 max-h-[380px] overflow-y-auto custom-scrollbar ${
                                      isBeingDragged
                                        ? 'opacity-40 border-dashed border-emerald-500'
                                        : 'border-slate-800/90'
                                    }`}
                                  >
                                    {/* Card Top: Level Selector Badge, Project Badge, Ref, Edit & Delete */}
                                    <div className="flex items-center justify-between text-xs gap-2">
                                      <div className="flex items-center space-x-1.5 min-w-0">
                                        <GripVertical className="w-3 h-3 text-slate-600 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 -ml-1" />
                                        {/* Quick Level Selector */}
                                        <div className="relative inline-flex items-center">
                                          <select
                                            value={item.item_type}
                                            onChange={(e) => {
                                              e.stopPropagation();
                                              handleUpdateType(item.id, e.target.value);
                                            }}
                                            onClick={(e) => e.stopPropagation()}
                                            style={{
                                              backgroundColor: '#090d16',
                                              color: lvlColor.hex,
                                              borderColor: `${lvlColor.hex}50`,
                                            }}
                                            className="appearance-none text-[10px] font-mono font-semibold rounded pl-2 pr-5 py-0.5 border focus:outline-none cursor-pointer transition-colors shadow-sm"
                                            title="Change hierarchy level"
                                          >
                                            {projectSettings.hierarchy.map((h) => (
                                              <option
                                                key={h.type}
                                                value={h.type}
                                                className="bg-slate-900 text-white font-sans"
                                              >
                                                {h.label}
                                              </option>
                                            ))}
                                          </select>
                                          <ChevronDown
                                            className="w-2.5 h-2.5 absolute right-1.5 pointer-events-none"
                                            style={{ color: lvlColor.hex }}
                                          />
                                        </div>

                                        {isAllProjects && (
                                          <span
                                            className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/50 font-sans truncate max-w-[100px]"
                                            title={allProjects.find((p) => p.id === item.project_id)?.name || item.project_id}
                                          >
                                            {allProjects.find((p) => p.id === item.project_id)?.name || 'Project'}
                                          </span>
                                        )}
                                      </div>

                                      <div className="flex items-center space-x-1 shrink-0">
                                        {item.external_ref_id && (
                                          <span className="font-mono text-slate-400 text-[10px] flex items-center space-x-0.5">
                                            <Hash className="w-2.5 h-2.5 text-slate-500" />
                                            <span>{item.external_ref_id}</span>
                                          </span>
                                        )}
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingItem(item);
                                          }}
                                          className="p-1 rounded text-slate-600 hover:text-white hover:bg-slate-900 transition-all opacity-0 group-hover:opacity-100"
                                          title="Edit work item"
                                        >
                                          <Pencil className="w-3 h-3" />
                                        </button>
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDeleteItem(item.id);
                                          }}
                                          className="p-1 rounded text-slate-600 hover:text-red-400 hover:bg-slate-900 transition-all opacity-0 group-hover:opacity-100"
                                          title="Delete item"
                                        >
                                          <Trash2 className="w-3 h-3" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* Card Title */}
                                    <h4 className="text-sm font-medium text-slate-100 leading-snug">
                                      {item.title}
                                    </h4>

                                    {/* Card Description */}
                                    {item.description && (
                                      <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                                        {item.description}
                                      </p>
                                    )}

                                    {/* Metadata tags */}
                                    {item.metadata && Object.keys(item.metadata).length > 0 && (
                                      <div className="flex flex-wrap gap-1 pt-0.5">
                                        {Object.entries(item.metadata).map(([k, v]) => {
                                          const rawVal = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
                                          const displayVal = rawVal.replace(/\s+/g, ' ').trim();
                                          const truncated = displayVal.length > 28 ? displayVal.slice(0, 28) + '...' : displayVal;
                                          return (
                                            <span
                                              key={k}
                                              title={`${k}: ${rawVal}`}
                                              className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800/60 font-mono max-w-full truncate inline-block"
                                            >
                                              <span className="text-slate-500">{k}:</span> {truncated}
                                            </span>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* Card Bottom: Assignee & Quick Status Select */}
                                    <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-xs text-slate-400">
                                      <div className="flex items-center space-x-1.5 min-w-0">
                                        <User className="w-3 h-3 text-slate-500 shrink-0" />
                                        <span className="text-[11px] font-mono truncate text-slate-400 max-w-[120px]">
                                          {item.assignee || 'unassigned'}
                                        </span>
                                      </div>
                                      <select
                                        value={item.status}
                                        onChange={(e) => {
                                          e.stopPropagation();
                                          handleUpdateStatus(item.id, e.target.value);
                                        }}
                                        onClick={(e) => e.stopPropagation()}
                                        className="text-[10px] bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-300 focus:outline-none hover:border-slate-700 cursor-pointer"
                                      >
                                        {projectSettings.statuses.map((st: StatusDefinition) => (
                                          <option key={st.id} value={st.id}>
                                            → {st.label}
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                  </div>
                                </div>
                              );
                            })
                          )}
                        </div>
                      </div>
                    );
                  })}

                {/* ── Uncategorized Fallback Column (ensures no item ever disappears) ── */}
                {unmappedItems.length > 0 && (
                  <div className="w-80 min-w-[320px] max-w-[320px] shrink-0 bg-slate-900/40 border border-amber-500/40 rounded-xl flex flex-col h-full shadow-sm">
                    <div className="px-4 py-3 border-b border-amber-500/30 flex items-center justify-between shrink-0 bg-amber-500/10 rounded-t-xl">
                      <div className="flex items-center space-x-2">
                        <span className="w-2.5 h-2.5 rounded-full bg-amber-400" />
                        <span className="font-semibold text-xs tracking-wider uppercase text-amber-300">
                          Uncategorized
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-mono">
                          {unmappedItems.length}
                        </span>
                      </div>
                      <span className="text-[10px] text-amber-400/80 italic">Unmapped status</span>
                    </div>

                    <div className="p-3 space-y-3 flex-1 overflow-y-auto min-h-0">
                      {unmappedItems.map((item, index) => {
                        const lvlColor = getHierarchyLevelColor(
                          item.item_type,
                          projectSettings.hierarchy
                        );
                        return (
                          <div
                            key={item.id}
                            onDoubleClick={() => setEditingItem(item)}
                            className="p-3.5 rounded-xl bg-slate-950 border border-amber-500/30 hover:border-amber-500/60 transition-all space-y-2.5 shadow-sm group max-h-[380px] overflow-y-auto custom-scrollbar"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <div className="flex items-center space-x-1.5">
                                <span
                                  className={`text-[10px] font-mono font-semibold rounded px-2 py-0.5 border ${lvlColor.badgeBg} ${lvlColor.badgeText} ${lvlColor.badgeBorder}`}
                                >
                                  {item.item_type}
                                </span>
                                {isAllProjects && (
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/50 font-sans truncate max-w-[100px]"
                                    title={allProjects.find((p) => p.id === item.project_id)?.name || item.project_id}
                                  >
                                    {allProjects.find((p) => p.id === item.project_id)?.name || 'Project'}
                                  </span>
                                )}
                              </div>
                              <div className="flex items-center space-x-1">
                                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                  {item.status}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => setEditingItem(item)}
                                  className="p-1 rounded text-slate-500 hover:text-white"
                                  title="Edit work item"
                                >
                                  <Pencil className="w-3 h-3" />
                                </button>
                              </div>
                            </div>

                            <h4 className="text-sm font-medium text-slate-100">{item.title}</h4>

                            {item.description && (
                              <p className="text-xs text-slate-400 line-clamp-2 leading-relaxed">
                                {item.description}
                              </p>
                            )}

                            {item.metadata && Object.keys(item.metadata).length > 0 && (
                              <div className="flex flex-wrap gap-1 pt-0.5">
                                {Object.entries(item.metadata).map(([k, v]) => {
                                  const rawVal = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
                                  const displayVal = rawVal.replace(/\s+/g, ' ').trim();
                                  const truncated = displayVal.length > 28 ? displayVal.slice(0, 28) + '...' : displayVal;
                                  return (
                                    <span
                                      key={k}
                                      title={`${k}: ${rawVal}`}
                                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800/60 font-mono max-w-full truncate inline-block"
                                    >
                                      <span className="text-slate-500">{k}:</span> {truncated}
                                    </span>
                                  );
                                })}
                              </div>
                            )}

                            <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-xs text-slate-400">
                              <span className="text-[11px] font-mono text-slate-500">
                                Assign status:
                              </span>
                              <select
                                value=""
                                onChange={(e) => handleUpdateStatus(item.id, e.target.value)}
                                className="text-[10px] bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-300 focus:outline-none"
                              >
                                <option value="" disabled>
                                  Move to column →
                                </option>
                                {projectSettings.statuses.map((st: StatusDefinition) => (
                                  <option key={st.id} value={st.id}>
                                    → {st.label}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: HIERARCHY TREE */}
        {activeTab === 'tree' && (
          <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold text-white">Hierarchical Tree Structure</h3>
                <p className="text-xs text-slate-400">
                  Recursive tree representation showing parent-child links resolved from dynamic schema rules.
                </p>
              </div>
              <span className="text-xs font-mono text-emerald-400">
                Total Items: {items.length}
              </span>
            </div>

            <div className="space-y-3 pt-4">
              {loading ? (
                Array.from({ length: 4 }).map((_, i) => (
                  <div key={i} className="h-14 rounded-lg bg-slate-950 border border-slate-800 animate-pulse" />
                ))
              ) : items.length === 0 ? (
                <div className="text-center py-12 text-slate-500 text-sm">
                  No items in project. Ingest work items using Gemini Spark or the quick add form.
                </div>
              ) : (
                treeItems.map((rootNode) => (
                  <TreeNode
                    key={rootNode.id}
                    item={rootNode}
                    getStatusColor={getStatusColor}
                  />
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 3: SPRINT / QUARTERLY PLANNING */}
        {activeTab === 'sprint' && (
          <div className="space-y-6">
            {/* Header & Overview */}
            <div className="p-6 rounded-xl bg-slate-900/40 border border-slate-800/80 flex flex-wrap items-center justify-between gap-4">
              <div>
                <div className="flex items-center space-x-2">
                  <Calendar className="w-5 h-5 text-emerald-400" />
                  <h3 className="text-lg font-semibold text-white">Sprint & Story Planning</h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Manage sprint allocations, story points, and sprint backlogs across your projects. Configured in project settings.
                </p>
              </div>

              <div className="flex items-center flex-wrap gap-3">
                <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 flex items-center space-x-2">
                  <span className="text-slate-500">Total Items:</span>
                  <span className="font-mono font-bold text-white">{items.length}</span>
                </div>
                <div className="px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800 text-xs text-slate-300 flex items-center space-x-2">
                  <span className="text-slate-500">Planned Sprints:</span>
                  <span className="font-mono font-bold text-emerald-400">
                    {availableSprints.length}
                  </span>
                </div>
              </div>
            </div>

            {/* Sprint Groups */}
            <div className="space-y-6">
              {(availableSprints.length === 0 ? ['Sprint 1'] : availableSprints).map((sprintName) => {
                const sprintItems = items.filter((it) => it.metadata?.sprint === sprintName);
                const totalPoints = sprintItems.reduce((acc, it) => {
                  const p = Number(it.metadata?.story_points ?? it.metadata?.points ?? it.metadata?.estimate);
                  return acc + (isNaN(p) ? 0 : p);
                }, 0);
                const completedItems = sprintItems.filter((it) =>
                  ['done', 'closed', 'completed'].includes(it.status)
                );
                const progressPct =
                  sprintItems.length > 0
                    ? Math.round((completedItems.length / sprintItems.length) * 100)
                    : 0;

                const isCurrent =
                  projectSettings.sprint_settings?.sprints?.find((s: any) => s.name === sprintName)?.is_current ??
                  (availableSprints[0] === sprintName);

                return (
                  <div
                    key={sprintName}
                    className="rounded-xl bg-slate-900/40 border border-slate-800/80 overflow-hidden shadow-sm"
                  >
                    {/* Sprint Header */}
                    <div className="p-4 bg-slate-950/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <span className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
                        <h4 className="text-base font-semibold text-white flex items-center space-x-2">
                          <span>{sprintName}</span>
                          {isCurrent && (
                            <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 font-sans font-medium border border-emerald-500/30">
                              Current Active Sprint
                            </span>
                          )}
                        </h4>
                        <span className="text-xs text-slate-500 font-mono">
                          {sprintItems.length} {sprintItems.length === 1 ? 'item' : 'items'}
                        </span>
                      </div>

                      <div className="flex items-center space-x-4">
                        {totalPoints > 0 && (
                          <div className="text-xs text-slate-300 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800 font-mono">
                            <span className="text-slate-500">Points:</span>{' '}
                            <span className="font-semibold text-emerald-400">{totalPoints}</span>
                          </div>
                        )}

                        <div className="flex items-center space-x-2 min-w-[140px]">
                          <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-emerald-500 transition-all rounded-full"
                              style={{ width: `${progressPct}%` }}
                            />
                          </div>
                          <span className="text-xs font-mono text-slate-400">{progressPct}%</span>
                        </div>
                      </div>
                    </div>

                    {/* Sprint Item List */}
                    <div className="divide-y divide-slate-800/50">
                      {sprintItems.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500 italic">
                          No stories or tasks in {sprintName}. Allocate backlog items below.
                        </div>
                      ) : (
                        sprintItems.map((item) => {
                          const lvlColor = getHierarchyLevelColor(
                            item.item_type,
                            projectSettings.hierarchy
                          );
                          const points = item.metadata?.story_points ?? item.metadata?.points ?? item.metadata?.estimate;

                          return (
                            <div
                              key={item.id}
                              onDoubleClick={() => setEditingItem(item)}
                              className="p-3.5 hover:bg-slate-800/30 transition-colors flex flex-wrap items-center justify-between gap-3 group"
                            >
                              <div className="flex items-center space-x-3 min-w-0 flex-1">
                                <span
                                  className={`text-[10px] font-mono font-semibold rounded px-2 py-0.5 border shrink-0 ${lvlColor.badgeBg} ${lvlColor.badgeText} ${lvlColor.badgeBorder}`}
                                >
                                  {item.item_type}
                                </span>

                                {isAllProjects && (
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/50 font-sans truncate max-w-[100px]"
                                    title={allProjects.find((p) => p.id === item.project_id)?.name || item.project_id}
                                  >
                                    {allProjects.find((p) => p.id === item.project_id)?.name || 'Project'}
                                  </span>
                                )}

                                {item.external_ref_id && (
                                  <span className="text-xs font-mono text-slate-400 shrink-0">
                                    {item.external_ref_id}
                                  </span>
                                )}

                                <span
                                  className="text-sm font-medium text-slate-200 truncate cursor-pointer hover:text-white"
                                  onClick={() => setEditingItem(item)}
                                >
                                  {item.title}
                                </span>
                              </div>

                              <div className="flex items-center space-x-3 shrink-0">
                                {points !== undefined && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 font-mono">
                                    {String(points)} pts
                                  </span>
                                )}

                                <span className="text-xs text-slate-400 flex items-center space-x-1 font-mono">
                                  <User className="w-3 h-3 text-slate-500" />
                                  <span>{item.assignee || 'Unassigned'}</span>
                                </span>

                                {/* Status Select */}
                                <select
                                  value={item.status}
                                  onChange={(e) => handleUpdateStatus(item.id, e.target.value)}
                                  className="text-xs bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-300 focus:outline-none cursor-pointer"
                                >
                                  {projectSettings.statuses.map((st: StatusDefinition) => (
                                    <option key={st.id} value={st.id}>
                                      {st.label}
                                    </option>
                                  ))}
                                </select>

                                {/* Move to sprint */}
                                <select
                                  value={sprintName}
                                  onChange={(e) => handleUpdateItemSprint(item.id, e.target.value)}
                                  className="text-xs bg-slate-950 border border-slate-800 rounded px-2 py-1 text-emerald-400 font-medium focus:outline-none cursor-pointer"
                                  title="Change sprint"
                                >
                                  <option value="__none__">Move to Backlog</option>
                                  {availableSprints.map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>

                                <button
                                  type="button"
                                  onClick={() => setEditingItem(item)}
                                  className="p-1 rounded text-slate-500 hover:text-white transition-colors"
                                  title="Edit work item"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })}

              {/* Backlog (Unassigned) Swimlane */}
              {(() => {
                const backlogItems = items.filter((it) => !it.metadata?.sprint);
                const backlogPoints = backlogItems.reduce((acc, it) => {
                  const p = Number(it.metadata?.story_points ?? it.metadata?.points ?? it.metadata?.estimate);
                  return acc + (isNaN(p) ? 0 : p);
                }, 0);

                return (
                  <div className="rounded-xl bg-slate-900/40 border border-slate-800/80 overflow-hidden shadow-sm">
                    <div className="p-4 bg-slate-950/60 border-b border-slate-800/80 flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center space-x-3">
                        <span className="w-2.5 h-2.5 rounded-full bg-slate-500" />
                        <h4 className="text-base font-semibold text-white">
                          Product Backlog (Unassigned)
                        </h4>
                        <span className="text-xs text-slate-500 font-mono">
                          {backlogItems.length} {backlogItems.length === 1 ? 'item' : 'items'}
                        </span>
                      </div>

                      {backlogPoints > 0 && (
                        <div className="text-xs text-slate-300 bg-slate-900 px-2.5 py-1 rounded-md border border-slate-800 font-mono">
                          <span className="text-slate-500">Points:</span>{' '}
                          <span className="font-semibold text-slate-300">{backlogPoints}</span>
                        </div>
                      )}
                    </div>

                    <div className="divide-y divide-slate-800/50">
                      {backlogItems.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-500 italic">
                          Backlog is empty! All items are assigned to active sprints.
                        </div>
                      ) : (
                        backlogItems.map((item) => {
                          const lvlColor = getHierarchyLevelColor(
                            item.item_type,
                            projectSettings.hierarchy
                          );
                          const points = item.metadata?.story_points ?? item.metadata?.points ?? item.metadata?.estimate;

                          return (
                            <div
                              key={item.id}
                              onDoubleClick={() => setEditingItem(item)}
                              className="p-3.5 hover:bg-slate-800/30 transition-colors flex flex-wrap items-center justify-between gap-3 group"
                            >
                              <div className="flex items-center space-x-3 min-w-0 flex-1">
                                <span
                                  className={`text-[10px] font-mono font-semibold rounded px-2 py-0.5 border shrink-0 ${lvlColor.badgeBg} ${lvlColor.badgeText} ${lvlColor.badgeBorder}`}
                                >
                                  {item.item_type}
                                </span>

                                {isAllProjects && (
                                  <span
                                    className="text-[10px] px-1.5 py-0.5 rounded bg-blue-950/60 text-blue-300 border border-blue-800/50 font-sans truncate max-w-[100px]"
                                    title={allProjects.find((p) => p.id === item.project_id)?.name || item.project_id}
                                  >
                                    {allProjects.find((p) => p.id === item.project_id)?.name || 'Project'}
                                  </span>
                                )}

                                {item.external_ref_id && (
                                  <span className="text-xs font-mono text-slate-400 shrink-0">
                                    {item.external_ref_id}
                                  </span>
                                )}

                                <span
                                  className="text-sm font-medium text-slate-200 truncate cursor-pointer hover:text-white"
                                  onClick={() => setEditingItem(item)}
                                >
                                  {item.title}
                                </span>
                              </div>

                              <div className="flex items-center space-x-3 shrink-0">
                                {points !== undefined && (
                                  <span className="text-xs px-2 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 font-mono">
                                    {String(points)} pts
                                  </span>
                                )}

                                <span className="text-xs text-slate-400 flex items-center space-x-1 font-mono">
                                  <User className="w-3 h-3 text-slate-500" />
                                  <span>{item.assignee || 'Unassigned'}</span>
                                </span>

                                {/* Assign to sprint */}
                                <select
                                  value=""
                                  onChange={(e) => handleUpdateItemSprint(item.id, e.target.value)}
                                  className="text-xs bg-slate-950 border border-slate-800 rounded px-2 py-1 text-emerald-400 font-medium focus:outline-none cursor-pointer"
                                >
                                  <option value="" disabled>Assign to Sprint →</option>
                                  {(availableSprints.length === 0 ? ['Sprint 1'] : availableSprints).map((s) => (
                                    <option key={s} value={s}>
                                      {s}
                                    </option>
                                  ))}
                                </select>

                                <button
                                  type="button"
                                  onClick={() => setEditingItem(item)}
                                  className="p-1 rounded text-slate-500 hover:text-white transition-colors"
                                  title="Edit work item"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        )}

        {/* TAB 4: GEMINI SPARK INGESTION */}
        {activeTab === 'spark' && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Cpu className="w-5 h-5 text-emerald-400" />
                  <h3 className="font-semibold text-white">Gemini Spark Ingestion Request</h3>
                </div>
                <span className="text-xs text-emerald-400 font-mono">POST /api/v1/items/ingest</span>
              </div>
              <p className="text-xs text-slate-400">
                Simulate payload sent from automated AI agents. Automatically resolves{' '}
                <code className="text-emerald-300">parent_ref_id</code> and performs upserts on{' '}
                <code className="text-emerald-300">external_ref_id</code>. Uses your tenant API key.
              </p>
              <textarea
                rows={16}
                value={sparkPayload}
                onChange={(e) => setSparkPayload(e.target.value)}
                className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-300 focus:outline-none focus:border-emerald-500 leading-relaxed"
              />
              <button
                onClick={handleRunSparkIngest}
                disabled={isIngesting}
                className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isIngesting ? 'Ingesting via Headless API...' : 'Execute Ingestion'}</span>
              </button>
            </div>

            <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-4">
              <div className="flex items-center space-x-2">
                <Code2 className="w-5 h-5 text-teal-400" />
                <h3 className="font-semibold text-white">Ingest API Response</h3>
              </div>
              <p className="text-xs text-slate-400">Live output from serverless endpoint execution:</p>
              <div className="h-[380px] p-4 rounded-lg bg-slate-950 border border-slate-800 overflow-auto font-mono text-xs text-slate-300">
                {ingestResponse ? (
                  <pre className="text-emerald-400 leading-relaxed">
                    {JSON.stringify(ingestResponse, null, 2)}
                  </pre>
                ) : (
                  <div className="h-full flex items-center justify-center text-slate-600 text-xs">
                    Ready to execute. Click &quot;Execute Ingestion&quot; on the left.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 4: DYNAMIC SCHEMA */}
        {activeTab === 'schema' && (
          <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white">Dynamic JSON Schema Settings</h3>
              <p className="text-xs text-slate-400">
                Stored in <code className="text-emerald-300">tracker.projects.settings</code>. Defines
                hierarchy levels, allowed parent relations, column statuses, and custom metadata fields.
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider">
                    Hierarchy Levels
                  </h4>
                  <span className="text-[10px] text-slate-500">Click swatch to pick</span>
                </div>
                <div className="space-y-1 text-xs">
                  {projectSettings.hierarchy.map((h, idx) => {
                    const currentHex = h.color || getDefaultLevelHex(h.level);
                    return (
                      <div
                        key={h.type}
                        className="flex items-center justify-between py-1 border-b border-slate-900 last:border-0"
                      >
                        <div className="flex items-center space-x-2">
                          <label className="relative inline-flex items-center justify-center cursor-pointer group">
                            <input
                              type="color"
                              value={currentHex}
                              onChange={(e) => {
                                const newHierarchy = [...projectSettings.hierarchy];
                                newHierarchy[idx] = { ...newHierarchy[idx], color: e.target.value };
                                const newSettings = { ...projectSettings, hierarchy: newHierarchy };
                                setProjectSettings(newSettings);
                                handleSaveSchema(newSettings);
                              }}
                              className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                            />
                            <span
                              className="w-3.5 h-3.5 rounded border border-white/20 shadow-sm transition-transform group-hover:scale-110"
                              style={{ backgroundColor: currentHex }}
                              title={`Change color for ${h.label} (${currentHex})`}
                            />
                          </label>
                          <span className="font-medium text-slate-200">{h.label}</span>
                          <span className="text-[10px] font-mono text-slate-500">(lvl {h.level})</span>
                        </div>
                        <div className="flex items-center space-x-2">
                          <span className="text-[11px] font-mono text-slate-400">{currentHex}</span>
                          <span className="text-[10px] font-mono text-emerald-400/90 bg-emerald-950/40 px-1.5 py-0.5 rounded border border-emerald-900/40">
                            [{h.allowed_parents.join(', ') || 'root'}]
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider">
                    Project Statuses
                  </h4>
                  <span className="text-[10px] text-slate-500">Click swatch to pick</span>
                </div>
                <div className="space-y-1 text-xs">
                  {projectSettings.statuses.map((s: StatusDefinition, idx: number) => (
                    <div
                      key={s.id}
                      className="flex items-center justify-between py-1 border-b border-slate-900 last:border-0"
                    >
                      <div className="flex items-center space-x-2">
                        <label className="relative inline-flex items-center justify-center cursor-pointer group">
                          <input
                            type="color"
                            value={s.color}
                            onChange={(e) => {
                              const newStatuses = [...projectSettings.statuses];
                              newStatuses[idx] = { ...newStatuses[idx], color: e.target.value };
                              const newSettings = { ...projectSettings, statuses: newStatuses };
                              setProjectSettings(newSettings);
                              handleSaveSchema(newSettings);
                            }}
                            className="opacity-0 absolute inset-0 w-full h-full cursor-pointer"
                          />
                          <span
                            className="w-3.5 h-3.5 rounded-full border border-white/20 shadow-sm transition-transform group-hover:scale-110"
                            style={{ backgroundColor: s.color }}
                            title={`Change color for ${s.label} (${s.color})`}
                          />
                        </label>
                        <span className="text-slate-300">{s.label}</span>
                      </div>
                      <div className="flex items-center space-x-2">
                        <span className="text-[11px] font-mono text-slate-400">{s.color}</span>
                        <span className="font-mono text-slate-500">{s.id}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider">
                  Custom Fields
                </h4>
                <div className="flex flex-wrap gap-1">
                  {projectSettings.custom_fields.map((f) => (
                    <span
                      key={f}
                      className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-xs font-mono text-slate-300"
                    >
                      {f}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider">
                    JSON Schema Definition & Editor
                  </h4>
                  <p className="text-[11px] text-slate-500">
                    Collapse/expand JSON tree branches, click any color swatch next to hex values to open a color picker, or switch to raw JSON to edit directly.
                  </p>
                </div>
              </div>
              <JsonSchemaEditor
                settings={projectSettings}
                onSave={handleSaveSchema}
                isSaving={isSavingSchema}
              />
            </div>
          </div>
        )}
      </main>

      {/* Work Item Detail / Edit Modal */}
      <WorkItemModal
        item={editingItem}
        isOpen={!!editingItem}
        onClose={() => setEditingItem(null)}
        onSave={handleSaveModalItem}
        onDelete={handleDeleteItem}
        projectSettings={projectSettings}
        allItems={items}
        currentUser={currentUser ?? undefined}
        workspaceMembers={workspaceMembers}
      />
    </div>
  );
}
