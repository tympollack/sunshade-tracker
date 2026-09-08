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
  Plus,
  AlertTriangle,
  XCircle,
  Loader2,
  TrendingUp,
  Sparkles,
  Bell,
  Mail,
} from 'lucide-react';
import { UserMenu } from '@/components/UserMenu';
import { WorkspaceSwitcher } from '@/components/WorkspaceSwitcher';
import { SunShadeLogo } from '@/components/SunShadeLogo';
import { NotificationBell } from '@/components/NotificationBell';
import { SCHEMA_TEMPLATES } from '@/lib/schema-templates';


interface PageProps {
  params: Promise<{
    tenantSlug: string;
  }>;
}

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 40);
}

export default function WorkspaceSettingsPage(props: PageProps) {
  const { tenantSlug } = use(props.params);
  const router = useRouter();

  const [tenantInfo, setTenantInfo] = useState<any>(null);
  const [allWorkspaces, setAllWorkspaces] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // Key state
  const [copiedKeyPreview, setCopiedKeyPreview] = useState(false);
  const [isRegeneratingKey, setIsRegeneratingKey] = useState(false);
  const [newGeneratedFullKey, setNewGeneratedFullKey] = useState<string | null>(null);
  const [copiedFullKey, setCopiedFullKey] = useState(false);

  // Project creation state
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [newProjName, setNewProjName] = useState('');
  const [newProjSlug, setNewProjSlug] = useState('');
  const [newProjDesc, setNewProjDesc] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [isCreatingProject, setIsCreatingProject] = useState(false);
  const [createProjectError, setCreateProjectError] = useState('');

  // Notification Preferences state
  const [notificationPrefs, setNotificationPrefs] = useState({
    notify_in_app: true,
    notify_email: true,
    notify_on_assignment: true,
    notify_on_status_change: true,
  });
  const [isSavingPrefs, setIsSavingPrefs] = useState(false);
  const [prefsSavedMessage, setPrefsSavedMessage] = useState(false);

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
    setFetchError(null);
    try {
      const res = await apiFetch('/api/v1/tenants/me');
      if (res.ok) {
        const data = await res.json();
        const workspaces = data.workspaces || [];
        setAllWorkspaces(workspaces);

        if (data.user?.notification_preferences) {
          setNotificationPrefs(data.user.notification_preferences);
        }

        // Strictly validate that tenantSlug matches an authorized workspace
        const current = workspaces.find((w: any) => w.slug === tenantSlug);
        if (!current) {
          setFetchError(
            `Workspace "@${tenantSlug}" was not found or you are not an active member.`
          );
          setTenantInfo(null);
        } else {
          setTenantInfo(current);
        }
      } else if (res.status === 401) {
        setFetchError('Session expired. Please sign in again.');
      } else {
        const err = await res.json().catch(() => ({}));
        setFetchError(err.error || 'Failed to load workspace settings.');
      }
    } catch (err: any) {
      setFetchError(err.message || 'Network error loading workspace.');
    } finally {
      setLoading(false);
    }
  }, [apiFetch, tenantSlug]);

  useEffect(() => {
    loadWorkspace();
  }, [loadWorkspace]);

  // Copy masked key identifier
  const handleCopyKeyPreview = () => {
    if (!tenantInfo?.api_key_preview) return;
    navigator.clipboard.writeText(tenantInfo.api_key_preview);
    setCopiedKeyPreview(true);
    setTimeout(() => setCopiedKeyPreview(false), 2000);
  };

  // Copy full key after regeneration
  const handleCopyFullKey = () => {
    if (!newGeneratedFullKey) return;
    navigator.clipboard.writeText(newGeneratedFullKey);
    setCopiedFullKey(true);
    setTimeout(() => setCopiedFullKey(false), 2000);
  };

  // Toggle notification preference
  const handleTogglePref = async (key: string) => {
    const updated = {
      ...notificationPrefs,
      [key]: !notificationPrefs[key as keyof typeof notificationPrefs],
    };
    setNotificationPrefs(updated);
    setIsSavingPrefs(true);
    try {
      const res = await apiFetch('/api/v1/tenants/me', {
        method: 'PATCH',
        body: JSON.stringify({ notification_preferences: updated }),
      });
      if (res.ok) {
        setPrefsSavedMessage(true);
        setTimeout(() => setPrefsSavedMessage(false), 2500);
      }
    } catch (err) {
      console.error('Failed to save notification preferences', err);
    } finally {
      setIsSavingPrefs(false);
    }
  };


  // Regenerate API key workflow
  const handleRegenerateKey = async () => {
    if (
      !confirm(
        'Regenerate workspace API key? Any pipelines or agents using the current key will stop working until updated.'
      )
    ) {
      return;
    }

    setIsRegeneratingKey(true);
    try {
      const res = await apiFetch('/api/v1/tenants/api-key', { method: 'POST' });
      const data = await res.json();
      if (res.ok && data.api_key) {
        setNewGeneratedFullKey(data.api_key);
        setTenantInfo((prev: any) =>
          prev ? { ...prev, api_key_preview: data.api_key_preview } : null
        );
      } else {
        alert(data.error || 'Failed to regenerate API key.');
      }
    } catch (err: any) {
      alert(err.message || 'Error communicating with server.');
    } finally {
      setIsRegeneratingKey(false);
    }
  };

  // Auto-slugify project name
  const handleProjNameChange = (val: string) => {
    setNewProjName(val);
    if (!slugManuallyEdited) {
      setNewProjSlug(slugify(val));
    }
  };

  // Create project workflow
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newProjName.trim() || !newProjSlug.trim()) return;

    setIsCreatingProject(true);
    setCreateProjectError('');

    try {
      const res = await apiFetch('/api/v1/projects', {
        method: 'POST',
        body: JSON.stringify({
          name: newProjName.trim(),
          slug: newProjSlug.trim(),
          description: newProjDesc.trim() || null,
          settings: SCHEMA_TEMPLATES[0].settings,
        }),
      });

      const data = await res.json();
      if (res.ok && data.project) {
        setNewProjName('');
        setNewProjSlug('');
        setNewProjDesc('');
        setSlugManuallyEdited(false);
        setShowCreateProject(false);
        // Refresh workspace data
        await loadWorkspace();
      } else {
        setCreateProjectError(data.error || 'Failed to create project.');
      }
    } catch (err: any) {
      setCreateProjectError(err.message || 'Failed to create project.');
    } finally {
      setIsCreatingProject(false);
    }
  };

  // ─── Error View (e.g. unknown workspace) ──────────────────────────────────
  if (!loading && fetchError) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#090d16] p-6 text-slate-100">
        <div className="max-w-md text-center space-y-4 p-8 rounded-2xl bg-slate-900 border border-slate-800">
          <XCircle className="w-12 h-12 text-red-400 mx-auto" />
          <h2 className="text-xl font-bold text-white">Workspace Not Found</h2>
          <p className="text-sm text-slate-400">{fetchError}</p>
          <div className="flex items-center justify-center space-x-3 pt-2">
            <Link
              href="/"
              className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium transition-colors"
            >
              Home
            </Link>
            {allWorkspaces.length > 0 ? (
              <Link
                href={`/${allWorkspaces[0].slug}`}
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
              >
                Go to @{allWorkspaces[0].slug}
              </Link>
            ) : (
              <Link
                href="/login"
                className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium transition-colors"
              >
                Sign In
              </Link>
            )}
          </div>
        </div>
      </div>
    );
  }

  const projects = tenantInfo?.projects || [];
  const firstProjectSlug = projects[0]?.slug;

  return (
    <div className="min-h-screen flex flex-col bg-[#090d16] text-slate-100">
      {/* App Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md px-6 py-3 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center space-x-2">
          <SunShadeLogo variant="horizontal" size="xs" href="/" className="mr-1" />
          <span className="text-slate-700">/</span>
          <WorkspaceSwitcher currentTenantSlug={tenantSlug} workspaces={allWorkspaces} />
          <span className="text-slate-700">/</span>
          <span className="text-xs font-semibold text-slate-400">Settings</span>
        </div>

        <div className="flex items-center space-x-3">
          {firstProjectSlug ? (
            <Link
              href={`/${tenantSlug}/${firstProjectSlug}`}
              className="flex items-center space-x-1.5 px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-medium text-slate-300 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Board</span>
            </Link>
          ) : (
            <span className="text-xs font-mono text-slate-500 px-3 py-1.5 rounded-lg bg-slate-950 border border-slate-800/60">
              No Projects Yet
            </span>
          )}

          <NotificationBell tenantSlug={tenantSlug} />

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
              Workspace details, API credentials, and project management.
            </p>
          </div>
          <button
            onClick={loadWorkspace}
            disabled={loading}
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white transition-colors disabled:opacity-50"
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

        {/* Operational Efficiency Statement Card */}
        <div className="p-6 rounded-xl bg-gradient-to-r from-slate-900/80 via-slate-900/60 to-emerald-950/30 border border-emerald-500/30 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center space-x-2">
                <Sparkles className="w-5 h-5 text-emerald-400" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-white">
                  Operational Yield & Efficiency Statement
                </h2>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                  $0.00 Platform Fee
                </span>
              </div>
              <p className="text-xs text-slate-400 max-w-xl">
                Audit self-administered efficiency dividends, hours reclaimed from automated rollups and drag transitions, and export formal ledger statements.
              </p>
            </div>
            <Link
              href={`/${tenantSlug}/settings/efficiency`}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-bold text-xs flex items-center space-x-1.5 transition-colors self-start sm:self-center flex-shrink-0"
            >
              <TrendingUp className="w-3.5 h-3.5" />
              <span>View Statement</span>
            </Link>
          </div>
        </div>

        {/* User Notification Preferences Card */}
        <div className="p-6 rounded-xl bg-slate-900/60 border border-slate-800/80 space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Bell className="w-5 h-5 text-sky-400" />
              <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                Notification Preferences
              </h2>
            </div>
            {prefsSavedMessage && (
              <span className="text-xs text-emerald-400 font-medium flex items-center space-x-1 animate-in fade-in">
                <Check className="w-3.5 h-3.5" />
                <span>Preferences saved</span>
              </span>
            )}
          </div>

          <p className="text-xs text-slate-400">
            Configure how and when you receive transactional updates for task assignments and status transitions.
          </p>

          <div className="grid md:grid-cols-2 gap-4">
            {/* In-App Notifications Toggle */}
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-white">In-App Alerts</span>
                <p className="text-[11px] text-slate-400">Show bell badge and inbox alerts</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notificationPrefs.notify_in_app}
                onClick={() => handleTogglePref('notify_in_app')}
                disabled={isSavingPrefs}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                  notificationPrefs.notify_in_app ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    notificationPrefs.notify_in_app ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Email Notifications Toggle */}
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-white">Email Notifications (Resend)</span>
                <p className="text-[11px] text-slate-400">Receive transactional emails via Resend API</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notificationPrefs.notify_email}
                onClick={() => handleTogglePref('notify_email')}
                disabled={isSavingPrefs}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                  notificationPrefs.notify_email ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    notificationPrefs.notify_email ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Notify on Assignment Toggle */}
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-white">Assignment Alerts</span>
                <p className="text-[11px] text-slate-400">Alert me when assigned to a work item</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notificationPrefs.notify_on_assignment}
                onClick={() => handleTogglePref('notify_on_assignment')}
                disabled={isSavingPrefs}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                  notificationPrefs.notify_on_assignment ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    notificationPrefs.notify_on_assignment ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Notify on Status Change Toggle */}
            <div className="p-4 rounded-lg bg-slate-950 border border-slate-800 flex items-center justify-between">
              <div className="space-y-0.5">
                <span className="text-xs font-semibold text-white">Status Transition Alerts</span>
                <p className="text-[11px] text-slate-400">Alert me when items change status</p>
              </div>
              <button
                type="button"
                role="switch"
                aria-checked={notificationPrefs.notify_on_status_change}
                onClick={() => handleTogglePref('notify_on_status_change')}
                disabled={isSavingPrefs}
                className={`w-11 h-6 flex items-center rounded-full p-1 transition-colors ${
                  notificationPrefs.notify_on_status_change ? 'bg-emerald-500' : 'bg-slate-700'
                }`}
              >
                <div
                  className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform ${
                    notificationPrefs.notify_on_status_change ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
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
            <button
              onClick={handleRegenerateKey}
              disabled={isRegeneratingKey}
              className="px-3 py-1 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 hover:bg-amber-500/20 text-xs font-medium transition-colors disabled:opacity-50"
            >
              {isRegeneratingKey ? 'Regenerating…' : 'Regenerate API Key'}
            </button>
          </div>

          <p className="text-xs text-slate-400">
            For security, the full secret key is only displayed when generated. The preview below serves as a masked key identifier:
          </p>

          {/* Masked Preview identifier */}
          <div className="flex items-center space-x-2">
            <div className="flex-1 p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-slate-400 select-all truncate">
              {tenantInfo?.api_key_preview || 'tk_live_••••••••••••••••••••'}
            </div>
            <button
              onClick={handleCopyKeyPreview}
              className="px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-white text-xs font-medium flex items-center space-x-1.5 transition-colors"
              title="Copy key identifier"
            >
              {copiedKeyPreview ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-400" />
                  <span className="text-emerald-400">Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Identifier</span>
                </>
              )}
            </button>
          </div>

          {/* One-time banner for newly generated full secret key */}
          {newGeneratedFullKey && (
            <div className="p-4 rounded-xl bg-amber-950/40 border border-amber-600/50 space-y-2">
              <div className="flex items-center space-x-2 text-amber-300 text-xs font-bold">
                <AlertTriangle className="w-4 h-4 text-amber-400" />
                <span>New Secret API Key Generated — Copy Now</span>
              </div>
              <p className="text-[11px] text-amber-200/80">
                This secret key will not be shown again. Save it securely in your environment variables:
              </p>
              <div className="flex items-center space-x-2">
                <code className="flex-1 p-2.5 rounded-lg bg-slate-950 border border-amber-500/40 font-mono text-xs text-amber-300 break-all select-all">
                  {newGeneratedFullKey}
                </code>
                <button
                  onClick={handleCopyFullKey}
                  className="px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center space-x-1.5 transition-colors flex-shrink-0"
                >
                  {copiedFullKey ? (
                    <>
                      <Check className="w-3.5 h-3.5" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5" />
                      <span>Copy Full Key</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

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
            <div>
              <div className="flex items-center space-x-2">
                <Folder className="w-5 h-5 text-emerald-400" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-slate-200">
                  Workspace Projects
                </h2>
              </div>
              <p className="text-xs text-slate-400 mt-1">
                Projects within this workspace. Schema rules and status definitions are configured per-project on each project board.
              </p>
            </div>
            <button
              onClick={() => setShowCreateProject((v) => !v)}
              className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-slate-950 font-semibold text-xs flex items-center space-x-1.5 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>{showCreateProject ? 'Cancel' : 'New Project'}</span>
            </button>
          </div>

          {/* Project creation inline form */}
          {showCreateProject && (
            <form
              onSubmit={handleCreateProject}
              className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
            >
              <h3 className="text-xs font-bold uppercase text-slate-300">Create New Project</h3>
              <div className="grid md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Project Name</label>
                  <input
                    type="text"
                    placeholder="e.g. Core Platform"
                    value={newProjName}
                    onChange={(e) => handleProjNameChange(e.target.value)}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">Project Slug</label>
                  <input
                    type="text"
                    placeholder="e.g. core-platform"
                    value={newProjSlug}
                    onChange={(e) => {
                      setSlugManuallyEdited(true);
                      setNewProjSlug(e.target.value);
                    }}
                    required
                    className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs font-mono text-emerald-400 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <label className="text-[11px] text-slate-400">Description (optional)</label>
                <input
                  type="text"
                  placeholder="Short description of this project's scope"
                  value={newProjDesc}
                  onChange={(e) => setNewProjDesc(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>

              {createProjectError && (
                <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded p-2">
                  {createProjectError}
                </p>
              )}

              <div className="flex justify-end space-x-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowCreateProject(false)}
                  className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-xs text-slate-400"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isCreatingProject || !newProjName.trim()}
                  className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center space-x-1.5 disabled:opacity-50"
                >
                  {isCreatingProject ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      <span>Creating…</span>
                    </>
                  ) : (
                    <span>Create Project</span>
                  )}
                </button>
              </div>
            </form>
          )}

          <div className="space-y-2">
            {projects.length ? (
              projects.map((proj: any) => (
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
              <div className="text-center py-10 px-4 rounded-xl border border-dashed border-slate-800 space-y-3">
                <Folder className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-sm font-medium text-slate-300">No projects in this workspace</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto">
                  Create your first project to start tracking work items with Kanban boards and hierarchy trees.
                </p>
                {!showCreateProject && (
                  <button
                    onClick={() => setShowCreateProject(true)}
                    className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs transition-colors"
                  >
                    Create First Project
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
