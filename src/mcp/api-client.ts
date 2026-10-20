import { TrackerMcpConfig, FetchAssignedTasksArgs, GetTaskSpecArgs, CreateWorkItemArgs, UpdateTaskStatusArgs } from './types';
import { validateApiKey, translateHttpError } from './errors';
import { generateAgentPrompt, TaskContextSpec } from '@/lib/prompt-generator';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export class TrackerApiClient {
  private apiKey: string;
  private baseUrl: string;
  private tenantSlug?: string;
  private projectSlug?: string;

  constructor(config: Partial<TrackerMcpConfig> = {}) {
    this.apiKey =
      config.apiKey ||
      process.env.SUNSHADE_API_KEY ||
      process.env.TRACKER_API_KEY ||
      '';
    this.baseUrl = (
      config.baseUrl ||
      process.env.SUNSHADE_BASE_URL ||
      process.env.TRACKER_BASE_URL ||
      'https://track.sunshade.icu'
    ).replace(/\/$/, '');
    this.tenantSlug =
      config.tenantSlug ||
      process.env.TRACKER_TENANT ||
      process.env.SUNSHADE_TENANT ||
      '';
    this.projectSlug =
      config.projectSlug ||
      process.env.TRACKER_PROJECT ||
      '';
  }

  private getAuthHeader(): string {
    const validKey = validateApiKey(this.apiKey);
    return `Bearer ${validKey}`;
  }

  public async fetch(endpoint: string, options: RequestInit = {}): Promise<any> {
    const authHeader = this.getAuthHeader();
    const headers: Record<string, string> = {
      Authorization: authHeader,
      Accept: 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    };

    if (options.body && typeof options.body === 'object' && !(options.body instanceof String)) {
      headers['Content-Type'] = 'application/json';
      options.body = JSON.stringify(options.body);
    }

    const url = endpoint.startsWith('http://') || endpoint.startsWith('https://')
      ? endpoint
      : `${this.baseUrl}/${endpoint.replace(/^\//, '')}`;

    let res: Response;
    try {
      res = await globalThis.fetch(url, { ...options, headers });
    } catch (netErr: any) {
      throw translateHttpError(500, `Network failure connecting to Tracker API: ${netErr?.message || netErr}`);
    }

    let data: any;
    const text = await res.text();
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }

    if (!res.ok) {
      const errMsg = typeof data === 'object' && data?.error ? data.error : String(data || res.statusText);
      throw translateHttpError(res.status, errMsg);
    }

    return data;
  }

  /**
   * Resolves a work item by either UUID or external_ref_id
   */
  public async resolveItem(idOrRef: string, projectSlug?: string): Promise<any> {
    const slug = projectSlug || this.projectSlug;

    // 1. If it's a UUID, direct lookup
    if (UUID_REGEX.test(idOrRef)) {
      const tenantParam = this.tenantSlug ? `&tenant_slug=${encodeURIComponent(this.tenantSlug)}` : '';
      try {
        const res = await this.fetch(`/api/v1/items?id=${encodeURIComponent(idOrRef)}${tenantParam}`);
        if (res?.item) return res.item;
      } catch (err: any) {
        // If 404, fall through to list search
      }
    }

    // 2. Query project items or workspace items
    const querySlug = slug || 'all';
    const slugParam = querySlug !== 'all' ? `project_slug=${encodeURIComponent(querySlug)}` : 'all_projects=true';
    const tenantParam = this.tenantSlug ? `&tenant_slug=${encodeURIComponent(this.tenantSlug)}` : '';
    const res = await this.fetch(`/api/v1/items?${slugParam}${tenantParam}&include_cold_archive=true`);

    if (Array.isArray(res?.items)) {
      const found = res.items.find(
        (it: any) => it.external_ref_id === idOrRef || it.id === idOrRef
      );
      if (found) return found;
    }

    throw translateHttpError(404, `Work item with identifier "${idOrRef}" could not be found.`);
  }

  /**
   * fetch_assigned_tasks: Lists work items matching tenant, project slug, and assignee.
   */
  public async fetchAssignedTasks(args: FetchAssignedTasksArgs = {}): Promise<any[]> {
    const targetSlug = args.project_slug || this.projectSlug;
    const queryParts: string[] = [];

    if (targetSlug && targetSlug !== 'all') {
      queryParts.push(`project_slug=${encodeURIComponent(targetSlug)}`);
    } else {
      queryParts.push('all_projects=true');
    }

    if (this.tenantSlug) {
      queryParts.push(`tenant_slug=${encodeURIComponent(this.tenantSlug)}`);
    }

    if (args.status) {
      queryParts.push(`status=${encodeURIComponent(args.status)}`);
    }

    const res = await this.fetch(`/api/v1/items?${queryParts.join('&')}`);
    let items = Array.isArray(res?.items) ? res.items : [];

    if (args.assignee) {
      const targetAssignee = args.assignee.toLowerCase();
      items = items.filter((it: any) => {
        if (!it.assignee) return false;
        return (
          it.assignee.toLowerCase() === targetAssignee ||
          (it.assignee.toLowerCase().includes(targetAssignee))
        );
      });
    }

    return items;
  }

  /**
   * get_task_spec: Retrieves comprehensive item metadata, acceptance criteria,
   * raw agent_prompt, and full hierarchical context.
   */
  public async getTaskSpec(args: GetTaskSpecArgs): Promise<TaskContextSpec> {
    const item = await this.resolveItem(args.task_id, args.project_slug);

    // Try dedicated context endpoint first
    try {
      const contextRes = await this.fetch(`/api/v1/items/${item.id}/context?format=json`);
      if (contextRes?.spec) {
        return contextRes.spec;
      }
    } catch {
      // Fallback: construct context spec client-side
    }

    // Client-side lineage resolution
    const hierarchy: any[] = [];
    let currentParentId = item.parent_id;

    while (currentParentId) {
      try {
        const parentRes = await this.fetch(`/api/v1/items?id=${currentParentId}`);
        if (parentRes?.item) {
          hierarchy.unshift(parentRes.item);
          currentParentId = parentRes.item.parent_id;
        } else {
          break;
        }
      } catch {
        break;
      }
    }

    return generateAgentPrompt(item, {
      project: { slug: args.project_slug || this.projectSlug },
      hierarchy,
    });
  }

  /**
   * create_work_item: Invokes POST /api/v1/items/ingest with batch upsert capabilities.
   */
  public async createWorkItem(args: CreateWorkItemArgs): Promise<any> {
    const payload = {
      project_slug: args.project_slug,
      items: args.items,
      override_sprint: args.override_sprint,
      override_assignee: args.override_assignee,
    };

    return await this.fetch('/api/v1/items/ingest', {
      method: 'POST',
      body: payload as any,
    });
  }

  /**
   * update_task_status: Transitions card status and appends PR URLs or commit hashes.
   */
  public async updateTaskStatus(args: UpdateTaskStatusArgs): Promise<any> {
    const item = await this.resolveItem(args.task_id, args.project_slug);
    const existingMetadata = (item.metadata || {}) as Record<string, any>;

    const updatedMetadata = {
      ...existingMetadata,
      ...(args.metadata || {}),
    };

    if (args.pr_url) {
      updatedMetadata.pr_url = args.pr_url;
      const prs = Array.isArray(existingMetadata.pr_urls) ? [...existingMetadata.pr_urls] : [];
      if (!prs.includes(args.pr_url)) prs.push(args.pr_url);
      updatedMetadata.pr_urls = prs;
    }

    if (args.commit_hash) {
      updatedMetadata.commit_hash = args.commit_hash;
      const hashes = Array.isArray(existingMetadata.commit_hashes) ? [...existingMetadata.commit_hashes] : [];
      if (!hashes.includes(args.commit_hash)) hashes.push(args.commit_hash);
      updatedMetadata.commit_hashes = hashes;
    }

    if (args.notes) {
      const logs = Array.isArray(existingMetadata.runtime_logs) ? [...existingMetadata.runtime_logs] : [];
      logs.push({
        timestamp: new Date().toISOString(),
        note: args.notes,
      });
      updatedMetadata.runtime_logs = logs;
    }

    const patchPayload = {
      id: item.id,
      status: args.status,
      metadata: updatedMetadata,
    };

    return await this.fetch('/api/v1/items', {
      method: 'PATCH',
      body: patchPayload as any,
    });
  }

  /**
   * Resolves a project by slug from GET /api/v1/projects
   */
  public async getProject(slug: string): Promise<any> {
    const tenantParam = this.tenantSlug ? `?tenant_slug=${encodeURIComponent(this.tenantSlug)}` : '';
    const res = await this.fetch(`/api/v1/projects${tenantParam}`);
    const projects = Array.isArray(res?.projects) ? res.projects : [];
    const project = projects.find((p: any) => p.slug === slug || p.id === slug);
    if (!project) {
      throw translateHttpError(404, `Project with slug or ID "${slug}" could not be found.`);
    }
    return project;
  }

  /**
   * getProjectSchema: Queries project settings and formats hierarchy constraints and allowed parents as JSON text.
   */
  public async getProjectSchema(slug: string): Promise<{ uri: string; mimeType: string; text: string }> {
    const project = await this.getProject(slug);

    let settings = project.settings || {};
    try {
      const settingsRes = await this.fetch(`/api/v1/projects/${project.id}/settings`);
      if (settingsRes?.settings) {
        settings = settingsRes.settings;
      }
    } catch {
      // Use embedded settings from project
    }

    const schemaData = {
      project_id: project.id,
      project_slug: project.slug,
      project_name: project.name,
      hierarchy: settings.hierarchy || [],
      statuses: settings.statuses || [],
      custom_fields: settings.custom_fields || [],
      allowed_parents: (settings.hierarchy || []).map((h: any) => ({
        type: h.type,
        allowed_parents: h.allowed_parents || [],
      })),
    };

    return {
      uri: `tracker://projects/${slug}/schema`,
      mimeType: 'application/json',
      text: JSON.stringify(schemaData, null, 2),
    };
  }

  /**
   * getProjectContext: Aggregates active sprint epics, in-flight PRs, and top-priority blockers into a condensed markdown brief.
   */
  public async getProjectContext(slug: string): Promise<{ uri: string; mimeType: string; text: string }> {
    const project = await this.getProject(slug);
    const tenantParam = this.tenantSlug ? `&tenant_slug=${encodeURIComponent(this.tenantSlug)}` : '';
    const itemsRes = await this.fetch(`/api/v1/items?project_slug=${encodeURIComponent(project.slug)}${tenantParam}`);
    const items = Array.isArray(itemsRes?.items) ? itemsRes.items : [];

    const isTerminal = (status?: string) =>
      Boolean(status && /^(complete|completed|done|closed|finished|approved|published|resolved)$/i.test(status));

    const epics = items.filter((it: any) => it.item_type === 'epic' && !isTerminal(it.status));
    const inFlightPrs = items.filter(
      (it: any) => !isTerminal(it.status) && (Boolean(it.metadata?.pr_url) || Boolean(it.metadata?.pr_urls?.length) || it.status === 'in_review')
    );
    const blockers = items.filter(
      (it: any) => !isTerminal(it.status) && (it.status === 'blocked' || it.metadata?.priority === 'Critical' || it.metadata?.priority === 'High')
    );

    const lines: string[] = [
      `# Project Brief: ${project.name} (\`${project.slug}\`)`,
      '',
      `## Active Epics (${epics.length})`,
      ...(epics.length > 0
        ? epics.map((e: any) => `- **[${e.external_ref_id || e.id.slice(0, 8)}]** ${e.title} (${e.status})`)
        : ['*No active epics in this project.*']),
      '',
      `## In-Flight Pull Requests (${inFlightPrs.length})`,
      ...(inFlightPrs.length > 0
        ? inFlightPrs.map((pr: any) => {
            const url = pr.metadata?.pr_url || (Array.isArray(pr.metadata?.pr_urls) ? pr.metadata.pr_urls[0] : null);
            return `- **[${pr.external_ref_id || pr.id.slice(0, 8)}]** ${pr.title} - ${url ? `[PR Link](${url})` : 'Status: in_review'}`;
          })
        : ['*No in-flight pull requests.*']),
      '',
      `## High Priority & Blockers (${blockers.length})`,
      ...(blockers.length > 0
        ? blockers.slice(0, 10).map((b: any) => `- **[${b.external_ref_id || b.id.slice(0, 8)}]** [${b.metadata?.priority || 'Blocked'}] ${b.title}`)
        : ['*No critical blockers.*']),
      '',
    ];

    return {
      uri: `tracker://projects/${slug}/context`,
      mimeType: 'text/markdown',
      text: lines.join('\n'),
    };
  }
}
