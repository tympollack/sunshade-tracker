import {
  LifecycleStage,
  LiveDashboardSettings,
  ProjectSettings,
  WorkItem,
  getWorkMetricConfig,
  resolveLiveDashboardSettings,
} from '@/types/tracker';
import { normalizeProjectSettings } from '@/lib/project-settings-utils';
import {
  resolveItemLifecycle,
  filterInFlightItems,
  resolveTerminalCompletionMs,
  TERMINAL_GRACE_PERIOD_MS,
} from './lifecycleNormalizer';

export const DEFAULT_PROJECT_WIP_LIMIT = 8;
export const ROLLING_THROUGHPUT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

export interface StageDwellRadarEntry {
  item_id: string;
  external_ref_id?: string | null;
  title: string;
  project_id: string;
  project_slug: string;
  project_name: string;
  stage: LifecycleStage;
  status: string;
  dwell_ms: number;
  dwell_hours: number;
  stage_median_ms: number;
  stage_median_hours: number;
  dwell_ratio: number;
  work_units: number;
  unit_label: string;
  flag_label: string;
}

export interface ScopeDriftSummary {
  added_units: number;
  dropped_units: number;
  net_change: number;
}

export interface SystemicBlockerEntry {
  item_id: string;
  external_ref_id?: string | null;
  title: string;
  project_id: string;
  project_slug: string;
  project_name: string;
  stage: LifecycleStage;
  reason: string;
}

export interface EnrichedInFlightItem extends WorkItem {
  lifecycle_stage: LifecycleStage;
  project_slug: string;
  project_name: string;
  status_label: string;
  status_color: string;
  work_units: number;
  unit_label: string;
  dwell_ms: number;
  dwell_hours: number;
  is_stagnant: boolean;
  stagnation_label?: string;
  is_blocked: boolean;
  blocker_reason?: string;
}

export interface ProjectSwimlaneSummary {
  project_id: string;
  project_slug: string;
  project_name: string;
  active_item_count: number;
  active_units: number;
  unit_label: string;
  wip_limit: number;
  wip_saturation_ratio: number;
  health_status: 'healthy' | 'approaching_limit' | 'saturated';
  items: EnrichedInFlightItem[];
}

export interface StageBucketSummary {
  stage: LifecycleStage;
  label: string;
  color: string;
  order: number;
  item_count: number;
  total_units: number;
  median_dwell_ms: number;
  median_dwell_hours: number;
  items: EnrichedInFlightItem[];
}

export interface InFlightTelemetryPayload {
  total_active_items: number;
  total_active_units: number;
  total_wip_capacity: number;
  wip_saturation_ratio: number;
  stage_dwell_radar: StageDwellRadarEntry[];
  scope_drift: ScopeDriftSummary;
  bottleneck_stage: LifecycleStage | null;
  bottleneck_stage_units: number;
  rolling_24h_completed_units: number;
  rolling_24h_completed_items: number;
  active_blockers: SystemicBlockerEntry[];
  stages: StageBucketSummary[];
  projects: ProjectSwimlaneSummary[];
  in_flight_items: EnrichedInFlightItem[];
  live_dashboard_settings: LiveDashboardSettings;
  synced_at: string;
}

export interface ComputeInFlightTelemetryInput {
  items: WorkItem[];
  projects: Array<{
    id: string;
    slug: string;
    name: string;
    settings?: ProjectSettings | null;
  }>;
  stageEntryTimestamps?: Map<string, number>;
  liveDashboardSettings?: Partial<LiveDashboardSettings> | null;
  scopeDriftOverride?: Partial<ScopeDriftSummary> | null;
  nowMs?: number;
}

/**
 * Resolves the work unit magnitude for a work item using its project's configured
 * `work_unit_field` or `work_metric_config.field_key` (falling back to 1 when unconfigured/unset).
 */
