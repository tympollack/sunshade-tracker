import { z } from 'zod';
import { formatZodPath, SchemaLintError } from '@/lib/project-settings-schema';
import type {
  DashboardSurface,
  EfficiencyDashboardSchema,
  EfficiencyDefaultViews,
  EfficiencyDefaultViewsPatch,
  EfficiencyWidgetDefinition,
  EfficiencyWidgetKind,
  EfficiencyWidgetOverride,
  ResolvedEfficiencyDashboardConfig,
  ResolvedEfficiencyWidget,
  TelemetryRefreshIntervalMs,
} from '@/types/efficiency-dashboard';
import type { LiveDashboardSettings } from '@/types/tracker';

export const EFFICIENCY_WIDGET_CATALOG: readonly EfficiencyWidgetDefinition[] = [
  // ── Efficiency Statement Surface (`/{tenantSlug}/settings/efficiency`) ──
  {
    id: 'eff_kpi_hours_reclaimed',
    kind: 'kpi',
    surface: 'efficiency',
    label: 'Hours Reclaimed',
    description: 'Total engineering hours recovered from automated rollups and triage.',
    defaultVisible: true,
    defaultOrder: 1,
    category: 'KPIs',
  },
  {
    id: 'eff_kpi_velocity_factor',
    kind: 'kpi',
    surface: 'efficiency',
    label: 'Velocity Factor',
    description: 'Derived cycle-time reduction percentage vs manual workflows.',
    defaultVisible: true,
    defaultOrder: 2,
    category: 'KPIs',
  },
  {
    id: 'eff_kpi_gross_value',
    kind: 'kpi',
    surface: 'efficiency',
    label: 'Gross Realized Value',
    description: 'Dollar valuation of reclaimed engineering hours at workspace baseline rate.',
    defaultVisible: true,
    defaultOrder: 3,
    category: 'KPIs',
  },
  {
    id: 'eff_kpi_platform_fee',
    kind: 'kpi',
    surface: 'efficiency',
    label: 'Platform Subscription',
    description: 'Self-administered $0.00 platform fee and net yield indicator.',
    defaultVisible: true,
    defaultOrder: 4,
    category: 'KPIs',
  },
  {
    id: 'eff_mod_summary_kpis',
    kind: 'module',
    surface: 'efficiency',
    label: 'Summary KPI Strip',
    description: 'Top-level efficiency metric cards grid.',
    defaultVisible: true,
    defaultOrder: 1,
    category: 'Modules',
  },
  {
    id: 'eff_mod_token_yield',
    kind: 'module',
    surface: 'efficiency',
    label: 'Sovereign Token Yield & Verification',
    description: 'Artifact-verified item counts and dual-stream projected token allocations.',
    defaultVisible: true,
    defaultOrder: 2,
    category: 'Modules',
  },
  {
    id: 'eff_mod_itemized_breakdown',
    kind: 'module',
    surface: 'efficiency',
    label: 'Itemized Yield Breakdown',
    description: 'Line-by-line audit table of friction points, reclaimed hours, and valuation.',
    defaultVisible: true,
    defaultOrder: 3,
    category: 'Modules',
  },
  {
    id: 'eff_mod_net_benefit',
    kind: 'module',
    surface: 'efficiency',
    label: 'Net Tenant Benefit Summary',
    description: 'Reverse-invoice bottom line comparing gross value against $0.00 subscription.',
    defaultVisible: true,
    defaultOrder: 4,
    category: 'Modules',
  },

  // ── Dynamic Statements Surface (`/{tenantSlug}/statements`) ──
  {
    id: 'stmt_kpi_hours_reclaimed',
    kind: 'kpi',
    surface: 'statements',
    label: 'Hours Reclaimed',
    description: 'Administrative drag eliminated within the selected timeframe.',
    defaultVisible: true,
    defaultOrder: 1,
    category: 'KPIs',
  },
  {
    id: 'stmt_kpi_realized_value',
    kind: 'kpi',
    surface: 'statements',
    label: 'Realized Value',
    description: 'Gross financial value realized across the selected period.',
    defaultVisible: true,
    defaultOrder: 2,
    category: 'KPIs',
  },
  {
    id: 'stmt_kpi_completed_items',
    kind: 'kpi',
    surface: 'statements',
    label: 'Completed Items',
    description: 'Deliverables shipped within the selected date range.',
    defaultVisible: true,
    defaultOrder: 3,
    category: 'KPIs',
  },
  {
    id: 'stmt_kpi_active_projects',
    kind: 'kpi',
    surface: 'statements',
    label: 'Active Projects',
    description: 'Workspace projects contributing activity to this statement.',
    defaultVisible: true,
    defaultOrder: 4,
    category: 'KPIs',
  },
  {
    id: 'stmt_mod_summary_kpis',
    kind: 'module',
    surface: 'statements',
    label: 'Period Snapshot & KPIs',
    description: 'Statement header card and summary KPI strip.',
    defaultVisible: true,
    defaultOrder: 1,
    category: 'Modules',
  },
  {
    id: 'stmt_mod_project_calibration',
    kind: 'module',
    surface: 'statements',
    label: 'Project Workload & Estimation Calibration',
    description: 'Per-project velocity ratio accordion and empirical calibration telemetry.',
    defaultVisible: true,
    defaultOrder: 2,
    category: 'Modules',
  },
  {
    id: 'stmt_mod_itemized_breakdown',
    kind: 'module',
    surface: 'statements',
    label: 'Itemized Yield Breakdown',
    description: 'Detailed operational friction point breakdown table.',
    defaultVisible: true,
    defaultOrder: 3,
    category: 'Modules',
  },

  // ── Live Telemetry Deck Surface (`/{tenantSlug}/all` & `?tab=live`) ──
  {
    id: 'tel_kpi_wip_saturation',
    kind: 'kpi',
    surface: 'telemetry',
    label: 'WIP Saturation Index',
    description: 'Active work-in-progress ratio relative to workspace concurrency limits.',
    defaultVisible: true,
    defaultOrder: 1,
    category: 'KPIs',
  },
  {
    id: 'tel_kpi_queue_flow_radar',
    kind: 'kpi',
    surface: 'telemetry',
    label: 'Queue Flow Radar',
    description: 'Stage bottleneck detection and median stage dwell duration.',
    defaultVisible: true,
    defaultOrder: 2,
    category: 'KPIs',
  },
  {
    id: 'tel_kpi_scope_inflow',
    kind: 'kpi',
    surface: 'telemetry',
    label: 'Mid-Cycle Scope Inflow',
    description: 'Net scope volatility across added and dropped work units.',
    defaultVisible: true,
    defaultOrder: 3,
    category: 'KPIs',
  },
  {
    id: 'tel_kpi_throughput_cadence',
    kind: 'kpi',
    surface: 'telemetry',
    label: 'Throughput Cadence',
    description: 'Rolling 24-hour completed deliverables and unit velocity.',
    defaultVisible: true,
    defaultOrder: 4,
    category: 'KPIs',
  },
  {
    id: 'tel_mod_blocker_marquee',
    kind: 'module',
    surface: 'telemetry',
    label: 'Ambient Blocker Marquee',
    description: 'Collapsible systemic flow impediment radar banner.',
    defaultVisible: true,
    defaultOrder: 1,
    category: 'Modules',
  },
  {
    id: 'tel_mod_telemetry_ribbon',
    kind: 'module',
    surface: 'telemetry',
    label: 'Systemic Flow Health Ribbon',
    description: 'Four-column live flow health KPI badge strip.',
    defaultVisible: true,
    defaultOrder: 2,
    category: 'Modules',
  },
  {
    id: 'tel_mod_pivot_canvas',
    kind: 'module',
    surface: 'telemetry',
    label: 'In-Flight Flow Canvas',
    description: 'Stage Flow columns and Project Swimlanes operational workspace.',
    defaultVisible: true,
    defaultOrder: 3,
    category: 'Modules',
  },
] as const;

