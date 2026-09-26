'use client';

import React from 'react';
import {
  Clock,
  RefreshCw,
  History,
  ArrowRight,
} from 'lucide-react';
import { AuditLogEntry, ProjectSettings } from '@/types/tracker';

export interface ActivityLogTabProps {
  itemId?: string;
  auditLogs: AuditLogEntry[];
  isLoadingLogs: boolean;
  effectiveProjectSettings: ProjectSettings;
  onRefreshLogs: (itemId: string) => void;
}

export function ActivityLogTab({
  itemId,
  auditLogs,
  isLoadingLogs,
  effectiveProjectSettings,
  onRefreshLogs,
}: ActivityLogTabProps) {
  return (
    <div data-testid="activity-log-tab" className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <Clock className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
            Change History & Audit Trail
          </span>
        </div>
        <button
          type="button"
          onClick={() => itemId && onRefreshLogs(itemId)}
          disabled={isLoadingLogs}
          className="p-1.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
          title="Refresh activity"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoadingLogs ? 'animate-spin text-emerald-400' : ''}`} />
        </button>
      </div>

      {isLoadingLogs && auditLogs.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-500">
          <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-emerald-400" />
          Loading activity log...
        </div>
      ) : auditLogs.length === 0 ? (
        <div className="py-12 text-center space-y-2">
          <History className="w-8 h-8 text-slate-600 mx-auto" />
          <p className="text-xs font-medium text-slate-400">No activity logged yet</p>
          <p className="text-[11px] text-slate-500 max-w-xs mx-auto">
            Mutations, reassignments, and status transitions for this work item will appear here.
          </p>
        </div>
      ) : (
        <div className="relative pl-6 space-y-5 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-800">
          {auditLogs.map((log) => {
            const actionBadge =
              log.action === 'create'
                ? { bg: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30', label: 'Created' }
                : log.action === 'delete'
                ? { bg: 'bg-red-500/20 text-red-400 border-red-500/30', label: 'Deleted' }
                : log.action === 'restore'
                ? { bg: 'bg-purple-500/20 text-purple-400 border-purple-500/30', label: 'Restored' }
                : { bg: 'bg-sky-500/20 text-sky-400 border-sky-500/30', label: 'Updated' };

            const changedKeys = Object.keys(log.changed_fields || {});

            return (
              <div key={log.id} className="relative">
                {/* Timeline dot */}
                <div className="absolute -left-6 top-1.5 w-2.5 h-2.5 rounded-full bg-slate-900 border-2 border-emerald-500" />

                <div className="p-3.5 rounded-xl bg-slate-950/70 border border-slate-800/80 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-xs font-semibold text-white">{log.actor_name || 'User'}</span>
                      <span className={`px-2 py-0.5 text-[10px] font-semibold rounded-md border ${actionBadge.bg}`}>
                        {actionBadge.label}
                      </span>
                    </div>
                    <span className="text-[10px] text-slate-500 font-mono">
                      {new Date(log.created_at).toLocaleString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>

                  {/* Field diffs */}
                  {changedKeys.length > 0 && (
                    <div className="space-y-1.5 pt-1 border-t border-slate-900">
                      {changedKeys.map((key) => {
                        const diff = log.changed_fields[key];
                        if (!diff) return null;

                        if (key === 'status') {
                          const beforeDef = effectiveProjectSettings.statuses?.find((s) => s.id === diff.before);
                          const afterDef = effectiveProjectSettings.statuses?.find((s) => s.id === diff.after);
                          return (
                            <div key={key} className="flex items-center space-x-2 text-xs">
                              <span className="text-slate-500 capitalize">Status:</span>
                              <span
                                className="px-2 py-0.5 rounded text-[11px] font-medium"
                                style={{
                                  backgroundColor: `${beforeDef?.color || '#64748b'}25`,
                                  color: beforeDef?.color || '#cbd5e1',
                                }}
                              >
                                {beforeDef?.label || diff.before || 'None'}
                              </span>
                              <ArrowRight className="w-3 h-3 text-slate-600" />
                              <span
                                className="px-2 py-0.5 rounded text-[11px] font-medium"
                                style={{
                                  backgroundColor: `${afterDef?.color || '#10b981'}25`,
                                  color: afterDef?.color || '#10b981',
                                }}
                              >
                                {afterDef?.label || diff.after}
                              </span>
                            </div>
                          );
                        }

                        if (key === 'assignee') {
                          return (
                            <div key={key} className="flex items-center space-x-2 text-xs text-slate-300">
                              <span className="text-slate-500">Assignee:</span>
                              <span className="font-mono text-slate-400">{diff.before || 'Unassigned'}</span>
                              <ArrowRight className="w-3 h-3 text-slate-600" />
                              <span className="font-mono text-emerald-400 font-semibold">{diff.after || 'Unassigned'}</span>
                            </div>
                          );
                        }

                        if (key === 'title') {
                          return (
                            <div key={key} className="text-xs text-slate-300">
                              <span className="text-slate-500">Title:</span>{' '}
                              <span className="line-through text-slate-500 mr-2">{String(diff.before || '')}</span>
                              <span className="text-white">{String(diff.after || '')}</span>
                            </div>
                          );
                        }

                        return (
                          <div key={key} className="flex items-center space-x-2 text-xs text-slate-400">
                            <span className="capitalize">{key.replace(/_/g, ' ')}:</span>
                            <span className="text-slate-300 truncate max-w-[240px]">
                              {typeof diff.after === 'object' ? JSON.stringify(diff.after) : String(diff.after ?? '')}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
