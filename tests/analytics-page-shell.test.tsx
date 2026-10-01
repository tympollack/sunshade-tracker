import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { AnalyticsHeader } from '@/components/analytics/AnalyticsHeader';
import { KpiMetricCards } from '@/components/analytics/KpiMetricCards';

describe('TASK-TRK-UI-PAGE-SHELL: Analytics Header and KPI Cards', () => {
  it('renders AnalyticsHeader with sprint select and date range controls', () => {
    const mockSprints = [
      { id: 's1', name: 'Sprint 1', is_active: true },
      { id: 's2', name: 'Sprint 2', is_active: false },
    ];

    render(
      <AnalyticsHeader
        tenantSlug="sunshade"
        projectSlug="portfolio"
        projectName="Portfolio"
        sprints={mockSprints}
        selectedSprintId="s1"
        onSelectSprint={vi.fn()}
        startDate="2026-10-01"
        endDate="2026-10-15"
        onChangeStartDate={vi.fn()}
        onChangeEndDate={vi.fn()}
      />
    );

    expect(screen.getByText('Sprint & Flow Analytics')).toBeInTheDocument();
    expect(screen.getByLabelText('Start date')).toHaveValue('2026-10-01');
    expect(screen.getByLabelText('End date')).toHaveValue('2026-10-15');
    expect(screen.getByRole('combobox')).toHaveValue('s1');
  });

  it('renders KpiMetricCards with predictable badges and velocity trend indicators', () => {
    render(
      <KpiMetricCards
        metrics={{
          rollingVelocity: 24.5,
          velocityTrend: 'up',
          sayDoRatio: 92.5,
          scopeVolatility: 10,
          remainingPoints: 14,
          committedPoints: 28,
        }}
      />
    );

    expect(screen.getByText('24.5')).toBeInTheDocument();
    expect(screen.getByText('Trending upward')).toBeInTheDocument();
    expect(screen.getByText('92.5%')).toBeInTheDocument();
    expect(screen.getByText('Predictable')).toBeInTheDocument();
    expect(screen.getByText('+10%')).toBeInTheDocument();
    expect(screen.getByText('14')).toBeInTheDocument();
  });

  it('renders skeleton states when isLoading is true', () => {
    const { container } = render(
      <KpiMetricCards
        metrics={{
          rollingVelocity: 0,
          sayDoRatio: 0,
          scopeVolatility: 0,
          remainingPoints: 0,
        }}
        isLoading={true}
      />
    );

    const skeletonCards = container.querySelectorAll('.animate-pulse');
    expect(skeletonCards.length).toBe(4);
  });
});
