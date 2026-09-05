'use client';

import React from 'react';
import { WorkItemNode } from '@/types/tracker';

export interface TreeNodeProps {
  item: WorkItemNode;
  getStatusColor?: (status: string) => string;
}

export function TreeNode({ item, getStatusColor }: TreeNodeProps) {
  const statusColor = getStatusColor ? getStatusColor(item.status) : null;

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
        <div className="flex-1 rounded-lg border border-slate-800 bg-slate-900/70 p-3 my-1 hover:border-slate-700 transition-colors">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs uppercase font-mono px-2 py-0.5 rounded bg-slate-800 text-slate-300">
                {item.item_type}
              </span>
              <span className="font-semibold text-slate-100">{item.title}</span>
              {item.external_ref_id && (
                <span className="text-xs font-mono text-slate-500">[{item.external_ref_id}]</span>
              )}
            </div>
            <span
              className={`text-xs font-mono px-2 py-0.5 rounded flex-shrink-0 ${
                !statusColor ? 'bg-slate-800 text-slate-300' : ''
              }`}
              style={
                statusColor
                  ? {
                      backgroundColor: `${statusColor}20`,
                      color: statusColor,
                      border: `1px solid ${statusColor}40`,
                    }
                  : undefined
              }
            >
              {item.status}
            </span>
          </div>
        </div>
      </div>

      {/* Render Nested Children */}
      {item.children && item.children.length > 0 && (
        <div className="flex flex-col">
          {item.children.map((child) => (
            <TreeNode key={child.id} item={child} getStatusColor={getStatusColor} />
          ))}
        </div>
      )}
    </div>
  );
}
