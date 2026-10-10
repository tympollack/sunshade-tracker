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
  /** Elapsed sprint runway ratio cutoff to trigger sizing guardrails (default: 0.60) */
  late_runway_threshold?: number;
  /** Maximum story points allowed for feature items when runway threshold is exceeded (default: 2) */
  late_runway_max_points?: number;
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

export type CustomFieldType = 'number' | 'string' | 'enum' | 'boolean' | 'date';

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

export interface ProjectSettings {
  schema_version: string;
  hierarchy: HierarchyLevel[];
  statuses: StatusDefinition[];
  custom_fields: string[];
  custom_metadata_fields?: CustomMetadataFieldDefinition[];
  work_metric_config?: WorkMetricConfig;
  work_unit_field?: string;
  sprint_settings?: SprintSettings;
  sprint_metrics?: MetricRules;
  metric_rules?: MetricRules;
  github_repo?: string;
  repository_url?: string;
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

