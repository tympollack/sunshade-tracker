'use client';

import React, { useRef, useState, useMemo, useEffect } from 'react';
import {
  Cpu,
  Eye,
  Send,
  Code2,
  AlertTriangle,
  AlertCircle,
  Wand2,
  FileText,
  CheckCircle2,
  X,
  ArrowRight,
} from 'lucide-react';
import { WorkItem } from '@/types/tracker';
import {
  sanitizeJsonString,
  parseResilientJson,
  extractErrorDiagnostics,
  buildRawCardPayload,
  IngestErrorDiagnostics,
} from '@/lib/jsonSanitizer';

export interface IngestionDialogProps {
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
  handleRunSparkIngest: (parsedPayload?: any) => Promise<void>;
  ingestResponse: any;
  setIngestResponse?: (val: any) => void;
  ingestedAffectedItemCount: number;
  onOpenReconciliation: () => void;
  onRefresh?: () => void;
}

export function IngestionDialog(props: IngestionDialogProps) {
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
    setIngestResponse,
    ingestedAffectedItemCount,
    onOpenReconciliation,
    onRefresh,
  } = props;

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Error diagnostics & notifications
  const [syntaxDiagnostics, setSyntaxDiagnostics] = useState<IngestErrorDiagnostics | null>(null);
  const [toast, setToast] = useState<{
    message: string;
    type: 'success' | 'info' | 'warning' | 'error';
  } | null>(null);
  const [isIngestingRaw, setIsIngestingRaw] = useState(false);

  // Auto-dismiss toasts after 5 seconds
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(null), 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // When ingestResponse arrives from server with an error, check if it's a syntax / parse error
  useEffect(() => {
    if (ingestResponse?.error && typeof ingestResponse.error === 'string') {
      const msg = ingestResponse.error;
      if (
        msg.includes('JSON') ||
        msg.includes('position') ||
        msg.includes('line') ||
        msg.includes('escape') ||
        msg.includes('SyntaxError')
      ) {
        setSyntaxDiagnostics(extractErrorDiagnostics(msg, sparkPayload));
      }
    } else if (ingestResponse?.success) {
      setSyntaxDiagnostics(null);
    }
  }, [ingestResponse, sparkPayload]);

  // TRK-15: Exclude completed, closed, or locked sprints from override dropdown
  const selectableSprints = useMemo(() => {
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

  // Handle manual "Auto-Fix Escapes" button click
  const handleAutoFixEscapes = () => {
    if (isReadOnly) return;
    const sanitized = sanitizeJsonString(sparkPayload);
    if (sanitized !== sparkPayload) {
      setSparkPayload(sanitized);
      setToast({ message: 'Auto-corrected unescaped characters', type: 'success' });
      setSyntaxDiagnostics(null);
    } else {
      setToast({ message: 'No unescaped characters detected', type: 'info' });
    }
  };

  // Jump cursor directly to offending character
  const handleJumpToIssue = () => {
    if (!textareaRef.current || !syntaxDiagnostics) return;
    const pos = syntaxDiagnostics.position;
    textareaRef.current.focus();
    textareaRef.current.setSelectionRange(pos, pos + 1);

    // Scroll into viewport
    const approxLineHeight = 18;
    textareaRef.current.scrollTop = Math.max(0, (syntaxDiagnostics.line - 3) * approxLineHeight);
  };

  // Pre-flight execution handler with resilient fallback tiers
  const handleExecute = async () => {
    if (isReadOnly || isIngesting || isIngestingRaw) return;
    setSyntaxDiagnostics(null);
    setToast(null);

    // Multi-tier resilient parsing
    const parseResult = parseResilientJson(sparkPayload);

    if (!parseResult.success) {
      // All JSON / JSON5 parsing tiers failed
      const diag = parseResult.diagnostics || extractErrorDiagnostics(parseResult.error, sparkPayload);
      setSyntaxDiagnostics(diag);
      if (setIngestResponse) {
        setIngestResponse({ error: parseResult.error || 'Failed to parse JSON payload' });
      }
      return;
    }

    // Success via fallback tiers
    if (parseResult.method === 'sanitized') {
      setToast({ message: 'Auto-corrected unescaped characters', type: 'success' });
      if (parseResult.sanitizedText) {
        setSparkPayload(parseResult.sanitizedText);
      }
    } else if (parseResult.method === 'json5') {
      setToast({ message: 'Parsed using JSON5 relaxed mode', type: 'info' });
    } else if (parseResult.method === 'json5_sanitized') {
      setToast({ message: 'Auto-corrected unescaped characters (JSON5 relaxed mode)', type: 'success' });
      if (parseResult.sanitizedText) {
        setSparkPayload(parseResult.sanitizedText);
      }
    }

    // Dispatch to parent handler with resolved parsed data
    await handleRunSparkIngest(parseResult.data);
  };

  // 'Ingest as Raw Card' fallback mode
  const handleIngestAsRawCard = async () => {
    if (isReadOnly || isIngesting || isIngestingRaw) return;
    setIsIngestingRaw(true);
    setToast(null);

    try {
      const payload = buildRawCardPayload(sparkPayload, projectSlug, {
        overrideProject: sparkOverrideProject || undefined,
        overrideSprint: sparkOverrideSprint || undefined,
        overrideAssignee: sparkOverrideAssignee || undefined,
      });

      const res = await fetch('/api/v1/items/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (setIngestResponse) {
        setIngestResponse(data);
      }

      if (data.success) {
        setToast({
          message: 'Pasted notes saved as a raw backlog item for manual triage.',
          type: 'success',
        });
        setSyntaxDiagnostics(null);
        if (onRefresh) onRefresh();
      } else {
        setToast({
          message: data.error || 'Failed to ingest raw card',
          type: 'error',
        });
      }
    } catch (err: any) {
      setToast({
        message: err.message || 'Failed to dispatch raw card',
        type: 'error',
      });
      if (setIngestResponse) {
        setIngestResponse({ error: err.message || 'Failed to ingest raw card' });
      }
    } finally {
      setIsIngestingRaw(false);
    }
  };

  return (
    <div className="grid md:grid-cols-2 gap-6" data-testid="ingestion-dialog">
      {/* Left Pane: Ingestion Editor */}
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

        {/* Editor Toolbar with Auto-Fix Escapes button */}
        <div className="flex items-center justify-between pt-1">
          <span className="text-[11px] font-medium text-slate-400">JSON Payload / Unstructured Notes</span>
          <button
            type="button"
            onClick={handleAutoFixEscapes}
            disabled={isReadOnly}
            className="px-2.5 py-1 text-xs font-medium rounded-md bg-slate-800 hover:bg-slate-700 text-emerald-300 hover:text-emerald-200 border border-slate-700 flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
            data-testid="auto-fix-escapes-btn"
            title="Normalize unescaped backslashes and smart quotes in payload"
          >
            <Wand2 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Auto-Fix Escapes</span>
          </button>
        </div>

        {/* Toast Notification Bar */}
        {toast && (
          <div
            className={`p-2.5 rounded-lg border text-xs flex items-center justify-between transition-all animate-in fade-in ${
              toast.type === 'success'
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-200'
                : toast.type === 'info'
                ? 'bg-cyan-950/60 border-cyan-500/40 text-cyan-200'
                : toast.type === 'warning'
                ? 'bg-amber-950/60 border-amber-500/40 text-amber-200'
                : 'bg-red-950/60 border-red-500/40 text-red-200'
            }`}
            data-testid="ingest-toast"
          >
            <div className="flex items-center space-x-2">
              {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
              {toast.type === 'info' && <Cpu className="w-4 h-4 text-cyan-400 shrink-0" />}
              {toast.type === 'warning' && <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />}
              {toast.type === 'error' && <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />}
              <span>{toast.message}</span>
            </div>
            <button
              type="button"
              onClick={() => setToast(null)}
              className="text-slate-400 hover:text-white p-0.5 rounded cursor-pointer"
              aria-label="Dismiss toast"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        )}

        {/* Visual Diagnostic Banner */}
        {syntaxDiagnostics && (
          <div
            className="p-3 rounded-lg bg-red-950/50 border border-red-500/50 space-y-2 animate-in fade-in"
            data-testid="syntax-error-banner"
          >
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center space-x-2">
                <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                <span
                  className="px-2 py-0.5 rounded bg-red-900/60 border border-red-700/60 text-red-200 font-mono text-xs font-semibold"
                  data-testid="syntax-error-pill"
                >
                  Syntax Error at Line {syntaxDiagnostics.line}, Col {syntaxDiagnostics.column}
                </span>
              </div>
              <button
                type="button"
                onClick={handleJumpToIssue}
                className="px-2.5 py-1 rounded bg-red-800/80 hover:bg-red-700 text-white font-medium text-xs flex items-center space-x-1 transition-colors cursor-pointer"
                data-testid="jump-to-issue-btn"
              >
                <span>Jump to Issue</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            {/* Contextual Code Snippet */}
            {syntaxDiagnostics.snippet && (
              <pre
                className="font-mono text-[11px] p-2.5 rounded bg-slate-950/80 border border-red-900/40 text-red-200 overflow-x-auto whitespace-pre leading-relaxed"
                data-testid="syntax-error-snippet"
              >
                {syntaxDiagnostics.snippet}
              </pre>
            )}

            {/* Accept Raw / Ingest As-Is Action Banner */}
            <div className="pt-1 flex items-center justify-between border-t border-red-900/40">
              <span className="text-[11px] text-slate-400">Unstructured text or unparsable JSON?</span>
              <button
                type="button"
                onClick={handleIngestAsRawCard}
                disabled={isReadOnly || isIngestingRaw}
                className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold text-xs flex items-center space-x-1.5 transition-colors cursor-pointer disabled:opacity-50"
                data-testid="ingest-raw-card-btn"
              >
                <FileText className="w-3.5 h-3.5" />
                <span>{isIngestingRaw ? 'Creating Raw Backlog Card...' : 'Ingest as Raw Card'}</span>
              </button>
            </div>
          </div>
        )}

        <textarea
          ref={textareaRef}
          rows={16}
          value={sparkPayload}
          readOnly={isReadOnly}
          onChange={(e) => {
            if (!isReadOnly) {
              setSparkPayload(e.target.value);
              if (syntaxDiagnostics) {
                setSyntaxDiagnostics(null);
              }
            }
          }}
          className="w-full p-3 rounded-lg bg-slate-950 border border-slate-800 font-mono text-xs text-emerald-300 focus:outline-none focus:border-emerald-500 leading-relaxed"
          data-testid="spark-payload-textarea"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <button
            onClick={handleExecute}
            disabled={isIngesting || isIngestingRaw || isReadOnly}
            className="w-full py-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs flex items-center justify-center space-x-2 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
            data-testid="execute-ingestion-btn"
          >
            <Send className="w-3.5 h-3.5" />
            <span>{isReadOnly ? 'Ingestion Disabled in Demo Mode' : isIngesting ? 'Ingesting via Headless API...' : 'Execute Ingestion'}</span>
          </button>

          <button
            type="button"
            onClick={handleIngestAsRawCard}
            disabled={isIngesting || isIngestingRaw || isReadOnly}
            className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 hover:text-amber-200 border border-slate-700 font-medium text-xs flex items-center justify-center space-x-2 transition-colors disabled:opacity-50"
            data-testid="ingest-as-is-fallback-btn"
          >
            <FileText className="w-3.5 h-3.5 text-amber-400" />
            <span>{isIngestingRaw ? 'Ingesting Raw...' : 'Ingest As-Is (Raw Card)'}</span>
          </button>
        </div>
      </div>

      {/* Right Pane: Ingest API Response */}
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
            <pre
              className={`leading-relaxed ${ingestResponse.error ? 'text-red-400' : 'text-emerald-400'}`}
              data-testid="ingest-response-pre"
            >
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
