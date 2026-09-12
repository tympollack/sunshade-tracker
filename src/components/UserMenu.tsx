'use client';

import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { LogOut, Settings, Key, ChevronDown, Copy, Check, User } from 'lucide-react';

interface UserMenuProps {
  tenantName: string;
  tenantSlug: string;
  userEmail?: string;
  apiKeyPreview?: string;
}

export function UserMenu({ tenantName, tenantSlug, userEmail, apiKeyPreview }: UserMenuProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [mounted, setMounted] = useState(() => typeof document !== 'undefined');
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [coords, setCoords] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const updatePosition = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setCoords({
        top: rect.bottom + 8,
        right: Math.max(8, window.innerWidth - rect.right),
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

  // Close on outside click
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

  const handleCopyPreview = () => {
    if (apiKeyPreview) {
      navigator.clipboard.writeText(apiKeyPreview);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    }
  };

  const handleSignOut = () => {
    router.push('/api/auth/logout');
  };

  const initials = tenantName
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
        data-testid="user-menu-trigger"
        className="flex items-center space-x-2 px-2 py-1.5 rounded-lg hover:bg-slate-800 transition-colors"
      >
        <div className="w-7 h-7 rounded-lg bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 text-xs font-bold">
          {initials}
        </div>
        <span className="text-xs font-medium text-slate-200 hidden sm:block max-w-[120px] truncate">
          {tenantName}
        </span>
        <ChevronDown className={`w-3.5 h-3.5 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && mounted && createPortal(
        <div
          ref={menuRef}
          style={{
            position: 'fixed',
            top: coords ? `${coords.top}px` : undefined,
            right: coords ? `${coords.right}px` : undefined,
          }}
          className="w-64 rounded-xl bg-slate-900 border border-slate-800 shadow-2xl shadow-black/50 z-[100] overflow-hidden animate-in fade-in zoom-in-95 duration-100"
          data-testid="user-menu-dropdown"
        >
          {/* User info header */}
          <div className="px-4 py-3 border-b border-slate-800 space-y-0.5">
            <p className="text-xs font-semibold text-white truncate">{tenantName}</p>
            {userEmail && (
              <p className="text-[11px] text-slate-500 truncate">{userEmail}</p>
            )}
            <span className="inline-flex items-center space-x-1 text-[10px] text-emerald-400 font-mono">
              <span>@{tenantSlug}</span>
            </span>
          </div>

          {/* API Key preview */}
          {apiKeyPreview && (
            <div className="px-4 py-3 border-b border-slate-800 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center space-x-1">
                  <Key className="w-3 h-3" />
                  <span>API Key</span>
                </span>
                <button
                  onClick={handleCopyPreview}
                  className="text-[10px] text-slate-500 hover:text-slate-300 flex items-center space-x-1"
                >
                  {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                  <span>{copied ? 'Copied' : 'Copy'}</span>
                </button>
              </div>
              <code className="text-[11px] font-mono text-amber-400/80 block truncate">
                {apiKeyPreview}
              </code>
            </div>
          )}

          {/* Actions */}
          <div className="p-1.5">
            <button
              onClick={() => {
                setOpen(false);
                router.push(`/${tenantSlug}/settings`);
              }}
              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
            >
              <Settings className="w-3.5 h-3.5 text-slate-500" />
              <span>Workspace Settings</span>
            </button>
            <button
              onClick={handleSignOut}
              className="w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs text-red-400 hover:bg-red-950/40 hover:text-red-300 transition-colors"
            >
              <LogOut className="w-3.5 h-3.5" />
              <span>Sign Out</span>
            </button>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