export function resolveItemWorkUnits(
  item: Pick<WorkItem, 'metadata'>,
  projectSettings?: ProjectSettings | null
): { units: number; unitLabel: string } {
  const metricConfig = getWorkMetricConfig(projectSettings);
  const configuredKey = projectSettings?.work_unit_field || metricConfig.field_key || 'story_points';
  const unitLabel = metricConfig.unit_label || 'pts';

  if (configuredKey === 'item_count') {
    return { units: 1, unitLabel: metricConfig.unit_label || 'items' };
  }

  const meta = item.metadata || {};
  const rawVal =
    configuredKey === 'story_points'
      ? meta.story_points ?? meta.points ?? meta.estimate ?? meta.complexity
      : meta[configuredKey];

  if (typeof rawVal === 'number' && Number.isFinite(rawVal) && rawVal >= 0) {
    return { units: rawVal, unitLabel };
  }
  if (typeof rawVal === 'string' && rawVal.trim() !== '') {
    const parsed = Number(rawVal);
    if (Number.isFinite(parsed) && parsed >= 0) {
      return { units: parsed, unitLabel };
    }
  }

  return { units: 1, unitLabel };
}

/**
 * Computes the statistical median of a numeric array.
 */
export function calculateMedian(values: number[]): number {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) {
    return sorted[mid];
  }
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * Inspects an item's metadata for systemic blockers or CI failures without personal blame.
 */
export function detectSystemicBlocker(
  item: Pick<WorkItem, 'metadata' | 'status'>
): { blocked: boolean; reason?: string } {
  const meta = item.metadata || {};
  if (meta.blocked === true || meta.is_blocked === true) {
    const reason =
      typeof meta.blocked_reason === 'string' && meta.blocked_reason.trim()
        ? meta.blocked_reason.trim()
        : typeof meta.blocker === 'string' && meta.blocker.trim()
        ? meta.blocker.trim()
        : 'Flagged as blocked in item metadata';
    return { blocked: true, reason };
  }

  const ciStatus = String(
    meta.ci_status || meta.ci_state || meta.verification_status || ''
  ).toLowerCase();
  if (ciStatus === 'failed' || ciStatus === 'failure' || ciStatus === 'error') {
    const reason =
      typeof meta.ci_failure_summary === 'string' && meta.ci_failure_summary.trim()
        ? meta.ci_failure_summary.trim()
        : 'CI / Verification pipeline failure';
    return { blocked: true, reason };
  }

  return { blocked: false };
}

/**
 * Pure aggregation engine computing blameless systemic flow telemetry across multiple projects.
 */
