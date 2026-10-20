import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  executeSwarmDecomposition,
  parsePrdHeuristic,
  normalizeLlmOutput,
  buildDecompositionPrompt,
  toIngestPayloads,
} from '@/lib/orchestrator/swarmEngine';

describe('TASK-TRK-SWARM-ORCHESTRATION: Autonomous Swarm Decomposition & Delegation Engine', () => {
  const samplePrd = `# Epic: Real-Time Fleet Telemetry Platform
High-throughput telemetry ingestion and visualization pipeline for electric vehicle batteries.

## Story: Telemetry Stream Ingestion Pipeline
Deploy WebSocket gateway and TimescaleDB ingestion workers for telemetry metrics.
- [ ] Connect up to 10k concurrent telemetry streams
- [ ] Guarantee at-least-once persistence

### Task: Implement Ingestion Buffer & Rate Limiting
Build in-memory ring buffers and sliding-window rate limiters.
- [ ] Reject traffic exceeding 100 msg/sec per vehicle
- [ ] Flush to database in batches of 500

#### Subtask: Unit Test Sliding Window Rate Limiter
Verify burst capacity and leaky bucket eviction under high concurrency.
- [ ] 100% test coverage on sliding window limiter

### Task: Database Schema Migration & Indexing
Create hypertable migrations and composite timestamps indexes for fast window queries.
- [ ] Add composite index on (vehicle_id, timestamp DESC)

#### Subtask: Run DB Migration in Staging
Apply schema migration script and verify TimescaleDB hypertable chunking.
- [ ] Zero migration downtime on active connections
`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Prompt Construction & Heuristic Parsing', () => {
    it('constructs LLM prompt specifying 3-tier hierarchy (Story, Task, Subtask)', () => {
      const prompt = buildDecompositionPrompt(samplePrd, 'FLEET');
      expect(prompt).toContain('Target Feature Prefix: "FLEET"');
      expect(prompt).toContain('Level 2: Stories');
      expect(prompt).toContain('Level 3: Tasks');
      expect(prompt).toContain('Level 4: Subtasks');
    });

    it('parses markdown PRD into linked 3-tier hierarchy without broken parent links', () => {
      const items = parsePrdHeuristic(samplePrd, 'FLEET');

      expect(items.length).toBeGreaterThanOrEqual(5);

      const stories = items.filter((i) => i.level === 2);
      const tasks = items.filter((i) => i.level === 3);
      const subtasks = items.filter((i) => i.level === 4);

      expect(stories.length).toBeGreaterThan(0);
      expect(tasks.length).toBeGreaterThan(0);
      expect(subtasks.length).toBeGreaterThan(0);

      // Verify Stories have no parent
      for (const story of stories) {
        expect(story.parent_ref_id).toBeNull();
        expect(story.external_ref_id).toMatch(/^STORY-FLEET-\d+$/);
      }

      // Verify Tasks reference valid Story
      const storyRefIds = new Set(stories.map((s) => s.external_ref_id));
      for (const task of tasks) {
        expect(task.parent_ref_id).not.toBeNull();
        expect(storyRefIds.has(task.parent_ref_id!)).toBe(true);
        expect(task.external_ref_id).toMatch(/^TASK-FLEET-\d+-\d+$/);
      }

      // Verify Subtasks reference valid Task
      const taskRefIds = new Set(tasks.map((t) => t.external_ref_id));
      for (const subtask of subtasks) {
        expect(subtask.parent_ref_id).not.toBeNull();
        expect(taskRefIds.has(subtask.parent_ref_id!)).toBe(true);
        expect(subtask.external_ref_id).toMatch(/^SUBTASK-FLEET-\d+-\d+-\d+$/);
      }
    });

    it('auto-generates nested metadata.agent_prompt for every child item', () => {
      const items = parsePrdHeuristic(samplePrd, 'FLEET');

      for (const item of items) {
        expect(item.metadata.agent_prompt).toBeDefined();
        expect(item.metadata.agent_prompt.length).toBeGreaterThan(20);
        expect(item.metadata.agent_prompt).toContain('### SYSTEM ROLE & OBJECTIVE');
        expect(item.metadata.agent_prompt).toContain('### CONTEXT & SCOPE');
      }
    });
  });

  describe('LLM Reasoning Output Normalization', () => {
    it('normalizes raw LLM JSON output into deterministic external_ref_ids and linked parent refs', () => {
      const mockLlmOutput = [
        {
          level: 2,
          story_index: 1,
          title: 'Authentication Microservice',
          description: 'OAuth2 and PKCE flow',
          acceptance_criteria: ['Passes PKCE verification'],
        },
        {
          level: 3,
          story_index: 1,
          task_index: 1,
          title: 'Implement PKCE Token Exchange',
          description: 'Validate code_verifier against code_challenge',
          acceptance_criteria: ['SHA-256 hash match'],
        },
        {
          level: 4,
          story_index: 1,
          task_index: 1,
          subtask_index: 1,
          title: 'Add SHA-256 Crypto Unit Test',
          description: 'Edge case validation',
          acceptance_criteria: ['100% branch coverage'],
        },
      ];

      const items = normalizeLlmOutput(mockLlmOutput, 'AUTH');

      expect(items).toHaveLength(3);
      expect(items[0].external_ref_id).toBe('STORY-AUTH-1');
      expect(items[0].parent_ref_id).toBeNull();

      expect(items[1].external_ref_id).toBe('TASK-AUTH-1-1');
      expect(items[1].parent_ref_id).toBe('STORY-AUTH-1');

      expect(items[2].external_ref_id).toBe('SUBTASK-AUTH-1-1-1');
      expect(items[2].parent_ref_id).toBe('TASK-AUTH-1-1');
    });

    it('correctly maps parent references when LLM outputs stories out of order', () => {
      const outOfOrderOutput = [
        {
          level: 2,
          story_index: 2,
          title: 'Secondary Story',
          description: 'Story 2 comes first in output',
          acceptance_criteria: ['Done'],
        },
        {
          level: 3,
          story_index: 2,
          task_index: 1,
          title: 'Task under Secondary Story',
          description: 'Belongs to Story 2',
          acceptance_criteria: ['Done'],
        },
        {
          level: 2,
          story_index: 1,
          title: 'Primary Story',
          description: 'Story 1 comes later in output',
          acceptance_criteria: ['Done'],
        },
        {
          level: 3,
          story_index: 1,
          task_index: 1,
          title: 'Task under Primary Story',
          description: 'Belongs to Story 1',
          acceptance_criteria: ['Done'],
        },
      ];

      const items = normalizeLlmOutput(outOfOrderOutput, 'SWARM');

      const story2 = items.find((i) => i.title === 'Secondary Story');
      const task2 = items.find((i) => i.title === 'Task under Secondary Story');
      const story1 = items.find((i) => i.title === 'Primary Story');
      const task1 = items.find((i) => i.title === 'Task under Primary Story');

      expect(story2?.external_ref_id).toBe('STORY-SWARM-2');
      expect(story2?.parent_ref_id).toBeNull();
      expect(task2?.parent_ref_id).toBe('STORY-SWARM-2');

      expect(story1?.external_ref_id).toBe('STORY-SWARM-1');
      expect(story1?.parent_ref_id).toBeNull();
      expect(task1?.parent_ref_id).toBe('STORY-SWARM-1');
    });

    it('maps items to project taxonomy hierarchy and initial status from settings', () => {
      const mockItems = [
        {
          level: 2 as const,
          item_type: 'story' as const,
          title: 'Feature Deliverable',
          description: 'Feature level',
          external_ref_id: 'STORY-TEST-1',
          parent_ref_id: null,
          metadata: { agent_prompt: '', acceptance_criteria: [] },
        },
        {
          level: 3 as const,
          item_type: 'task' as const,
          title: 'Action Step',
          description: 'Action level',
          external_ref_id: 'TASK-TEST-1-1',
          parent_ref_id: 'STORY-TEST-1',
          metadata: { agent_prompt: '', acceptance_criteria: [] },
        },
      ];

      const customSettings = {
        hierarchy: [
          { level: 1, type: 'epic' },
          { level: 2, type: 'feature' },
          { level: 3, type: 'action' },
        ],
        statuses: [
          { id: 'backlog', order: 0 },
          { id: 'in_progress', order: 1 },
          { id: 'done', order: 2 },
        ],
      };

      const payloads = toIngestPayloads(mockItems, customSettings);

      expect(payloads[0].item_type).toBe('feature');
      expect(payloads[0].status).toBe('backlog');

      expect(payloads[1].item_type).toBe('action');
      expect(payloads[1].status).toBe('backlog');
    });
  });

  describe('Ingestion Integration & 100% Parent Resolution Verification', () => {
    it('simulates batch ingestion and confirms 100% resolution of parent_ref_id to database parent_id', async () => {
      const items = parsePrdHeuristic(samplePrd, 'FLEET');
      const payloads = toIngestPayloads(items);

      // Simulate the SunShade Tracker batch ingestion database resolution algorithm
      // (as implemented in src/app/api/v1/items/ingest/route.ts)
      const batchRefMap = new Map<string, string>();
      const persistedItems: Array<{ id: string; external_ref_id: string; parent_id: string | null; title: string }> = [];

      let mockUuidCounter = 1;
      for (const p of payloads) {
        const generatedDbId = `00000000-0000-0000-0000-${String(mockUuidCounter++).padStart(12, '0')}`;
        batchRefMap.set(p.external_ref_id!, generatedDbId);

        let resolvedParentId: string | null = null;
        if (p.parent_ref_id) {
          if (batchRefMap.has(p.parent_ref_id)) {
            resolvedParentId = batchRefMap.get(p.parent_ref_id)!;
          }
        }

        persistedItems.push({
          id: generatedDbId,
          external_ref_id: p.external_ref_id!,
          parent_id: resolvedParentId,
          title: p.title,
        });
      }

      // Verify 100% resolution of parent_ref_id to database parent_id
      const idToItemMap = new Map(persistedItems.map((it) => [it.id, it]));
      const refToItemMap = new Map(persistedItems.map((it) => [it.external_ref_id, it]));

      for (const p of payloads) {
        const persisted = refToItemMap.get(p.external_ref_id!)!;
        expect(persisted).toBeDefined();

        if (p.parent_ref_id) {
          // Parent reference must be resolved to a non-null database UUID
          expect(persisted.parent_id).not.toBeNull();
          const parentItem = idToItemMap.get(persisted.parent_id!);
          expect(parentItem).toBeDefined();
          expect(parentItem!.external_ref_id).toBe(p.parent_ref_id);
        } else {
          // Root stories must have null parent_id
          expect(persisted.parent_id).toBeNull();
        }
      }

      const linkedChildren = payloads.filter((p) => p.parent_ref_id);
      expect(linkedChildren.length).toBeGreaterThan(0);
      const successfullyResolved = linkedChildren.filter((p) => {
        const item = refToItemMap.get(p.external_ref_id!)!;
        return item.parent_id !== null;
      });

      // 100% resolution confirmation
      expect(successfullyResolved.length).toBe(linkedChildren.length);
    });

    it('executeSwarmDecomposition calls LLM provider and dispatches payload to ingest endpoint', async () => {
      const mockLlmResponse = JSON.stringify([
        {
          level: 2,
          story_index: 1,
          title: 'Macro Feature Story',
          description: 'Macro story',
          acceptance_criteria: ['Story criteria'],
        },
        {
          level: 3,
          story_index: 1,
          task_index: 1,
          title: 'Engineering Task',
          description: 'Task description',
          acceptance_criteria: ['Task criteria'],
        },
      ]);

      const mockLlmProvider = vi.fn().mockResolvedValue(mockLlmResponse);

      const mockFetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/settings')) {
          return new Response(JSON.stringify({ settings: { hierarchy: [], statuses: [] } }), { status: 200 });
        }
        return new Response(
          JSON.stringify({
            success: true,
            count: 2,
            items: [
              { id: 'uuid-1', external_ref_id: 'STORY-SWARM-1', parent_id: null },
              { id: 'uuid-2', external_ref_id: 'TASK-SWARM-1-1', parent_id: 'uuid-1' },
            ],
          }),
          { status: 200 }
        );
      });
      vi.stubGlobal('fetch', mockFetch);

      const result = await executeSwarmDecomposition({
        featurePrefix: 'SWARM',
        projectSlug: 'sunshade-tracker',
        prdDocument: 'Custom technical spec',
        llmProvider: mockLlmProvider,
        apiKey: 'tk_live_mock_token',
        baseUrl: 'https://track.sunshade.icu',
      });

      expect(mockLlmProvider).toHaveBeenCalled();
      expect(mockFetch).toHaveBeenCalledWith(
        'https://track.sunshade.icu/api/v1/items/ingest',
        expect.objectContaining({
          method: 'POST',
        })
      );
      expect(result.items).toHaveLength(2);
      expect(result.dispatchResult?.success).toBe(true);

      vi.unstubAllGlobals();
    });
  });
});
