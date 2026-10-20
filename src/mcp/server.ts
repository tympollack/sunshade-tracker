import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ErrorCode,
  McpError,
} from '@modelcontextprotocol/sdk/types.js';
import { TrackerMcpConfig } from './types';
import { TRACKER_TOOLS } from './tools';
import { TrackerApiClient } from './api-client';

export interface TrackerServerOptions {
  config?: Partial<TrackerMcpConfig>;
  apiClient?: TrackerApiClient;
}

export function createTrackerMcpServer(options: TrackerServerOptions = {}): Server {
  const apiClient = options.apiClient || new TrackerApiClient(options.config);

  const server = new Server(
    {
      name: 'sunshade-tracker-mcp',
      version: '1.0.0',
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // Register tools list
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    return {
      tools: TRACKER_TOOLS,
    };
  });

  // Register tool execution handler
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    try {
      switch (name) {
        case 'fetch_assigned_tasks': {
          const tasks = await apiClient.fetchAssignedTasks(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(tasks, null, 2),
              },
            ],
          };
        }

        case 'get_task_spec': {
          if (!args || typeof (args as any).task_id !== 'string') {
            throw new McpError(ErrorCode.InvalidParams, 'Argument "task_id" is required for get_task_spec.');
          }
          const spec = await apiClient.getTaskSpec(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(spec, null, 2),
              },
            ],
          };
        }

        case 'create_work_item': {
          if (!args || !(args as any).project_slug || !Array.isArray((args as any).items)) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Arguments "project_slug" and "items" (array) are required for create_work_item.'
            );
          }
          const result = await apiClient.createWorkItem(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        case 'update_task_status': {
          if (!args || !(args as any).task_id || !(args as any).status) {
            throw new McpError(
              ErrorCode.InvalidParams,
              'Arguments "task_id" and "status" are required for update_task_status.'
            );
          }
          const result = await apiClient.updateTaskStatus(args as any);
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(result, null, 2),
              },
            ],
          };
        }

        default:
          throw new McpError(ErrorCode.MethodNotFound, `Tool not found: "${name}"`);
      }
    } catch (err: any) {
      if (err instanceof McpError) {
        throw err;
      }
      return {
        isError: true,
        content: [
          {
            type: 'text',
            text: `Tool Execution Error [${name}]: ${err?.message || String(err)}`,
          },
        ],
      };
    }
  });

  return server;
}
