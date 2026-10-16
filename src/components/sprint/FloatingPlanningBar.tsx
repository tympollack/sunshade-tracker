'use client';

import React from 'react';
import { BulkActionsToolbar, BulkActionsToolbarProps } from '@/components/BulkActionsToolbar';

export type FloatingPlanningBarProps = BulkActionsToolbarProps;

/**
 * FloatingPlanningBar: Floating bulk planning bar for sprint assignments and batch item modifications in active sprint planning.
 */
export const FloatingPlanningBar: React.FC<FloatingPlanningBarProps> = (props) => {
  return (
    <div data-testid="floating-planning-bar">
      <BulkActionsToolbar {...props} />
    </div>
  );
};

export default FloatingPlanningBar;
export { BulkActionsToolbar };
