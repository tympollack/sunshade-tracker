import { WorkItem } from '@/types/tracker';
import {
  calculateSprintLeafPoints,
  getSprintLeafItems,
  getCompletedStatusSet,
  isItemCompleted,
} from '@/lib/sprint-utils';

export interface SprintBurndownSnapshot {
  date: string;
  totalPoints: number;      // leaf points total (true burn capacity)
  completedPoints: number;  // leaf points of completed items
  remainingPoints: number;  // leaf points of pending items
  leafItemCount: number;
  completedLeafCount: number;
  totalItemCount: number;
}

/**
 * Aggregates sprint burndown metrics strictly across leaf execution work items.
 * Time-series burn graphs track actual tasks delivered rather than stacked container points.
 */
export function aggregateSprintBurndown(
  items: WorkItem[],
  date: string = new Date().toISOString().split('T')[0],
  statuses?: Array<{ id?: string; label?: string }>
): SprintBurndownSnapshot {
  const leafItems = getSprintLeafItems(items);
  const totalPoints = calculateSprintLeafPoints(items);
  const completionSet = getCompletedStatusSet(statuses);

  const completedLeafItems = leafItems.filter((it) => {
    return isItemCompleted(it.status, completionSet);
  });

  const completedPoints = completedLeafItems.reduce((acc, it) => {
    const p = Number(it.metadata?.story_points ?? it.metadata?.points ?? it.metadata?.estimate);
    return acc + (isNaN(p) || p < 0 ? 0 : p);
  }, 0);

  const remainingPoints = Math.max(0, totalPoints - completedPoints);

  return {
    date,
    totalPoints,
    completedPoints,
    remainingPoints,
    leafItemCount: leafItems.length,
    completedLeafCount: completedLeafItems.length,
    totalItemCount: items.length,
  };
}
