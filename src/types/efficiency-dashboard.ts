export type DashboardSurface = 'efficiency' | 'statements' | 'telemetry';

export type EfficiencyWidgetKind = 'kpi' | 'module';

export type EfficiencyDefaultPeriod = 'monthly' | 'all-time';
export type StatementsDefaultTimeframe = 'week' | 'month' | 'quarter' | 'year';
export type TelemetryDefaultPivot = 'stage_flow' | 'project_swimlanes';
export type TelemetryRefreshIntervalMs = 0 | 30000 | 60000 | 120000;

export interface EfficiencyWidgetDefinition {
  id: string;
  kind: EfficiencyWidgetKind;
  surface: DashboardSurface;
  label: string;
  description: string;
  defaultVisible: boolean;
  defaultOrder: number;
  category: string;
}

export interface EfficiencyWidgetOverride {
  id: string;
  visible: boolean;
  order?: number;
  label?: string;
}

export interface EfficiencySurfaceDefaultView {
  defaultPeriod: EfficiencyDefaultPeriod;
  compactMode: boolean;
}

export interface StatementsSurfaceDefaultView {
  defaultTimeframe: StatementsDefaultTimeframe;
  expandProjectAccordions: boolean;
}

export interface TelemetrySurfaceDefaultView {
  defaultPivot: TelemetryDefaultPivot;
  defaultRefreshIntervalMs: TelemetryRefreshIntervalMs;
}

export interface EfficiencyDefaultViews {
  efficiency: EfficiencySurfaceDefaultView;
  statements: StatementsSurfaceDefaultView;
  telemetry: TelemetrySurfaceDefaultView;
}

export interface EfficiencyDefaultViewsPatch {
  efficiency?: Partial<EfficiencySurfaceDefaultView>;
  statements?: Partial<StatementsSurfaceDefaultView>;
  telemetry?: Partial<TelemetrySurfaceDefaultView>;
}

export interface EfficiencyDashboardSchema {
  schema_version: string;
  widgets?: EfficiencyWidgetOverride[];
  default_views?: EfficiencyDefaultViewsPatch;
}

export interface ResolvedEfficiencyWidget {
  id: string;
  kind: EfficiencyWidgetKind;
  surface: DashboardSurface;
  label: string;
  description: string;
  category: string;
  visible: boolean;
  order: number;
  isCustomized: boolean;
}

export interface ResolvedEfficiencyDashboardConfig {
  schema_version: string;
  widgets: ResolvedEfficiencyWidget[];
  default_views: EfficiencyDefaultViews;
  is_customized: boolean;
}
