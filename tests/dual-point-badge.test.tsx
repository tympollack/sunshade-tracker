import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DualPointBadge } from '@/components/DualPointBadge';

describe('FEAT-TRK-DUAL-POINT-BADGE-UI: Dual Intrinsic vs. Rollup Point Badges', () => {
  it('renders single rollup pill and suppresses intrinsic pill by default in granular mode (FEAT-TRK-HIERARCHY-ROW-DECLUTTER)', () => {
    render(
      <DualPointBadge
        storyPoints={8}
        rollupPoints={13}
        childCount={3}
        pointMode="granular"
      />
    );

    const badge = screen.getByTestId('dual-point-badge');
    expect(badge).toBeInTheDocument();

    // Rollup pill rendered
    const rollupPill = screen.getByTestId('dual-point-badge-rollup');
    expect(rollupPill).toHaveTextContent('Σ 13 pts');

    // Intrinsic pill is suppressed from default view
    expect(screen.queryByTestId('dual-point-badge-intrinsic')).toBeNull();

    // Tooltip surfaces intrinsic estimate
    expect(badge).toHaveAttribute('title', 'Intrinsic Estimate: 8 pts');
  });

  it('renders compound badge when showCompound is explicitly enabled', () => {
    render(
      <DualPointBadge
        storyPoints={8}
        rollupPoints={13}
        childCount={3}
        pointMode="granular"
        showCompound={true}
      />
    );

    const badge = screen.getByTestId('dual-point-badge');
    expect(badge).toBeInTheDocument();

    // Rollup pill
    const rollupPill = screen.getByTestId('dual-point-badge-rollup');
    expect(rollupPill).toHaveTextContent('Σ 13 pts');

    // Intrinsic pill
    const intrinsicPill = screen.getByTestId('dual-point-badge-intrinsic');
    expect(intrinsicPill).toHaveTextContent('Est: 8');

    // Tooltip
    expect(badge).toHaveAttribute(
      'title',
      'Intrinsic Estimate: 8 pts | Active child tasks: 13 pts'
    );
  });

  it('renders single rollup pill when item has children but no intrinsic estimate', () => {
    render(
      <DualPointBadge
        storyPoints={undefined}
        rollupPoints={10}
        childCount={2}
        pointMode="granular"
      />
    );

    const badge = screen.getByTestId('dual-point-badge');
    expect(badge).toHaveTextContent('Σ 10 pts');
    expect(screen.queryByTestId('dual-point-badge-intrinsic')).toBeNull();
  });

  it('renders single pill when item is a leaf node (childCount === 0)', () => {
    render(
      <DualPointBadge
        storyPoints={5}
        rollupPoints={0}
        childCount={0}
        pointMode="granular"
      />
    );

    const leafBadge = screen.getByTestId('dual-point-badge');
    expect(leafBadge).toHaveTextContent('5 pts');
    expect(leafBadge).toHaveAttribute('title', '5 pts');
  });

  it('renders intrinsic pill when in macro mode even if children exist', () => {
    render(
      <DualPointBadge
        storyPoints={8}
        rollupPoints={13}
        childCount={3}
        pointMode="macro"
      />
    );

    const macroBadge = screen.getByTestId('dual-point-badge');
    expect(macroBadge).toHaveTextContent('8 pts');
    expect(macroBadge).toHaveAttribute('title', 'Macro estimate: 8 pts');
  });

  it('enforces shrink-0 and whitespace-nowrap classes to prevent card/title wrapping', () => {
    render(
      <DualPointBadge
        storyPoints={8}
        rollupPoints={13}
        childCount={3}
        pointMode="granular"
      />
    );

    const badge = screen.getByTestId('dual-point-badge');
    expect(badge).toHaveClass('shrink-0');
    expect(badge).toHaveClass('whitespace-nowrap');
  });
});
