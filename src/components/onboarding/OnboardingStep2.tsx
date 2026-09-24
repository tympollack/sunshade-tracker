'use client';

import React from 'react';
import { Layers, Cpu, Paintbrush, BarChart3, ArrowLeft, ArrowRight, Zap } from 'lucide-react';
import { SCHEMA_TEMPLATES, SchemaTemplate } from '@/lib/schema-templates';

const TEMPLATE_ICONS: Record<string, React.ReactNode> = {
  software: <Cpu className="w-5 h-5" />,
  marketing: <BarChart3 className="w-5 h-5" />,
  operations: <Layers className="w-5 h-5" />,
  custom: <Paintbrush className="w-5 h-5" />,
};

interface OnboardingStep2Props {
  workspaceSlug: string;
  projectName: string;
  projectSlug: string;
  selectedTemplate: string;
  onProjectNameChange: (val: string) => void;
  onProjectSlugChange: (val: string) => void;
  onTemplateChange: (templateId: string) => void;
  onBack: () => void;
  onSubmit: () => void;
  loading: boolean;
  error: string;
}

export function OnboardingStep2({
  workspaceSlug,
  projectName,
  projectSlug,
  selectedTemplate,
  onProjectNameChange,
  onProjectSlugChange,
  onTemplateChange,
  onBack,
  onSubmit,
  loading,
  error,
}: OnboardingStep2Props) {
  return (
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
                onClick={() => onTemplateChange(t.id)}
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
            onChange={(e) => onProjectNameChange(e.target.value)}
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
              onChange={(e) => onProjectSlugChange(e.target.value)}
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
          onClick={onBack}
          className="px-4 py-3 rounded-xl border border-slate-800 text-slate-400 hover:text-white hover:border-slate-700 text-sm font-medium transition-colors flex items-center space-x-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back</span>
        </button>
        <button
          onClick={onSubmit}
          disabled={loading}
          className="flex-1 py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Zap className="w-4 h-4 animate-pulse" />
              <span>Creating Workspace…</span>
            </>
          ) : (
            <>
              <span>Create Workspace</span>
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </button>
      </div>
    </div>
  );
}
