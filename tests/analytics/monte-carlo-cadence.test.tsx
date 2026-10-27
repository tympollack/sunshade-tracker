import React from 'react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  convertSprintsToCadence,
  CADENCE_OPTIONS,
  MonteCarloSimulationResult,
} from '@/lib/analytics/monte-carlo';
import { MonteCarloSimulator } from '@/components/analytics/MonteCarloSimulator';

const mockSimulation: MonteCarloSimulationResult = {
  remainingStoryPoints: 50,
  iterations: 1000,
  sprintLengthDays: 14,
  startDate: '2026-10-01T00:00:00.000Z',
  deliveredWithinHorizon: true,
  censoredTrials: 0,
  percentiles: {
    p50: 2,
    p85: 3,
    p95: 4,
  },
  projectedDates: {
    p50: '2026-10-29T00:00:00.000Z',
    p85: '2026-11-12T00:00:00.000Z',
    p95: '2026-11-26T00:00:00.000Z',
  },
  distribution: [2, 3, 4],
  executionTimeMs: 12.5,
};

describe('TASK-TRK-MC-CADENCE-SELECTOR: Monte Carlo Cadence Selector', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  describe('convertSprintsToCadence math and formatting', () => {
    it('accurately converts across all 7 cadence options for 2 sprints (28 days)', () => {
      const sprints = 2;
      const sprintLengthDays = 14;

      // 1. Sprint
      const sprintRes = convertSprintsToCadence(sprints, 'sprint', sprintLengthDays);
      expect(sprintRes.value).toBe(2);
      expect(sprintRes.label).toBe('2 sprints');

      // 2. Day (2 sprints * 14 = 28 days)
      const dayRes = convertSprintsToCadence(sprints, 'day', sprintLengthDays);
      expect(dayRes.value).toBe(28);
      expect(dayRes.label).toBe('28 days');

      // 3. Week (28 / 7 = 4 weeks)
      const weekRes = convertSprintsToCadence(sprints, 'week', sprintLengthDays);
      expect(weekRes.value).toBe(4);
      expect(weekRes.label).toBe('4 weeks');

      // 4. 2-Week (28 / 14 = 2 bi-weeks)
      const biWeekRes = convertSprintsToCadence(sprints, '2-week', sprintLengthDays);
      expect(biWeekRes.value).toBe(2);
      expect(biWeekRes.label).toBe('2 bi-weeks');

      // 5. Month (28 / 30.4375 ~= 0.9 months)
      const monthRes = convertSprintsToCadence(sprints, 'month', sprintLengthDays);
      expect(monthRes.value).toBe(0.9);
      expect(monthRes.label).toBe('0.9 months');

      // 6. Quarter (28 / 91.3125 ~= 0.3 quarters)
      const quarterRes = convertSprintsToCadence(sprints, 'quarter', sprintLengthDays);
      expect(quarterRes.value).toBe(0.3);
      expect(quarterRes.label).toBe('0.3 quarters');

      // 7. Year (28 / 365.25 ~= 0.1 years)
      const yearRes = convertSprintsToCadence(sprints, 'year', sprintLengthDays);
      expect(yearRes.value).toBe(0.1);
      expect(yearRes.label).toBe('0.1 years');
    });

    it('correctly handles singular units when duration equals 1', () => {
      // 1 sprint of 7 days
      expect(convertSprintsToCadence(1, 'sprint', 7).label).toBe('1 sprint');
      expect(convertSprintsToCadence(1 / 7, 'day', 7).label).toBe('1 day');
      expect(convertSprintsToCadence(1, 'week', 7).label).toBe('1 week');
      expect(convertSprintsToCadence(2, '2-week', 7).label).toBe('1 bi-week');
      expect(convertSprintsToCadence(30.4375 / 14, 'month', 14).label).toBe('1 month');
      expect(convertSprintsToCadence(91.3125 / 14, 'quarter', 14).label).toBe('1 quarter');
      expect(convertSprintsToCadence(365.25 / 14, 'year', 14).label).toBe('1 year');
    });

    it('handles null sprints (trials exceeding horizon) safely', () => {
      for (const opt of CADENCE_OPTIONS) {
        const res = convertSprintsToCadence(null, opt.unit, 14);
        expect(res.value).toBeNull();
        expect(res.label).toBe('> 500 sprints');
      }
    });
  });

  describe('MonteCarloSimulator UI component interaction', () => {
    it('renders the cadence selector with all 7 options defaulting to sprints', () => {
      render(<MonteCarloSimulator simulation={mockSimulation} />);

      const selector = screen.getByTestId('mc-cadence-selector') as HTMLSelectElement;
      expect(selector).toBeInTheDocument();
      expect(selector.value).toBe('sprint');
      expect(selector.options.length).toBe(7);

      expect(screen.getByTestId('mc-p50-value')).toHaveTextContent('2 sprints');
      expect(screen.getByTestId('mc-p85-value')).toHaveTextContent('3 sprints');
      expect(screen.getByTestId('mc-p95-value')).toHaveTextContent('4 sprints');
    });

    it('immediately updates confidence values when changing cadence to Days and persists to localStorage', () => {
      render(<MonteCarloSimulator simulation={mockSimulation} />);

      const selector = screen.getByTestId('mc-cadence-selector');
      fireEvent.change(selector, { target: { value: 'day' } });

      // 2 sprints * 14 = 28 days; 3 sprints = 42 days; 4 sprints = 56 days
      expect(screen.getByTestId('mc-p50-value')).toHaveTextContent('28 days');
      expect(screen.getByTestId('mc-p85-value')).toHaveTextContent('42 days');
      expect(screen.getByTestId('mc-p95-value')).toHaveTextContent('56 days');

      expect(localStorage.getItem('trk_mc_cadence_unit')).toBe('day');
    });

    it('restores cadence selection from localStorage on mount', () => {
      localStorage.setItem('trk_mc_cadence_unit', 'week');

      render(<MonteCarloSimulator simulation={mockSimulation} />);

      const selector = screen.getByTestId('mc-cadence-selector') as HTMLSelectElement;
      expect(selector.value).toBe('week');

      // 2 sprints * 14 / 7 = 4 weeks; 3 sprints = 6 weeks; 4 sprints = 8 weeks
      expect(screen.getByTestId('mc-p50-value')).toHaveTextContent('4 weeks');
      expect(screen.getByTestId('mc-p85-value')).toHaveTextContent('6 weeks');
      expect(screen.getByTestId('mc-p95-value')).toHaveTextContent('8 weeks');
    });

    it('displays sub-week fractional forecasts from daily intra-sprint simulation when week cadence is selected', () => {
      const intraSprintSimulation: MonteCarloSimulationResult = {
        remainingStoryPoints: 8,
        iterations: 1000,
        sprintLengthDays: 14,
        startDate: '2026-10-26T00:00:00.000Z',
        deliveredWithinHorizon: true,
        censoredTrials: 0,
        percentiles: {
          p50: 1 / 14, // 1 day = 0.1 weeks
          p85: 2 / 14, // 2 days = 0.3 weeks
          p95: 3 / 14, // 3 days = 0.4 weeks
        },
        projectedDates: {
          p50: '2026-10-27T00:00:00.000Z',
          p85: '2026-10-28T00:00:00.000Z',
          p95: '2026-10-29T00:00:00.000Z',
        },
        distribution: [1 / 14, 2 / 14, 3 / 14],
        executionTimeMs: 15,
        cadenceUnit: 'week',
        isDailySimulation: true,
      };

      localStorage.setItem('trk_mc_cadence_unit', 'week');
      render(<MonteCarloSimulator simulation={intraSprintSimulation} />);

      expect(screen.getByTestId('mc-p50-value')).toHaveTextContent('0.1 weeks');
      expect(screen.getByTestId('mc-p85-value')).toHaveTextContent('0.3 weeks');
      expect(screen.getByTestId('mc-p95-value')).toHaveTextContent('0.4 weeks');
      expect(screen.getByTestId('mc-p50-date')).toHaveTextContent('2026-10-27');
    });
  });
});
