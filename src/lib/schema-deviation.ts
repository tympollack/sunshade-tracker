import { WorkItem, ProjectSettings } from '@/types/tracker';
import { validateHierarchyNesting } from '@/lib/fractional-index';

export type SchemaDeviationType = 'unmapped_level' | 'unmapped_status' | 'nesting_conflict';

export interface SchemaDeviation {
  id: string; // unique identifier: `${itemId}-${deviationType}`
  itemId: string;
  itemRef: string | null;
  itemTitle: string;
  projectId?: string;
  projectSlug?: string;
  deviationType: SchemaDeviationType;
  currentValue: string;
  expectedValues: string[];
  message: string;
  parentType?: string;
  parentTitle?: string;
}

export interface DeviationSummary {
  total: number;
  unmappedLevelsCount: number;
  unmappedStatusesCount: number;
  nestingConflictsCount: number;
  unmappedLevels: string[]; // unique unmapped types e.g. ['subtask']
  unmappedStatuses: string[]; // unique unmapped status IDs
  affectedItemIds: string[];
}

export interface ProjectLike {
  id: string;
  slug: string;
  name?: string;
  settings?: ProjectSettings;
}

/**
 * Scans work items against the project's schema settings to detect:
 * 1. Unmapped hierarchy level: item_type not defined in projectSettings.hierarchy
 * 2. Unmapped status: status not defined in projectSettings.statuses
 * 3. Nesting conflict: parent-child hierarchy violates allowed_parents configuration
 */
export function detectSchemaDeviations(
  items: WorkItem[],
  defaultSettings: ProjectSettings,
  allProjects?: ProjectLike[],
  isAllProjects?: boolean
): SchemaDeviation[] {
  if (!items || items.length === 0) return [];

  const deviations: SchemaDeviation[] = [];
  const itemMap = new Map<string, WorkItem>();
  for (const it of items) {
    if (it?.id) itemMap.set(it.id, it);
  }

  // Pre-resolve project settings cache if allProjects provided
  const projectSettingsCache = new Map<string, ProjectSettings>();
  if (allProjects && allProjects.length > 0) {
    for (const p of allProjects) {
      if (p.settings) {
        projectSettingsCache.set(p.id, p.settings);
        projectSettingsCache.set(p.slug, p.settings);
      }
    }
  }

  for (const item of items) {
    if (!item) continue;

    // Resolve the effective settings for this specific item
    let settings = defaultSettings;
    if (isAllProjects && item.project_id && projectSettingsCache.has(item.project_id)) {
      settings = projectSettingsCache.get(item.project_id)!;
    }

    const hierarchy = settings?.hierarchy || [];
    const statuses = settings?.statuses || [];

    const allowedLevelTypes = hierarchy.map((h) => h.type);
    const allowedStatusIds = statuses.map((s) => s.id);

    // 1. Check unmapped hierarchy level
    if (allowedLevelTypes.length > 0) {
      const typeMatches = allowedLevelTypes.some(
        (t) => t.toLowerCase() === (item.item_type || '').toLowerCase()
      );
      if (!typeMatches) {
        deviations.push({
          id: `${item.id}-unmapped_level`,
          itemId: item.id,
          itemRef: item.external_ref_id || null,
          itemTitle: item.title || item.id,
          projectId: item.project_id,
          deviationType: 'unmapped_level',
          currentValue: item.item_type || '(blank)',
          expectedValues: allowedLevelTypes,
          message: `Item type '${item.item_type || '(blank)'}' is not defined in project hierarchy. Allowed: [${allowedLevelTypes.join(', ')}]`,
        });
      }
    }

    // 2. Check unmapped status
    if (allowedStatusIds.length > 0) {
      const statusMatches = allowedStatusIds.some(
        (s) => s.toLowerCase() === (item.status || '').toLowerCase()
      );
      if (!statusMatches) {
        deviations.push({
          id: `${item.id}-unmapped_status`,
          itemId: item.id,
          itemRef: item.external_ref_id || null,
          itemTitle: item.title || item.id,
          projectId: item.project_id,
          deviationType: 'unmapped_status',
          currentValue: item.status || '(blank)',
          expectedValues: allowedStatusIds,
          message: `Status '${item.status || '(blank)'}' is not defined in project statuses. Allowed: [${allowedStatusIds.join(', ')}]`,
        });
      }
    }

    // 3. Check nesting conflict
    if (item.parent_id && hierarchy.length > 0) {
      const parent = itemMap.get(item.parent_id);
      if (parent) {
        const nestCheck = validateHierarchyNesting(parent.item_type, item.item_type, hierarchy);
        if (!nestCheck.valid) {
          deviations.push({
            id: `${item.id}-nesting_conflict`,
            itemId: item.id,
            itemRef: item.external_ref_id || null,
            itemTitle: item.title || item.id,
            projectId: item.project_id,
            deviationType: 'nesting_conflict',
            currentValue: `${parent.item_type} -> ${item.item_type}`,
            expectedValues: (hierarchy.find((h) => h.type === item.item_type)?.allowed_parents || []),
            message: nestCheck.message || `Item cannot be nested under parent of type '${parent.item_type}'.`,
            parentType: parent.item_type,
            parentTitle: parent.title,
          });
        }
      }
    }
  }

  return deviations;
}

/**
 * Aggregates deviation statistics and unique unmapped values.
 */
export function summarizeDeviations(deviations: SchemaDeviation[]): DeviationSummary {
  const unmappedLevels = new Set<string>();
  const unmappedStatuses = new Set<string>();
  const affectedItemIds = new Set<string>();

  let unmappedLevelsCount = 0;
  let unmappedStatusesCount = 0;
  let nestingConflictsCount = 0;

  for (const d of deviations) {
    affectedItemIds.add(d.itemId);
    if (d.deviationType === 'unmapped_level') {
      unmappedLevelsCount++;
      unmappedLevels.add(d.currentValue);
    } else if (d.deviationType === 'unmapped_status') {
      unmappedStatusesCount++;
      unmappedStatuses.add(d.currentValue);
    } else if (d.deviationType === 'nesting_conflict') {
      nestingConflictsCount++;
    }
  }

  return {
    total: deviations.length,
    unmappedLevelsCount,
    unmappedStatusesCount,
    nestingConflictsCount,
    unmappedLevels: Array.from(unmappedLevels),
    unmappedStatuses: Array.from(unmappedStatuses),
    affectedItemIds: Array.from(affectedItemIds),
  };
}
