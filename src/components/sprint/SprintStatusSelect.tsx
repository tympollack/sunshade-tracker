'use client';

import React from 'react';
import { StatusDefinition } from '@/types/tracker';

export interface SprintStatusSelectProps {
  itemId: string;
  status: string;
  statuses: StatusDefinition[];
  onChange?: (itemId: string, newStatus: string) => void;
  disabled?: boolean;
  className?: string;
  compact?: boolean;
  testId?: string;
}

/**
 * Compact, responsive status select dropdown for sprint items and split-screen viewports (TASK-TRK-POINT-BADGE-CONSOLIDATION).
 * Enforces compact padding (py-0.5 px-1.5 text-xs) on mobile/split-screen and max width max-w-[130px] truncate.
 */
export const SprintStatusSelect: React.FC<SprintStatusSelectProps> = ({
  itemId,
  status,
  statuses = [],
  onChange,
  disabled = false,
  className = '',
  compact = false,
  testId,
}) => {
  const currentStatusObj = statuses.find((st: StatusDefinition) => st.id === status);
  const statusColor = currentStatusObj?.color;

  const basePadding = compact
    ? 'py-0.5 px-1.5 text-xs'
    : 'py-0.5 px-1.5 text-xs md:py-1 md:px-3 md:text-sm';

  return (
    <select
      value={status}
      onChange={(e) => onChange?.(itemId, e.target.value)}
      disabled={disabled}
      className={`rounded font-mono focus:outline-none cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed border max-w-[130px] truncate ${basePadding} ${className}`}
      style={
        statusColor
          ? {
              backgroundColor: `${statusColor}20`,
              color: statusColor,
              border: `1px solid ${statusColor}40`,
            }
          : { backgroundColor: '#020617', color: '#cbd5e1', border: '1px solid #1e293b' }
      }
      title={disabled ? 'Item is locked in a closed sprint' : 'Change status'}
      data-testid={testId || `sprint-status-select-${itemId}`}
    >
      {statuses.map((st: StatusDefinition) => (
        <option
          key={st.id}
          value={st.id}
          style={{ backgroundColor: '#020617', color: '#cbd5e1' }}
        >
          {st.label}
        </option>
      ))}
    </select>
  );
};

export default SprintStatusSelect;
