import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/v1/projects/reorder/route';

// Mock DB and Auth
vi.mock('@/lib/auth-guard', () => ({
  authenticate: vi.fn(),
}));

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('FEAT-TRK-PROJECT-MODAL-REORDER: Projects Reordering API & Logic', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('rejects empty or invalid reorder payloads with 400', async () => {
    const { authenticate } = await import('@/lib/auth-guard');
    (authenticate as any).mockResolvedValue({
      context: {
        tenant: { id: 'tenant-123', slug: 'sunshade', name: 'SunShade' },
        user: { id: 'user-1' },
        role: 'owner',
      },
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects/reorder', {
      method: 'POST',
      body: JSON.stringify({ items: [] }),
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain('non-empty array');
  });

  it('persists project order indices and returns updated count', async () => {
    const { authenticate } = await import('@/lib/auth-guard');
    const { supabaseAdmin } = await import('@/lib/db');

    (authenticate as any).mockResolvedValue({
      context: {
        tenant: { id: 'tenant-123', slug: 'sunshade', name: 'SunShade' },
        user: { id: 'user-1' },
        role: 'owner',
      },
    });

    // Mock supabaseAdmin queries
    const mockSelect = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          single: vi.fn().mockResolvedValue({
            data: { id: 'proj-1', settings: {} },
            error: null,
          }),
        }),
      }),
    });

    const mockUpdate = vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        eq: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
      }),
    });

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'projects') {
        return {
          select: mockSelect,
          update: mockUpdate,
        };
      }
      return {};
    });

    const req = new NextRequest('http://localhost:3000/api/v1/projects/reorder', {
      method: 'POST',
      body: JSON.stringify({
        items: [
          { project_id: 'proj-1', order_index: 1000 },
          { project_id: 'proj-2', order_index: 2000 },
        ],
      }),
    });

    const res = await POST(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.updated_count).toBe(2);
  });
});
