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

    it('BUG-TRK-CFD-TELEMETRY-EMPTY-STATE-REGRESSION: reconstructs daily status from status-specific audit timestamps when transition logs are sparse', () => {
      const mockItems = [
        {
          id: 'i1',
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-10-28T14:00:00.000Z', // Title edit on Oct 28
          completed_at: '2026-10-25T14:00:00.000Z', // Completed on Oct 25
          status: 'complete',
        },
        {
          id: 'i2',
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-10-28T10:00:00.000Z',
          metadata: { started_at: '2026-10-20T10:00:00.000Z' },
          status: 'in_progress',
        },
      ];

      // Empty events array simulating sparse or missing transition logs
      const series = generateCfdSeries(mockItems, [], '2026-10-24', '2026-10-26');
      expect(series.length).toBe(3);

      // On Oct 24: i1 was not completed yet (prior to completed_at), i2 was started on Oct 20 -> in_progress
      const dayOct24 = series.find((s) => s.date === '2026-10-24');
      expect(dayOct24?.complete).toBe(0);
      expect(dayOct24?.not_started).toBe(1);
      expect(dayOct24?.in_progress).toBe(1);

      // On Oct 25: i1 was completed -> complete: 1, in_progress: 1, not_started: 0
      // Notice: subsequent title edit on Oct 28 does NOT erase the Oct 25 completion!
      const dayOct25 = series.find((s) => s.date === '2026-10-25');
      expect(dayOct25?.complete).toBe(1);
      expect(dayOct25?.in_progress).toBe(1);
      expect(dayOct25?.not_started).toBe(0);

      // On Oct 26: maintains complete: 1, in_progress: 1
      const dayOct26 = series.find((s) => s.date === '2026-10-26');
      expect(dayOct26?.complete).toBe(1);
      expect(dayOct26?.in_progress).toBe(1);
    });

    it('BUG-TRK-CFD-TELEMETRY-EMPTY-STATE-REGRESSION: does not erase completions when no status timestamp exists and non-status edits advance updated_at', () => {
      const mockItems = [
        {
          id: 'i-legacy',
          created_at: '2026-10-01T00:00:00.000Z',
          updated_at: '2026-10-20T12:00:00.000Z', // Title edit on Oct 20
          status: 'complete',
        },
      ];

      const series = generateCfdSeries(mockItems, [], '2026-10-05', '2026-10-10');
      // For legacy items without transition events or status timestamps, non-status edit on Oct 20
      // does not turn earlier days (Oct 5-10) into not_started
      for (const day of series) {
        expect(day.complete).toBe(1);
        expect(day.not_started).toBe(0);
      }
    });

    it('BUG-TRK-CFD-TELEMETRY-EMPTY-STATE-REGRESSION: counts completed unplanned work under complete layer', () => {
      const mockItems = [
        {
          id: 'i-unplanned-completed',
          created_at: '2026-10-01T00:00:00.000Z',
          status: 'completed',
          metadata: { is_unplanned: true },
        },
      ];

      const series = generateCfdSeries(mockItems, [], '2026-10-01', '2026-10-02');
      expect(series[0].complete).toBe(1);
      expect(series[0].unplanned).toBe(0);
    });

    it('BUG-TRK-CFD-TELEMETRY-EMPTY-STATE-REGRESSION: respects project custom status configurations', () => {
      const mockItems = [
        {
          id: 'i-qa',
          created_at: '2026-10-01T00:00:00.000Z',
          status: 'testing',
        },
      ];

      const projectSettingsWithTestingComplete = {
        statuses: [
          { id: 'not_started', is_completed: false },
          { id: 'in_progress', is_completed: false },
          { id: 'testing', is_completed: true },
        ],
      };

      const series = generateCfdSeries(mockItems, [], '2026-10-01', '2026-10-02', projectSettingsWithTestingComplete);
      // Because 'testing' is configured with is_completed: true, it maps to complete rather than fallback review
      expect(series[0].complete).toBe(1);
      expect(series[0].in_review).toBe(0);
    });

    it('PR-133: does not classify canonically complete status names as complete if project schema marks is_completed: false', () => {
      const mockItems = [
        {
          id: 'i-done-not-complete',
          created_at: '2026-10-01T00:00:00.000Z',
          status: 'done',
        },
      ];

      const projectSettingsWithDoneExcluded = {
        statuses: [
          { id: 'done', label: 'Done (Awaiting QA)', is_completed: false },
        ],
      };

      const series = generateCfdSeries(mockItems, [], '2026-10-01', '2026-10-02', projectSettingsWithDoneExcluded);
      // 'done' is explicitly is_completed: false, so it must NOT enter the complete layer
      expect(series[0].complete).toBe(0);
      expect(series[0].in_progress).toBe(1);
    });

    it('PR-134: classifies unstarted statuses marked with is_completed: false into not_started, not in_progress', () => {
      const mockItems = [
        {
          id: 'i-not-started',
          created_at: '2026-10-01T00:00:00.000Z',
          status: 'not_started',
        },
        {
          id: 'i-backlog',
          created_at: '2026-10-01T00:00:00.000Z',
          status: 'backlog',
        },
      ];

      const projectSettingsWithExplicitUncompleted = {
        statuses: [
          { id: 'not_started', label: 'Not Started', is_completed: false },
          { id: 'backlog', label: 'Backlog', is_completed: false },
        ],
      };

      const series = generateCfdSeries(mockItems, [], '2026-10-01', '2026-10-02', projectSettingsWithExplicitUncompleted);
      // Untouched work marked as is_completed: false should stay in not_started, NOT enter in_progress WIP
      expect(series[0].not_started).toBe(2);
      expect(series[0].in_progress).toBe(0);
      expect(series[0].complete).toBe(0);
    });

    it('PR-133: extracts and resolves completion rules nested under sprint_settings.metric_rules', () => {
      const mockItems = [
        {
          id: 'i-accepted',
          created_at: '2026-10-01T00:00:00.000Z',
          status: 'accepted',
        },
      ];

      const projectSettingsWithNestedRules = {
        sprint_settings: {
          metric_rules: {
            completed_statuses: ['accepted'],
          },
        },
      };

      const series = generateCfdSeries(mockItems, [], '2026-10-01', '2026-10-02', projectSettingsWithNestedRules);
      expect(series[0].complete).toBe(1);
      expect(series[0].not_started).toBe(0);
    });

    it('classifies in_review and review statuses into in_review layer even when metric_rules list in_review under in_progress_statuses', () => {
      const mockItems = [
        {
          id: 'i-review',
          created_at: '2026-10-01T00:00:00.000Z',
          status: 'in_review',
        },
        {
          id: 'i-qa',
          created_at: '2026-10-01T00:00:00.000Z',
          status: 'qa',
        },
        {
          id: 'i-dev',
          created_at: '2026-10-01T00:00:00.000Z',
          status: 'in_progress',
        },
      ];

      const defaultMetricRulesSettings = {
        statuses: [
          { id: 'not_started', label: 'Not Started', is_completed: false },
          { id: 'in_progress', label: 'In Progress', is_completed: false },
          { id: 'in_review', label: 'In Review', is_completed: false },
          { id: 'qa', label: 'QA', is_completed: false },
          { id: 'complete', label: 'Complete', is_completed: true },
        ],
        metric_rules: {
          in_progress_statuses: ['in_progress', 'doing', 'review', 'in_review', 'qa', 'testing'],
          completed_statuses: ['complete', 'done'],
        },
      };

      const series = generateCfdSeries(mockItems, [], '2026-10-01', '2026-10-02', defaultMetricRulesSettings);
      expect(series[0].in_review).toBe(2);
      expect(series[0].in_progress).toBe(1);
      expect(series[0].complete).toBe(0);
      expect(series[0].not_started).toBe(0);
    });

    it('respects explicit schema category in_progress over canonical review alias for testing status', () => {
      const mockItems = [
        {
          id: 'i-testing',
          created_at: '2026-10-01T00:00:00.000Z',
          status: 'testing',
        },
      ];

      const schemaWithTestingAsInProgress = {
        statuses: [
          { id: 'not_started', label: 'Not Started', category: 'not_started' },
          { id: 'testing', label: 'Testing / Automated Run', category: 'in_progress' },
          { id: 'complete', label: 'Complete', category: 'complete', is_completed: true },
        ],
        metric_rules: {
          in_progress_statuses: ['in_progress', 'doing', 'review', 'in_review', 'qa', 'testing'],
        },
      };

      const series = generateCfdSeries(mockItems, [], '2026-10-01', '2026-10-02', schemaWithTestingAsInProgress);
      expect(series[0].in_progress).toBe(1);
      expect(series[0].in_review).toBe(0);
    });

    it('respects custom metric_rules in_progress_statuses list when status matches review alias', () => {
      const mockItems = [
        {
          id: 'i-testing',
          created_at: '2026-10-01T00:00:00.000Z',
          status: 'testing',
        },
      ];

      const customMetricRulesSettings = {
        metric_rules: {
          in_progress_statuses: ['active', 'testing'],
        },
      };

      const series = generateCfdSeries(mockItems, [], '2026-10-01', '2026-10-02', customMetricRulesSettings);
      expect(series[0].in_progress).toBe(1);
      expect(series[0].in_review).toBe(0);
    });

    it('places uncategorized schema status in in_progress when custom metric_rules classify it as active work', () => {
      const mockItems = [
        {
          id: 'i-testing',
          created_at: '2026-10-01T00:00:00.000Z',
          status: 'testing',
        },
      ];

      const settings = {
        statuses: [
          { id: 'not_started', label: 'Not Started', is_completed: false },
          { id: 'testing', label: 'Testing', is_completed: false }, // no explicit category property
          { id: 'complete', label: 'Complete', is_completed: true },
        ],
        sprint_metrics: {
          in_progress_statuses: ['active', 'testing'],
        },
      };

      const series = generateCfdSeries(mockItems, [], '2026-10-01', '2026-10-02', settings);
      expect(series[0].in_progress).toBe(1);
      expect(series[0].in_review).toBe(0);
    });

    it('preserves historical in_review state before completion when reviewed_at timestamp is present', () => {
      const mockItems = [
        {
          id: 'i-finished',
          created_at: '2026-10-01T00:00:00.000Z',
          status: 'complete',
          metadata: {
            started_at: '2026-10-02T10:00:00.000Z',
            in_review_at: '2026-10-04T10:00:00.000Z',
            completed_at: '2026-10-06T10:00:00.000Z',
          },
        },
      ];

      const series = generateCfdSeries(mockItems, [], '2026-10-01', '2026-10-07');
      // Day 1: not started
      expect(series.find((s) => s.date === '2026-10-01')?.not_started).toBe(1);
      // Day 2-3: in progress
      expect(series.find((s) => s.date === '2026-10-03')?.in_progress).toBe(1);
      // Day 4-5: in review
      expect(series.find((s) => s.date === '2026-10-04')?.in_review).toBe(1);
      expect(series.find((s) => s.date === '2026-10-05')?.in_review).toBe(1);
      // Day 6-7: complete
      expect(series.find((s) => s.date === '2026-10-06')?.complete).toBe(1);
      expect(series.find((s) => s.date === '2026-10-07')?.complete).toBe(1);
    });

    it('BUG-TRK-CFD-TELEMETRY-EMPTY-STATE-REGRESSION: supports full sprint quarter window (10/01/2026 to 12/31/2026) without dropping dates', () => {
      const series = generateCfdSeries([], [], '2026-10-01', '2026-12-31');
      // October (31) + November (30) + December (31) = 92 days
      expect(series.length).toBe(92);
      expect(series[0].date).toBe('2026-10-01');
      expect(series[series.length - 1].date).toBe('2026-12-31');
    });

    it('FEAT-TRK-CFD-CUSTOM-STATUSES: accurately classifies custom editorial workflow statuses (Substack) into flow layers', () => {
      const substackSettings = {
        statuses: [
          { id: 'pitch_backlog', label: 'Pitch & Concepts', order: 1 },
          { id: 'outlining', label: 'Outlining & Research', order: 2 },
          { id: 'drafting', label: 'Drafting', order: 3 },
          { id: 'tone_audit', label: 'Peplink Tone Audit', order: 4 },
          { id: 'staged', label: 'Staged & Scheduled', order: 5 },
          { id: 'published', label: 'Published', order: 6 },
          { id: 'syndicated', label: 'Syndicated / Archived', order: 7 },
          { id: 'not_started', label: 'Not Started', order: 8 },
          { id: 'complete', label: 'Complete', order: 9 },
        ],
      };

      const mockItems = [
        { id: 'item-pitch', created_at: '2026-10-01T00:00:00.000Z', status: 'pitch_backlog' },
        { id: 'item-outline', created_at: '2026-10-01T00:00:00.000Z', status: 'outlining' },
        { id: 'item-draft', created_at: '2026-10-01T00:00:00.000Z', status: 'drafting' },
        { id: 'item-audit', created_at: '2026-10-01T00:00:00.000Z', status: 'tone_audit' },
        { id: 'item-staged', created_at: '2026-10-01T00:00:00.000Z', status: 'staged' },
        { id: 'item-published', created_at: '2026-10-01T00:00:00.000Z', status: 'published' },
        { id: 'item-syndicated', created_at: '2026-10-01T00:00:00.000Z', status: 'syndicated' },
        { id: 'item-not-started', created_at: '2026-10-01T00:00:00.000Z', status: 'not_started' },
        { id: 'item-complete', created_at: '2026-10-01T00:00:00.000Z', status: 'complete' },
      ];

      const series = generateCfdSeries(mockItems, [], '2026-10-01', '2026-10-02', substackSettings);
      const day = series[0];

      // not_started layer: pitch_backlog (1) + not_started (1) = 2
      expect(day.not_started).toBe(2);
      // in_progress layer: outlining (1) + drafting (1) = 2
      expect(day.in_progress).toBe(2);
      // in_review layer: tone_audit (1) + staged (1) = 2
      expect(day.in_review).toBe(2);
      // complete layer: published (1) + syndicated (1) + complete (1) = 3
      expect(day.complete).toBe(3);
      // unplanned: 0
      expect(day.unplanned).toBe(0);
      // Total items = 9
      expect(day.not_started + day.in_progress + day.in_review + day.complete).toBe(9);
    });

    it('FEAT-TRK-CFD-CUSTOM-STATUSES: includes custom intermediate workflow stages in active in_progress flow rather than not_started', () => {
      const customPipelineSettings = {
        statuses: [
          { id: 'inbox', label: 'Inbox', order: 1 },
          { id: 'phase_1', label: 'Discovery', order: 2 },
          { id: 'phase_2', label: 'Execution', order: 3 },
          { id: 'phase_3', label: 'Polishing', order: 4 },
          { id: 'shipped', label: 'Shipped', order: 5, is_completed: true },
        ],
      };

      const mockItems = [
        { id: 'i1', created_at: '2026-10-01T00:00:00.000Z', status: 'inbox' },
        { id: 'i2', created_at: '2026-10-01T00:00:00.000Z', status: 'phase_1' },
        { id: 'i3', created_at: '2026-10-01T00:00:00.000Z', status: 'phase_2' },
        { id: 'i4', created_at: '2026-10-01T00:00:00.000Z', status: 'phase_3' },
        { id: 'i5', created_at: '2026-10-01T00:00:00.000Z', status: 'shipped' },
      ];

      const series = generateCfdSeries(mockItems, [], '2026-10-01', '2026-10-02', customPipelineSettings);
      const day = series[0];

      expect(day.not_started).toBe(1); // inbox
      expect(day.in_progress).toBe(3); // phase_1, phase_2, phase_3
      expect(day.complete).toBe(1);    // shipped
    });

    it('FEAT-TRK-CFD-CUSTOM-STATUSES: computes lead and cycle durations for items progressing through custom workflow stages', async () => {
      const substackSettings = {
        statuses: [
          { id: 'pitch_backlog', label: 'Pitch & Concepts', order: 1 },
          { id: 'outlining', label: 'Outlining & Research', order: 2 },
          { id: 'published', label: 'Published', order: 3 },
        ],
      };

      const mockItem = {
        id: 'item-essay',
        created_at: '2026-10-01T00:00:00.000Z',
        status: 'published',
      };

      const mockEvents = [
        {
          event_type: 'status_transition',
          new_state: { status: 'outlining' },
          occurred_at: '2026-10-03T00:00:00.000Z',
        },
        {
          event_type: 'status_transition',
          new_state: { status: 'published' },
          occurred_at: '2026-10-06T00:00:00.000Z',
        },
      ];

      const metrics = await calculateItemDurations('item-essay', {
        item: mockItem,
        events: mockEvents,
        projectSettings: substackSettings,
      });

      // Lead time: Oct 1 -> Oct 6 = 5 days
      expect(metrics.leadTimeDays).toBe(5);
      // Cycle time: Oct 3 -> Oct 6 = 3 days
      expect(metrics.cycleTimeDays).toBe(3);
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

    it('BUG-TRK-CFD-TELEMETRY-EMPTY-STATE-REGRESSION: accepts full quarter date picker bounds (10/01/2026 to 12/31/2026, 92 days) without 400 rejection', async () => {
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
            maybeSingle: vi.fn().mockResolvedValue({ data: mockProject, error: null }),
          };
          return { select: vi.fn().mockReturnValue(queryBuilder) };
        }
        if (table === 'work_items') {
          return {
            select: vi.fn().mockReturnValue({
              eq: vi.fn().mockReturnValue({
                is: vi.fn().mockResolvedValue({ data: [], error: null }),
              }),
            }),
          };
        }
        if (table === 'sprint_events') {
          const eventBuilder: any = {
            eq: vi.fn().mockImplementation(() => eventBuilder),
            gte: vi.fn().mockImplementation(() => eventBuilder),
            order: vi.fn().mockResolvedValue({ data: [], error: null }),
          };
          return { select: vi.fn().mockReturnValue(eventBuilder) };
        }
        return { select: vi.fn().mockReturnValue({ data: [], error: null }) };
      });

      const req = new NextRequest(
        'http://localhost:3000/api/v1/projects/proj-1/analytics/cfd?startDate=2026-10-01&endDate=2026-12-31'
      );
      const res = await getCfdHandler(req, { params: Promise.resolve({ projectId: 'proj-1' }) });
      expect(res.status).toBe(200);

      const body = await res.json();
      expect(body.series.length).toBe(92);
    });
  });
});
