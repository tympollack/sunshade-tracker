import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/v1/telemetry/live/route';
import { DEFAULT_LIVE_DASHBOARD_SETTINGS } from '@/types/tracker';

const mockAuthenticate = vi.fn();
vi.mock('@/lib/auth-guard', () => ({
  authenticate: (...args: any[]) => mockAuthenticate(...args),
}));

const mockGetInFlightTelemetry = vi.fn();
vi.mock('@/lib/services/inFlightTelemetryService', () => ({
  getInFlightTelemetry: (...args: any[]) => mockGetInFlightTelemetry(...args),
}));

const mockFrom = vi.fn();
vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

const MOCK_TELEMETRY = {
  total_active_items: 2,
  total_active_units: 8,
  total_wip_capacity: 16,
  wip_saturation_ratio: 0.125,
  stage_dwell_radar: [],
  scope_drift: { added_units: 0, dropped_units: 0, net_change: 0 },
  bottleneck_stage: 'execution',
  bottleneck_stage_units: 8,
  rolling_24h_completed_units: 3,
  rolling_24h_completed_items: 1,
  active_blockers: [],
  stages: [],
  projects: [],
  in_flight_items: [
    {
      id: 'item-1',
      tenant_id: 'tenant-1',
      project_id: 'proj-1',
      external_ref_id: 'TRK-101',
      item_type: 'task',
      status: 'in_progress',
      title: 'Implement Delta Route',
      order_index: 1000,
      metadata: { story_points: 5 },
      created_at: '2026-11-01T00:00:00.000Z',
      updated_at: '2026-11-03T14:00:00.000Z',
      deleted_at: null,
      lifecycle_stage: 'execution',
      project_slug: 'trk',
      project_name: 'Tracker',
      status_label: 'In Progress',
      status_color: '#38bdf8',
      work_units: 5,
      unit_label: 'pts',
      dwell_ms: 7200000,
      dwell_hours: 2,
      is_stagnant: false,
      is_blocked: false,
    },
  ],
  live_dashboard_settings: DEFAULT_LIVE_DASHBOARD_SETTINGS,
  synced_at: '2026-11-03T15:00:00.000Z',
};

describe('GET /api/v1/telemetry/live (TASK-TRK-DELTA-POLL-ROUTE)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuthenticate.mockResolvedValue({
      context: {
        tenant: {
          id: 'tenant-1',
          slug: 'sunshade',
          name: 'SunShade',
          updated_at: '2026-11-01T00:00:00.000Z',
        },
        userId: 'user-1',
        role: 'owner',
      },
      errorResponse: null,
    });
  });

  it('returns 200 with full InFlightTelemetryPayload and Cache-Control headers on initial load', async () => {
    mockGetInFlightTelemetry.mockResolvedValue(MOCK_TELEMETRY);

    const req = new NextRequest('http://localhost:3000/api/v1/telemetry/live?view=stage_flow');
    const res = await GET(req);

    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('private, no-cache, stale-while-revalidate=30');
    expect(res.headers.get('etag')).toBeTruthy();

    const json = await res.json();
    expect(json.is_delta).toBe(false);
    expect(json.view).toBe('stage_flow');
    expect(json.telemetry.total_active_items).toBe(2);
    expect(json.delta_items).toHaveLength(1);
  });

  it('returns 304 Not Modified immediately when ?since is passed and zero items or projects mutated', async () => {
    mockFrom.mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({
          gt: vi.fn().mockReturnValue({
            order: vi.fn().mockReturnValue({
              limit: vi.fn().mockResolvedValue({ data: [], error: null }),
            }),
          }),
        }),
      }),
    });

    const req = new NextRequest(
      'http://localhost:3000/api/v1/telemetry/live?since=2026-11-03T15:00:00.000Z&view=project_swimlanes'
    );
    const res = await GET(req);

    expect(res.status).toBe(304);
    expect(res.headers.get('cache-control')).toBe('private, no-cache, stale-while-revalidate=30');
    expect(mockGetInFlightTelemetry).not.toHaveBeenCalled();
  });

  it('recomputes telemetry and returns delta_items when mutations occurred after ?since', async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === 'work_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              gt: vi.fn().mockReturnValue({
                order: vi.fn().mockReturnValue({
                  limit: vi.fn().mockResolvedValue({
                    data: [{ id: 'item-1', updated_at: '2026-11-03T14:00:00.000Z', deleted_at: null }],
                    error: null,
                  }),
                }),
                not: vi.fn().mockResolvedValue({
                  data: [{ id: 'deleted-item-99', deleted_at: '2026-11-03T14:30:00.000Z' }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({
            gt: vi.fn().mockReturnValue({
              order: vi.fn().mockReturnValue({
                limit: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          }),
        }),
      };
    });

    mockGetInFlightTelemetry.mockResolvedValue(MOCK_TELEMETRY);

    const req = new NextRequest(
      'http://localhost:3000/api/v1/telemetry/live?since=2026-11-03T12:00:00.000Z&view=stage_flow'
    );
    const res = await GET(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.is_delta).toBe(true);
    expect(body.delta_items).toHaveLength(1);
    expect(body.deleted_ids).toEqual(['deleted-item-99']);
  });
});
