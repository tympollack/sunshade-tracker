'use client';

import React, { useState, useRef, useId, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
  position?: 'top' | 'bottom' | 'left' | 'right';
  side?: 'top' | 'bottom' | 'left' | 'right';
  sideOffset?: number;
  collisionPadding?: number;
  avoidCollisions?: boolean;
  className?: string;
  tooltipClassName?: string;
  showArrow?: boolean;
  'data-testid'?: string;
}

export interface TooltipArrowProps {
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
}

export function TooltipArrow({ className = '', side = 'top' }: TooltipArrowProps) {
  const isBottom = side === 'bottom';
  const isTop = side === 'top';

  if (isBottom) {
    return (
      <svg
        className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-1.5 fill-slate-900 pointer-events-none ${className}`}
        viewBox="0 0 12 6"
        aria-hidden="true"
        data-testid="tooltip-arrow"
      >
        <polygon points="6,0 0,6 12,6" />
      </svg>
    );
  }

  if (isTop) {
    return (
      <svg
        className={`absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-1.5 fill-slate-900 pointer-events-none ${className}`}
        viewBox="0 0 12 6"
        aria-hidden="true"
        data-testid="tooltip-arrow"
      >
        <polygon points="0,0 12,0 6,6" />
      </svg>
    );
  }

  return null;
}

export function TooltipPortal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted || typeof document === 'undefined') {
    return null;
  }

  return createPortal(children, document.body);
}

export function Tooltip({
  content,
  children,
  delay = 150,
  position = 'top',
  side,
  sideOffset = 8,
  collisionPadding = 16,
  avoidCollisions = true,
  className = '',
  tooltipClassName = '',
  showArrow = true,
  'data-testid': testId,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const [coords, setCoords] = useState<{ top: number; left: number; side: 'top' | 'bottom' | 'left' | 'right' }>({
    top: 0,
    left: 0,
    side: side || position || 'top',
  });

  const timerRef = useRef<number | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const id = useId();

  const updateCoordinates = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    let effectiveSide: 'top' | 'bottom' | 'left' | 'right' = side || position || 'top';

    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
    const topClearance = rect.top;
    const isInTopThird = rect.top < viewportHeight / 3;

    if (avoidCollisions) {
      if (effectiveSide === 'top' && (topClearance < 80 || isInTopThird)) {
        effectiveSide = 'bottom';
      } else if (effectiveSide === 'bottom' && (viewportHeight - rect.bottom < 80)) {
        effectiveSide = 'top';
      }
    }

    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;
    const scrollX = typeof window !== 'undefined' ? window.scrollX : 0;

    let calcTop = 0;
    let calcLeft = 0;

    if (effectiveSide === 'bottom') {
      calcTop = scrollY + rect.bottom + sideOffset;
      calcLeft = scrollX + rect.left + rect.width / 2;
    } else if (effectiveSide === 'top') {
      calcTop = scrollY + rect.top - sideOffset;
      calcLeft = scrollX + rect.left + rect.width / 2;
    } else if (effectiveSide === 'left') {
      calcTop = scrollY + rect.top + rect.height / 2;
      calcLeft = scrollX + rect.left - sideOffset;
    } else if (effectiveSide === 'right') {
      calcTop = scrollY + rect.top + rect.height / 2;
      calcLeft = scrollX + rect.right + sideOffset;
    }

    setCoords({
      top: calcTop,
      left: calcLeft,
      side: effectiveSide,
    });
  }, [side, position, sideOffset, avoidCollisions]);

  const show = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      updateCoordinates();
      setIsVisible(true);
    }, delay);
  }, [delay, updateCoordinates]);

  const hide = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setIsVisible(false);
  }, []);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        hide();
      }
    },
    [hide]
  );

  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  // Determine transform offset classes based on side
  let transformClasses = '-translate-x-1/2 -translate-y-full';
  if (coords.side === 'bottom') {
    transformClasses = '-translate-x-1/2';
  } else if (coords.side === 'left') {
    transformClasses = '-translate-x-full -translate-y-1/2';
  } else if (coords.side === 'right') {
    transformClasses = '-translate-y-1/2';
  }

  return (
    <div
      ref={triggerRef}
      className={`relative inline-flex items-center ${className}`}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
      onKeyDown={handleKeyDown}
      data-testid={testId}
      data-tooltip-content={typeof content === 'string' ? content : undefined}
    >
      <div
        tabIndex={0}
        aria-describedby={isVisible ? id : undefined}
        className="focus:outline-none focus-visible:ring-1 focus-visible:ring-cyan-500 rounded inline-flex items-center"
      >
        {children}
      </div>

      {isVisible && content && (
        <TooltipPortal>
          <div
            id={id}
            role="tooltip"
            data-side={coords.side}
            style={{
              top: `${coords.top}px`,
              left: `${coords.left}px`,
            }}
            className={`fixed ${transformClasses} pointer-events-none z-50 bg-slate-900 border border-slate-700 text-slate-200 text-xs shadow-xl rounded-md p-2.5 max-w-xs backdrop-blur-sm whitespace-normal text-left font-normal transition-opacity duration-150 animate-in fade-in-0 zoom-in-95 ${tooltipClassName}`}
            data-testid="tooltip-popover"
          >
            {content}
            {showArrow && <TooltipArrow className="fill-slate-900" side={coords.side} />}
          </div>
        </TooltipPortal>
      )}
    </div>
  );
}

// Compound component attachments
Tooltip.Portal = TooltipPortal;
Tooltip.Arrow = TooltipArrow;
Tooltip.Content = function TooltipContent({
  children,
  className = '',
  side = 'top',
  'data-testid': testId = 'tooltip-content',
}: {
  children: React.ReactNode;
  className?: string;
  side?: 'top' | 'bottom' | 'left' | 'right';
  'data-testid'?: string;
}) {
  return (
    <div
      role="tooltip"
      data-side={side}
      className={`fixed pointer-events-none z-50 bg-slate-900 border border-slate-700 text-slate-200 text-xs shadow-xl rounded-md p-2.5 max-w-xs backdrop-blur-sm ${className}`}
      data-testid={testId}
    >
      {children}
      <TooltipArrow className="fill-slate-900" side={side} />
    </div>
  );
};
