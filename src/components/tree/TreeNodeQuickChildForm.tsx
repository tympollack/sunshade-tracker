'use client';

import React from 'react';
import { INDENT_STEP } from '@/components/TreeNode';

interface ValidChildType {
  type: string;
  label?: string;
}

interface TreeNodeQuickChildFormProps {
  depth: number;
  childTitle: string;
  childType: string;
  validChildTypes: ValidChildType[];
  isSubmitting: boolean;
  error: string | null;
  onTitleChange: (val: string) => void;
  onTypeChange: (val: string) => void;
  onSubmit: (e: React.FormEvent) => void;
  onCancel: () => void;
}

export function TreeNodeQuickChildForm({
  depth,
  childTitle,
  childType,
  validChildTypes,
  isSubmitting,
  error,
  onTitleChange,
  onTypeChange,
  onSubmit,
  onCancel,
}: TreeNodeQuickChildFormProps) {
  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-1.5 p-2.5 rounded-lg bg-slate-900 border border-emerald-500/40 my-1 shadow-lg"
      style={{ marginLeft: `${(depth + 1) * INDENT_STEP}px` }}
      data-testid="inline-create-child-form"
    >
      {error && (
        <div
          className="text-xs text-rose-400 font-mono pl-1"
          data-testid="inline-create-child-error"
        >
          {error}
        </div>
      )}
      <div className="flex items-center gap-2">
        <span className="text-xs text-emerald-400 font-mono shrink-0">Add child:</span>
        <select
          value={childType}
          onChange={(e) => onTypeChange(e.target.value)}
          disabled={isSubmitting}
          className="text-xs bg-slate-950 border border-slate-800 rounded px-2 py-1 text-slate-200 focus:outline-none focus:border-emerald-500 shrink-0 cursor-pointer disabled:opacity-50"
          data-testid="inline-create-child-type-select"
        >
          {validChildTypes.map((t) => (
            <option key={t.type} value={t.type}>
              {t.label || t.type}
            </option>
          ))}
        </select>
        <input
          type="text"
          autoFocus
          value={childTitle}
          onChange={(e) => onTitleChange(e.target.value)}
          disabled={isSubmitting}
          placeholder="Child item title..."
          className="flex-1 text-xs bg-slate-950 border border-slate-800 rounded px-2.5 py-1 text-slate-100 placeholder:text-slate-600 focus:outline-none focus:border-emerald-500 disabled:opacity-50"
          data-testid="inline-create-child-input"
        />
        <button
          type="submit"
          disabled={!childTitle.trim() || isSubmitting}
          className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-xs text-white font-medium disabled:opacity-40 transition-colors cursor-pointer"
          data-testid="inline-create-child-submit"
        >
          {isSubmitting ? 'Creating...' : 'Create'}
        </button>
        <button
          type="button"
          disabled={isSubmitting}
          onClick={onCancel}
          className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 text-xs text-slate-300 transition-colors cursor-pointer disabled:opacity-50"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
