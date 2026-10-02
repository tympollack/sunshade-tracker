'use client';

import React, { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, X } from 'lucide-react';

export interface WorkspaceShellProps {
  header?: React.ReactNode;
  leftPane?: React.ReactNode;
  centerPane: React.ReactNode;
  rightPane?: React.ReactNode;
  isLeftCollapsed?: boolean;
  onToggleLeftCollapse?: () => void;
  isMobileLeftOpen?: boolean;
  onToggleMobileLeft?: () => void;
  isRightOpen?: boolean;
  onCloseRight?: () => void;
  className?: string;
}

export function WorkspaceShell({
  header,
  leftPane,
  centerPane,
  rightPane,
  isLeftCollapsed: externalIsLeftCollapsed,
  onToggleLeftCollapse: externalOnToggleLeftCollapse,
  isMobileLeftOpen: externalIsMobileLeftOpen,
  onToggleMobileLeft: externalOnToggleMobileLeft,
  isRightOpen = false,
  onCloseRight,
  className = '',
}: WorkspaceShellProps) {
  const [internalIsLeftCollapsed, setInternalIsLeftCollapsed] = useState(false);
  const [internalIsMobileLeftOpen, setInternalIsMobileLeftOpen] = useState(false);

  const isLeftCollapsed =
    externalIsLeftCollapsed !== undefined
      ? externalIsLeftCollapsed
      : internalIsLeftCollapsed;

  const isMobileLeftOpen =
    externalIsMobileLeftOpen !== undefined
      ? externalIsMobileLeftOpen
      : internalIsMobileLeftOpen;

  const handleToggleLeft = () => {
    if (externalOnToggleLeftCollapse) {
      externalOnToggleLeftCollapse();
    } else {
      setInternalIsLeftCollapsed((prev) => !prev);
    }
  };

  const handleToggleMobileLeft = () => {
    if (externalOnToggleMobileLeft) {
      externalOnToggleMobileLeft();
    } else {
      setInternalIsMobileLeftOpen((prev) => !prev);
    }
  };

  return (
    <div
      data-testid="workspace-shell"
      className={`h-[100dvh] w-full flex flex-col overflow-hidden bg-[#090d16] text-slate-100 ${className}`}
    >
      {/* ── Top Header Bar (Fixed, shrink-0) ── */}
      {header && (
        <div data-testid="workspace-header" className="shrink-0 w-full z-30">
          {header}
        </div>
      )}

      {/* ── Three-Pane Body Row ── */}
      <div className="flex-1 min-h-0 w-full flex flex-row overflow-hidden relative">
        {/* ── Left Pane (LHN) ── */}
        {leftPane && (
          <aside
            data-testid="workspace-lhn"
            className={`hidden md:flex flex-col border-r border-slate-800 bg-slate-950/70 transition-all duration-200 ease-in-out shrink-0 overflow-hidden ${
              isLeftCollapsed ? 'w-14' : 'w-64'
            }`}
          >
            {/* Collapse / Expand rail toggle bar */}
            <div className="flex items-center justify-end px-2 py-1.5 border-b border-slate-800/60 bg-slate-900/40 shrink-0">
              <button
                type="button"
                onClick={handleToggleLeft}
                aria-label={isLeftCollapsed ? 'Expand navigation tree' : 'Collapse navigation tree'}
                className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
                title={isLeftCollapsed ? 'Expand sidebar' : 'Collapse to icon rail'}
              >
                {isLeftCollapsed ? (
                  <PanelLeftOpen className="w-4 h-4" />
                ) : (
                  <PanelLeftClose className="w-4 h-4" />
                )}
              </button>
            </div>

            {/* Scrollable Tree Container */}
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col">
              {leftPane}
            </div>
          </aside>
        )}

        {/* ── Middle Pane (Central Canvas) ── */}
        <main
          data-testid="workspace-canvas"
          className="flex-1 min-w-0 flex flex-col overflow-hidden relative"
        >
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col">
            {centerPane}
          </div>
        </main>

        {/* ── Right Pane (RHN Drawer) ── */}
        {isRightOpen && rightPane && (
          <>
            {/* Desktop wide-screen docked pane (>= 1440px / 2xl) */}
            <aside
              data-testid="workspace-rhn-docked"
              className="hidden 2xl:flex w-96 shrink-0 border-l border-slate-800 bg-slate-900/90 backdrop-blur-md flex-col overflow-hidden relative z-20"
            >
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col">
                {rightPane}
              </div>
            </aside>

            {/* Laptop / Tablet slide-over overlay (< 1440px) */}
            <div
              data-testid="workspace-rhn-overlay"
              className="2xl:hidden fixed inset-y-0 right-0 z-40 w-[420px] max-w-full bg-slate-900/95 border-l border-slate-800 shadow-2xl backdrop-blur-md flex flex-col overflow-hidden top-14"
            >
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col">
                {rightPane}
              </div>
            </div>

            {/* Backdrop for Laptop / Tablet slide-over */}
            <div
              data-testid="workspace-rhn-backdrop"
              onClick={onCloseRight}
              className="2xl:hidden fixed inset-0 z-30 bg-black/50 backdrop-blur-xs top-14"
              aria-hidden="true"
            />
          </>
        )}

        {/* Mobile Left Navigation Trigger (< md) */}
        {leftPane && (
          <button
            type="button"
            data-testid="workspace-lhn-mobile-trigger"
            onClick={handleToggleMobileLeft}
            className="md:hidden fixed bottom-4 left-4 z-30 flex items-center gap-1.5 px-3 py-2 rounded-full bg-slate-800/90 hover:bg-slate-700 text-slate-200 border border-slate-700/80 shadow-lg text-xs font-medium backdrop-blur-md transition-colors"
            aria-label="Toggle navigation drawer"
          >
            <PanelLeftOpen className="w-4 h-4 text-indigo-400" />
            <span>Navigation</span>
          </button>
        )}

        {/* Mobile Left Navigation Drawer (< md) */}
        {leftPane && isMobileLeftOpen && (
          <>
            <div
              data-testid="workspace-lhn-mobile-overlay"
              className="md:hidden fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] bg-slate-950 border-r border-slate-800 shadow-2xl flex flex-col overflow-hidden"
            >
              <div className="flex items-center justify-between px-3 py-2.5 border-b border-slate-800 bg-slate-900/50 shrink-0">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Navigation</span>
                <button
                  type="button"
                  onClick={handleToggleMobileLeft}
                  className="p-1 rounded text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors"
                  aria-label="Close navigation drawer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col">
                {leftPane}
              </div>
            </div>
            <div
              data-testid="workspace-lhn-mobile-backdrop"
              onClick={handleToggleMobileLeft}
              className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-xs"
              aria-hidden="true"
            />
          </>
        )}
      </div>
    </div>
  );
}
