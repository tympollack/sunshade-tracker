import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { BurndownChart, BurndownDataPoint } from '@/components/analytics/BurndownChart';

describe('TASK-TRK-UI-BURNDOWN: BurndownChart component', () => {
  it('renders friendly empty state when no data provided', () => {
    render(<BurndownChart data={[]} />);
    expect(screen.getByText('No Burndown Snapshots')).toBeInTheDocument();
  });

  it('renders SVG chart with ideal and actual burn lines and contributor bars', () => {
    const sampleData: BurndownDataPoint[] = [
      {
        date: '2026-10-01',
        idealRemaining: 40,
        actualRemaining: 40,
        dailyVelocity: 0,
      },
      {
        date: '2026-10-02',
        idealRemaining: 30,
        actualRemaining: 25,
        dailyVelocity: 15,
        contributorBreakdown: { alice: 10, bob: 5 },
      },
      {
        date: '2026-10-03',
        idealRemaining: 20,
        actualRemaining: 30, // Scope spike
        dailyVelocity: 0,
        hasScopeCreep: true,
      },
      {
        date: '2026-10-04',
        idealRemaining: 10,
        actualRemaining: 10,
        dailyVelocity: 20,
        contributorBreakdown: { alice: 20 },
      },
    ];

    const { container } = render(<BurndownChart data={sampleData} />);

    // Check header and legend
    expect(screen.getByText('Sprint Burndown & Daily Velocity')).toBeInTheDocument();
    expect(screen.getByText('Ideal Burn')).toBeInTheDocument();
    expect(screen.getByText('Actual Burn')).toBeInTheDocument();

    // Check SVG rendered
    const svg = container.querySelector('svg');
    expect(svg).toBeInTheDocument();

    // Check paths for ideal and actual burn
    const paths = container.querySelectorAll('path');
    expect(paths.length).toBeGreaterThanOrEqual(2);

    // Check alert marker for spike rendered
    const alertCircle = container.querySelector('circle[fill="#ef4444"]');
    expect(alertCircle).toBeInTheDocument();
  });
});
