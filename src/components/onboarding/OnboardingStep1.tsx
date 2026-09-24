'use client';

import React from 'react';
import { Building2, ArrowRight } from 'lucide-react';

interface OnboardingStep1Props {
  orgName: string;
  workspaceSlug: string;
  onOrgNameChange: (val: string) => void;
  onWorkspaceSlugChange: (val: string) => void;
  error: string;
  onNext: () => void;
}

export function OnboardingStep1({
  orgName,
  workspaceSlug,
  onOrgNameChange,
  onWorkspaceSlugChange,
  error,
  onNext,
}: OnboardingStep1Props) {
  return (
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
            onChange={(e) => onOrgNameChange(e.target.value)}
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
              onChange={(e) => onWorkspaceSlugChange(e.target.value)}
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
        onClick={onNext}
        className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/20"
      >
        <span>Next: First Project</span>
        <ArrowRight className="w-4 h-4" />
      </button>
    </div>
  );
}
