'use client';

import React, { useMemo } from 'react';
import { Columns3, ArrowUp, ArrowDown, RotateCcw } from 'lucide-react';
import {
  ProjectSettings,
  RowColumnConfig,
  RowColumnViewTarget,
  WorkItem,
} from '@/types/tracker';
import {
  DEFAULT_TABLE_COLUMN_KEYS,
  DEFAULT_TREE_COLUMN_KEYS,
  resolveAvailableRowColumns,
} from '@/lib/row-columns';

export interface RowColumnsConfigEditorProps {
  settings: ProjectSettings;
  onChange: (updatedSettings: ProjectSettings) => void;
  activeItems?: WorkItem[];
  readOnly?: boolean;
}

function buildEffectiveConfigList(
  settings: ProjectSettings,
  activeItems?: WorkItem[]
): RowColumnConfig[] {
  const available = resolveAvailableRowColumns(settings, activeItems);
  const hasExplicitConfig = Array.isArray(settings.row_columns);

  if (hasExplicitConfig) {
    const validExisting = (settings.row_columns || []).filter(
      (c): c is RowColumnConfig =>
        Boolean(c && typeof c === 'object' && typeof c.key === 'string' && c.key.trim())
    );
    const byKey = new Map(validExisting.map((c) => [c.key, c]));
    const ordered: RowColumnConfig[] = [];
    for (const c of validExisting) {
      const meta = available.find((a) => a.key === c.key);
      const safeLabel =
        typeof c.label === 'string' && c.label.trim() ? c.label : meta?.label || c.key;
      const safeViews = Array.isArray(c.views)
        ? c.views.filter((v): v is RowColumnViewTarget => v === 'tree' || v === 'table')
        : (['tree', 'table'] as RowColumnViewTarget[]);
      const safeSource =
        c.source === 'static' || c.source === 'dynamic' ? c.source : meta?.source || 'dynamic';
      const safeWidth =
        c.width === 'xs' || c.width === 'sm' || c.width === 'md' || c.width === 'lg'
          ? c.width
          : meta?.width || 'sm';
      ordered.push({
        key: c.key,
        label: safeLabel,
        source: safeSource,
        visible: c.visible ?? safeViews.length > 0,
        width: safeWidth,
        views: safeViews,
      });
    }
    for (const avail of available) {
      if (!byKey.has(avail.key)) {
        ordered.push({
          key: avail.key,
          label: avail.label,
          source: avail.source,
          visible: false,
          width: avail.width,
          views: [],
        });
      }
    }
    return ordered;
  }

  const treeSet = new Set(DEFAULT_TREE_COLUMN_KEYS);
  const tableSet = new Set(DEFAULT_TABLE_COLUMN_KEYS);
  return available.map((avail) => {
    const views: RowColumnViewTarget[] = [];
    if (treeSet.has(avail.key)) views.push('tree');
    if (tableSet.has(avail.key)) views.push('table');
    return {
      key: avail.key,
      label: avail.label,
      source: avail.source,
      visible: views.length > 0,
      width: avail.width,
      views,
    };
  });
}

