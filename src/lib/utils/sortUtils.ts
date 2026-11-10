import { WorkItem } from '@/types/tracker';

export const SPRINT_SORT_STORAGE_KEY = 'trk_sprint_sort_preference';

export const PROJECT_SORT_VALUES = ['project_asc', 'project_desc'] as const;

export interface SortableProject {
  id: string;
  name: string;
}

export function isProjectSort(sortBy: string | null | undefined): boolean {
  return sortBy === 'project_asc' || sortBy === 'project_desc';
}

const VALID_SORTS = new Set([
  'order_index',
  'points_desc',
  'points_asc',
  'title_asc',
  'title_desc',
  'project_asc',
  'project_desc',
]);

export function isValidSortValue(value: unknown): value is string {
  return typeof value === 'string' && VALID_SORTS.has(value);
}

function getPoints(item: WorkItem): number {
  return Number(item.metadata?.story_points ?? item.metadata?.points ?? item.metadata?.estimate ?? 0) || 0;
}

/**
 * Resolves the display name of an item's parent project (empty string when unknown),
 * used as the primary key for project sorting.
 */
export function getItemProjectName(
  item: { project_id?: string | null },
  projects: SortableProject[]
): string {
  if (!item.project_id) return '';
  return projects.find((p) => p.id === item.project_id)?.name ?? '';
}

/**
 * Builds a work item comparator for the given sort key. Project sorts compare the parent
 * project name first (clustering items per project) and fall back to order_index within a
 * project, so hierarchy children (same project as their parent) keep their manual order.
 */
export function createItemComparator(
  sortBy: string,
  projects: SortableProject[] = []
): (a: WorkItem, b: WorkItem) => number {
  const nameById = new Map(projects.map((p) => [p.id, p.name] as const));
  const nameOf = (item: WorkItem) => (item.project_id ? nameById.get(item.project_id) ?? '' : '');

  return (a, b) => {
    switch (sortBy) {
      case 'project_asc':
      case 'project_desc': {
        const cmp = nameOf(a).localeCompare(nameOf(b));
        if (cmp !== 0) return sortBy === 'project_asc' ? cmp : -cmp;
        // Same name but different ids: keep distinct projects from interleaving
        const idCmp = (a.project_id || '').localeCompare(b.project_id || '');
        if (idCmp !== 0) return idCmp;
        break;
      }
      case 'points_desc': {
        const d = getPoints(b) - getPoints(a);
        if (d !== 0) return d;
        break;
      }
      case 'points_asc': {
        const d = getPoints(a) - getPoints(b);
        if (d !== 0) return d;
        break;
      }
      case 'title_asc': {
        const cmp = (a.title || '').localeCompare(b.title || '');
        if (cmp !== 0) return cmp;
        break;
      }
      case 'title_desc': {
        const cmp = (b.title || '').localeCompare(a.title || '');
        if (cmp !== 0) return cmp;
        break;
      }
    }
    return (a.order_index ?? 0) - (b.order_index ?? 0);
  };
}