export const WIDGET_CATALOG_MAP = new Map<string, EfficiencyWidgetDefinition>(
  EFFICIENCY_WIDGET_CATALOG.map((w) => [w.id, w])
);

export const DEFAULT_EFFICIENCY_DEFAULT_VIEWS: EfficiencyDefaultViews = {
  efficiency: {
    defaultPeriod: 'monthly',
    compactMode: false,
  },
  statements: {
    defaultTimeframe: 'month',
    expandProjectAccordions: true,
  },
  telemetry: {
    defaultPivot: 'stage_flow',
    defaultRefreshIntervalMs: 60000,
  },
};

export const DEFAULT_EFFICIENCY_DASHBOARD_SCHEMA: EfficiencyDashboardSchema = {
  schema_version: '1.0',
  widgets: EFFICIENCY_WIDGET_CATALOG.map((w) => ({
    id: w.id,
    visible: w.defaultVisible,
    order: w.defaultOrder,
  })),
  default_views: {
    efficiency: { ...DEFAULT_EFFICIENCY_DEFAULT_VIEWS.efficiency },
    statements: { ...DEFAULT_EFFICIENCY_DEFAULT_VIEWS.statements },
    telemetry: { ...DEFAULT_EFFICIENCY_DEFAULT_VIEWS.telemetry },
  },
};

