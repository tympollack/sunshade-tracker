export interface TrackerMcpConfig {
  apiKey?: string;
  baseUrl?: string;
  tenantSlug?: string;
  projectSlug?: string;
}

export interface FetchAssignedTasksArgs {
  project_slug?: string;
  assignee?: string;
  status?: string;
}

export interface GetTaskSpecArgs {
  task_id: string;
  project_slug?: string;
}

export interface IngestItemInput {
  title: string;
  item_type?: string;
  description?: string | null;
  status?: string;
  assignee?: string | null;
  parent_ref_id?: string | null;
  parent_id?: string | null;
  external_ref_id?: string | null;
  order_index?: number;
  metadata?: Record<string, any>;
}

export interface CreateWorkItemArgs {
  project_slug: string;
  items: IngestItemInput[];
  override_sprint?: string | null;
  override_assignee?: string | null;
}

export interface UpdateTaskStatusArgs {
  task_id: string;
  status: 'not_started' | 'in_progress' | 'in_review' | 'complete' | string;
  pr_url?: string;
  commit_hash?: string;
  notes?: string;
  project_slug?: string;
  metadata?: Record<string, any>;
}
