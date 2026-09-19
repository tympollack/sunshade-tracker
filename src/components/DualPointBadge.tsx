'use client';

import React from 'react';

export interface DualPointBadgeProps {
  storyPoints?: number | null;     // intrinsic points
  rollupPoints?: number | null;    // calculated child/leaf rollup points
  childCount?: number;             // number of child items
  pointMode?: 'macro' | 'granular';
  showCompound?: boolean;          // explicitly enable compound pill if needed
  className?: string;
  testId?: string;
}

/**
 * Renders points badge with dual intrinsic vs. rollup support (FEAT-TRK-DUAL-POINT-BADGE-UI & FEAT-TRK-HIERARCHY-ROW-DECLUTTER):
 * - If pointMode === 'macro': displays raw intrinsic estimate ({storyPoints} pts).
 * - If item has children (childCount > 0):
 *   - By default in granular mode: single unified rollup point pill (Σ {rollupPoints} pts)
 *     with hover tooltip surfacing intrinsic estimate (title="Intrinsic Estimate: {storyPoints} pts").
 *   - If showCompound is explicitly enabled and intrinsic differs from rollup: compound badge.
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
  className = '',
  testId = 'dual-point-badge',
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
        title={`Macro estimate: ${intrinsic} pts`}
      >
        {intrinsic} pts
      </span>
    );
  }

  // Granular mode:
  // 1. Container with children
  if (hasChildren) {
    // If showCompound is explicitly enabled and both points exist: compound badge
    if (showCompound && hasIntrinsic && hasRollup && intrinsic !== rollup) {
      return (
        <div
          data-testid={testId}
          className={`inline-flex items-center shrink-0 whitespace-nowrap select-none ${className}`}
          title={`Intrinsic Estimate: ${intrinsic} pts | Active child tasks: ${rollup} pts`}
        >
          <span
            data-testid={`${testId}-rollup`}
            className="text-[10px] font-mono font-medium px-1.5 py-0.5 rounded-l bg-emerald-950/60 text-emerald-300 border border-emerald-800/60 shrink-0 whitespace-nowrap"
          >
            Σ {rollup} pts
          </span>
          <span
            data-testid={`${testId}-intrinsic`}
            className="text-[10px] font-mono px-1.5 py-0.5 rounded-r bg-slate-800/80 text-slate-400 border border-l-0 border-slate-700/60 shrink-0 whitespace-nowrap"
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
              ? `Intrinsic Estimate: ${intrinsic} pts`
              : `Active child tasks: ${rollup} pts`
          }
        >
          <span data-testid={`${testId}-rollup`}>Σ {rollup} pts</span>
        </span>
      );
    }

    if (hasIntrinsic) {
      return (
        <span
          data-testid={testId}
          className={`text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-800/80 text-slate-400 border border-slate-700/60 shrink-0 whitespace-nowrap select-none ${className}`}
          title={`Intrinsic Estimate: ${intrinsic} pts`}
        >
          {intrinsic} pts
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
        title={`${intrinsic} pts`}
      >
        {intrinsic} pts
      </span>
    );
  }

  return null;
};

