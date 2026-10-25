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
  offset?: number;
}

export function TooltipArrow({ className = '', side = 'top', offset = 0 }: TooltipArrowProps) {
  const isBottom = side === 'bottom';
  const isTop = side === 'top';

  const style: React.CSSProperties = offset !== 0 ? { left: `calc(50% + ${offset}px)` } : {};

  if (isBottom) {
    return (
      <svg
        className={`absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-1.5 fill-slate-900 pointer-events-none ${className}`}
        style={style}
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
        style={style}
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
  if (typeof document === 'undefined') {
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
  const [coords, setCoords] = useState<{
    top: number;
    left: number;
    side: 'top' | 'bottom' | 'left' | 'right';
    arrowOffset?: number;
  }>({
    top: 0,
    left: 0,
    side: side || position || 'top',
    arrowOffset: 0,
  });

  const timerRef = useRef<number | null>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const id = useId();

  const updateCoordinates = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    let effectiveSide: 'top' | 'bottom' | 'left' | 'right' = side || position || 'top';

    const viewportWidth = typeof window !== 'undefined' ? window.innerWidth : 1024;
    const viewportHeight = typeof window !== 'undefined' ? window.innerHeight : 800;

    // Read rendered popover dimensions if available, or fall back to standard defaults
    const popoverRect = popoverRef.current ? popoverRef.current.getBoundingClientRect() : null;
    const tooltipWidth = popoverRect && popoverRect.width > 0 ? popoverRect.width : 200;
    const tooltipHeight = popoverRect && popoverRect.height > 0 ? popoverRect.height : 40;

    if (avoidCollisions) {
      if (effectiveSide === 'top') {
        const topSpace = rect.top - sideOffset - tooltipHeight;
        if (topSpace < collisionPadding) {
          effectiveSide = 'bottom';
        }
      } else if (effectiveSide === 'bottom') {
        const bottomSpace = viewportHeight - (rect.bottom + sideOffset + tooltipHeight);
        if (bottomSpace < collisionPadding) {
          effectiveSide = 'top';
        }
      } else if (effectiveSide === 'left') {
        const leftSpace = rect.left - sideOffset - tooltipWidth;
        if (leftSpace < collisionPadding) {
          effectiveSide = 'right';
        }
      } else if (effectiveSide === 'right') {
        const rightSpace = viewportWidth - (rect.right + sideOffset + tooltipWidth);
        if (rightSpace < collisionPadding) {
          effectiveSide = 'left';
        }
      }
    }

    let calcTop = 0;
    let calcLeft = 0;
    let arrowOffset = 0;

    if (effectiveSide === 'bottom') {
      calcTop = rect.bottom + sideOffset;
      calcLeft = rect.left + rect.width / 2;
    } else if (effectiveSide === 'top') {
      calcTop = rect.top - sideOffset;
      calcLeft = rect.left + rect.width / 2;
    } else if (effectiveSide === 'left') {
      calcTop = rect.top + rect.height / 2;
      calcLeft = rect.left - sideOffset;
    } else if (effectiveSide === 'right') {
      calcTop = rect.top + rect.height / 2;
      calcLeft = rect.right + sideOffset;
    }

    // Apply viewport collision constraints using collisionPadding
    if (avoidCollisions) {
      if (effectiveSide === 'top' || effectiveSide === 'bottom') {
        const idealLeft = calcLeft;
        const minLeft = collisionPadding + tooltipWidth / 2;
        const maxLeft = Math.max(minLeft, viewportWidth - collisionPadding - tooltipWidth / 2);
        calcLeft = Math.max(minLeft, Math.min(maxLeft, calcLeft));

        // Arrow offset relative to popover center so it continues pointing at trigger center
        const maxArrowOffset = Math.max(0, tooltipWidth / 2 - 12);
        arrowOffset = Math.max(-maxArrowOffset, Math.min(maxArrowOffset, idealLeft - calcLeft));

        if (effectiveSide === 'top') {
          calcTop = Math.max(collisionPadding + tooltipHeight, calcTop);
        } else {
          calcTop = Math.min(viewportHeight - collisionPadding - tooltipHeight, calcTop);
        }
      } else {
        const minTop = collisionPadding + tooltipHeight / 2;
        const maxTop = Math.max(minTop, viewportHeight - collisionPadding - tooltipHeight / 2);
        calcTop = Math.max(minTop, Math.min(maxTop, calcTop));

        if (effectiveSide === 'left') {
          calcLeft = Math.max(collisionPadding + tooltipWidth, calcLeft);
        } else {
          calcLeft = Math.min(viewportWidth - collisionPadding - tooltipWidth, calcLeft);
        }
      }
    }

    setCoords({
      top: calcTop,
      left: calcLeft,
      side: effectiveSide,
      arrowOffset,
    });
  }, [side, position, sideOffset, collisionPadding, avoidCollisions]);

  const show = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      updateCoordinates();
      setIsVisible(true);
    }, delay);
  }, [delay, updateCoordinates]);

  const setPopoverRef = useCallback(
    (el: HTMLDivElement | null) => {
      popoverRef.current = el;
      if (el) {
        updateCoordinates();
      }
    },
    [updateCoordinates]
  );

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

  // Keep tooltip attached to trigger during page/container scroll and window resize
  useEffect(() => {
    if (!isVisible) return;

    // Immediate reposition to measure rendered popover dimensions
    updateCoordinates();

    const handleUpdate = () => {
      updateCoordinates();
    };

    window.addEventListener('scroll', handleUpdate, { capture: true, passive: true });
    window.addEventListener('resize', handleUpdate, { passive: true });

    return () => {
      window.removeEventListener('scroll', handleUpdate, { capture: true });
      window.removeEventListener('resize', handleUpdate);
    };
  }, [isVisible, updateCoordinates]);

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
            ref={setPopoverRef}
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
            {showArrow && <TooltipArrow className="fill-slate-900" side={coords.side} offset={coords.arrowOffset} />}
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
