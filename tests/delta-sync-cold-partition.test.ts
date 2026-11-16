import { describe, it, expect, beforeEach, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/v1/items/route';

vi.mock('@/lib/auth-guard', () => ({
  authenticate: vi.fn(async () => ({
    context: {
      user: { id: 'usr-1', email: 'test@sunshade.systems' },
      tenant: { id: 'ten-1', slug: 'sunshade', name: 'SunShade Systems' },
      role: 'admin',
    },
  })),
}));

const mockProject = {
  id: 'proj-1',
  slug: 'sunshade-tracker',
  name: 'SunShade Tracker',
  tenant_id: 'ten-1',
  updated_at: '2026-11-15T12:00:00.000Z',
  settings: {
    statuses: [
      { id: 'not_started', label: 'Not Started', order: 1 },
      { id: 'in_progress', label: 'In Progress', order: 2 },
      { id: 'complete', label: 'Complete', order: 3, is_completed: true },
    ],
  },
};

const NOW = Date.now();
const TEN_DAYS_AGO = new Date(NOW - 10 * 24 * 60 * 60 * 1000).toISOString();
const TWENTY_DAYS_AGO = new Date(NOW - 20 * 24 * 60 * 60 * 1000).toISOString();

const mockActiveTask = {
  id: 'item-active',
  tenant_id: 'ten-1',
  project_id: 'proj-1',
  title: 'Active Task',
  status: 'in_progress',
  order_index: 10,
  updated_at: TEN_DAYS_AGO,
};

const mockRecentCompleteTask = {
  id: 'item-recent-complete',
  tenant_id: 'ten-1',
  project_id: 'proj-1',
  title: 'Recent Complete Task',
  status: 'complete',
  order_index: 20,
  updated_at: TEN_DAYS_AGO, // 10 days old <= 14 days -> NOT cold
};

const mockOldCompleteTask = {
  id: 'item-old-complete',
  tenant_id: 'ten-1',
  project_id: 'proj-1',
  title: 'Historical Complete Task',
  status: 'complete',
  order_index: 30,
  updated_at: TWENTY_DAYS_AGO, // 20 days old > 14 days -> COLD
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
        let isTouchQuery = false;
        const queryBuilder: any = {
          select: vi.fn((fields: string) => {
            if (fields === 'updated_at') isTouchQuery = true;
            return queryBuilder;
          }),
          eq: vi.fn(() => queryBuilder),
          gt: vi.fn(() => queryBuilder),
          or: vi.fn(() => queryBuilder),
          is: vi.fn(() => queryBuilder),
          order: vi.fn(() => queryBuilder),
          limit: vi.fn(() => queryBuilder),
          single: vi.fn().mockResolvedValue({
            data: { updated_at: '2026-11-15T12:00:00.000Z' },
            error: null,
          }),
          maybeSingle: vi.fn().mockResolvedValue({
            data: { updated_at: '2026-11-15T12:00:00.000Z' },
            error: null,
          }),
          then: vi.fn((resolve) =>
            resolve({
              data: [mockActiveTask, mockRecentCompleteTask, mockOldCompleteTask],
              error: null,
            })
          ),
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

describe('TASK-TRK-DELTA-SYNC-COLD-PARTITION: HTTP 304 Delta Sync & 14-Day Cold Archive', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('1. HTTP 304 Revalidation', () => {
    it('returns HTTP 304 immediately with empty body when If-Modified-Since is current', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/items?project_slug=sunshade-tracker', {
        headers: {
          'if-modified-since': '2026-11-15T12:00:00.000Z',
        },
      });

      const res = await GET(req);
      expect(res.status).toBe(304);
      expect(await res.text()).toBe('');
      expect(res.headers.get('last-modified')).toBeDefined();
    });
  });

  describe('2. 14-Day Cold Archive Partitioning', () => {
    it('partitions completed items older than 14 days and returns cold_count', async () => {
      const req = new NextRequest('http://localhost:3000/api/v1/items?project_slug=sunshade-tracker');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();

      // mockActiveTask and mockRecentCompleteTask should be included
      // mockOldCompleteTask (>14 days) should be partitioned into cold_count
      expect(data.items).toHaveLength(2);
      expect(data.items.map((i: any) => i.id)).toContain('item-active');
      expect(data.items.map((i: any) => i.id)).toContain('item-recent-complete');
      expect(data.items.map((i: any) => i.id)).not.toContain('item-old-complete');
      expect(data.cold_count).toBe(1);
    });

    it('returns all completed items including historical cold items when include_archived=true', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/items?project_slug=sunshade-tracker&include_archived=true'
      );
      const res = await GET(req);

      expect(res.status).toBe(200);
      const data = await res.json();

      expect(data.items).toHaveLength(3);
      expect(data.items.map((i: any) => i.id)).toContain('item-old-complete');
      expect(data.cold_count).toBe(0);
    });
  });

  describe('3. Delta Cursor (?updated_since=)', () => {
    it('returns 304 if no items updated since cursor', async () => {
      const req = new NextRequest(
        'http://localhost:3000/api/v1/items?project_slug=sunshade-tracker&updated_since=2026-11-15T12:00:00.000Z'
      );
      const res = await GET(req);
      expect(res.status).toBe(304);
    });
  });
});
