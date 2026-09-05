'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  Layers, Plus, Key, Copy, Check, Terminal, ExternalLink,
  Cpu, BarChart3, Paintbrush, FileText, ArrowRight, Zap
} from 'lucide-react';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import { UserMenu } from '@/components/UserMenu';
import { SCHEMA_TEMPLATES, SchemaTemplate } from '@/lib/schema-templates';

interface EmptyWorkspaceViewProps {
  tenant: {
    id: string;
    slug: string;
    name: string;
    api_key?: string | null;
  };
  workspaces: any[];
}

export function EmptyWorkspaceView({ tenant, workspaces }: EmptyWorkspaceViewProps) {
  const router = useRouter();
  const [copied, setCopied] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);

  // Form state
  const [projectName, setProjectName] = useState('');
  const [projectSlug, setProjectSlug] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('software');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!projectName.trim() || !projectSlug.trim()) {
      setError('Project name and slug are required');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const template = SCHEMA_TEMPLATES.find((t) => t.id === selectedTemplate);
      const res = await fetch('/api/v1/projects', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-slug': tenant.slug,
        },
        body: JSON.stringify({
          name: projectName,
          slug: projectSlug,
          description: `Project for ${tenant.name}`,
          app_id: 'tracker',
          settings: template?.settings,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Failed to create project');
        setLoading(false);
        return;
      }

      router.push(`/${tenant.slug}/${data.project?.slug || projectSlug}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100">
      {/* App Header */}
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
          <WorkspaceSwitcher currentTenantSlug={tenant.slug} workspaces={workspaces} />
        </div>

        <div className="flex items-center space-x-3">
          <UserMenu
            tenantName={tenant.name}
            tenantSlug={tenant.slug}
            apiKeyPreview={tenant.api_key ? `${tenant.api_key.substring(0, 20)}...` : undefined}
          />
        </div>
      </header>

      {/* Main Container */}
      <main className="flex-1 max-w-4xl w-full mx-auto p-6 md:p-10 flex flex-col justify-center">
        <div className="space-y-8 text-center max-w-2xl mx-auto">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 mx-auto">
            <Layers className="w-8 h-8" />
          </div>

          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold text-white tracking-tight">
              Welcome to <span className="text-emerald-400">{tenant.name}</span>
            </h1>
            <p className="text-slate-400 text-sm">
              Your workspace is active. Create your first project or connect your existing pipelines with the API.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-left pt-2">
            {/* Action 1: Create Project */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-colors space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                  <Plus className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-white text-base">Create a Project</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Start with an Agile, Marketing, or Operations schema template with customizable hierarchy and Kanban statuses.
                </p>
              </div>

              <button
                onClick={() => setShowCreateModal(true)}
                className="w-full py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/20"
              >
                <Plus className="w-4 h-4" />
                <span>New Project</span>
              </button>
            </div>

            {/* Action 2: Headless API */}
            <div className="p-6 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-slate-700 transition-colors space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                  <Terminal className="w-5 h-5" />
                </div>
                <h3 className="font-bold text-white text-base">Headless Ingest</h3>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Send work items directly from Gemini Spark or CI/CD pipelines. Projects are automatically created on first ingest!
                </p>
              </div>

              <div className="space-y-2">
                <div className="p-2.5 rounded-lg bg-slate-950 border border-slate-800 font-mono text-[11px] text-slate-400 flex items-center justify-between">
                  <span className="truncate">POST /api/v1/items/ingest</span>
                  <button
                    onClick={() => handleCopy('POST /api/v1/items/ingest')}
                    className="ml-2 text-slate-500 hover:text-white"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Create Project Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
          <div className="w-full max-w-lg rounded-2xl bg-slate-900 border border-slate-800 p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Create First Project</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-slate-500 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleCreateProject} className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Schema Template
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SCHEMA_TEMPLATES.map((t) => (
                    <button
                      type="button"
                      key={t.id}
                      onClick={() => setSelectedTemplate(t.id)}
                      className={`p-2.5 rounded-lg border text-left text-xs transition-all ${
                        selectedTemplate === t.id
                          ? 'border-emerald-500 bg-emerald-500/10 text-white'
                          : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                      }`}
                    >
                      <div className="font-semibold">{t.name}</div>
                      <div className="text-[10px] text-slate-500 truncate">{t.description}</div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Project Name
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => {
                    setProjectName(e.target.value);
                    if (!projectSlug) {
                      setProjectSlug(e.target.value.toLowerCase().trim().replace(/[^a-z0-9-]/g, '-'));
                    }
                  }}
                  placeholder="e.g. Core Service"
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Project Slug
                </label>
                <input
                  type="text"
                  value={projectSlug}
                  onChange={(e) => setProjectSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
                  placeholder="core-service"
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-800 text-sm font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
                />
              </div>

              {error && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded p-2">
                  {error}
                </p>
              )}

              <div className="flex space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2.5 rounded-xl border border-slate-800 text-slate-400 text-xs font-medium hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={loading}
                  className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center justify-center space-x-2 transition-all disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Zap className="w-3.5 h-3.5 animate-pulse" />
                      <span>Creating...</span>
                    </>
                  ) : (
                    <span>Create Project</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
