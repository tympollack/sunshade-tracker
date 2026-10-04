'use client';

import React, { useState, useEffect, useRef } from 'react';
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
} from 'lucide-react';
import { ProjectSettings, WorkItem } from '@/types/tracker';
import { ProjectSchemaEditor } from './ProjectSchemaEditor';
import { JsonTreeNode } from './JsonTreeNode';

export type SchemaViewMode = 'visual' | 'tree' | 'raw';

export interface ProjectSchemaViewProps {
  settings: ProjectSettings;
  onSave: (updatedSettings: ProjectSettings) => Promise<void> | void;
  activeItems?: WorkItem[];
  isSaving?: boolean;
  readOnly?: boolean;
  initialMode?: SchemaViewMode;
}

export function ProjectSchemaView({
  settings,
  onSave,
  activeItems = [],
  isSaving = false,
  readOnly = false,
  initialMode = 'visual',
}: ProjectSchemaViewProps) {
  // Unified in-memory draft state
  const [draftData, setDraftData] = useState<ProjectSettings>(settings);
  const [mode, setMode] = useState<SchemaViewMode>(initialMode);
  const [rawText, setRawText] = useState(() => JSON.stringify(settings, null, 2));
  const [rawError, setRawError] = useState<string | null>(null);
  const [syntaxToast, setSyntaxToast] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [collapseLevel, setCollapseLevel] = useState<number>(3);

  // Sync external settings changes when prop updates
  useEffect(() => {
    setDraftData(settings);
    setRawText(JSON.stringify(settings, null, 2));
    setRawError(null);
    setSyntaxToast(null);
  }, [settings]);

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
    setDraftData(settings);
    setRawText(JSON.stringify(settings, null, 2));
    setRawError(null);
    setSyntaxToast(null);
  };

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

    try {
      await onSave(payloadToSave);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err: any) {
      setSaveSuccess(false);
      setRawError(err.message || 'Failed to save schema settings.');
    }
  };

  const isRawInvalid = mode === 'raw' && rawError !== null;

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

        {/* Pinned Action Buttons: [ Format ], [ Reset ], [ Save Schema ] */}
        <div className="flex items-center space-x-2">
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
                disabled={isSaving || isRawInvalid}
                className="px-4 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-semibold flex items-center space-x-1.5 transition-all shadow-lg shadow-emerald-500/20 disabled:opacity-50"
              >
                <Save className="w-3.5 h-3.5" />
                <span>{isSaving ? 'Saving...' : 'Save Schema'}</span>
              </button>
            </>
          )}
        </div>
      </div>

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
      {mode === 'raw' && rawError && !syntaxToast && (
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
