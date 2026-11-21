import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as ingestHandler } from '@/app/api/v1/items/ingest/route';
import { supabaseAdmin } from '@/lib/db';
import { SYSTEM_ECOSYSTEM_POOL_USER_ID } from '@/lib/services/efficiencyMintBridge';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/notifications', () => ({
  dispatchItemNotifications: vi.fn().mockResolvedValue(undefined),
  getTenantMemberRecipients: vi.fn().mockResolvedValue({
    resolve: vi.fn(() => null),
  }),
}));

describe('TASK-TRK-GH-TRACKER-TELEMETRY: Genesis Attributed Artifact (TOOL-GH-TRACKER) on Ingest', () => {
  const mockTenant = { id: '00000000-0000-0000-0000-000000000001', slug: 'sunshade' };
  const mockProject = {
    id: 'proj-telemetry-1',
    tenant_id: mockTenant.id,
    slug: 'sunshade-tracker',
    settings: {
      schema_version: '1.0',
      hierarchy: [{ type: 'task', label: 'Task', level: 1, allowed_parents: [] }],
      statuses: [
        { id: 'not_started', label: 'Not Started', color: '#94a3b8', order: 1 },
        { id: 'in_review', label: 'In Review', color: '#a855f7', order: 2 },
      ],
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('triggers attribution telemetry into SYSTEM_ECOSYSTEM_POOL credited to tympollack when synced_by_artifact=TOOL-GH-TRACKER accompanies a new pr_url', async () => {
    const ledgerRows: any[] = [];
    const attestations: any[] = [];
    const artifact = {
      artifact_ref_id: 'TOOL-GH-TRACKER',
      builder_user_id: 'tympollack',
      cumulative_uses: 0,
      survival_ratio: 1.0,
    };

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
            })),
          })),
        } as any;
      }

      if (table === 'projects') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
              })),
            })),
          })),
        } as any;
      }

      if (table === 'work_items') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: { order_index: 1000 }, error: null }),
                })),
              })),
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'work-item-uuid-42',
                    external_ref_id: 'TASK-TRK-GH-TRACKER-TELEMETRY',
                    metadata: {},
                    deleted_at: null,
                  },
                ],
                error: null,
              }),
            })),
          })),
          upsert: vi.fn((payload: any) => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { id: 'work-item-uuid-42', ...payload },
                error: null,
              }),
            })),
          })),
        } as any;
      }

      if (table === 'ai_usage_logs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        } as any;
      }

      if (table === 'efficiency_mint_attestations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((col: string, val: string) => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: attestations.find((a) => a[col] === val) || null,
                error: null,
              }),
            })),
          })),
          insert: vi.fn((row: any) => {
            attestations.push(row);
            return {
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: row, error: null }),
              })),
            };
          }),
        } as any;
      }

      if (table === 'infrastructure_artifacts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((_col: string, val: string) => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: val === artifact.artifact_ref_id ? { ...artifact } : null,
                error: null,
              }),
            })),
          })),
          update: vi.fn((patch: any) => ({
            eq: vi.fn(() => {
              artifact.cumulative_uses = patch.cumulative_uses;
              return Promise.resolve({ data: { ...artifact }, error: null });
            }),
          })),
        } as any;
      }

      if (table === 'hub_tokens_ledger') {
        return {
          insert: vi.fn((row: any) => {
            ledgerRows.push(row);
            return {
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: row, error: null }),
              })),
            };
          }),
        } as any;
      }

      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/items/ingest', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tk_live_sunshade_master_key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project_slug: 'sunshade-tracker',
        items: [
          {
            external_ref_id: 'TASK-TRK-GH-TRACKER-TELEMETRY',
            title: 'Wire gh-tracker Telemetry',
            status: 'in_review',
            metadata: {
              pr_url: 'https://github.com/tympollack/sunshade-tracker/pull/166',
              commit_hash: 'abc1234',
              synced_by_artifact: 'TOOL-GH-TRACKER',
            },
          },
        ],
      }),
    });

    const res = await ingestHandler(req);
    expect(res.status).toBe(200);

    // Allow non-blocking microtask telemetry hook to settle
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(attestations).toHaveLength(1);
    expect(attestations[0].artifact_ref_id).toBe('TOOL-GH-TRACKER');
    expect(attestations[0].attributed_builder_id).toBe('tympollack');

    expect(ledgerRows).toHaveLength(1);
    expect(ledgerRows[0].user_id).toBe(SYSTEM_ECOSYSTEM_POOL_USER_ID);
    expect(ledgerRows[0].transaction_type).toBe('ECOSYSTEM_UPKEEP_MINT');
    expect(ledgerRows[0].metadata.wallet_id).toBe('SYSTEM_ECOSYSTEM_POOL');
    expect(ledgerRows[0].metadata.attributed_builder_id).toBe('tympollack');
    expect(ledgerRows[0].metadata.artifact_ref_id).toBe('TOOL-GH-TRACKER');
    expect(ledgerRows[0].metadata.patronage_credit_awarded).toBe(2500);
    expect(artifact.cumulative_uses).toBe(1);
  });

  it('does not trigger telemetry when synced_by_artifact has no newly attached pr_url or commit_hash', async () => {
    const ledgerRows: any[] = [];

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
            })),
          })),
        } as any;
      }
      if (table === 'projects') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
              })),
            })),
          })),
        } as any;
      }
      if (table === 'work_items') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: { order_index: 1000 }, error: null }),
                })),
              })),
              in: vi.fn().mockResolvedValue({
                data: [
                  {
                    id: 'work-item-uuid-43',
                    external_ref_id: 'TASK-EXISTING-PR',
                    metadata: {
                      pr_url: 'https://github.com/tympollack/sunshade-tracker/pull/166',
                      commit_hash: 'abc1234',
                    },
                    deleted_at: null,
                  },
                ],
                error: null,
              }),
            })),
          })),
          upsert: vi.fn((payload: any) => ({
            select: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({
                data: { id: 'work-item-uuid-43', ...payload },
                error: null,
              }),
            })),
          })),
        } as any;
      }
      if (table === 'hub_tokens_ledger') {
        return {
          insert: vi.fn((row: any) => {
            ledgerRows.push(row);
            return {
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: row, error: null }),
              })),
            };
          }),
        } as any;
      }
      return {} as any;
    });

    const req = new NextRequest('http://localhost:3000/api/v1/items/ingest', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tk_live_sunshade_master_key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project_slug: 'sunshade-tracker',
        items: [
          {
            external_ref_id: 'TASK-EXISTING-PR',
            title: 'Unchanged PR Sync',
            status: 'in_review',
            metadata: {
              pr_url: 'https://github.com/tympollack/sunshade-tracker/pull/166',
              commit_hash: 'abc1234',
              synced_by_artifact: 'TOOL-GH-TRACKER',
            },
          },
        ],
      }),
    });

    const res = await ingestHandler(req);
    expect(res.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 25));

    expect(ledgerRows).toHaveLength(0);
  });

  it('prices batched artifact syncs sequentially and blocks personal_organizer or malformed PR proofs', async () => {
    const ledgerRows: any[] = [];
    const artifact = {
      artifact_ref_id: 'TOOL-GH-TRACKER',
      builder_user_id: 'tympollack',
      cumulative_uses: 0,
      survival_ratio: 1.0,
    };
    const attestations: any[] = [];
    let currentProject = { ...mockProject };

    vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              single: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
            })),
          })),
        } as any;
      }
      if (table === 'projects') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: currentProject, error: null }),
              })),
            })),
          })),
        } as any;
      }
      if (table === 'work_items') {
        let idx = 0;
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(() => ({
                limit: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: { order_index: 1000 }, error: null }),
                })),
              })),
              in: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
          upsert: vi.fn((payload: any) => {
            idx++;
            return {
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({
                  data: { id: `batch-item-${idx}`, ...payload },
                  error: null,
                }),
              })),
            };
          }),
        } as any;
      }
      if (table === 'ai_usage_logs') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn().mockResolvedValue({ data: [], error: null }),
            })),
          })),
        } as any;
      }
      if (table === 'efficiency_mint_attestations') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn((col: string, val: string) => ({
              maybeSingle: vi.fn().mockResolvedValue({
                data: attestations.find((a) => a[col] === val) || null,
                error: null,
              }),
            })),
          })),
          insert: vi.fn((row: any) => {
            attestations.push(row);
            return {
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: row, error: null }),
              })),
            };
          }),
        } as any;
      }
      if (table === 'infrastructure_artifacts') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: vi.fn().mockResolvedValue({ data: { ...artifact }, error: null }),
            })),
          })),
          update: vi.fn((patch: any) => ({
            eq: vi.fn(() => {
              artifact.cumulative_uses = patch.cumulative_uses;
              return Promise.resolve({ data: { ...artifact }, error: null });
            }),
          })),
        } as any;
      }
      if (table === 'hub_tokens_ledger') {
        return {
          insert: vi.fn((row: any) => {
            ledgerRows.push(row);
            return {
              select: vi.fn(() => ({
                single: vi.fn().mockResolvedValue({ data: row, error: null }),
              })),
            };
          }),
        } as any;
      }
      return {} as any;
    });

    // 1. Batched two valid items in one POST -> sequentially priced 2500 then 850
    const batchReq = new NextRequest('http://localhost:3000/api/v1/items/ingest', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tk_live_sunshade_master_key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project_slug: 'sunshade-tracker',
        items: [
          {
            external_ref_id: 'TASK-BATCH-1',
            title: 'Batch 1',
            metadata: {
              pr_url: 'https://github.com/tympollack/sunshade-tracker/pull/201',
              synced_by_artifact: 'TOOL-GH-TRACKER',
            },
          },
          {
            external_ref_id: 'TASK-BATCH-2',
            title: 'Batch 2',
            metadata: {
              pr_url: 'https://github.com/tympollack/sunshade-tracker/pull/202',
              synced_by_artifact: 'TOOL-GH-TRACKER',
            },
          },
        ],
      }),
    });

    const batchRes = await ingestHandler(batchReq);
    expect(batchRes.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 35));

    expect(ledgerRows).toHaveLength(2);
    expect(ledgerRows[0].metadata.patronage_credit_awarded).toBe(2500);
    expect(ledgerRows[1].metadata.patronage_credit_awarded).toBe(850);
    expect(artifact.cumulative_uses).toBe(2);

    // 2. Personal organizer project must never trigger minting
    currentProject = {
      ...mockProject,
      settings: { ...mockProject.settings, ledger_mode: 'personal_organizer' } as any,
    };
    const personalReq = new NextRequest('http://localhost:3000/api/v1/items/ingest', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer tk_live_sunshade_master_key',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        project_slug: 'sunshade-tracker',
        items: [
          {
            external_ref_id: 'TASK-PERSONAL-1',
            title: 'Personal chore',
            metadata: {
              pr_url: 'https://github.com/tympollack/sunshade-tracker/pull/203',
              synced_by_artifact: 'TOOL-GH-TRACKER',
            },
          },
        ],
      }),
    });
    const personalRes = await ingestHandler(personalReq);
    expect(personalRes.status).toBe(200);
    await new Promise((resolve) => setTimeout(resolve, 25));
    expect(ledgerRows).toHaveLength(2);
  });
});
