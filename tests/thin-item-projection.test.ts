import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getItemsRoute } from '@/app/api/v1/items/route';
import { GET as getItemByIdRoute } from '@/app/api/v1/items/[id]/route';

vi.mock('@/lib/auth-guard', () => ({
  authenticate: vi.fn(async () => ({
    context: {
      user: { id: 'usr-1', email: 'test@sunshade.systems' },
      tenant: { id: 'ten-1', slug: 'sunshade', name: 'SunShade Systems' },
      role: 'admin',
    },
  })),
}));

const mockFullItem = {
  id: 'card-heavy-1',
  tenant_id: 'ten-1',
  project_id: 'proj-1',
  external_ref_id: 'TASK-TRK-99',
  item_type: 'task',
  status: 'in_progress',
  title: 'Implement Delta Engine',
  description: 'This is a multi-paragraph heavy description explaining the whole system architecture.',
  order_index: 100,
  assignee: 'tympollack',
  created_at: '2026-11-15T10:00:00.000Z',
  updated_at: '2026-11-15T12:00:00.000Z',
  metadata: {
    priority: 'P1',
    story_points: 5,
    sprint: 'Sprint 42',
    complexity: 3,
    agent_prompt: '### SYSTEM ROLE & OBJECTIVE\nYou are a Senior Distributed Systems Architect...',
    custom_flag: 'active',
  },
};

const mockProject = {
  id: 'proj-1',
  slug: 'sunshade-tracker',
  name: 'SunShade Tracker',
  tenant_id: 'ten-1',
  updated_at: '2026-11-15T10:00:00.000Z',
  settings: {
    statuses: [{ id: 'in_progress', label: 'In Progress' }],
  },
};

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      if (table === 'projects') {
        const queryBuilder: any = {
          select: vi.fn(() => queryBuilder),
          eq: vi.fn(() => queryBuilder),
          is: vi.fn(() => queryBuilder),
          single: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
        };
        return queryBuilder;
      }
      if (table === 'work_items') {
        const queryBuilder: any = {
          select: vi.fn(() => queryBuilder),
          eq: vi.fn(() => queryBuilder),
          or: vi.fn(() => queryBuilder),
          is: vi.fn(() => queryBuilder),
          order: vi.fn(() => queryBuilder),
          limit: vi.fn(() => queryBuilder),
          single: vi.fn().mockResolvedValue({ data: mockFullItem, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockFullItem, error: null }),
          then: vi.fn((resolve) => resolve({ data: [mockFullItem], error: null })),
        };
        return queryBuilder;
      }
      if (table === 'sprints') {
        const queryBuilder: any = {
          select: vi.fn(() => queryBuilder),
          eq: vi.fn(() => queryBuilder),
          or: vi.fn(() => queryBuilder),
          then: vi.fn((resolve) => resolve({ data: [], error: null })),
        };
        return queryBuilder;
      }
      return {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
      } as any;
    }),
  },
}));

describe('TASK-TRK-THIN-ITEM-PROJECTION: Thin Card Projection & Lazy Detail Hydration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. GET /api/v1/items Thin Projection', () => {
    it('excludes description and metadata.agent_prompt by default while preserving summary keys', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/items?project_slug=sunshade-tracker');
      const res = await getItemsRoute(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(Array.isArray(data.items)).toBe(true);
      expect(data.items).toHaveLength(1);

      const item = data.items[0];
      // Thin projection invariants:
      expect(item.description).toBeUndefined();
      expect(item.metadata?.agent_prompt).toBeUndefined();

      // Extracted summary keys preserved:
      expect(item.metadata?.priority).toBe('P1');
      expect(item.metadata?.story_points).toBe(5);
      expect(item.metadata?.sprint).toBe('Sprint 42');
      expect(item.metadata?.complexity).toBe(3);
      expect(item.title).toBe('Implement Delta Engine');
    });

    it('returns full row including description and agent_prompt when include_heavy=true', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/items?project_slug=sunshade-tracker&include_heavy=true'
      );
      const res = await getItemsRoute(req);

      expect(res.status).toBe(200);
      const data = await res.json();
      const item = data.items[0];

      expect(item.description).toBe(mockFullItem.description);
      expect(item.metadata?.agent_prompt).toBe(mockFullItem.metadata.agent_prompt);
    });
  });

  describe('2. GET /api/v1/items/[id] On-Demand Detail Hydration', () => {
    it('returns full row including description and complete metadata on demand', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/items/card-heavy-1');
      const res = await getItemByIdRoute(req, { params: Promise.resolve({ id: 'card-heavy-1' }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.item).toBeDefined();
      expect(data.item.id).toBe('card-heavy-1');
      expect(data.item.description).toBe(mockFullItem.description);
      expect(data.item.metadata?.agent_prompt).toBe(mockFullItem.metadata.agent_prompt);
      expect(data.item.metadata?.custom_flag).toBe('active');
    });

    it('returns 400 when item id parameter is missing', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/items/');
      const res = await getItemByIdRoute(req, { params: Promise.resolve({ id: '' }) });

      expect(res.status).toBe(400);
      const data = await res.json();
      expect(data.error).toBe('Item ID is required');
    });
  });
});