export function computeInFlightTelemetry(
  input: ComputeInFlightTelemetryInput
): InFlightTelemetryPayload {
  const nowMs = input.nowMs ?? Date.now();
  const liveSettings = resolveLiveDashboardSettings({
    live_dashboard_settings: input.liveDashboardSettings || undefined,
  });
  const stagnationMultiplier = liveSettings.stagnation_median_multiplier || 1.5;
  const stagnationLabel = liveSettings.stagnation_warning_label || 'Systemic Queue Stall';

  const projectMap = new Map<string, ProjectSettings>();
  const projectMetaMap = new Map<
    string,
    { id: string; slug: string; name: string; settings: ProjectSettings }
  >();

  for (const proj of input.projects || []) {
    const normalizedSettings = normalizeProjectSettings(proj.settings);
    projectMap.set(proj.id, normalizedSettings);
    projectMetaMap.set(proj.id, {
      id: proj.id,
      slug: proj.slug,
      name: proj.name,
      settings: normalizedSettings,
    });
  }

  const validItems = (input.items || []).filter((it) => it && !it.deleted_at);
  const inFlightCandidates = filterInFlightItems(
    validItems,
    projectMap,
    nowMs,
    TERMINAL_GRACE_PERIOD_MS,
    input.stageEntryTimestamps
  );

  // Separate active non-terminal in-flight items (execution, verification, staging) from terminal items
  const activeStageSet = new Set<LifecycleStage>(['execution', 'verification', 'staging']);

  // Compute dwell time per item and group by stage for median calculations
  const stageDwellValues = new Map<LifecycleStage, number[]>([
    ['execution', []],
    ['verification', []],
    ['staging', []],
  ]);

  const preliminaryItems = inFlightCandidates.map((item) => {
    const projMeta = projectMetaMap.get(item.project_id);
    const settings = projMeta?.settings;
    const stage = resolveItemLifecycle(item, settings);
    const { units, unitLabel } = resolveItemWorkUnits(item, settings);

    const statusDef = (settings?.statuses || []).find(
      (s) => s.id.toLowerCase() === String(item.status || '').toLowerCase()
    );

    const entryMs =
      input.stageEntryTimestamps?.get(item.id) ??
      (item.metadata?.stage_entered_at ? Date.parse(item.metadata.stage_entered_at) : NaN) ??
      NaN;

    const fallbackMs = Date.parse(item.updated_at || item.created_at || '');
    const effectiveStartMs = !Number.isNaN(entryMs)
      ? entryMs
      : !Number.isNaN(fallbackMs)
      ? fallbackMs
      : nowMs;

    const dwellMs = Math.max(0, nowMs - effectiveStartMs);

    if (activeStageSet.has(stage)) {
      stageDwellValues.get(stage)?.push(dwellMs);
    }

    const blockerCheck = detectSystemicBlocker(item);

    return {
      item,
      stage,
      projMeta,
      units,
      unitLabel,
      statusLabel: statusDef?.label || item.status,
      statusColor: statusDef?.color || '#38BDF8',
      dwellMs,
      blockerCheck,
    };
  });

  // Compute stage medians
  const stageMediansMs = new Map<LifecycleStage, number>();
  for (const [stage, values] of stageDwellValues.entries()) {
    stageMediansMs.set(stage, calculateMedian(values));
  }

  const stageDwellRadar: StageDwellRadarEntry[] = [];
  const activeBlockers: SystemicBlockerEntry[] = [];
  const enrichedItems: EnrichedInFlightItem[] = [];

  for (const entry of preliminaryItems) {
    const {
      item,
      stage,
      projMeta,
      units,
      unitLabel,
      statusLabel,
      statusColor,
      dwellMs,
      blockerCheck,
    } = entry;

    const projectSlug = projMeta?.slug || 'unknown';
    const projectName = projMeta?.name || 'Unknown Project';
    const medianMs = stageMediansMs.get(stage) || 0;
    const dwellHours = Number((dwellMs / (1000 * 60 * 60)).toFixed(2));
    const medianHours = Number((medianMs / (1000 * 60 * 60)).toFixed(2));

    const isStagnant =
      activeStageSet.has(stage) &&
      medianMs > 0 &&
      dwellMs > medianMs * stagnationMultiplier;

    const dwellRatio = medianMs > 0 ? Number((dwellMs / medianMs).toFixed(2)) : 1;

    if (isStagnant) {
      stageDwellRadar.push({
        item_id: item.id,
        external_ref_id: item.external_ref_id,
        title: item.title,
        project_id: item.project_id,
        project_slug: projectSlug,
        project_name: projectName,
        stage,
        status: item.status,
        dwell_ms: dwellMs,
        dwell_hours: dwellHours,
        stage_median_ms: medianMs,
        stage_median_hours: medianHours,
        dwell_ratio: dwellRatio,
        work_units: units,
        unit_label: unitLabel,
        flag_label: stagnationLabel,
      });
    }

    if (blockerCheck.blocked && activeStageSet.has(stage)) {
      activeBlockers.push({
        item_id: item.id,
        external_ref_id: item.external_ref_id,
        title: item.title,
        project_id: item.project_id,
        project_slug: projectSlug,
        project_name: projectName,
        stage,
        reason: blockerCheck.reason || 'Systemic Impediment',
      });
    }

    enrichedItems.push({
      ...item,
      lifecycle_stage: stage,
      project_slug: projectSlug,
      project_name: projectName,
      status_label: statusLabel,
      status_color: statusColor,
      work_units: units,
      unit_label: unitLabel,
      dwell_ms: dwellMs,
      dwell_hours: dwellHours,
      is_stagnant: isStagnant,
      ...(isStagnant ? { stagnation_label: stagnationLabel } : {}),
      is_blocked: blockerCheck.blocked,
      ...(blockerCheck.reason ? { blocker_reason: blockerCheck.reason } : {}),
    });
  }

  // Sort stage_dwell_radar by dwell_ms descending
  stageDwellRadar.sort((a, b) => b.dwell_ms - a.dwell_ms);

  // Active non-terminal items drive WIP counts, units, and stage flow columns
  const activeEnrichedItems = enrichedItems.filter((it) =>
    activeStageSet.has(it.lifecycle_stage)
  );

  const totalActiveItems = activeEnrichedItems.length;
  const totalActiveUnits = Number(
    activeEnrichedItems.reduce((sum, it) => sum + it.work_units, 0).toFixed(2)
  );

  // Sum of configured WIP limits across all projects
  const totalWipCapacity = (input.projects || []).reduce((sum, proj) => {
    const rawCap = proj.settings?.wip_limit;
    const cap =
      typeof rawCap === 'number' && Number.isFinite(rawCap) && rawCap >= 1
        ? rawCap
        : DEFAULT_PROJECT_WIP_LIMIT;
    return sum + cap;
  }, 0);

  const wipSaturationRatio =
    totalWipCapacity > 0
      ? Number((totalActiveItems / totalWipCapacity).toFixed(4))
      : 0;

  // Build dynamic stage buckets from liveSettings.lifecycle_categories
  // Terminal stage buckets retain recently completed items within the 12h grace window,
  // while activeEnrichedItems drives active WIP saturation and non-terminal columns.
  const stages: StageBucketSummary[] = liveSettings.lifecycle_categories.map((cat) => {
    const stageKey = cat.key as LifecycleStage;
    const candidatePool = stageKey === 'terminal' ? enrichedItems : activeEnrichedItems;
    const stageItems = candidatePool.filter((it) => it.lifecycle_stage === stageKey);
    const stageUnits = Number(
      stageItems.reduce((sum, it) => sum + it.work_units, 0).toFixed(2)
    );
    const medianMs = stageMediansMs.get(stageKey) || 0;

    return {
      stage: stageKey,
      label: cat.label,
      color: cat.color,
      order: cat.order,
      item_count: stageItems.length,
      total_units: stageUnits,
      median_dwell_ms: medianMs,
      median_dwell_hours: Number((medianMs / (1000 * 60 * 60)).toFixed(2)),
      items: stageItems,
    };
  });

  // Identify bottleneck_stage across active non-terminal stages.
  const distinctUnitLabels = new Set(activeEnrichedItems.map((it) => it.unit_label));
  const hasMixedUnits = distinctUnitLabels.size > 1;

  let bottleneckStage: LifecycleStage | null = null;
  let bottleneckStageUnits = 0;
  let maxStageScore = 0;

  for (const st of stages) {
    if (st.stage === 'terminal' || st.item_count === 0) continue;
    const stageScore = hasMixedUnits
      ? st.items.reduce((sum, it) => {
          const projSettings = projectMap.get(it.project_id);
          const cap =
            typeof projSettings?.wip_limit === 'number' && projSettings.wip_limit >= 1
              ? projSettings.wip_limit
              : DEFAULT_PROJECT_WIP_LIMIT;
          return sum + 1 / cap;
        }, 0)
      : st.total_units;

    if (stageScore > maxStageScore) {
      maxStageScore = stageScore;
      bottleneckStage = st.stage;
      bottleneckStageUnits = st.total_units;
    }
  }

  // Rolling 24-hour completed throughput
  let rolling24hCompletedUnits = 0;
  let rolling24hCompletedItems = 0;
  for (const item of validItems) {
    const settings = projectMap.get(item.project_id);
    const stage = resolveItemLifecycle(item, settings);
    if (stage === 'terminal') {
      const completedMs = resolveTerminalCompletionMs(item, input.stageEntryTimestamps);
      if (
        !Number.isNaN(completedMs) &&
        nowMs - completedMs >= 0 &&
        nowMs - completedMs <= ROLLING_THROUGHPUT_WINDOW_MS
      ) {
        rolling24hCompletedItems += 1;
        rolling24hCompletedUnits += resolveItemWorkUnits(item, settings).units;
      }
    }
  }

  // Scope drift calculation: mid-cycle scope injection / removal
  let addedUnits = input.scopeDriftOverride?.added_units ?? 0;
  let droppedUnits = input.scopeDriftOverride?.dropped_units ?? 0;

  if (!input.scopeDriftOverride) {
    for (const item of validItems) {
      const settings = projectMap.get(item.project_id);
      const { units } = resolveItemWorkUnits(item, settings);
      if (
        item.metadata?.is_late_inflow === true ||
        item.metadata?.mid_cycle_inflow === true ||
        item.metadata?.scope_added_mid_sprint === true
      ) {
        addedUnits += units;
      }
      if (
        item.metadata?.ejected_from_sprint === true ||
        item.metadata?.scope_dropped_mid_sprint === true
      ) {
        droppedUnits += units;
      }
    }
  }

  const scopeDrift: ScopeDriftSummary = {
    added_units: Number(addedUnits.toFixed(2)),
    dropped_units: Number(droppedUnits.toFixed(2)),
    net_change: Number((addedUnits - droppedUnits).toFixed(2)),
  };

  // Build project swimlane summaries
  const projectsSummary: ProjectSwimlaneSummary[] = (input.projects || []).map((proj) => {
    const settings = projectMap.get(proj.id);
    const metricCfg = getWorkMetricConfig(settings);
    const projItems = activeEnrichedItems.filter((it) => it.project_id === proj.id);
    const projUnits = Number(
      projItems.reduce((sum, it) => sum + it.work_units, 0).toFixed(2)
    );
    const wipLimit =
      typeof proj.settings?.wip_limit === 'number' && proj.settings.wip_limit >= 1
        ? proj.settings.wip_limit
        : DEFAULT_PROJECT_WIP_LIMIT;
    const ratio = Number((projItems.length / wipLimit).toFixed(4));
    const healthStatus: ProjectSwimlaneSummary['health_status'] =
      ratio > 1 ? 'saturated' : ratio >= 0.8 ? 'approaching_limit' : 'healthy';

    return {
      project_id: proj.id,
      project_slug: proj.slug,
      project_name: proj.name,
      active_item_count: projItems.length,
      active_units: projUnits,
      unit_label: metricCfg.unit_label || 'pts',
      wip_limit: wipLimit,
      wip_saturation_ratio: ratio,
      health_status: healthStatus,
      items: projItems,
    };
  });

  return {
    total_active_items: totalActiveItems,
    total_active_units: totalActiveUnits,
    total_wip_capacity: totalWipCapacity,
    wip_saturation_ratio: wipSaturationRatio,
    stage_dwell_radar: stageDwellRadar,
    scope_drift: scopeDrift,
    bottleneck_stage: bottleneckStage,
    bottleneck_stage_units: bottleneckStageUnits,
    rolling_24h_completed_units: Number(rolling24hCompletedUnits.toFixed(2)),
    rolling_24h_completed_items: rolling24hCompletedItems,
    active_blockers: activeBlockers,
    stages,
    projects: projectsSummary,
    in_flight_items: enrichedItems,
    live_dashboard_settings: liveSettings,
    synced_at: new Date(nowMs).toISOString(),
  };
}
