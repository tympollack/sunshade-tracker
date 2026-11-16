import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { reconcileSprintMetadata } from '@/lib/bulk-items';
import { TrackerApiClient } from '@/mcp/api-client';
import { computePeriodScopedTelemetry } from '@/lib/services/sprintAnalyticsService';
import {
  getProjectCache,
  setProjectCache,
  clearProjectCache,
  syncOptimisticMutationToCache,
  syncOptimisticCreationToCache,
  updateProjectCacheItems,
  DEFAULT_PROJECT_SETTINGS,
} from '@/context/ProjectDataContext';
import { WorkItemCard } from '@/types/tracker';

describe('PR 159 Staging Review Fixes', () => {
  describe('1. Prompt retention in sprint metadata reconciliation (src/lib/bulk-items.ts)', () => {
    it('preserves existing agent_prompt during full replacement when incoming metadata omits it', () => {
      const existingMeta = {
        priority: 'P1',
        story_points: 5,
        agent_prompt: {
          prompt: 'System prompt instructions for worker agent',
          context: ['file1.ts'],
        },
      };

      const incomingMeta = {
        priority: 'P2',
        story_points: 8,
        sprint_id: 'a0000000-0000-0000-0000-000000000123',
      };

      const reconciled = reconcileSprintMetadata(
        existingMeta,
        incomingMeta,
        undefined,
        { fullReplacement: true }
      );

      expect(reconciled.priority).toBe('P2');
      expect(reconciled.story_points).toBe(8);
      expect(reconciled.sprint_id).toBe('a0000000-0000-0000-0000-000000000123');
      // agent_prompt must be preserved!
      expect(reconciled.agent_prompt).toEqual(existingMeta.agent_prompt);
    });

    it('overwrites agent_prompt when incoming metadata explicitly provides a new prompt', () => {
      const existingMeta = {
        agent_prompt: { prompt: 'Old prompt' },
      };

      const incomingMeta = {
        agent_prompt: { prompt: 'New prompt' },
      };

      const reconciled = reconcileSprintMetadata(
        existingMeta,
        incomingMeta,
        undefined,
        { fullReplacement: true }
      );

      expect(reconciled.agent_prompt).toEqual({ prompt: 'New prompt' });
    });

    it('allows explicitly nullifying agent_prompt when incoming metadata passes null', () => {
      const existingMeta = {
        agent_prompt: { prompt: 'Old prompt' },
      };

      const incomingMeta = {
        agent_prompt: null,
      };

      const reconciled = reconcileSprintMetadata(
        existingMeta,
        incomingMeta,
        undefined,
        { fullReplacement: true }
      );

      expect(reconciled.agent_prompt).toBeNull();
    });

    it('preserves agent_prompt in partial update mode (fullReplacement = false)', () => {
      const existingMeta = {
        priority: 'P1',
        agent_prompt: 'Keep this prompt',
      };

      const incomingMeta = {
        priority: 'P0',
        sprint_id: 'a0000000-0000-0000-0000-000000000456',
      };

      const reconciled = reconcileSprintMetadata(
        existingMeta,
        incomingMeta,
        undefined,
        { fullReplacement: false }
      );

      expect(reconciled.priority).toBe('P0');
      expect(reconciled.agent_prompt).toBe('Keep this prompt');
      expect(reconciled.sprint_id).toBe('a0000000-0000-0000-0000-000000000456');
    });
  });

  describe('2. MCP resolveItem queries /api/v1/items/:idOrRef first with heavy item support (src/mcp/api-client.ts)', () => {
    const originalFetch = global.fetch;

    afterEach(() => {
      global.fetch = originalFetch;
    });

    it('fetches full item directly from /api/v1/items/:idOrRef when available', async () => {
      const mockFullItem = {
        id: 'item-uuid-1',
        external_ref_id: 'TASK-101',
        title: 'Important Task',
        description: 'Complete heavy description',
        metadata: {
          agent_prompt: 'Run story instructions',
        },
      };

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/api/v1/items/TASK-101')) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ item: mockFullItem }),
            json: async () => ({ item: mockFullItem }),
          };
        }
        return { ok: false, status: 404, text: async () => JSON.stringify({}), json: async () => ({}) };
      });

      global.fetch = fetchMock;

      const client = new TrackerApiClient({
        apiKey: 'tk_test_1234567890123456',
        baseUrl: 'https://track.sunshade.icu',
        tenantSlug: 'acme-corp',
      });

      const item = await client.resolveItem('TASK-101');
      expect(item).toEqual(mockFullItem);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/api/v1/items/TASK-101?tenant_slug=acme-corp'),
        expect.any(Object)
      );
    });

    it('falls back to /api/v1/items?include_heavy=true if direct detail route returns 404', async () => {
      const mockListItems = [
        {
          id: 'item-uuid-2',
          external_ref_id: 'TASK-202',
          title: 'Fallback Task',
          description: 'Loaded via heavy list fallback',
        },
      ];

      const fetchMock = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes('/api/v1/items/TASK-202')) {
          return { ok: false, status: 404, text: async () => JSON.stringify({}), json: async () => ({}) };
        }
        if (url.includes('include_heavy=true')) {
          return {
            ok: true,
            status: 200,
            text: async () => JSON.stringify({ items: mockListItems }),
            json: async () => ({ items: mockListItems }),
          };
        }
        return { ok: false, status: 404, text: async () => JSON.stringify({}), json: async () => ({}) };
      });

      global.fetch = fetchMock;

      const client = new TrackerApiClient({
        apiKey: 'tk_test_1234567890123456',
        baseUrl: 'https://track.sunshade.icu',
        tenantSlug: 'acme-corp',
      });

      const item = await client.resolveItem('TASK-202');
      expect(item).toEqual(mockListItems[0]);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('include_heavy=true'),
        expect.any(Object)
      );
    });
  });

  describe('3. Sprint analytics terminal status transitions (src/lib/services/sprintAnalyticsService.ts)', () => {
    it('does not inflate delivered points when transitioning between two terminal/completed statuses', () => {
      const events = [
        {
          id: 'ev-1',
          event_type: 'status_transition',
          occurred_at: '2026-11-10T12:00:00Z',
          work_item_id: 'item-1',
          previous_state: { status: 'done' },
          new_state: { status: 'closed' },
          points_delta: 5,
        },
      ];

      const telemetry = computePeriodScopedTelemetry({
        committedPoints: 10,
        startDate: '2026-11-01',
        endDate: '2026-11-15',
        events,
        items: [{ id: 'item-1', status: 'closed', metadata: { story_points: 5 } } as any],
      });

      // Since both 'done' and 'closed' are completed statuses, moving between them should NOT count as newly delivered points
      expect(telemetry.periodDeliveredPoints).toBe(0);
    });

    it('counts delivered points when transitioning from in_progress to done', () => {
      const events = [
        {
          id: 'ev-2',
          event_type: 'status_transition',
          occurred_at: '2026-11-10T12:00:00Z',
          work_item_id: 'item-2',
          previous_state: { status: 'in_progress' },
          new_state: { status: 'done' },
          points_delta: 8,
        },
      ];

      const telemetry = computePeriodScopedTelemetry({
        committedPoints: 10,
        startDate: '2026-11-01',
        endDate: '2026-11-15',
        events,
        items: [{ id: 'item-2', status: 'done', metadata: { story_points: 8 } } as any],
      });

      expect(telemetry.periodDeliveredPoints).toBe(8);
    });
  });

  describe('4. Tenant isolation in ProjectDataContext (src/context/ProjectDataContext.tsx)', () => {
    beforeEach(() => {
      clearProjectCache();
      if (typeof window !== 'undefined' && window.sessionStorage) {
        window.sessionStorage.clear();
      }
    });

    const sampleCard: WorkItemCard = {
      id: 'card-1',
      tenant_id: 'ten-corp',
      project_id: 'proj-omega',
      external_ref_id: 'CARD-1',
      title: 'Secret Blueprint',
      item_type: 'story',
      status: 'in_progress',
      order_index: 10,
      assignee: 'dev1',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {},
    };

    it('does not leak tenant-scoped entries to unscoped callers', () => {
      setProjectCache(
        'proj-omega',
        {
          items: [sampleCard],
          settings: DEFAULT_PROJECT_SETTINGS,
          latestAt: new Date().toISOString(),
          tenantSlug: 'acme-corp',
        },
        undefined,
        'acme-corp'
      );

      // Caller without tenantSlug must NOT receive the private tenant entry
      const unscopedRead = getProjectCache('proj-omega');
      expect(unscopedRead).toBeUndefined();

      // Different tenant must NOT receive the private tenant entry
      const otherTenantRead = getProjectCache('proj-omega', 'other-tenant');
      expect(otherTenantRead).toBeUndefined();

      // Correct tenant receives the entry
      const authorizedRead = getProjectCache('proj-omega', 'acme-corp');
      expect(authorizedRead).toBeDefined();
      expect(authorizedRead?.items[0].title).toBe('Secret Blueprint');
    });

    it('does not write bare unscoped keys to storage when tenantSlug is provided', () => {
      setProjectCache(
        'proj-alpha',
        {
          items: [sampleCard],
          settings: DEFAULT_PROJECT_SETTINGS,
          latestAt: new Date().toISOString(),
          tenantSlug: 'tenant-secure',
        },
        'alt-alpha',
        'tenant-secure'
      );

      if (typeof window !== 'undefined' && window.sessionStorage) {
        // Bare key must NOT exist in storage
        expect(window.sessionStorage.getItem('tracker_project_cache_proj-alpha')).toBeNull();
        expect(window.sessionStorage.getItem('tracker_project_cache_alt-alpha')).toBeNull();

        // Scoped keys must exist
        expect(window.sessionStorage.getItem('tracker_project_cache_tenant-secure:proj-alpha')).not.toBeNull();
        expect(window.sessionStorage.getItem('tracker_project_cache_tenant-secure:alt-alpha')).not.toBeNull();
      }
    });

    it('optimistic mutations respect tenant scoping', () => {
      setProjectCache(
        'proj-1',
        {
          items: [sampleCard],
          settings: DEFAULT_PROJECT_SETTINGS,
          latestAt: new Date().toISOString(),
          tenantSlug: 'tenant-a',
        },
        undefined,
        'tenant-a'
      );

      // Mutate for tenant-a
      syncOptimisticMutationToCache(
        { id: 'card-1', title: 'Updated Blueprint' },
        'proj-1',
        'tenant-a'
      );

      const cached = getProjectCache('proj-1', 'tenant-a');
      expect(cached?.items[0].title).toBe('Updated Blueprint');

      // Attempted mutation for tenant-b should not affect tenant-a
      syncOptimisticMutationToCache(
        { id: 'card-1', title: 'Hacked Title' },
        'proj-1',
        'tenant-b'
      );

      const stillSafe = getProjectCache('proj-1', 'tenant-a');
      expect(stillSafe?.items[0].title).toBe('Updated Blueprint');
    });

    it('clearing project cache wipes in-memory and persisted storage', () => {
      setProjectCache(
        'proj-wipe',
        {
          items: [sampleCard],
          settings: DEFAULT_PROJECT_SETTINGS,
          latestAt: new Date().toISOString(),
          tenantSlug: 'tenant-wipe',
        },
        undefined,
        'tenant-wipe'
      );

      expect(getProjectCache('proj-wipe', 'tenant-wipe')).toBeDefined();

      clearProjectCache();

      expect(getProjectCache('proj-wipe', 'tenant-wipe')).toBeUndefined();
    });
  });

  describe('5. Burndown snapshot date window filtering (src/hooks/useSprintTelemetry.ts)', () => {
    it('filters burndown snapshots strictly within the requested date window', () => {
      const startDate = '2026-11-05';
      const endDate = '2026-11-12';

      const burndownData = [
        { date: '2026-11-03', remaining_points: 20 }, // Before window
        { date: '2026-11-05', remaining_points: 18 }, // On window start
        { date: '2026-11-08', remaining_points: 14 }, // Within window
        { date: '2026-11-12', remaining_points: 10 }, // On window end
        { date: '2026-11-15', remaining_points: 5 },  // After window
      ];

      const filtered = burndownData.filter((b) => {
        if (!b.date) return true;
        return b.date >= startDate && b.date <= endDate;
      });

      expect(filtered).toHaveLength(3);
      expect(filtered.map((f) => f.date)).toEqual(['2026-11-05', '2026-11-08', '2026-11-12']);
    });
  });
});
