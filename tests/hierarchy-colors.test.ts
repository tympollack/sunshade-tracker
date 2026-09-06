import { describe, it, expect } from 'vitest';
import { getHierarchyLevelColor } from '@/lib/hierarchy-colors';
import { HierarchyLevel } from '@/types/tracker';

describe('Hierarchy Level Colors Utility', () => {
  const sampleHierarchy: HierarchyLevel[] = [
    { type: 'initiative', label: 'Initiative', level: 1, allowed_parents: [] },
    { type: 'epic', label: 'Epic', level: 2, allowed_parents: ['initiative'] },
    { type: 'story', label: 'Story', level: 3, allowed_parents: ['epic'] },
    { type: 'task', label: 'Task', level: 4, allowed_parents: ['story'] },
    { type: 'subtask', label: 'Sub-task', level: 5, allowed_parents: ['task'] },
  ];

  it('maps level 1 to purple palette', () => {
    const color = getHierarchyLevelColor('initiative', sampleHierarchy);
    expect(color.hex).toBe('#a855f7');
    expect(color.badgeBg).toContain('purple');
    expect(color.badgeText).toContain('purple');
  });

  it('maps level 2 to sky palette', () => {
    const color = getHierarchyLevelColor('epic', sampleHierarchy);
    expect(color.hex).toBe('#38bdf8');
    expect(color.badgeBg).toContain('sky');
  });

  it('maps level 3 to emerald palette', () => {
    const color = getHierarchyLevelColor('story', sampleHierarchy);
    expect(color.hex).toBe('#10b981');
    expect(color.badgeBg).toContain('emerald');
  });

  it('maps level 4 to amber palette', () => {
    const color = getHierarchyLevelColor('task', sampleHierarchy);
    expect(color.hex).toBe('#f59e0b');
    expect(color.badgeBg).toContain('amber');
  });

  it('maps level 5 to rose palette', () => {
    const color = getHierarchyLevelColor('subtask', sampleHierarchy);
    expect(color.hex).toBe('#f43f5e');
    expect(color.badgeBg).toContain('rose');
  });

  it('uses custom color override when specified on hierarchy item', () => {
    const customHierarchy: HierarchyLevel[] = [
      { type: 'custom_type', label: 'Custom', level: 2, allowed_parents: [], color: '#e11d48' },
    ];
    const color = getHierarchyLevelColor('custom_type', customHierarchy);
    expect(color.hex).toBe('#e11d48');
  });

  it('provides sensible fallback for unknown type without hierarchy config', () => {
    const color = getHierarchyLevelColor('epic', []);
    expect(color.hex).toBe('#38bdf8'); // Fallback heuristic recognizes 'epic'

    const unknownColor = getHierarchyLevelColor('random_custom_unmatched', []);
    expect(unknownColor.hex).toBe('#94a3b8');
  });
});
