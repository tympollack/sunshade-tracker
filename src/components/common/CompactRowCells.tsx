'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Check, User } from 'lucide-react';
import { StatusDefinition } from '@/types/tracker';

export interface RowMemberOption {
  id: string;
  name: string;
}

export interface CompactAssigneeCellProps {
  itemId: string;
  assignee?: string | null;
  members?: RowMemberOption[];
  onUpdateAssignee?: (itemId: string, newAssignee: string | null) => Promise<void> | void;
  disabled?: boolean;
  testId?: string;
  popoverTestId?: string;
  className?: string;
}

export interface CompactStatusCellProps {
  itemId: string;
  status: string;
  statuses?: StatusDefinition[];
  statusColor?: string | null;
  onUpdateStatus?: (itemId: string, newStatus: string) => Promise<void> | void;
  disabled?: boolean;
  hasDeviation?: boolean;
  testId?: string;
  popoverTestId?: string;
  className?: string;
}

function computePopoverCoords(
  triggerEl: HTMLElement | null,
  menuEl: HTMLElement | null,
  menuWidth: number,
  estimatedItemCount: number
): { top: number; left: number } {
  if (!triggerEl) return { top: 0, left: 0 };
  const rect = triggerEl.getBoundingClientRect();
  const windowWidth = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

  let left = rect.left;
  if (left + menuWidth > windowWidth - 12) {
    left = Math.max(12, windowWidth - menuWidth - 12);
  }

  const estimatedHeight =
    menuEl?.offsetHeight || Math.min(240, 36 + estimatedItemCount * 32 + 12);
  const spaceBelow = windowHeight - rect.bottom - 8;
  const spaceAbove = rect.top - 8;

  let top = rect.bottom + 4;
  if (spaceBelow < estimatedHeight && spaceAbove > spaceBelow) {
    top = Math.max(8, rect.top - estimatedHeight - 4);
  } else if (top + estimatedHeight > windowHeight - 8) {
    top = Math.max(8, windowHeight - estimatedHeight - 8);
  }

  return {
    top,
    left: Math.max(12, left),
  };
}

export function getStatusGlyph(
  status: string,
  statuses?: StatusDefinition[],
  fallbackColor?: string | null
) {
  const norm = (status || '').toLowerCase().trim();
  const matched = statuses?.find((s) => s.id === status || s.id.toLowerCase() === norm);
  const color = matched?.color || fallbackColor || undefined;
  const label = matched?.label || status || 'Not Started';

  const isCompleted =
    norm === 'complete' ||
    norm === 'completed' ||
    norm === 'done' ||
    Boolean(matched?.is_completed);

  const isInReview = norm === 'in_review' || norm === 'review';
  const isInProgress = norm === 'in_progress' || norm === 'started';

  let icon: React.ReactNode;
  if (isCompleted) {
    icon = <Check className="w-3 h-3" style={color ? { color } : undefined} />;
  } else if (isInReview) {
    icon = (
      <span
        className="w-2 h-2 rounded-full animate-pulse"
        style={{ backgroundColor: color || '#fbbf24' }}
      />
    );
  } else if (isInProgress) {
    icon = (
      <span
        className="w-2 h-2 rounded-full"
        style={{ backgroundColor: color || '#38bdf8' }}
      />
    );
  } else if (color) {
    icon = <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />;
  } else {
    icon = <span className="w-2 h-2 rounded-full border border-slate-500" />;
  }

  if (color) {
    return {
      bg: 'border',
      label,
      icon,
      style: {
        backgroundColor: `${color}20`,
        borderColor: `${color}60`,
        color,
      } as React.CSSProperties,
    };
  }

  if (isCompleted) {
    return {
      bg: 'bg-emerald-950 text-emerald-400 border-emerald-800',
      label,
      icon,
      style: undefined,
    };
  }
  if (isInReview) {
    return {
      bg: 'bg-amber-950 text-amber-300 border-amber-800',
      label,
      icon,
      style: undefined,
    };
  }
  if (isInProgress) {
    return {
      bg: 'bg-sky-950 text-sky-400 border-sky-800',
      label,
      icon,
      style: undefined,
    };
  }
  return {
    bg: 'bg-slate-900 text-slate-400 border-slate-700',
    label,
    icon,
    style: undefined,
  };
}

/**
 * Slim 22x22px circular assignee avatar button with portaled micro-popover selector.
 * Shared across Hierarchy Tree rows and Sprint/Table rows.
 */
