'use client';

import React, { useState } from 'react';
import { CheckCircle2, Key, Check, Copy, ExternalLink } from 'lucide-react';

interface OnboardingStep3Props {
  result: {
    tenant: { name: string };
    project: { slug: string };
    api_key: string;
    workspace_url: string;
  };
  onEnterWorkspace: () => void;
}

export function OnboardingStep3({ result, onEnterWorkspace }: OnboardingStep3Props) {
  const [copied, setCopied] = useState(false);

  const handleCopyKey = () => {
    if (result?.api_key) {
      navigator.clipboard.writeText(result.api_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
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
        onClick={onEnterWorkspace}
        className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/20"
      >
        <span>Enter Workspace</span>
        <ExternalLink className="w-4 h-4" />
      </button>
    </div>
  );
}
