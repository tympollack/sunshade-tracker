'use client';

import React from 'react';

export interface BoardViewProps {
  children: React.ReactNode;
  className?: string;
  dataTestId?: string;
}

export function BoardView({
  children,
  className = '',
  dataTestId = 'board-view-container',
}: BoardViewProps) {
  return (
    <div
      data-testid={dataTestId}
      className={`h-[calc(100dvh-var(--header-height)-var(--toolbar-height))] w-full overflow-x-auto overflow-y-hidden flex gap-4 p-4 select-none ${className}`}
    >
      {children}
    </div>
  );
}

export default BoardView;