const VALID_REFRESH_INTERVALS = new Set<number>([0, 30000, 60000, 120000]);

export const EfficiencyWidgetOverrideZod = z.object({
  id: z.string().trim().min(1, 'Widget id is required'),
  visible: z.boolean({ required_error: 'Widget visible flag must be a boolean' }),
  order: z.number().int('Order must be an integer').min(0, 'Order must be >= 0').optional(),
  label: z.string().trim().min(1, 'Label cannot be empty').max(80).optional(),
});

export const EfficiencyDefaultViewsZod = z
  .object({
    efficiency: z
      .object({
        defaultPeriod: z.enum(['monthly', 'all-time']).optional(),
        compactMode: z.boolean().optional(),
      })
      .strict()
      .optional(),
    statements: z
      .object({
        defaultTimeframe: z.enum(['week', 'month', 'quarter', 'year']).optional(),
        expandProjectAccordions: z.boolean().optional(),
      })
      .strict()
      .optional(),
    telemetry: z
      .object({
        defaultPivot: z.enum(['stage_flow', 'project_swimlanes']).optional(),
        defaultRefreshIntervalMs: z
          .number()
          .refine((v) => VALID_REFRESH_INTERVALS.has(v), {
            message: 'defaultRefreshIntervalMs must be one of 0, 30000, 60000, 120000',
          })
          .optional(),
      })
      .strict()
      .optional(),
  })
  .strict();

export const EfficiencyDashboardSchemaZod = z
  .object({
    schema_version: z.string().min(1).optional().default('1.0'),
    widgets: z
      .array(EfficiencyWidgetOverrideZod)
      .superRefine((widgets, ctx) => {
        const seenIds = new Set<string>();
        widgets.forEach((widget, i) => {
          if (!WIDGET_CATALOG_MAP.has(widget.id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [i, 'id'],
              message: `Unknown efficiency dashboard widget id "${widget.id}"`,
            });
          }
          if (seenIds.has(widget.id)) {
            ctx.addIssue({
              code: z.ZodIssueCode.custom,
              path: [i, 'id'],
              message: `Duplicate widget id "${widget.id}"`,
            });
          }
          seenIds.add(widget.id);
        });
      })
      .optional(),
    default_views: EfficiencyDefaultViewsZod.optional(),
  })
  .strict();