export const CompactAssigneeCell: React.FC<CompactAssigneeCellProps> = ({
  itemId,
  assignee,
  members = [],
  onUpdateAssignee,
  disabled = false,
  testId,
  popoverTestId,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isInteractive = !disabled && Boolean(onUpdateAssignee);

  const updatePosition = useCallback(() => {
    setCoords(
      computePopoverCoords(triggerRef.current, menuRef.current, 180, (members?.length || 4) + 1)
    );
  }, [members]);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
      const target =
        menuRef.current?.querySelector<HTMLButtonElement>('[data-selected="true"]') ||
        menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]');
      target?.focus();
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const handleScrollResize = () => updatePosition();
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('resize', handleScrollResize);
    window.addEventListener('scroll', handleScrollResize, true);
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', handleScrollResize);
      window.removeEventListener('scroll', handleScrollResize, true);
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, updatePosition]);

  const trimmedAssignee = assignee?.trim() || '';
  const tooltipText = disabled
    ? `${trimmedAssignee || 'Unassigned'} (Locked)`
    : trimmedAssignee || 'Unassigned';

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!isInteractive) return;
          setIsOpen((prev) => !prev);
        }}
        title={tooltipText}
        aria-label={`Assignee: ${trimmedAssignee || 'Unassigned'}`}
        aria-haspopup={isInteractive ? 'menu' : undefined}
        aria-expanded={isInteractive ? isOpen : undefined}
        data-testid={testId || `assignee-avatar-btn-${itemId}`}
        className={`w-[22px] h-[22px] rounded-full shrink-0 inline-flex items-center justify-center font-semibold text-[10px] border transition-all ${
          disabled
            ? 'opacity-50 cursor-not-allowed bg-slate-900 border-slate-800 text-slate-500'
            : isInteractive
            ? 'cursor-pointer hover:border-slate-500'
            : 'cursor-default'
        } ${
          trimmedAssignee
            ? 'bg-slate-800 text-slate-200 border-slate-700'
            : 'bg-slate-900 text-slate-500 border-slate-800'
        } ${isOpen ? 'ring-2 ring-emerald-400/60' : ''} ${className}`}
      >
        {trimmedAssignee ? (
          <span>{trimmedAssignee.charAt(0).toUpperCase()}</span>
        ) : (
          <User className="w-3 h-3 text-slate-500" />
        )}
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            data-testid={popoverTestId || `assignee-popover-${itemId}`}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-50 bg-slate-900 border border-slate-800 rounded-lg p-1.5 shadow-2xl min-w-[180px] max-h-60 overflow-y-auto custom-scrollbar text-xs font-mono space-y-0.5 animate-in fade-in-0 zoom-in-95"
            style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
          >
            <div className="px-2 py-1 text-[10px] text-slate-500 font-sans font-semibold uppercase tracking-wider border-b border-slate-800 mb-1">
              Assign Member
            </div>
            <button
              type="button"
              role="menuitem"
              data-selected={!trimmedAssignee ? 'true' : 'false'}
              onClick={() => {
                onUpdateAssignee?.(itemId, null);
                setIsOpen(false);
                triggerRef.current?.focus();
              }}
              className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer ${
                !trimmedAssignee
                  ? 'bg-slate-800 text-white font-semibold'
                  : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
              }`}
              data-testid="assignee-option-unassigned"
            >
              <User className="w-3.5 h-3.5 text-slate-500" />
              <span className="truncate">Unassigned</span>
              {!trimmedAssignee && <Check className="w-3 h-3 ml-auto text-emerald-400" />}
            </button>
            {trimmedAssignee && !members.some((m) => m.name === trimmedAssignee) && (
              <button
                type="button"
                role="menuitem"
                data-selected="true"
                onClick={() => {
                  onUpdateAssignee?.(itemId, trimmedAssignee);
                  setIsOpen(false);
                  triggerRef.current?.focus();
                }}
                className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer bg-slate-800 text-white font-semibold"
              >
                <span className="w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[9px] font-bold flex items-center justify-center text-slate-300 shrink-0">
                  {trimmedAssignee.charAt(0).toUpperCase()}
                </span>
                <span className="truncate">{trimmedAssignee}</span>
                <Check className="w-3 h-3 ml-auto text-emerald-400" />
              </button>
            )}
            {members.map((m) => (
              <button
                key={m.id}
                type="button"
                role="menuitem"
                data-selected={trimmedAssignee === m.name ? 'true' : 'false'}
                onClick={() => {
                  onUpdateAssignee?.(itemId, m.name);
                  setIsOpen(false);
                  triggerRef.current?.focus();
                }}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer ${
                  trimmedAssignee === m.name
                    ? 'bg-slate-800 text-white font-semibold'
                    : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                }`}
                data-testid={`assignee-option-${m.id}`}
              >
                <span className="w-4 h-4 rounded-full bg-slate-800 border border-slate-700 text-[9px] font-bold flex items-center justify-center text-slate-300 shrink-0">
                  {m.name.charAt(0).toUpperCase()}
                </span>
                <span className="truncate">{m.name}</span>
                {trimmedAssignee === m.name && <Check className="w-3 h-3 ml-auto text-emerald-400" />}
              </button>
            ))}
          </div>,
          document.body
        )}
    </>
  );
};

