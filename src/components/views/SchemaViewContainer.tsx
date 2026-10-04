'use client';

import React from 'react';
import { Eye, AlertTriangle, Archive } from 'lucide-react';
import { ProjectSettings, WorkItem } from '@/types/tracker';
import { ProjectSchemaView } from '@/components/schema/ProjectSchemaView';

export interface SchemaViewContainerProps {
  isReadOnly: boolean;
  isAllProjects: boolean;
  allProjects: { id: string; slug: string; name: string }[];
  selectedSchemaProjectSlug: string | null;
  setSelectedSchemaProjectSlug: (slug: string) => void;
  activeSchemaSettings: ProjectSettings;
  handleSaveSchema: (newSettings: ProjectSettings) => Promise<void>;
  isSavingSchema: boolean;
  setIsArchiveModalOpen: (open: boolean) => void;
  activeItems?: WorkItem[];
}

export function SchemaViewContainer(props: SchemaViewContainerProps) {
  const {
    isReadOnly,
    isAllProjects,
    allProjects,
    selectedSchemaProjectSlug,
    setSelectedSchemaProjectSlug,
    activeSchemaSettings,
    handleSaveSchema,
    isSavingSchema,
    setIsArchiveModalOpen,
    activeItems = [],
  } = props;

  return (
    <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-6">
      <div>
        <h3 className="text-lg font-semibold text-white">Dynamic Project Schema &amp; Governance</h3>
        <p className="text-xs text-slate-400">
          Stored in <code className="text-emerald-300">tracker.projects.settings</code>. Defines
          hierarchy levels, allowed work item types, sprint governance invariants, and status lifecycle buckets.
        </p>
      </div>

      {isReadOnly && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 flex items-center space-x-2">
          <Eye className="w-4 h-4 text-amber-400 shrink-0" />
          <span>You are viewing this project schema in read-only mode. Workspace schema modifications require member or owner privileges.</span>
        </div>
      )}

      {isAllProjects && allProjects.length > 0 && (
        <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex flex-wrap items-center justify-between gap-3">
          <div>
            <span className="text-xs font-semibold text-white">Configuring Schema for Project:</span>
            <p className="text-[11px] text-slate-400">
              In workspace overview, select which project schema to inspect or modify.
            </p>
          </div>
          <select
            value={selectedSchemaProjectSlug || allProjects[0]?.slug}
            onChange={(e) => setSelectedSchemaProjectSlug(e.target.value)}
            className="px-3 py-1.5 text-xs bg-slate-900 border border-slate-700 rounded-lg text-emerald-300 font-medium focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            {allProjects.map((p) => (
              <option key={p.id} value={p.slug}>
                {p.name} ({p.slug})
              </option>
            ))}
          </select>
        </div>
      )}

      {/* Main Schema Editor View with 3-way Switcher */}
      <ProjectSchemaView
        settings={activeSchemaSettings}
        onSave={handleSaveSchema}
        activeItems={activeItems}
        isSaving={isSavingSchema}
        readOnly={isReadOnly}
      />

      {/* Danger Zone: Archive Project */}
      {!isAllProjects && !isReadOnly && (
        <div className="p-5 rounded-xl bg-red-950/20 border border-red-900/40 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h4 className="text-sm font-bold text-red-300 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-red-400" />
                <span>Danger Zone: Archive Project</span>
              </h4>
              <p className="text-xs text-slate-400 mt-1 max-w-xl">
                Archiving this project removes it from active project switchers, overview boards, and searches. All work items in this project are safely soft-deleted and preserved. You can restore this project at any time from Workspace Settings.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setIsArchiveModalOpen(true)}
              className="px-4 py-2 rounded-lg bg-red-600/20 hover:bg-red-600/30 border border-red-500/40 text-red-300 hover:text-red-200 text-xs font-semibold flex items-center space-x-1.5 transition-colors self-start sm:self-center shrink-0"
            >
              <Archive className="w-3.5 h-3.5" />
              <span>Archive Project…</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