/**
 * Validates an Efficiency Dashboard schema payload against Zod structure,
 * known widget catalog IDs, and duplicate widget entry rules.
 */
export function validateEfficiencyDashboardSchema(input: unknown): {
  valid: boolean;
  errors: SchemaLintError[];
} {
  if (input === null || input === undefined || typeof input !== 'object' || Array.isArray(input)) {
    return {
      valid: false,
      errors: [
        {
          path: 'efficiency_dashboard_settings',
          message: 'Efficiency dashboard settings must be a JSON object',
        },
      ],
    };
  }

  const parsed = EfficiencyDashboardSchemaZod.safeParse(input);
  if (!parsed.success) {
    return {
      valid: false,
      errors: parsed.error.errors.map((err) => ({
        path: formatZodPath(err.path),
        message: err.message,
      })),
    };
  }

  return {
    valid: true,
    errors: [],
  };
}

function normalizeDefaultViews(
  base: EfficiencyDefaultViews,
  patch?: EfficiencyDefaultViewsPatch | null
): EfficiencyDefaultViews {
  if (!patch || typeof patch !== 'object') {
    return {
      efficiency: { ...base.efficiency },
      statements: { ...base.statements },
      telemetry: { ...base.telemetry },
    };
  }

  const rawInterval = patch.telemetry?.defaultRefreshIntervalMs;
  const validInterval: TelemetryRefreshIntervalMs =
    typeof rawInterval === 'number' && VALID_REFRESH_INTERVALS.has(rawInterval)
      ? (rawInterval as TelemetryRefreshIntervalMs)
      : base.telemetry.defaultRefreshIntervalMs;

  return {
    efficiency: {
      defaultPeriod:
        patch.efficiency?.defaultPeriod === 'all-time' || patch.efficiency?.defaultPeriod === 'monthly'
          ? patch.efficiency.defaultPeriod
          : base.efficiency.defaultPeriod,
      compactMode:
        typeof patch.efficiency?.compactMode === 'boolean'
          ? patch.efficiency.compactMode
          : base.efficiency.compactMode,
    },
    statements: {
      defaultTimeframe:
        patch.statements?.defaultTimeframe &&
        ['week', 'month', 'quarter', 'year'].includes(patch.statements.defaultTimeframe)
          ? patch.statements.defaultTimeframe
          : base.statements.defaultTimeframe,
      expandProjectAccordions:
        typeof patch.statements?.expandProjectAccordions === 'boolean'
          ? patch.statements.expandProjectAccordions
          : base.statements.expandProjectAccordions,
    },
    telemetry: {
      defaultPivot:
        patch.telemetry?.defaultPivot === 'project_swimlanes' ||
        patch.telemetry?.defaultPivot === 'stage_flow'
          ? patch.telemetry.defaultPivot
          : base.telemetry.defaultPivot,
      defaultRefreshIntervalMs: validInterval,
    },
  };
}

/**
 * Merges a base partial schema with one or more override layers deterministically.
 */
export function mergeEfficiencyDashboardSchemas(
  ...layers: Array<Partial<EfficiencyDashboardSchema> | null | undefined>
): EfficiencyDashboardSchema {
  let mergedViews: EfficiencyDefaultViews = normalizeDefaultViews(
    DEFAULT_EFFICIENCY_DEFAULT_VIEWS,
    null
  );
  const widgetMap = new Map<string, EfficiencyWidgetOverride>();

  for (const def of EFFICIENCY_WIDGET_CATALOG) {
    widgetMap.set(def.id, {
      id: def.id,
      visible: def.defaultVisible,
      order: def.defaultOrder,
    });
  }

  let schemaVersion = '1.0';

  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue;
    if (typeof layer.schema_version === 'string' && layer.schema_version.trim()) {
      schemaVersion = layer.schema_version.trim();
    }
    if (layer.default_views) {
      mergedViews = normalizeDefaultViews(mergedViews, layer.default_views);
    }
    if (Array.isArray(layer.widgets)) {
      for (const w of layer.widgets) {
        if (!w || typeof w.id !== 'string' || !WIDGET_CATALOG_MAP.has(w.id)) continue;
        const prev = widgetMap.get(w.id)!;
        widgetMap.set(w.id, {
          id: w.id,
          visible: typeof w.visible === 'boolean' ? w.visible : prev.visible,
          order: typeof w.order === 'number' && Number.isFinite(w.order) && w.order >= 0 ? w.order : prev.order,
          label: typeof w.label === 'string' && w.label.trim() ? w.label.trim() : prev.label,
        });
      }
    }
  }

  return {
    schema_version: schemaVersion,
    widgets: Array.from(widgetMap.values()),
    default_views: mergedViews,
  };
}

