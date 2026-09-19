'use client';

import React from 'react';
import { Layers, Network } from 'lucide-react';

export interface PointModeSwitcherProps {
  mode: 'macro' | 'granular';
  onChange: (mode: 'macro' | 'granular') => void;
  className?: string;
}

/**
 * Segmented switcher for point calculation mode (FEAT-TRK-MACRO-VS-LEAF-VIEW-TOGGLE):
 * - Macro (Top-Level): Shows container estimates and roadmap capacity.
 * - Granular (Leaf): Shows rolled-up subtask points and true execution burn.
 */
export const PointModeSwitcher: React.FC<PointModeSwitcherProps> = ({
  mode,
  onChange,
  className = '',
}) => {
  return (
    <div
      data-testid="point-mode-switcher"
      className={`inline-flex items-center p-0.5 rounded-lg bg-slate-950 border border-slate-800 text-xs select-none ${className}`}
      role="group"
      aria-label="Story Point Calculation Mode"
    >
      <button
        type="button"
        data-testid="point-mode-macro-btn"
        aria-pressed={mode === 'macro'}
        onClick={() => onChange('macro')}
        className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md font-medium text-xs transition-all cursor-pointer ${
          mode === 'macro'
            ? 'bg-slate-800 text-slate-100 shadow-sm border border-slate-700/80'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
        }`}
        title="View container sizing (top-level intrinsic estimates & roadmap capacity)"
      >
        <Layers className="w-3 h-3 text-slate-400" />
        <span>Macro (Top-Level)</span>
      </button>

      <button
        type="button"
        data-testid="point-mode-granular-btn"
        aria-pressed={mode === 'granular'}
        onClick={() => onChange('granular')}
        className={`flex items-center space-x-1.5 px-2.5 py-1 rounded-md font-medium text-xs transition-all cursor-pointer ${
          mode === 'granular'
            ? 'bg-emerald-950/80 text-emerald-300 shadow-sm border border-emerald-800/80'
            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900/60'
        }`}
        title="View leaf-level execution workload (true burn & child task rollups)"
      >
        <Network className="w-3 h-3 text-emerald-400" />
        <span>Granular (Leaf)</span>
      </button>
    </div>
  );
};

