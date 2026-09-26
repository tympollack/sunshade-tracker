'use client';

import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, X, Hash, User, Calendar, Layers, CornerDownLeft } from 'lucide-react';
import { WorkItem, ProjectSettings } from '@/types/tracker';
import { getHierarchyLevelColor } from '@/lib/hierarchy-colors';

export interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: WorkItem[];
  onSelectItem: (item: WorkItem) => void;
  projectSettings: ProjectSettings;
}

export function GlobalSearchModal({
  isOpen,
  onClose,
  items,
  onSelectItem,
  projectSettings,
}: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Auto-focus input when opened
  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setSelectedIndex(0);
      setTimeout(() => {
        inputRef.current?.focus();
      }, 50);
    }
  }, [isOpen]);

  // Filter items
  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      // Show first 10 items when no query
      return items.slice(0, 10);
    }

    return items
      .filter((item) => {
        const titleMatch = item.title.toLowerCase().includes(q);
        const refMatch = item.external_ref_id?.toLowerCase().includes(q);
        const assignee = (item.assignee || item.metadata?.assignee || '').toLowerCase();
        const assigneeMatch = assignee.includes(q);
        const typeMatch = item.item_type.toLowerCase().includes(q);
        const statusMatch = item.status.toLowerCase().includes(q);

        return titleMatch || refMatch || assigneeMatch || typeMatch || statusMatch;
      })
      .slice(0, 20); // Cap at 20 results for fast navigation
  }, [items, query]);

  // Reset selected index when query changes
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Handle keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length === 0 ? 0 : (prev + 1) % filteredItems.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (filteredItems.length === 0 ? 0 : (prev - 1 + filteredItems.length) % filteredItems.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (filteredItems[selectedIndex]) {
        onSelectItem(filteredItems[selectedIndex]);
        onClose();
      }
    }
  };

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const selectedEl = listRef.current.children[selectedIndex] as HTMLElement | undefined;
      if (selectedEl && typeof selectedEl.scrollIntoView === 'function') {
        selectedEl.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Global Work Item Search"
      className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-150"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      onKeyDown={handleKeyDown}
    >
      <div
        data-modal-content="true"
        data-testid="global-search-modal"
        className="w-full max-w-2xl bg-slate-900 border border-slate-700 rounded-xl shadow-2xl shadow-black/80 overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center px-4 py-3 border-b border-slate-800 bg-slate-950/80 gap-3">
          <Search className="w-5 h-5 text-emerald-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search work items by title, ref ID, or assignee..."
            data-testid="global-search-input"
            className="flex-1 bg-transparent text-sm sm:text-base text-slate-100 placeholder-slate-500 focus:outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-slate-400 hover:text-white p-1 rounded transition-colors"
              aria-label="Clear query"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          <kbd className="hidden sm:inline-flex items-center px-2 py-0.5 text-[10px] font-mono text-slate-400 bg-slate-800 rounded border border-slate-700">
            ESC to close
          </kbd>
        </div>

        {/* Results List */}
        <div
          ref={listRef}
          data-testid="global-search-results"
          className="max-h-[60vh] overflow-y-auto p-2 divide-y divide-slate-800/40 custom-scrollbar"
        >
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              No work items found matching &quot;{query}&quot;
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              const statusDef = projectSettings.statuses.find((s) => s.id === item.status);
              const levelColor = getHierarchyLevelColor(item.item_type, projectSettings.hierarchy);
              const assignee = item.assignee || item.metadata?.assignee;
              const points = item.metadata?.story_points ?? item.metadata?.points ?? item.metadata?.estimate;

              return (
                <div
                  key={item.id}
                  data-testid={`search-result-item-${item.id}`}
                  onClick={() => {
                    onSelectItem(item);
                    onClose();
                  }}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between p-3 rounded-lg cursor-pointer transition-colors ${
                    isSelected
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-white'
                      : 'hover:bg-slate-800/60 text-slate-200 border border-transparent'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1 mr-2">
                    {/* Level Pill */}
                    <span
                      className="px-1.5 py-0.5 text-[10px] font-bold rounded uppercase tracking-wider shrink-0"
                      style={{
                        backgroundColor: `${levelColor.hex}20`,
                        color: levelColor.hex,
                        border: `1px solid ${levelColor.hex}40`,
                      }}
                    >
                      {item.item_type}
                    </span>

                    {/* Ref ID */}
                    {item.external_ref_id && (
                      <span className="font-mono text-xs font-semibold text-slate-400 shrink-0">
                        {item.external_ref_id}
                      </span>
                    )}

                    {/* Title */}
                    <span className="text-xs sm:text-sm font-medium truncate min-w-0 text-slate-100">
                      {item.title}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {/* Assignee */}
                    {assignee && (
                      <span className="hidden md:inline-flex items-center gap-1 text-[11px] text-slate-400 bg-slate-800/80 px-2 py-0.5 rounded">
                        <User className="w-3 h-3 text-slate-400" />
                        <span className="max-w-[100px] truncate">{assignee}</span>
                      </span>
                    )}

                    {/* Points */}
                    {points !== undefined && points !== null && (
                      <span className="text-[10px] font-mono font-semibold px-1.5 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                        {points} pts
                      </span>
                    )}

                    {/* Status Pill */}
                    <span
                      className="px-2 py-0.5 text-[10px] font-medium rounded-full shrink-0"
                      style={{
                        backgroundColor: `${statusDef?.color || '#64748b'}20`,
                        color: statusDef?.color || '#94a3b8',
                        border: `1px solid ${statusDef?.color || '#64748b'}40`,
                      }}
                    >
                      {statusDef?.label || item.status}
                    </span>

                    {isSelected && (
                      <CornerDownLeft className="w-3.5 h-3.5 text-emerald-400 ml-1 hidden sm:block shrink-0" />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-slate-950 border-t border-slate-800 text-[11px] text-slate-400 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px] font-mono border border-slate-700">↑</kbd>{' '}
              <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px] font-mono border border-slate-700">↓</kbd> navigate
            </span>
            <span>
              <kbd className="px-1 py-0.5 bg-slate-800 rounded text-[10px] font-mono border border-slate-700">Enter</kbd> open
            </span>
          </div>
          <span>{filteredItems.length} {filteredItems.length === 1 ? 'item' : 'items'}</span>
        </div>
      </div>
    </div>
  );
}
