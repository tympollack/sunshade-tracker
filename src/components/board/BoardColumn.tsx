'use client';

import React from 'react';
import { ChevronDown, ChevronsLeftRight, ChevronUp, Plus } from 'lucide-react';
import { StatusDefinition } from '@/types/tracker';

export interface BoardColumnProps {
  column: StatusDefinition;
  itemCount: number;
  orientation?: 'columns' | 'stack';
  isCollapsed?: boolean;
  isCollapsedUp?: boolean;
  onToggleCollapse?: () => void;
  onToggleCollapseUp?: () => void;
  onQuickAdd?: () => void;
  children: React.ReactNode;
  bannerSlot?: React.ReactNode;
  isReadOnly?: boolean;
  className?: string;
  collapseButtonTestId?: string;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  headerActions?: React.ReactNode;
}

export function BoardColumn({
  column,
  itemCount,
  orientation = 'columns',
  isCollapsed = false,
  isCollapsedUp = false,
  onToggleCollapse,
  onToggleCollapseUp,
  onQuickAdd,
  children,
  bannerSlot,
  isReadOnly = false,
  className = '',
  collapseButtonTestId,
  onDragOver,
  onDrop,
  headerActions,
}: BoardColumnProps) {
  if (isCollapsed && orientation === 'columns') {
    return (
      <div
        data-testid={`collapsed-rail-${column.id}`}
        onClick={onToggleCollapse}
        className="w-12 min-w-[48px] max-w-[48px] shrink-0 bg-slate-900/30 border border-slate-800/60 hover:border-slate-700/80 rounded-xl flex flex-col items-center py-4 cursor-pointer transition-colors group h-full"
        title={`Expand ${column.label} (${itemCount})`}
      >
        <div
          data-testid={`collapsed-rail-header-${column.id}`}
          className="flex flex-col items-center gap-1.5 shrink-0 mb-4"
        >
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: column.color || '#94a3b8' }}
          />
          <span className="text-xs px-1.5 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono shrink-0">
            {itemCount}
          </span>
        </div>
        <span className="[writing-mode:vertical-rl] rotate-180 text-xs font-semibold tracking-wider uppercase text-slate-400 group-hover:text-slate-200 transition-colors my-auto select-none">
          {column.label}
        </span>
      </div>
    );
  }

  const isHeaderToggleable = Boolean(onToggleCollapseUp && (orientation === 'stack' || isCollapsedUp));
  const containerLayoutClasses =
    orientation === 'columns'
      ? `w-full min-w-0 md:min-w-[280px] md:max-w-[340px] flex-1 flex flex-col ${
          isCollapsedUp ? 'h-auto' : 'h-full'
        } bg-slate-950/50 border border-slate-800/80 rounded-xl overflow-hidden transition-all shadow-sm`
      : 'w-full shrink-0 bg-slate-900/40 border border-slate-800/80 rounded-xl flex flex-col transition-all shadow-sm';

  return (
    <div
      onDragOver={onDragOver}
      onDrop={onDrop}
      data-testid={`board-column-${column.id}`}
      className={`${containerLayoutClasses} ${className}`.trim()}
    >
      {/* Sticky Column Header */}
      <div
        onClick={() => {
          if (isHeaderToggleable) {
            onToggleCollapseUp?.();
          }
        }}
        className={`shrink-0 p-3 border-b border-slate-800 bg-slate-900/90 backdrop-blur sticky top-0 z-10 flex items-center justify-between rounded-t-xl ${
          isHeaderToggleable ? 'cursor-pointer hover:bg-slate-900/60 transition-colors' : ''
        }`}
      >
        <div className="flex items-center space-x-2 min-w-0">
          <span
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: column.color || '#94a3b8' }}
          />
          <span className="font-semibold text-xs tracking-wider uppercase text-slate-300 truncate">
            {column.label}
          </span>
          <span className="text-xs px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 font-mono shrink-0">
            {itemCount}
          </span>
        </div>

        <div className="flex items-center space-x-1 shrink-0">
          {!isReadOnly && onQuickAdd && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onQuickAdd();
              }}
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
              title={`Add item to ${column.label}`}
            >
              <Plus className="w-3.5 h-3.5" />
            </button>
          )}
          {headerActions}
          {onToggleCollapseUp && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapseUp();
              }}
              className={`${
                orientation === 'columns' && !isCollapsedUp ? 'md:hidden ' : ''
              }p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors`}
              title={isCollapsedUp ? `Expand ${column.label}` : 'Collapse column upward'}
              data-testid={`column-collapse-up-btn-${column.id}`}
            >
              {isCollapsedUp ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          )}
          {orientation === 'columns' && onToggleCollapse && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onToggleCollapse();
              }}
              className="p-1 text-slate-400 hover:text-white rounded hover:bg-slate-800 transition-colors"
              title="Collapse column sideways"
              data-testid={collapseButtonTestId || `column-collapse-toggle-${column.id}`}
            >
              <ChevronsLeftRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {!isCollapsedUp && bannerSlot}

      {/* Independent Card Container Scroll */}
      {!isCollapsedUp && (
        <div
          className={
            orientation === 'stack'
              ? 'board-column-scroll p-3 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3'
              : 'board-column-scroll flex-1 overflow-y-visible max-h-none md:overflow-y-auto md:max-h-full overflow-x-hidden p-2 space-y-2.5 custom-scrollbar min-h-0'
          }
        >
          {children}
        </div>
      )}
    </div>
  );
}

export default BoardColumn;
