export type LifecycleStage = 'unstarted' | 'execution' | 'verification' | 'staging' | 'terminal';

export interface LifecycleCategoryDefinition {
  key: LifecycleStage | string;
  label: string;
  order: number;
  color: string;
}

export interface LiveDashboardSettings {
  default_pivot: 'stage_flow' | 'project_swimlanes';
  stagnation_median_multiplier: number;
  stagnation_warning_label: string;
  default_refresh_interval_ms: number;
  lifecycle_categories: LifecycleCategoryDefinition[];
  [key: string]: any;
}

export const DEFAULT_LIVE_DASHBOARD_SETTINGS: LiveDashboardSettings = {
  default_pivot: 'stage_flow',
  stagnation_median_multiplier: 1.5,
  stagnation_warning_label: 'System Queue Stall',
  default_refresh_interval_ms: 60000,
  lifecycle_categories: [
    { key: 'execution', label: 'Active Execution', order: 1, color: '#38BDF8' },
    { key: 'verification', label: 'Verification & Review', order: 2, color: '#F59E0B' },
    { key: 'staging', label: 'Pre-Delivery / Staged', order: 3, color: '#A855F7' },
  ],
};

export interface TenantSettings {
  live_dashboard_settings?: Partial<LiveDashboardSettings>;
  velocity_conversion?: {
    default_hours_per_point?: number;
    [key: string]: any;
  };
  [key: string]: any;
}

export function resolveLiveDashboardSettings(
  tenantSettings?: TenantSettings | Record<string, any> | null
): LiveDashboardSettings {
  const raw = tenantSettings?.live_dashboard_settings;
  if (!raw || typeof raw !== 'object') {
    return {
      ...DEFAULT_LIVE_DASHBOARD_SETTINGS,
      lifecycle_categories: DEFAULT_LIVE_DASHBOARD_SETTINGS.lifecycle_categories.map((c) => ({ ...c })),
    };
  }
  const categories =
    Array.isArray(raw.lifecycle_categories) && raw.lifecycle_categories.length > 0
      ? raw.lifecycle_categories
          .filter((c: any) => c && typeof c === 'object' && typeof c.key === 'string')
          .map((c: any, idx: number) => ({
            key: String(c.key).trim(),
            label: typeof c.label === 'string' && c.label.trim() ? c.label.trim() : String(c.key),
            order: typeof c.order === 'number' && !isNaN(c.order) ? c.order : idx + 1,
            color: typeof c.color === 'string' && c.color.trim() ? c.color.trim() : '#38BDF8',
          }))
          .sort((a: LifecycleCategoryDefinition, b: LifecycleCategoryDefinition) => a.order - b.order)
      : DEFAULT_LIVE_DASHBOARD_SETTINGS.lifecycle_categories.map((c) => ({ ...c }));

  return {
    ...DEFAULT_LIVE_DASHBOARD_SETTINGS,
    ...raw,
    default_pivot:
      raw.default_pivot === 'project_swimlanes' ? 'project_swimlanes' : 'stage_flow',
    stagnation_median_multiplier:
      typeof raw.stagnation_median_multiplier === 'number' && raw.stagnation_median_multiplier > 0
        ? raw.stagnation_median_multiplier
        : DEFAULT_LIVE_DASHBOARD_SETTINGS.stagnation_median_multiplier,
    stagnation_warning_label:
      typeof raw.stagnation_warning_label === 'string' && raw.stagnation_warning_label.trim()
        ? raw.stagnation_warning_label.trim()
        : DEFAULT_LIVE_DASHBOARD_SETTINGS.stagnation_warning_label,
    default_refresh_interval_ms:
      typeof raw.default_refresh_interval_ms === 'number' && raw.default_refresh_interval_ms >= 0
        ? raw.default_refresh_interval_ms
        : DEFAULT_LIVE_DASHBOARD_SETTINGS.default_refresh_interval_ms,
    lifecycle_categories: categories,
  };
}

export interface HierarchyLevel {
  type: string;
  label: string;
  level: number;
  allowed_parents: string[];
  color?: string;
}

export interface StatusDefinition {
  id: string;
  label: string;
  color: string;
  order: number;
  is_completed?: boolean;
  lifecycle_category?: LifecycleStage;
}

export interface HistoricalSprintSummary {
  total_tasks: number;
  completed_tasks: number;
  committed_points: number;
  completed_points: number;
  velocity: number;
  closed_at: string;
  [key: string]: any;
}

