import { SprintDefinition, ProjectSettings } from '@/types/tracker';
import { isSprintActive } from '@/lib/services/sprintGuardrailService';
import { getItemProjectSettings } from '@/lib/portfolio-merge';

export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface ResolveTargetSprintParams {
  targetSprintName: string | null | undefined;
  targetProjectId?: string | null;
  dbSprints?: SprintDefinition[];
  projectSettings?: ProjectSettings | Record<string, any>;
  allProjects?: Array<{ id?: string; slug?: string; settings?: ProjectSettings | Record<string, any> | null }>;
  isAllProjects?: boolean;
  currentProjectId?: string | null;
}

export interface ResolvedSprintResult {
  targetSprintDef: SprintDefinition | null;
  targetSprintId: string | null;
  isTargetActive: boolean;
}

/**
 * Unified sprint resolution: scopes sprint definitions and UUIDs strictly to the target project.
 * - Prioritizes exact target-project relational sprints (tracker.sprints table) with valid UUIDs.
 * - Falls back to global/workspace-wide relational sprints (s.project_id is null/empty).
 * - Prioritizes exact target-project settings sprints before global settings sprints.
 * - Prevents foreign-project UUID borrowing in portfolio views.
 * - Aligns resolution order between single-item and bulk sprint moves.
 */
export function resolveTargetSprint({
  targetSprintName,
  targetProjectId,
  dbSprints = [],
  projectSettings = {} as any,
  allProjects = [],
  isAllProjects = false,
  currentProjectId = null,
}: ResolveTargetSprintParams): ResolvedSprintResult {
  if (!targetSprintName || targetSprintName === '__none__') {
    return { targetSprintDef: null, targetSprintId: null, isTargetActive: false };
  }

  const targetProjId = targetProjectId || (!isAllProjects ? currentProjectId : null);

  // 1. Get effective project settings for targetProjId
  const effectiveSettings: any = targetProjId
    ? getItemProjectSettings({ project_id: targetProjId }, allProjects as any, projectSettings as any, isAllProjects)
    : projectSettings;

  const projectSprintDefs = effectiveSettings?.sprint_settings?.sprints || [];

  // Priority 1: Exact target-project relational sprint match with valid UUID (avoids global shadow)
  const exactDbMatch = targetProjId
    ? dbSprints.find(
        (s) =>
          (s.name === targetSprintName || s.id === targetSprintName) &&
          s.project_id === targetProjId &&
          s.id &&
          UUID_REGEX.test(s.id)
      )
    : null;

  // Priority 2: Global/workspace-wide relational sprint match (null or unassigned project_id)
  const globalDbMatch = dbSprints.find(
    (s) =>
      (s.name === targetSprintName || s.id === targetSprintName) &&
      !s.project_id &&
      s.id &&
      UUID_REGEX.test(s.id) &&
      (!isAllProjects || Boolean(targetProjId))
  );

  const dbMatch = exactDbMatch || globalDbMatch || null;

  // Priority 3: Exact target-project settings sprint match
  const exactSettingsMatch = targetProjId
    ? projectSprintDefs.find(
        (s: any) =>
          (s.name === targetSprintName || s.id === targetSprintName) &&
          s.project_id === targetProjId
      )
    : null;

  // Priority 4: Global settings sprint match (null or unassigned project_id)
  const globalSettingsMatch = projectSprintDefs.find(
    (s: any) =>
      (s.name === targetSprintName || s.id === targetSprintName) &&
      (!s.project_id || s.project_id === targetProjId) &&
      (!isAllProjects || Boolean(targetProjId))
  );

  const settingsMatch = exactSettingsMatch || globalSettingsMatch || null;

  // Relational sprint with valid UUID takes precedence, merged with any settings metadata
  const targetSprintDef: SprintDefinition | null = dbMatch
    ? {
        ...settingsMatch,
        ...dbMatch,
        metadata: {
          ...(settingsMatch?.metadata || {}),
          ...(dbMatch.metadata || {}),
        },
      }
    : settingsMatch || null;

  const rawId = dbMatch?.id || (settingsMatch?.id && UUID_REGEX.test(settingsMatch.id) ? settingsMatch.id : null);
  const targetSprintId = rawId && UUID_REGEX.test(rawId) ? rawId : null;
  const isTargetActive = targetSprintDef ? isSprintActive(targetSprintDef) : false;

  return { targetSprintDef, targetSprintId, isTargetActive };
}
