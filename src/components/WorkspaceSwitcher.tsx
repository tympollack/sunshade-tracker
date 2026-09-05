'use client';

import { useState, useRef, useEffect } from 'react';
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
  const ref = useRef<HTMLDivElement>(null);

  const current = workspaces.find((w) => w.slug === currentTenantSlug) ?? workspaces[0];

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

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
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className={`flex items-center space-x-2 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors ${
          open
            ? 'bg-slate-800 border-slate-700 text-white'
            : 'bg-slate-900 border-slate-800 text-slate-200 hover:border-slate-700'
        }`}
      >
        <div className="w-5 h-5 rounded bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 text-[10px] font-bold flex-shrink-0">
          {initials}
        </div>
        <span className="max-w-[100px] truncate">{current?.name ?? '—'}</span>
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

      {open && (
        <div className="absolute left-0 top-full mt-2 w-72 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/50 z-50 overflow-hidden">
          <div className="px-3 py-2 border-b border-slate-800">
            <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Your Workspaces
            </p>
          </div>

          <div className="p-1.5 space-y-0.5 max-h-72 overflow-y-auto">
            {workspaces.map((workspace) => {
              const isActive = workspace.slug === currentTenantSlug;
              return (
                <button
                  key={workspace.id}
                  onClick={() => handleSwitch(workspace)}
                  className={`w-full flex items-center space-x-3 px-3 py-2.5 rounded-lg text-left transition-colors ${
                    isActive
                      ? 'bg-emerald-500/10 border border-emerald-500/20 text-white'
                      : 'text-slate-300 hover:bg-slate-800 hover:text-white'
                  }`}
                >
                  {/* Workspace avatar */}
                  <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center text-slate-300 text-xs font-bold flex-shrink-0">
                    {workspace.name.split(' ').slice(0, 2).map((w) => w[0]).join('').toUpperCase()}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-1.5">
                      <span className="text-xs font-semibold truncate">{workspace.name}</span>
                      {isActive && <Check className="w-3 h-3 text-emerald-400 flex-shrink-0" />}
                    </div>
                    <div className="flex items-center space-x-1.5 mt-0.5">
                      <span className="text-[10px] text-slate-500 font-mono">@{workspace.slug}</span>
                      <span className="text-slate-700">·</span>
                      <span className="flex items-center space-x-0.5 text-[10px] text-slate-500">
                        {ROLE_ICON[workspace.role]}
                        <span>{ROLE_LABEL[workspace.role] ?? workspace.role}</span>
                      </span>
                      <span className="text-slate-700">·</span>
                      <span className="text-[10px] text-slate-500">
                        {workspace.projects.length} project{workspace.projects.length !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  <span
                    className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border flex-shrink-0 ${
                      TIER_BADGE[workspace.tier] ?? TIER_BADGE.free
                    }`}
                  >
                    {workspace.tier}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="px-1.5 pb-1.5 border-t border-slate-800 mt-1">
            <button
              onClick={() => {
                setOpen(false);
                router.push('/onboarding');
              }}
              className="w-full flex items-center space-x-2 px-3 py-2 rounded-lg text-xs text-slate-500 hover:bg-slate-800 hover:text-slate-300 transition-colors mt-1"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Create New Workspace…</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
