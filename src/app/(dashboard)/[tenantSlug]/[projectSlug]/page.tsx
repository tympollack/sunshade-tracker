'use client';

import { use, useEffect, useState, useCallback } from 'react';
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
} from 'lucide-react';
import { WorkItem, ProjectSettings, StatusDefinition } from '@/types/tracker';
import { UserMenu } from '@/components/UserMenu';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import { BoardSkeleton } from '@/components/LoadingSkeleton';

interface PageProps {
  params: Promise<{
    tenantSlug: string;
    projectSlug: string;
  }>;
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

  const [activeTab, setActiveTab] = useState<'board' | 'tree' | 'spark' | 'schema'>('board');
  const [items, setItems] = useState<WorkItem[]>([]);
  const [projectSettings, setProjectSettings] = useState<ProjectSettings>({
    schema_version: '1.0',
    hierarchy: [
      { type: 'project', label: 'Project', level: 1, allowed_parents: [] },
      { type: 'epic', label: 'Epic', level: 2, allowed_parents: ['project'] },
      { type: 'story', label: 'Story', level: 3, allowed_parents: ['epic'] },
      { type: 'task', label: 'Task', level: 4, allowed_parents: ['story', 'epic'] },
    ],
    statuses: [
      { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
      { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
      { id: 'planned', label: 'Planned', color: '#a855f7', order: 3 },
      { id: 'complete', label: 'Complete', color: '#22c55e', order: 4 },
    ],
    custom_fields: ['priority', 'complexity', 'timeline', 'commit_hash', 'source_type'],
  });

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
        const proj = (sData.projects || []).find((p: ProjectInfo) => p.slug === projectSlug);
        if (proj) {
          const detailRes = await apiFetch(`/api/v1/projects/${proj.id}/settings`);
          if (detailRes.ok) {
            const detail = await detailRes.json();
            if (detail.settings) setProjectSettings(detail.settings);
          }
        }
      }

      // Fetch items (session-authenticated)
      const itemsRes = await apiFetch(`/api/v1/items?project_slug=${projectSlug}`);
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
  }, [apiFetch, tenantSlug, projectSlug]);

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

  // ─── Delete item ─────────────────────────────────────────────────────────
  const handleDeleteItem = async (itemId: string) => {
    if (!confirm('Delete this item?')) return;
    setItems((prev) => prev.filter((it) => it.id !== itemId));
    try {
      await apiFetch('/api/v1/items', {
        method: 'DELETE',
        body: JSON.stringify({ id: itemId }),
      });
    } catch {
      fetchData();
    }
  };

  // ─── Create item ─────────────────────────────────────────────────────────
  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemTitle.trim()) return;
    try {
      const res = await apiFetch('/api/v1/items', {
        method: 'POST',
        body: JSON.stringify({
          project_slug: projectSlug,
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
          setNewItemAssignee('');
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
      // Ingest always uses the tenant API key (headless), not session
      const res = await fetch('/api/v1/items/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
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
  if (!loading && fetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#090d16]">
        <div className="max-w-md text-center space-y-4 p-8">
          <XCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Failed to load workspace</h2>
          <p className="text-sm text-slate-400">{fetchError}</p>
          <div className="flex items-center justify-center space-x-3">
            <button
              onClick={fetchData}
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-sm font-medium transition-colors"
            >
              Try Again
            </button>
            <Link
              href="/login"
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-sm font-medium transition-colors"
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
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-sm">
              ST
            </div>
            <span className="font-bold text-slate-100 tracking-tight hidden sm:block">
              SunShade Tracker
            </span>
          </Link>
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
            {(['board', 'tree', 'spark', 'schema'] as const).map((tab) => {
              const icons = {
                board: <Kanban className="w-3.5 h-3.5" />,
                tree: <GitFork className="w-3.5 h-3.5" />,
                spark: <Cpu className="w-3.5 h-3.5" />,
                schema: <Settings className="w-3.5 h-3.5" />,
              };
              const labels = {
                board: 'Board',
                tree: 'Hierarchy Tree',
                spark: 'Gemini Spark Ingestion',
                schema: 'Dynamic Schema',
              };
              return (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
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
            onClick={fetchData}
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
      <main className="flex-1 p-6 max-w-7xl mx-auto w-full">
        {/* TAB 1: KANBAN BOARD */}
        {activeTab === 'board' && (
          <div className="space-y-6">
            {/* Quick Add Form */}
            <form
              onSubmit={handleCreateItem}
              className="p-4 rounded-xl bg-slate-900/60 border border-slate-800/80 flex flex-wrap items-center gap-3"
            >
              <div className="flex-1 min-w-[240px]">
                <input
                  type="text"
                  placeholder="New item title (e.g. Implement Webhook Dispatcher)..."
                  value={newItemTitle}
                  onChange={(e) => setNewItemTitle(e.target.value)}
                  className="w-full px-3 py-1.5 text-sm bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500 font-sans transition-colors"
                />
              </div>
              <select
                value={newItemType}
                onChange={(e) => setNewItemType(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-emerald-500 font-mono"
              >
                {projectSettings.hierarchy.map((h) => (
                  <option key={h.type} value={h.type}>
                    {h.label} (Level {h.level})
                  </option>
                ))}
              </select>
              <select
                value={newItemStatus}
                onChange={(e) => setNewItemStatus(e.target.value)}
                className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-emerald-500 font-mono"
              >
                {projectSettings.statuses.map((s: StatusDefinition) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <input
                type="text"
                placeholder="Assignee"
                value={newItemAssignee}
                onChange={(e) => setNewItemAssignee(e.target.value)}
                className="w-28 px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500 font-mono"
              />
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

            {/* Board columns */}
            {loading ? (
              <BoardSkeleton />
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
                {projectSettings.statuses.map((col: StatusDefinition) => {
                  const colItems = items.filter((it) => it.status === col.id);
                  return (
                    <div
                      key={col.id}
                      className="bg-slate-900/40 border border-slate-800/80 rounded-xl flex flex-col min-h-[500px]"
                    >
                      <div className="px-4 py-3 border-b border-slate-800/80 flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full"
                            style={{ backgroundColor: col.color }}
                          />
                          <span className="font-semibold text-xs tracking-wider uppercase text-slate-200">
                            {col.label}
                          </span>
                        </div>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono">
                          {colItems.length}
                        </span>
                      </div>

                      <div className="p-3 space-y-3 flex-1">
                        {colItems.length === 0 ? (
                          <div className="h-32 border border-dashed border-slate-800 rounded-lg flex items-center justify-center text-slate-600 text-xs">
                            No items
                          </div>
                        ) : (
                          colItems.map((item) => (
                            <div
                              key={item.id}
                              className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/90 hover:border-slate-700 transition-all space-y-2 shadow-sm group"
                            >
                              <div className="flex items-center justify-between text-xs">
                                <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-emerald-400 font-mono text-[10px]">
                                  {item.item_type}
                                </span>
                                <div className="flex items-center space-x-1.5">
                                  {item.external_ref_id && (
                                    <span className="font-mono text-slate-400 text-[10px] flex items-center space-x-1">
                                      <Hash className="w-2.5 h-2.5" />
                                      <span>{item.external_ref_id}</span>
                                    </span>
                                  )}
                                  <button
                                    onClick={() => handleDeleteItem(item.id)}
                                    className="opacity-0 group-hover:opacity-100 text-slate-600 hover:text-red-400 transition-all"
                                    title="Delete item"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </button>
                                </div>
                              </div>

                              <h4 className="text-sm font-medium text-slate-100 leading-snug">
                                {item.title}
                              </h4>

                              {item.description && (
                                <p className="text-xs text-slate-400 line-clamp-2">
                                  {item.description}
                                </p>
                              )}

                              {item.metadata && Object.keys(item.metadata).length > 0 && (
                                <div className="flex flex-wrap gap-1 pt-1">
                                  {Object.entries(item.metadata).map(([k, v]) => (
                                    <span
                                      key={k}
                                      className="text-[10px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-400 border border-slate-800/60 font-mono"
                                    >
                                      {k}: {String(v)}
                                    </span>
                                  ))}
                                </div>
                              )}

                              <div className="pt-2 border-t border-slate-900 flex items-center justify-between text-xs text-slate-400">
                                <div className="flex items-center space-x-1">
                                  <User className="w-3 h-3 text-slate-500" />
                                  <span className="text-[11px] font-mono">
                                    {item.assignee || 'unassigned'}
                                  </span>
                                </div>
                                <select
                                  value={item.status}
                                  onChange={(e) => handleUpdateStatus(item.id, e.target.value)}
                                  className="text-[10px] bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-300 focus:outline-none"
                                >
                                  {projectSettings.statuses.map((st: StatusDefinition) => (
                                    <option key={st.id} value={st.id}>
                                      → {st.label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  );
                })}
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
                items.map((item) => {
                  const parent = items.find((p) => p.id === item.parent_id);
                  return (
                    <div
                      key={item.id}
                      className="p-3.5 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between"
                    >
                      <div className="flex items-center space-x-3">
                        <span className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800 text-emerald-400 font-mono text-xs">
                          {item.item_type}
                        </span>
                        <div>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-semibold text-white">{item.title}</span>
                            {item.external_ref_id && (
                              <span className="text-xs font-mono text-slate-400">
                                [{item.external_ref_id}]
                              </span>
                            )}
                          </div>
                          {parent && (
                            <span className="text-xs text-slate-500">
                              Child of: <strong className="text-slate-400">{parent.title}</strong>{' '}
                              ({parent.external_ref_id || parent.item_type})
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center space-x-3 text-xs">
                        <span
                          className="px-2 py-0.5 rounded-full font-medium"
                          style={{
                            backgroundColor: `${getStatusColor(item.status)}20`,
                            color: getStatusColor(item.status),
                            border: `1px solid ${getStatusColor(item.status)}40`,
                          }}
                        >
                          {item.status}
                        </span>
                        <span className="text-slate-400 font-mono">order: {item.order_index}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 3: GEMINI SPARK INGESTION */}
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
              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider">
                  Hierarchy Levels
                </h4>
                <div className="space-y-1 text-xs">
                  {projectSettings.hierarchy.map((h) => (
                    <div key={h.type} className="flex items-center justify-between text-slate-400">
                      <span>{h.label} (lvl {h.level})</span>
                      <span className="font-mono text-emerald-400">
                        parents: [{h.allowed_parents.join(', ') || 'none'}]
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
                <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider">
                  Project Statuses
                </h4>
                <div className="space-y-1 text-xs">
                  {projectSettings.statuses.map((s: StatusDefinition) => (
                    <div key={s.id} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: s.color }} />
                        <span className="text-slate-300">{s.label}</span>
                      </div>
                      <span className="font-mono text-slate-500">{s.id}</span>
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
              <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider">
                Raw JSON Definition
              </h4>
              <pre className="p-4 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-emerald-300 overflow-x-auto">
                {JSON.stringify(projectSettings, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
