import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { KanbanCard } from '@/components/board/KanbanCard';
import { CardMetadataChips } from '@/components/board/CardMetadataChips';
import { WorkItem, HierarchyLevel } from '@/types/tracker';

describe('TASK-TRK-CARD-PILL-CONTAINMENT: Kanban Card Pillbox Containment & Overflow Capsule', () => {
  const mockHierarchy: HierarchyLevel[] = [
    { level: 0, type: 'epic', label: 'Epic', color: '#a855f7', allowed_parents: [] },
    { level: 1, type: 'story', label: 'Story', color: '#0ea5e9', allowed_parents: ['epic'] },
    { level: 2, type: 'task', label: 'Task', color: '#64748b', allowed_parents: ['story'] },
  ];

  const makeItem = (metadata: Record<string, any>): WorkItem => ({
    id: 'item-containment-1',
    external_ref_id: 'TASK-TRK-CONTAIN-1',
    tenant_id: 'tenant-1',
    project_id: 'prj-1',
    title: 'Work item with multiple long metadata tag chips',
    description: 'Detailed description for testing metadata pillbox containment',
    status: 'in_progress',
    item_type: 'task',
    order_index: 1000,
    metadata,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  describe('Card Root Boundary Guard', () => {
    it('enforces w-full min-w-0 overflow-hidden relative rounded-lg border border-slate-800 bg-slate-900/90 on card container', () => {
      const item = makeItem({ sprint: 'Sprint 2026-Q4', priority: 'Critical' });
      render(
        <KanbanCard
          item={item}
          compact={false}
          itemHierarchy={mockHierarchy}
        />
      );

      const card = screen.getByTestId('kanban-card-item-containment-1');
      expect(card).toBeInTheDocument();
      expect(card.className).toContain('w-full');
      expect(card.className).toContain('min-w-0');
      expect(card.className).toContain('overflow-hidden');
      expect(card.className).toContain('relative');
      expect(card.className).toContain('rounded-lg');
      expect(card.className).toContain('border-slate-800');
      expect(card.className).toContain('bg-slate-900/90');
    });

    it('enforces boundary guard on compact cards as well', () => {
      const item = makeItem({ sprint: 'Sprint 2026-Q4' });
      render(
        <KanbanCard
          item={item}
          compact={true}
          itemHierarchy={mockHierarchy}
        />
      );

      const card = screen.getByTestId('kanban-card-item-containment-1');
      expect(card.className).toContain('w-full');
      expect(card.className).toContain('min-w-0');
      expect(card.className).toContain('overflow-hidden');
      expect(card.className).toContain('relative');
    });
  });

  describe('Tag Flex Container & Truncation in CardMetadataChips', () => {
    it('applies flex container with max-w-[130px] and truncate min-w-0 on chips', () => {
      render(
        <CardMetadataChips
          itemId="item-1"
          metadata={{
            sprint: 'Sprint 2026-Q4-Extended-Length-Title',
            priority: 'Ultra-High-Critical-Priority-Value',
          }}
        />
      );

      const container = screen.getByTestId('card-metadata-chips-item-1');
      expect(container.className).toContain('flex flex-wrap items-center gap-1.5 w-full min-w-0 overflow-hidden');

      const sprintChip = screen.getByTestId('card-tag-chip-sprint');
      expect(sprintChip.className).toContain('max-w-[130px]');
      expect(sprintChip.className).toContain('inline-flex items-center text-[10px] px-1.5 py-0.5 rounded shrink-0 font-medium');

      const innerLabel = sprintChip.querySelector('.truncate');
      expect(innerLabel).not.toBeNull();
      expect(innerLabel?.className).toContain('truncate min-w-0');
      expect(innerLabel).toHaveAttribute('title', 'sprint: Sprint 2026-Q4-Extended-Length-Title');
    });
  });

  describe('+N More Overflow Capsule', () => {
    it('renders only top 2 priority chips and a +N more capsule when 3+ metadata chips are present', () => {
      render(
        <CardMetadataChips
          itemId="item-multi"
          metadata={{
            sprint: 'Sprint 2026-Q4',
            priority: 'Critical',
            complexity: 3,
            source_type: 'ui_defect',
            custom_tag: 'backend',
          }}
        />
      );

      // Top 2 chips rendered
      expect(screen.getByTestId('card-tag-chip-sprint')).toBeInTheDocument();
      expect(screen.getByTestId('card-tag-chip-priority')).toBeInTheDocument();

      // Lower priority chips not in primary list
      expect(screen.queryByTestId('card-tag-chip-custom_tag')).not.toBeInTheDocument();

      // Overflow capsule rendered with +3 more
      const capsule = screen.getByTestId('card-overflow-capsule-item-multi');
      expect(capsule).toBeInTheDocument();
      expect(capsule).toHaveTextContent('+3 more');
      expect(capsule.className).toContain('text-[10px]');
      expect(capsule.className).toContain('text-slate-400');
      expect(capsule.className).toContain('bg-slate-800/80');
      expect(capsule.className).toContain('cursor-pointer');
    });

    it('does not render GitHub fields as chips so they do not displace custom metadata', () => {
      render(
        <CardMetadataChips
          itemId="item-gh"
          metadata={{
            pr_url: 'https://github.com/org/repo/pull/152',
            commit_hash: 'abcdef123456',
            sprint: 'Sprint 2026-Q4',
            priority: 'High',
            complexity: 2,
          }}
        />
      );

      // GitHub fields must NOT be rendered as chips
      expect(screen.queryByTestId('card-tag-chip-pr_url')).not.toBeInTheDocument();
      expect(screen.queryByTestId('card-tag-chip-commit_hash')).not.toBeInTheDocument();

      // Priority and sprint must be visible
      expect(screen.getByTestId('card-tag-chip-sprint')).toBeInTheDocument();
      expect(screen.getByTestId('card-tag-chip-priority')).toBeInTheDocument();

      // Overflow capsule must only count non-GitHub tags (complexity = +1 more)
      const capsule = screen.getByTestId('card-overflow-capsule-item-gh');
      expect(capsule).toHaveTextContent('+1 more');
    });
  });
});
