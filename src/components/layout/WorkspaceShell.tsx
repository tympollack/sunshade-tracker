'use client';

import React, { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';

export interface WorkspaceShellProps {
  header?: React.ReactNode;
  leftPane?: React.ReactNode;
  centerPane: React.ReactNode;
  rightPane?: React.ReactNode;
  isLeftCollapsed?: boolean;
  onToggleLeftCollapse?: () => void;
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
  isRightOpen = false,
  onCloseRight,
  className = '',
}: WorkspaceShellProps) {
  const [internalIsLeftCollapsed, setInternalIsLeftCollapsed] = useState(false);

  const isLeftCollapsed =
    externalIsLeftCollapsed !== undefined
      ? externalIsLeftCollapsed
      : internalIsLeftCollapsed;

  const handleToggleLeft = () => {
    if (externalOnToggleLeftCollapse) {
      externalOnToggleLeftCollapse();
    } else {
      setInternalIsLeftCollapsed((prev) => !prev);
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
      </div>
    </div>
  );
}
