import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';
import { POST as deploymentWebhookHandler } from '@/app/api/v1/webhooks/deployments/route';
import { extractDeploymentInfo, itemMatchesDeployment } from '@/lib/webhooks/deployments';
import { POST as observabilityWebhookHandler } from '@/app/api/v1/webhooks/observability/route';
import { extractObservabilityAlert } from '@/lib/webhooks/observability';
import { triggerAutomationEvent, executeProjectAutomations, matchesTrigger } from '@/lib/automation-engine';
import { supabaseAdmin } from '@/lib/db';
import type { WorkItem, ProjectSettings } from '@/types/tracker';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/audit-log', () => ({
  recordBulkAuditLogs: vi.fn().mockResolvedValue(undefined),
  computeChangedFields: vi.fn().mockReturnValue({}),
}));

describe('STORY-TRK-OBSERVABILITY-AUTOMATIONS: CI/CD & Observability Webhook Ingestion Engine', () => {
  const mockTenant = {
    id: 'tenant-123',
    slug: 'pym-energy',
    name: 'Pym Energy',
    metadata: {
      deployment_webhook_secret: 'dep_secret_123',
      observability_webhook_secret: 'obs_secret_456',
    },
  };

  const mockProject = {
    id: 'proj-tracker-1',
    slug: 'sunshade-tracker',
    name: 'SunShade Tracker',
    settings: {
      schema_version: '1.0',
      sprint_settings: {
        sprints: [
          {
            id: 'sprint-q4-2026',
            name: 'Sprint 2026-Q4',
            status: 'active',
            is_current: true,
          },
        ],
      },
      automations: [],
    },
  };

  function signPayload(bodyString: string, secret: string): string {
    return createHmac('sha256', secret).update(bodyString).digest('hex');
  }

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('TASK-TRK-DEPLOY-WEBHOOK-INGEST: CI/CD Deployment Ingestion', () => {
    describe('extractDeploymentInfo', () => {
      it('extracts Vercel deployment payload accurately', () => {
        const vercelPayload = {
          type: 'deployment.succeeded',
          payload: {
            deployment: {
              id: 'dpl_abc123',
              url: 'sunshade-tracker-preview.vercel.app',
              target: 'preview',
              meta: {
                githubCommitSha: '8df610ca5ef8b6c0e86a146e2f1807d9b9d30925',
                githubCommitRef: 'feat/STORY-TRK-OBSERVABILITY-AUTOMATIONS',
                githubCommitRepo: 'sunshade-tracker',
              },
            },
          },
        };

        const extracted = extractDeploymentInfo(vercelPayload);
        expect(extracted.source).toBe('vercel');
        expect(extracted.branch).toBe('feat/STORY-TRK-OBSERVABILITY-AUTOMATIONS');
        expect(extracted.commitSha).toBe('8df610ca5ef8b6c0e86a146e2f1807d9b9d30925');
        expect(extracted.environment).toBe('preview');
        expect(extracted.deploymentUrl).toBe('https://sunshade-tracker-preview.vercel.app');
        expect(extracted.deploymentStatus).toBe('succeeded');
      });

      it('extracts GitHub deployment_status payload accurately', () => {
        const ghPayload = {
          deployment_status: {
            state: 'success',
            target_url: 'https://preview.sunshade.systems/deploy-123',
            environment: 'preview',
          },
          deployment: {
            ref: 'refs/heads/feat/STORY-TRK-OBSERVABILITY-AUTOMATIONS',
            sha: 'abcdef1234567890',
          },
          repository: {
            name: 'sunshade-tracker',
          },
        };

        const extracted = extractDeploymentInfo(ghPayload);
        expect(extracted.source).toBe('github');
        expect(extracted.branch).toBe('feat/STORY-TRK-OBSERVABILITY-AUTOMATIONS');
        expect(extracted.commitSha).toBe('abcdef1234567890');
        expect(extracted.environment).toBe('preview');
        expect(extracted.deploymentUrl).toBe('https://preview.sunshade.systems/deploy-123');
        expect(extracted.deploymentStatus).toBe('succeeded');
      });

      it('extracts Cloudflare Pages deployment payload accurately', () => {
        const cfPayload = {
          stage: 'deployment',
          status: 'success',
          deployment: {
            url: 'https://preview-pages.sunshade.systems',
            environment: 'preview',
            deployment_trigger: {
              metadata: {
                branch: 'feat/STORY-TRK-OBSERVABILITY-AUTOMATIONS',
                commit_hash: '999888777666',
              },
            },
          },
        };

        const extracted = extractDeploymentInfo(cfPayload);
        expect(extracted.source).toBe('cloudflare');
        expect(extracted.branch).toBe('feat/STORY-TRK-OBSERVABILITY-AUTOMATIONS');
        expect(extracted.commitSha).toBe('999888777666');
        expect(extracted.deploymentUrl).toBe('https://preview-pages.sunshade.systems');
      });
    });

    describe('itemMatchesDeployment', () => {
      const sampleItem: WorkItem = {
        id: 'item-story-1',
        tenant_id: 'tenant-123',
        project_id: 'proj-tracker-1',
        external_ref_id: 'STORY-TRK-OBSERVABILITY-AUTOMATIONS',
        item_type: 'story',
        status: 'in_progress',
        title: 'Autonomous CI/CD & Production Observability Webhook Ingestion Engine',
        order_index: 1000,
        metadata: {
          commit_hash: '8df610ca5ef8b6c0e86a146e2f1807d9b9d30925',
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      it('matches item by commit_hash', () => {
        expect(itemMatchesDeployment(sampleItem, '8df610ca5ef8b6c0e86a146e2f1807d9b9d30925')).toBe(true);
        expect(itemMatchesDeployment(sampleItem, '8df610ca5e')).toBe(true);
        expect(itemMatchesDeployment(sampleItem, '000000000000')).toBe(false);
      });

      it('matches item by external_ref_id in branch name', () => {
        expect(itemMatchesDeployment(sampleItem, undefined, 'feat/STORY-TRK-OBSERVABILITY-AUTOMATIONS')).toBe(true);
        expect(itemMatchesDeployment(sampleItem, undefined, 'STORY-TRK-OBSERVABILITY-AUTOMATIONS-fix')).toBe(true);
        expect(itemMatchesDeployment(sampleItem, undefined, 'feat/UNRELATED-TASK-99')).toBe(false);
      });
    });

    describe('POST /api/v1/webhooks/deployments Route Handler', () => {
      it('rejects invalid HMAC signature with 401 when tenant secret is set', async () => {
        const body = JSON.stringify({ type: 'deployment.succeeded' });
        vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
          if (table === 'tenants') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
            } as any;
          }
          return {} as any;
        });

        const req = new NextRequest('https://track.sunshade.icu/api/v1/webhooks/deployments', {
          method: 'POST',
          headers: {
            'x-tenant-slug': 'pym-energy',
            'x-hub-signature-256': 'sha256=invalid_tampered_signature',
          },
          body,
        });

        const res = await deploymentWebhookHandler(req);
        expect(res.status).toBe(401);
        const json = await res.json();
        expect(json.error).toContain('Unauthorized');
      });

      it('receives valid Vercel deployment payload and updates matched story metadata with live preview link', async () => {
        const targetStory: WorkItem = {
          id: 'story-uuid-1',
          tenant_id: 'tenant-123',
          project_id: 'proj-tracker-1',
          external_ref_id: 'STORY-TRK-OBSERVABILITY-AUTOMATIONS',
          item_type: 'story',
          status: 'in_progress',
          title: 'Autonomous CI/CD & Production Observability Webhook Ingestion Engine',
          order_index: 1000,
          metadata: {
            sprint: 'Sprint 2026-Q4',
            commit_hash: '8df610ca5ef8b6c0e86a146e2f1807d9b9d30925',
          },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };

        const vercelBody = JSON.stringify({
          type: 'deployment.succeeded',
          payload: {
            deployment: {
              id: 'dpl_123',
              url: 'sunshade-tracker-git-feat-story.vercel.app',
              target: 'preview',
              meta: {
                githubCommitSha: '8df610ca5ef8b6c0e86a146e2f1807d9b9d30925',
                githubCommitRef: 'feat/STORY-TRK-OBSERVABILITY-AUTOMATIONS',
              },
            },
          },
        });

        const signature = signPayload(vercelBody, 'dep_secret_123');

        const updateMock = vi.fn().mockReturnValue({
          eq: vi.fn().mockResolvedValue({ data: null, error: null }),
        });

        vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
          if (table === 'tenants') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
            } as any;
          }
          if (table === 'projects') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              then: (resolve: any) => resolve({ data: [mockProject], error: null }),
            } as any;
          }
          if (table === 'work_items') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              update: updateMock,
              then: (resolve: any) => resolve({ data: [targetStory], error: null }),
            } as any;
          }
          return {} as any;
        });

        const req = new NextRequest('https://track.sunshade.icu/api/v1/webhooks/deployments', {
          method: 'POST',
          headers: {
            'x-tenant-slug': 'pym-energy',
            'x-vercel-signature': signature,
          },
          body: vercelBody,
        });

        const res = await deploymentWebhookHandler(req);
        expect(res.status).toBe(200);
        const json = await res.json();

        expect(json.success).toBe(true);
        expect(json.matched_count).toBe(1);
        expect(json.updated_items[0].metadata.deployment_url).toBe(
          'https://sunshade-tracker-git-feat-story.vercel.app'
        );
        expect(json.updated_items[0].metadata.deployment_status).toBe('succeeded');
        expect(updateMock).toHaveBeenCalled();
      });
    });
  });

  describe('TASK-TRK-LOG-ANOMALY-ALERT-SINK: Observability Alert Ingestion Route', () => {
    describe('extractObservabilityAlert', () => {
      it('extracts Axiom alert payload and redacts sensitive credentials from stack and logs', () => {
        const axiomPayload = {
          source: 'axiom',
          service_name: 'tracker-api',
          name: 'Error Spike: PG connection pool exhausted',
          matches: [
            {
              message: 'Database query failed with Bearer ghp_secrettoken12345678901234567890',
              stack_trace: 'Error: Connection timeout at query (db.ts:12) with password: "superSecretPassword123"',
            },
          ],
        };

        const extracted = extractObservabilityAlert(axiomPayload);
        expect(extracted.source).toBe('axiom');
        expect(extracted.service).toBe('tracker-api');
        expect(extracted.errorSignature).toBe('Error Spike: PG connection pool exhausted');
        expect(extracted.logs).toContain('[REDACTED_GITHUB_TOKEN]');
        expect(extracted.stackTrace).toContain('password: "[REDACTED]"');
      });

      it('extracts Better Stack alert payload', () => {
        const bsPayload = {
          incident_id: 'inc-99',
          service: 'sunshade-tracker-backend',
          summary: 'HTTP 500 error rate exceeded 10%',
          logs: [
            { level: 'ERROR', message: 'Unhandled promise rejection in worker' },
          ],
        };

        const extracted = extractObservabilityAlert(bsPayload);
        expect(extracted.source).toBe('betterstack');
        expect(extracted.service).toBe('sunshade-tracker-backend');
        expect(extracted.errorSignature).toBe('HTTP 500 error rate exceeded 10%');
        expect(extracted.logs).toContain('ERROR: Unhandled promise rejection in worker');
      });

      it('extracts Sentry webhook payload', () => {
        const sentryPayload = {
          action: 'triggered',
          data: {
            issue: {
              id: 'sentry-issue-42',
              title: 'TypeError: Cannot read properties of undefined',
              culprit: 'auth-guard.ts',
            },
            event: {
              tags: [['service', 'auth-service']],
              logentry: { formatted: 'Auth failure exception' },
            },
          },
        };

        const extracted = extractObservabilityAlert(sentryPayload);
        expect(extracted.source).toBe('sentry');
        expect(extracted.service).toBe('auth-service');
        expect(extracted.errorSignature).toBe('TypeError: Cannot read properties of undefined');
      });
    });

    describe('POST /api/v1/webhooks/observability Route Handler', () => {
      it('rejects invalid signature with 401 when tenant secret is configured', async () => {
        const body = JSON.stringify({ service: 'api', error: 'boom' });
        vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
          if (table === 'tenants') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
            } as any;
          }
          return {} as any;
        });

        const req = new NextRequest('https://track.sunshade.icu/api/v1/webhooks/observability', {
          method: 'POST',
          headers: {
            'x-tenant-slug': 'pym-energy',
            'x-hub-signature-256': 'sha256=invalid',
          },
          body,
        });

        const res = await observabilityWebhookHandler(req);
        expect(res.status).toBe(401);
      });

      it('ingests Axiom alert and automatically spawns a Critical defect card linked to active sprint under triage epic', async () => {
        const axiomBody = JSON.stringify({
          source: 'axiom',
          service: 'tracker-worker',
          name: 'Redis Connection Timeout Anomaly',
          matches: [
            {
              message: 'Redis queue connection failed',
              stack_trace: 'Error: ECONNREFUSED at Redis.connect',
            },
          ],
        });

        const signature = signPayload(axiomBody, 'obs_secret_456');

        const mockTriageEpic = {
          id: 'epic-triage-uuid',
          external_ref_id: 'EPIC-TRIAGE',
          title: 'Incident Triage Epic',
        };

        let insertedCard: any = null;
        const insertMock = vi.fn().mockImplementation((payload: any) => {
          insertedCard = { id: 'defect-uuid-1', ...payload };
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: insertedCard, error: null }),
            }),
          };
        });

        vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
          if (table === 'tenants') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
            } as any;
          }
          if (table === 'projects') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
              then: (resolve: any) => resolve({ data: [mockProject], error: null }),
            } as any;
          }
          if (table === 'sprints') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              then: (resolve: any) =>
                resolve({
                  data: [
                    {
                      id: 'a1111111-2222-3333-4444-555555555555',
                      name: 'Sprint 2026-Q4',
                      is_active: true,
                    },
                  ],
                  error: null,
                }),
            } as any;
          }
          if (table === 'work_items') {
            return {
              select: vi.fn().mockReturnThis(),
              eq: vi.fn().mockReturnThis(),
              is: vi.fn().mockReturnThis(),
              maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
              insert: insertMock,
              then: (resolve: any) => resolve({ data: [mockTriageEpic], error: null }),
            } as any;
          }
          return {} as any;
        });

        const req = new NextRequest('https://track.sunshade.icu/api/v1/webhooks/observability', {
          method: 'POST',
          headers: {
            'x-tenant-slug': 'pym-energy',
            'x-axiom-signature': signature,
          },
          body: axiomBody,
        });

        const res = await observabilityWebhookHandler(req);
        expect(res.status).toBe(200);
        const json = await res.json();

        expect(json.success).toBe(true);
        expect(json.event).toBe('observability_alert');
        expect(json.action).toBe('created');
        expect(insertMock).toHaveBeenCalled();
        expect(insertedCard.item_type).toBe('bug');
        expect(insertedCard.parent_id).toBe('epic-triage-uuid');
        expect(insertedCard.sprint_id).toBe('a1111111-2222-3333-4444-555555555555');
        expect(insertedCard.metadata.sprint_id).toBe('a1111111-2222-3333-4444-555555555555');
        expect(insertedCard.metadata.priority).toBe('Critical');
        expect(insertedCard.metadata.observability_source).toBe('axiom');
        expect(insertedCard.description).toContain('Redis queue connection failed');
      });
    });
  });

  describe('Declarative Automation Engine Integration', () => {
    it('executes custom project automation rule with patch_metadata on deployment_completed event', async () => {
      const customRuleSettings: ProjectSettings = {
        schema_version: '1.0',
        hierarchy: [],
        statuses: [],
        custom_fields: [],
        automations: [
          {
            id: 'rule-deploy-custom',
            name: 'Custom Deploy Tagging',
            enabled: true,
            trigger: {
              event: 'deployment_completed',
              'metadata.environment': 'production',
            },
            actions: [
              {
                type: 'patch_metadata',
                metadata: {
                  production_deployed: 'true',
                  release_preview_url: '{{deployment_url}}',
                },
              },
            ],
          },
        ],
      };

      const matchedItem: WorkItem = {
        id: 'item-prod-1',
        tenant_id: 'tenant-123',
        project_id: 'proj-1',
        external_ref_id: 'STORY-PROD',
        item_type: 'story',
        status: 'in_progress',
        title: 'Production Deploy Feature',
        order_index: 1000,
        metadata: {
          environment: 'production',
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const updateMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({ data: null, error: null }),
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        update: updateMock,
      } as any);

      const result = await triggerAutomationEvent({
        tenantId: 'tenant-123',
        projectId: 'proj-1',
        settings: customRuleSettings,
        event: 'deployment_completed',
        payload: {
          deployment_url: 'https://prod.sunshade.systems',
          environment: 'production',
        },
        matchedItems: [matchedItem],
      });

      expect(result.executedRules).toContain('rule-deploy-custom');
      expect(matchedItem.metadata.production_deployed).toBe('true');
      expect(matchedItem.metadata.release_preview_url).toBe('https://prod.sunshade.systems');
      expect(updateMock).toHaveBeenCalled();
    });

    it('executes custom project automation rule with create_item on observability_alert event', async () => {
      const customRuleSettings: ProjectSettings = {
        schema_version: '1.0',
        hierarchy: [],
        statuses: [],
        custom_fields: [],
        automations: [
          {
            id: 'rule-alert-custom',
            name: 'Create High Priority Bug for Service Degradation',
            enabled: true,
            trigger: {
              event: 'observability_alert',
              service: 'payment-gateway',
            },
            actions: [
              {
                type: 'create_item',
                item_type: 'bug',
                priority: 'Critical',
                title: 'Payment Alert: {{title}}',
                metadata: {
                  custom_alert_flag: 'true',
                },
              },
            ],
          },
        ],
      };

      let insertedPayload: any = null;
      vi.mocked(supabaseAdmin.from).mockReturnValue({
        insert: vi.fn().mockImplementation((payload) => {
          insertedPayload = payload;
          return {
            select: vi.fn().mockReturnValue({
              single: vi.fn().mockResolvedValue({ data: payload, error: null }),
            }),
          };
        }),
      } as any);

      const result = await triggerAutomationEvent({
        tenantId: 'tenant-123',
        projectId: 'proj-1',
        settings: customRuleSettings,
        event: 'observability_alert',
        payload: {
          service: 'payment-gateway',
          title: 'Stripe Gateway Latency High',
          description: 'Payment requests taking > 10s',
        },
      });

      expect(result.executedRules).toContain('rule-alert-custom');
      expect(result.createdItems).toHaveLength(1);
      expect(insertedPayload.title).toBe('Payment Alert: Stripe Gateway Latency High');
      expect(insertedPayload.metadata.custom_alert_flag).toBe('true');
    });
  });
});
