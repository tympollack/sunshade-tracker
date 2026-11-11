'use client';

import React from 'react';

export interface BoardViewProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
  dataTestId?: string;
  boardScrollRef?: React.RefObject<HTMLDivElement | null>;
  onWheel?: (e: React.WheelEvent<HTMLDivElement>) => void;
  orientation?: 'columns' | 'stack';
}

export const BoardView = React.forwardRef<HTMLDivElement, BoardViewProps>(
  (
    {
      children,
      className = '',
      dataTestId = 'board-view-container',
      boardScrollRef,
      onWheel,
      orientation = 'columns',
      ...rest
    },
    ref
  ) => {
    const effectiveRef = (ref || boardScrollRef) as React.Ref<HTMLDivElement>;
    const layoutClasses =
      orientation === 'stack'
        ? 'h-auto w-full overflow-x-hidden overflow-y-visible flex flex-col items-stretch gap-4 p-4 select-none'
        : 'h-auto md:h-[calc(100dvh-var(--header-height)-var(--toolbar-height))] w-full overflow-x-hidden md:overflow-x-auto overflow-y-visible md:overflow-y-hidden flex flex-col md:flex-row items-stretch gap-4 p-4 select-none';

    return (
      <div
        ref={effectiveRef}
        onWheel={onWheel}
        data-testid={dataTestId}
        className={`${layoutClasses} ${className}`.trim()}
        {...rest}
      >
        {children}
      </div>
    );
  }
);

BoardView.displayName = 'BoardView';

export default BoardView;
