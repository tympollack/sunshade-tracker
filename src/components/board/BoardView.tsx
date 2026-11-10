'use client';

import React from 'react';

export interface BoardViewProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  dataTestId?: string;
  boardScrollRef?: React.RefObject<HTMLDivElement | null>;
  onWheel?: (e: React.WheelEvent<HTMLDivElement>) => void;
}

export const BoardView = React.forwardRef<HTMLDivElement, BoardViewProps>(
  ({ children, className = '', dataTestId = 'board-view-container', boardScrollRef, onWheel, ...rest }, ref) => {
    const effectiveRef = (ref || boardScrollRef) as React.Ref<HTMLDivElement>;
    return (
      <div
        ref={effectiveRef}
        onWheel={onWheel}
        data-testid={dataTestId}
        className={`h-[calc(100dvh-var(--header-height)-var(--toolbar-height))] w-full overflow-x-auto overflow-y-hidden flex gap-4 p-4 select-none ${className}`}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

BoardView.displayName = 'BoardView';

export default BoardView;
