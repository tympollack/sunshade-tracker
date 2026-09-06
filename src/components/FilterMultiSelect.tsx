'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronDown, Check, X } from 'lucide-react';

export interface FilterOption {
  id: string;
  label: string;
  color?: string;
  badgeBg?: string;
  badgeText?: string;
  count?: number;
}

interface FilterMultiSelectProps {
  label: string;
  options: FilterOption[];
  selectedIds: string[];
  onChange: (newSelected: string[]) => void;
  className?: string;
}

export function FilterMultiSelect({
  label,
  options,
  selectedIds,
  onChange,
  className = '',
}: FilterMultiSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const allSelected = options.length > 0 && selectedIds.length === options.length;
  const noneSelected = selectedIds.length === 0;

  const handleSelectAll = () => {
    onChange(options.map((o) => o.id));
  };

  const handleSelectNone = () => {
    onChange([]);
  };

  const handleToggle = (id: string) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((item) => item !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  // Button summary text
  let summaryText = `${label}: All (${options.length})`;
  if (noneSelected) {
    summaryText = `${label}: None`;
  } else if (!allSelected) {
    summaryText = `${label}: ${selectedIds.length}/${options.length}`;
  }

  return (
    <div className={`relative inline-block ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center space-x-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          open
            ? 'bg-slate-800 border-slate-700 text-white'
            : !allSelected
            ? 'bg-slate-900 border-emerald-500/40 text-emerald-300 hover:border-emerald-500/60'
            : 'bg-slate-900 border-slate-800 text-slate-300 hover:border-slate-700'
        }`}
      >
        <span>{summaryText}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-64 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/60 z-50 overflow-hidden">
          {/* Header Controls */}
          <div className="px-3 py-2 border-b border-slate-800 flex items-center justify-between bg-slate-950/40">
            <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Filter by {label}
            </span>
            <div className="flex items-center space-x-1">
              <button
                type="button"
                onClick={handleSelectAll}
                className="text-[10px] px-2 py-0.5 rounded hover:bg-slate-800 text-emerald-400 font-medium transition-colors"
              >
                All
              </button>
              <span className="text-slate-700">|</span>
              <button
                type="button"
                onClick={handleSelectNone}
                className="text-[10px] px-2 py-0.5 rounded hover:bg-slate-800 text-slate-400 hover:text-red-400 font-medium transition-colors"
              >
                None
              </button>
            </div>
          </div>

          {/* Options list */}
          <div className="p-1.5 space-y-0.5 max-h-60 overflow-y-auto">
            {options.map((option) => {
              const isChecked = selectedIds.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => handleToggle(option.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors ${
                    isChecked
                      ? 'bg-slate-800/80 text-white'
                      : 'text-slate-400 hover:bg-slate-800/40 hover:text-slate-200'
                  }`}
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    <div
                      className={`w-3.5 h-3.5 rounded border flex items-center justify-center transition-colors flex-shrink-0 ${
                        isChecked
                          ? 'bg-emerald-500 border-emerald-500 text-slate-950'
                          : 'border-slate-700 bg-slate-950'
                      }`}
                    >
                      {isChecked && <Check className="w-2.5 h-2.5 stroke-[3]" />}
                    </div>

                    {option.color && (
                      <span
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: option.color }}
                      />
                    )}

                    <span className="truncate">{option.label}</span>
                  </div>

                  {typeof option.count === 'number' && (
                    <span className="text-[10px] font-mono text-slate-500 ml-2 px-1.5 py-0.2 rounded bg-slate-950/60">
                      {option.count}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
