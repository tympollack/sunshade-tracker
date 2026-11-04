import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  computeInFlightTelemetry,
  getInFlightTelemetry,
  resolveItemWorkUnits,
  calculateMedian,
  detectSystemicBlocker,
} from '@/lib/services/inFlightTelemetryService';
import { ProjectSettings, WorkItem } from '@/types/tracker';

const mockFrom = vi.fn();
vi.mock('@/lib/db', () => ({
  supabaseAdmin: {
    from: (...args: any[]) => mockFrom(...args),
  },
}));

const ENG_PROJECT_SETTINGS: ProjectSettings = {
  schema_version: '1.0',
  wip_limit: 5,
  work_unit_field: 'story_points',
  work_metric_config: { field_key: 'story_points', label: 'Story Points', unit_label: 'pts' },
  hierarchy: [{ type: 'task', label: 'Task', level: 1, allowed_parents: [] }],
  statuses: [
    { id: 'backlog', label: 'Backlog', color: '#94a3b8', order: 1, lifecycle_category: 'unstarted' },
    { id: 'coding', label: 'Coding', color: '#38bdf8', order: 2, lifecycle_category: 'execution' },
    { id: 'review', label: 'Code Review', color: '#f59e0b', order: 3, lifecycle_category: 'verification' },
    { id: 'staging', label: 'Staging', color: '#a855f7', order: 4, lifecycle_category: 'staging' },
    { id: 'done', label: 'Done', color: '#22c55e', order: 5, lifecycle_category: 'terminal', is_completed: true },
  ],
  custom_fields: [],
};

const EDITORIAL_PROJECT_SETTINGS: ProjectSettings = {
  schema_version: '1.0',
  wip_limit: 3,
  work_unit_field: 'target_words',
  work_metric_config: { field_key: 'target_words', label: 'Target Words', unit_label: 'words' },
  hierarchy: [{ type: 'article', label: 'Article', level: 1, allowed_parents: [] }],
  statuses: [
    { id: 'pitch', label: 'Pitch', color: '#94a3b8', order: 1, lifecycle_category: 'unstarted' },
    { id: 'drafting', label: 'Drafting', color: '#38bdf8', order: 2, lifecycle_category: 'execution' },
    { id: 'copy_edit', label: 'Copy Edit', color: '#f59e0b', order: 3, lifecycle_category: 'verification' },
    { id: 'published', label: 'Published', color: '#22c55e', order: 4, lifecycle_category: 'terminal', is_completed: true },
  ],
  custom_fields: ['target_words'],
};

function makeWorkItem(overrides: Partial<WorkItem>): WorkItem {
  return {
    id: overrides.id || 'item-1',
    tenant_id: 'tenant-1',
    project_id: overrides.project_id || 'proj-eng',
    external_ref_id: overrides.external_ref_id ?? 'REF-1',
    item_type: 'task',
    status: overrides.status || 'coding',
    title: overrides.title || 'Deliverable',
    order_index: 1000,
    assignee: overrides.assignee ?? 'Tymz',
    metadata: overrides.metadata || {},
    created_at: overrides.created_at || '2026-11-01T00:00:00.000Z',
    updated_at: overrides.updated_at || '2026-11-03T10:00:00.000Z',
    deleted_at: null,
  };
}

