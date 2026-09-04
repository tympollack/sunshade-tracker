'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Key, Shield, ArrowRight, CheckCircle } from 'lucide-react';

export default function LoginPage() {
  const [apiKey, setApiKey] = useState('tk_live_sunshade_master_key');
  const [tenantSlug, setTenantSlug] = useState('sunshade');
  const [projectSlug, setProjectSlug] = useState('portfolio');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleEnterWorkspace = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sunshade_tracker_api_key', apiKey.trim());
      localStorage.setItem('sunshade_tracker_tenant', tenantSlug.trim());
    }
    router.push(`/${tenantSlug}/${projectSlug}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-radial-gradient from-slate-900 to-[#090d16]">
      <div className="w-full max-w-md p-8 rounded-2xl bg-slate-900/80 border border-slate-800 shadow-2xl backdrop-blur-xl space-y-6">
        <div className="space-y-2 text-center">
          <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400">
            <Key className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">SunShade Workspace Access</h1>
          <p className="text-sm text-slate-400">
            Authenticate via Tenant Master API Key to manage work items and schemas
          </p>
        </div>

        <form onSubmit={handleEnterWorkspace} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Tenant API Key
            </label>
            <div className="relative">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                required
                placeholder="tk_live_..."
                className="w-full px-4 py-2.5 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-sm font-mono focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <p className="text-xs text-slate-400">Default Tenant 0: <code className="text-emerald-400">tk_live_sunshade_master_key</code></p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Tenant Slug
              </label>
              <input
                type="text"
                value={tenantSlug}
                onChange={(e) => setTenantSlug(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-sm font-mono focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs font-semibold uppercase tracking-wider text-slate-300">
                Project Slug
              </label>
              <input
                type="text"
                value={projectSlug}
                onChange={(e) => setProjectSlug(e.target.value)}
                required
                className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-100 text-sm font-mono focus:outline-none focus:border-emerald-500 transition-colors"
              />
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
          >
            <span>{loading ? 'Entering...' : 'Enter Workspace'}</span>
            <ArrowRight className="w-4 h-4" />
          </button>
        </form>

        <div className="pt-4 border-t border-slate-800/80 text-xs text-center text-slate-400 space-y-1">
          <p>Protected under Row Level Security & Schemaless Isolation</p>
        </div>
      </div>
    </div>
  );
}
