'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plus, Folder, Settings, Layers, Archive } from 'lucide-react';

interface Project {
  id: string;
  slug: string;
  name: string;
}

interface ProjectSwitcherProps {
  tenantSlug: string;
  currentProjectSlug: string;
  projects: Project[];
  onArchiveCurrentProject?: () => void;
  isReadOnly?: boolean;
}

export function ProjectSwitcher({
  tenantSlug,
  currentProjectSlug,
  projects,
  onArchiveCurrentProject,
  isReadOnly = false,
}: ProjectSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(() => typeof document !== 'undefined');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const isPortfolio = currentProjectSlug === 'portfolio';
  const isAll =
    (currentProjectSlug === 'all' || currentProjectSlug === 'portfolio') &&
    !projects.some((p) => p.slug === currentProjectSlug);
  const currentProject = isAll
    ? {
        id: currentProjectSlug,
        slug: currentProjectSlug,
        name: isPortfolio ? 'Portfolio Overview' : 'All Projects',
      }
    : projects.find((p) => p.slug === currentProjectSlug);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const menuWidth = Math.min(256, typeof window !== 'undefined' ? window.innerWidth - 24 : 256);
      let left = rect.left;
      if (typeof window !== 'undefined' && left + menuWidth > window.innerWidth - 12) {
        left = Math.max(12, window.innerWidth - menuWidth - 12);
      }
      setCoords({
        top: rect.bottom + 8,
        left: Math.max(12, left),
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

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={toggleOpen}
        data-testid="project-switcher-trigger"
        className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          open
            ? 'bg-slate-800 border-slate-700 text-white'
            : 'bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-700'
        }`}
      >
        {isAll ? (
          <Layers className="w-3 h-3 text-emerald-400" />
        ) : (
          <Folder className="w-3 h-3 text-emerald-400" />
        )}
        <span className="max-w-[100px] truncate shrink min-w-0">{currentProject?.name || currentProjectSlug}</span>
        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && mounted && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords ? `${coords.top}px` : undefined,
            left: coords ? `${coords.left}px` : undefined,
          }}
          className="w-64 max-w-[calc(100vw-24px)] rounded-xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/50 z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-100"
          data-testid="project-switcher-dropdown"
        >
          <div className="px-3 py-2 border-b border-slate-800">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Projects in @{tenantSlug}
            </p>
          </div>

          <div className="p-1.5 space-y-0.5">
            {/* All Projects Overview option */}
            <button
              onClick={() => {
                setOpen(false);
                router.push(`/${tenantSlug}/all`);
              }}
              className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs text-left transition-colors ${
                isAll
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'text-slate-300 hover:bg-slate-800 hover:text-white'
              }`}
            >
              <Layers className={`w-3.5 h-3.5 flex-shrink-0 ${isAll ? 'text-emerald-400' : 'text-slate-500'}`} />
              <span className="truncate font-medium">All Projects (Overview)</span>
              {isAll && (
                <span className="ml-auto text-[10px] text-emerald-500 font-semibold">Active</span>
              )}
            </button>
            {projects.map((project) => (
              <button
                key={project.id}
                onClick={() => {
                  setOpen(false);
                  router.push(`/${tenantSlug}/${project.slug}`);
                }}
                className={`w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs text-left transition-colors ${
                  project.slug === currentProjectSlug
                    ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                    : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                }`}
              >
                <Folder className={`w-3.5 h-3.5 flex-shrink-0 ${project.slug === currentProjectSlug ? 'text-emerald-400' : 'text-slate-500'}`} />
                <span className="truncate font-medium">{project.name}</span>
                {project.slug === currentProjectSlug && (
                  <span className="ml-auto text-[10px] text-emerald-500 font-semibold">Active</span>
                )}
              </button>
            ))}
          </div>

          <div className="px-1.5 pb-1.5 border-t border-slate-800 mt-1 pt-1 space-y-0.5">
            {!isAll && (
              <>
                <button
                  onClick={() => {
                    setOpen(false);
                    router.push(`/${tenantSlug}/${currentProjectSlug}?tab=schema`);
                  }}
                  className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-500" />
                  <span>Project Schema Settings</span>
                </button>
                {!isReadOnly && onArchiveCurrentProject && (
                  <button
                    onClick={() => {
                      setOpen(false);
                      onArchiveCurrentProject();
                    }}
                    className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-red-500/10 hover:text-red-300 transition-colors"
                  >
                    <Archive className="w-3.5 h-3.5 text-red-400" />
                    <span>Archive Project…</span>
                  </button>
                )}
              </>
            )}
            <button
              onClick={() => {
                setOpen(false);
                router.push(`/${tenantSlug}/settings`);
              }}
              className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Workspace Settings…</span>
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
