import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as verifyPrHandler } from '@/app/api/v1/bounties/verify/route';
import { extractTaskRefId } from '@/lib/bounties/extractRef';
import PublicBountiesPage from '@/app/(public)/[tenantSlug]/bounties/page';
import { supabaseAdmin } from '@/lib/db';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('TASK-TRK-BOUNTY-GATEWAY: Public Roadmap & Agent Bounty Verification Gateway', () => {
  const mockTenant = {
    id: '00000000-0000-0000-0000-000000000000',
    slug: 'sunshade',
    name: 'SunShade Open Ecosystem',
    tier: 'demo',
    metadata: { is_public: true, public_bounties: true },
  };

  const mockPrivateTenant = {
    id: '11111111-1111-1111-1111-111111111111',
    slug: 'secret-corp',
    name: 'Secret Corp',
    tier: 'enterprise',
    metadata: { is_public: false },
  };

  const mockBountyTask = {
    id: 'bounty-item-1',
    tenant_id: mockTenant.id,
    external_ref_id: 'TASK-BOUNTY-42',
    title: 'Implement OAuth Token Refresh Hook',
    description: 'Add auto-refresh before token expiration.',
    status: 'in_progress',
    metadata: {
      bounty_active: true,
      bounty_reward: '500 USDC',
    },
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Ref ID Parsing Utility', () => {
    it('extracts task reference from PR title, body, or branch', () => {
      expect(extractTaskRefId(['feat(auth): [TASK-BOUNTY-42] refresh tokens'])).toBe('TASK-BOUNTY-42');
      expect(extractTaskRefId(['', 'Resolves FEAT-TRK-CFD-TIME-WINDOW-STRIDE in tracker'])).toBe('FEAT-TRK-CFD-TIME-WINDOW-STRIDE');
      expect(extractTaskRefId(['No ref', 'No ref in body', 'fix/BUG-CI-12345678-vitest'])).toBe('BUG-CI-12345678-VITEST');
      expect(extractTaskRefId(['Regular PR without ref', 'just updating docs'])).toBeNull();
    });
  });

  describe('Public Bounty Board View SSR', () => {
    it('loads without active auth session for public workspace and renders Kanban columns', async () => {
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
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn().mockResolvedValue({ data: [mockBountyTask], error: null }),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const jsx = await PublicBountiesPage({ params: Promise.resolve({ tenantSlug: 'sunshade' }) });
      expect(jsx).toBeDefined();

      // Check that it rendered the public page (not the private workspace block)
      expect(jsx.type).toBe('main');
    });

    it('masks private workspace and renders private alert without leaking internal items', async () => {
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: mockPrivateTenant, error: null }),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const jsx = await PublicBountiesPage({ params: Promise.resolve({ tenantSlug: 'secret-corp' }) });
      expect(jsx).toBeDefined();
    });

    it('filters out items where bounty_active is false even if reward or points metadata exists', async () => {
      const inactiveBounty = {
        id: 'private-task-99',
        tenant_id: mockTenant.id,
        external_ref_id: 'TASK-INTERNAL-99',
        title: 'Secret Internal Architectural Plan',
        description: 'Confidential internal task.',
        status: 'in_progress',
        metadata: {
          bounty_active: false,
          bounty_reward: '1000 USDC',
        },
      };

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
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn().mockResolvedValue({ data: [inactiveBounty, mockBountyTask], error: null }),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const jsx = await PublicBountiesPage({ params: Promise.resolve({ tenantSlug: 'sunshade' }) });
      expect(jsx).toBeDefined();
    });
  });

  describe('PR Verification Webhook (/api/v1/bounties/verify)', () => {
    it('transitions work item to in_review when PR referencing task is opened', async () => {
      let currentItem = { ...mockBountyTask, status: 'in_progress' };

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: currentItem, error: null }),
                })),
              })),
            })),
            update: vi.fn((patch: any) => ({
              eq: vi.fn(() => {
                currentItem = { ...currentItem, ...patch };
                return {
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({ data: currentItem, error: null }),
                  })),
                };
              }),
            })),
          } as any;
        }
        return {} as any;
      });

      const webhookBody = {
        action: 'opened',
        pull_request: {
          title: 'feat: [TASK-BOUNTY-42] implement token refresh',
          body: 'Fixes token expiration bug',
          html_url: 'https://github.com/org/repo/pull/77',
          head: { sha: 'abcdef123456', ref: 'feat/TASK-BOUNTY-42' },
          merged: false,
        },
      };

      process.env.SUNSHADE_API_KEY = 'test_maintainer_key';
      const req = new NextRequest('https://track.sunshade.icu/api/v1/bounties/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test_maintainer_key',
        },
        body: JSON.stringify(webhookBody),
      });

      const res = await verifyPrHandler(req);
      delete process.env.SUNSHADE_API_KEY;
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.status).toBe('in_review');
      expect(json.external_ref_id).toBe('TASK-BOUNTY-42');
    });

    it('transitions work item to complete upon PR merge with bounty reward status', async () => {
      let currentItem = { ...mockBountyTask, status: 'in_review' };

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: currentItem, error: null }),
                })),
              })),
            })),
            update: vi.fn((patch: any) => ({
              eq: vi.fn(() => {
                currentItem = { ...currentItem, ...patch };
                return {
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({ data: currentItem, error: null }),
                  })),
                };
              }),
            })),
          } as any;
        }
        return {} as any;
      });

      const webhookBody = {
        action: 'closed',
        pull_request: {
          title: 'Merge: feat: [TASK-BOUNTY-42] implement token refresh',
          body: 'Tested and verified',
          html_url: 'https://github.com/org/repo/pull/77',
          head: { sha: 'feedcafe999', ref: 'feat/TASK-BOUNTY-42' },
          merged: true,
          merged_at: '2026-10-19T21:00:00Z',
        },
      };

      process.env.SUNSHADE_API_KEY = 'test_maintainer_key';
      const req = new NextRequest('https://track.sunshade.icu/api/v1/bounties/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test_maintainer_key',
        },
        body: JSON.stringify(webhookBody),
      });

      const res = await verifyPrHandler(req);
      delete process.env.SUNSHADE_API_KEY;
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.action).toBe('completed');
      expect(json.status).toBe('complete');
      expect(json.item.metadata.bounty_status).toBe('reward_eligible');
      expect(json.item.metadata.pr_url).toBe('https://github.com/org/repo/pull/77');
      expect(json.item.metadata.commit_hash).toBe('feedcafe999');
    });

    it('returns ignored action when PR references no recognizable task ref ID', async () => {
      const webhookBody = {
        action: 'opened',
        pull_request: {
          title: 'chore: update README docs',
          body: 'No task ref here',
          head: { sha: '111111', ref: 'patch-1' },
          merged: false,
        },
      };

      process.env.SUNSHADE_API_KEY = 'test_maintainer_key';
      const req = new NextRequest('https://track.sunshade.icu/api/v1/bounties/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test_maintainer_key',
        },
        body: JSON.stringify(webhookBody),
      });

      const res = await verifyPrHandler(req);
      delete process.env.SUNSHADE_API_KEY;
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.action).toBe('ignored');
    });

    it('rejects verification with HTTP 403 when work item is not marked as active bounty', async () => {
      const inactiveItem = {
        ...mockBountyTask,
        metadata: { bounty_active: false },
      };

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: inactiveItem, error: null }),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const webhookBody = {
        action: 'opened',
        pull_request: {
          title: 'feat: [TASK-BOUNTY-42] some change',
          body: 'resolves ref',
          head: { sha: '111111', ref: 'feat/TASK-BOUNTY-42' },
          merged: false,
        },
      };

      process.env.SUNSHADE_API_KEY = 'test_maintainer_key';
      const req = new NextRequest('https://track.sunshade.icu/api/v1/bounties/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test_maintainer_key',
        },
        body: JSON.stringify(webhookBody),
      });

      const res = await verifyPrHandler(req);
      delete process.env.SUNSHADE_API_KEY;
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('not designated as an active bounty');
    });

    it('rejects verification with HTTP 403 when PR repository does not match item repository', async () => {
      const repoItem = {
        ...mockBountyTask,
        metadata: {
          bounty_active: true,
          github_repo: 'sunshade-systems/tracker',
        },
      };

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: repoItem, error: null }),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const webhookBody = {
        action: 'opened',
        pull_request: {
          title: 'feat: [TASK-BOUNTY-42] malicious hijack attempt',
          base: { repo: { full_name: 'evil-corp/other-repo' } },
          head: { sha: '222222', ref: 'feat/TASK-BOUNTY-42' },
          merged: false,
        },
      };

      process.env.SUNSHADE_API_KEY = 'test_maintainer_key';
      const req = new NextRequest('https://track.sunshade.icu/api/v1/bounties/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test_maintainer_key',
        },
        body: JSON.stringify(webhookBody),
      });

      const res = await verifyPrHandler(req);
      delete process.env.SUNSHADE_API_KEY;
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('does not match work item repository');
    });

    it('enforces tenant scoping when tenant_slug is provided', async () => {
      let scopedTenantQueried = false;

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'tenants') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn((field: string, val: string) => {
                if (field === 'slug' && val === 'sunshade') scopedTenantQueried = true;
                return {
                  is: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: mockTenant, error: null }),
                  })),
                };
              }),
            })),
          } as any;
        }
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                eq: vi.fn(() => ({
                  is: vi.fn(() => ({
                    maybeSingle: vi.fn().mockResolvedValue({ data: mockBountyTask, error: null }),
                  })),
                })),
              })),
            })),
            update: vi.fn(() => ({
              eq: vi.fn(() => ({
                select: vi.fn(() => ({
                  single: vi.fn().mockResolvedValue({ data: mockBountyTask, error: null }),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const webhookBody = {
        action: 'opened',
        pull_request: {
          title: 'feat: [TASK-BOUNTY-42] scoped item',
          head: { sha: '333333', ref: 'feat/TASK-BOUNTY-42' },
          merged: false,
        },
      };

      const req = new NextRequest('https://track.sunshade.icu/api/v1/bounties/verify?tenant_slug=sunshade', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookBody),
      });

      const res = await verifyPrHandler(req);
      expect(res.status).toBe(200);
      expect(scopedTenantQueried).toBe(true);
    });

    it('un-strands bounty when PR is closed without merging and restores open status', async () => {
      let currentItem = {
        ...mockBountyTask,
        status: 'in_review',
        metadata: {
          bounty_active: true,
          bounty_status: 'in_progress',
          pr_url: 'https://github.com/org/repo/pull/77',
          pr_urls: ['https://github.com/org/repo/pull/77'],
        },
      };

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: currentItem, error: null }),
                })),
              })),
            })),
            update: vi.fn((patch: any) => ({
              eq: vi.fn(() => {
                currentItem = { ...currentItem, ...patch };
                return {
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({ data: currentItem, error: null }),
                  })),
                };
              }),
            })),
          } as any;
        }
        return {} as any;
      });

      const webhookBody = {
        action: 'closed',
        pull_request: {
          title: 'feat: [TASK-BOUNTY-42] abandoned PR',
          html_url: 'https://github.com/org/repo/pull/77',
          head: { sha: 'abcdef123', ref: 'feat/TASK-BOUNTY-42' },
          merged: false,
          closed_at: '2026-10-20T12:00:00Z',
        },
      };

      process.env.SUNSHADE_API_KEY = 'test_maintainer_key';
      const req = new NextRequest('https://track.sunshade.icu/api/v1/bounties/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test_maintainer_key',
        },
        body: JSON.stringify(webhookBody),
      });

      const res = await verifyPrHandler(req);
      delete process.env.SUNSHADE_API_KEY;
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.success).toBe(true);
      expect(json.action).toBe('reopened');
      expect(json.status).toBe('not_started');
      expect(json.item.metadata.bounty_status).toBe('open');
      expect(json.item.metadata.pr_urls).toHaveLength(0);
    });

    it('rejects bounty mutation with HTTP 409 when item belongs to a completed/locked sprint', async () => {
      const lockedSprintItem = {
        ...mockBountyTask,
        sprint_id: 'sprint-locked-1',
        status: 'in_review',
      };

      const completedSprint = {
        id: 'sprint-locked-1',
        status: 'completed',
        is_active: false,
      };

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: lockedSprintItem, error: null }),
                })),
              })),
            })),
          } as any;
        }
        if (table === 'sprints') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: completedSprint, error: null }),
                })),
              })),
            })),
          } as any;
        }
        return {} as any;
      });

      const webhookBody = {
        action: 'closed',
        pull_request: {
          title: 'feat: [TASK-BOUNTY-42] locked sprint test',
          html_url: 'https://github.com/org/repo/pull/88',
          head: { sha: 'ffff1111', ref: 'feat/TASK-BOUNTY-42' },
          merged: true,
        },
      };

      process.env.SUNSHADE_API_KEY = 'test_maintainer_key';
      const req = new NextRequest('https://track.sunshade.icu/api/v1/bounties/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test_maintainer_key',
        },
        body: JSON.stringify(webhookBody),
      });

      const res = await verifyPrHandler(req);
      delete process.env.SUNSHADE_API_KEY;
      expect(res.status).toBe(409);
      const json = await res.json();
      expect(json.error).toContain('locked sprint');
    });

    it('enforces HMAC signature when GITHUB_WEBHOOK_SECRET is configured', async () => {
      const testSecret = 'gh_webhook_secret_key_999';
      process.env.GITHUB_WEBHOOK_SECRET = testSecret;

      const webhookBody = {
        action: 'opened',
        pull_request: {
          title: 'feat: [TASK-BOUNTY-42] signed pr',
          head: { sha: '555555', ref: 'feat/TASK-BOUNTY-42' },
          merged: false,
        },
      };
      const bodyStr = JSON.stringify(webhookBody);

      // 1. Missing / invalid signature -> 401
      const reqInvalid = new NextRequest('https://track.sunshade.icu/api/v1/bounties/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': 'sha256=invalid_hex_string',
        },
        body: bodyStr,
      });

      const resInvalid = await verifyPrHandler(reqInvalid);
      expect(resInvalid.status).toBe(401);

      // 2. Valid signature -> 200
      const { createHmac } = await import('node:crypto');
      const validSig = 'sha256=' + createHmac('sha256', testSecret).update(bodyStr).digest('hex');

      let currentItem = { ...mockBountyTask };
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: currentItem, error: null }),
                })),
              })),
            })),
            update: vi.fn((patch: any) => ({
              eq: vi.fn(() => {
                currentItem = { ...currentItem, ...patch };
                return {
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({ data: currentItem, error: null }),
                  })),
                };
              }),
            })),
          } as any;
        }
        return {} as any;
      });

      const reqValid = new NextRequest('https://track.sunshade.icu/api/v1/bounties/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-hub-signature-256': validSig,
        },
        body: bodyStr,
      });

      const resValid = await verifyPrHandler(reqValid);
      expect(resValid.status).toBe(200);

      delete process.env.GITHUB_WEBHOOK_SECRET;
    });

    it('marks merged PR as pending_verification when unverified and unauthenticated without auto-awarding bounty', async () => {
      let currentItem = { ...mockBountyTask, status: 'in_review' };
      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: currentItem, error: null }),
                })),
              })),
            })),
            update: vi.fn((patch: any) => ({
              eq: vi.fn(() => {
                currentItem = { ...currentItem, ...patch };
                return {
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({ data: currentItem, error: null }),
                  })),
                };
              }),
            })),
          } as any;
        }
        return {} as any;
      });

      const webhookBody = {
        action: 'closed',
        pull_request: {
          title: 'feat: [TASK-BOUNTY-42] unverified merge attempt',
          head: { sha: '999999', ref: 'feat/TASK-BOUNTY-42' },
          merged: true,
        },
      };

      const req = new NextRequest('https://track.sunshade.icu/api/v1/bounties/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(webhookBody),
      });

      const res = await verifyPrHandler(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('in_review');
      expect(json.item.metadata.bounty_status).toBe('pending_verification');
      expect(json.item.metadata.verification_warning).toBeDefined();
    });

    it('preserves complete status and reward_eligible when an unmerged PR closes on an already completed bounty', async () => {
      let currentItem = {
        ...mockBountyTask,
        status: 'complete',
        metadata: {
          bounty_active: true,
          bounty_status: 'reward_eligible',
          pr_urls: ['https://github.com/org/repo/pull/77', 'https://github.com/org/repo/pull/78'],
        },
      };

      vi.mocked(supabaseAdmin.from).mockImplementation((table: string) => {
        if (table === 'work_items') {
          return {
            select: vi.fn(() => ({
              eq: vi.fn(() => ({
                is: vi.fn(() => ({
                  maybeSingle: vi.fn().mockResolvedValue({ data: currentItem, error: null }),
                })),
              })),
            })),
            update: vi.fn((patch: any) => ({
              eq: vi.fn(() => {
                currentItem = { ...currentItem, ...patch };
                return {
                  select: vi.fn(() => ({
                    single: vi.fn().mockResolvedValue({ data: currentItem, error: null }),
                  })),
                };
              }),
            })),
          } as any;
        }
        return {} as any;
      });

      const webhookBody = {
        action: 'closed',
        pull_request: {
          title: 'feat: [TASK-BOUNTY-42] closed secondary PR',
          html_url: 'https://github.com/org/repo/pull/78',
          head: { sha: '888888', ref: 'feat/TASK-BOUNTY-42' },
          merged: false,
        },
      };

      process.env.SUNSHADE_API_KEY = 'test_maintainer_key';
      const req = new NextRequest('https://track.sunshade.icu/api/v1/bounties/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer test_maintainer_key',
        },
        body: JSON.stringify(webhookBody),
      });

      const res = await verifyPrHandler(req);
      delete process.env.SUNSHADE_API_KEY;

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.status).toBe('complete');
      expect(json.item.metadata.bounty_status).toBe('reward_eligible');
    });
  });
});

