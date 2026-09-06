'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plus, Folder, Settings, Layers } from 'lucide-react';

interface Project {
  id: string;
  slug: string;
  name: string;
}

interface ProjectSwitcherProps {
  tenantSlug: string;
  currentProjectSlug: string;
  projects: Project[];
}

export function ProjectSwitcher({
  tenantSlug,
  currentProjectSlug,
  projects,
}: ProjectSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const isAll = currentProjectSlug === 'all';
  const currentProject = isAll
    ? { id: 'all', slug: 'all', name: 'All Projects' }
    : projects.find((p) => p.slug === currentProjectSlug);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
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
        <span className="max-w-[120px] truncate">{currentProject?.name || currentProjectSlug}</span>
        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-2 w-56 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/50 z-50 overflow-hidden">
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
        </div>
      )}
    </div>
  );
}