describe('Systemic Flow Telemetry & Blameless Health Aggregator (TASK-TRK-BLAMELESS-METRICS-SERVICE)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('dynamically resolves work units from project work_unit_field or defaults to 1', () => {
    expect(
      resolveItemWorkUnits({ metadata: { story_points: 5 } }, ENG_PROJECT_SETTINGS)
    ).toEqual({ units: 5, unitLabel: 'pts' });

    expect(
      resolveItemWorkUnits({ metadata: { target_words: 1200 } }, EDITORIAL_PROJECT_SETTINGS)
    ).toEqual({ units: 1200, unitLabel: 'words' });

    // Custom metric field should not borrow incompatible story_points values
    expect(
      resolveItemWorkUnits({ metadata: { story_points: 8 } }, EDITORIAL_PROJECT_SETTINGS)
    ).toEqual({ units: 1, unitLabel: 'words' });

    expect(resolveItemWorkUnits({ metadata: {} }, ENG_PROJECT_SETTINGS)).toEqual({
      units: 1,
      unitLabel: 'pts',
    });
  });

  it('computes median and detects systemic blockers accurately', () => {
    expect(calculateMedian([10, 30, 20])).toBe(20);
    expect(calculateMedian([10, 20, 30, 40])).toBe(25);
    expect(calculateMedian([])).toBe(0);

    expect(
      detectSystemicBlocker({ status: 'coding', metadata: { blocked: true, blocked_reason: 'Upstream API outage' } })
    ).toEqual({ blocked: true, reason: 'Upstream API outage' });

    expect(
      detectSystemicBlocker({ status: 'review', metadata: { ci_status: 'failed' } })
    ).toEqual({ blocked: true, reason: 'CI / Verification pipeline failure' });
  });

  it('computes WIP saturation, stage dwell radar (>1.5x median), bottleneck stage, and scope drift without personal blame', () => {
    const nowMs = Date.parse('2026-11-03T12:00:00.000Z');
    const items: WorkItem[] = [
      // Execution items (3 items: 2h, 2h, 10h dwell -> median = 2h; 10h > 1.5*2h -> flagged in radar)
      makeWorkItem({
        id: 'exec-1',
        external_ref_id: 'TRK-1',
        project_id: 'proj-eng',
        status: 'coding',
        updated_at: '2026-11-03T10:00:00.000Z', // 2h ago
        metadata: { story_points: 3 },
      }),
      makeWorkItem({
        id: 'exec-2',
        external_ref_id: 'TRK-2',
        project_id: 'proj-eng',
        status: 'coding',
        updated_at: '2026-11-03T10:00:00.000Z', // 2h ago
        metadata: { story_points: 5, is_late_inflow: true },
      }),
      makeWorkItem({
        id: 'exec-stalled',
        external_ref_id: 'TRK-3',
        project_id: 'proj-eng',
        status: 'coding',
        updated_at: '2026-11-03T02:00:00.000Z', // 10h ago (> 1.5 * 2h)
        metadata: { story_points: 8, blocked: true, blocked_reason: 'Waiting on schema migration' },
      }),
      // Verification item in editorial project with 1500 target_words
      makeWorkItem({
        id: 'verif-1',
        external_ref_id: 'EDIT-1',
        project_id: 'proj-edit',
        status: 'copy_edit',
        updated_at: '2026-11-03T11:00:00.000Z',
        metadata: { target_words: 1500 },
      }),
      // Completed item 3 hours ago
      makeWorkItem({
        id: 'done-recent',
        external_ref_id: 'TRK-4',
        project_id: 'proj-eng',
        status: 'done',
        updated_at: '2026-11-03T09:00:00.000Z',
        metadata: { story_points: 5, ejected_from_sprint: true },
      }),
    ];

    const payload = computeInFlightTelemetry({
      items,
      projects: [
        { id: 'proj-eng', slug: 'eng', name: 'Engineering', settings: ENG_PROJECT_SETTINGS },
        { id: 'proj-edit', slug: 'edit', name: 'Editorial', settings: EDITORIAL_PROJECT_SETTINGS },
      ],
      nowMs,
    });

    expect(payload.total_active_items).toBe(4);
    expect(payload.total_wip_capacity).toBe(8); // 5 + 3
    expect(payload.wip_saturation_ratio).toBe(0.5); // 4 / 8
    expect(payload.total_active_units).toBe(1516); // 3 + 5 + 8 + 1500
    // With mixed unit scales (pts vs words), bottleneck_stage normalizes by project WIP pressure (3/5 > 1/3)
    expect(payload.bottleneck_stage).toBe('execution');
    expect(payload.bottleneck_stage_units).toBe(16);

    // Stage dwell radar should flag exec-stalled with blameless label
    expect(payload.stage_dwell_radar).toHaveLength(1);
    expect(payload.stage_dwell_radar[0].item_id).toBe('exec-stalled');
    expect(payload.stage_dwell_radar[0].flag_label).toBe('System Queue Stall');
    expect(payload.stage_dwell_radar[0]).not.toHaveProperty('overdue_assignee');

    // Scope drift
    expect(payload.scope_drift).toEqual({
      added_units: 5,
      dropped_units: 5,
      net_change: 0,
    });

    // Blockers
    expect(payload.active_blockers).toHaveLength(1);
    expect(payload.active_blockers[0].reason).toBe('Waiting on schema migration');

    // Rolling 24h throughput
    expect(payload.rolling_24h_completed_items).toBe(1);
    expect(payload.rolling_24h_completed_units).toBe(5);
  });

  it('populates terminal stage column with recent completions when configured and ignores unrelated edits on old completed items', () => {
    const nowMs = Date.parse('2026-11-03T12:00:00.000Z');
    const items: WorkItem[] = [
      makeWorkItem({
        id: 'done-1h-ago',
        project_id: 'proj-eng',
        status: 'done',
        created_at: '2026-11-01T00:00:00.000Z',
        updated_at: '2026-11-03T11:00:00.000Z',
        metadata: { story_points: 3, completed_at: '2026-11-03T11:00:00.000Z' },
      }),
      makeWorkItem({
        id: 'done-last-week-edited-today',
        project_id: 'proj-eng',
        status: 'done',
        created_at: '2026-10-20T00:00:00.000Z',
        updated_at: '2026-11-03T11:30:00.000Z', // edited today without completed_at or recent transition
        metadata: { story_points: 8 },
      }),
    ];

    const stageEntryTimestamps = new Map<string, number>([
      ['done-1h-ago', Date.parse('2026-11-03T11:00:00.000Z')],
    ]);

    const payload = computeInFlightTelemetry({
      items,
      projects: [{ id: 'proj-eng', slug: 'eng', name: 'Engineering', settings: ENG_PROJECT_SETTINGS }],
      stageEntryTimestamps,
      liveDashboardSettings: {
        lifecycle_categories: [
          { key: 'execution', label: 'Execution', order: 1, color: '#38BDF8' },
          { key: 'terminal', label: 'Recently Completed', order: 2, color: '#22C55E' },
        ],
      },
      nowMs,
    });

    const terminalStage = payload.stages.find((s) => s.stage === 'terminal');
    expect(terminalStage?.item_count).toBe(1);
    expect(terminalStage?.items[0].id).toBe('done-1h-ago');
    expect(payload.rolling_24h_completed_items).toBe(1);
    expect(payload.rolling_24h_completed_units).toBe(3);
  });

  it('queries Supabase and rolls up multi-project telemetry via getInFlightTelemetry', async () => {
    const nowMs = Date.parse('2026-11-03T12:00:00.000Z');
    mockFrom.mockImplementation((table: string) => {
      if (table === 'tenants') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                maybeSingle: vi.fn().mockResolvedValue({
                  data: {
                    id: 'tenant-1',
                    slug: 'sunshade',
                    name: 'SunShade',
                    settings: {},
                    metadata: {},
                  },
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'projects') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      id: 'proj-eng',
                      slug: 'eng',
                      name: 'Engineering',
                      settings: ENG_PROJECT_SETTINGS,
                      order_index: 1,
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'work_items') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              is: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    makeWorkItem({
                      id: 'item-a',
                      project_id: 'proj-eng',
                      status: 'review',
                      metadata: { story_points: 5 },
                    }),
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === 'audit_logs') {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              in: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({
                  data: [
                    {
                      item_id: 'item-a',
                      changed_fields: { status: { before: 'coding', after: 'review' } },
                      created_at: '2026-11-03T08:00:00.000Z',
                    },
                  ],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      return {};
    });

    const res = await getInFlightTelemetry('sunshade', { nowMs });
    expect(res.total_active_items).toBe(1);
    expect(res.total_active_units).toBe(5);
    expect(res.bottleneck_stage).toBe('verification');
    expect(res.in_flight_items[0].dwell_hours).toBe(4);
  });
});
