'use client';

import { use, useEffect, useState } from 'react';
import Link from 'next/link';
import {
  Layers,
  Kanban,
  GitFork,
  Cpu,
  Settings,
  Plus,
  RefreshCw,
  Tag,
  User,
  ArrowRight,
  CheckCircle2,
  Clock,
  Code2,
  Send,
  AlertCircle,
  Hash
} from 'lucide-react';
import { WorkItem, ProjectSettings, StatusDefinition } from '@/types/tracker';

interface PageProps {
  params: Promise<{
    tenantSlug: string;
    projectSlug: string;
  }>;
}

export default function ProjectTrackerDashboard(props: PageProps) {
  const { tenantSlug, projectSlug } = use(props.params);

  const [activeTab, setActiveTab] = useState<'board' | 'tree' | 'spark' | 'schema'>('board');
  const [apiKey, setApiKey] = useState<string>('tk_live_sunshade_master_key');
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

  const [loading, setLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  // Spark Ingestion form state
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
            metadata: {
              complexity: 3,
              priority: 'High',
              origin_agent: 'Gemini Spark',
            },
          },
          {
            external_ref_id: 'TASK-HUB-11-A',
            parent_ref_id: 'SPEC-HUB-11',
            title: 'Implement POST /api/events Webhook Route',
            item_type: 'task',
            status: 'planned',
            metadata: {
              complexity: 1,
            },
          },
        ],
      },
      null,
      2
    )
  );
  const [ingestResponse, setIngestResponse] = useState<any>(null);
  const [isIngesting, setIsIngesting] = useState<boolean>(false);

  // Quick Add Item Modal/Form State
  const [newItemTitle, setNewItemTitle] = useState('');
  const [newItemType, setNewItemType] = useState('task');
  const [newItemStatus, setNewItemStatus] = useState('not_started');
  const [newItemAssignee, setNewItemAssignee] = useState('');
  const [newItemExtRef, setNewItemExtRef] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const storedKey = localStorage.getItem('sunshade_tracker_api_key');
      if (storedKey) setApiKey(storedKey);
    }
    fetchData();
  }, [projectSlug]);

  const fetchData = async () => {
    setIsRefreshing(true);
    try {
      // 1. Fetch settings
      const settingsRes = await fetch(`/api/v1/projects/${projectSlug}/settings`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (settingsRes.ok) {
        const sData = await settingsRes.json();
        if (sData.settings) setProjectSettings(sData.settings);
      }

      // 2. Fetch items
      const itemsRes = await fetch(`/api/v1/items?project_slug=${projectSlug}`, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (itemsRes.ok) {
        const iData = await itemsRes.json();
        setItems(iData.items || []);
      }
    } catch (err) {
      console.error('Error fetching tracker data:', err);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleUpdateStatus = async (itemId: string, newStatus: string) => {
    try {
      const res = await fetch(`/api/v1/items`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ id: itemId, status: newStatus }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((it) => (it.id === itemId ? { ...it, status: newStatus } : it))
        );
      }
    } catch (err) {
      console.error('Error updating status:', err);
    }
  };

  const handleCreateItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newItemTitle.trim()) return;

    try {
      const res = await fetch('/api/v1/items', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
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
        }
      }
    } catch (err) {
      console.error('Error creating item:', err);
    }
  };

  const handleRunSparkIngest = async () => {
    setIsIngesting(true);
    setIngestResponse(null);
    try {
      const parsed = JSON.parse(sparkPayload);
      const res = await fetch('/api/v1/items/ingest', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(parsed),
      });

      const data = await res.json();
      setIngestResponse(data);
      if (data.success) {
        fetchData();
      }
    } catch (err: any) {
      setIngestResponse({ error: err.message || 'Failed to parse/send payload' });
    } finally {
      setIsIngesting(false);
    }
  };

  // Helper to colorize status badges
  const getStatusColor = (statusId: string) => {
    const s = projectSettings.statuses.find((st) => st.id === statusId);
    return s?.color || '#94a3b8';
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100">
      {/* Top App Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center space-x-4">
          <Link href="/" className="flex items-center space-x-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold text-sm">
              ST
            </div>
            <span className="font-bold text-slate-100 tracking-tight">SunShade Tracker</span>
          </Link>
          <span className="text-slate-600">/</span>
          <div className="flex items-center space-x-2 text-sm">
            <span className="text-slate-400 font-mono">tenant:</span>
            <span className="text-emerald-400 font-medium font-mono">{tenantSlug}</span>
            <span className="text-slate-600">/</span>
            <span className="text-white font-semibold">{projectSlug}</span>
          </div>
        </div>

        {/* View Switcher Navigation */}
        <div className="flex items-center space-x-1 bg-slate-900 border border-slate-800 p-1 rounded-lg text-xs">
          <button
            onClick={() => setActiveTab('board')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'board'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Kanban className="w-3.5 h-3.5" />
            <span>Board</span>
          </button>
          <button
            onClick={() => setActiveTab('tree')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'tree'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <GitFork className="w-3.5 h-3.5" />
            <span>Hierarchy Tree</span>
          </button>
          <button
            onClick={() => setActiveTab('spark')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'spark'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Cpu className="w-3.5 h-3.5" />
            <span>Gemini Spark Ingestion</span>
          </button>
          <button
            onClick={() => setActiveTab('schema')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
              activeTab === 'schema'
                ? 'bg-emerald-500 text-slate-950 shadow'
                : 'text-slate-400 hover:text-white'
            }`}
          >
            <Settings className="w-3.5 h-3.5" />
            <span>Dynamic Schema</span>
          </button>
        </div>

        <div className="flex items-center space-x-3">
          <button
            onClick={fetchData}
            disabled={isRefreshing}
            className="p-2 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
            title="Refresh Data"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
          <Link
            href="/login"
            className="text-xs px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-slate-300 hover:text-white font-mono"
          >
            API Key
          </Link>
        </div>
      </header>

      {/* Main Content Area */}
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
                  className="w-full px-3 py-1.5 text-sm bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500 font-sans"
                />
              </div>
              <div>
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
              </div>
              <div>
                <select
                  value={newItemStatus}
                  onChange={(e) => setNewItemStatus(e.target.value)}
                  className="px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-slate-300 focus:outline-none focus:border-emerald-500 font-mono"
                >
                  {projectSettings.statuses.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="w-32">
                <input
                  type="text"
                  placeholder="Assignee"
                  value={newItemAssignee}
                  onChange={(e) => setNewItemAssignee(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
              <div className="w-36">
                <input
                  type="text"
                  placeholder="Ref (e.g. SPEC-01)"
                  value={newItemExtRef}
                  onChange={(e) => setNewItemExtRef(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-950 border border-slate-800 rounded-lg text-white focus:outline-none focus:border-emerald-500 font-mono"
                />
              </div>
              <button
                type="submit"
                className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add Item</span>
              </button>
            </form>

            {/* Columns Grid */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-start">
              {projectSettings.statuses.map((col) => {
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
                            className="p-3.5 rounded-lg bg-slate-950 border border-slate-800/90 hover:border-slate-700 transition-all space-y-2 shadow-sm"
                          >
                            <div className="flex items-center justify-between text-xs">
                              <span className="px-1.5 py-0.5 rounded bg-slate-900 border border-slate-800 text-emerald-400 font-mono text-[10px]">
                                {item.item_type}
                              </span>
                              {item.external_ref_id && (
                                <span className="font-mono text-slate-400 text-[10px] flex items-center space-x-1">
                                  <Hash className="w-2.5 h-2.5" />
                                  <span>{item.external_ref_id}</span>
                                </span>
                              )}
                            </div>

                            <h4 className="text-sm font-medium text-slate-100 leading-snug">
                              {item.title}
                            </h4>

                            {item.description && (
                              <p className="text-xs text-slate-400 line-clamp-2">
                                {item.description}
                              </p>
                            )}

                            {/* Metadata Badges */}
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

                              {/* Status Quick Changer */}
                              <select
                                value={item.status}
                                onChange={(e) => handleUpdateStatus(item.id, e.target.value)}
                                className="text-[10px] bg-slate-900 border border-slate-800 rounded px-1.5 py-0.5 text-slate-300 focus:outline-none"
                              >
                                {projectSettings.statuses.map((st) => (
                                  <option key={st.id} value={st.id}>
                                    &rarr; {st.label}
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
              {items.length === 0 ? (
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
                        <span className="text-slate-400 font-mono">
                          order: {item.order_index}
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

        {/* TAB 3: GEMINI SPARK INGESTION SIMULATOR */}
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
                Simulate payload sent from automated AI agents. Automatically resolves <code className="text-emerald-300">parent_ref_id</code> and performs upserts on <code className="text-emerald-300">external_ref_id</code>.
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
              <p className="text-xs text-slate-400">
                Live output from serverless endpoint execution:
              </p>

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

        {/* TAB 4: DYNAMIC SCHEMA SETTINGS */}
        {activeTab === 'schema' && (
          <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-white">Dynamic JSON Schema Settings</h3>
              <p className="text-xs text-slate-400">
                Stored in <code className="text-emerald-300">tracker.projects.settings</code>. Defines hierarchy levels, allowed parent relations, column statuses, and custom metadata fields.
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
                  {projectSettings.statuses.map((s) => (
                    <div key={s.id} className="flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{ backgroundColor: s.color }}
                        />
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
