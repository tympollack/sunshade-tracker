import { SprintDefinition, WorkItem, ProjectSettings } from '@/types/tracker';

const COMPLETED_STATUSES = new Set(['done', 'closed', 'complete', 'completed']);

/**
 * Natural chronological comparison between two sprints.
 * 1. Chronological order by start_date if both have dates.
 * 2. Sprints with start_date precede sprints without.
 * 3. Fall back to natural alphanumeric comparison on sprint names
 *    (e.g., "Sprint 2" comes before "Sprint 10", "Sprint 2026-Q1" before "Sprint 2026-Q2").
 */
export function compareSprints(
  a: string | SprintDefinition,
  b: string | SprintDefinition,
  sprintMap?: Map<string, SprintDefinition>
): number {
  const nameA = typeof a === 'string' ? a : a.name;
  const nameB = typeof b === 'string' ? b : b.name;

  const defA = typeof a === 'object' ? a : sprintMap?.get(nameA);
  const defB = typeof b === 'object' ? b : sprintMap?.get(nameB);

  const startA = defA?.start_date ? new Date(defA.start_date).getTime() : null;
  const startB = defB?.start_date ? new Date(defB.start_date).getTime() : null;

  if (startA !== null && !isNaN(startA) && startB !== null && !isNaN(startB)) {
    if (startA !== startB) {
      return startA - startB;
    }
  } else if (startA !== null && !isNaN(startA)) {
    return -1;
  } else if (startB !== null && !isNaN(startB)) {
    return 1;
  }

  // Natural alphanumeric comparison
  return nameA.localeCompare(nameB, undefined, { numeric: true, sensitivity: 'base' });
}

/**
 * Sorts an array of sprint names using definitions if available.
 */
export function sortSprintNames(
  sprintNames: string[],
  sprints?: SprintDefinition[]
): string[] {
  const map = new Map<string, SprintDefinition>();
  if (sprints) {
    for (const s of sprints) {
      map.set(s.name, s);
    }
  }

  return [...sprintNames].sort((a, b) => compareSprints(a, b, map));
}

/**
 * Format date range for sprint display (e.g. "Sep 1 – Sep 14, 2026").
 */
export function formatSprintDateRange(
  startDate?: string | null,
  endDate?: string | null
): string | null {
  if (!startDate && !endDate) return null;

  const parseDate = (dStr: string) => {
    // Handle 'YYYY-MM-DD' without timezone shift
    const parts = dStr.split('-');
    if (parts.length === 3) {
      return new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
    }
    return new Date(dStr);
  };

  const optionsShort: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' };
  const optionsFull: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric', year: 'numeric' };

  if (startDate && endDate) {
    const dStart = parseDate(startDate);
    const dEnd = parseDate(endDate);

    if (isNaN(dStart.getTime()) || isNaN(dEnd.getTime())) {
      return `${startDate} – ${endDate}`;
    }

    if (dStart.getFullYear() === dEnd.getFullYear()) {
      return `${dStart.toLocaleDateString(undefined, optionsShort)} – ${dEnd.toLocaleDateString(undefined, optionsFull)}`;
    }
    return `${dStart.toLocaleDateString(undefined, optionsFull)} – ${dEnd.toLocaleDateString(undefined, optionsFull)}`;
  }

  if (startDate) {
    const d = parseDate(startDate);
    return isNaN(d.getTime()) ? startDate : `Starts ${d.toLocaleDateString(undefined, optionsFull)}`;
  }

  if (endDate) {
    const d = parseDate(endDate);
    return isNaN(d.getTime()) ? endDate : `Ends ${d.toLocaleDateString(undefined, optionsFull)}`;
  }

  return null;
}

/**
 * Visual badge styling for sprint status ('active' | 'completed' | 'planned').
 */
export function getSprintStatusBadge(status?: string | null): {
  label: string;
  bg: string;
  text: string;
  border: string;
} {
  switch (status?.toLowerCase()) {
    case 'active':
      return {
        label: 'Active Sprint',
        bg: 'bg-emerald-500/20',
        text: 'text-emerald-300',
        border: 'border-emerald-500/30',
      };
    case 'completed':
      return {
        label: 'Completed Sprint',
        bg: 'bg-purple-500/20',
        text: 'text-purple-300',
        border: 'border-purple-500/30',
      };
    case 'planned':
    default:
      return {
        label: 'Planned',
        bg: 'bg-blue-500/20',
        text: 'text-blue-300',
        border: 'border-blue-500/30',
      };
  }
}

/**
 * Checks whether a work item is immutable because it was completed as part of a completed sprint.
 */
export function isItemImmutableDueToCompletedSprint(
  item: WorkItem,
  settings?: ProjectSettings
): boolean {
  if (!item || !item.metadata?.sprint) return false;

  const itemStatus = (item.status || '').toLowerCase();
  if (!COMPLETED_STATUSES.has(itemStatus)) {
    return false;
  }

  const sprintName = String(item.metadata.sprint);
  const sprintDef = settings?.sprint_settings?.sprints?.find((s) => s.name === sprintName);

  return sprintDef?.status === 'completed';
}
