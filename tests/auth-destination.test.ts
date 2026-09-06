import { describe, it, expect, vi, beforeEach } from 'vitest';
import { resolvePostAuthDestination } from '@/lib/auth';

// Mock supabase-server
vi.mock('@/lib/supabase-server', () => ({
  createServiceClient: vi.fn(),
}));

import { createServiceClient } from '@/lib/supabase-server';

describe('resolvePostAuthDestination', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('honors valid nextParam if not login or onboarding', async () => {
    const url = await resolvePostAuthDestination('user-123', '/acme/crm', 'https://track.sunshade.icu');
    expect(url.pathname).toBe('/acme/crm');
  });

  it('resolves workspace and first project when nextParam is missing', async () => {
    const mockFrom = vi.fn((table: string) => {
      if (table === 'tenant_members') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({
            data: [
              {
                role: 'owner',
                created_at: new Date().toISOString(),
                tenants: { id: 'tenant-uuid-1', slug: 'my-org', name: 'My Org', deleted_at: null },
              },
            ],
            error: null,
          }),
        };
      }
      if (table === 'projects') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { slug: 'project-alpha' },
            error: null,
          }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    vi.mocked(createServiceClient).mockReturnValue({ from: mockFrom } as any);

    const url = await resolvePostAuthDestination('user-123', null, 'https://track.sunshade.icu');
    expect(url.pathname).toBe('/my-org/project-alpha');
  });

  it('falls back to /onboarding only when user has no active tenant', async () => {
    const mockFrom = vi.fn((table: string) => {
      if (table === 'tenant_members') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockResolvedValue({ data: [], error: null }),
        };
      }
      if (table === 'tenants') {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        };
      }
      return { select: vi.fn().mockReturnThis() };
    });

    vi.mocked(createServiceClient).mockReturnValue({ from: mockFrom } as any);

    const url = await resolvePostAuthDestination('user-brand-new', '', 'https://track.sunshade.icu');
    expect(url.pathname).toBe('/onboarding');
  });
});