/**
 * Merges sparse schema patches without materializing built-in defaults for untouched
 * surfaces or widgets, preserving legacy fallbacks (such as live_dashboard_settings).
 */
export function mergeSparseEfficiencyDashboardSchemas(
  ...layers: Array<Partial<EfficiencyDashboardSchema> | null | undefined>
): EfficiencyDashboardSchema {
  let schemaVersion = '1.0';
  const widgetMap = new Map<string, EfficiencyWidgetOverride>();
  const defaultViews: EfficiencyDefaultViewsPatch = {};

  for (const layer of layers) {
    if (!layer || typeof layer !== 'object') continue;
    if (typeof layer.schema_version === 'string' && layer.schema_version.trim()) {
      schemaVersion = layer.schema_version.trim();
    }
    if (layer.default_views && typeof layer.default_views === 'object') {
      if (layer.default_views.efficiency) {
        defaultViews.efficiency = {
          ...(defaultViews.efficiency || {}),
          ...layer.default_views.efficiency,
        };
      }
      if (layer.default_views.statements) {
        defaultViews.statements = {
          ...(defaultViews.statements || {}),
          ...layer.default_views.statements,
        };
      }
      if (layer.default_views.telemetry) {
        defaultViews.telemetry = {
          ...(defaultViews.telemetry || {}),
          ...layer.default_views.telemetry,
        };
      }
    }
    if (Array.isArray(layer.widgets)) {
      for (const w of layer.widgets) {
        if (!w || typeof w.id !== 'string' || !WIDGET_CATALOG_MAP.has(w.id)) continue;
        const prev = widgetMap.get(w.id);
        const def = WIDGET_CATALOG_MAP.get(w.id)!;
        widgetMap.set(w.id, {
          id: w.id,
          visible: typeof w.visible === 'boolean' ? w.visible : prev?.visible ?? def.defaultVisible,
          ...(typeof w.order === 'number' && Number.isFinite(w.order) && w.order >= 0
            ? { order: w.order }
            : prev?.order !== undefined
            ? { order: prev.order }
            : {}),
          ...(typeof w.label === 'string' && w.label.trim()
            ? { label: w.label.trim() }
            : prev?.label
            ? { label: prev.label }
            : {}),
        });
      }
    }
  }

  const widgets = Array.from(widgetMap.values());
  return {
    schema_version: schemaVersion,
    ...(widgets.length > 0 ? { widgets } : {}),
    ...(Object.keys(defaultViews).length > 0 ? { default_views: defaultViews } : {}),
  };
}

export interface ResolveEfficiencyDashboardInput {
  workspaceSettings?: Partial<EfficiencyDashboardSchema> | null;
  liveDashboardSettings?: Partial<LiveDashboardSettings> | null;
  userOverrides?: Partial<EfficiencyDashboardSchema> | null;
}

/**
 * Resolves the effective efficiency/telemetry dashboard configuration by layering:
 *   1. Built-in declarative defaults (`DEFAULT_EFFICIENCY_DASHBOARD_SCHEMA`)
 *   2. Workspace LiveDashboardSettings bridge (pivot + refresh cadence)
 *   3. Workspace `efficiency_dashboard_settings`
 *   4. Per-user overrides (`userOverrides`)
 */
