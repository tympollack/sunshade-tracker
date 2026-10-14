'use client';

import React from 'react';

export interface DualPointBadgeProps {
  storyPoints?: number | null;     // intrinsic points
  rollupPoints?: number | null;    // calculated child/leaf rollup points
  childCount?: number;             // number of child items
  pointMode?: 'macro' | 'granular';
  showCompound?: boolean;          // explicitly enable compound pill if needed
  compact?: boolean;               // compact mode for narrow viewports (< 640px)
  className?: string;
  testId?: string;
  unit?: string;                   // configurable work unit suffix (e.g. 'pts', 'credits')
}

/**
 * Renders points badge with dual intrinsic vs. rollup support (FEAT-TRK-DUAL-POINT-BADGE-UI & FEAT-TRK-HIERARCHY-ROW-DECLUTTER & TASK-TRK-POINT-BADGE-CONSOLIDATION):
 * - If pointMode === 'macro': displays raw intrinsic estimate ({storyPoints} pts).
 * - If item has children (childCount > 0):
 *   - On compact viewports (< 640px) or with compact={true}:
 *     If rollupPoints exists and non-zero, show ONLY Σ [X] pts in emerald pill,
 *     mounting intrinsic estimate strictly inside tooltip (title="Intrinsic: Y pts | Rollup: X pts").
 *   - By default in granular mode: single unified rollup point pill (Σ {rollupPoints} pts)
 *     with hover tooltip surfacing intrinsic estimate (title="Intrinsic Estimate: {storyPoints} pts").
 *   - If showCompound is explicitly enabled and intrinsic differs from rollup: compound badge (hiding intrinsic on < sm).
 * - If item is a leaf (childCount === 0):
 *   - Single compact pill: {storyPoints} pts.
 *
 * Enforces whitespace-nowrap and shrink-0 to prevent long titles from wrapping.
 */
export const DualPointBadge: React.FC<DualPointBadgeProps> = ({
  storyPoints,
  rollupPoints,
  childCount = 0,
  pointMode = 'granular',
  showCompound = false,
  compact = false,
  className = '',
  testId = 'dual-point-badge',
  unit = 'pts',
}) => {
  const intrinsic = Number(storyPoints);
  const hasIntrinsic = !isNaN(intrinsic) && intrinsic > 0;

  const rollup = Number(rollupPoints);
  const hasRollup = !isNaN(rollup) && rollup > 0;

  const hasChildren = childCount > 0;

  // Macro mode: prioritize raw top-level intrinsic estimate
  if (pointMode === 'macro') {
    if (!hasIntrinsic) return null;
    return (
      <span
        data-testid={testId}
        className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-300 border border-slate-700/60 shrink-0 whitespace-nowrap select-none ${className}`}
        title={`Macro estimate: ${intrinsic} ${unit}`}
      >
        {intrinsic} {unit}
      </span>
    );
  }

  // Granular mode:
  // 1. Container with children
  if (hasChildren) {
    // If compact prop is true: strictly single pill and tooltip "Intrinsic: Y pts | Rollup: X pts"
    if (compact) {
      if (hasRollup) {
        return (
          <span
            data-testid={testId}
            className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 shrink-0 whitespace-nowrap select-none ${className}`}
            title={
              hasIntrinsic
                ? `Intrinsic: ${intrinsic} ${unit} | Rollup: ${rollup} ${unit}`
                : `Rollup: ${rollup} ${unit}`
            }
          >
            <span data-testid={`${testId}-rollup`}>Σ {rollup} {unit}</span>
          </span>
        );
      }
      if (hasIntrinsic) {
        return (
          <span
            data-testid={testId}
            className={`text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/60 shrink-0 whitespace-nowrap select-none ${className}`}
            title={`Intrinsic: ${intrinsic} ${unit}`}
          >
            {intrinsic} {unit}
          </span>
        );
      }
      return null;
    }

    // If showCompound is explicitly enabled and both points exist: compound badge
    // On screens < 640px (< sm:), hide the intrinsic pill from DOM flow
    if (showCompound && hasIntrinsic && hasRollup && intrinsic !== rollup) {
      return (
        <div
          data-testid={testId}
          className={`inline-flex items-center shrink-0 whitespace-nowrap select-none ${className}`}
          title={`Intrinsic Estimate: ${intrinsic} ${unit} | Active child tasks: ${rollup} ${unit}`}
        >
          <span
            data-testid={`${testId}-rollup`}
            className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded sm:rounded-r-none bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 shrink-0 whitespace-nowrap"
          >
            Σ {rollup} {unit}
          </span>
          <span
            data-testid={`${testId}-intrinsic`}
            className="hidden sm:inline-flex text-[10px] font-mono px-1.5 py-0.5 rounded-r bg-slate-800/80 text-slate-400 border border-l-0 border-slate-700/60 shrink-0 whitespace-nowrap"
          >
            Est: {intrinsic}
          </span>
        </div>
      );
    }

    // Default (FEAT-TRK-HIERARCHY-ROW-DECLUTTER): Single unified rollup point pill by default
    if (hasRollup) {
      return (
        <span
          data-testid={testId}
          className={`text-[10px] font-mono font-medium px-1.5 py-0.5 rounded bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 shrink-0 whitespace-nowrap select-none ${className}`}
          title={
            hasIntrinsic
              ? `Intrinsic Estimate: ${intrinsic} ${unit}`
              : `Active child tasks: ${rollup} ${unit}`
          }
        >
          <span data-testid={`${testId}-rollup`}>Σ {rollup} {unit}</span>
        </span>
      );
    }

    if (hasIntrinsic) {
      return (
        <span
          data-testid={testId}
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/60 shrink-0 whitespace-nowrap select-none ${className}`}
          title={`Intrinsic Estimate: ${intrinsic} ${unit}`}
        >
          {intrinsic} {unit}
        </span>
      );
    }

    return null;
  }

  // 2. Leaf item (childCount === 0)
  if (hasIntrinsic) {
    return (
      <span
        data-testid={testId}
        className={`text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-950 border border-slate-800 text-slate-400 shrink-0 whitespace-nowrap select-none ${className}`}
        title={`${intrinsic} ${unit}`}
      >
        {intrinsic} {unit}
      </span>
    );
  }

  return null;
};