/**
 * Slim 20x20px circular status glyph button with portaled micro-popover selector.
 * Shared across Hierarchy Tree rows and Sprint/Table rows.
 */
export const CompactStatusCell: React.FC<CompactStatusCellProps> = ({
  itemId,
  status,
  statuses = [],
  statusColor,
  onUpdateStatus,
  disabled = false,
  hasDeviation = false,
  testId,
  popoverTestId,
  className = '',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number }>({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const isInteractive = !disabled && Boolean(onUpdateStatus) && statuses.length > 0;

  const updatePosition = useCallback(() => {
    setCoords(
      computePopoverCoords(triggerRef.current, menuRef.current, 160, statuses.length || 4)
    );
  }, [statuses]);

  useLayoutEffect(() => {
    if (isOpen) {
      updatePosition();
      const target =
        menuRef.current?.querySelector<HTMLButtonElement>('[data-selected="true"]') ||
        menuRef.current?.querySelector<HTMLButtonElement>('button[role="menuitem"]');
      target?.focus();
    }
  }, [isOpen, updatePosition]);

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const handleScrollResize = () => updatePosition();
    const handleClickOutside = (e: MouseEvent) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(e.target as Node) &&
        triggerRef.current &&
        !triggerRef.current.contains(e.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        triggerRef.current?.focus();
      }
    };
    window.addEventListener('resize', handleScrollResize);
    window.addEventListener('scroll', handleScrollResize, true);
    window.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('resize', handleScrollResize);
      window.removeEventListener('scroll', handleScrollResize, true);
      window.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, updatePosition]);

  const glyph = getStatusGlyph(status, statuses, statusColor);
  const statusLabel = statuses.find((s) => s.id === status)?.label || glyph.label;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (!isInteractive) return;
          setIsOpen((prev) => !prev);
        }}
        style={glyph.style}
        title={disabled ? `${statusLabel} (Locked)` : `Status: ${statusLabel}`}
        aria-label={`Status: ${statusLabel}`}
        aria-haspopup={isInteractive ? 'menu' : undefined}
        aria-expanded={isInteractive ? isOpen : undefined}
        data-testid={testId || `status-icon-btn-${itemId}`}
        className={`w-5 h-5 rounded-full inline-flex items-center justify-center shrink-0 border transition-all ${
          glyph.bg
        } ${
          hasDeviation ? 'ring-1 ring-amber-500/70' : ''
        } ${
          disabled
            ? 'opacity-50 cursor-not-allowed'
            : isInteractive
            ? 'cursor-pointer hover:ring-2 hover:ring-slate-500/40'
            : 'cursor-default'
        } ${isOpen ? 'ring-2 ring-emerald-400/60' : ''} ${className}`}
      >
        {glyph.icon}
      </button>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            data-testid={popoverTestId || `status-popover-${itemId}`}
            onClick={(e) => e.stopPropagation()}
            className="fixed z-50 bg-slate-900 border border-slate-800 rounded-lg p-1.5 shadow-2xl min-w-[160px] max-h-60 overflow-y-auto custom-scrollbar text-xs font-mono space-y-0.5 animate-in fade-in-0 zoom-in-95"
            style={{ top: `${coords.top}px`, left: `${coords.left}px` }}
          >
            <div className="px-2 py-1 text-[10px] text-slate-500 font-sans font-semibold uppercase tracking-wider border-b border-slate-800 mb-1">
              Update Status
            </div>
            {statuses.map((st) => {
              const isSelected = status === st.id;
              return (
                <button
                  key={st.id}
                  type="button"
                  role="menuitem"
                  data-selected={isSelected ? 'true' : 'false'}
                  onClick={() => {
                    onUpdateStatus?.(itemId, st.id);
                    setIsOpen(false);
                    triggerRef.current?.focus();
                  }}
                  className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-left transition-colors cursor-pointer ${
                    isSelected
                      ? 'bg-slate-800 text-white font-semibold'
                      : 'text-slate-300 hover:bg-slate-800/60 hover:text-white'
                  }`}
                  data-testid={`status-option-${st.id}`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: st.color || '#94a3b8' }}
                  />
                  <span className="truncate">{st.label}</span>
                  {isSelected && <Check className="w-3 h-3 ml-auto text-emerald-400" />}
                </button>
              );
            })}
          </div>,
          document.body
        )}
    </>
  );
};
