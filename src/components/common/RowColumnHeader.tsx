'use client';

import React from 'react';
import { ResolvedRowColumn, getColumnTrackWidthClass } from '@/lib/row-columns';

export interface RowColumnHeaderProps {
  columns: ResolvedRowColumn[];
  actionsWidthClass?: string;
  gapClass?: string;
  showActions?: boolean;
  leftIndentPaddingClass?: string;
  testId?: string;
  className?: string;
}

/**
 * Tabular column header strip aligned with right-zone column tracks in Tree and Sprint/Table views.
 */
export const RowColumnHeader: React.FC<RowColumnHeaderProps> = ({
  columns,
  actionsWidthClass = 'w-14',
  gapClass = 'gap-3',
  showActions = true,
  leftIndentPaddingClass = '',
  testId = 'row-column-header',
  className = '',
}) => {
  const rightColumns = columns.filter((col) => col.placement === 'right');

  return (
    <div
      data-testid={testId}
      className={`hidden md:flex items-center justify-between gap-3 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-slate-500 border-b border-slate-800/70 bg-slate-950/40 select-none ${className}`}
    >
      <div className={`flex-1 min-w-0 truncate ${leftIndentPaddingClass}`}>
        Work Item
      </div>
      <div className={`flex items-center ${gapClass} shrink-0 ml-auto justify-end`}>
        {rightColumns.map((col) => {
          const widthClass = getColumnTrackWidthClass(col.width, col.key);
          const alignClass =
            col.key === 'assignee' || col.key === 'status' ? 'text-center' : 'text-right';
          return (
            <div
              key={col.key}
              data-testid={`col-header-${col.key}`}
              title={col.label}
              className={`${widthClass} shrink-0 truncate ${alignClass}`}
            >
              {col.key === 'assignee' ? 'User' : col.key === 'status' ? 'Sts' : col.key === 'points' ? 'Pts' : col.label}
            </div>
          );
        })}
        {showActions && (
          <div className={`${actionsWidthClass} shrink-0 text-right`} data-testid="col-header-actions">
            Actions
          </div>
        )}
      </div>
    </div>
  );
};
