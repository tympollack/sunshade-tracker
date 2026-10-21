import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  SunshadeCliApi,
  buildCliProgram,
  fetchWithRetry,
  loadCliConfig,
} from '@/cli';

describe('TASK-TRK-CLI-SKILLS: sunshade-cli Executable for Terminal & Sandbox Agents', () => {
  const mockApiKey = 'tk_live_test_agent_secret_key';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUNSHADE_API_KEY = mockApiKey;
    process.env.SUNSHADE_BASE_URL = 'https://track.sunshade.icu';
    process.env.TRACKER_PROJECT = 'sunshade-tracker';
    process.env.TRACKER_TENANT = 'pym-energy';
  });

  afterEach(() => {
    delete process.env.SUNSHADE_API_KEY;
    delete process.env.SUNSHADE_BASE_URL;
    delete process.env.TRACKER_PROJECT;
    delete process.env.TRACKER_TENANT;
  });

  describe('CLI Signature and Help Output', () => {
    it('contains all documented subcommands in program help', () => {
      const program = buildCliProgram();
      const commandNames = program.commands.map((c) => c.name());

      expect(commandNames).toContain('task:next');
      expect(commandNames).toContain('task:claim');
      expect(commandNames).toContain('task:complete');
      expect(commandNames).toContain('task:log');

      const helpText = program.helpInformation();
      expect(helpText).toContain('task:next');
      expect(helpText).toContain('task:claim');
      expect(helpText).toContain('task:complete');
      expect(helpText).toContain('task:log');
      expect(helpText).toContain('--json');
      expect(helpText).toContain('--project');
    });
  });

  describe('Network Retry with Exponential Backoff', () => {
    it('retries on HTTP 500/503 responses and recovers on subsequent success', async () => {
      let callCount = 0;
      const mockFetch = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 3) {
          return new Response(JSON.stringify({ error: 'Gateway Timeout' }), { status: 504 });
        }
        return new Response(JSON.stringify({ success: true, count: 1 }), { status: 200 });
      });

      vi.stubGlobal('fetch', mockFetch);

      const res = await fetchWithRetry('https://track.sunshade.icu/api/v1/test', {}, 3, 10);
      expect(res.status).toBe(200);
      expect(callCount).toBe(3);

      vi.unstubAllGlobals();
    });

    it('throws error after exhausting max retries on persistent HTTP 500', async () => {
      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: 'Fatal DB Error' }), { status: 500 })
      );
      vi.stubGlobal('fetch', mockFetch);

      const api = new SunshadeCliApi({ apiKey: mockApiKey });
      await expect(api.request('/api/v1/fail')).rejects.toThrowError(/\[HTTP 500\]/);

      vi.unstubAllGlobals();
    });
  });

  describe('Command Logic & Operations', () => {
    it('getNextTask prioritizes Critical over Normal priority and respects order_index', async () => {
      const api = new SunshadeCliApi({ apiKey: mockApiKey });
      const mockItems = [
        {
          id: 'item-low',
          external_ref_id: 'TASK-LOW',
          title: 'Low priority task',
          status: 'not_started',
          order_index: 1000,
          metadata: { priority: 'Low' },
        },
        {
          id: 'item-critical',
          external_ref_id: 'TASK-CRIT',
          title: 'Critical hotfix',
          status: 'not_started',
          order_index: 5000,
          metadata: { priority: 'Critical' },
        },
        {
          id: 'item-high',
          external_ref_id: 'TASK-HIGH',
          title: 'High priority task',
          status: 'not_started',
          order_index: 2000,
          metadata: { priority: 'High' },
        },
      ];

      vi.spyOn(api, 'request').mockResolvedValue({ items: mockItems });

      const next = await api.getNextTask('sunshade-tracker');
      expect(next).toBeDefined();
      expect(next.external_ref_id).toBe('TASK-CRIT');
    });

    it('claimTask updates status to in_progress and assigns runner identity', async () => {
      const api = new SunshadeCliApi({ apiKey: mockApiKey });
      const mockItem = {
        id: 'item-claim-1',
        external_ref_id: 'TASK-CLAIM-1',
        title: 'Task to claim',
        status: 'not_started',
      };

      vi.spyOn(api, 'resolveItem').mockResolvedValue(mockItem);
      const patchSpy = vi.spyOn(api, 'request').mockResolvedValue({
        item: { ...mockItem, status: 'in_progress', assignee: 'agent-tymz' },
      });

      const claimed = await api.claimTask('TASK-CLAIM-1', 'agent-tymz');
      expect(patchSpy).toHaveBeenCalledWith('/api/v1/items', {
        method: 'PATCH',
        body: {
          id: 'item-claim-1',
          status: 'in_progress',
          assignee: 'agent-tymz',
        },
      });
      expect(claimed.status).toBe('in_progress');
      expect(claimed.assignee).toBe('agent-tymz');
    });

    it('completeTask transitions card to complete and sets pr_url and commit_hash in metadata', async () => {
      const api = new SunshadeCliApi({ apiKey: mockApiKey });
      const mockItem = {
        id: 'item-comp-1',
        external_ref_id: 'TASK-COMP-1',
        title: 'Task to complete',
        status: 'in_progress',
        metadata: {
          sprint: 'Sprint 2026-Q4',
        },
      };

      vi.spyOn(api, 'resolveItem').mockResolvedValue(mockItem);
      const patchSpy = vi.spyOn(api, 'request').mockResolvedValue({
        item: {
          ...mockItem,
          status: 'complete',
          metadata: {
            ...mockItem.metadata,
            pr_url: 'https://github.com/org/repo/pull/10',
            commit_hash: '9a8b7c6d5e',
          },
        },
      });

      const completed = await api.completeTask('TASK-COMP-1', {
        pr: 'https://github.com/org/repo/pull/10',
        commit: '9a8b7c6d5e',
      });

      expect(patchSpy).toHaveBeenCalledWith('/api/v1/items', {
        method: 'PATCH',
        body: {
          id: 'item-comp-1',
          status: 'complete',
          metadata: {
            sprint: 'Sprint 2026-Q4',
            pr_url: 'https://github.com/org/repo/pull/10',
            pr_urls: ['https://github.com/org/repo/pull/10'],
            commit_hash: '9a8b7c6d5e',
            commit_hashes: ['9a8b7c6d5e'],
          },
        },
      });
      expect(completed.status).toBe('complete');
    });

    it('logTaskNote appends timestamped notes to card runtime_logs', async () => {
      const api = new SunshadeCliApi({ apiKey: mockApiKey });
      const mockItem = {
        id: 'item-log-1',
        external_ref_id: 'TASK-LOG-1',
        title: 'Task to log',
        metadata: {
          runtime_logs: [{ timestamp: '2026-10-19T12:00:00Z', note: 'Initial note' }],
        },
      };

      vi.spyOn(api, 'resolveItem').mockResolvedValue(mockItem);
      const patchSpy = vi.spyOn(api, 'request').mockResolvedValue({
        item: {
          ...mockItem,
          metadata: {
            runtime_logs: [
              ...mockItem.metadata.runtime_logs,
              { timestamp: '2026-10-19T13:00:00Z', note: 'Second note' },
            ],
          },
        },
      });

      await api.logTaskNote('TASK-LOG-1', 'Second note');
      expect(patchSpy).toHaveBeenCalledWith('/api/v1/items', expect.objectContaining({
        method: 'PATCH',
      }));
    });
  });

  describe('--json stdout formatting', () => {
    it('outputs clean JSON when --json flag is passed to task:next', async () => {
      const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
      const mockApi = new SunshadeCliApi({ apiKey: mockApiKey });
      const mockItem = {
        id: 'task-json-next',
        title: 'JSON Next Task',
        status: 'not_started',
      };
      vi.spyOn(mockApi, 'getNextTask').mockResolvedValue(mockItem);

      const program = buildCliProgram(mockApi);
      await program.parseAsync(['node', 'sunshade-cli', 'task:next', '--json']);

      expect(logSpy).toHaveBeenCalled();
      const loggedJson = JSON.parse(logSpy.mock.calls[0][0]);
      expect(loggedJson.id).toBe('task-json-next');
      logSpy.mockRestore();
    });
  });
});
