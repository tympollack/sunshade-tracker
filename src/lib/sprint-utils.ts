import { SprintDefinition, WorkItem, ProjectSettings } from '@/types/tracker';

const COMPLETED_STATUSES = new Set(['done', 'closed', 'complete', 'completed']);

/**
 * Canonical sprint status weights (FEAT-TRK-SPRINT-STATUS-SEQUENCE-UNPLANNED):
 * Completed (1) -> Active (2) -> Planned (3) -> Unplanned (4)
 */
export const SPRINT_STATUS_WEIGHTS: Record<string, number> = {
  completed: 1,
  active: 2,
  planned: 3,
  unplanned: 4,
};

export const SPRINT_STATUS_SEQUENCE = ['completed', 'active', 'planned', 'unplanned'] as const;

export function getSprintStatusWeight(status?: string | null): number {
  if (!status) return 3; // Default to planned
  const normalized = String(status).toLowerCase().trim();
  return SPRINT_STATUS_WEIGHTS[normalized] ?? 3;
}

/**
 * Natural chronological comparison between two sprints.
 * 1. Primary sorting by canonical lifecycle status weight (Completed -> Active -> Planned -> Unplanned).
 * 2. Chronological order by start_date if both have dates.
 * 3. Sprints with start_date precede sprints without.
 * 4. Fall back to natural alphanumeric comparison on sprint names.
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

  // 1. Primary sort by canonical lifecycle status weight
  if (defA?.status || defB?.status) {
    const weightA = getSprintStatusWeight(defA?.status);
    const weightB = getSprintStatusWeight(defB?.status);
    if (weightA !== weightB) {
      return weightA - weightB;
    }
  }

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
    case 'unplanned':
      return {
        label: 'Unplanned',
        bg: 'bg-slate-500/20',
        text: 'text-slate-300',
        border: 'border-slate-500/30',
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

/**
 * Checks whether a parent_id value effectively represents an unparented root item.
 */
function isUnparented(parentId: string | null | undefined): boolean {
  if (!parentId) return true;
  const trimmed = String(parentId).trim();
  return (
    !trimmed ||
    trimmed.toLowerCase() === 'null' ||
    trimmed.toLowerCase() === 'undefined' ||
    trimmed.toLowerCase() === 'none'
  );
}

/**
 * Decouples sprint story point totals from parent container cards by extracting
 * exclusively leaf execution work items (items that have no children within the sprint items).
 */
export function getSprintLeafItems(items: WorkItem[]): WorkItem[] {
  if (!items || items.length === 0) return [];

  // 1. Build an adjacency set of all parent_id references present among the given items
  const parentRefIds = new Set<string>();
  for (const item of items) {
    if (item.parent_id && !isUnparented(item.parent_id) && item.parent_id !== item.id) {
      parentRefIds.add(item.parent_id);
    }
  }

  // 2. An item is a leaf if its id (or external_ref_id) does not appear in the parent set
  return items.filter((item) => {
    if (parentRefIds.has(item.id)) return false;
    if (item.external_ref_id && parentRefIds.has(item.external_ref_id)) return false;
    return true;
  });
}

/**
 * Calculates sprint point totals exclusively across leaf work items (items with 0 children in the sprint)
 * to eliminate parent-child double-counting.
 */
export function calculateSprintLeafPoints(items: WorkItem[]): number {
  const leafItems = getSprintLeafItems(items);
  return leafItems.reduce((acc, it) => {
    const p = Number(it.metadata?.story_points ?? it.metadata?.points ?? it.metadata?.estimate);
    return acc + (isNaN(p) || p < 0 ? 0 : p);
  }, 0);
}

/**
 * Extracts root-level items in the sprint (items that have no parent in the sprint scope).
 */
export function getSprintRootItems(items: WorkItem[]): WorkItem[] {
  if (!items || items.length === 0) return [];

  const itemIdSet = new Set<string>();
  for (const item of items) {
    itemIdSet.add(item.id);
    if (item.external_ref_id) {
      itemIdSet.add(item.external_ref_id);
    }
  }

  return items.filter((item) => {
    if (isUnparented(item.parent_id) || item.parent_id === item.id) {
      return true;
    }
    return !itemIdSet.has(item.parent_id!);
  });
}

/**
 * Calculates macro roadmap capacity by summing intrinsic estimates of root-level items in the sprint.
 */
export function calculateSprintMacroPoints(items: WorkItem[]): number {
  const rootItems = getSprintRootItems(items);
  return rootItems.reduce((acc, it) => {
    const p = Number(it.metadata?.story_points ?? it.metadata?.points ?? it.metadata?.estimate);
    return acc + (isNaN(p) || p < 0 ? 0 : p);
  }, 0);
}
