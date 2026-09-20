'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Kanban, GitFork, Calendar, Wrench, Cpu, Settings, X } from 'lucide-react';
import { DashboardTab } from '@/components/rev_trk_02';
import { PointModeSwitcher } from '@/components/PointModeSwitcher';

export interface MobileBottomNavProps {
  activeTab: DashboardTab;
  onTabChange: (tab: DashboardTab) => void;
  pointMode?: 'macro' | 'granular';
  onPointModeChange?: (mode: 'macro' | 'granular') => void;
}

export function MobileBottomNav({
  activeTab,
  onTabChange,
  pointMode,
  onPointModeChange,
}: MobileBottomNavProps) {
  const [toolsOpen, setToolsOpen] = useState(false);
  const toolsButtonRef = useRef<HTMLButtonElement>(null);
  const toolsMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!toolsOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        toolsButtonRef.current && !toolsButtonRef.current.contains(target) &&
        toolsMenuRef.current && !toolsMenuRef.current.contains(target)
      ) {
        setToolsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [toolsOpen]);

  const primaryTabs = [
    { id: 'board' as const, label: 'Kanban', icon: Kanban },
    { id: 'tree' as const, label: 'Hierarchy', icon: GitFork },
    { id: 'sprint' as const, label: 'Sprint', icon: Calendar },
  ];

  const isToolsActive = activeTab === 'spark' || activeTab === 'schema';

  return (
    <>
      {toolsOpen && (
        <div
          ref={toolsMenuRef}
          data-testid="mobile-tools-menu"
          className="md:hidden fixed bottom-16 right-2 sm:right-4 z-50 w-64 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/80 p-1.5 animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800/80 mb-1 flex items-center justify-between">
            <span>Workspace Tools</span>
            <button
              type="button"
              onClick={() => setToolsOpen(false)}
              className="text-slate-400 hover:text-white p-0.5 cursor-pointer"
              aria-label="Close tools menu"
            >
              <X className="w-3 h-3" />
            </button>
          </div>

          {/* Point Mode Switcher for Board & Hierarchy (FEAT-TRK-MOBILE-POINT-SWITCHER) */}
          {(activeTab === 'board' || activeTab === 'tree') && onPointModeChange && pointMode && (
            <div className="px-2 py-2 border-b border-slate-800/80 mb-1 bg-slate-950/60 rounded-lg" data-testid="mobile-point-mode-drawer-section">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center justify-between">
                <span>Point Mode</span>
                <span className="text-[9px] font-mono text-emerald-400">{pointMode === 'granular' ? 'Rollup' : 'Intrinsic'}</span>
              </div>
              <PointModeSwitcher
                mode={pointMode}
                onChange={(m) => {
                  onPointModeChange(m);
                  setToolsOpen(false);
                }}
                className="w-full flex"
              />
            </div>
          )}

          <button
            type="button"
            data-testid="mobile-nav-tool-spark"
            onClick={() => {
              onTabChange('spark');
              setToolsOpen(false);
            }}
            className={`w-full flex items-center space-x-2.5 px-2.5 py-2 text-xs rounded-lg transition-colors cursor-pointer ${
              activeTab === 'spark'
                ? 'bg-emerald-500/15 text-emerald-300 font-medium'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Cpu className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="flex flex-col text-left">
              <span className="font-medium text-slate-100">JSON Ingestion</span>
              <span className="text-[10px] text-slate-400">Backlog ingestion</span>
            </div>
          </button>

          <button
            type="button"
            data-testid="mobile-nav-tool-schema"
            onClick={() => {
              onTabChange('schema');
              setToolsOpen(false);
            }}
            className={`w-full flex items-center space-x-2.5 px-2.5 py-2 text-xs rounded-lg transition-colors cursor-pointer ${
              activeTab === 'schema'
                ? 'bg-sky-500/15 text-sky-300 font-medium'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
          >
            <Settings className="w-4 h-4 text-sky-400 shrink-0" />
            <div className="flex flex-col text-left">
              <span className="font-medium text-slate-100">Schema Reconciliation</span>
              <span className="text-[10px] text-slate-400">Align with tenant ontology</span>
            </div>
          </button>
        </div>
      )}

      <nav
        data-testid="mobile-bottom-nav"
        aria-label="Mobile Navigation"
        className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur-md border-t border-slate-800/90 flex items-center justify-around px-2 touch-manipulation select-none mobile-bottom-nav safe-area-bottom"
      >
        {primaryTabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setToolsOpen(false);
                onTabChange(tab.id);
              }}
              data-testid={`mobile-nav-${tab.id}`}
              className={`relative flex flex-col items-center justify-center flex-1 h-14 py-1 transition-colors cursor-pointer min-h-[44px] ${
                isActive
                  ? 'text-emerald-400 font-semibold'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              {isActive && (
                <span
                  data-testid={`mobile-nav-active-pill-${tab.id}`}
                  className="absolute top-0 w-8 h-0.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
                />
              )}
              <Icon className={`w-4 h-4 mb-0.5 ${isActive ? 'text-emerald-400' : 'text-slate-400'}`} />
              <span className="text-[10px] tracking-tight">{tab.label}</span>
            </button>
          );
        })}

        {/* Tools navigation button (BUG_pr-review-job-65b9f5d04dd64440b8d4faeee1d229e0_0003) */}
        <button
          ref={toolsButtonRef}
          type="button"
          onClick={() => setToolsOpen((o) => !o)}
          data-testid="mobile-nav-tools"
          aria-expanded={toolsOpen}
          className={`relative flex flex-col items-center justify-center flex-1 h-14 py-1 transition-colors cursor-pointer min-h-[44px] ${
            isToolsActive || toolsOpen
              ? 'text-emerald-400 font-semibold'
              : 'text-slate-400 hover:text-slate-200'
          }`}
        >
          {isToolsActive && (
            <span
              data-testid="mobile-nav-active-pill-tools"
              className="absolute top-0 w-8 h-0.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]"
            />
          )}
          <Wrench className={`w-4 h-4 mb-0.5 ${isToolsActive || toolsOpen ? 'text-emerald-400' : 'text-slate-400'}`} />
          <span className="text-[10px] tracking-tight">Tools</span>
        </button>
      </nav>
    </>
  );
}

