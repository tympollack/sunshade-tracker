'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Columns3, Check, RotateCcw, ArrowUp, ArrowDown } from 'lucide-react';
import { RowColumnViewTarget } from '@/types/tracker';
import { ResolvedRowColumn } from '@/lib/row-columns';

export interface RowColumnsPickerProps {
  view: RowColumnViewTarget;
  availableColumns: ResolvedRowColumn[];
  effectiveColumns: ResolvedRowColumn[];
  activeKeys: Set<string>;
  isCustomized: boolean;
  onToggleColumn: (key: string) => void;
  onMoveColumn?: (key: string, direction: 'up' | 'down') => void;
  onResetToSchema: () => void;
}

export const RowColumnsPicker: React.FC<RowColumnsPickerProps> = ({
  view,
  availableColumns,
  effectiveColumns,
  activeKeys,
  isCustomized,
  onToggleColumn,
  onMoveColumn,
  onResetToSchema,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const updatePosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const menuWidth = 264;
    const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
    const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

    let left = rect.right - menuWidth;
    if (left < 12) left = rect.left;
    if (left + menuWidth > windowWidth - 12) {
      left = Math.max(12, windowWidth - menuWidth - 12);
    }

    const estimatedHeight = menuRef.current?.offsetHeight || 340;
    const spaceBelow = windowHeight - rect.bottom - 8;
    const spaceAbove = rect.top - 8;

    let top = rect.bottom + 6;
    if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
      top = Math.max(8, rect.top - estimatedHeight - 6);
    } else if (top + estimatedHeight > windowHeight - 8) {
      top = Math.max(8, windowHeight - estimatedHeight - 8);
    }

    setCoords({ top, left: Math.max(12, left) });
  }, []);

  useLayoutEffect(() => {
    if (isOpen) updatePosition();
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const handleScrollResize = () => updatePosition();
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('resize', handleScrollResize);
    window.addEventListener('scroll', handleScrollResize, true);
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', handleScrollResize);
      window.removeEventListener('scroll', handleScrollResize, true);
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, updatePosition]);

  const staticColumns = availableColumns.filter((c) => c.source === 'static');
  const dynamicColumns = availableColumns.filter((c) => c.source === 'dynamic');
  const effectiveOrder = effectiveColumns.map((c) => c.key);

  const renderSection = (title: string, cols: ResolvedRowColumn[]) => {
    if (cols.length === 0) return null;
    return (
      <div className="space-y-1">
        <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          {title}
        </div>
        {cols.map((col) => {
          const checked = activeKeys.has(col.key);
          const orderIdx = effectiveOrder.indexOf(col.key);
          return (
            <div
              key={col.key}
              className={`flex items-center justify-between gap-1.5 px-2 py-1 rounded text-xs transition-colors ${
                checked
                  ? 'bg-slate-800/70 text-slate-100'
                  : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
              }`}
            >
              <button
                type="button"
                onClick={() => onToggleColumn(col.key)}
                data-testid={`row-column-toggle-${col.key}`}
                className="flex items-center gap-2 flex-1 min-w-0 text-left cursor-pointer"
              >
                <span
                  className={`w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0 ${
                    checked
                      ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                      : 'border-slate-700 bg-slate-950'
                  }`}
                >
                  {checked && <Check className="w-2.5 h-2.5" />}
                </span>
                <span className="truncate">{col.label}</span>
              </button>

              {checked && onMoveColumn && (
                <div className="flex items-center gap-0.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => onMoveColumn(col.key, 'up')}
                    disabled={orderIdx <= 0}
                    title={`Move ${col.label} left/up`}
                    data-testid={`row-column-move-up-${col.key}`}
                    className="p-0.5 rounded text-slate-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onMoveColumn(col.key, 'down')}
                    disabled={orderIdx === -1 || orderIdx >= effectiveOrder.length - 1}
                    title={`Move ${col.label} right/down`}
                    data-testid={`row-column-move-down-${col.key}`}
                    className="p-0.5 rounded text-slate-500 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        data-testid={`row-columns-picker-btn-${view}`}
        title="Configure visible static and dynamic row columns"
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer shrink-0 ${
          isCustomized || isOpen
            ? 'bg-emerald-500/10 border-emerald-500/40 text-emerald-300'
            : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700'
        }`}
      >
        <Columns3 className="w-3.5 h-3.5" />
        <span>Columns</span>
        <span className="text-[10px] font-mono px-1 py-0.2 rounded bg-slate-900 border border-slate-800 text-slate-400">
          {effectiveColumns.length}
        </span>
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            data-testid={`row-columns-popover-${view}`}
            onClick={(e) => e.stopPropagation()}
            style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
            className="fixed z-50 w-[264px] bg-slate-900 border border-slate-800 rounded-xl p-2 shadow-2xl space-y-2 animate-in fade-in-0 zoom-in-95"
          >
            <div className="flex items-center justify-between px-2 pb-1.5 border-b border-slate-800">
              <span className="text-[11px] font-semibold text-slate-200">
                Visible Columns
              </span>
              {isCustomized && (
                <button
                  type="button"
                  onClick={onResetToSchema}
                  data-testid={`row-columns-reset-${view}`}
                  className="inline-flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 cursor-pointer"
                >
                  <RotateCcw className="w-2.5 h-2.5" />
                  <span>Reset to Schema</span>
                </button>
              )}
            </div>

            <div className="max-h-72 overflow-y-auto custom-scrollbar space-y-2.5 pr-0.5">
              {renderSection('Static Fields', staticColumns)}
              {renderSection('Dynamic / Custom Fields', dynamicColumns)}
              {dynamicColumns.length === 0 && (
                <div className="px-2 py-1 text-[11px] text-slate-500 italic">
                  No custom metadata fields configured in project schema.
                </div>
              )}
            </div>
          </div>,
          document.body
        )}
    </>
  );
};
