import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { getTenantEfficiencyMetrics } from '@/lib/services/valueLedgerServer';
import { GET as getEfficiencyRouteHandler } from '@/app/api/v1/tenants/efficiency/route';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

vi.mock('@/lib/auth-guard', () => ({
  authenticate: vi.fn(),
}));

describe('Value Ledger Server Aggregator & API Route', () => {
  const mockTenant = {
    id: 'tenant-001',
    name: 'Pym Energy',
    slug: 'pym-energy',
    tier: 'Enterprise',
    created_at: '2026-01-01T00:00:00.000Z',
  };

  const mockProject1 = {
    id: 'proj-001',
    slug: 'grid-control',
    name: 'Grid Control',
    settings: {
      statuses: [
        { id: 'todo', label: 'To Do' },
        { id: 'in_dev', label: 'In Dev' },
        { id: 'done', label: 'Done' }, // custom terminal status 'done'
      ],
    },
  };

  const mockProject2 = {
    id: 'proj-002',
    slug: 'empty-project',
    name: 'Empty Project',
    settings: {
      statuses: [{ id: 'not_started', label: 'Not Started' }, { id: 'complete', label: 'Complete' }],
    },
  };

  const now = new Date();
  const currentMonthItemDate = new Date(now.getTime() - 86400000).toISOString();
  const oldMonthItemDate = new Date(now.getFullYear(), now.getMonth() - 2, 10).toISOString();

  const mockItems = [
    {
      id: 'item-1',
      project_id: 'proj-001',
      status: 'done', // matches custom project completion status
      updated_at: currentMonthItemDate,
      created_at: currentMonthItemDate,
    },
    {
      id: 'item-2',
      project_id: 'proj-001',
      status: 'complete',
      updated_at: oldMonthItemDate, // completed in earlier month
      created_at: oldMonthItemDate,
    },
    {
      id: 'item-3',
      project_id: 'proj-001',
      status: 'in_dev',
      updated_at: currentMonthItemDate,
      created_at: currentMonthItemDate,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('aggregates metrics with custom project completion statuses and active projects correctly', async () => {
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({ data: mockTenant, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              is: () => Promise.resolve({ data: [mockProject1, mockProject2], error: null }),
            }),
          }),
        };
      }
      if (table === 'work_items') {
        return {
          select: () => ({
            eq: () => ({
              is: () => Promise.resolve({ data: mockItems, error: null }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ is: () => Promise.resolve({ data: [], error: null }) }) }) };
    });

    // In monthly mode (default), only item-1 completed in current month should count
    const monthlyResult = await getTenantEfficiencyMetrics('pym-energy', { period: 'monthly' });
    expect(monthlyResult.tenant.slug).toBe('pym-energy');
    expect(monthlyResult.kpis.completedItemsCount).toBe(1); // item-1 ('done' in current month)
    // Only proj-001 has items, proj-002 is empty so activeProjectsCount is 1
    expect(monthlyResult.kpis.activeProjectsCount).toBe(1);
    expect(monthlyResult.kpis.totalItemsCount).toBe(3);

    // In all-time mode, both item-1 ('done') and item-2 ('complete') should count
    const allTimeResult = await getTenantEfficiencyMetrics('pym-energy', { period: 'all-time' });
    expect(allTimeResult.kpis.completedItemsCount).toBe(2);
    expect(allTimeResult.kpis.activeProjectsCount).toBe(1);
  });

  it('propagates database errors instead of producing erroneous zero statements', async () => {
    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({ data: mockTenant, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              is: () => Promise.resolve({ data: null, error: { message: 'Connection pool exhausted' } }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ is: () => Promise.resolve({ data: [], error: null }) }) }) };
    });

    await expect(getTenantEfficiencyMetrics('pym-energy')).rejects.toThrow(
      'Failed to load projects for workspace: Connection pool exhausted'
    );
  });

  it('API route enforces strict workspace boundary isolation and blocks cross-tenant access', async () => {
    (authenticate as any).mockResolvedValue({
      context: {
        tenant: { id: 'tenant-001', slug: 'pym-energy' },
        userId: 'user-1',
        role: 'owner', // even if owner of pym-energy, cannot view competitor-corp
      },
      errorResponse: null,
    });

    const req = new NextRequest('http://localhost:3000/api/v1/tenants/efficiency?tenant_slug=competitor-corp');
    const res = await getEfficiencyRouteHandler(req);

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toContain('Unauthorized');
  });

  it('API route returns CSV attachment when format=csv is requested', async () => {
    (authenticate as any).mockResolvedValue({
      context: {
        tenant: { id: 'tenant-001', slug: 'pym-energy' },
        userId: 'user-1',
        role: 'member',
      },
      errorResponse: null,
    });

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({ data: mockTenant, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              is: () => Promise.resolve({ data: [mockProject1], error: null }),
            }),
          }),
        };
      }
      if (table === 'work_items') {
        return {
          select: () => ({
            eq: () => ({
              is: () => Promise.resolve({ data: [mockItems[0]], error: null }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ is: () => Promise.resolve({ data: [], error: null }) }) }) };
    });

    const req = new NextRequest('http://localhost:3000/api/v1/tenants/efficiency?format=csv');
    const res = await getEfficiencyRouteHandler(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('Content-Type')).toContain('text/csv');
    expect(res.headers.get('Content-Disposition')).toContain('efficiency-statement-pym-energy.csv');
    const text = await res.text();
    expect(text).toContain('Operational Yield & Efficiency Statement');
  });

  it('derives completion time from audit trail transition rather than general updated_at', async () => {
    // Item was created 3 months ago, marked done 2 months ago (in audit log), but updated today (e.g. title edited)
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).toISOString();
    const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 2, 15).toISOString();
    const today = now.toISOString();

    const editedCompletedItem = {
      id: 'item-audit-test',
      project_id: 'proj-001',
      status: 'done',
      created_at: threeMonthsAgo,
      updated_at: today, // recently updated!
    };

    const mockAuditLog = {
      item_id: 'item-audit-test',
      changed_fields: {
        status: { before: 'in_dev', after: 'done' },
      },
      created_at: twoMonthsAgo, // actual completion timestamp
    };

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({ data: mockTenant, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              is: () => Promise.resolve({ data: [mockProject1], error: null }),
            }),
          }),
        };
      }
      if (table === 'work_items') {
        return {
          select: () => ({
            eq: () => ({
              is: () => Promise.resolve({ data: [editedCompletedItem], error: null }),
            }),
          }),
        };
      }
      if (table === 'audit_logs') {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: () => Promise.resolve({ data: [mockAuditLog], error: null }),
              }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ is: () => Promise.resolve({ data: [], error: null }) }) }) };
    });

    // In current month (default), this item should NOT be counted even though updated_at is today!
    const currentMonthResult = await getTenantEfficiencyMetrics('pym-energy', { period: 'monthly' });
    expect(currentMonthResult.kpis.completedItemsCount).toBe(0);

    // If querying the window for two months ago, it SHOULD be counted based on its audit log transition
    const twoMonthsStart = new Date(now.getFullYear(), now.getMonth() - 2, 1).toISOString();
    const twoMonthsEnd = new Date(now.getFullYear(), now.getMonth() - 2 + 1, 0, 23, 59, 59, 999).toISOString();
    const pastMonthResult = await getTenantEfficiencyMetrics('pym-energy', {
      startDate: twoMonthsStart,
      endDate: twoMonthsEnd,
    });
    expect(pastMonthResult.kpis.completedItemsCount).toBe(1);
  });

  it('enforces explicit startDate and endDate bounds even when period=all-time', async () => {
    const itemJan = {
      id: 'item-jan',
      project_id: 'proj-001',
      status: 'done',
      created_at: '2026-01-15T12:00:00.000Z',
      updated_at: '2026-01-15T12:00:00.000Z',
    };
    const itemMarch = {
      id: 'item-mar',
      project_id: 'proj-001',
      status: 'done',
      created_at: '2026-03-15T12:00:00.000Z',
      updated_at: '2026-03-15T12:00:00.000Z',
    };

    (supabaseAdmin.from as any).mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: () => ({
            eq: () => ({
              is: () => ({
                maybeSingle: async () => ({ data: mockTenant, error: null }),
              }),
            }),
          }),
        };
      }
      if (table === 'projects') {
        return {
          select: () => ({
            eq: () => ({
              is: () => Promise.resolve({ data: [mockProject1], error: null }),
            }),
          }),
        };
      }
      if (table === 'work_items') {
        return {
          select: () => ({
            eq: () => ({
              is: () => Promise.resolve({ data: [itemJan, itemMarch], error: null }),
            }),
          }),
        };
      }
      return { select: () => ({ eq: () => ({ in: () => ({ order: () => Promise.resolve({ data: [], error: null }) }) }) }) };
    });

    // Bound all-time to only February to April
    const boundedResult = await getTenantEfficiencyMetrics('pym-energy', {
      period: 'all-time',
      startDate: '2026-02-01T00:00:00.000Z',
      endDate: '2026-03-31T23:59:59.999Z',
    });

    // itemJan is excluded, only itemMarch is included
    expect(boundedResult.kpis.completedItemsCount).toBe(1);
    expect(boundedResult.dateRange.startDate).toBe('2026-02-01T00:00:00.000Z');
    expect(boundedResult.dateRange.endDate).toBe('2026-03-31T23:59:59.999Z');
  });
});
