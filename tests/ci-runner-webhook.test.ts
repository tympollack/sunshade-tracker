import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';
import { POST } from '@/app/api/v1/webhooks/ci-runner/route';
import { supabaseAdmin } from '@/lib/db';
import { executeProjectAutomations } from '@/lib/automation-engine';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('TASK-TRK-CI-WEBHOOK-RECEIVER: CI Runner Failure Webhook Endpoint', () => {
  const secretKey = 'test-ci-webhook-secret-token-12345';
  const mockTenant = {
    id: '00000000-0000-0000-0000-000000000001',
    slug: 'pym-energy',
    name: 'Pym Energy',
    tier: 'enterprise',
    metadata: {
      ci_webhook_secret: secretKey,
    },
  };

  const mockProject = {
    id: 'proj-uuid-1',
    slug: 'sunshade-tracker',
    name: 'SunShade Tracker',
    tenant_id: mockTenant.id,
    settings: {
      schema_version: '1.0',
      hierarchy: [
        { type: 'epic', label: 'Epic', level: 1, allowed_parents: [] },
        { type: 'task', label: 'Task', level: 2, allowed_parents: ['epic'] },
        { type: 'bug', label: 'Bug', level: 2, allowed_parents: ['epic'] },
      ],
      statuses: [
        { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
        { id: 'in_progress', label: 'In Progress', color: '#38bdf8', order: 2 },
        { id: 'complete', label: 'Complete', color: '#10b981', order: 3 },
      ],
      custom_fields: [],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.WEBHOOK_SIGNING_SECRET = secretKey;
  });

  describe('Authorization Enforcement', () => {
    it('returns 401 when neither Bearer token nor HMAC signature is provided', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/webhooks/ci-runner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          project_slug: 'sunshade-tracker',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('returns 401 when an invalid Bearer token is provided', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/webhooks/ci-runner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer invalid-secret-token',
        },
        body: JSON.stringify({
          project_slug: 'sunshade-tracker',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('returns 401 when an invalid HMAC signature is provided', async () => {
      const rawPayload = JSON.stringify({ project_slug: 'sunshade-tracker' });
      const req = new NextRequest('http://localhost:3000/api/v1/webhooks/ci-runner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': 'sha256=invalid-signature-hash-value',
        },
        body: rawPayload,
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('rejects global secret when workspace has a dedicated secret configured', async () => {
      process.env.WEBHOOK_SIGNING_SECRET = 'global-platform-secret-xyz';
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/webhooks/ci-runner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer global-platform-secret-xyz',
        },
        body: JSON.stringify({ project_slug: 'sunshade-tracker' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });

    it('rejects global secret when caller requests an arbitrary workspace via x-tenant-slug without dedicated secret', async () => {
      process.env.WEBHOOK_SIGNING_SECRET = 'global-platform-secret-xyz';
      const externalTenant = {
        id: 'external-tenant-uuid',
        slug: 'external-workspace',
        name: 'External Workspace',
        metadata: {},
      };
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: externalTenant, error: null }),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/webhooks/ci-runner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-tenant-slug': 'external-workspace',
          Authorization: 'Bearer global-platform-secret-xyz',
        },
        body: JSON.stringify({ project_slug: 'some-project' }),
      });

      const res = await POST(req);
      expect(res.status).toBe(401);
    });
  });

  describe('Project Resolution & Payload Validation', () => {
    it('returns 400 when project_slug is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/webhooks/ci-runner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secretKey}`,
        },
        body: JSON.stringify({
          branch: 'main',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('project_slug');
    });

    it('returns 404 when target project is not found', async () => {
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
                })),
                maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
              })),
            })),
          } as any;
        }
        if (table === 'projects') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn().mockResolvedValue({ data: [], error: null }),
                })),
                is: vi.fn().mockResolvedValue({ data: [], error: null }),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const req = new NextRequest('http://localhost:3000/api/v1/webhooks/ci-runner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secretKey}`,
        },
        body: JSON.stringify({
          project_slug: 'nonexistent-project',
        }),
      });

      const res = await POST(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain('not found');
    });
  });

  describe('Non-Blocking Event Emission & Critical Bug Provisioning', () => {
    it('authenticates via Bearer token and responds with { success: true, queued: true } in under 100ms', async () => {
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
                })),
                maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
              })),
            })),
          } as any;
        }
        if (table === 'projects') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn().mockResolvedValue({ data: [mockProject], error: null }),
                })),
                is: vi.fn().mockResolvedValue({ data: [mockProject], error: null }),
              })),
            })),
          } as any;
        }
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                })),
              })),
            })),
            insert: vi.fn(() => ({
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: 'created-bug-1', title: 'CI Failure: vitest on main' },
                  error: null,
                }),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const start = Date.now();
      const payload = {
        project_slug: 'sunshade-tracker',
        branch: 'feat/payment-gateway',
        commit_sha: 'c0ffee1234567890abcdef',
        failed_step: 'vitest test-suite',
        error_log: 'AssertionError: expected status 200 to be 402 Payment Required\n  at Payment.test.ts:45:10',
        actor: 'dev-bot',
        run_id: 'gh-run-987654',
      };

      const req = new NextRequest('http://localhost:3000/api/v1/webhooks/ci-runner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${secretKey}`,
        },
        body: JSON.stringify(payload),
      });

      const res = await POST(req);
      const elapsed = Date.now() - start;

      expect(elapsed).toBeLessThan(100); // Must be fast non-blocking
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ success: true, queued: true });
    });

    it('authenticates via X-Hub-Signature-256 HMAC signature', async () => {
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
                })),
                maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
              })),
            })),
          } as any;
        }
        if (table === 'projects') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn().mockResolvedValue({ data: [mockProject], error: null }),
                })),
                is: vi.fn().mockResolvedValue({ data: [mockProject], error: null }),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const payload = {
        project_slug: 'sunshade-tracker',
        branch: 'main',
        commit_sha: 'deadbeef123456',
        failed_step: 'typecheck',
        error_log: 'error TS2322: Type mismatch in route.ts line 22',
        actor: 'github-actions',
        run_id: '123456',
      };
      const rawPayload = JSON.stringify(payload);
      const hmac = createHmac('sha256', secretKey).update(rawPayload).digest('hex');

      const req = new NextRequest('http://localhost:3000/api/v1/webhooks/ci-runner', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Hub-Signature-256': `sha256=${hmac}`,
        },
        body: rawPayload,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json).toEqual({ success: true, queued: true });
    });

    it('executes automation and auto-provisions Critical bug with failing trace in agent_prompt', async () => {
      let insertedBug: any = null;
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
                })),
              })),
            })),
            insert: vi.fn((record: any) => {
              insertedBug = record;
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({
                    data: { id: 'created-bug-1', ...record },
                    error: null,
                  }),
                })),
              };
            }),
          } as any;
        }
        return {} as any;
      });

      const failingTrace = 'AssertionError: expected 500 to be 200\n    at PaymentGateway.test.ts:88:12';
      const eventPayload = {
        project_slug: 'sunshade-tracker',
        branch: 'staging',
        commit_sha: 'fedcba987654321',
        failed_step: 'integration-tests',
        error_log: failingTrace,
        actor: 'ci-bot',
        run_id: 'run-555',
      };

      const result = await executeProjectAutomations({
        tenantId: mockTenant.id,
        projectId: mockProject.id,
        settings: mockProject.settings,
        eventType: 'webhook_received',
        event: 'webhook_received',
        source: 'ci_runner',
        event_type: 'build_failed',
        eventPayload,
        payload: eventPayload,
      });

      expect(result).toBeDefined();
      expect(result?.createdItems).toHaveLength(1);

      const created = result?.createdItems[0];
      expect(created?.metadata?.priority).toBe('Critical');
      expect(created?.metadata?.source).toBe('ci_runner');
      expect(created?.metadata?.failed_step).toBe('integration-tests');
      expect(created?.metadata?.agent_prompt).toContain(failingTrace);
      expect(created?.metadata?.agent_prompt).toContain('SYSTEM ROLE & OBJECTIVE');
    });
  });
});
