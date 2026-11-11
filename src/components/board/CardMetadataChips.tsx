'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { isGitHubMetadataKey } from '@/lib/github-metadata';

export interface CardMetadataChipsProps {
  itemId: string;
  metadata?: Record<string, any>;
  className?: string;
}

const IGNORED_KEYS = new Set([
  'story_points',
  'points',
  'estimate',
  'cycle_time_days',
  'median_cycle_time',
  'flag',
  'flags',
  'in_progress_at',
  'wip_started_at',
  'started_at',
  'needs_review',
  'yield_amount',
  'sp_yield',
  'fee_amount',
]);

const PRIORITY_KEYS = ['sprint', 'sprint_name', 'sprint_id', 'priority', 'complexity', 'source_type'];

export function CardMetadataChips({
  itemId,
  metadata,
  className = '',
}: CardMetadataChipsProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null);
  const capsuleRef = useRef<HTMLSpanElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const entries = React.useMemo(() => {
    if (!metadata || typeof metadata !== 'object') return [];
    return Object.entries(metadata)
      .filter(([k, v]) => {
        if (IGNORED_KEYS.has(k.toLowerCase())) return false;
        if (isGitHubMetadataKey(k)) return false;
        if (v === undefined || v === null || v === '') return false;
        return true;
      })
      .sort(([a], [b]) => {
        const indexA = PRIORITY_KEYS.indexOf(a.toLowerCase());
        const indexB = PRIORITY_KEYS.indexOf(b.toLowerCase());
        if (indexA !== -1 && indexB !== -1) return indexA - indexB;
        if (indexA !== -1) return -1;
        if (indexB !== -1) return 1;
        return a.localeCompare(b);
      });
  }, [metadata]);

  const updatePosition = useCallback(() => {
    if (!capsuleRef.current) return;
    const rect = capsuleRef.current.getBoundingClientRect();
    const popoverWidth = 240;
    const popoverHeight = 160;

    let left = rect.left;
    if (left + popoverWidth > window.innerWidth - 12) {
      left = Math.max(12, window.innerWidth - popoverWidth - 12);
    }

    let top = rect.bottom + 6;
    if (top + popoverHeight > window.innerHeight - 12 && rect.top > popoverHeight + 12) {
      top = rect.top - popoverHeight - 6;
    }

    setCoords({ top, left });
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePosition();
      const handleScroll = () => updatePosition();
      const handleClickOutside = (e: MouseEvent) => {
        if (
          popoverRef.current &&
          !popoverRef.current.contains(e.target as Node) &&
          capsuleRef.current &&
          !capsuleRef.current.contains(e.target as Node)
        ) {
          setIsOpen(false);
        }
      };
      window.addEventListener('scroll', handleScroll, true);
      window.addEventListener('resize', handleScroll);
      document.addEventListener('mousedown', handleClickOutside);
      return () => {
        window.removeEventListener('scroll', handleScroll, true);
        window.removeEventListener('resize', handleScroll);
        document.removeEventListener('mousedown', handleClickOutside);
      };
    }
  }, [isOpen, updatePosition]);

  if (entries.length === 0) return null;

  const hasOverflow = entries.length > 2;
  const visibleEntries = hasOverflow ? entries.slice(0, 2) : entries;
  const remainingCount = entries.length - 2;

  const popoverContent = isOpen && coords && typeof document !== 'undefined' && (
    createPortal(
      <div
        ref={popoverRef}
        data-testid={`card-metadata-popover-${itemId}`}
        role="tooltip"
        style={{
          position: 'fixed',
          top: coords.top,
          left: coords.left,
          zIndex: 9999,
        }}
        className="w-60 max-w-[90vw] p-2.5 rounded-lg bg-slate-900 border border-slate-700 shadow-xl text-xs space-y-1.5 animate-in fade-in zoom-in-95 pointer-events-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="font-semibold text-[11px] text-slate-300 border-b border-slate-800 pb-1 mb-1.5 flex items-center justify-between">
          <span>Metadata Attributes</span>
          <span className="text-[10px] font-mono text-slate-500">{entries.length} tags</span>
        </div>
        <div className="space-y-1 max-h-48 overflow-y-auto custom-scrollbar">
          {entries.map(([k, v]) => {
            const rawVal = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
            return (
              <div key={k} className="flex items-center justify-between gap-2 text-[10px] font-mono">
                <span className="text-slate-400 truncate">{k}:</span>
                <span className="text-slate-200 font-semibold truncate max-w-[130px]" title={`${k}: ${rawVal}`}>
                  {rawVal}
                </span>
              </div>
            );
          })}
        </div>
      </div>,
      document.body
    )
  );

  return (
    <div
      data-testid={`card-metadata-chips-${itemId}`}
      className={`flex flex-wrap items-center gap-1.5 w-full min-w-0 overflow-hidden ${className}`}
    >
      {visibleEntries.map(([k, v]) => {
        const rawVal = typeof v === 'object' ? JSON.stringify(v) : String(v ?? '');
        const displayVal = rawVal.replace(/\s+/g, ' ').trim();
        return (
          <span
            key={k}
            data-testid={`card-tag-chip-${k}`}
            className="max-w-[130px] inline-flex items-center text-[10px] px-1.5 py-0.5 rounded shrink-0 font-medium bg-slate-900 text-slate-300 border border-slate-800/80 font-mono"
          >
            <span className="truncate min-w-0" title={`${k}: ${displayVal}`}>
              <span className="text-slate-400">{k}: </span>
              {displayVal}
            </span>
          </span>
        );
      })}

      {hasOverflow && (
        <span
          ref={capsuleRef}
          data-testid={`card-overflow-capsule-${itemId}`}
          onClick={(e) => {
            e.stopPropagation();
            setIsOpen((prev) => !prev);
          }}
          onMouseEnter={() => {
            updatePosition();
            setIsOpen(true);
          }}
          onMouseLeave={() => {
            // keep open if clicked, or close on mouseleave
          }}
          className="text-[10px] text-slate-400 bg-slate-800/80 px-1.5 py-0.5 rounded cursor-pointer shrink-0 font-medium hover:bg-slate-800 hover:text-slate-200 transition-colors"
          title="Hover or click to view all metadata"
        >
          +{remainingCount} more
        </span>
      )}

      {popoverContent}
    </div>
  );
}
