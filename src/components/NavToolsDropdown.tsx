'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Cpu, Settings, ChevronDown, Wrench } from 'lucide-react';
import { DashboardTab } from '@/components/rev_trk_02';

interface NavToolsDropdownProps {
  activeTab: DashboardTab;
  onSelectTab: (tab: DashboardTab) => void;
}

export function NavToolsDropdown({ activeTab, onSelectTab }: NavToolsDropdownProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(() => typeof document !== 'undefined');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      // Position below the button, ensure it doesn't overflow right edge
      const menuWidth = 240;
      let left = rect.left;
      if (typeof window !== 'undefined' && left + menuWidth > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - menuWidth - 12);
      }
      setCoords({
        top: rect.bottom + 6,
        left: Math.max(8, left),
      });
    }
  };

  useEffect(() => {
    if (!open) return;
    updatePosition();
    const handleScrollResize = () => updatePosition();
    window.addEventListener('resize', handleScrollResize);
    window.addEventListener('scroll', handleScrollResize, true);
    return () => {
      window.removeEventListener('resize', handleScrollResize);
      window.removeEventListener('scroll', handleScrollResize, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      const target = e.target as Node;
      if (
        triggerRef.current && !triggerRef.current.contains(target) &&
        menuRef.current && !menuRef.current.contains(target)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const toggleOpen = () => {
    if (!open) updatePosition();
    setOpen((o) => !o);
  };

  const isToolActive = activeTab === 'spark' || activeTab === 'schema';

  return (
    <div className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        onClick={toggleOpen}
        data-testid="nav-tools-dropdown-trigger"
        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-md font-medium text-xs transition-colors shrink-0 cursor-pointer ${
          isToolActive
            ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
            : open
            ? 'bg-slate-800 text-white'
            : 'text-slate-400 hover:text-white'
        }`}
        title="Workspace Tools"
      >
        <Wrench className="w-3.5 h-3.5" />
        <span>Tools</span>
        <ChevronDown
          className={`w-3 h-3 text-slate-400 transition-transform flex-shrink-0 ${open ? 'rotate-180' : ''}`}
        />
      </button>

      {open && mounted && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords ? `${coords.top}px` : undefined,
            left: coords ? `${coords.left}px` : undefined,
          }}
          className="w-60 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/80 z-[100] p-1.5 animate-in fade-in zoom-in-95 duration-100"
          data-testid="nav-tools-dropdown-menu"
        >
          <div className="px-2.5 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-400 border-b border-slate-800/80 mb-1">
            Secondary Tools
          </div>

          <button
            type="button"
            onClick={() => {
              onSelectTab('spark');
              setOpen(false);
            }}
            className={`w-full flex items-center space-x-2.5 px-2.5 py-2 text-xs rounded-lg transition-colors cursor-pointer ${
              activeTab === 'spark'
                ? 'bg-emerald-500/15 text-emerald-300 font-medium'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
            data-testid="tool-item-spark"
          >
            <Cpu className="w-4 h-4 text-emerald-400 shrink-0" />
            <div className="flex flex-col text-left">
              <span className="font-medium text-slate-100">Gemini Spark</span>
              <span className="text-[10px] text-slate-400">AI backlog ingestion</span>
            </div>
          </button>

          <button
            type="button"
            onClick={() => {
              onSelectTab('schema');
              setOpen(false);
            }}
            className={`w-full flex items-center space-x-2.5 px-2.5 py-2 text-xs rounded-lg transition-colors cursor-pointer ${
              activeTab === 'schema'
                ? 'bg-sky-500/15 text-sky-300 font-medium'
                : 'text-slate-300 hover:bg-slate-800 hover:text-white'
            }`}
            data-testid="tool-item-schema"
          >
            <Settings className="w-4 h-4 text-sky-400 shrink-0" />
            <div className="flex flex-col text-left">
              <span className="font-medium text-slate-100">Dynamic Schema</span>
              <span className="text-[10px] text-slate-400">Field & schema settings</span>
            </div>
          </button>
        </div>,
        document.body
      )}
    </div>
  );
}
