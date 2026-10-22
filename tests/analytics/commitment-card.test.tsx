import { describe, it, expect } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import {
  calculateSayDoPercentage,
  formatSayDoPercentage,
  getSayDoBadge,
} from '@/lib/analytics/metric-calculators';
import { CommitmentCard } from '@/components/analytics/CommitmentCard';

describe('BUG-TRK-ANALYTICS-FLOAT-PRECISION: Say/Do precision & formatting suite', () => {
  describe('calculateSayDoPercentage', () => {
    it('accurately calculates ratio percentage for matching committed and delivered points (e.g. 472/472 -> 100%)', () => {
      expect(calculateSayDoPercentage(472, 472)).toBe(100);
      expect(calculateSayDoPercentage(50, 50)).toBe(100);
    });

    it('clamps fractional percentages to 1 decimal place', () => {
      expect(calculateSayDoPercentage(30, 10)).toBe(33.3);
      expect(calculateSayDoPercentage(7, 6)).toBe(85.7);
    });

    it('correctly handles over-delivered sprints exceeding 100%', () => {
      expect(calculateSayDoPercentage(40, 50)).toBe(125);
      expect(calculateSayDoPercentage(20, 35)).toBe(175);
    });

    it('handles zero or negative inputs cleanly without NaN or division-by-zero errors', () => {
      expect(calculateSayDoPercentage(0, 10)).toBe(0);
      expect(calculateSayDoPercentage(-5, 10)).toBe(0);
      expect(calculateSayDoPercentage(undefined, 10)).toBe(0);
      expect(calculateSayDoPercentage(50, 0)).toBe(0);
    });
  });

  describe('formatSayDoPercentage', () => {
    it('renders clean integers without decimal notation', () => {
      expect(formatSayDoPercentage(100)).toBe('100%');
      expect(formatSayDoPercentage(89)).toBe('89%');
      expect(formatSayDoPercentage(188)).toBe('188%');
      expect(formatSayDoPercentage(0)).toBe('0%');
    });

    it('eliminates floating point precision leaks and formats to max 1 decimal place', () => {
      expect(formatSayDoPercentage(88.59999999999999)).toBe('88.6%');
      expect(formatSayDoPercentage(187.80000000000001)).toBe('187.8%');
      expect(formatSayDoPercentage(33.333333333333336)).toBe('33.3%');
    });

    it('handles invalid numbers safely', () => {
      expect(formatSayDoPercentage(NaN)).toBe('0%');
    });
  });

  describe('getSayDoBadge', () => {
    it('returns Healthy (emerald) when ratio is between 85% and 115%', () => {
      const badge85 = getSayDoBadge(85, 0);
      expect(badge85.label).toBe('Healthy');
      expect(badge85.colorClasses).toContain('text-emerald-400');

      const badge100 = getSayDoBadge(100, 5);
      expect(badge100.label).toBe('Healthy');

      const badge115 = getSayDoBadge(115, -10);
      expect(badge115.label).toBe('Healthy');
    });

    it('returns Over-Delivered (purple) when ratio exceeds 115%', () => {
      const badge120 = getSayDoBadge(120, 0);
      expect(badge120.label).toBe('Over-Delivered');
      expect(badge120.colorClasses).toContain('text-purple-400');
    });

    it('returns Moderate Drift (amber) when ratio is between 70% and 84.9%', () => {
      const badge75 = getSayDoBadge(75, 5);
      expect(badge75.label).toBe('Moderate Drift');
      expect(badge75.colorClasses).toContain('text-amber-400');
    });

    it('returns Scope Volatile (red) when churn exceeds threshold or ratio is under 70%', () => {
      const volatileByChurn = getSayDoBadge(95, 25, 20);
      expect(volatileByChurn.label).toBe('Scope Volatile');
      expect(volatileByChurn.colorClasses).toContain('text-red-400');

      const volatileByRatio = getSayDoBadge(65, 5, 20);
      expect(volatileByRatio.label).toBe('Scope Volatile');
      expect(volatileByRatio.colorClasses).toContain('text-red-400');
    });
  });

  describe('CommitmentCard component', () => {
    it('displays 100% when delivered points equals committed points (472/472)', () => {
      render(<CommitmentCard committedPoints={472} deliveredPoints={472} />);
      expect(screen.getByTestId('commitment-say-do-value')).toHaveTextContent('100%');
      expect(screen.getByTestId('commitment-badge')).toHaveTextContent('Healthy');
    });

    it('renders cleanly formatted decimal percentage without floating point leak', () => {
      render(<CommitmentCard sayDoRatio={88.59999999999999} />);
      expect(screen.getByTestId('commitment-say-do-value')).toHaveTextContent('88.6%');
      expect(screen.getByTestId('commitment-badge')).toHaveTextContent('Healthy');
    });

    it('handles over-delivered sprint points with Over-Delivered badge', () => {
      render(<CommitmentCard committedPoints={100} deliveredPoints={125} />);
      expect(screen.getByTestId('commitment-say-do-value')).toHaveTextContent('125%');
      expect(screen.getByTestId('commitment-badge')).toHaveTextContent('Over-Delivered');
    });

    it('flags high scope volatility and displays configured threshold in tooltip', () => {
      render(
        <CommitmentCard
          committedPoints={100}
          deliveredPoints={95}
          scopeVolatility={28}
          volatilityThreshold={25}
        />
      );
      expect(screen.getByTestId('commitment-say-do-value')).toHaveTextContent('95%');
      expect(screen.getByTestId('commitment-badge')).toHaveTextContent('Scope Volatile');
      expect(screen.getByTestId('tooltip-commitment-badge')).toHaveAttribute(
        'data-tooltip-content',
        expect.stringContaining('>25%')
      );
    });
  });
});