export interface SprintDefinition {
  id: string;
  project_id?: string | null;
  name: string;
  start_date?: string | null;
  end_date?: string | null;
  started_at?: string | null;
  ends_at?: string | null;
  goal?: string | null;
  status: 'planned' | 'active' | 'completed' | 'unplanned';
  is_current?: boolean;
  is_active?: boolean;
  committed_points?: number;
  metadata?: Record<string, any>;
}

export interface MetricRules {
  /** Rolling velocity window size in sprints (default: 3) */
  velocity_window?: number;
  /** Variance threshold (e.g. 0.10 for 10%) to determine increasing/decreasing velocity trend */
  velocity_trend_threshold?: number;
  /** Say/Do ratio threshold for healthy green status in % (default: 85) */
  reliability_healthy_threshold?: number;
  /** Say/Do ratio threshold for warning amber status in % (default: 70) */
  reliability_warning_threshold?: number;
  /** Elapsed sprint runway ratio cutoff to trigger sizing guardrails (default: 0.60, or null when disabled) */
  late_runway_threshold?: number | null;
  /** Maximum story points allowed for feature items when runway threshold is exceeded (default: 2, or null when disabled) */
  late_runway_max_points?: number | null;
  /** Maximum story points allowed for late inflow items (null when disabled) */
  late_inflow_cap?: number | null;
  /** Elapsed sprint runway ratio cutoff to trigger sizing guardrails (null when disabled) */
  runway_cutoff?: number | null;
  /** Whether late inflow and runway caps are enforced (default: true) */
  enforce_late_inflow_caps?: boolean;
  /** Item types classified as feature stories subject to late runway limits (default: ['story', 'feature']) */
  feature_story_types?: string[];
  /** Allowed item types when late runway is exceeded (default: ['chore', 'task', 'debt', 'documentation', 'doc', 'test', 'bug']) */
  allowed_late_types?: string[];
  /** Whether to enforce zero-sum item ejection when capacity is exceeded (default: true) */
  enforce_zero_sum?: boolean;
  /** Statuses considered unstarted and eligible for backlog ejection (default: ['not_started', 'todo', 'unplanned', 'backlog', 'open', 'planned', 'pitch_backlog']) */
  unstarted_statuses?: string[];
  /** Statuses considered in-progress / active WIP */
  in_progress_statuses?: string[];
  /** Statuses considered completed / done */
  completed_statuses?: string[];
  /** Priorities permitted to bypass runway and zero-sum guardrails (default: ['P0', 'CRITICAL', 'EMERGENCY']) */
  emergency_priorities?: string[];
  /** Whether story points / estimates are immutable in active sprints (default: true) */
  lock_estimates_in_active_sprint?: boolean;
  /** Scope creep threshold % to show warning indicator (default: 15) */
  scope_creep_warning_threshold?: number;
  /** Scope creep threshold % to show danger indicator (default: 30) */
  scope_creep_danger_threshold?: number;
  [key: string]: any;
}

export interface SprintSettings {
  default_sprint?: string;
  sprints?: SprintDefinition[];
  metric_rules?: MetricRules;
  metrics?: MetricRules;
  [key: string]: any;
}

export type CustomFieldType = 'number' | 'string' | 'text' | 'enum' | 'boolean' | 'date';

export interface CustomFieldDefinition {
  key: string;
  label?: string;
  type?: CustomFieldType;
  options?: string[];
  unit?: string;
  placeholder?: string;
  target_field?: string;
  actual_field?: string;
  description?: string;
  default?: any;
  required?: boolean;
}

export type CustomField = string | CustomFieldDefinition;

export function normalizeCustomField(field: any): CustomFieldDefinition {
  if (typeof field === 'string') {
    return {
      key: field,
      label: field.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      type: 'string',
    };
  }
  if (field && typeof field === 'object') {
    if (typeof field.key === 'string' && field.key) {
      return {
        ...field,
        label: field.label || field.key.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
        type: field.type || (Array.isArray(field.options) ? 'enum' : 'string'),
      };
    }
    const entries = Object.entries(field);
    if (entries.length === 1) {
      const [k, v] = entries[0];
      if (Array.isArray(v)) {
        return {
          key: k,
          label: k.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          type: 'enum',
          options: v as string[],
        };
      }
      if (v && typeof v === 'object') {
        const objVal = v as any;
        return {
          key: k,
          label: objVal.label || k.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
          type: objVal.type || (Array.isArray(objVal.options) ? 'enum' : 'string'),
          options: objVal.options,
          unit: objVal.unit,
          placeholder: objVal.placeholder,
          description: objVal.description,
          default: objVal.default,
          required: objVal.required,
        };
      }
    }
  }
  return {
    key: String(field?.key || field || ''),
    label: String(field?.label || field?.key || field || ''),
    type: 'string',
  };
}

