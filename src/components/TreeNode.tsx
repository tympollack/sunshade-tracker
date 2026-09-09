'use client';

import React from 'react';
import { WorkItemNode } from '@/types/tracker';
import { SchemaDeviation } from '@/lib/schema-deviation';
import { AlertTriangle } from 'lucide-react';

export interface TreeNodeProps {
  item: WorkItemNode;
  getStatusColor?: (status: string) => string;
  deviations?: SchemaDeviation[];
  onOpenReconciliation?: (deviation?: SchemaDeviation) => void;
}

export function TreeNode({
  item,
  getStatusColor,
  deviations,
  onOpenReconciliation,
}: TreeNodeProps) {
  const statusColor = getStatusColor ? getStatusColor(item.status) : null;

  const itemDeviations = deviations?.filter((d) => d.itemId === item.id) || [];
  const unmappedLevelDev = itemDeviations.find((d) => d.deviationType === 'unmapped_level');
  const unmappedStatusDev = itemDeviations.find((d) => d.deviationType === 'unmapped_status');
  const nestingDev = itemDeviations.find((d) => d.deviationType === 'nesting_conflict');

  return (
    <div className="relative flex flex-col" data-testid="tree-node">
      <div 
        className="flex items-center gap-3 transition-all"
        style={{ marginLeft: `${item.depth * 28}px` }}
      >
        {/* Tree Branch Connector */}
        {item.depth > 0 && (
          <div 
            data-testid="branch-connector"
            className="w-4 h-6 border-b-2 border-l-2 border-slate-700 -mt-3 rounded-bl-sm flex-shrink-0" 
          />
        )}

        {/* Card Component */}
        <div className={`flex-1 rounded-lg border bg-slate-900/70 p-3 my-1 hover:border-slate-700 transition-colors ${
          unmappedLevelDev || nestingDev ? 'border-amber-500/50 bg-amber-950/10' : 'border-slate-800'
        }`}>
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-xs uppercase font-mono px-2 py-0.5 rounded ${
                unmappedLevelDev
                  ? 'bg-amber-950/80 text-amber-300 border border-amber-500/40'
                  : 'bg-slate-800 text-slate-300'
              }`}>
                {item.item_type}
              </span>

              {/* Deviation Warning Badges */}
              {unmappedLevelDev && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenReconciliation?.(unmappedLevelDev);
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 hover:bg-amber-500/30 transition-colors cursor-pointer"
                  title={`${unmappedLevelDev.message} (Click to reconcile)`}
                  data-testid="unmapped-level-badge"
                >
                  <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0" />
                  <span>Unmapped Level</span>
                </button>
              )}

              {nestingDev && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenReconciliation?.(nestingDev);
                  }}
                  className="inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 hover:bg-rose-500/30 transition-colors cursor-pointer"
                  title={`${nestingDev.message} (Click to reconcile)`}
                  data-testid="nesting-conflict-badge"
                >
                  <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />
                  <span>Nesting Conflict</span>
                </button>
              )}

              <span className="font-semibold text-slate-100">{item.title}</span>
              {item.external_ref_id && (
                <span className="text-xs font-mono text-slate-500">[{item.external_ref_id}]</span>
              )}
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={`text-xs font-mono px-2 py-0.5 rounded flex-shrink-0 ${
                  !statusColor ? 'bg-slate-800 text-slate-300' : ''
                } ${unmappedStatusDev ? 'border border-amber-500/60' : ''}`}
                style={
                  statusColor
                    ? {
                        backgroundColor: `${statusColor}20`,
                        color: statusColor,
                        border: unmappedStatusDev ? '1px solid #f59e0b' : `1px solid ${statusColor}40`,
                      }
                    : undefined
                }
              >
                {item.status}
              </span>
              {unmappedStatusDev && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onOpenReconciliation?.(unmappedStatusDev);
                  }}
                  className="text-amber-400 hover:text-amber-300 transition-colors cursor-pointer text-xs"
                  title={`${unmappedStatusDev.message} (Click to reconcile)`}
                  data-testid="unmapped-status-badge"
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Render Nested Children */}
      {item.children && item.children.length > 0 && (
        <div className="flex flex-col">
          {item.children.map((child) => (
            <TreeNode
              key={child.id}
              item={child}
              getStatusColor={getStatusColor}
              deviations={deviations}
              onOpenReconciliation={onOpenReconciliation}
            />
          ))}
        </div>
      )}
    </div>
  );
}
