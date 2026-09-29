import { supabaseAdmin } from '@/lib/db';
import { WorkItem, ProjectSettings, SprintDefinition } from '@/types/tracker';
import { calculateSprintLeafPoints } from '@/lib/sprint-utils';

export interface SprintScopeData {
  id: string;
  name: string;
  status: 'planned' | 'active' | 'completed' | 'unplanned' | string;
  is_active?: boolean;
  started_at?: string | null;
  ends_at?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  committed_points?: number;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface IntakeValidationOptions {
  ejectedItemIds?: string[];
  ejectedItems?: WorkItem[];
  overrideP0?: boolean;
  isEmergency?: boolean;
  now?: Date | string | number;
}

export interface IntakeValidationResult {
  valid: boolean;
  elapsed_ratio?: number;
  required_ejection_points: number;
  remaining_capacity?: number;
  current_active_points?: number;
  committed_points?: number;
  ejected_items?: WorkItem[];
  ejected_item_ids?: string[];
}

export class SprintGuardrailError extends Error {
  code: 'SCOPE_OVERFLOW' | 'LATE_RUNWAY_EXCEEDED' | 'ESTIMATE_LOCKED' | 'INVALID_EJECTION' | string;
  status: number;
  required_ejection_points?: number;
  details?: Record<string, any>;

