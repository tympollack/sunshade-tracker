'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  Sliders,
  ListTree,
  Code2,
  Sparkles,
  RotateCcw,
  Save,
  Check,
  AlertCircle,
  ChevronsLeftRight,
  X,
  Copy,
} from 'lucide-react';
import { ProjectSettings, WorkItem } from '@/types/tracker';
import { lintProjectSettings, SchemaLintError } from '@/lib/project-settings-schema';
import { ProjectSchemaEditor } from './ProjectSchemaEditor';
import { JsonTreeNode } from './JsonTreeNode';

export type SchemaViewMode = 'visual' | 'tree' | 'raw';

export interface ProjectSchemaViewProps {
  settings: ProjectSettings;
  projectId?: string | null;
  onSave: (updatedSettings: ProjectSettings) => Promise<void> | void;
  activeItems?: WorkItem[];
  isSaving?: boolean;
  readOnly?: boolean;
  initialMode?: SchemaViewMode;
  availableProjects?: Array<{ id: string; slug: string; name: string; settings?: ProjectSettings }>;
}

export function ProjectSchemaView({
  settings,
  projectId,
  onSave,
  activeItems = [],
  isSaving = false,
  readOnly = false,
  initialMode = 'visual',
  availableProjects = [],
}: ProjectSchemaViewProps) {
  // Unified in-memory draft state
  const [draftData, setDraftData] = useState<ProjectSettings>(settings);
  const [mode, setMode] = useState<SchemaViewMode>(initialMode);
  const [rawText, setRawText] = useState(() => JSON.stringify(settings, null, 2));
  const [rawError, setRawError] = useState<string | null>(null);
  const [syntaxToast, setSyntaxToast] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [collapseLevel, setCollapseLevel] = useState<number>(3);
  const [fetchedProjects, setFetchedProjects] = useState<Array<{ id: string; slug: string; name: string; settings?: ProjectSettings }>>([]);

  useEffect(() => {
    if (availableProjects && availableProjects.length > 0) return;
    let isCancelled = false;
    fetch('/api/v1/projects')
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!isCancelled && data?.projects) {
          setFetchedProjects(data.projects);
        }
      })
      .catch(() => {});
    return () => {
      isCancelled = true;
    };
  }, [availableProjects]);

  const allCandidateProjects = availableProjects && availableProjects.length > 0 ? availableProjects : fetchedProjects;
  const availableSiblingProjects = useMemo(() => {
    return allCandidateProjects.filter((p) => p.slug !== projectId && p.id !== projectId);
  }, [allCandidateProjects, projectId]);

  const handleCopySchemaFromProject = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const targetKey = e.target.value;
    if (!targetKey) return;
    const targetProj = availableSiblingProjects.find((p) => p.slug === targetKey || p.id === targetKey);
    if (!targetProj) return;

    const confirmed = window.confirm(
      `Warning: Copying schema from "${targetProj.name}" will replace unsaved schema edits in this editor with its statuses, hierarchy levels, and custom fields.\n\nDo you want to proceed?`
    );
    if (!confirmed) {
      e.target.value = '';
      return;
    }

    try {
      let sourceSettings = targetProj.settings;
      if (!sourceSettings || !sourceSettings.statuses || !sourceSettings.hierarchy) {
        const res = await fetch(`/api/v1/projects/${targetProj.id || targetProj.slug}/settings`);
        if (res.ok) {
          const data = await res.json();
          sourceSettings = data.settings || data;
        }
      }

      if (sourceSettings) {
        const updatedDraft: ProjectSettings = {
          ...draftData,
          statuses: sourceSettings.statuses || draftData.statuses,
          hierarchy: sourceSettings.hierarchy || draftData.hierarchy,
          custom_fields: sourceSettings.custom_fields || draftData.custom_fields,
          custom_metadata_fields: sourceSettings.custom_metadata_fields || draftData.custom_metadata_fields,
          work_metric_config: sourceSettings.work_metric_config || draftData.work_metric_config,
        };
        setDraftData(updatedDraft);
        setRawText(JSON.stringify(updatedDraft, null, 2));
        setRawError(null);
        setSyntaxToast(null);
        setSaveError(null);
      }
    } catch (err: any) {
      setSaveError(err.message || 'Failed to fetch source project settings.');
    } finally {
      e.target.value = '';
    }
  };

  const savedBaselineJsonRef = useRef(JSON.stringify(settings, null, 2));
  const lastObservedPropSettingsRef = useRef(JSON.stringify(settings, null, 2));
  const prevProjectIdRef = useRef(projectId);

  // Sync external settings changes when prop updates
  useEffect(() => {
    const currentPropFormatted = JSON.stringify(settings, null, 2);
    const projectChanged = projectId !== undefined && prevProjectIdRef.current !== projectId;
    prevProjectIdRef.current = projectId;

    if (projectChanged) {
      setDraftData(settings);
      setRawText(currentPropFormatted);
      savedBaselineJsonRef.current = currentPropFormatted;
      lastObservedPropSettingsRef.current = currentPropFormatted;
      setRawError(null);
      setSyntaxToast(null);
      setSaveError(null);
      return;
    }

    const propActuallyChanged = currentPropFormatted !== lastObservedPropSettingsRef.current;
    if (!propActuallyChanged) {
      return;
    }
    lastObservedPropSettingsRef.current = currentPropFormatted;

    // Determine if the current draft has unsaved changes compared to saved baseline
    const isDirty =
      mode === 'raw'
        ? rawText !== savedBaselineJsonRef.current
        : JSON.stringify(draftData, null, 2) !== savedBaselineJsonRef.current;

    // Only update draft state if the draft is clean (not dirty)
    if (!isDirty) {
      setDraftData(settings);
      setRawText(currentPropFormatted);
      savedBaselineJsonRef.current = currentPropFormatted;
      setRawError(null);
      setSyntaxToast(null);
      setSaveError(null);
    }
  }, [settings, projectId, mode, rawText, draftData]);

  // Handle switching view mode with locked transition if JSON syntax is invalid
  const handleSwitchMode = (targetMode: SchemaViewMode) => {
    if (targetMode === mode) return;

    if (mode === 'raw') {
      try {
        const parsed = JSON.parse(rawText);
        setDraftData(parsed);
        setRawError(null);
        setSyntaxToast(null);
        setMode(targetMode);
      } catch (err: any) {
        const msg = err.message || 'Invalid JSON syntax';
        setRawError(msg);
        setSyntaxToast(`Cannot switch view: ${msg}. Fix JSON syntax errors before switching.`);
        // Locked: stay in raw mode
        return;
      }
    } else {
      // Switching from visual or tree to another mode
      if (targetMode === 'raw') {
        setRawText(JSON.stringify(draftData, null, 2));
        setRawError(null);
        setSyntaxToast(null);
      }
      setMode(targetMode);
    }
  };

  // Prettify / Format JSON across modes
  const handleFormat = () => {
    try {
      if (mode === 'raw') {
        const parsed = JSON.parse(rawText);
        const formatted = JSON.stringify(parsed, null, 2);
        setRawText(formatted);
        setDraftData(parsed);
        setRawError(null);
        setSyntaxToast(null);
      } else {
        const formatted = JSON.stringify(draftData, null, 2);
        setRawText(formatted);
      }
    } catch (err: any) {
      setRawError(err.message || 'Invalid JSON syntax');
    }
  };

  // Update a nested path in tree view
  const handleUpdateTreeValue = (path: (string | number)[], newValue: any) => {
    setDraftData((prev) => {
      const clone = JSON.parse(JSON.stringify(prev));
      let current: any = clone;
      for (let i = 0; i < path.length - 1; i++) {
        current = current[path[i]];
      }
      current[path[path.length - 1]] = newValue;
      setRawText(JSON.stringify(clone, null, 2));
      return clone;
    });
  };

  // Handle visual form modifications
  const handleFormChange = (updated: ProjectSettings) => {
    setDraftData(updated);
    setRawText(JSON.stringify(updated, null, 2));
    setRawError(null);
    setSyntaxToast(null);
  };

  // Reset draft to initial prop settings
  const handleReset = () => {
    const formatted = JSON.stringify(settings, null, 2);
    setDraftData(settings);
    setRawText(formatted);
    savedBaselineJsonRef.current = formatted;
    lastObservedPropSettingsRef.current = formatted;
    setRawError(null);
    setSyntaxToast(null);
  };

  // Memoized syntax parse & lint evaluation
  const { currentParsed, syntaxError } = useMemo(() => {
    if (mode === 'raw') {
      try {
        const parsed = JSON.parse(rawText);
        return { currentParsed: parsed, syntaxError: null };
      } catch (err: any) {
        return { currentParsed: null, syntaxError: err.message || 'Invalid JSON syntax' };
      }
    }
    return { currentParsed: draftData, syntaxError: null };
  }, [mode, rawText, draftData]);

  const lintErrors = useMemo<SchemaLintError[]>(() => {
    if (mode === 'raw' && syntaxError) {
      return [];
    }
    const target = mode === 'raw' ? currentParsed : draftData;
    return lintProjectSettings(target).errors;
  }, [mode, syntaxError, currentParsed, draftData]);

  // Save schema handler
  const handleSave = async () => {
    let payloadToSave = draftData;
    if (mode === 'raw') {
      try {
        payloadToSave = JSON.parse(rawText);
        setDraftData(payloadToSave);
        setRawError(null);
        setSyntaxToast(null);
      } catch (err: any) {
        setSaveSuccess(false);
        const msg = err.message || 'Invalid JSON syntax';
        setRawError(msg);
        setSyntaxToast(`Cannot save schema: ${msg}. Fix syntax errors before saving.`);
        return;
      }
    } else {
      setRawError(null);
      setSyntaxToast(null);
    }

    const validation = lintProjectSettings(payloadToSave);
    if (!validation.valid) {
      setSaveSuccess(false);
      const firstErr = validation.errors[0];
      const msg = `Cannot save schema: ${firstErr.path}: ${firstErr.message}`;
      setSaveError(msg);
      return;
    }

    try {
      await onSave(payloadToSave);
      const savedFormatted = JSON.stringify(payloadToSave, null, 2);
      savedBaselineJsonRef.current = savedFormatted;
      setSaveSuccess(true);
      setSaveError(null);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveSuccess(false);
      const msg = err.message || 'Failed to save schema settings.';
      setSaveError(msg);
      setRawError(msg);
    }
  };

  const isRawInvalid = mode === 'raw' && (rawError !== null || syntaxError !== null);
  const isSaveDisabled = isSaving || isRawInvalid || lintErrors.length > 0;

  return (
    <div className="rounded-xl bg-slate-950 border border-slate-800 flex flex-col shadow-2xl overflow-hidden">
      {/* Pinned Toolbar Header */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/70 flex flex-wrap items-center justify-between gap-3 sticky top-0 z-20 backdrop-blur">
        <div className="flex items-center flex-wrap gap-2">
          {/* 3-way Segmented Pill Switcher */}
          <div
            role="tablist"
            aria-label="Schema View Mode Switcher"
            className="flex items-center bg-slate-950 border border-slate-800 p-0.5 rounded-lg text-xs"
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'visual'}
              onClick={() => handleSwitchMode('visual')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                mode === 'visual'
                  ? 'bg-emerald-500 text-slate-950 font-semibold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              <span>Visual Form</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={mode === 'tree'}
              onClick={() => handleSwitchMode('tree')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                mode === 'tree'
                  ? 'bg-emerald-500 text-slate-950 font-semibold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <ListTree className="w-3.5 h-3.5" />
              <span>Interactive Tree</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={mode === 'raw'}
              onClick={() => handleSwitchMode('raw')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-all ${
                mode === 'raw'
                  ? 'bg-emerald-500 text-slate-950 font-semibold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Raw JSON</span>
            </button>
          </div>

          {/* Mode-specific actions */}
          {mode === 'tree' && (
            <button
              type="button"
              onClick={() => setCollapseLevel((prev) => (prev > 1 ? 1 : 5))}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs flex items-center space-x-1 transition-colors"
              title="Toggle expand/collapse all"
            >
              <ChevronsLeftRight className="w-3.5 h-3.5 text-slate-400" />
              <span>{collapseLevel > 1 ? 'Collapse All' : 'Expand All'}</span>
            </button>
          )}
        </div>

        {/* Pinned Action Buttons: [ Copy Schema From... ], [ Format ], [ Reset ], [ Save Schema ] */}
        <div className="flex items-center space-x-2">
          {/* Sibling Projects Dropdown: Copy Schema From... */}
          {availableSiblingProjects.length > 0 && !readOnly && (
            <div className="relative inline-flex items-center">
              <select
                value=""
                onChange={handleCopySchemaFromProject}
                disabled={isSaving}
                aria-label="Copy Schema From Project"
                data-testid="copy-schema-from-project-select"
                className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-medium focus:outline-none focus:border-emerald-500 cursor-pointer transition-colors disabled:opacity-50"
              >
                <option value="" disabled>
                  Copy Schema From...
                </option>
                {availableSiblingProjects.map((p) => (
                  <option key={p.id || p.slug} value={p.slug || p.id}>
                    {p.name} ({p.slug})
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Format button pinned across modes */}
          <button
            type="button"
            onClick={handleFormat}
            disabled={readOnly}
            className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs flex items-center space-x-1 transition-colors disabled:opacity-50"
            title="Prettify / Format JSON representation"
          >
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Format</span>
          </button>

          {readOnly ? (
            <span className="text-xs px-2.5 py-1 rounded bg-slate-800 text-slate-400 border border-slate-700 font-medium">
              Read-Only
            </span>
          ) : (
            <>
              {saveSuccess && (
                <span className="text-xs text-emerald-400 flex items-center space-x-1 font-medium animate-in fade-in">
                  <Check className="w-3.5 h-3.5" />
                  <span>Saved successfully!</span>
                </span>
              )}

              <button
                type="button"
                onClick={handleReset}
                disabled={isSaving}
                className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 text-xs flex items-center space-x-1.5 transition-colors disabled:opacity-50"
                title="Reset uncommitted changes"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset</span>
              </button>

              <button
                type="button"
                onClick={handleSave}
                disabled={isSaveDisabled}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Schema'}</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* High-Contrast Schema Validation Banner */}
      {lintErrors.length > 0 && (
        <div
          role="alert"
          data-testid="schema-validation-banner"
          className="px-4 py-3 bg-red-950/95 border-b border-red-700 text-xs text-red-200 shadow-lg animate-in slide-in-from-top-1"
        >
          <div className="flex items-start space-x-2.5">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1.5 flex-1">
              <div className="font-semibold text-red-100 flex items-center justify-between">
                <span>Schema Validation Errors ({lintErrors.length})</span>
                <span className="text-[10px] font-mono uppercase tracking-wider text-red-300/80 bg-red-900/50 px-2 py-0.5 rounded border border-red-700/50">
                  Fix errors to save schema
                </span>
              </div>
              <ul className="space-y-1 font-mono text-[11px] max-h-36 overflow-y-auto pr-1">
                {lintErrors.map((err, idx) => (
                  <li key={idx} className="flex items-start space-x-1.5 text-red-300">
                    <span className="text-red-400 select-none">•</span>
                    <span className="font-bold text-red-200">{err.path}:</span>
                    <span>{err.message}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      )}

      {/* Save Error Banner (Visible in all view modes) */}
      {saveError && (
        <div className="px-4 py-2.5 bg-red-950/90 border-b border-red-800/80 flex items-center justify-between text-xs text-red-200 animate-in slide-in-from-top-1">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="font-mono">{saveError}</span>
          </div>
          <button
            type="button"
            aria-label="Dismiss save error"
            onClick={() => setSaveError(null)}
            className="text-red-400 hover:text-white p-0.5 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Syntax Error Toast / Banner */}
      {syntaxToast && (
        <div className="px-4 py-2.5 bg-red-950/90 border-b border-red-800/80 flex items-center justify-between text-xs text-red-200 animate-in slide-in-from-top-1">
          <div className="flex items-center space-x-2">
            <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
            <span className="font-mono">{syntaxToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setSyntaxToast(null)}
            className="text-red-400 hover:text-white p-0.5 rounded"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Raw Error Banner (when in raw mode) */}
      {mode === 'raw' && rawError && !syntaxToast && !saveError && (
        <div className="px-4 py-2 bg-red-950/70 border-b border-red-800/50 flex items-center space-x-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="font-mono">{rawError}</span>
        </div>
      )}

      {/* Content Area */}
      <div className="p-5 overflow-auto max-h-[750px]">
        {mode === 'visual' && (
          <ProjectSchemaEditor
            settings={draftData}
            onChange={handleFormChange}
            activeItems={activeItems}
            readOnly={readOnly}
            hideValidationBanner={true}
          />
        )}

        {mode === 'tree' && (
          <div className="font-mono text-xs leading-relaxed bg-slate-950 p-3 rounded-lg border border-slate-900">
            <JsonTreeNode
              name="schema"
              value={draftData}
              path={[]}
              depth={0}
              collapseLevel={collapseLevel}
              onUpdateValue={handleUpdateTreeValue}
              readOnly={readOnly}
            />
          </div>
        )}

        {mode === 'raw' && (
          <textarea
            value={rawText}
            readOnly={readOnly}
            onChange={(e) => {
              if (readOnly) return;
              const val = e.target.value;
              setRawText(val);
              try {
                const parsed = JSON.parse(val);
                setDraftData(parsed);
                setRawError(null);
                setSyntaxToast(null);
              } catch (err: any) {
                setRawError(err.message || 'Syntax error in JSON');
              }
            }}
            rows={24}
            className="w-full p-4 rounded-lg bg-slate-950 font-mono text-xs text-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 resize-y leading-relaxed border border-slate-900"
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}