export function resolveEfficiencyDashboardConfig(
  input: ResolveEfficiencyDashboardInput = {}
): ResolvedEfficiencyDashboardConfig {
  const { workspaceSettings, liveDashboardSettings, userOverrides } = input;

  const liveBridgeLayer: Partial<EfficiencyDashboardSchema> | null = liveDashboardSettings
    ? {
        default_views: {
          telemetry: {
            ...(liveDashboardSettings.default_pivot === 'project_swimlanes' ||
            liveDashboardSettings.default_pivot === 'stage_flow'
              ? { defaultPivot: liveDashboardSettings.default_pivot }
              : {}),
            ...(typeof liveDashboardSettings.default_refresh_interval_ms === 'number' &&
            VALID_REFRESH_INTERVALS.has(liveDashboardSettings.default_refresh_interval_ms)
              ? {
                  defaultRefreshIntervalMs:
                    liveDashboardSettings.default_refresh_interval_ms as TelemetryRefreshIntervalMs,
                }
              : {}),
          },
        },
      }
    : null;

  const workspaceBaseline = mergeEfficiencyDashboardSchemas(liveBridgeLayer, workspaceSettings);
  const effective = mergeEfficiencyDashboardSchemas(workspaceBaseline, userOverrides);

  const baselineWidgetsById = new Map((workspaceBaseline.widgets || []).map((w) => [w.id, w]));
  const effectiveWidgetsById = new Map((effective.widgets || []).map((w) => [w.id, w]));
  const baselineViews = workspaceBaseline.default_views as EfficiencyDefaultViews;
  const effectiveViews = effective.default_views as EfficiencyDefaultViews;

  const resolvedWidgets: ResolvedEfficiencyWidget[] = EFFICIENCY_WIDGET_CATALOG.map((def) => {
    const eff = effectiveWidgetsById.get(def.id);
    const base = baselineWidgetsById.get(def.id);
    const visible = eff?.visible ?? def.defaultVisible;
    const order = eff?.order ?? def.defaultOrder;
    const label = eff?.label || def.label;

    const widgetCustomized =
      visible !== (base?.visible ?? def.defaultVisible) ||
      order !== (base?.order ?? def.defaultOrder) ||
      label !== (base?.label || def.label);

    return {
      id: def.id,
      kind: def.kind,
      surface: def.surface,
      label,
      description: def.description,
      category: def.category,
      visible,
      order,
      isCustomized: widgetCustomized,
    };
  }).sort((a, b) => {
    if (a.surface !== b.surface) return a.surface.localeCompare(b.surface);
    if (a.kind !== b.kind) return a.kind.localeCompare(b.kind);
    if (a.order !== b.order) return a.order - b.order;
    const defA = WIDGET_CATALOG_MAP.get(a.id)?.defaultOrder ?? 0;
    const defB = WIDGET_CATALOG_MAP.get(b.id)?.defaultOrder ?? 0;
    return defA - defB;
  });

  const viewsCustomized =
    effectiveViews.efficiency.defaultPeriod !== baselineViews.efficiency.defaultPeriod ||
    effectiveViews.efficiency.compactMode !== baselineViews.efficiency.compactMode ||
    effectiveViews.statements.defaultTimeframe !== baselineViews.statements.defaultTimeframe ||
    effectiveViews.statements.expandProjectAccordions !== baselineViews.statements.expandProjectAccordions ||
    effectiveViews.telemetry.defaultPivot !== baselineViews.telemetry.defaultPivot ||
    effectiveViews.telemetry.defaultRefreshIntervalMs !== baselineViews.telemetry.defaultRefreshIntervalMs;

  return {
    schema_version: effective.schema_version || '1.0',
    widgets: resolvedWidgets,
    default_views: effectiveViews,
    is_customized: viewsCustomized || resolvedWidgets.some((w) => w.isCustomized),
  };
}

