'use client';

import React from 'react';
import { Cpu, Eye, Send, Code2, AlertTriangle } from 'lucide-react';
import { WorkItem } from '@/types/tracker';

export interface SparkViewContainerProps {
  isReadOnly: boolean;
  sparkOverrideProject: string;
  setSparkOverrideProject: (val: string) => void;
  sparkOverrideSprint: string;
  setSparkOverrideSprint: (val: string) => void;
  sparkOverrideAssignee: string;
  setSparkOverrideAssignee: (val: string) => void;
  allProjects: { id: string; slug: string; name: string }[];
  projectSlug: string;
  availableSprints: string[];
  projectSettings?: any;
  workspaceMembers: { full_name: string; email?: string }[];
  items: WorkItem[];
  sparkPayload: string;
  setSparkPayload: (val: string) => void;
  isIngesting: boolean;
  handleRunSparkIngest: () => Promise<void>;
  ingestResponse: any;
  ingestedAffectedItemCount: number;
  onOpenReconciliation: () => void;
}

export function SparkViewContainer(props: SparkViewContainerProps) {
  const {
    isReadOnly,
    sparkOverrideProject,
    setSparkOverrideProject,
    sparkOverrideSprint,
    setSparkOverrideSprint,
    sparkOverrideAssignee,
    setSparkOverrideAssignee,
    allProjects,
    projectSlug,
    availableSprints,
    projectSettings,
    workspaceMembers,
    items,
    sparkPayload,
    setSparkPayload,
    isIngesting,
    handleRunSparkIngest,
    ingestResponse,
    ingestedAffectedItemCount,
    onOpenReconciliation,
  } = props;

  // TRK-15: Exclude completed, closed, or locked sprints from override dropdown
  const selectableSprints = React.useMemo(() => {
    return availableSprints.filter((sprintName) => {
      const allSprints = [
        ...(Array.isArray(projectSettings?.sprint_settings?.sprints) ? projectSettings.sprint_settings.sprints : []),
        ...(Array.isArray(projectSettings?.sprint_settings?.managed_sprints) ? projectSettings.sprint_settings.managed_sprints : []),
      ];
      const match = allSprints.find(
        (s: any) =>
          s.name?.toLowerCase() === sprintName.toLowerCase() ||
          s.id === sprintName
      );
      if (match) {
        const st = (match.status || '').toLowerCase();
        return st !== 'completed' && st !== 'closed' && st !== 'locked';
      }
      return true;
    });
  }, [availableSprints, projectSettings?.sprint_settings?.sprints, projectSettings?.sprint_settings?.managed_sprints]);

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <Cpu className="w-5 h-5 text-emerald-400" />
            <h3 className="font-semibold text-white">Gemini Spark Ingestion Request</h3>
          </div>
          <span className="text-xs text-emerald-400 font-mono">POST /api/v1/items/ingest</span>
        </div>
        <p className="text-xs text-slate-400">
          Simulate payload sent from automated AI agents. Automatically resolves{' '}
          <code className="text-emerald-300">parent_ref_id</code> and performs upserts on{' '}
          <code className="text-emerald-300">external_ref_id</code>. Uses your tenant API key.
        </p>
        {isReadOnly && (
          <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20 text-xs text-amber-200/90 flex items-center space-x-2">
            <Eye className="w-4 h-4 text-amber-400 shrink-0" />
            <span>The public demo workspace is read-only. Ingesting work items requires workspace membership.</span>
          </div>
        )}
        {/* TRK-08: Property Overrides */}
        <div className="p-3 rounded-lg bg-slate-950/60 border border-slate-800/80 space-y-2.5" data-testid="spark-ingest-overrides">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400">
              Property Overrides (Optional)
            </span>
            {(sparkOverrideProject || sparkOverrideSprint || sparkOverrideAssignee) && (
              <button
                type="button"
                onClick={() => {
                  setSparkOverrideProject('');
                  setSparkOverrideSprint('');
                  setSparkOverrideAssignee('');
                }}
                className="text-[10px] text-slate-400 hover:text-emerald-400 transition-colors cursor-pointer"
                data-testid="spark-reset-overrides-btn"
              >
                Clear Overrides
              </button>
            )}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-slate-400">Target Project</label>
              <select
                value={sparkOverrideProject}
                disabled={isReadOnly}
                onChange={(e) => setSparkOverrideProject(e.target.value)}
                className="w-full text-xs bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50"
                data-testid="spark-override-project-select"
              >
                <option value="">Payload Project ({allProjects.find((p) => p.slug === projectSlug)?.name || projectSlug})</option>
                {allProjects.map((p) => (
                  <option key={p.id} value={p.slug}>
                    {p.name} ({p.slug})
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-slate-400">Sprint Override</label>
              <select
                value={sparkOverrideSprint}
                disabled={isReadOnly}
                onChange={(e) => setSparkOverrideSprint(e.target.value)}
                className="w-full text-xs bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50"
                data-testid="spark-override-sprint-select"
              >
                <option value="">Keep Payload Sprint</option>
                <option value="__none__">Backlog (Unassigned)</option>
                {selectableSprints.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-slate-400">Assignee Override</label>
              <select
                value={sparkOverrideAssignee}
                disabled={isReadOnly}
                onChange={(e) => setSparkOverrideAssignee(e.target.value)}
                className="w-full text-xs bg-slate-900 border border-slate-800 rounded-lg px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-emerald-500 cursor-pointer disabled:opacity-50"
                data-testid="spark-override-assignee-select"
              >
                <option value="">Keep Payload Assignee</option>
                <option value="__unassigned__">Unassigned</option>
                {Array.from(
                  new Set([
                    ...workspaceMembers.map((m) => m.full_name).filter(Boolean),
                    ...items.map((i) => i.assignee).filter((a): a is string => typeof a === 'string' && a.length > 0),
                  ])
                ).map((member) => (
                  <option key={member} value={member}>
                    {member}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <textarea
          rows={16}
          value={sparkPayload}
          readOnly={isReadOnly}
          onChange={(e) => !isReadOnly && setSparkPayload(e.target.value)}
          className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-300 focus:outline-none focus:border-emerald-500 leading-relaxed"
        />
        <button
          onClick={handleRunSparkIngest}
          disabled={isIngesting || isReadOnly}
          className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
        >
          <Send className="w-3.5 h-3.5" />
          <span>{isReadOnly ? 'Ingestion Disabled in Demo Mode' : isIngesting ? 'Ingesting via Headless API...' : 'Execute Ingestion'}</span>
        </button>
      </div>

      <div className="p-6 rounded-xl bg-slate-900/50 border border-slate-800/80 space-y-4">
        <div className="flex items-center space-x-2">
          <Code2 className="w-5 h-5 text-teal-400" />
          <h3 className="font-semibold text-white">Ingest API Response</h3>
        </div>
        <p className="text-xs text-slate-400">Live output from serverless endpoint execution:</p>

        {/* Ingestion Schema Deviations Feedback */}
        {ingestResponse?.success && ingestedAffectedItemCount > 0 && (
          <div
            className="p-3 rounded-lg bg-amber-950/40 border border-amber-500/40 text-xs text-amber-200 flex flex-wrap items-center justify-between gap-3 animate-in fade-in"
            data-testid="spark-ingest-deviation-banner"
          >
            <div className="flex items-center space-x-2">
              <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
              <span>
                <strong className="text-amber-100">Ingestion Warning:</strong> {ingestedAffectedItemCount} item{ingestedAffectedItemCount !== 1 ? 's contain' : ' contains'} schema deviations (unmapped levels or statuses).
              </span>
            </div>
            <button
              type="button"
              onClick={onOpenReconciliation}
              className="px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold transition-colors shrink-0 cursor-pointer"
            >
              Review &amp; Reconcile
            </button>
          </div>
        )}

        <div className="h-[380px] p-4 rounded-lg bg-slate-950 border border-slate-800 overflow-auto font-mono text-xs text-slate-300">
          {ingestResponse ? (
            <pre className="text-emerald-400 leading-relaxed">
              {JSON.stringify(ingestResponse, null, 2)}
            </pre>
          ) : (
            <div className="h-full flex items-center justify-center text-slate-600 text-xs">
              Ready to execute. Click &quot;Execute Ingestion&quot; on the left.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const IngestionDialog = SparkViewContainer;
