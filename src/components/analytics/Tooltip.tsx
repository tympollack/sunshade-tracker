'use client';

import React, { useState, useRef, useId, useCallback } from 'react';

export interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  delay?: number;
  position?: 'top' | 'bottom' | 'left' | 'right';
  className?: string;
  tooltipClassName?: string;
  'data-testid'?: string;
}

export function Tooltip({
  content,
  children,
  delay = 150,
  position = 'top',
  className = '',
  tooltipClassName = '',
  'data-testid': testId,
}: TooltipProps) {
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<number | null>(null);
  const id = useId();

  const show = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setIsVisible(true);
    }, delay);
  }, [delay]);

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

  // Position coordinates & classes
  let positionClasses = 'bottom-full left-1/2 -translate-x-1/2 mb-2';
  if (position === 'bottom') {
    positionClasses = 'top-full left-1/2 -translate-x-1/2 mt-2';
  } else if (position === 'left') {
    positionClasses = 'right-full top-1/2 -translate-y-1/2 mr-2';
  } else if (position === 'right') {
    positionClasses = 'left-full top-1/2 -translate-y-1/2 ml-2';
  }

  return (
    <div
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
        <div
          id={id}
          role="tooltip"
          className={`absolute ${positionClasses} pointer-events-none z-50 bg-slate-900/95 border border-slate-700 text-slate-200 text-xs shadow-xl rounded-md p-2 max-w-xs backdrop-blur-sm whitespace-normal text-left font-normal transition-opacity duration-150 animate-in fade-in-0 zoom-in-95 ${tooltipClassName}`}
          data-testid="tooltip-popover"
        >
          {content}
        </div>
      )}
    </div>
  );
}