/**
 * Returns widgets for a given surface (and optional kind), ordered deterministically.
 */
export function getSurfaceWidgets(
  resolved: ResolvedEfficiencyDashboardConfig,
  surface: DashboardSurface,
  kind?: EfficiencyWidgetKind,
  opts?: { visibleOnly?: boolean }
): ResolvedEfficiencyWidget[] {
  return resolved.widgets
    .filter((w) => {
      if (w.surface !== surface) return false;
      if (kind && w.kind !== kind) return false;
      if (opts?.visibleOnly && !w.visible) return false;
      return true;
    })
    .sort((a, b) => a.order - b.order);
}

export function isDashboardWidgetVisible(
  resolved: ResolvedEfficiencyDashboardConfig,
  widgetId: string
): boolean {
  const match = resolved.widgets.find((w) => w.id === widgetId);
  if (!match) {
    return WIDGET_CATALOG_MAP.get(widgetId)?.defaultVisible ?? true;
  }
  return match.visible;
}

export function isSurfaceCustomized(
  resolved: ResolvedEfficiencyDashboardConfig,
  workspaceBaseline: ResolvedEfficiencyDashboardConfig,
  surface: DashboardSurface
): boolean {
  const widgetsDiffer = resolved.widgets.some((w) => {
    if (w.surface !== surface) return false;
    const base = workspaceBaseline.widgets.find((b) => b.id === w.id);
    if (!base) return w.isCustomized;
    return w.visible !== base.visible || w.order !== base.order || w.label !== base.label;
  });
  if (widgetsDiffer) return true;

  if (surface === 'efficiency') {
    return (
      resolved.default_views.efficiency.defaultPeriod !==
        workspaceBaseline.default_views.efficiency.defaultPeriod ||
      resolved.default_views.efficiency.compactMode !==
        workspaceBaseline.default_views.efficiency.compactMode
    );
  }
  if (surface === 'statements') {
    return (
      resolved.default_views.statements.defaultTimeframe !==
        workspaceBaseline.default_views.statements.defaultTimeframe ||
      resolved.default_views.statements.expandProjectAccordions !==
        workspaceBaseline.default_views.statements.expandProjectAccordions
    );
  }
  return (
    resolved.default_views.telemetry.defaultPivot !==
      workspaceBaseline.default_views.telemetry.defaultPivot ||
    resolved.default_views.telemetry.defaultRefreshIntervalMs !==
      workspaceBaseline.default_views.telemetry.defaultRefreshIntervalMs
  );
}

/**
 * Pure mutation helpers for building user/workspace overrides cleanly.
 */
export function toggleWidgetInOverride(
  currentOverride: Partial<EfficiencyDashboardSchema> | null | undefined,
  resolved: ResolvedEfficiencyDashboardConfig,
  widgetId: string
): EfficiencyDashboardSchema {
  const current = resolved.widgets.find((w) => w.id === widgetId);
  const nextVisible = current ? !current.visible : false;
  const existingList = Array.isArray(currentOverride?.widgets) ? [...currentOverride.widgets] : [];
  const idx = existingList.findIndex((w) => w.id === widgetId);

  const nextEntry: EfficiencyWidgetOverride = {
    id: widgetId,
    visible: nextVisible,
    order: current?.order ?? WIDGET_CATALOG_MAP.get(widgetId)?.defaultOrder,
    ...(idx >= 0 && existingList[idx].label ? { label: existingList[idx].label } : {}),
  };

  if (idx >= 0) {
    existingList[idx] = nextEntry;
  } else {
    existingList.push(nextEntry);
  }

  return {
    schema_version: currentOverride?.schema_version || '1.0',
    widgets: existingList,
    ...(currentOverride?.default_views ? { default_views: currentOverride.default_views } : {}),
  };
}

