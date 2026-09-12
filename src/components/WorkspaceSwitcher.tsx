'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { ChevronDown, Building2, Plus, Crown, Shield, User as UserIcon, Check } from 'lucide-react';

interface Workspace {
  id: string;
  slug: string;
  name: string;
  tier: string;
  role: string;
  projects: { id: string; slug: string; name: string }[];
}

interface WorkspaceSwitcherProps {
  currentTenantSlug: string;
  workspaces: Workspace[];
}

const ROLE_ICON: Record<string, React.ReactNode> = {
  owner: <Crown className="w-3 h-3 text-amber-400" />,
  admin: <Shield className="w-3 h-3 text-sky-400" />,
  member: <UserIcon className="w-3 h-3 text-slate-400" />,
};

const ROLE_LABEL: Record<string, string> = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

const TIER_BADGE: Record<string, string> = {
  enterprise: 'bg-amber-500/20 text-amber-300 border-amber-500/30',
  pro: 'bg-sky-500/20 text-sky-300 border-sky-500/30',
  free: 'bg-slate-800 text-slate-500 border-slate-700',
};

export function WorkspaceSwitcher({ currentTenantSlug, workspaces }: WorkspaceSwitcherProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(() => typeof document !== 'undefined');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);

  const current = workspaces.find((w) => w.slug === currentTenantSlug) ?? workspaces[0];

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 8,
        left: Math.max(8, rect.left),
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

  const handleSwitch = (workspace: Workspace) => {
    setOpen(false);
    // Navigate to the first project of the target workspace
    const firstProject = workspace.projects[0];
    if (firstProject) {
      router.push(`/${workspace.slug}/${firstProject.slug}`);
    } else {
      router.push(`/${workspace.slug}`);
    }
  };

  const initials = (current?.name ?? '?')
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        onClick={toggleOpen}
        className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          open
            ? 'bg-slate-800 border-slate-700 text-white'
            : 'bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-700'
        }`}
      >
        <div className="w-5 h-5 rounded bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-[10px] font-bold flex-shrink-0">
          {initials}
        </div>
        <span className="max-w-[140px] truncate">{current?.name ?? '—'}</span>
        {current && (
          <span
            className={`hidden sm:inline-flex text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${
              TIER_BADGE[current.tier] ?? TIER_BADGE.free
            }`}
          >
            {current.tier}
          </span>
        )}
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
          className="w-88 sm:w-96 min-w-[340px] rounded-xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/60 z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-100"
          data-testid="workspace-switcher-dropdown"
        >
          <div className="px-3.5 py-2.5 border-b border-slate-800 flex items-center justify-between">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              Your Workspaces
            </p>
            <span className="text-[10px] font-mono text-slate-500">
              {workspaces.length} total
            </span>
          </div>

          <div className="p-1.5 space-y-1 max-h-80 overflow-y-auto">
            {workspaces.map((workspace) => {
              const isActive = workspace.slug === currentTenantSlug;
              return (
                <button
                  key={workspace.id}
                  onClick={() => handleSwitch(workspace)}
                  className={`w-full flex items-start space-x-3 px-3.5 py-2.5 rounded-lg text-left transition-colors ${
                    isActive
                      ? 'bg-emerald-500/10 border border-emerald-500/25 text-white'
                      : 'text-slate-300 hover:bg-slate-800/80 hover:text-white border border-transparent'
                  }`}
                >
                  {/* Workspace avatar */}
                  <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700/80 flex items-center justify-center text-slate-200 text-xs font-bold flex-shrink-0 mt-0.5">
                    {workspace.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-1.5 min-w-0">
                        <span className="text-xs font-semibold truncate text-slate-100">{workspace.name}</span>
                        {isActive && <Check className="w-3.5 h-3.5 text-emerald-400 flex-shrink-0" />}
                      </div>
                      <span
                        className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 ${
                          TIER_BADGE[workspace.tier] ?? TIER_BADGE.free
                        }`}
                      >
                        {workspace.tier}
                      </span>
                    </div>

                    <div className="flex items-center flex-wrap gap-x-2 gap-y-0.5 mt-1 text-[11px] text-slate-400">
                      <span className="font-mono text-slate-400">@{workspace.slug}</span>
                      <span className="text-slate-600">·</span>
                      <span className="flex items-center space-x-1 text-slate-400">
                        {ROLE_ICON[workspace.role]}
                        <span>{ROLE_LABEL[workspace.role] ?? workspace.role}</span>
                      </span>
                      <span className="text-slate-600">·</span>
                      <span className="text-slate-400">
                        {workspace.projects.length} project{workspace.projects.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="px-2 py-1.5 border-t border-slate-800 bg-slate-950/40">
            <button
              onClick={() => {
                setOpen(false);
                router.push('/onboarding?new=true');
              }}
              className="w-full flex items-center justify-center space-x-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
            >
              <Plus className="w-3.5 h-3.5 text-emerald-400" />
              <span>Create New Workspace…</span>
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
