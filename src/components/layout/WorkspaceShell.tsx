'use client';

import React, { useState, useEffect, useCallback } from 'react';
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

const DEFAULT_LHN_WIDTH = 280;
const MIN_LHN_WIDTH = 200;
const MAX_LHN_WIDTH = 560;
const MIN_CANVAS_WIDTH = 320;
const DESKTOP_INSPECTOR_WIDTH = 384;
const STORAGE_KEY_LHN_WIDTH = 'sunshade_lhn_width';

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
  // Initialize to DEFAULT_LHN_WIDTH to prevent SSR hydration mismatch; hydrate from localStorage on mount
  const [lhnWidth, setLhnWidth] = useState<number>(DEFAULT_LHN_WIDTH);
  const [isDraggingLhn, setIsDraggingLhn] = useState(false);

  // Dynamically clamp maximum sidebar width so canvas is never squeezed below MIN_CANVAS_WIDTH
  const getMaxLhnWidth = useCallback(() => {
    if (typeof window === 'undefined') return MAX_LHN_WIDTH;
    const windowWidth = window.innerWidth;
    const isDesktopInspectorDocked = isRightOpen && Boolean(rightPane) && windowWidth >= 1024;
    const reservedWidth = (isDesktopInspectorDocked ? DESKTOP_INSPECTOR_WIDTH : 0) + MIN_CANVAS_WIDTH;
    const available = windowWidth - reservedWidth;
    return Math.max(MIN_LHN_WIDTH, Math.min(MAX_LHN_WIDTH, available));
  }, [isRightOpen, rightPane]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_LHN_WIDTH);
      if (saved) {
        const parsed = parseInt(saved, 10);
        const maxAllowed = getMaxLhnWidth();
        if (!isNaN(parsed) && parsed >= MIN_LHN_WIDTH) {
          setLhnWidth(Math.min(maxAllowed, parsed));
        }
      }
    } catch {}
  }, [getMaxLhnWidth]);

  // Re-clamp effective width when window or inspector state changes
  useEffect(() => {
    const handleResize = () => {
      const maxAllowed = getMaxLhnWidth();
      setLhnWidth((prev) => (prev > maxAllowed ? maxAllowed : prev));
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [getMaxLhnWidth]);

  useEffect(() => {
    if (!isDraggingLhn) return;

    const handlePointerMove = (e: MouseEvent | PointerEvent) => {
      const clientX =
        typeof e.clientX === 'number' && !isNaN(e.clientX)
          ? e.clientX
          : (e as any).touches?.[0]?.clientX;
      if (typeof clientX !== 'number' || isNaN(clientX)) return;

      const maxAllowed = getMaxLhnWidth();
      const clamped = Math.min(maxAllowed, Math.max(MIN_LHN_WIDTH, clientX));
      setLhnWidth(clamped);
    };

    const handlePointerUp = (e: MouseEvent | PointerEvent) => {
      const clientX =
        typeof e.clientX === 'number' && !isNaN(e.clientX)
          ? e.clientX
          : (e as any).touches?.[0]?.clientX;
      if (typeof clientX === 'number' && !isNaN(clientX)) {
        const maxAllowed = getMaxLhnWidth();
        const finalWidth = Math.min(maxAllowed, Math.max(MIN_LHN_WIDTH, clientX));
        setLhnWidth(finalWidth);
        try {
          localStorage.setItem(STORAGE_KEY_LHN_WIDTH, String(finalWidth));
        } catch {}
      }
      setIsDraggingLhn(false);
    };

    document.body.classList.add('select-none');
    document.body.style.cursor = 'col-resize';

    window.addEventListener('mousemove', handlePointerMove);
    window.addEventListener('mouseup', handlePointerUp);
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      document.body.classList.remove('select-none');
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', handlePointerMove);
      window.removeEventListener('mouseup', handlePointerUp);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [isDraggingLhn, getMaxLhnWidth]);

  const startDragging = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault();
    setIsDraggingLhn(true);
  };

  const handleSplitterKeyDown = (e: React.KeyboardEvent) => {
    const maxAllowed = getMaxLhnWidth();
    if (e.key === 'ArrowLeft') {
      e.preventDefault();
      const newWidth = Math.max(MIN_LHN_WIDTH, lhnWidth - 10);
      setLhnWidth(newWidth);
      try {
        localStorage.setItem(STORAGE_KEY_LHN_WIDTH, String(newWidth));
      } catch {}
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      const newWidth = Math.min(maxAllowed, lhnWidth + 10);
      setLhnWidth(newWidth);
      try {
        localStorage.setItem(STORAGE_KEY_LHN_WIDTH, String(newWidth));
      } catch {}
    }
  };

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
            style={{ width: isLeftCollapsed ? 56 : lhnWidth }}
            className={`hidden md:flex flex-col border-r border-slate-800 bg-slate-950/70 shrink-0 overflow-hidden relative ${
              isDraggingLhn ? 'transition-none select-none' : 'transition-[width] duration-200 ease-in-out'
            } ${isLeftCollapsed ? 'w-14' : ''}`}
          >
            {/* Collapse / Expand rail toggle bar */}
            <div
              className={`flex items-center ${
                isLeftCollapsed ? 'justify-center' : 'justify-end'
              } px-2 py-1.5 border-b border-slate-800/60 bg-slate-900/40 shrink-0`}
            >
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

            {/* Interactive Resizable Splitter Handle */}
            {!isLeftCollapsed && (
              <div
                role="separator"
                aria-orientation="vertical"
                aria-valuenow={lhnWidth}
                aria-valuemin={MIN_LHN_WIDTH}
                aria-valuemax={MAX_LHN_WIDTH}
                aria-label="Resize Left Navigation"
                tabIndex={0}
                data-testid="workspace-lhn-splitter"
                onPointerDown={startDragging}
                onMouseDown={startDragging}
                onKeyDown={handleSplitterKeyDown}
                className={`absolute top-0 right-0 w-1.5 h-full cursor-col-resize z-30 transition-colors group touch-none ${
                  isDraggingLhn ? 'bg-emerald-500' : 'hover:bg-emerald-500/50'
                }`}
                title="Drag to resize sidebar width"
              >
                <div
                  className={`w-0.5 h-full mx-auto transition-colors ${
                    isDraggingLhn ? 'bg-emerald-400' : 'group-hover:bg-emerald-400/80'
                  }`}
                />
              </div>
            )}
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
            {/* Desktop wide-screen docked pane (>= 1024px / lg) - non-blocking inline pinned pane */}
            <aside
              data-testid="workspace-rhn-docked"
              className="hidden lg:flex w-96 shrink-0 border-l border-slate-800 bg-slate-900/90 backdrop-blur-md flex-col overflow-hidden relative z-20"
            >
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col">
                {rightPane}
              </div>
            </aside>

            {/* Mobile / Tablet slide-over overlay (< 1024px / lg) with isolated pointer events */}
            <div
              data-testid="workspace-rhn-overlay"
              className="lg:hidden fixed inset-y-0 right-0 z-40 w-full sm:w-[420px] max-w-full bg-slate-900/95 border-l border-slate-800 shadow-2xl backdrop-blur-md flex flex-col overflow-hidden top-14 pointer-events-auto"
            >
              <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar flex flex-col">
                {rightPane}
              </div>
            </div>

            {/* Backdrop: hidden on desktop & tablet (>= 768px / md), rendered only for mobile (< 768px) */}
            <div
              data-testid="workspace-rhn-backdrop"
              onClick={onCloseRight}
              className="md:hidden fixed inset-0 z-30 bg-black/60 backdrop-blur-xs top-14"
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
