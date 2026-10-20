import { Tool } from '@modelcontextprotocol/sdk/types.js';

export const TRACKER_TOOLS: Tool[] = [
  {
    name: 'fetch_assigned_tasks',
    description: 'Fetch work items from SunShade Tracker matching tenant, project slug, and assignee.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: {
          type: 'string',
          description: 'Project slug (e.g. sunshade-tracker, patchwork, valerie). Defaults to workspace project.',
        },
        assignee: {
          type: 'string',
          description: 'Filter tasks assigned to a specific user or agent handle (case-insensitive substring match).',
        },
        status: {
          type: 'string',
          description: 'Filter items by status (e.g. not_started, in_progress, in_review, complete).',
        },
      },
      required: [],
    },
  },
  {
    name: 'get_task_spec',
    description: 'Retrieve comprehensive item specification including acceptance criteria, hierarchical context lineage, and raw agent prompt.',
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'The UUID or external_ref_id (e.g. TASK-TRK-MCP-SERVER) of the work item.',
        },
        project_slug: {
          type: 'string',
          description: 'Optional project slug to scope the lookup when querying by external_ref_id.',
        },
      },
      required: ['task_id'],
    },
  },
  {
    name: 'create_work_item',
    description: 'Create or batch-ingest work items into SunShade Tracker with upsert capabilities.',
    inputSchema: {
      type: 'object',
      properties: {
        project_slug: {
          type: 'string',
          description: 'Target project slug where the items should be created.',
        },
        items: {
          type: 'array',
          description: 'List of work item payloads to ingest into the project.',
          items: {
            type: 'object',
            properties: {
              title: { type: 'string', description: 'Item title' },
              item_type: { type: 'string', description: 'Item type (e.g. epic, story, task, bug, subtask)' },
              description: { type: 'string', description: 'Markdown description' },
              status: { type: 'string', description: 'Initial status' },
              assignee: { type: 'string', description: 'Assigned user or agent' },
              parent_ref_id: { type: 'string', description: 'External ref ID of parent item' },
              external_ref_id: { type: 'string', description: 'Deterministic external reference ID' },
              order_index: { type: 'number', description: 'Fractional ordering index' },
              metadata: { type: 'object', description: 'Custom JSONB metadata (agent_prompt, acceptance_criteria, etc.)' },
            },
            required: ['title'],
          },
        },
        override_sprint: {
          type: 'string',
          description: 'Optional sprint name to assign all ingested items to.',
        },
        override_assignee: {
          type: 'string',
          description: 'Optional assignee to apply to all ingested items.',
        },
      },
      required: ['project_slug', 'items'],
    },
  },
  {
    name: 'update_task_status',
    description: "Transition a work item status ('not_started', 'in_progress', 'complete') and append execution metadata (PR URL, commit hash, runtime logs).",
    inputSchema: {
      type: 'object',
      properties: {
        task_id: {
          type: 'string',
          description: 'The UUID or external_ref_id of the item to update.',
        },
        status: {
          type: 'string',
          description: 'Target status (e.g. not_started, in_progress, in_review, complete).',
        },
        pr_url: {
          type: 'string',
          description: 'GitHub Pull Request URL to attach to work item metadata.',
        },
        commit_hash: {
          type: 'string',
          description: 'Git commit hash to attach to work item metadata.',
        },
        notes: {
          type: 'string',
          description: 'Runtime execution note or log entry to record on the card.',
        },
        project_slug: {
          type: 'string',
          description: 'Optional project slug to scope resolution of external_ref_id.',
        },
        metadata: {
          type: 'object',
          description: 'Optional additional metadata keys to merge into the work item.',
        },
      },
      required: ['task_id', 'status'],
    },
  },
];
