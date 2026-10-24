import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  matchesTrigger,
  interpolate,
  buildTemplateRecords,
  expandTemplate,
  dispatchWebhook,
  executeProjectAutomations,
} from '@/lib/automation-engine';
import { supabaseAdmin } from '@/lib/db';
import { verifyHmacSignature } from '@/lib/webhooks/verify-hmac';
import type { AutomationTrigger, ProjectSettings, ProjectTemplateItem, WorkItem } from '@/types/tracker';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
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
      external_ref_id: 'STORY-ONBOARD',
      item_type: 'story',
      status: 'not_started',
      title: 'Onboard Customer Acme',
      order_index: 2000,
      metadata: {
        company_domain: 'acme.io',
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

    it('builds template records correctly linked to parent_id with hydrated variables', () => {
      const records = buildTemplateRecords({
        tenantId: parentItem.tenant_id,
        projectId: parentItem.project_id,
        template,
        parentItem,
      });

      expect(records).toHaveLength(2);

      // Child 1: custom ref suffix
      expect(records[0].parent_id).toBe('parent-uuid-999');
      expect(records[0].external_ref_id).toBe('STORY-ONBOARD-TASK-DNS');
      expect(records[0].title).toBe('Provision domain acme.io');
      expect(records[0].metadata.target_domain).toBe('acme.io');

      // Child 2: default sequential subtask suffix
      expect(records[1].parent_id).toBe('parent-uuid-999');
      expect(records[1].external_ref_id).toBe('STORY-ONBOARD-SUB-2');
      expect(records[1].title).toBe('Deploy sandbox for acme.io');
    });

    it('persists child tasks into tracker.work_items via supabaseAdmin upsert', async () => {
      const upsertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [
            { id: 'child-1', parent_id: parentItem.id, external_ref_id: 'STORY-ONBOARD-TASK-DNS' },
            { id: 'child-2', parent_id: parentItem.id, external_ref_id: 'STORY-ONBOARD-SUB-2' },
          ],
          error: null,
        }),
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        upsert: upsertMock,
      } as any);

      const inserted = await expandTemplate({
        tenantId: parentItem.tenant_id,
        projectId: parentItem.project_id,
        template,
        parentItem,
      });

      expect(upsertMock).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            parent_id: 'parent-uuid-999',
            project_id: 'proj-456',
            external_ref_id: 'STORY-ONBOARD-TASK-DNS',
          }),
        ]),
        { onConflict: 'project_id, external_ref_id' }
      );
      expect(inserted).toHaveLength(2);
      expect(inserted[0].parent_id).toBe('parent-uuid-999');
    });
  });

  describe('dispatchWebhook', () => {
    it('dispatches webhook with HMAC signature header and structured payload', async () => {
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

      const upsertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ id: 'child-101', title: 'Scaffold domain demo.org' }],
          error: null,
        }),
      });

      vi.mocked(supabaseAdmin.from).mockReturnValue({
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

    it('does not fire item_created trigger on item_updated mutations', async () => {
      const upsertMock = vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: [], error: null }),
      });
      vi.mocked(supabaseAdmin.from).mockReturnValue({
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

      const existingItem: WorkItem = {
        id: 'item-1',
        tenant_id: 't-1',
        project_id: 'p-1',
        external_ref_id: 'FEAT-1',
        item_type: 'feature',
        status: 'not_started',
        title: 'Updated Feature',
        order_index: 100,
        metadata: {},
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      await executeProjectAutomations({
        tenantId: 't-1',
        projectId: 'p-1',
        settings,
        items: [existingItem],
        itemMutationSnapshots: [{ item: existingItem, prior: { id: 'item-1', deleted_at: null } }],
      });

      // Since prior existed without deleted_at, it is an update, so item_created trigger does NOT fire
      expect(upsertMock).not.toHaveBeenCalled();
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

      expect(records[0].item_type).toBe('deliverable');
      expect(records[0].status).toBe('drafting');
    });
  });
});
