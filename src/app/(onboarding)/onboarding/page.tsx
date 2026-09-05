'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, ArrowRight, ArrowLeft, Check, Copy, ExternalLink,
  Layers, Cpu, Paintbrush, BarChart3, Zap, CheckCircle2, Key,
  Upload, FileCode, AlertCircle, Loader2, FastForward
} from 'lucide-react';
import { SCHEMA_TEMPLATES, SchemaTemplate } from '@/lib/schema-templates';

type Step = 1 | 2 | 3;
type SlugStatus = 'idle' | 'checking' | 'available' | 'taken' | 'invalid';

function slugify(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 40);
}

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  software: <Cpu className="w-5 h-5" />,
  marketing: <BarChart3 className="w-5 h-5" />,
  operations: <Layers className="w-5 h-5" />,
  custom: <Paintbrush className="w-5 h-5" />,
};

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState<Step>(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Step 1 — Workspace
  const [orgName, setOrgName] = useState('');
  const [workspaceSlug, setWorkspaceSlug] = useState('');
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);
  const [workspaceSlugStatus, setWorkspaceSlugStatus] = useState<SlugStatus>('idle');
  const [workspaceSlugError, setWorkspaceSlugError] = useState('');

  // Step 2 — Project
  const [projectMode, setProjectMode] = useState<'template' | 'json'>('template');
  const [projectName, setProjectName] = useState('');
  const [projectSlug, setProjectSlug] = useState('');
  const [projectSlugManual, setProjectSlugManual] = useState(false);
  const [projectSlugStatus, setProjectSlugStatus] = useState<SlugStatus>('idle');
  const [projectSlugError, setProjectSlugError] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState<string>('software');

  // JSON Upload state
  const [jsonContent, setJsonContent] = useState('');
  const [jsonParsedInfo, setJsonParsedInfo] = useState<{
    name?: string;
    slug?: string;
    hierarchyCount?: number;
    statusesCount?: number;
    itemsCount?: number;
    settings?: any;
    items?: any[];
  } | null>(null);
  const [jsonError, setJsonError] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Step 3 — Result
  const [result, setResult] = useState<{
    tenant: any; project: any | null; api_key: string; workspace_url: string;
  } | null>(null);

  // ── Workspace Slug DB Validation ─────────────────────────────────────────
  useEffect(() => {
    if (!workspaceSlug || workspaceSlug.length < 2) {
      setWorkspaceSlugStatus('idle');
      setWorkspaceSlugError('');
      return;
    }

    const timer = setTimeout(async () => {
      setWorkspaceSlugStatus('checking');
      setWorkspaceSlugError('');

      try {
        const res = await fetch(
          `/api/v1/tenants/validate-slug?type=workspace&slug=${encodeURIComponent(workspaceSlug)}`
        );
        const data = await res.json();

        if (data.valid) {
          setWorkspaceSlugStatus('available');
          setWorkspaceSlugError('');
        } else {
          setWorkspaceSlugStatus('taken');
          setWorkspaceSlugError(data.error || `Workspace slug "${workspaceSlug}" is not available.`);
        }
      } catch {
        setWorkspaceSlugStatus('idle');
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [workspaceSlug]);

  // ── Project Slug DB Validation ───────────────────────────────────────────
  useEffect(() => {
    if (!projectSlug || projectSlug.length < 2) {
      setProjectSlugStatus('idle');
      setProjectSlugError('');
      return;
    }

    const timer = setTimeout(async () => {
      setProjectSlugStatus('checking');
      setProjectSlugError('');

      try {
        const res = await fetch(
          `/api/v1/tenants/validate-slug?type=project&slug=${encodeURIComponent(projectSlug)}&workspace_slug=${encodeURIComponent(workspaceSlug)}`
        );
        const data = await res.json();

        if (data.valid) {
          setProjectSlugStatus('available');
          setProjectSlugError('');
        } else {
          setProjectSlugStatus('taken');
          setProjectSlugError(data.error || `Project slug "${projectSlug}" is not available.`);
        }
      } catch {
        setProjectSlugStatus('idle');
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [projectSlug, workspaceSlug]);

  // ── Auto-derive slugs ────────────────────────────────────────────────────
  const handleOrgNameChange = (v: string) => {
    setOrgName(v);
    if (!slugManuallyEdited) {
      setWorkspaceSlug(slugify(v));
    }
  };

  const handleProjectNameChange = (v: string) => {
    setProjectName(v);
    if (!projectSlugManual) {
      setProjectSlug(slugify(v));
    }
  };

  // ── Validate Workspace Slug on Step 1 Next ───────────────────────────────
  const handleStep1Next = async () => {
    setError('');
    const cleanOrg = orgName.trim();
    const cleanSlug = workspaceSlug.trim().toLowerCase();

    if (!cleanOrg || !cleanSlug) {
      setError('Both organization name and workspace slug are required.');
      return;
    }

    if (cleanSlug.length < 2) {
      setError('Workspace slug must be at least 2 characters long.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(
        `/api/v1/tenants/validate-slug?type=workspace&slug=${encodeURIComponent(cleanSlug)}`
      );
      const data = await res.json();

      if (!data.valid) {
        setWorkspaceSlugStatus('taken');
        setWorkspaceSlugError(data.error || `Workspace slug "${cleanSlug}" is already taken.`);
        setError(data.error || `Workspace slug "${cleanSlug}" is already taken. Choose a different one.`);
        setLoading(false);
        return;
      }

      setWorkspaceSlugStatus('available');
      setStep(2);
    } catch (err: any) {
      setError(err.message || 'Validation failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── JSON Upload Handler ──────────────────────────────────────────────────
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      parseJsonDocument(text);
    };
    reader.readAsText(file);
  };

  const parseJsonDocument = (text: string) => {
    setJsonContent(text);
    setJsonError('');

    try {
      const parsed = JSON.parse(text);

      const detectedName = parsed.name || parsed.project_name || parsed.title || '';
      const detectedSlug = parsed.slug || parsed.project_slug || (detectedName ? slugify(detectedName) : '');
      const detectedSettings = parsed.settings || (parsed.hierarchy && parsed.statuses ? parsed : undefined);
      const detectedItems = Array.isArray(parsed.items) ? parsed.items : Array.isArray(parsed) ? parsed : [];

      if (detectedName) {
        setProjectName(detectedName);
      }
      if (detectedSlug) {
        setProjectSlug(detectedSlug);
      }

      setJsonParsedInfo({
        name: detectedName,
        slug: detectedSlug,
        hierarchyCount: detectedSettings?.hierarchy?.length,
        statusesCount: detectedSettings?.statuses?.length,
        itemsCount: detectedItems.length,
        settings: detectedSettings,
        items: detectedItems,
      });
    } catch (err: any) {
      setJsonError(`Invalid JSON: ${err.message}`);
      setJsonParsedInfo(null);
    }
  };

  // ── Step submission ──────────────────────────────────────────────────────
  const handleSubmit = async (skipProject: boolean = false) => {
    setLoading(true);
    setError('');

    // If not skipping project, ensure project slug is unique in DB
    if (!skipProject) {
      if (!projectName.trim() || !projectSlug.trim()) {
        setError('Project name and slug are required.');
        setLoading(false);
        return;
      }

      try {
        const valRes = await fetch(
          `/api/v1/tenants/validate-slug?type=project&slug=${encodeURIComponent(projectSlug)}&workspace_slug=${encodeURIComponent(workspaceSlug)}`
        );
        const valData = await valRes.json();

        if (!valData.valid) {
          setProjectSlugStatus('taken');
          setProjectSlugError(valData.error || `Project slug "${projectSlug}" is already taken.`);
          setError(valData.error || `Project slug "${projectSlug}" is already taken in the database.`);
          setLoading(false);
          return;
        }
      } catch (err: any) {
        setError(err.message || 'Validation failed. Please try again.');
        setLoading(false);
        return;
      }
    }

    try {
      const payload: any = {
        org_name: orgName,
        slug: workspaceSlug,
        skip_project: skipProject,
      };

      if (!skipProject) {
        payload.project_name = projectName;
        payload.project_slug = projectSlug;
        payload.template_id = selectedTemplate;

        if (jsonParsedInfo?.settings) {
          payload.custom_settings = jsonParsedInfo.settings;
        }
        if (jsonParsedInfo?.items && jsonParsedInfo.items.length > 0) {
          payload.initial_items = jsonParsedInfo.items;
        }
      }

      const res = await fetch('/api/v1/tenants/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Failed to create workspace. Please try again.');
        setLoading(false);
        return;
      }

      setResult(data);
      setStep(3);
    } catch (err: any) {
      setError(err.message || 'Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyKey = () => {
    if (result?.api_key) {
      navigator.clipboard.writeText(result.api_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleEnterWorkspace = () => {
    if (result?.workspace_url) {
      router.push(result.workspace_url);
    }
  };

  // ── Step indicators ──────────────────────────────────────────────────────
  const STEPS = [
    { num: 1, label: 'Workspace' },
    { num: 2, label: 'First Project' },
    { num: 3, label: 'API Key' },
  ];

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6 bg-[#090d16]">
      <div className="w-full max-w-xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 font-bold mx-auto">
            ST
          </div>
          <h1 className="text-2xl font-extrabold text-white tracking-tight">
            Set up your workspace
          </h1>
          <p className="text-sm text-slate-400">
            Takes 60 seconds. You can customize everything later.
          </p>
        </div>

        {/* Step progress */}
        <div className="flex items-center justify-center space-x-2">
          {STEPS.map((s, i) => (
            <div key={s.num} className="flex items-center">
              <div
                className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border transition-all ${
                  step > s.num
                    ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                    : step === s.num
                    ? 'border-emerald-500 text-emerald-400 bg-emerald-500/10'
                    : 'border-slate-700 text-slate-600'
                }`}
              >
                {step > s.num ? <Check className="w-3.5 h-3.5" /> : s.num}
              </div>
              <span
                className={`ml-1.5 text-xs font-medium ${
                  step === s.num ? 'text-white' : 'text-slate-500'
                }`}
              >
                {s.label}
              </span>
              {i < STEPS.length - 1 && (
                <div className={`mx-3 h-px w-8 ${step > s.num ? 'bg-emerald-500' : 'bg-slate-700'}`} />
              )}
            </div>
          ))}
        </div>

        {/* ── STEP 1: Workspace ──────────────────────────────────────────── */}
        {step === 1 && (
          <div className="p-8 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-6">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-semibold text-white">Your Workspace</h2>
                <p className="text-xs text-slate-400">This is your organization's home in Tracker</p>
              </div>
            </div>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Organization Name
                </label>
                <input
                  type="text"
                  value={orgName}
                  onChange={(e) => handleOrgNameChange(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Workspace Slug
                  </label>
                  {workspaceSlugStatus === 'checking' && (
                    <span className="text-[11px] text-slate-400 flex items-center space-x-1">
                      <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                      <span>Checking availability…</span>
                    </span>
                  )}
                  {workspaceSlugStatus === 'available' && (
                    <span className="text-[11px] text-emerald-400 flex items-center space-x-1 font-medium">
                      <Check className="w-3 h-3" />
                      <span>Slug is available</span>
                    </span>
                  )}
                  {workspaceSlugStatus === 'taken' && (
                    <span className="text-[11px] text-red-400 flex items-center space-x-1 font-medium">
                      <AlertCircle className="w-3 h-3" />
                      <span>Slug already taken</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-slate-500 text-sm font-mono flex-shrink-0">track.sunshade.icu/</span>
                  <div className="relative flex-1">
                    <input
                      type="text"
                      value={workspaceSlug}
                      onChange={(e) => {
                        setSlugManuallyEdited(true);
                        setWorkspaceSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                      }}
                      placeholder="acme-corp"
                      className={`w-full px-3 py-2.5 rounded-lg bg-slate-950 border text-sm font-mono focus:outline-none transition-colors ${
                        workspaceSlugStatus === 'taken'
                          ? 'border-red-600/80 text-red-300 focus:border-red-500'
                          : workspaceSlugStatus === 'available'
                          ? 'border-emerald-500/80 text-emerald-400 focus:border-emerald-500'
                          : 'border-slate-800 text-emerald-400 focus:border-emerald-500'
                      }`}
                    />
                  </div>
                </div>

                {workspaceSlugError ? (
                  <p className="text-xs text-red-400 mt-1">{workspaceSlugError}</p>
                ) : (
                  <p className="text-xs text-slate-500">Lowercase letters, numbers, and hyphens only</p>
                )}
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded px-3 py-2">
                {error}
              </p>
            )}

            <button
              onClick={handleStep1Next}
              disabled={loading || workspaceSlugStatus === 'taken'}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Validating Workspace…</span>
                </>
              ) : (
                <>
                  <span>Next: First Project</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        )}

        {/* ── STEP 2: First Project ──────────────────────────────────────── */}
        {step === 2 && (
          <div className="p-8 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-3">
                <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="font-semibold text-white">Your First Project</h2>
                  <p className="text-xs text-slate-400">Choose a starter template or upload JSON</p>
                </div>
              </div>

              {/* Mode Toggle: Template vs JSON */}
              <div className="flex bg-slate-950 p-0.5 rounded-lg border border-slate-800 text-xs">
                <button
                  type="button"
                  onClick={() => setProjectMode('template')}
                  className={`px-2.5 py-1 rounded-md transition-colors ${
                    projectMode === 'template'
                      ? 'bg-slate-800 text-white font-medium'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  Template
                </button>
                <button
                  type="button"
                  onClick={() => setProjectMode('json')}
                  className={`px-2.5 py-1 rounded-md transition-colors flex items-center space-x-1 ${
                    projectMode === 'json'
                      ? 'bg-slate-800 text-white font-medium'
                      : 'text-slate-400 hover:text-white'
                  }`}
                >
                  <FileCode className="w-3 h-3" />
                  <span>Upload JSON</span>
                </button>
              </div>
            </div>

            <div className="space-y-4">
              {/* Template Mode */}
              {projectMode === 'template' ? (
                <div className="space-y-1.5">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Schema Template
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {SCHEMA_TEMPLATES.map((t: SchemaTemplate) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTemplate(t.id)}
                        className={`p-3 rounded-lg border text-left transition-all ${
                          selectedTemplate === t.id
                            ? 'border-emerald-500/60 bg-emerald-500/10 text-white'
                            : 'border-slate-800 bg-slate-950 text-slate-400 hover:border-slate-700'
                        }`}
                      >
                        <div className="flex items-center space-x-2 mb-1">
                          <span className={selectedTemplate === t.id ? 'text-emerald-400' : 'text-slate-500'}>
                            {TEMPLATE_ICONS[t.id]}
                          </span>
                          <span className="text-xs font-semibold">{t.name}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 leading-tight">{t.description}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                /* JSON Upload Mode */
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                      Upload Project JSON Document
                    </label>
                    <div
                      onClick={() => fileInputRef.current?.click()}
                      className="border-2 border-dashed border-slate-800 hover:border-emerald-500/50 rounded-xl p-5 text-center cursor-pointer bg-slate-950/60 transition-colors"
                    >
                      <Upload className="w-6 h-6 text-slate-400 mx-auto mb-2" />
                      <p className="text-xs font-medium text-slate-200">
                        Click to upload <code className="text-emerald-400 font-mono">.json</code> file
                      </p>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Supports project schema definitions or Gemini Spark ingest payloads
                      </p>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".json,application/json"
                        onChange={handleFileChange}
                        className="hidden"
                      />
                    </div>
                  </div>

                  {/* Or paste JSON */}
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                      Or Paste JSON Document
                    </label>
                    <textarea
                      value={jsonContent}
                      onChange={(e) => parseJsonDocument(e.target.value)}
                      placeholder='{ "project_name": "API Service", "items": [{ "title": "Setup database", "item_type": "task" }] }'
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-300 focus:outline-none focus:border-emerald-500 transition-colors"
                    />
                  </div>

                  {/* JSON Error */}
                  {jsonError && (
                    <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded p-2">
                      {jsonError}
                    </p>
                  )}

                  {/* JSON Summary Badge */}
                  {jsonParsedInfo && (
                    <div className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-300 space-y-1">
                      <div className="font-semibold flex items-center space-x-1.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />
                        <span>JSON Document Parsed Successfully</span>
                      </div>
                      <div className="text-[11px] text-emerald-200/80 flex flex-wrap gap-x-3">
                        {jsonParsedInfo.name && <span>Name: <strong>{jsonParsedInfo.name}</strong></span>}
                        {jsonParsedInfo.itemsCount !== undefined && jsonParsedInfo.itemsCount > 0 && (
                          <span>Items: <strong>{jsonParsedInfo.itemsCount}</strong></span>
                        )}
                        {jsonParsedInfo.hierarchyCount !== undefined && (
                          <span>Levels: <strong>{jsonParsedInfo.hierarchyCount}</strong></span>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Project name */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Project Name
                </label>
                <input
                  type="text"
                  value={projectName}
                  onChange={(e) => handleProjectNameChange(e.target.value)}
                  placeholder="e.g. Q4 Roadmap"
                  className="w-full px-4 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-sm focus:outline-none focus:border-emerald-500 transition-colors"
                />
              </div>

              {/* Project slug with live DB check */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                    Project Slug
                  </label>
                  {projectSlugStatus === 'checking' && (
                    <span className="text-[11px] text-slate-400 flex items-center space-x-1">
                      <Loader2 className="w-3 h-3 animate-spin text-emerald-400" />
                      <span>Checking...</span>
                    </span>
                  )}
                  {projectSlugStatus === 'available' && (
                    <span className="text-[11px] text-emerald-400 flex items-center space-x-1 font-medium">
                      <Check className="w-3 h-3" />
                      <span>Slug available</span>
                    </span>
                  )}
                  {projectSlugStatus === 'taken' && (
                    <span className="text-[11px] text-red-400 flex items-center space-x-1 font-medium">
                      <AlertCircle className="w-3 h-3" />
                      <span>Slug taken in database</span>
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2">
                  <span className="text-slate-500 text-sm font-mono flex-shrink-0">/{workspaceSlug}/</span>
                  <input
                    type="text"
                    value={projectSlug}
                    onChange={(e) => {
                      setProjectSlugManual(true);
                      setProjectSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                    }}
                    placeholder="q4-roadmap"
                    className={`flex-1 px-3 py-2.5 rounded-lg bg-slate-950 border text-sm font-mono focus:outline-none transition-colors ${
                      projectSlugStatus === 'taken'
                        ? 'border-red-600/80 text-red-300 focus:border-red-500'
                        : projectSlugStatus === 'available'
                        ? 'border-emerald-500/80 text-emerald-400 focus:border-emerald-500'
                        : 'border-slate-800 text-emerald-400 focus:border-emerald-500'
                    }`}
                  />
                </div>
                {projectSlugError && (
                  <p className="text-xs text-red-400 mt-1">{projectSlugError}</p>
                )}
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded px-3 py-2">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="space-y-3 pt-2">
              <div className="flex space-x-3">
                <button
                  type="button"
                  onClick={() => { setError(''); setStep(1); }}
                  className="px-4 py-3 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 text-sm font-medium transition-colors flex items-center space-x-2"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>Back</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleSubmit(false)}
                  disabled={loading || projectSlugStatus === 'taken'}
                  className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
                >
                  {loading ? (
                    <><Zap className="w-4 h-4 animate-pulse" /><span>Creating Workspace…</span></>
                  ) : (
                    <><span>Create Workspace</span><ArrowRight className="w-4 h-4" /></>
                  )}
                </button>
              </div>

              {/* Skip to API Key */}
              <div className="text-center pt-1 border-t border-slate-800/60">
                <button
                  type="button"
                  onClick={() => handleSubmit(true)}
                  disabled={loading}
                  className="text-xs text-slate-400 hover:text-emerald-400 inline-flex items-center space-x-1.5 transition-colors py-1 px-2 rounded-lg hover:bg-slate-800/50"
                >
                  <FastForward className="w-3.5 h-3.5 text-amber-400" />
                  <span>Skip project setup → Go straight to API key</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP 3: API Key ────────────────────────────────────────────── */}
        {step === 3 && result && (
          <div className="p-8 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-6">
            <div className="text-center space-y-2">
              <CheckCircle2 className="w-10 h-10 text-emerald-400 mx-auto" />
              <h2 className="text-xl font-bold text-white">Workspace Ready!</h2>
              <p className="text-sm text-slate-400">
                <span className="text-emerald-400 font-semibold">{result.tenant.name}</span> is live.
              </p>
            </div>

            {/* API Key display */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2">
                <Key className="w-4 h-4 text-amber-400" />
                <span className="text-xs font-semibold uppercase tracking-wider text-amber-300">
                  Tenant API Key — Copy Now
                </span>
              </div>
              <div className="p-3 rounded-lg bg-slate-950 border border-amber-700/40 flex items-center justify-between space-x-3">
                <code className="text-xs font-mono text-amber-300 break-all flex-1">
                  {result.api_key}
                </code>
                <button
                  onClick={handleCopyKey}
                  className="flex-shrink-0 p-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-400 hover:bg-amber-500/20 transition-colors"
                  title="Copy API key"
                >
                  {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                </button>
              </div>
              <p className="text-xs text-amber-400/70">
                ⚠ This key is shown <strong>once</strong>. Store it securely — use it with{' '}
                <code className="text-emerald-300">Authorization: Bearer &lt;key&gt;</code> for
                Gemini Spark ingest pipelines.
              </p>
            </div>

            {/* Ingest endpoint hint */}
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-400 space-y-1">
              <div className="flex items-center space-x-2">
                <span className="text-emerald-400">POST</span>{' '}
                <span className="text-slate-300">/api/v1/items/ingest</span>
                {result.project ? (
                  <span>→ project: <span className="text-emerald-400">"{result.project.slug}"</span></span>
                ) : (
                  <span className="text-slate-500">(projects auto-create on ingest)</span>
                )}
              </div>
            </div>

            <button
              onClick={handleEnterWorkspace}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              <span>Enter Workspace</span>
              <ExternalLink className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
