'use client';

import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronDown, Plus, Folder, Settings, Layers, Archive, Search } from 'lucide-react';

function useSafeRouter() {
  try {
    return useRouter();
  } catch {
    return null;
  }
}

interface Project {
  id: string;
  slug: string;
  name: string;
}

export interface ProjectSwitcherProps {
  tenantSlug: string;
  currentProjectSlug: string;
  projects: Project[];
  onArchiveCurrentProject?: () => void;
  isReadOnly?: boolean;
  /**
   * On mobile/tablet viewports (<1024px / lg), hide text label on scroll
   * to condense breadcrumb to icon while keeping desktop label visible.
   */
  isScrolled?: boolean;
  fullWidth?: boolean;
  variant?: 'default' | 'compact';
}

export function ProjectSwitcher({
  tenantSlug,
  currentProjectSlug,
  projects,
  onArchiveCurrentProject,
  isReadOnly = false,
  isScrolled = false,
  fullWidth = false,
  variant = 'default',
}: ProjectSwitcherProps) {
  const router = useSafeRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(() => typeof document !== 'undefined');
  const [searchQuery, setSearchQuery] = useState('');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const activeItemRef = useRef<HTMLAnchorElement>(null);
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

  const query = searchQuery.trim().toLowerCase();
  const filteredProjects = useMemo(() => {
    if (!query) return projects;
    return projects.filter(
      (p) =>
        p.name.toLowerCase().includes(query) ||
        p.slug.toLowerCase().includes(query)
    );
  }, [projects, query]);

  const showAllOption = !query || 'all projects (overview)'.toLowerCase().includes(query);

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

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
    } else if (projects.length > 8) {
      const timer = setTimeout(() => {
        searchInputRef.current?.focus();
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [open, projects.length]);

  useEffect(() => {
    if (!open) return;
    const scrollActive = () => {
      if (activeItemRef.current?.scrollIntoView) {
        activeItemRef.current.scrollIntoView({ block: 'nearest' });
      }
    };
    scrollActive();
    const rafId = requestAnimationFrame(scrollActive);
    return () => cancelAnimationFrame(rafId);
  }, [open]);

  const handleSearchKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      let targetHref: string | null = null;
      if (showAllOption && query && ('all projects (overview)'.toLowerCase().startsWith(query) || query === 'all')) {
        targetHref = `/${tenantSlug}/all`;
      } else if (filteredProjects.length > 0) {
        targetHref = `/${tenantSlug}/${filteredProjects[0].slug}`;
      } else if (showAllOption) {
        targetHref = `/${tenantSlug}/all`;
      }

      if (targetHref) {
        setOpen(false);
        if (router) {
          router.push(targetHref);
        } else if (typeof window !== 'undefined') {
          try {
            window.location.href = targetHref;
          } catch {
            // Safe fallback for test environments
          }
        }
      }
    }
  };

  const toggleOpen = () => {
    if (!open) updatePosition();
    setOpen((o) => !o);
  };

  return (
    <div className={`relative min-w-0 ${fullWidth ? 'w-full' : 'shrink'}`}>
      <button
        ref={triggerRef}
        onClick={toggleOpen}
        data-testid="project-switcher-trigger"
        className={
          variant === 'compact'
            ? `flex items-center space-x-1 py-1 px-1.5 rounded-md text-xs font-medium transition-colors min-w-0 hover:bg-slate-800 text-slate-300 hover:text-white ${
                open ? 'bg-slate-800 text-white' : ''
              }`
            : fullWidth
            ? `flex items-center justify-between w-full px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors min-w-0 ${
                open
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-700'
              }`
            : `flex items-center space-x-1 sm:space-x-1.5 px-2 sm:px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors min-w-0 max-w-full ${
                open
                  ? 'bg-slate-800 border-slate-700 text-white'
                  : 'bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-700'
              }`
        }
      >
        <div className="flex items-center space-x-1.5 min-w-0 overflow-hidden">
          {variant !== 'compact' && (
            isAll ? (
              <Layers className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
            )
          )}
          <span
            className={
              variant === 'compact'
                ? 'truncate shrink min-w-0 text-slate-200 font-medium max-w-[90px] sm:max-w-[120px]'
                : fullWidth
                ? 'truncate shrink min-w-0 text-slate-200 font-medium'
                : 'max-w-[50px] sm:max-w-[75px] lg:max-w-[95px] xl:max-w-[130px] truncate shrink min-w-0 transition-all duration-200'
            }
          >
            {currentProject?.name || currentProjectSlug}
          </span>
        </div>
        <ChevronDown className={`w-3 h-3 text-slate-400 transition-transform shrink-0 ml-1 ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && mounted && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords ? `${coords.top}px` : undefined,
            left: coords ? `${coords.left}px` : undefined,
          }}
          className="w-64 max-w-[calc(100vw-24px)] max-h-[calc(100dvh-6rem)] flex flex-col rounded-xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/50 z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-100"
          data-testid="project-switcher-dropdown"
        >
          {/* Pinned Section Header */}
          <div className="shrink-0 sticky top-0 z-10 bg-slate-950/95 backdrop-blur border-b border-slate-800/80 px-3 py-2 space-y-1.5">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                Projects in @{tenantSlug}
              </p>
              {projects.length > 8 && (
                <span className="text-[10px] text-slate-500 font-mono" data-testid="project-switcher-count">
                  {filteredProjects.length}/{projects.length}
                </span>
              )}
            </div>

            {projects.length > 8 && (
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={handleSearchKeyDown}
                  placeholder="Search projects..."
                  autoFocus
                  data-testid="project-switcher-search"
                  aria-label="Search projects"
                  className="w-full bg-slate-900/90 border border-slate-800 rounded-md pl-7 pr-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-slate-700 focus:ring-1 focus:ring-slate-700 transition-colors"
                />
              </div>
            )}
          </div>

          {/* Scrollable Project List */}
          <div
            className="flex-1 overflow-y-auto overscroll-contain px-1.5 py-1 space-y-0.5 custom-scrollbar"
            data-testid="project-switcher-list"
          >
            {/* All Projects Overview option */}
            {showAllOption && (
              <Link
                ref={isAll ? activeItemRef : undefined}
                href={`/${tenantSlug}/all`}
                data-testid="project-switcher-item-all"
                onClick={(e) => {
                  if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button !== 1) {
                    setOpen(false);
                  }
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
              </Link>
            )}

            {filteredProjects.map((project) => (
              <Link
                key={project.id}
                ref={project.slug === currentProjectSlug ? activeItemRef : undefined}
                href={`/${tenantSlug}/${project.slug}`}
                data-testid={`project-switcher-item-${project.slug}`}
                onClick={(e) => {
                  if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button !== 1) {
                    setOpen(false);
                  }
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
              </Link>
            ))}

            {filteredProjects.length === 0 && !showAllOption && (
              <div className="py-6 text-center text-xs text-slate-500" data-testid="project-switcher-no-results">
                No matching projects
              </div>
            )}
          </div>

          {/* Footer Actions */}
          <div className="shrink-0 px-1.5 pb-1.5 border-t border-slate-800 mt-auto pt-1 space-y-0.5 bg-slate-900">
            {!isAll && (
              <>
                <Link
                  href={`/${tenantSlug}/${currentProjectSlug}?tab=schema`}
                  onClick={(e) => {
                    if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button !== 1) {
                      setOpen(false);
                    }
                  }}
                  className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs text-slate-400 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  <Settings className="w-3.5 h-3.5 text-slate-500" />
                  <span>Project Schema Settings</span>
                </Link>
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
            <Link
              href={`/${tenantSlug}/settings`}
              onClick={(e) => {
                if (!e.ctrlKey && !e.metaKey && !e.shiftKey && e.button !== 1) {
                  setOpen(false);
                }
              }}
              className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Workspace Settings…</span>
            </Link>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
