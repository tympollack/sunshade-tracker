export interface HierarchyLevel {
  type: string;
  label: string;
  level: number;
  allowed_parents: string[];
}

export interface StatusDefinition {
  id: string;
  label: string;
  color: string;
  order: number;
}

export interface ProjectSettings {
  schema_version: string;
  hierarchy: HierarchyLevel[];
  statuses: StatusDefinition[];
  custom_fields: string[];
  [key: string]: any;
}

export interface Tenant {
  id: string;
  slug: string;
  name: string;
  api_key: string;
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
  created_at: string;
  updated_at: string;
  /** Soft-delete timestamp. NULL = active. Set to ISO string when deleted. */
  deleted_at?: string | null;
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
