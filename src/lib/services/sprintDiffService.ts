/**
 * Sprint Snapshot Delta Computation Engine
 * File: src/lib/services/sprintDiffService.ts
 *
 * Computes discrete delta categories (injected, ejected, estimate drift, status drift)
 * and aggregate churn metrics between any two historical sprint snapshots or live state.
 */

import { supabaseAdmin } from '@/lib/db';
import { isMissingSprintIdColumnError } from '@/lib/bulk-items';

export interface SnapshotItem {
  id: string;
  title: string;
  external_ref_id?: string | null;
  status: string;
  story_points: number;
  assignee?: string | null;
  item_type?: string;
  created_at?: string;
  updated_at?: string;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface EstimateDriftItem {
  item: SnapshotItem;
  base_points: number;
  target_points: number;
  delta: number;
}

export interface StatusDriftItem {
  item: SnapshotItem;
  base_status: string;
  target_status: string;
}

export interface SnapshotMetadata {
  id: string;
  name?: string;
  captured_at?: string;
  snapshot_type?: string;
  is_live?: boolean;
  total_points: number;
  total_items: number;
}

export interface SprintSnapshotDiff {
  base_snapshot: SnapshotMetadata | null;
  target_snapshot: SnapshotMetadata | null;
  injected: SnapshotItem[];
  ejected: SnapshotItem[];
  estimate_drift: EstimateDriftItem[];
  status_drift: StatusDriftItem[];
  net_points_delta: number;
  churn_rate_pct: number;
  injected_points: number;
  ejected_points: number;
  estimate_drift_points: number;
}

export type SnapshotDiffResult = SprintSnapshotDiff;

/**
 * Normalizes an item or raw database row into canonical SnapshotItem format.
 */
export function normalizeSnapshotItem(raw: any): SnapshotItem {
  if (!raw) {
    return {
      id: '',
      title: 'Untitled',
      status: 'not_started',
      story_points: 0,
    };
  }

  const storyPoints =
    typeof raw.story_points === 'number'
      ? raw.story_points
      : typeof raw.metadata?.story_points === 'number'
      ? raw.metadata.story_points
      : typeof raw.points === 'number'
      ? raw.points
      : 0;

  return {
    id: String(raw.id || ''),
    title: raw.title || 'Untitled',
    external_ref_id: raw.external_ref_id || raw.metadata?.external_ref_id || null,
    status: raw.status || 'not_started',
    story_points: storyPoints,
    assignee: raw.assignee || raw.metadata?.assignee || null,
    item_type: raw.item_type || raw.type || raw.metadata?.item_type || 'task',
    created_at: raw.created_at || raw.metadata?.created_at,
    updated_at: raw.updated_at || raw.metadata?.updated_at,
    metadata: raw.metadata || {},
  };
}

/**
 * Pure set-difference computation engine between two arrays of snapshot items.
 */
export function computeSnapshotItemDiff(
  baseItems: any[],
  targetItems: any[],
  baseMeta?: Partial<SnapshotMetadata> | null,
  targetMeta?: Partial<SnapshotMetadata> | null
): SprintSnapshotDiff {
  const normalizedBase = (baseItems || []).map(normalizeSnapshotItem);
  const normalizedTarget = (targetItems || []).map(normalizeSnapshotItem);

  const baseMap = new Map<string, SnapshotItem>();
  normalizedBase.forEach((it) => {
    if (it.id) baseMap.set(it.id, it);
  });

  const targetMap = new Map<string, SnapshotItem>();
  normalizedTarget.forEach((it) => {
    if (it.id) targetMap.set(it.id, it);
  });

  // 1. Injected: present in target but absent in base
  const injected: SnapshotItem[] = [];
  normalizedTarget.forEach((targetItem) => {
    if (!baseMap.has(targetItem.id)) {
      injected.push(targetItem);
    }
  });

  // 2. Ejected: present in base but absent in target
  const ejected: SnapshotItem[] = [];
  normalizedBase.forEach((baseItem) => {
    if (!targetMap.has(baseItem.id)) {
      ejected.push(baseItem);
    }
  });

  // 3. Estimate Drift & Status Drift: present in both
  const estimate_drift: EstimateDriftItem[] = [];
  const status_drift: StatusDriftItem[] = [];

  normalizedTarget.forEach((targetItem) => {
    const baseItem = baseMap.get(targetItem.id);
    if (baseItem) {
      if (baseItem.story_points !== targetItem.story_points) {
        const delta = targetItem.story_points - baseItem.story_points;
        estimate_drift.push({
          item: targetItem,
          base_points: baseItem.story_points,
          target_points: targetItem.story_points,
          delta,
        });
      }

      if (baseItem.status !== targetItem.status) {
        status_drift.push({
          item: targetItem,
          base_status: baseItem.status,
          target_status: targetItem.status,
        });
      }
    }
  });

  // 4. Metric aggregates
  const injected_points = injected.reduce((acc, it) => acc + (it.story_points || 0), 0);
  const ejected_points = ejected.reduce((acc, it) => acc + (it.story_points || 0), 0);
  const estimate_drift_points = estimate_drift.reduce((acc, it) => acc + it.delta, 0);

  const net_points_delta = injected_points - ejected_points + estimate_drift_points;

  const baseline_points = normalizedBase.reduce((acc, it) => acc + (it.story_points || 0), 0);
  const churn_rate_pct =
    baseline_points > 0
      ? Math.round(((injected_points + ejected_points) / baseline_points) * 1000) / 10
      : 0;

  const baseSnapshotMeta: SnapshotMetadata | null = baseMeta
    ? {
        id: baseMeta.id || 'base',
        name: baseMeta.name || 'Baseline',
        captured_at: baseMeta.captured_at,
        snapshot_type: baseMeta.snapshot_type || 'commitment_baseline',
        is_live: false,
        total_points: baseline_points,
        total_items: normalizedBase.length,
      }
    : null;

  const target_points = normalizedTarget.reduce((acc, it) => acc + (it.story_points || 0), 0);
  const targetSnapshotMeta: SnapshotMetadata | null = targetMeta
    ? {
        id: targetMeta.id || 'target',
        name: targetMeta.name || (targetMeta.is_live ? 'Current Live State' : 'Target Snapshot'),
        captured_at: targetMeta.captured_at,
        snapshot_type: targetMeta.snapshot_type,
        is_live: !!targetMeta.is_live,
        total_points: target_points,
        total_items: normalizedTarget.length,
      }
    : null;

  return {
    base_snapshot: baseSnapshotMeta,
    target_snapshot: targetSnapshotMeta,
    injected,
    ejected,
    estimate_drift,
    status_drift,
    net_points_delta,
    churn_rate_pct,
    injected_points,
    ejected_points,
    estimate_drift_points,
  };
}

/**
 * Helper to extract or reconstruct snapshot items as of snapshot.captured_at
 */
export async function extractSnapshotItems(
  snapshot: any,
  tenantId: string,
  projectId?: string
): Promise<SnapshotItem[]> {
  if (!snapshot) return [];

  // 1. Direct itemized breakdown on snapshot
  if (Array.isArray(snapshot.assignee_breakdown?.items)) {
    return snapshot.assignee_breakdown.items.map(normalizeSnapshotItem);
  }
  if (Array.isArray(snapshot.items)) {
    return snapshot.items.map(normalizeSnapshotItem);
  }

  // 2. Reconstruct from committed_item_ids and audit events at captured_at
  if (Array.isArray(snapshot.committed_item_ids) && snapshot.committed_item_ids.length > 0) {
    let itemsQuery: any = supabaseAdmin
      .from('work_items')
      .select('id, title, status, sprint_id, metadata, item_type, assignee, created_at, updated_at')
      .eq('tenant_id', tenantId);

    if (projectId && typeof itemsQuery?.eq === 'function') {
      itemsQuery = itemsQuery.eq('project_id', projectId);
    }

    if (typeof itemsQuery?.in === 'function') {
      itemsQuery = itemsQuery.in('id', snapshot.committed_item_ids);
    }

    let { data: itemsFromDb, error: itemsErr } = await itemsQuery;
    if (itemsErr && isMissingSprintIdColumnError(itemsErr)) {
      let fallbackQuery: any = supabaseAdmin
        .from('work_items')
        .select('id, title, status, metadata, item_type, assignee, created_at, updated_at')
        .eq('tenant_id', tenantId);

      if (projectId && typeof fallbackQuery?.eq === 'function') {
        fallbackQuery = fallbackQuery.eq('project_id', projectId);
      }

      if (typeof fallbackQuery?.in === 'function') {
        fallbackQuery = fallbackQuery.in('id', snapshot.committed_item_ids);
      }

      const retryRes = await fallbackQuery;
      itemsFromDb = retryRes.data;
    }
    const rawItems = itemsFromDb || [];

    const snapshotTimestampMs = snapshot.captured_at
      ? new Date(snapshot.captured_at).getTime()
      : Infinity;

    // Filter out items created strictly after the snapshot was captured
    const validItems = rawItems.filter((it: any) => {
      if (!it.created_at || !snapshot.captured_at) return true;
      return new Date(it.created_at).getTime() <= snapshotTimestampMs;
    });

    // Query sprint_events occurring after captured_at to roll back mutations
    let eventsAfterSnapshot: any[] = [];
    if (snapshot.captured_at) {
      try {
        let evQuery: any = supabaseAdmin
          .from('sprint_events')
          .select('work_item_id, event_type, previous_state, old_state, new_state, points_delta, occurred_at')
          .in('work_item_id', snapshot.committed_item_ids)
          .gt('occurred_at', snapshot.captured_at);

        if (typeof evQuery?.order === 'function') {
          evQuery = evQuery.order('occurred_at', { ascending: false });
        }
        const { data: evData } = await evQuery;
        if (Array.isArray(evData)) eventsAfterSnapshot = evData;
      } catch {
        // Fallback gracefully if sprint_events table is unmocked or empty
      }
    }

    return validItems.map((it: any) => {
      let effectiveStatus = it.status;
      let effectivePoints =
        typeof it.metadata?.story_points === 'number'
          ? it.metadata.story_points
          : typeof it.story_points === 'number'
          ? it.story_points
          : 0;

      // Find transitions for this item occurring after snapshot was captured
      const itemEvents = eventsAfterSnapshot.filter((e) => e.work_item_id === it.id);
      for (const ev of itemEvents) {
        if (ev.event_type === 'status_transition' && (ev.previous_state?.status || ev.old_state?.status)) {
          effectiveStatus = ev.previous_state?.status || ev.old_state?.status;
        }
        if (ev.event_type === 'estimate_change') {
          if (typeof ev.previous_state?.points === 'number') {
            effectivePoints = ev.previous_state.points;
          } else if (typeof ev.points_delta === 'number' && ev.points_delta !== 0) {
            effectivePoints -= ev.points_delta;
          }
        }
      }

      return normalizeSnapshotItem({
        ...it,
        status: effectiveStatus,
        story_points: Math.max(0, effectivePoints),
      });
    });
  }

  return [];
}

/**
 * Server Service: queries snapshots or live board items and calculates full diff.
 */
export async function getSprintSnapshotDiff(
  tenantId: string,
  sprintId: string,
  options?: {
    baseSnapshotId?: string;
    targetSnapshotId?: string;
    projectId?: string;
  }
): Promise<{ data: SprintSnapshotDiff | null; error: string | null }> {
  try {
    // 0. Resolve project slug to UUID if provided as a slug
    let resolvedProjectId: string | undefined = undefined;
    if (options?.projectId && options.projectId !== 'all') {
      const isProjectUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(options.projectId);
      if (isProjectUuid) {
        resolvedProjectId = options.projectId;
      } else {
        try {
          const projLookup: any = supabaseAdmin
            .from('projects')
            .select('id')
            .eq('tenant_id', tenantId)
            .eq('slug', options.projectId);
          if (typeof projLookup?.maybeSingle === 'function') {
            const { data: projRecord } = await projLookup.maybeSingle();
            if (projRecord?.id) resolvedProjectId = projRecord.id;
          }
        } catch {
          // ignore
        }
        if (!resolvedProjectId) resolvedProjectId = options.projectId;
      }
    }

    // Match sprint by UUID or name safely using parameterized .in filter (prevents PostgREST filter injection)
    const sprintIdentifiers = new Set<string>([sprintId]);
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(sprintId);
    let sprintRecordProjectId: string | null = null;

    try {
      let sprintLookup: any = supabaseAdmin
        .from('sprints')
        .select('id, name, project_id')
        .eq('tenant_id', tenantId);

      if (isUuid) {
        sprintLookup = sprintLookup.eq('id', sprintId);
      } else {
        sprintLookup = sprintLookup.eq('name', sprintId);
      }

      if (typeof sprintLookup?.maybeSingle === 'function') {
        const { data: sprintRecord } = await sprintLookup.maybeSingle();
        if (sprintRecord?.id) sprintIdentifiers.add(sprintRecord.id);
        if (sprintRecord?.name) sprintIdentifiers.add(sprintRecord.name);
        if (sprintRecord?.project_id) sprintRecordProjectId = sprintRecord.project_id;
      }
    } catch {
      // Graceful fallback to sprintId directly
    }

    if (!resolvedProjectId && sprintRecordProjectId) {
      resolvedProjectId = sprintRecordProjectId;
    }

    // 1. Fetch available snapshots for the sprint
    let query: any = supabaseAdmin
      .from('sprint_snapshots')
      .select('*')
      .eq('tenant_id', tenantId);

    if (resolvedProjectId) {
      query = query.eq('project_id', resolvedProjectId);
    }

    query = query.in('sprint_id', Array.from(sprintIdentifiers));

    const { data: rawSnapshots, error: snapErr } = await query.order('captured_at', {
      ascending: true,
    });

    if (snapErr) {
      return { data: null, error: `Failed to load snapshots: ${snapErr.message}` };
    }

    const snapshots = rawSnapshots || [];

    if (!resolvedProjectId && snapshots.length > 0 && snapshots[0].project_id) {
      resolvedProjectId = snapshots[0].project_id;
    }

    // 2. Resolve base snapshot
    let baseSnap: any = null;
    if (options?.baseSnapshotId) {
      baseSnap = snapshots.find((s: any) => s.id === options.baseSnapshotId);
      if (!baseSnap && options.baseSnapshotId === 'baseline') {
        baseSnap =
          snapshots.find((s: any) => s.snapshot_type === 'commitment_baseline') || snapshots[0];
      }
    } else {
      baseSnap =
        snapshots.find((s: any) => s.snapshot_type === 'commitment_baseline') || snapshots[0];
    }

    // 3. Resolve target snapshot (live state or specific snapshot)
    const isTargetLive =
      !options?.targetSnapshotId ||
      options.targetSnapshotId === 'live' ||
      options.targetSnapshotId === 'now';

    let targetSnap: any = null;
    if (!isTargetLive && options?.targetSnapshotId) {
      targetSnap = snapshots.find((s: any) => s.id === options.targetSnapshotId);
    }

    // 4. Extract base items
    let baseItems: SnapshotItem[] = [];
    if (baseSnap) {
      baseItems = await extractSnapshotItems(baseSnap, tenantId, resolvedProjectId);
    }

    // 5. Extract target items
    let targetItems: SnapshotItem[] = [];
    if (isTargetLive) {
      // Reconstruct target from current live work_items associated with this sprint
      let itemsQuery: any = supabaseAdmin
        .from('work_items')
        .select('id, title, status, sprint_id, metadata, item_type, assignee, created_at, updated_at')
        .eq('tenant_id', tenantId);

      if (resolvedProjectId && typeof itemsQuery?.eq === 'function') {
        itemsQuery = itemsQuery.eq('project_id', resolvedProjectId);
      }

      if (typeof itemsQuery?.is === 'function') {
        itemsQuery = itemsQuery.is('deleted_at', null);
      }

      let { data: allItems, error: itemsErr } = await itemsQuery;
      if (itemsErr && isMissingSprintIdColumnError(itemsErr)) {
        let fallbackQuery: any = supabaseAdmin
          .from('work_items')
          .select('id, title, status, metadata, item_type, assignee, created_at, updated_at')
          .eq('tenant_id', tenantId);

        if (resolvedProjectId && typeof fallbackQuery?.eq === 'function') {
          fallbackQuery = fallbackQuery.eq('project_id', resolvedProjectId);
        }

        if (typeof fallbackQuery?.is === 'function') {
          fallbackQuery = fallbackQuery.is('deleted_at', null);
        }

        const retryRes = await fallbackQuery;
        allItems = retryRes.data;
      }

      targetItems = (allItems || [])
        .filter((it: any) => {
          const metaSprint = it.metadata?.sprint;
          const metaSprintId = it.metadata?.sprint_id;
          // When metadata contains sprint details, metadata is the single authoritative source of truth
          if (metaSprint || metaSprintId) {
            return Boolean(
              (metaSprint && sprintIdentifiers.has(metaSprint)) ||
              (metaSprintId && sprintIdentifiers.has(metaSprintId))
            );
          }
          // If metadata exists and explicitly cleared sprint (backlog), never match stale relational column
          if (it.metadata && ('sprint' in it.metadata || 'sprint_id' in it.metadata)) {
            return false;
          }
          // Only fallback to relational column when metadata is missing sprint keys
          const directSprintId = it.sprint_id;
          return Boolean(directSprintId && sprintIdentifiers.has(directSprintId));
        })
        .map(normalizeSnapshotItem);
    } else if (targetSnap) {
      targetItems = await extractSnapshotItems(targetSnap, tenantId, resolvedProjectId);
    }

    // 6. Compute diff
    const diff = computeSnapshotItemDiff(
      baseItems,
      targetItems,
      baseSnap
        ? {
            id: baseSnap.id,
            name: baseSnap.snapshot_type === 'commitment_baseline' ? 'Sprint Baseline (Day 1)' : baseSnap.captured_at?.split('T')[0],
            captured_at: baseSnap.captured_at,
            snapshot_type: baseSnap.snapshot_type,
          }
        : null,
      isTargetLive
        ? {
            id: 'live',
            name: 'Current Live State',
            captured_at: new Date().toISOString(),
            is_live: true,
          }
        : targetSnap
        ? {
            id: targetSnap.id,
            name: targetSnap.captured_at?.split('T')[0] || targetSnap.id,
            captured_at: targetSnap.captured_at,
            snapshot_type: targetSnap.snapshot_type,
            is_live: false,
          }
        : null
    );

    return { data: diff, error: null };
  } catch (err: any) {
    return { data: null, error: err.message || 'Failed to compute snapshot delta' };
  }
}

export const SprintDiffService = {
  normalizeSnapshotItem,
  computeSnapshotItemDiff,
  getSprintSnapshotDiff,
};
