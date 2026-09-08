import { HierarchyLevel, ProjectSettings, StatusDefinition } from '@/types/tracker';
import { getDefaultLevelHex } from '@/lib/hierarchy-colors';

export interface ProjectLike {
  id?: string;
  slug?: string;
  settings?: ProjectSettings | null;
}

/**
 * Deterministically merges statuses across multiple projects.
 * - Resolves duplicate status IDs: lowest numeric order wins.
 * - If order is tied, project with alphabetically earlier slug/id wins.
 * - The entire winning status definition (label, color, order, etc.) is preserved.
 * - Result is sorted by order ascending, then status id ascending.
 */
export function mergeProjectStatuses(projects: ProjectLike[]): StatusDefinition[] {
  const statusMap = new Map<string, { status: StatusDefinition; projectKey: string }>();

  // Sort projects deterministically by slug or id
  const sortedProjects = [...projects].sort((a, b) => {
    const keyA = a.slug || a.id || '';
    const keyB = b.slug || b.id || '';
    return keyA.localeCompare(keyB);
  });

  sortedProjects.forEach((proj) => {
    const projKey = proj.slug || proj.id || '';
    (proj.settings?.statuses || []).forEach((st: StatusDefinition) => {
      const existingEntry = statusMap.get(st.id);
      if (!existingEntry) {
        statusMap.set(st.id, { status: { ...st }, projectKey: projKey });
      } else {
        const existingOrder = typeof existingEntry.status.order === 'number' ? existingEntry.status.order : 999999;
        const newOrder = typeof st.order === 'number' ? st.order : 999999;
        if (
          newOrder < existingOrder ||
          (newOrder === existingOrder && projKey.localeCompare(existingEntry.projectKey) < 0)
        ) {
          statusMap.set(st.id, { status: { ...st }, projectKey: projKey });
        }
      }
    });
  });

  if (statusMap.size === 0) {
    return [
      { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 0 },
      { id: 'in_progress', label: 'In Progress', color: '#3b82f6', order: 1 },
      { id: 'done', label: 'Done', color: '#10b981', order: 2 },
    ];
  }

  return Array.from(statusMap.values())
    .map((e) => e.status)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
}

/**
 * Deterministically merges hierarchy levels across multiple projects.
 * - Duplicate hierarchy types: lowest numeric level wins.
 * - If level tied, alphabetically earlier project key wins.
 * - Preserves allowed_parents, color, label from winning level.
 * - Result is sorted by level ascending, then type ascending.
 */
export function mergeProjectHierarchy(projects: ProjectLike[]): HierarchyLevel[] {
  const hierarchyMap = new Map<string, { hierarchy: HierarchyLevel; projectKey: string }>();

  const sortedProjects = [...projects].sort((a, b) => {
    const keyA = a.slug || a.id || '';
    const keyB = b.slug || b.id || '';
    return keyA.localeCompare(keyB);
  });

  sortedProjects.forEach((proj) => {
    const projKey = proj.slug || proj.id || '';
    (proj.settings?.hierarchy || []).forEach((h: HierarchyLevel) => {
      const enriched: HierarchyLevel = {
        ...h,
        color: h.color || getDefaultLevelHex(h.level),
      };
      const existingEntry = hierarchyMap.get(h.type);
      if (!existingEntry) {
        hierarchyMap.set(h.type, { hierarchy: enriched, projectKey: projKey });
      } else {
        const existingLevel = typeof existingEntry.hierarchy.level === 'number' ? existingEntry.hierarchy.level : 999999;
        const newLevel = typeof h.level === 'number' ? h.level : 999999;
        if (
          newLevel < existingLevel ||
          (newLevel === existingLevel && projKey.localeCompare(existingEntry.projectKey) < 0)
        ) {
          hierarchyMap.set(h.type, { hierarchy: enriched, projectKey: projKey });
        }
      }
    });
  });

  if (hierarchyMap.size === 0) {
    return [
      { type: 'epic', label: 'Epic', level: 0, allowed_parents: [], color: '#a855f7' },
      { type: 'story', label: 'Story', level: 1, allowed_parents: ['epic'], color: '#3b82f6' },
      { type: 'task', label: 'Task', level: 2, allowed_parents: ['story', 'epic'], color: '#10b981' },
    ];
  }

  return Array.from(hierarchyMap.values())
    .map((e) => e.hierarchy)
    .sort((a, b) => (a.level ?? 0) - (b.level ?? 0) || a.type.localeCompare(b.type));
}

/**
 * Merges full project settings for portfolio/all-projects mode.
 */
export function mergeProjectSettings(projects: ProjectLike[]): ProjectSettings {
  const finalStatuses = mergeProjectStatuses(projects);
  const finalHierarchy = mergeProjectHierarchy(projects);

  const mergedFields = new Set<string>();
  const mergedSprints: any[] = [];

  projects.forEach((proj) => {
    (proj.settings?.custom_fields || []).forEach((f: string) => mergedFields.add(f));
    (proj.settings?.sprint_settings?.sprints || []).forEach((s: any) => {
      if (s.name && !mergedSprints.some((ms) => ms.name === s.name)) {
        mergedSprints.push(s);
      }
    });
  });

  return {
    schema_version: '1.0',
    statuses: finalStatuses,
    hierarchy: finalHierarchy,
    custom_fields: Array.from(mergedFields),
    sprint_settings: {
      default_sprint: 'all',
      sprints: mergedSprints,
    },
  };
}

/**
 * Returns the effective project settings for an item, falling back to defaultSettings in single-project mode.
 */
export function getItemProjectSettings(
  item: { project_id?: string | null } | null | undefined,
  allProjects: ProjectLike[],
  defaultSettings: ProjectSettings,
  isAllProjects: boolean
): ProjectSettings {
  if (!item || !isAllProjects) return defaultSettings;
  const proj = allProjects.find((p) => p.id === item.project_id || p.slug === item.project_id);
  if (proj && proj.settings) {
    return {
      ...defaultSettings,
      ...proj.settings,
      hierarchy: (proj.settings.hierarchy || []).map((h: any) => ({
        ...h,
        color: h.color || getDefaultLevelHex(h.level),
      })),
      statuses: proj.settings.statuses || [],
    };
  }
  return defaultSettings;
}
