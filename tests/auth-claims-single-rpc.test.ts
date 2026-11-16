import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { authenticateSession, getSessionUser } from '@/lib/auth-guard';
import { createServerClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/db';

vi.mock('@/lib/supabase-server', () => ({
  createServerClient: vi.fn(),
  createServiceClient: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('TASK-TRK-AUTH-CLAIMS-SINGLE-RPC: Local Claims & Read Auth', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getSessionUser', () => {
    it('should verify user from getClaims() without calling getUser()', async () => {
      const mockGetClaims = vi.fn().mockResolvedValue({
        data: {
          claims: {
            sub: 'user-claims-123',
            email: 'tymz@sunshade.icu',
            user_metadata: { name: 'Tymz Dev' },
            role: 'authenticated',
          },
        },
        error: null,
      });
      const mockGetUser = vi.fn();

      const mockSupabase = {
        auth: {
          getClaims: mockGetClaims,
          getUser: mockGetUser,
        },
      };

      const result = await getSessionUser(mockSupabase);

      expect(mockGetClaims).toHaveBeenCalledTimes(1);
      expect(mockGetUser).not.toHaveBeenCalled();
      expect(result.user).not.toBeNull();
      expect(result.user.id).toBe('user-claims-123');
      expect(result.user.email).toBe('tymz@sunshade.icu');
      expect(result.user.user_metadata.name).toBe('Tymz Dev');
    });

    it('should return null user without calling getUser() when no session claims are returned', async () => {
      const mockGetClaims = vi.fn().mockResolvedValue({
        data: null,
        error: null,
      });
      const mockGetUser = vi.fn();

      const mockSupabase = {
        auth: {
          getClaims: mockGetClaims,
          getUser: mockGetUser,
        },
      };

      const result = await getSessionUser(mockSupabase);

      expect(mockGetClaims).toHaveBeenCalledTimes(1);
      expect(mockGetUser).not.toHaveBeenCalled();
      expect(result.user).toBeNull();
    });

    it('should fall back to getUser() when getClaims is not a function', async () => {
      const mockGetUser = vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'fallback-user-456',
            email: 'fallback@sunshade.icu',
          },
        },
        error: null,
      });

      const mockSupabase = {
        auth: {
          getUser: mockGetUser,
        },
      };

      const result = await getSessionUser(mockSupabase);

      expect(mockGetUser).toHaveBeenCalledTimes(1);
      expect(result.user?.id).toBe('fallback-user-456');
    });
  });

  describe('authenticateSession route method discrimination', () => {
    it('should use getClaims() and avoid getUser() for GET requests', async () => {
      const mockGetClaims = vi.fn().mockResolvedValue({
        data: {
          claims: {
            sub: 'session-user-1',
            email: 'reader@sunshade.icu',
          },
        },
        error: null,
      });
      const mockGetUser = vi.fn();

      vi.mocked(createServerClient).mockResolvedValue({
        auth: {
          getClaims: mockGetClaims,
          getUser: mockGetUser,
        },
      } as any);

      const mockTenant = {
        id: 't-1',
        slug: 'sunshade',
        name: 'SunShade Digital Canopy',
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { role: 'member', tenants: mockTenant },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      } as any);

      const req = new NextRequest('http://localhost:3000/api/v1/items?tenant_slug=sunshade', {
        method: 'GET',
        headers: { 'x-tenant-slug': 'sunshade' },
      });

      const result = await authenticateSession(req);

      expect(mockGetClaims).toHaveBeenCalledTimes(1);
      expect(mockGetUser).not.toHaveBeenCalled();
      expect(result.context?.userId).toBe('session-user-1');
      expect(result.context?.tenant.slug).toBe('sunshade');
    });

    it('should strictly use getUser() for write mutations (POST, PATCH, DELETE)', async () => {
      const mockGetClaims = vi.fn();
      const mockGetUser = vi.fn().mockResolvedValue({
        data: {
          user: {
            id: 'mutating-user-2',
            email: 'writer@sunshade.icu',
          },
        },
        error: null,
      });

      vi.mocked(createServerClient).mockResolvedValue({
        auth: {
          getClaims: mockGetClaims,
          getUser: mockGetUser,
        },
      } as any);

      const mockTenant = {
        id: 't-1',
        slug: 'sunshade',
        name: 'SunShade Digital Canopy',
      };

      vi.mocked(supabaseAdmin.from).mockReturnValue({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                limit: vi.fn().mockReturnValue({
                  maybeSingle: vi.fn().mockResolvedValue({
                    data: { role: 'member', tenants: mockTenant },
                    error: null,
                  }),
                }),
              }),
            }),
          }),
        }),
      } as any);

      const postReq = new NextRequest('http://localhost:3000/api/v1/items', {
        method: 'POST',
        headers: { 'x-tenant-slug': 'sunshade' },
      });

      const result = await authenticateSession(postReq);

      expect(mockGetUser).toHaveBeenCalledTimes(1);
      expect(mockGetClaims).not.toHaveBeenCalled();
      expect(result.context?.userId).toBe('mutating-user-2');
    });
  });
});
