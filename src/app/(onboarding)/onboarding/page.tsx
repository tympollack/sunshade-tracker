'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Building2, ArrowRight, ArrowLeft, Check, Copy, ExternalLink,
  Layers, Cpu, Paintbrush, BarChart3, Zap, CheckCircle2, Key
} from 'lucide-react';
import { SCHEMA_TEMPLATES, SchemaTemplate } from '@/lib/schema-templates';

type Step = 1 | 2 | 3;

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

  // Step 2 — Project
  const [projectName, setProjectName] = useState('');
  const [projectSlug, setProjectSlug] = useState('');
  const [projectSlugManual, setProjectSlugManual] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('software');

  // Step 3 — Result
  const [result, setResult] = useState<{
    tenant: any; project: any; api_key: string; workspace_url: string;
  } | null>(null);

  // ── Auto-derive slugs ────────────────────────────────────────────────────
  const handleOrgNameChange = (v: string) => {
    setOrgName(v);
    if (!slugManuallyEdited) setWorkspaceSlug(slugify(v));
  };

  const handleProjectNameChange = (v: string) => {
    setProjectName(v);
    if (!projectSlugManual) setProjectSlug(slugify(v));
  };

  // ── Step submission ──────────────────────────────────────────────────────
  const handleSubmit = async () => {
    setLoading(true);
    setError('');

    try {
      const res = await fetch('/api/v1/tenants/onboard', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          org_name: orgName,
          slug: workspaceSlug,
          project_name: projectName,
          project_slug: projectSlug,
          template_id: selectedTemplate,
        }),
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
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Workspace Slug
                </label>
                <div className="flex items-center space-x-2">
                  <span className="text-slate-500 text-sm font-mono flex-shrink-0">track.sunshade.icu/</span>
                  <input
                    type="text"
                    value={workspaceSlug}
                    onChange={(e) => {
                      setSlugManuallyEdited(true);
                      setWorkspaceSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''));
                    }}
                    placeholder="acme-corp"
                    className="flex-1 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-emerald-400 text-sm font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
                <p className="text-xs text-slate-500">Lowercase letters, numbers, and hyphens only</p>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded px-3 py-2">
                {error}
              </p>
            )}

            <button
              onClick={() => {
                if (!orgName.trim() || !workspaceSlug.trim()) {
                  setError('Both fields are required');
                  return;
                }
                setError('');
                setStep(2);
              }}
              className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/20"
            >
              <span>Next: First Project</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* ── STEP 2: First Project ──────────────────────────────────────── */}
        {step === 2 && (
          <div className="p-8 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-6">
            <div className="flex items-center space-x-3">
              <div className="w-9 h-9 rounded-lg bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                <Layers className="w-5 h-5" />
              </div>
              <div>
                <h2 className="font-semibold text-white">Your First Project</h2>
                <p className="text-xs text-slate-400">Pick a template — hierarchy & statuses are fully customizable</p>
              </div>
            </div>

            <div className="space-y-4">
              {/* Template picker */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Schema Template
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SCHEMA_TEMPLATES.map((t: SchemaTemplate) => (
                    <button
                      key={t.id}
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

              {/* Project slug */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                  Project Slug
                </label>
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
                    className="flex-1 px-3 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-emerald-400 text-sm font-mono focus:outline-none focus:border-emerald-500 transition-colors"
                  />
                </div>
              </div>
            </div>

            {error && (
              <p className="text-xs text-red-400 bg-red-950/40 border border-red-800/40 rounded px-3 py-2">
                {error}
              </p>
            )}

            <div className="flex space-x-3">
              <button
                onClick={() => { setError(''); setStep(1); }}
                className="px-4 py-3 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 text-sm font-medium transition-colors flex items-center space-x-2"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Back</span>
              </button>
              <button
                onClick={() => {
                  if (!projectName.trim() || !projectSlug.trim()) {
                    setError('Project name and slug are required');
                    return;
                  }
                  setError('');
                  handleSubmit();
                }}
                disabled={loading}
                className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                {loading ? (
                  <><Zap className="w-4 h-4 animate-pulse" /><span>Creating Workspace…</span></>
                ) : (
                  <><span>Create Workspace</span><ArrowRight className="w-4 h-4" /></>
                )}
              </button>
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
            <div className="p-3 rounded-lg bg-slate-950 border border-slate-800 text-xs font-mono text-slate-400">
              <span className="text-emerald-400">POST</span>{' '}
              <span className="text-slate-300">/api/v1/items/ingest</span>
              {' '}→ project: <span className="text-emerald-400">"{result.project.slug}"</span>
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
