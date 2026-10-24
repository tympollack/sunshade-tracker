import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  matchesTrigger,
  interpolate,
  buildTemplateRecords,
  expandTemplate,
  dispatchWebhook,
  executeProjectAutomations,
  isAllowedChildType,
  resolveDefaultChildType,
} from '@/lib/automation-engine';
import { supabaseAdmin } from '@/lib/db';
import { verifyHmacSignature } from '@/lib/webhooks/verify-hmac';
import type { AutomationTrigger, ProjectSettings, ProjectTemplateItem, WorkItem } from '@/types/tracker';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/audit-log', () => ({
  recordBulkAuditLogs: vi.fn().mockResolvedValue(undefined),
  computeChangedFields: vi.fn().mockReturnValue({}),
}));

describe('Automation Engine & Dynamic Template Expander (TASK-TRK-RULE-EXECUTOR)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('matchesTrigger', () => {
    const sampleItem: WorkItem = {
      id: 'item-100',
      tenant_id: 'tenant-1',
      project_id: 'proj-1',
      external_ref_id: 'STORY-100',
      item_type: 'story',
      status: 'not_started',
      title: 'Setup Domain Ingestion',
      order_index: 1000,
      metadata: {
        company_domain: 'acme.corp',
        priority: 'High',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    it('matches when event and top-level fields match', () => {
      const trigger: AutomationTrigger = {
        event: 'item_created',
        item_type: 'story',
        status: 'not_started',
      };
      expect(matchesTrigger(trigger, sampleItem)).toBe(true);
    });

    it('matches nested metadata paths using dot notation', () => {
      const trigger: AutomationTrigger = {
        event: 'item_created',
        item_type: 'story',
        'metadata.company_domain': 'acme.corp',
      };
      expect(matchesTrigger(trigger, sampleItem)).toBe(true);
    });

    it('matches nested metadata object', () => {
      const trigger: AutomationTrigger = {
        item_type: 'story',
        metadata: {
          company_domain: 'acme.corp',
          priority: 'High',
        },
      };
      expect(matchesTrigger(trigger, sampleItem)).toBe(true);
    });

    it('returns false when a predicate does not match', () => {
      const trigger: AutomationTrigger = {
        item_type: 'task', // mismatch
      };
      expect(matchesTrigger(trigger, sampleItem)).toBe(false);

      const metaMismatch: AutomationTrigger = {
        'metadata.company_domain': 'other.corp', // mismatch
      };
      expect(matchesTrigger(metaMismatch, sampleItem)).toBe(false);
    });

    it('returns false for null or undefined triggers or items', () => {
      expect(matchesTrigger(null, sampleItem)).toBe(false);
      expect(matchesTrigger({ item_type: 'story' }, null)).toBe(false);
    });
  });

  describe('interpolate', () => {
    const contextItem = {
      title: 'Acme Onboarding Story',
      external_ref_id: 'STORY-200',
      metadata: {
        company_domain: 'acme.corp',
        env: 'production',
      },
    };

    it('interpolates top-level fields and nested metadata placeholders', () => {
      const template = 'Provision {{metadata.company_domain}} DNS for {{title}} [Ref: {{external_ref_id}}]';
      const result = interpolate(template, contextItem);
      expect(result).toBe('Provision acme.corp DNS for Acme Onboarding Story [Ref: STORY-200]');
    });

    it('handles whitespace inside mustache brackets', () => {
      const template = 'Domain: {{   metadata.company_domain   }}';
      expect(interpolate(template, contextItem)).toBe('Domain: acme.corp');
    });

    it('replaces missing placeholders with empty strings', () => {
      const template = 'Domain: {{metadata.missing_field}} and {{non_existent}}';
      expect(interpolate(template, contextItem)).toBe('Domain:  and ');
    });
  });

  describe('expandTemplate & buildTemplateRecords', () => {
    const parentItem: WorkItem = {
      id: 'parent-uuid-999',
      tenant_id: 'tenant-123',
      project_id: 'proj-456',
      sprint_id: 'sprint-q4',
      external_ref_id: 'STORY-ONBOARD',
      item_type: 'story',
      status: 'not_started',
      title: 'Onboard Customer Acme',
      order_index: 2000,
      metadata: {
        company_domain: 'acme.io',
        sprint: 'Sprint 2026-Q4',
      },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const template: ProjectTemplateItem[] = [
      {
        title: 'Provision domain {{metadata.company_domain}}',
        external_ref_id: '-TASK-DNS',
        item_type: 'task',
        status: 'not_started',
        metadata: {
          target_domain: '{{metadata.company_domain}}',
        },
      },
      {
        title: 'Deploy sandbox for {{metadata.company_domain}}',
        item_type: 'task',
      },
    ];

    it('builds template records correctly linked to parent_id with hydrated variables and inherited sprint', () => {
      const records = buildTemplateRecords({
        tenantId: parentItem.tenant_id,
        projectId: parentItem.project_id,
        template,
        parentItem,
      });

      expect(records).toHaveLength(2);

      // Child 1: custom ref suffix & inherited sprint
      expect(records[0].parent_id).toBe('parent-uuid-999');
      expect(records[0].external_ref_id).toBe('STORY-ONBOARD-TASK-DNS');
      expect(records[0].title).toBe('Provision domain acme.io');
      expect(records[0].metadata.target_domain).toBe('acme.io');
      expect(records[0].metadata.sprint).toBe('Sprint 2026-Q4');
      expect(records[0].sprint_id).toBe('sprint-q4');

      // Child 2: default sequential subtask suffix & inherited sprint
      expect(records[1].parent_id).toBe('parent-uuid-999');
      expect(records[1].external_ref_id).toBe('STORY-ONBOARD-SUB-2');
      expect(records[1].title).toBe('Deploy sandbox for acme.io');
      expect(records[1].metadata.sprint).toBe('Sprint 2026-Q4');
      expect(records[1].sprint_id).toBe('sprint-q4');
    });

    it('persists only missing child tasks and preserves user edits on existing children', async () => {
      // Mock existing child in DB that has been edited by a user
      const existingEditedChild = {
        id: 'child-1',
        parent_id: parentItem.id,
        external_ref_id: 'STORY-ONBOARD-TASK-DNS',
        status: 'in_progress', // user edited from 'not_started' to 'in_progress'
        assignee: 'Alice',     // user assigned to Alice
        deleted_at: null,
      };

      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [existingEditedChild], error: null }),
        }),
      });

      const upsertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [
            { id: 'child-2', parent_id: parentItem.id, external_ref_id: 'STORY-ONBOARD-SUB-2' },
          ],
          error: null,
        }),
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: selectMock,
        upsert: upsertMock,
      } as any);

      const result = await expandTemplate({
        tenantId: parentItem.tenant_id,
        projectId: parentItem.project_id,
        template,
        parentItem,
      });

      // Crucial: Only child 2 is upserted; existing edited child 1 is NOT overwritten!
      expect(upsertMock).toHaveBeenCalledWith(
        [
          expect.objectContaining({
            external_ref_id: 'STORY-ONBOARD-SUB-2',
          }),
        ],
        { onConflict: 'project_id, external_ref_id' }
      );
      expect(result).toHaveLength(1);
    });
  });

  describe('dispatchWebhook', () => {
    it('dispatches webhook with HMAC signature header, structured payload, and redirect: manual', async () => {
      let capturedUrl = '';
      let capturedOptions: any = null;

      const mockFetch = vi.fn().mockImplementation((url, opts) => {
        capturedUrl = url;
        capturedOptions = opts;
        return Promise.resolve(new Response(JSON.stringify({ received: true }), { status: 200 }));
      });
      vi.stubGlobal('fetch', mockFetch);

      const secret = 'super-secret-automation-key';
      const payload = {
        event: 'item_created',
        item_id: 'item-123',
      };

      const res = await dispatchWebhook(
        {
          type: 'dispatch_webhook',
          url: 'https://webhook.site/test-endpoint',
        },
        payload,
        secret
      );

      expect(res.status).toBe(200);
      expect(capturedUrl).toBe('https://webhook.site/test-endpoint');
      expect(capturedOptions.method).toBe('POST');
      expect(capturedOptions.redirect).toBe('manual');
      expect(capturedOptions.headers['Content-Type']).toBe('application/json');

      const sigHeader = capturedOptions.headers['X-Tracker-Signature'];
      expect(sigHeader).toBeDefined();
      expect(sigHeader.startsWith('sha256=')).toBe(true);

      const isValid = verifyHmacSignature(capturedOptions.body, sigHeader, secret);
      expect(isValid).toBe(true);

      vi.unstubAllGlobals();
    });
  });

  describe('executeProjectAutomations', () => {
    it('triggers template expansion and webhook dispatch on matching items', async () => {
      const mockFetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ ok: true }), { status: 200 }));
      vi.stubGlobal('fetch', mockFetch);

      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const upsertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ id: 'child-101', title: 'Scaffold domain demo.org' }],
          error: null,
        }),
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: selectMock,
        upsert: upsertMock,
      } as any);

      const settings: ProjectSettings = {
        schema_version: '1.0',
        hierarchy: [],
        statuses: [],
        custom_fields: [],
        automations: [
          {
            id: 'rule-1',
            enabled: true,
            trigger: {
              event: 'item_created',
              item_type: 'feature',
              'metadata.domain': 'demo.org',
            },
            actions: [
              {
                type: 'expand_children_template',
                template_id: 'tmpl-setup',
              },
              {
                type: 'dispatch_webhook',
                url: 'https://example.com/automation-hook',
              },
            ],
          },
        ],
        templates: {
          'tmpl-setup': [
            {
              title: 'Scaffold domain {{metadata.domain}}',
              item_type: 'task',
            },
          ],
        },
      };

      const ingestedItems: WorkItem[] = [
        {
          id: 'item-parent-77',
          tenant_id: 't-1',
          project_id: 'p-1',
          external_ref_id: 'FEAT-77',
          item_type: 'feature',
          status: 'not_started',
          title: 'New Customer Site',
          order_index: 500,
          metadata: { domain: 'demo.org' },
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        },
      ];

      await executeProjectAutomations({
        tenantId: 't-1',
        projectId: 'p-1',
        settings,
        items: ingestedItems,
      });

      // Verify template expander executed
      expect(upsertMock).toHaveBeenCalled();
      // Verify webhook dispatched
      expect(mockFetch).toHaveBeenCalledWith(
        'https://example.com/automation-hook',
        expect.objectContaining({ method: 'POST' })
      );

      vi.unstubAllGlobals();
    });

    it('evaluates batch duplicate items preserving individual snapshot creation vs update events', async () => {
      const selectMock = vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      });

      const upsertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [{ id: 'child-1' }], error: null }),
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: selectMock,
        upsert: upsertMock,
      } as any);

      const settings: ProjectSettings = {
        schema_version: '1.0',
        hierarchy: [],
        statuses: [],
        custom_fields: [],
        automations: [
          {
            id: 'rule-create-only',
            enabled: true,
            trigger: { event: 'item_created', item_type: 'feature' },
            actions: [{ type: 'expand_children_template', template_id: 'tmpl-1' }],
          },
        ],
        templates: {
          'tmpl-1': [{ title: 'Task 1' }],
        },
      };

      // Batch contains FEAT-1 twice: first row is a create (prior: null), second is an update (prior: existing)
      const itemCreate: WorkItem = {
        id: 'item-1',
        tenant_id: 't-1',
        project_id: 'p-1',
        external_ref_id: 'FEAT-1',
        item_type: 'feature',
        status: 'not_started',
        title: 'Initial Feature',
        order_index: 100,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      const itemUpdate: WorkItem = {
        ...itemCreate,
        title: 'Updated Feature In Same Batch',
      };

      await executeProjectAutomations({
        tenantId: 't-1',
        projectId: 'p-1',
        settings,
        items: [itemCreate, itemUpdate],
        itemMutationSnapshots: [
          { item: itemCreate, prior: null }, // Created!
          { item: itemUpdate, prior: { id: 'item-1', deleted_at: null } }, // Updated!
        ],
      });

      // The creation rule fires exactly once (for the creation snapshot), not suppressed by the subsequent update!
      expect(upsertMock).toHaveBeenCalledTimes(1);
    });
  });

  describe('Taxonomy Resolution in buildTemplateRecords', () => {
    it('resolves item_type and status from project settings taxonomy when omitted', () => {
      const settings: ProjectSettings = {
        schema_version: '1.0',
        hierarchy: [
          { type: 'campaign', label: 'Campaign', level: 1, allowed_parents: [] },
          { type: 'deliverable', label: 'Deliverable', level: 2, allowed_parents: ['campaign'] },
        ],
        statuses: [
          { id: 'drafting', label: 'Drafting', color: '#888', order: 1 },
          { id: 'published', label: 'Published', color: '#0f0', order: 2 },
        ],
        custom_fields: [],
      };

      const parentItem = {
        id: 'campaign-1',
        external_ref_id: 'CAMP-1',
        item_type: 'campaign',
      };

      const records = buildTemplateRecords({
        tenantId: 't-1',
        projectId: 'p-1',
        template: [{ title: 'Child Deliverable' }],
        parentItem,
        settings,
      });

      expect(records).toHaveLength(1);
      expect(records[0].item_type).toBe('deliverable');
      expect(records[0].status).toBe('drafting');
    });

    it('rejects/skips template items with disallowed parent-child hierarchy combinations', () => {
      const settings: ProjectSettings = {
        schema_version: '1.0',
        hierarchy: [
          { type: 'story', label: 'Story', level: 1, allowed_parents: [] },
          { type: 'task', label: 'Task', level: 2, allowed_parents: ['story'] },
        ],
        statuses: [{ id: 'not_started', label: 'Not Started', color: '#888', order: 1 }],
        custom_fields: [],
      };

      // Task is a leaf and cannot have task children
      const leafParentItem = {
        id: 'task-1',
        external_ref_id: 'TASK-1',
        item_type: 'task',
      };

      const records = buildTemplateRecords({
        tenantId: 't-1',
        projectId: 'p-1',
        template: [{ title: 'Disallowed Sub-task', item_type: 'task' }],
        parentItem: leafParentItem,
        settings,
      });

      // Disallowed nesting is skipped to prevent invalid hierarchy persistence
      expect(records).toHaveLength(0);
    });
  });
});
