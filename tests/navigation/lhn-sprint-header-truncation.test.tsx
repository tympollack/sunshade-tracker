import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { NavTreeNode } from '@/components/navigation/NavTreeNode';
import { PivotTreeNode } from '@/hooks/usePivotTree';

describe('BUG-TRK-LHN-SPRINT-HEADER-TRUNCATION: Prevent Premature Sprint Title Ellipsis in LHN Sidebar', () => {
  it('renders sprint row container with full width and flex gap', () => {
    const node: PivotTreeNode = {
      id: 'sprint:sprint-2026-q4',
      title: 'Sprint 2026-Q4',
      type: 'sprint',
      sprintName: 'Sprint 2026-Q4',
      badge: 'Active',
      depth: 0,
      children: [],
      childCount: 12,
      rollupPoints: 276,
    };

    render(
      <NavTreeNode
        node={node}
        depth={0}
        isExpanded={false}
        onToggle={vi.fn()}
        expandedNodes={new Set()}
        unit="pts"
      />
    );

    const row = screen.getByRole('treeitem');
    expect(row).toHaveClass('flex');
    expect(row).toHaveClass('items-center');
    expect(row).toHaveClass('gap-1.5');
    expect(row).toHaveClass('w-full');
  });

  it('allocates min-w-[125px] flex-shrink-0 font-medium text-xs to sprint title span', () => {
    const node: PivotTreeNode = {
      id: 'sprint:sprint-2026-q4',
      title: 'Sprint 2026-Q4',
      type: 'sprint',
      sprintName: 'Sprint 2026-Q4',
      badge: 'Active',
      depth: 0,
      children: [],
      childCount: 5,
      rollupPoints: 34,
    };

    render(
      <NavTreeNode
        node={node}
        depth={0}
        isExpanded={false}
        onToggle={vi.fn()}
        expandedNodes={new Set()}
        unit="pts"
      />
    );

    const titleSpan = screen.getByText('Sprint 2026-Q4');
    expect(titleSpan).toBeInTheDocument();
    expect(titleSpan).toHaveClass('truncate');
    expect(titleSpan).toHaveClass('min-w-[125px]');
    expect(titleSpan).toHaveClass('flex-shrink-0');
    expect(titleSpan).toHaveClass('font-medium');
    expect(titleSpan).toHaveClass('text-xs');
    expect(titleSpan).toHaveAttribute('title', 'Sprint 2026-Q4');
  });

  it('groups status pill, child count, and point totals in right-aligned container with ml-auto', () => {
    const node: PivotTreeNode = {
      id: 'sprint:sprint-2026-q4',
      title: 'Sprint 2026-Q4',
      type: 'sprint',
      sprintName: 'Sprint 2026-Q4',
      badge: 'Active',
      depth: 0,
      children: [],
      childCount: 112,
      rollupPoints: 276,
    };

    render(
      <NavTreeNode
        node={node}
        depth={0}
        isExpanded={false}
        onToggle={vi.fn()}
        expandedNodes={new Set()}
        unit="pts"
      />
    );

    const badge = screen.getByText('Active');
    const metricCluster = badge.parentElement;
    expect(metricCluster).not.toBeNull();
    expect(metricCluster).toHaveClass('shrink-0');
    expect(metricCluster).toHaveClass('ml-auto');
    expect(metricCluster).toHaveClass('flex');
    expect(metricCluster).toHaveClass('items-center');
    expect(metricCluster).toHaveClass('gap-1');
    expect(metricCluster).toHaveClass('text-[11px]');

    // Sibling elements in metric cluster
    expect(screen.getByText('112')).toBeInTheDocument();
    expect(screen.getByText('276 pts')).toBeInTheDocument();
  });
});