export function reorderWidgetInOverride(
  currentOverride: Partial<EfficiencyDashboardSchema> | null | undefined,
  resolved: ResolvedEfficiencyDashboardConfig,
  surface: DashboardSurface,
  kind: EfficiencyWidgetKind,
  widgetId: string,
  direction: 'up' | 'down'
): EfficiencyDashboardSchema {
  const group = getSurfaceWidgets(resolved, surface, kind);
  const idx = group.findIndex((w) => w.id === widgetId);
  if (idx === -1) {
    return {
      schema_version: currentOverride?.schema_version || '1.0',
      widgets: currentOverride?.widgets || [],
      ...(currentOverride?.default_views ? { default_views: currentOverride.default_views } : {}),
    };
  }

  const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
  if (swapIdx < 0 || swapIdx >= group.length) {
    return {
      schema_version: currentOverride?.schema_version || '1.0',
      widgets: currentOverride?.widgets || [],
      ...(currentOverride?.default_views ? { default_views: currentOverride.default_views } : {}),
    };
  }

  const reordered = [...group];
  [reordered[idx], reordered[swapIdx]] = [reordered[swapIdx], reordered[idx]];

  const existingMap = new Map<string, EfficiencyWidgetOverride>();
  for (const w of currentOverride?.widgets || []) {
    existingMap.set(w.id, { ...w });
  }

  reordered.forEach((w, i) => {
    const prev = existingMap.get(w.id);
    existingMap.set(w.id, {
      id: w.id,
      visible: prev?.visible ?? w.visible,
      order: i + 1,
      ...(prev?.label ? { label: prev.label } : {}),
    });
  });

  return {
    schema_version: currentOverride?.schema_version || '1.0',
    widgets: Array.from(existingMap.values()),
    ...(currentOverride?.default_views ? { default_views: currentOverride.default_views } : {}),
  };
}

export function updateDefaultViewInOverride<S extends DashboardSurface>(
  currentOverride: Partial<EfficiencyDashboardSchema> | null | undefined,
  surface: S,
  updates: Partial<EfficiencyDefaultViews[S]>
): EfficiencyDashboardSchema {
  const prevViews = currentOverride?.default_views || {};
  return {
    schema_version: currentOverride?.schema_version || '1.0',
    ...(currentOverride?.widgets ? { widgets: currentOverride.widgets } : {}),
    default_views: {
      ...prevViews,
      [surface]: {
        ...(prevViews[surface] || {}),
        ...updates,
      },
    },
  };
}

export function clearSurfaceOverride(
  currentOverride: Partial<EfficiencyDashboardSchema> | null | undefined,
  surface: DashboardSurface
): EfficiencyDashboardSchema | null {
  if (!currentOverride) return null;
  const remainingWidgets = (currentOverride.widgets || []).filter((w) => {
    const def = WIDGET_CATALOG_MAP.get(w.id);
    return def && def.surface !== surface;
  });
  const nextViews: EfficiencyDefaultViewsPatch = { ...(currentOverride.default_views || {}) };
  delete nextViews[surface];

  const hasViews = Object.keys(nextViews).length > 0;
  if (remainingWidgets.length === 0 && !hasViews) {
    return null;
  }

  return {
    schema_version: currentOverride.schema_version || '1.0',
    ...(remainingWidgets.length > 0 ? { widgets: remainingWidgets } : {}),
    ...(hasViews ? { default_views: nextViews } : {}),
  };
}

export function extractSurfaceSchema(
  resolved: ResolvedEfficiencyDashboardConfig,
  surface: DashboardSurface
): EfficiencyDashboardSchema {
  const surfaceWidgets = resolved.widgets
    .filter((w) => w.surface === surface)
    .map((w) => ({
      id: w.id,
      visible: w.visible,
      order: w.order,
    }));

  return {
    schema_version: resolved.schema_version,
    widgets: surfaceWidgets,
    default_views: {
      [surface]: { ...resolved.default_views[surface] },
    },
  };
}
