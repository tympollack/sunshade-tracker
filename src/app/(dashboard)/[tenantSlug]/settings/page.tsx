'use client';

import { use, useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Settings,
  Key,
  Copy,
  Check,
  Folder,
  ArrowLeft,
  ExternalLink,
  Shield,
  Layers,
  Terminal,
  Cpu,
  RefreshCw,
} from 'lucide-react';
import { UserMenu } from '@/components/UserMenu';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import { ProjectSwitcher } from '@/components/ProjectSwitcher';

interface PageProps {
  params: Promise<{
    tenantSlug: string;
  }>;
}

export default function WorkspaceSettingsPage(props: PageProps) {
  const { tenantSlug } = use(props.params);
  const router = useRouter();

  const [tenantInfo, setTenantInfo] = useState<any>(null);
  const [allWorkspaces, setAllWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [copiedKey, setCopiedKey] = useState(false);

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

  const loadWorkspace = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiFetch('/api/v1/tenants/me');
      if (res.ok) {
        const data = await res.json();
        setAllWorkspaces(data.workspaces || []);
        const current = (data.workspaces || []).find((w: any) => w.slug === tenantSlug);
        setTenantInfo(current || data.primary_workspace || null);
      }
    } catch (err) {
      console.error('Failed to load workspace settings:', err);
    } finally {
      setLoading(false);
    }
  }, [apiFetch, tenantSlug]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  const handleCopyKey = () => {
    if (!tenantInfo?.api_key_preview) return;
    navigator.clipboard.writeText(tenantInfo.api_key_preview);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2000);
  };

  const firstProjectSlug = tenantInfo?.projects?.[0]?.slug || 'portfolio';

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
          <WorkspaceSwitcher currentTenantSlug={tenantSlug} workspaces={allWorkspaces} />
          <span className="text-slate-700">/</span>
          <span className="text-xs font-semibold text-slate-400">Settings</span>
        </div>

        <div className="flex items-center space-x-3">
          <Link
            href={`/${tenantSlug}/${firstProjectSlug}`}
            className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>Back to Board</span>
          </Link>

          {tenantInfo && (
            <UserMenu
              tenantName={tenantInfo.name}
              tenantSlug={tenantInfo.slug}
              apiKeyPreview={tenantInfo.api_key_preview}
            />
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 p-6 max-w-5xl mx-auto w-full space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white flex items-center gap-2">
              <Settings className="w-6 h-6 text-emerald-400" />
              Workspace Settings
            </h1>
            <p className="text-sm text-slate-400">
              Manage organization profile, access credentials, and project schemas.
            </p>
          </div>
          <button
            onClick={loadWorkspace}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>
        </div>

        {/* Workspace Overview Card */}
        <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-4">
          <h2 className="text-sm font-bold uppercase tracking-wider text-slate-400">
            Workspace Details
          </h2>
          <div className="grid md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-xs text-slate-500">Workspace Name</span>
              <p className="text-sm font-semibold text-white">
                {tenantInfo?.name || tenantSlug}
              </p>
            </div>
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-xs text-slate-500">Workspace Slug</span>
              <p className="text-sm font-mono text-emerald-400">@{tenantSlug}</p>
            </div>
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-1">
              <span className="text-xs text-slate-500">Tier & Role</span>
              <p className="text-sm font-semibold text-white capitalize">
                {tenantInfo?.tier || 'Free'} ·{' '}
                <span className="text-xs text-slate-400">{tenantInfo?.role || 'Member'}</span>
              </p>
            </div>
          </div>
        </div>

        {/* API Credentials Card */}
        <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Key className="w-5 h-5 text-amber-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                Workspace API Key
              </h2>
            </div>
            <span className="text-xs font-mono text-slate-500">Bearer Authentication</span>
          </div>
          <p className="text-xs text-slate-400">
            Use this API key for autonomous Gemini Spark pipelines or programmatic headless ingestion:
          </p>

          <div className="flex items-center space-x-2">
            <div className="flex-1 p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-amber-300 select-all truncate">
              {tenantInfo?.api_key_preview || 'tk_live_••••••••••••••••••••••••••••••••'}
            </div>
            <button
              onClick={handleCopyKey}
              className="px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium flex items-center space-x-1.5 transition-colors"
            >
              {copiedKey ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>

          <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 space-y-2">
            <div className="flex items-center space-x-2 text-xs text-slate-400 font-mono">
              <Terminal className="w-3.5 h-3.5 text-emerald-400" />
              <span>Headless Ingestion Endpoint:</span>
            </div>
            <code className="text-xs font-mono text-emerald-300 block bg-slate-900 p-2 rounded border border-slate-800">
              POST https://track.sunshade.icu/api/v1/items/ingest
            </code>
          </div>
        </div>

        {/* Projects List Card */}
        <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Folder className="w-5 h-5 text-emerald-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                Workspace Projects
              </h2>
            </div>
            <span className="text-xs font-mono text-emerald-400">
              {tenantInfo?.projects?.length || 0} Project{tenantInfo?.projects?.length !== 1 ? 's' : ''}
            </span>
          </div>

          <div className="space-y-2">
            {tenantInfo?.projects?.length ? (
              tenantInfo.projects.map((proj: any) => (
                <div
                  key={proj.id}
                  className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between hover:border-slate-700 transition-colors"
                >
                  <div className="flex items-center space-x-3">
                    <Folder className="w-4 h-4 text-emerald-400" />
                    <div>
                      <span className="text-sm font-semibold text-white">{proj.name}</span>
                      <span className="ml-2 text-xs font-mono text-slate-500">/{proj.slug}</span>
                      {proj.description && (
                        <p className="text-xs text-slate-400 mt-0.5">{proj.description}</p>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center space-x-2">
                    <Link
                      href={`/${tenantSlug}/${proj.slug}?tab=schema`}
                      className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors flex items-center space-x-1.5"
                    >
                      <Settings className="w-3 h-3 text-slate-400" />
                      <span>Schema Settings</span>
                    </Link>
                    <Link
                      href={`/${tenantSlug}/${proj.slug}`}
                      className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-medium text-white transition-colors flex items-center space-x-1.5"
                    >
                      <span>Open Board</span>
                      <ExternalLink className="w-3 h-3" />
                    </Link>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-sm text-slate-500">
                No projects found in this workspace.
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
