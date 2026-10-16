import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PointBadge } from '@/components/common/PointBadge';
import { DualPointBadge } from '@/components/DualPointBadge';
import { SprintStatusSelect } from '@/components/sprint/SprintStatusSelect';
import { StatusDefinition } from '@/types/tracker';

const mockStatuses: StatusDefinition[] = [
  { id: 'todo', label: 'To Do', color: '#94a3b8', order: 1 },
  { id: 'in_progress', label: 'In Progress', color: '#3b82f6', order: 2 },
  { id: 'done', label: 'Done', color: '#10b981', order: 3 },
];

describe('TASK-TRK-POINT-BADGE-CONSOLIDATION: Consolidate Point Badges & Streamline Dropdowns', () => {
  describe('PointBadge / DualPointBadge Compact Rules', () => {
    it('shows ONLY Σ [X] pts in emerald pill when compact={true} and rollupPoints exists', () => {
      render(
        <PointBadge
          storyPoints={8}
          rollupPoints={16}
          childCount={3}
          compact={true}
          pointMode="granular"
          showCompound={true}
        />
      );

      const badge = screen.getByTestId('dual-point-badge');
      expect(badge).toBeInTheDocument();

      // Only rollup pill exists in DOM flow
      const rollupPill = screen.getByTestId('dual-point-badge-rollup');
      expect(rollupPill).toHaveTextContent('Σ 16 pts');

      // Intrinsic estimate is hidden from DOM flow
      expect(screen.queryByTestId('dual-point-badge-intrinsic')).toBeNull();

      // Intrinsic estimate is strictly mounted in tooltip
      expect(badge).toHaveAttribute('title', 'Intrinsic: 8 pts | Rollup: 16 pts');
    });

    it('mounts single leaf badge when childCount === 0 with compact={true}', () => {
      render(
        <DualPointBadge
          storyPoints={5}
          rollupPoints={0}
          childCount={0}
          compact={true}
          pointMode="granular"
        />
      );

      const leafBadge = screen.getByTestId('dual-point-badge');
      expect(leafBadge).toHaveTextContent('5 pts');
      expect(leafBadge).toHaveAttribute('title', '5 pts');
      expect(screen.queryByTestId('dual-point-badge-rollup')).toBeNull();
      expect(screen.queryByTestId('dual-point-badge-intrinsic')).toBeNull();
    });

    it('hides intrinsic badge with hidden sm:inline-flex when showCompound={true} and compact is false', () => {
      render(
        <DualPointBadge
          storyPoints={5}
          rollupPoints={12}
          childCount={2}
          showCompound={true}
          pointMode="granular"
        />
      );

      const intrinsicPill = screen.getByTestId('dual-point-badge-intrinsic');
      expect(intrinsicPill).toHaveClass('hidden');
      expect(intrinsicPill).toHaveClass('sm:inline-flex');
    });
  });

  describe('SprintStatusSelect and Dropdown Styling', () => {
    it('applies compact padding py-0.5 px-1.5 text-xs on mobile and md:py-1 md:px-3 md:text-sm on desktop', () => {
      render(
        <SprintStatusSelect
          itemId="item-1"
          status="in_progress"
          statuses={mockStatuses}
          onChange={vi.fn()}
        />
      );

      const select = screen.getByTestId('sprint-status-select-item-1');
      expect(select).toHaveClass('py-0.5');
      expect(select).toHaveClass('px-1.5');
      expect(select).toHaveClass('text-xs');
      expect(select).toHaveClass('md:py-1');
      expect(select).toHaveClass('md:px-3');
      expect(select).toHaveClass('md:text-sm');
      expect(select).toHaveClass('max-w-[130px]');
      expect(select).toHaveClass('truncate');
    });

    it('enforces compact padding when compact={true}', () => {
      render(
        <SprintStatusSelect
          itemId="item-1"
          status="done"
          statuses={mockStatuses}
          compact={true}
        />
      );

      const select = screen.getByTestId('sprint-status-select-item-1');
      expect(select).toHaveClass('py-0.5 px-1.5 text-xs');
      expect(select).not.toHaveClass('md:py-1 md:px-3 md:text-sm');
    });

    it('applies dynamic status color styling and triggers onChange on selection', () => {
      const handleChange = vi.fn();
      render(
        <SprintStatusSelect
          itemId="item-1"
          status="done"
          statuses={mockStatuses}
          onChange={handleChange}
        />
      );

      const select = screen.getByTestId('sprint-status-select-item-1');
      expect(select).toHaveStyle({
        color: '#10b981',
        backgroundColor: 'rgba(16, 185, 129, 0.125)',
        border: '1px solid #10b98140',
      });

      fireEvent.change(select, { target: { value: 'todo' } });
      expect(handleChange).toHaveBeenCalledWith('item-1', 'todo');
    });
  });
});
