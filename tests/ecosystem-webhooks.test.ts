import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { createHmac } from 'node:crypto';
import { POST as ecosystemWebhookHandler } from '@/app/api/v1/webhooks/ecosystem/route';
import { verifyHmacSignature } from '@/lib/webhooks/verify-hmac';
import { supabaseAdmin } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('TASK-TRK-EVENT-BRIDGES: Cross-Utility Webhook Dispatcher for Ecosystem Apps', () => {
  const mockSecret = 'test_shared_ecosystem_secret_key_123';
  const mockTenant = { id: '00000000-0000-0000-0000-000000000000', slug: 'pym-energy', name: 'Pym Energy' };
  const mockPatchworkProject = { id: 'proj-pw-1', slug: 'patchwork', name: 'PatchWork' };
  const mockValerieProject = { id: 'proj-val-1', slug: 'valerie', name: 'Project Valerie' };

  function signPayload(bodyString: string, secret = mockSecret): string {
    return createHmac('sha256', secret).update(bodyString).digest('hex');
  }

  function createMockSupabase(itemsStore: Map<string, any>) {
    return (table: string) => {
      let currentFilter: { id?: string; external_ref_id?: string; slug?: string } = {};

      const builder: any = {
        select: vi.fn(() => builder),
        eq: vi.fn((field: string, val: string) => {
          if (field === 'id') currentFilter.id = val;
          if (field === 'external_ref_id') currentFilter.external_ref_id = val;
          if (field === 'slug') currentFilter.slug = val;
          return builder;
        }),
        is: vi.fn(() => builder),
        limit: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => {
          if (table === 'tenants') return { data: mockTenant, error: null };
          if (table === 'projects') {
            if (currentFilter.slug === 'patchwork') return { data: mockPatchworkProject, error: null };
            if (currentFilter.slug === 'valerie') return { data: mockValerieProject, error: null };
            return { data: mockPatchworkProject, error: null };
          }
          if (table === 'work_items') {
            const key = currentFilter.external_ref_id;
            const found = key ? itemsStore.get(key) : null;
            return { data: found || null, error: null };
          }
          return { data: null, error: null };
        }),
        insert: vi.fn((payload: any) => {
          const inserted = { id: `item-gen-${Date.now()}`, ...payload };
          itemsStore.set(payload.external_ref_id, inserted);
          return {
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: inserted, error: null }),
            })),
          };
        }),
        update: vi.fn((payload: any) => {
          return {
            eq: vi.fn((field: string, val: string) => {
              const existing = itemsStore.get(currentFilter.external_ref_id || '');
              const updated = { ...(existing || {}), ...payload };
              if (currentFilter.external_ref_id) {
                itemsStore.set(currentFilter.external_ref_id, updated);
              }
              return {
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: updated, error: null }),
                })),
              };
            }),
          };
        }),
      };

      return builder;
    };
  }

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUNSHADE_ECOSYSTEM_WEBHOOK_SECRET = mockSecret;
  });

  describe('HMAC-SHA256 Signature Security Validation', () => {
    it('verifies valid HMAC signatures and rejects tampered ones', () => {
      const body = JSON.stringify({ source: 'patchwork', incident_id: '99' });
      const validSig = signPayload(body);

      expect(verifyHmacSignature(body, validSig, mockSecret)).toBe(true);
      expect(verifyHmacSignature(body, `sha256=${validSig}`, mockSecret)).toBe(true);
      expect(verifyHmacSignature(body, 'tampered_invalid_hex', mockSecret)).toBe(false);
      expect(verifyHmacSignature(body, null, mockSecret)).toBe(false);
    });

    it('rejects missing signature with HTTP 401', async () => {
      const body = JSON.stringify({ source: 'patchwork', incident_id: '123' });
      const req = new NextRequest('https://track.sunshade.icu/api/v1/webhooks/ecosystem', {
        method: 'POST',
        body,
      });

      const res = await ecosystemWebhookHandler(req);
      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.error).toContain('Unauthorized');
    });

    it('rejects tampered signature with HTTP 401', async () => {
      const body = JSON.stringify({ source: 'patchwork', incident_id: '123' });
      const req = new NextRequest('https://track.sunshade.icu/api/v1/webhooks/ecosystem', {
        method: 'POST',
        headers: {
          'x-sunshade-signature': '0000000000000000000000000000000000000000000000000000000000000000',
        },
        body,
      });

      const res = await ecosystemWebhookHandler(req);
      expect(res.status).toBe(401);
    });
  });

  describe('PatchWork Normalization & Ingestion', () => {
    it('maps citizen hazard report to patchwork project with deterministic EVT-PW-<ID>', async () => {
      const itemsStore = new Map<string, any>();
      vi.mocked(supabaseAdmin.from).mockImplementation(createMockSupabase(itemsStore) as any);

      const payload = {
        source: 'patchwork',
        incident_id: '5012',
        title: 'Exposed High-Voltage Cable on 5th Ave',
        severity: 'critical',
        location: { lat: 40.7128, lng: -74.006 },
        description: 'Underground conduit severed during street repaving.',
      };

      const bodyStr = JSON.stringify(payload);
      const sig = signPayload(bodyStr);

      const req = new NextRequest('https://track.sunshade.icu/api/v1/webhooks/ecosystem', {
        method: 'POST',
        headers: {
          'x-sunshade-signature': sig,
          'Content-Type': 'application/json',
        },
        body: bodyStr,
      });

      const res = await ecosystemWebhookHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.external_ref_id).toBe('EVT-PW-5012');
      expect(json.item.metadata.priority).toBe('Critical');
      expect(json.item.metadata.ecosystem_source).toBe('patchwork');
      expect(json.item.metadata.agent_prompt).toContain('Field Engineering');
    });
  });

  describe('Project Valerie Normalization & Ingestion', () => {
    it('maps controversy flag to valerie project with deterministic EVT-VAL-<ID>', async () => {
      const itemsStore = new Map<string, any>();
      vi.mocked(supabaseAdmin.from).mockImplementation(createMockSupabase(itemsStore) as any);

      const payload = {
        source: 'valerie',
        poll_id: '884',
        topic: 'Congestion Pricing Downtown Ordinance',
        controversy_score: 0.88,
        polarization_level: 'Extreme',
        description: 'Voters split 49/51 on zone perimeter boundaries.',
      };

      const bodyStr = JSON.stringify(payload);
      const sig = signPayload(bodyStr);

      const req = new NextRequest('https://track.sunshade.icu/api/v1/webhooks/ecosystem', {
        method: 'POST',
        headers: {
          'x-sunshade-signature': sig,
          'Content-Type': 'application/json',
        },
        body: bodyStr,
      });

      const res = await ecosystemWebhookHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.external_ref_id).toBe('EVT-VAL-884');
      expect(json.item.metadata.priority).toBe('Critical');
      expect(json.item.metadata.ecosystem_source).toBe('valerie');
      expect(json.item.metadata.agent_prompt).toContain('Neutral Policy & Voter Research Specialist');
    });
  });

  describe('Idempotency Validation', () => {
    it('updates existing item instead of creating duplicate on duplicate webhook delivery', async () => {
      const itemsStore = new Map<string, any>();
      vi.mocked(supabaseAdmin.from).mockImplementation(createMockSupabase(itemsStore) as any);

      const payload = {
        source: 'patchwork',
        incident_id: '9900',
        title: 'Water Main Pressure Loss',
        severity: 'high',
      };

      const bodyStr = JSON.stringify(payload);
      const sig = signPayload(bodyStr);

      // First webhook delivery -> created
      const req1 = new NextRequest('https://track.sunshade.icu/api/v1/webhooks/ecosystem', {
        method: 'POST',
        headers: { 'x-sunshade-signature': sig, 'Content-Type': 'application/json' },
        body: bodyStr,
      });
      const res1 = await ecosystemWebhookHandler(req1);
      const json1 = await res1.json();
      expect(json1.action).toBe('created');

      // Second webhook delivery with updated title -> updated
      const payloadUpdated = { ...payload, title: 'Water Main Pressure Loss (Repaired)' };
      const bodyStr2 = JSON.stringify(payloadUpdated);
      const sig2 = signPayload(bodyStr2);

      const req2 = new NextRequest('https://track.sunshade.icu/api/v1/webhooks/ecosystem', {
        method: 'POST',
        headers: { 'x-sunshade-signature': sig2, 'Content-Type': 'application/json' },
        body: bodyStr2,
      });
      const res2 = await ecosystemWebhookHandler(req2);
      const json2 = await res2.json();
      expect(json2.action).toBe('updated');
      expect(itemsStore.size).toBe(1);
    });
  });

  describe('Cross-Tenant Isolation & Project Routing Safeguards', () => {
    it('rejects unauthorized tenants with HTTP 403 when ecosystem webhooks are not enabled', async () => {
      const itemsStore = new Map<string, any>();
      const privateTenant = { id: 'tenant-private-id', slug: 'acme-corp', name: 'Acme Corp', metadata: { ecosystem_enabled: false } };

      vi.mocked(supabaseAdmin.from).mockImplementation(((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() => ({
            is: vi.fn(() => ({
              maybeSingle: vi.fn(async () => {
                if (table === 'tenants') return { data: privateTenant, error: null };
                return { data: null, error: null };
              }),
            })),
            maybeSingle: vi.fn(async () => {
              if (table === 'tenants') return { data: privateTenant, error: null };
              return { data: null, error: null };
            }),
          })),
        })),
      })) as any);

      const payload = { source: 'patchwork', incident_id: '100' };
      const bodyStr = JSON.stringify(payload);
      const sig = signPayload(bodyStr);

      const req = new NextRequest('https://track.sunshade.icu/api/v1/webhooks/ecosystem', {
        method: 'POST',
        headers: {
          'x-sunshade-signature': sig,
          'x-tenant-slug': 'acme-corp',
          'Content-Type': 'application/json',
        },
        body: bodyStr,
      });

      const res = await ecosystemWebhookHandler(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('not authorized');
    });

    it('rejects with HTTP 404 when target ecosystem project is missing without routing into unrelated project', async () => {
      const itemsStore = new Map<string, any>();
      // Mock tenant found, but projects query returns null for patchwork
      vi.mocked(supabaseAdmin.from).mockImplementation(((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn((field: string, val: string) => ({
            eq: vi.fn((f2: string, v2: string) => ({
              is: vi.fn(() => ({
                maybeSingle: vi.fn(async () => {
                  if (table === 'projects') return { data: null, error: null };
                  return { data: null, error: null };
                }),
              })),
            })),
            is: vi.fn(() => ({
              maybeSingle: vi.fn(async () => {
                if (table === 'tenants') return { data: mockTenant, error: null };
                return { data: null, error: null };
              }),
            })),
          })),
        })),
      })) as any);

      const payload = { source: 'patchwork', incident_id: '200' };
      const bodyStr = JSON.stringify(payload);
      const sig = signPayload(bodyStr);

      const req = new NextRequest('https://track.sunshade.icu/api/v1/webhooks/ecosystem', {
        method: 'POST',
        headers: {
          'x-sunshade-signature': sig,
          'Content-Type': 'application/json',
        },
        body: bodyStr,
      });

      const res = await ecosystemWebhookHandler(req);
      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.error).toContain('Target project "patchwork" not found');
    });
  });
});