export const RowColumnsConfigEditor: React.FC<RowColumnsConfigEditorProps> = ({
  settings,
  onChange,
  activeItems = [],
  readOnly = false,
}) => {
  const columns = useMemo(
    () => buildEffectiveConfigList(settings, activeItems),
    [settings, activeItems]
  );

  const hasCustomSchema = Array.isArray(settings.row_columns);

  const commitColumns = (nextCols: RowColumnConfig[]) => {
    if (readOnly) return;
    const activeOnly = nextCols.filter(
      (c) => c.visible !== false && Array.isArray(c.views) && c.views.length > 0
    );
    onChange({
      ...settings,
      row_columns: activeOnly,
    });
  };

  const handleToggleView = (key: string, view: RowColumnViewTarget) => {
    if (readOnly) return;
    const nextCols = columns.map((col) => {
      if (col.key !== key) return col;
      const curViews = new Set<RowColumnViewTarget>(col.views || []);
      if (curViews.has(view)) {
        curViews.delete(view);
      } else {
        curViews.add(view);
      }
      const nextViews = Array.from(curViews);
      return {
        ...col,
        views: nextViews,
        visible: nextViews.length > 0,
      };
    });
    commitColumns(nextCols);
  };

  const handleMove = (key: string, direction: 'up' | 'down') => {
    if (readOnly) return;
    const idx = columns.findIndex((c) => c.key === key);
    if (idx === -1) return;
    const targetIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (targetIdx < 0 || targetIdx >= columns.length) return;
    const next = [...columns];
    [next[idx], next[targetIdx]] = [next[targetIdx], next[idx]];
    commitColumns(next);
  };

  const handleReset = () => {
    if (readOnly) return;
    const { row_columns: _removed, ...rest } = settings;
    onChange(rest as ProjectSettings);
  };

  return (
    <div
      data-testid="row-columns-config-editor"
      className="p-4 rounded-xl bg-slate-950 border border-slate-800 space-y-3"
    >
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-900 pb-2">
        <div>
          <h4 className="text-xs font-bold uppercase text-slate-300 tracking-wider flex items-center gap-1.5">
            <Columns3 className="w-3.5 h-3.5 text-emerald-400" />
            <span>Row &amp; Table Columns</span>
          </h4>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Configure default static and dynamic custom-field columns shown in Tree and Sprint/Table views.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-[10px] text-slate-500 font-mono">row_columns</span>
          {hasCustomSchema && !readOnly && (
            <button
              type="button"
              onClick={handleReset}
              data-testid="schema-row-columns-reset-btn"
              className="inline-flex items-center gap-1 px-2 py-1 rounded bg-slate-900 hover:bg-slate-800 border border-slate-700 text-[10px] text-slate-300 hover:text-white transition-colors cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset Defaults</span>
            </button>
          )}
        </div>
      </div>

      <div className="space-y-1.5 max-h-72 overflow-y-auto custom-scrollbar pr-1">
        {columns.map((col, idx) => {
          const inTree = Boolean(col.visible !== false && col.views?.includes('tree'));
          const inTable = Boolean(col.visible !== false && col.views?.includes('table'));
          const isStatic = col.source === 'static';
          return (
            <div
              key={col.key}
              data-testid={`schema-row-col-item-${col.key}`}
              className="flex items-center justify-between gap-2 py-1.5 px-2.5 rounded-lg bg-slate-900/40 border border-slate-900 text-xs"
            >
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span
                  className={`text-[9px] font-mono uppercase px-1.5 py-0.5 rounded border shrink-0 ${
                    isStatic
                      ? 'bg-sky-950/60 text-sky-300 border-sky-800/50'
                      : 'bg-purple-950/60 text-purple-300 border-purple-800/50'
                  }`}
                >
                  {isStatic ? 'static' : 'dynamic'}
                </span>
                <span className="font-medium text-slate-200 truncate">{col.label || col.key}</span>
                <span className="text-[10px] font-mono text-slate-500 truncate hidden sm:inline">
                  ({col.key})
                </span>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => handleToggleView(col.key, 'tree')}
                  data-testid={`schema-row-col-tree-${col.key}`}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                    readOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                  } ${
                    inTree
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Tree
                </button>
                <button
                  type="button"
                  disabled={readOnly}
                  onClick={() => handleToggleView(col.key, 'table')}
                  data-testid={`schema-row-col-table-${col.key}`}
                  className={`px-2 py-0.5 rounded text-[10px] font-medium border transition-colors ${
                    readOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                  } ${
                    inTable
                      ? 'bg-emerald-500/20 border-emerald-500/50 text-emerald-300'
                      : 'bg-slate-950 border-slate-800 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Table
                </button>

                <div className="flex items-center gap-0.5 ml-1">
                  <button
                    type="button"
                    disabled={readOnly || idx === 0}
                    onClick={() => handleMove(col.key, 'up')}
                    title="Move column up"
                    data-testid={`schema-row-col-up-${col.key}`}
                    className="p-1 rounded text-slate-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    disabled={readOnly || idx === columns.length - 1}
                    onClick={() => handleMove(col.key, 'down')}
                    title="Move column down"
                    data-testid={`schema-row-col-down-${col.key}`}
                    className="p-1 rounded text-slate-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
