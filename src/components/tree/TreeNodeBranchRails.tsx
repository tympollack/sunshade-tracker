'use client';

import React from 'react';
import { INDENT_STEP } from '@/components/TreeNode';

interface TreeNodeBranchRailsProps {
  ancestorRails: boolean[];
  isLastChild: boolean;
  depth: number;
}

export function TreeNodeBranchRails({
  ancestorRails,
  isLastChild,
  depth,
}: TreeNodeBranchRailsProps) {
  return (
    <>
      {/* Multi-level ancestor vertical guide rails (depth >= 2) */}
      {ancestorRails.map((hasRail, idx) => {
        if (!hasRail) return null;
        const colDepth = idx + 1;
        return (
          <div
            key={colDepth}
            data-testid={`ancestor-rail-${colDepth}`}
            className="absolute top-0 bottom-0 w-[2px] bg-slate-700 pointer-events-none"
            style={{ left: `${colDepth * INDENT_STEP}px` }}
          />
        );
      })}

      {/* Current depth sibling continuation spine for intermediate nodes */}
      {!isLastChild && depth > 0 && (
        <div
          data-testid="branch-connector-continuation"
          className="absolute top-0 bottom-0 w-[2px] bg-slate-700 pointer-events-none"
          style={{ left: `${depth * INDENT_STEP}px` }}
        />
      )}
    </>
  );
}

export function TreeNodeBranchConnector({ isLastChild, depth }: { isLastChild: boolean; depth: number }) {
  if (depth <= 0) return null;

  return (
    <div
      data-testid="branch-connector"
      className="relative w-4 self-stretch flex-shrink-0 flex items-center pointer-events-none"
    >
      {/* Top-half vertical spine down to 50% + horizontal branch into node */}
      <div
        className={`absolute top-0 bottom-1/2 left-0 w-full border-l-2 border-b-2 border-slate-700 pointer-events-none ${
          isLastChild ? 'rounded-bl-sm' : ''
        }`}
      />
    </div>
  );
}
