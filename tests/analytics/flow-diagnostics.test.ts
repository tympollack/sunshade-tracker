import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { calculateItemDurations, generateCfdSeries } from '@/lib/analytics/flow-diagnostics';
import { GET as getCfdHandler } from '@/app/api/v1/projects/[projectId]/analytics/cfd/route';
import { supabaseAdmin } from '@/lib/db';
import * as authGuard from '@/lib/auth-guard';

vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: vi.fn(),
  },
}));

describe('TASK-TRK-FLOW-CFD-API: flow-diagnostics & CFD API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('calculateItemDurations', () => {
    it('calculates lead time and cycle time from status transition events', async () => {
      const mockItem = {
        id: 'item-101',
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-06T00:00:00.000Z',
        status: 'complete',
      };

      const mockEvents = [
        {
          event_type: 'status_transition',
          new_state: { status: 'in_progress' },
          occurred_at: '2026-10-02T00:00:00.000Z',
        },
        {
          event_type: 'status_transition',
          new_state: { status: 'complete' },
          occurred_at: '2026-10-06T00:00:00.000Z',
        },
      ];

      const metrics = await calculateItemDurations('item-101', {
        item: mockItem,
        events: mockEvents,
      });

      // Lead time: Oct 1 -> Oct 6 = 5 days
      expect(metrics.leadTimeDays).toBe(5);
      // Cycle time: Oct 2 -> Oct 6 = 4 days
      expect(metrics.cycleTimeDays).toBe(4);
    });

    it('returns null lead/cycle times for items not yet completed', async () => {
      const mockItem = {
        id: 'item-102',
        created_at: '2026-10-01T00:00:00.000Z',
        updated_at: '2026-10-03T00:00:00.000Z',
        status: 'in_progress',
      };

      const metrics = await calculateItemDurations('item-102', {
        item: mockItem,
        events: [],
      });

      expect(metrics.leadTimeDays).toBeNull();
      expect(metrics.cycleTimeDays).toBeNull();
    });
  });

  describe('generateCfdSeries', () => {
    it('creates daily buckets and enforces monotonic non-decreasing complete counts', () => {
      const mockItems = [
        { id: 'i1', created_at: '2026-10-01T00:00:00.000Z', status: 'complete' },
        { id: 'i2', created_at: '2026-10-02T00:00:00.000Z', status: 'in_progress' },
        { id: 'i3', created_at: '2026-10-02T00:00:00.000Z', status: 'unplanned', metadata: { is_unplanned: true } },
      ];

      const mockEvents = [
        {
          work_item_id: 'i1',
          event_type: 'status_transition',
          new_state: { status: 'complete' },
          occurred_at: '2026-10-02T12:00:00.000Z',
        },
      ];

      const series = generateCfdSeries(mockItems, mockEvents, '2026-10-01', '2026-10-03');
      expect(series.length).toBe(3);

      // Verify monotonically increasing complete counts
      for (let i = 1; i < series.length; i++) {
        expect(series[i].complete).toBeGreaterThanOrEqual(series[i - 1].complete);
      }
    });

    it('reconstructs initial item status from earliest transition previous_state rather than assuming current terminal status', () => {
      const mockItems = [
        { id: 'i1', created_at: '2026-10-01T00:00:00.000Z', status: 'complete' },
      ];

      // Item completed on Oct 3, previous_state was not_started
      const mockEvents = [
        {
          work_item_id: 'i1',
          event_type: 'status_transition',
          previous_state: { status: 'not_started' },
          new_state: { status: 'complete' },
          occurred_at: '2026-10-03T12:00:00.000Z',
        },
      ];

      const series = generateCfdSeries(mockItems, mockEvents, '2026-10-01', '2026-10-04');
      // On Oct 1 and Oct 2, item was not_started (0 complete)
      expect(series[0].complete).toBe(0);
      expect(series[0].not_started).toBe(1);
      expect(series[1].complete).toBe(0);
      expect(series[1].not_started).toBe(1);
      // On Oct 3 and Oct 4, item is complete (1 complete)
      expect(series[2].complete).toBe(1);
      expect(series[2].not_started).toBe(0);
      expect(series[3].complete).toBe(1);
      expect(series[3].not_started).toBe(0);
    });

    it('maintains strictly mutually exclusive status buckets when completed items are reopened', () => {
      const mockItems = [
        { id: 'i1', created_at: '2026-10-01T00:00:00.000Z', status: 'in_progress' },
      ];

      const mockEvents = [
        // Completed on Oct 2
        {
          work_item_id: 'i1',
          event_type: 'status_transition',
          previous_state: { status: 'in_progress' },
          new_state: { status: 'complete' },
          occurred_at: '2026-10-02T12:00:00.000Z',
        },
        // Reopened to in_progress on Oct 3
        {
          work_item_id: 'i1',
          event_type: 'status_transition',
          previous_state: { status: 'complete' },
          new_state: { status: 'in_progress' },
          occurred_at: '2026-10-03T12:00:00.000Z',
        },
      ];

      const series = generateCfdSeries(mockItems, mockEvents, '2026-10-01', '2026-10-03');
      // Oct 2: complete is 1, in_progress is 0
      expect(series[1].complete).toBe(1);
      expect(series[1].in_progress).toBe(0);
      // Oct 3: reopened! complete is 0, in_progress is 1. Total active is exactly 1 (no double-counting)
      expect(series[2].complete).toBe(0);
      expect(series[2].in_progress).toBe(1);
      const totalOct3 = series[2].unplanned + series[2].not_started + series[2].in_progress + series[2].in_review + series[2].complete;
      expect(totalOct3).toBe(1);
    });
  });

  describe('GET /api/v1/projects/[projectId]/analytics/cfd', () => {
    it('validates project and returns structured date series in < 300ms', async () => {
      vi.spyOn(authGuard, 'authenticate').mockResolvedValue({
        errorResponse: null as any,
        context: {
          tenant: { id: 't1', slug: 'demo-tenant' } as any,
          userId: 'u1',
          role: 'member',
        },
      });

      const mockProject = {
        id: 'proj-1',
        name: 'Tracker Demo',
        slug: 'tracker-demo',
        tenant_id: 't1',
      };

      (supabaseAdmin.from as any).mockImplementation((table: string) => {
        if (table === 'projects') {
          const queryBuilder: any = {
            eq: vi.fn().mockImplementation(() => queryBuilder),
            is: vi.fn().mockImplementation(() => queryBuilder),
            or: vi.fn().mockImplementation(() => queryBuilder),
            maybeSingle: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
          };
          return {
            select: vi.fn().mockReturnValue(queryBuilder),
          };
        }
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({
                  data: [
                    { id: 'item-1', status: 'complete', created_at: '2026-10-01T00:00:00.000Z', metadata: {} },
                  ],
                  error: null,
                }),
              }),
            }),
          };
        }
        if (table === 'sprint_events') {
          const eventBuilder: any = {
            eq: vi.fn().mockImplementation(() => eventBuilder),
            gte: vi.fn().mockImplementation(() => eventBuilder),
            lte: vi.fn().mockImplementation(() => eventBuilder),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
          return {
            select: vi.fn().mockReturnValue(eventBuilder),
          };
        }
        return { select: vi.fn().mockReturnValue({ data: [], error: null }) };
      });

      const startMs = performance.now();
      const req = new NextRequest('http://localhost:3000/api/v1/projects/proj-1/analytics/cfd?startDate=2026-10-01&endDate=2026-10-07');
      const res = await getCfdHandler(req, { params: Promise.resolve({ projectId: 'proj-1' }) });
      const elapsed = performance.now() - startMs;

      expect(elapsed).toBeLessThan(300);
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.project_id).toBe('proj-1');
      expect(body.series.length).toBe(7);
    });
  });
});
