import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  constructCiFailurePayload,
  formatCiBugRefId,
  reportCiFailure,
  synthesizeCiAgentPrompt,
} from '@/lib/ci/failureReporter';

describe('TASK-TRK-SELF-HEALING-CI: Self-Healing CI/CD Pipeline & Ingest Bridge', () => {
  const mockSha = 'a1b2c3d4e5f67890abcdef1234567890abcdef12';
  const mockJob = 'vitest-runner';
  const mockToken = 'tk_live_ci_reporter_secret_token';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Deterministic Reference ID & Idempotency', () => {
    it('generates deterministic ref ID format BUG-CI-<sha8>-<job>', () => {
      const refId = formatCiBugRefId(mockSha, mockJob);
      expect(refId).toBe('BUG-CI-a1b2c3d4-vitest-runner');
    });

    it('guarantees identical ref ID across multiple test runs on the same commit (idempotent upsert)', () => {
      const refId1 = formatCiBugRefId(mockSha, mockJob);
      const refId2 = formatCiBugRefId(mockSha, mockJob);
      expect(refId1).toBe(refId2);
    });
  });

  describe('Agent Prompt Synthesis & Payload Adherence', () => {
    it('synthesizes actionable agent instructions directing agent to inspect failing file and commit', () => {
      const prompt = synthesizeCiAgentPrompt({
        commitSha: mockSha,
        jobName: mockJob,
        failingFilePath: 'src/lib/auth-guard.ts',
        errorMessage: 'TypeError: undefined is not a function at line 42',
        prNumber: 99,
      });

      expect(prompt).toContain('SYSTEM ROLE & OBJECTIVE');
      expect(prompt).toContain('Commit SHA: `a1b2c3d4e5f67890abcdef1234567890abcdef12`');
      expect(prompt).toContain('Target File: `src/lib/auth-guard.ts`');
      expect(prompt).toContain('Pull Request: #99');
      expect(prompt).toContain('npx tsc --noEmit');
      expect(prompt).toContain('npm test');
    });

    it('constructs payload matching tracker schema with status not_started and trimmed stack trace', () => {
      const payload = constructCiFailurePayload({
        commitSha: mockSha,
        jobName: mockJob,
        errorMessage: 'AssertionError: expected false to be true',
        stackTrace: 'Error: test failure\n  at Object.<anonymous> (test.ts:10:5)\n  at processTicks (timers.js:100:10)',
        failingFilePath: 'tests/unit.test.ts',
        projectSlug: 'sunshade-tracker',
      });

      expect(payload.project_slug).toBe('sunshade-tracker');
      expect(payload.items).toHaveLength(1);

      const item = payload.items[0];
      expect(item.external_ref_id).toBe('BUG-CI-a1b2c3d4-vitest-runner');
      expect(item.item_type).toBe('bug');
      expect(item.status).toBe('not_started');
      expect(item.title).toContain('CI Failure');
      expect(item.description).toContain('```');
      expect(item.description).toContain('AssertionError');
      expect(item.metadata.commit_hash).toBe(mockSha);
      expect(item.metadata.ci_job).toBe(mockJob);
      expect(item.metadata.priority).toBe('Critical');
      expect(item.metadata.agent_prompt).toBeDefined();
    });

    it('redacts tokens, keys, and credentials from stack traces', () => {
      const sensitiveStack = 'Error: connection failed with Bearer eyJhbGciOiJIUzI1Ni.secret and token=tk_live_1234567890abcdef and ghp_abcdefghijklmnopqrstuvwxyz123456';
      const payload = constructCiFailurePayload({
        commitSha: mockSha,
        jobName: mockJob,
        errorMessage: 'Connection failed',
        stackTrace: sensitiveStack,
        trackerToken: mockToken,
      });

      const desc = payload.items[0].description;
      expect(desc).not.toContain('tk_live_1234567890abcdef');
      expect(desc).not.toContain('ghp_abcdefghijklmnopqrstuvwxyz123456');
      expect(desc).toContain('[REDACTED_TRACKER_KEY]');
      expect(desc).toContain('[REDACTED_GITHUB_TOKEN]');
    });

    it('redacts tokens and credentials from errorMessage in title and agent prompt', () => {
      const sensitiveError = 'Failed when connecting with token=tk_live_9988776655443322 and ghp_11223344556677889900aabbccddeeff';
      const payload = constructCiFailurePayload({
        commitSha: mockSha,
        jobName: mockJob,
        errorMessage: sensitiveError,
      });

      const item = payload.items[0];
      expect(item.title).not.toContain('tk_live_9988776655443322');
      expect(item.title).not.toContain('ghp_11223344556677889900aabbccddeeff');
      expect(item.title).toContain('[REDACTED_TRACKER_KEY]');

      expect(item.description).not.toContain('tk_live_9988776655443322');
      expect(item.description).toContain('[REDACTED_TRACKER_KEY]');

      expect(item.metadata.agent_prompt).not.toContain('tk_live_9988776655443322');
      expect(item.metadata.agent_prompt).toContain('[REDACTED_TRACKER_KEY]');
    });
  });

  describe('Ingest Dispatch & Performance SLA (< 10 seconds)', () => {
    it('dispatches failure report within SLA (< 10s) with valid bearer token', async () => {
      const startTime = Date.now();

      const mockResponse = {
        success: true,
        count: 1,
        items: [
          {
            id: 'uuid-bug-card-1',
            external_ref_id: 'BUG-CI-a1b2c3d4-vitest-runner',
            status: 'not_started',
            title: 'CI Failure in vitest-runner',
          },
        ],
      };

      const mockFetch = vi.fn().mockResolvedValue(
        new Response(JSON.stringify(mockResponse), { status: 200 })
      );
      vi.stubGlobal('fetch', mockFetch);

      const result = await reportCiFailure({
        commitSha: mockSha,
        jobName: mockJob,
        trackerToken: mockToken,
        errorMessage: 'Vitest assertion failed',
        failingFilePath: 'src/components/Card.tsx',
      });

      const elapsedMs = Date.now() - startTime;
      expect(elapsedMs).toBeLessThan(10000); // 10 second SLA

      expect(mockFetch).toHaveBeenCalledWith(
        'https://track.sunshade.icu/api/v1/items/ingest',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: `Bearer ${mockToken}`,
            'Content-Type': 'application/json',
          }),
        })
      );

      expect(result.success).toBe(true);
      expect(result.items[0].external_ref_id).toBe('BUG-CI-a1b2c3d4-vitest-runner');

      vi.unstubAllGlobals();
    });

    it('rejects with descriptive error when token is omitted', async () => {
      await expect(
        reportCiFailure({
          commitSha: mockSha,
          jobName: mockJob,
          trackerToken: '',
        })
      ).rejects.toThrowError(/SUNSHADE_TRACKER_TOKEN is required/);
    });
  });
});
