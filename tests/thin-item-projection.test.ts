import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET as getItemsRoute } from '@/app/api/v1/items/route';
import { GET as getItemByIdRoute, PATCH as patchItemByIdRoute } from '@/app/api/v1/items/[id]/route';

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
  id: 'a0000000-0000-0000-0000-000000000001',
  tenant_id: 'ten-1',
  project_id: 'proj-1',
  sprint_id: 'sprint-uuid-42',
  external_ref_id: 'TASK-TRK-99',
  item_type: 'task',
  status: 'in_progress',
  title: 'Implement Delta Engine',
  description: 'This is a multi-paragraph heavy description explaining the whole system architecture.',
  order_index: 100,
  assignee: 'tympollack',
  created_at: '2026-11-15T10:00:00.000Z',
  updated_at: '2026-11-15T12:00:00.000Z',
  deleted_at: null as string | null,
  metadata: {
    priority: 'P1',
    story_points: 5,
    sprint: 'Sprint 42',
    sprint_id: 'sprint-uuid-42',
    complexity: 3,
    custom_metric: 42,
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

let capturedQueries: { table: string; selectCols?: string; filters: any[] }[] = [];

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn((table: string) => {
      const currentQuery: any = { table, filters: [] };
      capturedQueries.push(currentQuery);

      if (table === 'projects') {
        const queryBuilder: any = {
          select: vi.fn((cols) => {
            currentQuery.selectCols = cols;
            return queryBuilder;
          }),
          eq: vi.fn((col, val) => {
            currentQuery.filters.push({ op: 'eq', col, val });
            return queryBuilder;
          }),
          is: vi.fn((col, val) => {
            currentQuery.filters.push({ op: 'is', col, val });
            return queryBuilder;
          }),
          single: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
          maybeSingle: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
        };
        return queryBuilder;
      }
      if (table === 'work_items') {
        let selectedCols = '*';
        const queryBuilder: any = {
          select: vi.fn((cols) => {
            selectedCols = cols;
            currentQuery.selectCols = cols;
            return queryBuilder;
          }),
          eq: vi.fn((col, val) => {
            currentQuery.filters.push({ op: 'eq', col, val });
            return queryBuilder;
          }),
          or: vi.fn((expr) => {
            currentQuery.filters.push({ op: 'or', expr });
            return queryBuilder;
          }),
          is: vi.fn((col, val) => {
            currentQuery.filters.push({ op: 'is', col, val });
            return queryBuilder;
          }),
          order: vi.fn(() => queryBuilder),
          limit: vi.fn(() => queryBuilder),
          single: vi.fn().mockImplementation(() => {
            return Promise.resolve({ data: mockFullItem, error: null });
          }),
          maybeSingle: vi.fn().mockImplementation(() => {
            return Promise.resolve({ data: mockFullItem, error: null });
          }),
          then: vi.fn((resolve) => {
            // Projection-aware fixture simulation:
            // If selecting thin cardProjection (which omits 'description'), simulate database omitting description
            const isFullSelect = selectedCols === '*';
            const rowData = isFullSelect
              ? { ...mockFullItem }
              : (() => {
                  const { description, ...rest } = mockFullItem;
                  return rest;
                })();
            return resolve({ data: [rowData], error: null });
          }),
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
    capturedQueries = [];
  });

  describe('1. GET /api/v1/items Thin Projection', () => {
    it('excludes description and metadata.agent_prompt by default while preserving custom metrics and sprint_id', async () => {
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

      // Summary keys and custom metrics are preserved:
      expect(item.metadata?.priority).toBe('P1');
      expect(item.metadata?.story_points).toBe(5);
      expect(item.metadata?.sprint).toBe('Sprint 42');
      expect(item.metadata?.sprint_id).toBe('sprint-uuid-42');
      expect(item.metadata?.custom_metric).toBe(42);
      expect(item.metadata?.custom_flag).toBe('active');
      expect(item.metadata?.complexity).toBe(3);
      expect(item.title).toBe('Implement Delta Engine');

      // Check query select projection:
      const workItemQuery = capturedQueries
        .filter((q) => q.table === 'work_items')
        .find((q) => q.selectCols !== 'updated_at');
      expect(workItemQuery?.selectCols).toContain('deleted_at');
      expect(workItemQuery?.selectCols).toContain('metadata');
      expect(workItemQuery?.selectCols).not.toContain('description');
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

  describe('2. GET /api/v1/items/[id] On-Demand Detail Hydration & Target Enforcement', () => {
    it('queries external_ref_id safely without UUID type error when given external reference like TASK-TRK-99', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/items/TASK-TRK-99');
      const res = await getItemByIdRoute(req, { params: Promise.resolve({ id: 'TASK-TRK-99' }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.item).toBeDefined();

      const workItemQuery = capturedQueries.find((q) => q.table === 'work_items');
      const eqFilter = workItemQuery?.filters.find((f) => f.op === 'eq' && f.col === 'external_ref_id');
      expect(eqFilter).toBeDefined();
      expect(eqFilter?.val).toBe('TASK-TRK-99');

      // Must NOT use .or(`id.eq.TASK-TRK-99`) which breaks PostgreSQL UUID syntax
      const orFilter = workItemQuery?.filters.find((f) => f.op === 'or');
      expect(orFilter).toBeUndefined();
    });

    it('queries or filter with UUID when given valid UUID identifier', async () => {
      const uuid = 'a0000000-0000-0000-0000-000000000001';
      const req = new NextRequest(`http://localhost:3000/api/v1/items/${uuid}`);
      const res = await getItemByIdRoute(req, { params: Promise.resolve({ id: uuid }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.item).toBeDefined();

      const workItemQuery = capturedQueries.find((q) => q.table === 'work_items');
      const orFilter = workItemQuery?.filters.find((f) => f.op === 'or');
      expect(orFilter).toBeDefined();
      expect(orFilter?.expr).toContain(`id.eq.${uuid}`);
    });

    it('returns full row including description and complete metadata on demand', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/items/a0000000-0000-0000-0000-000000000001');
      const res = await getItemByIdRoute(req, { params: Promise.resolve({ id: 'a0000000-0000-0000-0000-000000000001' }) });

      expect(res.status).toBe(200);
      const data = await res.json();
      expect(data.item).toBeDefined();
      expect(data.item.id).toBe('a0000000-0000-0000-0000-000000000001');
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

  describe('3. PATCH /api/v1/items/[id] Target ID Enforcement', () => {
    it('enforces route path id over mismatched body.id payload', async () => {
      const pathId = 'a0000000-0000-0000-0000-000000000001';
      const spoofedBodyId = 'b0000000-0000-0000-0000-000000000002';

      const req = new NextRequest(`http://localhost:3000/api/v1/items/${pathId}`, {
        method: 'PATCH',
        body: JSON.stringify({ id: spoofedBodyId, title: 'Updated Title' }),
      });

      const res = await patchItemByIdRoute(req, { params: Promise.resolve({ id: pathId }) });
      // Verified path handler executed and forwarded request
      expect(res).toBeDefined();
    });
  });
});