  constructor(opts: {
    code: 'SCOPE_OVERFLOW' | 'LATE_RUNWAY_EXCEEDED' | 'ESTIMATE_LOCKED' | 'INVALID_EJECTION' | string;
    message: string;
    status?: number;
    required_ejection_points?: number;
    details?: Record<string, any>;
  }) {
    super(opts.message);
    this.name = 'SprintGuardrailError';
    this.code = opts.code;
    this.status = opts.status ?? (opts.code === 'INVALID_EJECTION' ? 400 : 409);
    this.required_ejection_points = opts.required_ejection_points;
    this.details = opts.details;
  }
}

/**
 * Standard unstarted / backlog status identifiers.
 */
export const UNSTARTED_STATUSES = new Set([
  'not_started',
  'todo',
  'unplanned',
  'backlog',
  'open',
  'planned',
  'pitch_backlog',
]);

/**
 * Check if a status represents an unstarted work item eligible for ejection.
 */
export function isUnstartedStatus(status?: string | null): boolean {
  if (!status) return true;
  return UNSTARTED_STATUSES.has(status.toLowerCase().trim());
}

/**
 * Check whether a sprint is considered active.
 */
export function isSprintActive(sprint?: Partial<SprintScopeData> | null): boolean {
  if (!sprint) return false;
  if (sprint.is_active === true) return true;
  if (sprint.is_current === true) return true;
  const st = String(sprint.status || '').toLowerCase().trim();
  return st === 'active' || st === 'in_progress';
}

/**
 * Calculates elapsed sprint ratio: (now - started_at) / (ends_at - started_at).
 * Returns a number between 0.0 and 1.0 (or greater if past ends_at).
 */
export function calculateElapsedRatio(
  startedAt?: string | number | Date | null,
  endsAt?: string | number | Date | null,
  nowTime?: string | number | Date | null
): number {
  if (!startedAt || !endsAt) return 0.0;

  const startMs = new Date(startedAt).getTime();
  const endMs = new Date(endsAt).getTime();
  const nowMs = nowTime ? new Date(nowTime).getTime() : Date.now();

  if (isNaN(startMs) || isNaN(endMs) || isNaN(nowMs)) return 0.0;
  if (endMs <= startMs) return 1.0;

  const ratio = (nowMs - startMs) / (endMs - startMs);
  return Math.max(0.0, ratio);
}

/**
 * Extracts numeric story points from item metadata or root attributes.
 */
export function extractStoryPoints(item?: Partial<WorkItem> | any): number {
  if (!item) return 0;
  const p = item.metadata?.story_points ?? item.story_points ?? item.points ?? item.metadata?.points ?? item.metadata?.estimate;
  const num = Number(p);
  return isNaN(num) || num < 0 ? 0 : num;
}

/**
 * Checks if work item is a feature / story type subject to late runway sizing.
 */
export function isFeatureStory(item?: Partial<WorkItem> | any): boolean {
  if (!item) return false;
  const type = String(item.item_type || item.type || item.metadata?.item_type || '').toLowerCase().trim();
  return type === 'story' || type === 'feature';
}

/**
 * Pure validation engine for sprint intake. Isolated with 0 external database calls.
 */
export function validateSprintIntakePure(params: {
  sprint: Partial<SprintScopeData>;
  currentSprintItems: WorkItem[];
  incomingItem: Partial<WorkItem> | any;
  options?: IntakeValidationOptions;
}): IntakeValidationResult {
  const { sprint, currentSprintItems, incomingItem, options } = params;

  // 1. Check P0 Emergency Override flag
  const isEmergency = Boolean(
    options?.overrideP0 ||
    options?.isEmergency ||
    incomingItem.priority === 'P0' ||
    incomingItem.metadata?.priority === 'P0' ||
    incomingItem.priority === 'Critical' && incomingItem.metadata?.is_emergency
  );

  if (isEmergency) {
    return {
      valid: true,
      required_ejection_points: 0,
      ejected_items: options?.ejectedItems || [],
      ejected_item_ids: options?.ejectedItemIds || [],
    };
  }

  // If sprint is not active, guardrails do not block intake
  if (!isSprintActive(sprint)) {
    return {
      valid: true,
      required_ejection_points: 0,
      ejected_items: options?.ejectedItems || [],
      ejected_item_ids: options?.ejectedItemIds || [],
    };
  }

  // 2. Guardrail 2: Late-Sprint Runway Rules
  // Calculate elapsed sprint timeline: elapsed_ratio = (now() - started_at) / (ends_at - started_at)
  const startedAt = sprint.started_at || sprint.start_date;
  const endsAt = sprint.ends_at || sprint.end_date;
  let elapsedRatio = 0.0;

  if (startedAt && endsAt) {
    elapsedRatio = calculateElapsedRatio(startedAt, endsAt, options?.now);

    // If elapsed_ratio > 0.60 (last 40% of sprint runway), enforce strict sizing:
    // Block any new feature story intake where story_points > 2. Only allow non-feature chores, test debt, or documentation tasks.
    if (elapsedRatio > 0.60) {
      const incomingPoints = extractStoryPoints(incomingItem);
      if (isFeatureStory(incomingItem) && incomingPoints > 2) {
        throw new SprintGuardrailError({
          code: 'LATE_RUNWAY_EXCEEDED',
          status: 409,
          message: `Late-sprint runway threshold exceeded (${(elapsedRatio * 100).toFixed(1)}% elapsed > 60%). New feature stories are capped at 2 story points during the final 40% of the sprint. Only non-feature chores, test debt, or documentation tasks may exceed 2 points.`,
          details: {
            elapsed_ratio: elapsedRatio,
            threshold: 0.60,
            incoming_points: incomingPoints,
            item_type: incomingItem.item_type || incomingItem.type || 'story',
          },
        });
      }
    }
  }

  // 3. Guardrail 1: Strict Zero-Sum Swap API
  // Invariant: Total Active Points <= Sprint Commitment
  const committedPoints = sprint.committed_points ?? sprint.metadata?.committed_points;

  if (committedPoints !== undefined && committedPoints !== null) {
    // Current points in sprint (filtering out incomingItem if it was already in currentSprintItems)
    const existingSprintItems = (currentSprintItems || []).filter((it) => {
      if (incomingItem.id && it.id === incomingItem.id) return false;
      if (incomingItem.external_ref_id && it.external_ref_id && it.external_ref_id === incomingItem.external_ref_id) {
        return false;
      }
      return true;
    });
    const currentActivePoints = existingSprintItems.reduce((acc, it) => acc + extractStoryPoints(it), 0);
    const incomingPoints = extractStoryPoints(incomingItem);
    const remainingCapacity = Math.max(0, committedPoints - currentActivePoints);

    if (incomingPoints > remainingCapacity) {
      const requiredEjectionPoints = incomingPoints - remainingCapacity;

      // Check if unstarted items are provided for atomic ejection
      const candidateEjections: WorkItem[] = [];

      if (options?.ejectedItems && options.ejectedItems.length > 0) {
        candidateEjections.push(...options.ejectedItems);
      } else if (options?.ejectedItemIds && options.ejectedItemIds.length > 0) {
        const idSet = new Set(options.ejectedItemIds);
        for (const it of existingSprintItems) {
          if (idSet.has(it.id) || (it.external_ref_id && idSet.has(it.external_ref_id))) {
            candidateEjections.push(it);
          }
        }
      }

      // Validate ejection candidates: must be in sprint and unstarted
      let totalEjectedPoints = 0;
      for (const ejected of candidateEjections) {
        if (!isUnstartedStatus(ejected.status)) {
          throw new SprintGuardrailError({
            code: 'INVALID_EJECTION',
            status: 400,
            message: `Cannot eject item '${ejected.title || ejected.id}' (status: ${ejected.status}). Only unstarted items can be ejected back to the backlog.`,
            details: {
              invalid_item_id: ejected.id,
              status: ejected.status,
            },
          });
        }
        totalEjectedPoints += extractStoryPoints(ejected);
      }

      if (totalEjectedPoints < requiredEjectionPoints) {
        throw new SprintGuardrailError({
          code: 'SCOPE_OVERFLOW',
          status: 409,
          required_ejection_points: requiredEjectionPoints,
          message: `Sprint capacity exceeded by ${requiredEjectionPoints} points (Committed: ${committedPoints}, Current: ${currentActivePoints}, Incoming: ${incomingPoints}, Remaining: ${remainingCapacity}). Required ejection: at least ${requiredEjectionPoints} unstarted points. Provided: ${totalEjectedPoints} points.`,
          details: {
            code: 'SCOPE_OVERFLOW',
            required_ejection_points: requiredEjectionPoints,
            committed_points: committedPoints,
            current_active_points: currentActivePoints,
            remaining_capacity: remainingCapacity,
            incoming_points: incomingPoints,
            ejected_points: totalEjectedPoints,
          },
        });
      }

      return {
        valid: true,
        elapsed_ratio: elapsedRatio,
        required_ejection_points: requiredEjectionPoints,
        remaining_capacity: remainingCapacity,
        current_active_points: currentActivePoints,
        committed_points: committedPoints,
        ejected_items: candidateEjections,
        ejected_item_ids: candidateEjections.map((it) => it.id),
      };
    }

    return {
      valid: true,
      elapsed_ratio: elapsedRatio,
      required_ejection_points: 0,
      remaining_capacity: remainingCapacity,
      current_active_points: currentActivePoints,
      committed_points: committedPoints,
    };
  }

  return {
    valid: true,
    elapsed_ratio: elapsedRatio,
    required_ejection_points: 0,
  };
}

/**
 * Guardrail 3 (Immutable Estimates):
 * Validates that story_points are not changed while an item is in an active sprint.
 */
export function validateEstimateImmutability(
  currentItem: Partial<WorkItem>,
  incomingMetadata: Record<string, any>,
  sprint?: Partial<SprintScopeData> | null
): void {
  const oldPoints = currentItem.metadata?.story_points;
  const newPoints = incomingMetadata?.story_points;

  // If story_points did not change, always allow
  if (oldPoints === undefined && newPoints === undefined) return;
  if (String(oldPoints ?? '') === String(newPoints ?? '')) return;

  if (sprint && isSprintActive(sprint)) {
    throw new SprintGuardrailError({
      code: 'ESTIMATE_LOCKED',
      status: 409,
      message: 'Estimates locked while sprint is active: cannot modify story_points on active sprint items',
      details: {
        item_id: currentItem.id,
        before: oldPoints,
        after: newPoints,
        sprint: sprint.name,
      },
    });
  }
}

/**
 * Server-side entry point for validateSprintIntake. Queries Supabase for tenant,
 * sprint definition, and current sprint work items, then evaluates sprint invariants.
 */
export async function validateSprintIntake(
  tenantSlug: string,
  sprintIdOrName: string,
  incomingItem: Partial<WorkItem> | any,
  options?: IntakeValidationOptions
): Promise<IntakeValidationResult> {
  const service = supabaseAdmin;

  // 1. Fetch tenant
  let tenantQuery: any = service
    .from('tenants')
    .select('id, slug, name')
    .eq('slug', tenantSlug);

  if (typeof tenantQuery.is === 'function') {
    tenantQuery = tenantQuery.is('deleted_at', null);
  }

  const { data: tenant, error: tenantErr } = await tenantQuery.maybeSingle();
  if (tenantErr || !tenant) {
    throw new Error(`Workspace "@${tenantSlug}" not found: ${tenantErr?.message || 'tenant null'}`);
  }

  // 2. Fetch sprint from tracker.sprints or tracker.projects.settings
  let sprintData: Partial<SprintScopeData> | null = null;

  // Attempt tracker.sprints table first
  try {
    const { data: dbSprint } = await service
      .from('sprints')
      .select('*')
      .eq('tenant_id', tenant.id)
      .or(`name.eq.${sprintIdOrName},id.eq.${sprintIdOrName}`)
      .maybeSingle();

    if (dbSprint) {
      sprintData = {
        ...dbSprint,
        is_active: dbSprint.is_active ?? (dbSprint.status === 'active' || dbSprint.status === 'in_progress'),
      };
    }
  } catch {
    // tracker.sprints table may not exist yet in tests or legacy environments
  }

  // Fallback to project settings sprint_settings
  if (!sprintData) {
    let projQuery: any = service
      .from('projects')
      .select('id, name, slug, settings')
      .eq('tenant_id', tenant.id);

    if (typeof projQuery.is === 'function') {
      projQuery = projQuery.is('deleted_at', null);
    }

    const { data: projects } = await projQuery;
    for (const p of projects || []) {
      const sprints: SprintDefinition[] = p.settings?.sprint_settings?.sprints || [];
      const matched = sprints.find((s) => s.name === sprintIdOrName || s.id === sprintIdOrName);
      if (matched) {
        sprintData = {
          ...matched,
          is_active: matched.is_current || matched.status === 'active',
          started_at: (matched as any).started_at || matched.start_date,
          ends_at: (matched as any).ends_at || matched.end_date,
          committed_points: (matched as any).committed_points,
        };
        break;
      }
    }
  }

  // If sprint could not be found, default to non-active sprint object
  if (!sprintData) {
    sprintData = {
      id: sprintIdOrName,
      name: sprintIdOrName,
      status: 'planned',
      is_active: false,
    };
  }

  // 3. Fetch current work items in the sprint
  let itemsQuery: any = service
    .from('work_items')
    .select('*')
    .eq('tenant_id', tenant.id);

  if (typeof itemsQuery.is === 'function') {
    itemsQuery = itemsQuery.is('deleted_at', null);
  }

  const { data: allItems } = await itemsQuery;
  const currentSprintItems = (allItems || []).filter(
    (it: any) =>
      it.metadata?.sprint === sprintData?.name ||
      it.metadata?.sprint_id === sprintData?.id ||
      it.metadata?.sprint === sprintIdOrName
  );

  return validateSprintIntakePure({
    sprint: sprintData,
    currentSprintItems,
    incomingItem,
    options,
  });
}