export function normalizeCustomFields(fields?: CustomField[] | null): CustomFieldDefinition[] {
  if (!fields || !Array.isArray(fields)) return [];
  return fields.map(normalizeCustomField);
}

export interface CustomMetadataFieldDefinition {
  key: string;
  label?: string;
  type?: CustomFieldType;
  options?: string[];
  unit?: string;
  placeholder?: string;
  target_field?: string;
  actual_field?: string;
  description?: string;
}

export interface WorkMetricConfig {
  field_key: string;
  label?: string;
  unit_label?: string;
}

export const DEFAULT_WORK_METRIC_CONFIG: WorkMetricConfig = {
  field_key: 'story_points',
  label: 'Story Points',
  unit_label: 'pts',
};

export function getWorkMetricConfig(settings?: ProjectSettings | null): WorkMetricConfig {
  if (settings?.work_metric_config?.field_key) {
    return {
      field_key: settings.work_metric_config.field_key,
      label: settings.work_metric_config.label || settings.work_metric_config.field_key,
      unit_label: settings.work_metric_config.unit_label || 'pts',
    };
  }
  if (settings?.work_unit_field) {
    return {
      field_key: settings.work_unit_field,
      label: settings.work_unit_field,
      unit_label: 'pts',
    };
  }
  return DEFAULT_WORK_METRIC_CONFIG;
}

