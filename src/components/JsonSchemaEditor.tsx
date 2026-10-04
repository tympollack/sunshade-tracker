'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ChevronRight,
  ChevronDown,
  Save,
  RotateCcw,
  Code2,
  ListTree,
  Check,
  AlertCircle,
  ChevronsLeftRight,
  Sparkles,
} from 'lucide-react';
import { ProjectSettings } from '@/types/tracker';
import { JsonTreeNode } from '@/components/schema/JsonTreeNode';

interface JsonSchemaEditorProps {
  settings: ProjectSettings;
  onSave: (updatedSettings: ProjectSettings) => Promise<void> | void;
  isSaving?: boolean;
  readOnly?: boolean;
}

const HEX_COLOR_REGEX = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

export function JsonSchemaEditor({
  settings,
  onSave,
  isSaving = false,
  readOnly = false,
}: JsonSchemaEditorProps) {
  // Local state for schema object
  const [data, setData] = useState<ProjectSettings>(settings);
  const [mode, setMode] = useState<'tree' | 'raw'>('tree');
  const [rawText, setRawText] = useState(() => JSON.stringify(settings, null, 2));
  const [rawError, setRawError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [collapseLevel, setCollapseLevel] = useState<number>(3);

  // Sync external settings when changed
  useEffect(() => {
    setData(settings);
    setRawText(JSON.stringify(settings, null, 2));
    setRawError(null);
  }, [settings]);

  // Handle switching to raw
  const handleSwitchToRaw = () => {
    setRawText(JSON.stringify(data, null, 2));
    setRawError(null);
    setMode('raw');
  };

  // Handle switching to tree
  const handleSwitchToTree = () => {
    try {
      const parsed = JSON.parse(rawText);
      setData(parsed);
      setRawError(null);
      setMode('tree');
    } catch (err: any) {
      setRawError(err.message || 'Invalid JSON syntax');
    }
  };

  // Prettify raw JSON
  const handleFormatRaw = () => {
    try {
      const parsed = JSON.parse(rawText);
      setRawText(JSON.stringify(parsed, null, 2));
      setData(parsed);
      setRawError(null);
    } catch (err: any) {
      setRawError(err.message || 'Invalid JSON syntax');
    }
  };

  // Update a nested path in data
  const handleUpdateValue = (path: (string | number)[], newValue: any) => {
    setData((prev) => {
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

  // Handle save
  const handleSave = async () => {
    let payloadToSave = data;
    if (mode === 'raw') {
      try {
        payloadToSave = JSON.parse(rawText);
        setData(payloadToSave);
        setRawError(null);
      } catch (err: any) {
        setSaveSuccess(false);
        setRawError(err.message || 'Invalid JSON syntax');
        return;
      }
    } else {
      setRawError(null);
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

  // Handle reset to initial prop settings
  const handleReset = () => {
    setData(settings);
    setRawText(JSON.stringify(settings, null, 2));
    setRawError(null);
  };

  const isRawInvalid = mode === 'raw' && rawError !== null;

  return (
    <div className="rounded-xl bg-slate-950 border border-slate-800 flex flex-col shadow-2xl overflow-hidden">
      {/* Editor Header Bar */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-900/60 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center space-x-2">
          {/* Mode Switcher */}
          <div className="flex items-center bg-slate-950 border border-slate-800 p-0.5 rounded-lg text-xs">
            <button
              type="button"
              onClick={() => mode !== 'tree' && handleSwitchToTree()}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
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
              onClick={() => mode !== 'raw' && handleSwitchToRaw()}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium transition-colors ${
                mode === 'raw'
                  ? 'bg-emerald-500 text-slate-950 font-semibold shadow'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              <Code2 className="w-3.5 h-3.5" />
              <span>Raw JSON</span>
            </button>
          </div>

          {mode === 'raw' && (
            <button
              type="button"
              onClick={handleFormatRaw}
              className="px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs flex items-center space-x-1 transition-colors"
              title="Prettify / Format JSON"
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-400" />
              <span>Format</span>
            </button>
          )}

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

        {/* Save / Reset Actions */}
        <div className="flex items-center space-x-2">
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
                title="Reset changes to original"
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

      {/* Raw Error Banner */}
      {rawError && (
        <div className="px-4 py-2 bg-red-950/70 border-b border-red-800/50 flex items-center space-x-2 text-xs text-red-300">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span className="font-mono">{rawError}</span>
        </div>
      )}

      {/* Body Area */}
      <div className="p-4 max-h-[550px] overflow-auto">
        {mode === 'tree' ? (
          <div className="font-mono text-xs leading-relaxed">
            <JsonTreeNode
              name="schema"
              value={data}
              path={[]}
              depth={0}
              collapseLevel={collapseLevel}
              onUpdateValue={handleUpdateValue}
              readOnly={readOnly}
            />
          </div>
        ) : (
          <textarea
            value={rawText}
            readOnly={readOnly}
            onChange={(e) => {
              if (readOnly) return;
              setRawText(e.target.value);
              try {
                const parsed = JSON.parse(e.target.value);
                setData(parsed);
                setRawError(null);
              } catch (err: any) {
                setRawError(err.message || 'Syntax error in JSON');
              }
            }}
            rows={22}
            className="w-full p-4 rounded-lg bg-slate-950 font-mono text-xs text-emerald-300 focus:outline-none focus:ring-1 focus:ring-emerald-500/50 resize-y leading-relaxed border border-slate-900"
            spellCheck={false}
          />
        )}
      </div>
    </div>
  );
}
