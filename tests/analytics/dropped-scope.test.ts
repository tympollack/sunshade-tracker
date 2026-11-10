import { describe, it, expect } from 'vitest';
import { computeSprintAnalytics } from '@/lib/services/sprintAnalyticsService';

const item = (id: string, pts: number, status = 'in_progress', meta: Record<string, any> = {}) =>
  ({ id, status, title: id, item_type: 'task', metadata: { story_points: pts, ...meta } }) as any;

const sprint = { id: 's1', name: 'Sprint X', status: 'active', committed_points: 100 };

describe('dropped scope derivation (PR 150 review)', () => {
  it('derives dropped points from a shortfall against the committed baseline', () => {
    const r = computeSprintAnalytics({ sprint, items: [item('a', 50), item('b', 30)] });
    expect(r.pointsDroppedMidSprint).toBe(20);
  });

  it('accounts for added scope when deriving dropped points', () => {
    const r = computeSprintAnalytics({
      sprint,
      items: [item('a', 80), item('b', 10, 'in_progress', { added_mid_sprint: true })],
    });
    expect(r.pointsAddedMidSprint).toBe(10);
    expect(r.pointsDroppedMidSprint).toBe(20);
  });

  it('reports zero dropped when there is no baseline or scope only grew', () => {
    expect(computeSprintAnalytics({ sprint: { ...sprint, committed_points: 0 }, items: [item('a', 10)] }).pointsDroppedMidSprint).toBe(0);
    expect(computeSprintAnalytics({ sprint, items: [item('a', 130)] }).pointsDroppedMidSprint).toBe(0);
  });
});