export interface AutomationTrigger {
  event?: 'item_created' | string;
  type?: string;
  item_type?: string;
  status?: string;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface ExpandChildrenTemplateAction {
  type: 'expand_children_template';
  template_id: string;
  [key: string]: any;
}

export interface DispatchWebhookAction {
  type: 'dispatch_webhook';
  url: string;
  include_parent_context?: boolean;
  secret?: string;
  [key: string]: any;
}

export interface LegacyTemplateAction {
  type: 'apply_template' | 'template' | 'execute_template';
  target?: string;
  template_id?: string;
  [key: string]: any;
}

export interface PatchMetadataAction {
  type: 'patch_metadata' | 'patch_item';
  metadata?: Record<string, any>;
  fields?: Record<string, any>;
  [key: string]: any;
}

export interface CreateItemAction {
  type: 'create_item' | 'create_bug' | 'create_defect';
  item_type?: string;
  title?: string;
  description?: string;
  priority?: string;
  status?: string;
  parent_id?: string;
  parent_epic_ref?: string;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface CalculateCalendarSlotAction {
  type: 'calculate_calendar_slot' | 'calculate_cadence';
  cadence_days?: number;
  weekday?: string;
  utc_time?: string;
  collision_statuses?: string[];
  [key: string]: any;
}

export interface GenericAutomationAction {
  type: string;
  target?: string;
  template_id?: string;
  url?: string;
  include_parent_context?: boolean;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export type AutomationAction =
  | ExpandChildrenTemplateAction
  | DispatchWebhookAction
  | LegacyTemplateAction
  | PatchMetadataAction
  | CreateItemAction
  | CalculateCalendarSlotAction
  | GenericAutomationAction;

export interface AutomationCondition {
  field: string;
  operator: string;
  value?: any;
  logic?: 'AND' | 'OR';
  [key: string]: any;
}

export type AutomationRuleCondition = AutomationCondition;

export interface AutomationRule {
  id?: string;
  name?: string;
  description?: string;
  enabled?: boolean;
  trigger: AutomationTrigger;
  conditions?: AutomationRuleCondition[];
  actions?: AutomationAction[];
  action?: AutomationAction;
  [key: string]: any;
}

export interface ProjectTemplateItem {
  external_ref_id?: string;
  title: string;
  description?: string;
  item_type?: string;
  status?: string;
  parent_ref_id?: string;
  assignee?: string;
  order_index?: number;
  metadata?: Record<string, any>;
  [key: string]: any;
}

export interface TransitionGuardCondition {
  field: string;
  operator: string;
  value?: any;
  message: string;
}

export interface TransitionGuard {
  id: string;
  name?: string;
  enabled?: boolean;
  target_status: string;
  when?: AutomationCondition[];
  conditions: TransitionGuardCondition[];
  [key: string]: any;
}

export interface ProjectSettings {
  schema_version: string;
  hierarchy: HierarchyLevel[];
  statuses: StatusDefinition[];
  custom_fields: CustomField[];
  custom_metadata_fields?: CustomMetadataFieldDefinition[];
  work_metric_config?: WorkMetricConfig;
  work_unit_field?: string;
  wip_limit?: number;
  sprint_settings?: SprintSettings;
  sprint_metrics?: MetricRules;
  metric_rules?: MetricRules;
  github_repo?: string;
  repository_url?: string;
  automations?: AutomationRule[];
  transition_guards?: TransitionGuard[];
  workflow?: Record<string, any>;
  templates?: Record<string, ProjectTemplateItem[]> | any;
  [key: string]: any;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  api_key?: string | null;
  api_key_hash?: string | null;
  api_key_preview?: string | null;
  owner_id?: string | null;
  tier: string;
  settings?: TenantSettings;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  /** Soft-delete timestamp. NULL = active. Set to ISO string when deleted. */
  deleted_at?: string | null;
}

export interface Project {
  id: string;
  tenant_id: string;
  app_id: string;
  name: string;
  slug: string;
  description?: string | null;
  settings: ProjectSettings;
  order_index?: number;
  created_at: string;
  updated_at: string;
  /** Soft-delete timestamp. NULL = active. Set to ISO string when deleted. */
  deleted_at?: string | null;
}

export interface ReorderProjectsPayload {
  items: Array<{ project_id: string; order_index: number }>;
}

export interface WorkItem {
  id: string;
  tenant_id: string;
  project_id: string;
  parent_id?: string | null;
  sprint_id?: string | null;
  external_ref_id?: string | null;
  item_type: string;
  status: string;
  title: string;
  description?: string | null;
  order_index: number;
  assignee?: string | null;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
  /** Soft-delete timestamp. NULL = active. Set to ISO string when deleted. */
  deleted_at?: string | null;
}

export interface WorkItemWithChildren extends WorkItem {
  children?: WorkItemWithChildren[];
}

export interface WorkItemNode extends WorkItem {
  depth: number;
  children?: WorkItemNode[];
  descendantCount?: number;
  rollupPoints?: number;
}

export interface IngestItemPayload {
  external_ref_id?: string;
  title: string;
  description?: string;
  item_type?: string;     // Defaults to 'task' or lowest level in hierarchy if omitted
  status?: string;        // Defaults to 'not_started' or first status if omitted
  parent_ref_id?: string; // Links to parent external_ref_id
  assignee?: string;
  order_index?: number;
  metadata?: Record<string, any>;
}

export interface IngestRequestPayload {
  project_slug: string;
  items: IngestItemPayload[];
}

export interface IngestResponse {
  success: boolean;
  count: number;
  items: WorkItem[];
  error?: string;
}

export interface BoardColumn {
  status: StatusDefinition;
  items: WorkItem[];
}

export interface ReorderItemPayload {
  item_id: string;
  new_status?: string;
  previous_order_index?: number | null;
  next_order_index?: number | null;
  new_parent_id?: string | null;
}

/** Row from tracker.tenant_members */
export interface TenantMember {
  id: string;
  tenant_id: string;
  user_id: string;
  /** 'owner' | 'admin' | 'member' */
  role: string;
  created_at: string;
}

/** Tenant enriched with the current user's membership role — returned by /api/v1/tenants/me */
export interface TenantWithRole extends Tenant {
  role: string;
  member_since: string;
}

/** Row from tracker.audit_logs */
export interface AuditLogEntry {
  id: string;
  tenant_id: string;
  project_id: string;
  item_id: string;
  actor_id?: string | null;
  actor_name?: string | null;
  action: 'create' | 'update' | 'delete' | 'restore';
  changed_fields: Record<string, { before: any; after: any }>;
  created_at: string;
}

/** Row from tracker.notifications */
export interface InAppNotification {
  id: string;
  tenant_id: string;
  user_id: string;
  actor_name?: string | null;
  item_id?: string | null;
  item_title?: string | null;
  action: string;
  read: boolean;
  created_at: string;
}

/** User notification preferences */
export interface NotificationPreferences {
  notify_in_app: boolean;
  notify_email: boolean;
  notify_on_assignment: boolean;
  notify_on_status_change: boolean;
}

/** Row from tracker.work_item_comments */
export interface WorkItemComment {
  id: string;
  item_id: string;
  author_id?: string | null;
  author_name: string;
  content: string;
  created_at: string;
  updated_at: string;
}

/** Maximum character length allowed for a single comment */
export const MAX_COMMENT_LENGTH = 5000;

