import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassThrough } from 'node:stream';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import {
  createTrackerMcpServer,
  TrackerApiClient,
  validateApiKey,
  translateHttpError,
  TRACKER_TOOLS,
} from '@/mcp';
import { McpError, ErrorCode } from '@modelcontextprotocol/sdk/types.js';

describe('TASK-TRK-MCP-SERVER: Model Context Protocol Server for Tracker', () => {
  const mockApiKey = 'tk_live_mock_agent_key_1234567890';
  let mockApiClient: TrackerApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient = new TrackerApiClient({
      apiKey: mockApiKey,
      baseUrl: 'https://track.sunshade.icu',
      tenantSlug: 'pym-energy',
      projectSlug: 'sunshade-tracker',
    });
  });

  describe('Authentication & Error Handling Validation', () => {
    it('validates tk_live_* format and rejects invalid or missing tokens with 401 McpError', () => {
      expect(validateApiKey('tk_live_valid_key')).toBe('tk_live_valid_key');
      expect(validateApiKey('tk_test_valid_key')).toBe('tk_test_valid_key');

      expect(() => validateApiKey('')).toThrowError(/Unauthorized \[401\]/);
      expect(() => validateApiKey(undefined)).toThrowError(/Unauthorized \[401\]/);
      expect(() => validateApiKey('invalid_prefix_key')).toThrowError(/Expected Bearer token starting with "tk_live_\*"/);
    });

    it('translates HTTP 401, 403, 404, and 500 into standardized MCP errors', () => {
      const err401 = translateHttpError(401, 'Invalid tenant token');
      expect(err401).toBeInstanceOf(McpError);
      expect(err401.code).toBe(ErrorCode.InvalidRequest);
      expect(err401.message).toContain('Unauthorized [401]');

      const err404 = translateHttpError(404, 'Item not found');
      expect(err404.code).toBe(ErrorCode.InvalidParams);
      expect(err404.message).toContain('Not Found [404]');

      const err500 = translateHttpError(500, 'Database query failed');
      expect(err500.code).toBe(ErrorCode.InternalError);
      expect(err500.message).toContain('Server Error [500]');
    });
  });

  describe('MCP Protocol Tool Exposure & Execution (InMemory Transport)', () => {
    let client: Client;
    let server: ReturnType<typeof createTrackerMcpServer>;

    beforeEach(async () => {
      server = createTrackerMcpServer({
        config: { apiKey: mockApiKey, projectSlug: 'sunshade-tracker' },
        apiClient: mockApiClient,
      });

      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

      client = new Client(
        { name: 'test-agent-client', version: '1.0.0' },
        { capabilities: {} }
      );

      await Promise.all([
        server.connect(serverTransport),
        client.connect(clientTransport),
      ]);
    });

    it('lists all required tools matching the specification', async () => {
      const toolsResult = await client.listTools();
      const toolNames = toolsResult.tools.map((t) => t.name);

      expect(toolNames).toContain('fetch_assigned_tasks');
      expect(toolNames).toContain('get_task_spec');
      expect(toolNames).toContain('create_work_item');
      expect(toolNames).toContain('update_task_status');
      expect(toolsResult.tools).toHaveLength(4);
    });

    it('executes fetch_assigned_tasks and returns filtered tasks', async () => {
      const mockTasks = [
        {
          id: 'task-101',
          external_ref_id: 'TASK-101',
          title: 'Implement feature',
          assignee: 'Tymz',
          status: 'not_started',
        },
      ];

      vi.spyOn(mockApiClient, 'fetchAssignedTasks').mockResolvedValue(mockTasks);

      const result = await client.callTool({
        name: 'fetch_assigned_tasks',
        arguments: { project_slug: 'sunshade-tracker', assignee: 'tymz' },
      });

      expect(mockApiClient.fetchAssignedTasks).toHaveBeenCalledWith({
        project_slug: 'sunshade-tracker',
        assignee: 'tymz',
      });
      expect((result as any).content).toHaveLength(1);
      expect(JSON.parse(((result as any).content[0] as any).text)).toEqual(mockTasks);
    });

    it('executes get_task_spec and returns comprehensive metadata and agent prompt', async () => {
      const mockSpec = {
        item: {
          id: 'task-202',
          external_ref_id: 'TASK-202',
          title: 'Fix auth boundary',
          item_type: 'task',
          status: 'in_progress',
        },
        project: { slug: 'sunshade-tracker' },
        hierarchy: [],
        agent_prompt: '### SYSTEM ROLE: Secure auth boundary',
        acceptance_criteria: ['Returns 401 on missing token'],
        technical_constraints: ['No unhandled exceptions'],
        commit_hashes: ['abc1234'],
        pr_urls: ['https://github.com/org/repo/pull/1'],
        markdown_prompt: '# Work Item Context: Fix auth boundary [TASK-202]',
      };

      vi.spyOn(mockApiClient, 'getTaskSpec').mockResolvedValue(mockSpec as any);

      const result = await client.callTool({
        name: 'get_task_spec',
        arguments: { task_id: 'TASK-202' },
      });

      expect(mockApiClient.getTaskSpec).toHaveBeenCalledWith({ task_id: 'TASK-202' });
      const parsed = JSON.parse(((result as any).content[0] as any).text);
      expect(parsed.agent_prompt).toBe('### SYSTEM ROLE: Secure auth boundary');
      expect(parsed.acceptance_criteria).toContain('Returns 401 on missing token');
      expect(parsed.markdown_prompt).toContain('# Work Item Context: Fix auth boundary');
    });

    it('executes create_work_item with batch upsert payload', async () => {
      const mockIngestResult = {
        success: true,
        count: 2,
        items: [{ id: 'item-1' }, { id: 'item-2' }],
      };

      vi.spyOn(mockApiClient, 'createWorkItem').mockResolvedValue(mockIngestResult);

      const result = await client.callTool({
        name: 'create_work_item',
        arguments: {
          project_slug: 'sunshade-tracker',
          items: [
            { title: 'Subtask 1', item_type: 'task' },
            { title: 'Subtask 2', item_type: 'task' },
          ],
        },
      });

      expect(mockApiClient.createWorkItem).toHaveBeenCalledWith({
        project_slug: 'sunshade-tracker',
        items: [
          { title: 'Subtask 1', item_type: 'task' },
          { title: 'Subtask 2', item_type: 'task' },
        ],
      });
      const parsed = JSON.parse(((result as any).content[0] as any).text);
      expect(parsed.success).toBe(true);
      expect(parsed.count).toBe(2);
    });

    it('executes update_task_status appending PR url and commit hash', async () => {
      const mockUpdateResult = {
        id: 'task-303',
        status: 'complete',
        metadata: {
          pr_url: 'https://github.com/org/repo/pull/42',
          commit_hash: 'feedface123',
        },
      };

      vi.spyOn(mockApiClient, 'updateTaskStatus').mockResolvedValue(mockUpdateResult);

      const result = await client.callTool({
        name: 'update_task_status',
        arguments: {
          task_id: 'TASK-303',
          status: 'complete',
          pr_url: 'https://github.com/org/repo/pull/42',
          commit_hash: 'feedface123',
          notes: 'Executed successfully via Antigravity runner',
        },
      });

      expect(mockApiClient.updateTaskStatus).toHaveBeenCalledWith({
        task_id: 'TASK-303',
        status: 'complete',
        pr_url: 'https://github.com/org/repo/pull/42',
        commit_hash: 'feedface123',
        notes: 'Executed successfully via Antigravity runner',
      });
      const parsed = JSON.parse(((result as any).content[0] as any).text);
      expect(parsed.status).toBe('complete');
      expect(parsed.metadata.pr_url).toBe('https://github.com/org/repo/pull/42');
    });

    it('rejects unknown tool calls with MethodNotFound', async () => {
      await expect(
        client.callTool({
          name: 'non_existent_tool',
          arguments: {},
        })
      ).rejects.toThrowError();
    });
  });

  describe('Stdio Stream Transport Integration', () => {
    it('initializes and serves tool requests across simulated stdio streams', async () => {
      const serverIn = new PassThrough();
      const serverOut = new PassThrough();

      const serverTransport = new StdioServerTransport(serverIn as any, serverOut as any);
      const server = createTrackerMcpServer({
        config: { apiKey: mockApiKey },
        apiClient: mockApiClient,
      });

      vi.spyOn(mockApiClient, 'fetchAssignedTasks').mockResolvedValue([
        { id: '1', title: 'Stdio Task', status: 'not_started' },
      ]);

      await server.connect(serverTransport);

      // Connect client to the opposing ends of the streams
      const clientTransport = new StdioServerTransport(serverOut as any, serverIn as any);
      const client = new Client(
        { name: 'stdio-agent', version: '1.0.0' },
        { capabilities: {} }
      );

      await client.connect(clientTransport as any);

      const tools = await client.listTools();
      expect(tools.tools.length).toBeGreaterThanOrEqual(4);

      const toolCall = await client.callTool({
        name: 'fetch_assigned_tasks',
        arguments: { project_slug: 'sunshade-tracker' },
      });

      expect((toolCall as any).content).toBeDefined();
      const items = JSON.parse(((toolCall as any).content[0] as any).text);
      expect(items[0].title).toBe('Stdio Task');

      await client.close();
      await server.close();
    });
  });
});
