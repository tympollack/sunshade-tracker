import { describe, it, expect } from 'vitest';
import {
  calculateRollingVelocity,
  calculateSayDoRatio,
  calculateSprintVolatility,
} from '@/lib/analytics/velocity-forecaster';

describe('TASK-TRK-METRICS-UTIL: velocity-forecaster', () => {
  describe('calculateRollingVelocity', () => {
    it('returns 0 for empty or invalid input', () => {
      expect(calculateRollingVelocity([])).toBe(0);
      expect(calculateRollingVelocity(null as any)).toBe(0);
      expect(calculateRollingVelocity(undefined as any)).toBe(0);
    });

    it('returns arithmetic mean when fewer than 3 sprints are provided', () => {
      expect(calculateRollingVelocity([24])).toBe(24);
      expect(calculateRollingVelocity([20, 10])).toBe(15);
      expect(calculateRollingVelocity([13, 14])).toBe(13.5);
    });

    it('computes 50/30/20 weighted velocity for 3 or more sprints', () => {
      // 20*0.5 + 15*0.3 + 10*0.2 = 10 + 4.5 + 2 = 16.5
      expect(calculateRollingVelocity([20, 15, 10])).toBe(16.5);

      // Takes top 3 most recent
      // 30*0.5 + 20*0.3 + 10*0.2 = 15 + 6 + 2 = 23
      expect(calculateRollingVelocity([30, 20, 10, 5, 2])).toBe(23);
    });

    it('handles floating point rounding cleanly', () => {
      // 21.3*0.5 + 14.7*0.3 + 18.2*0.2 = 10.65 + 4.41 + 3.64 = 18.7
      expect(calculateRollingVelocity([21.3, 14.7, 18.2])).toBe(18.7);
    });

    it('handles non-numeric elements gracefully', () => {
      expect(calculateRollingVelocity([NaN, 20, 10] as any)).toBe(8);
    });
  });

  describe('calculateSayDoRatio', () => {
    it('computes percentage delivered vs committed rounded to 1 decimal place', () => {
      expect(calculateSayDoRatio(50, 40)).toBe(80);
      expect(calculateSayDoRatio(40, 50)).toBe(125);
      expect(calculateSayDoRatio(30, 10)).toBe(33.3);
      expect(calculateSayDoRatio(100, 100)).toBe(100);
    });

    it('handles zero or negative committed points gracefully', () => {
      expect(calculateSayDoRatio(0, 10)).toBe(0);
      expect(calculateSayDoRatio(0, 0)).toBe(0);
      expect(calculateSayDoRatio(-10, 5)).toBe(0);
      expect(calculateSayDoRatio(NaN, 5)).toBe(0);
    });
  });

  describe('calculateSprintVolatility', () => {
    it('computes net scope volatility percentage', () => {
      expect(calculateSprintVolatility(100, 20, 5)).toBe(15);
      expect(calculateSprintVolatility(100, 5, 20)).toBe(-15);
      expect(calculateSprintVolatility(100, 10, 10)).toBe(0);
      expect(calculateSprintVolatility(30, 7, 2)).toBe(16.7);
    });

    it('handles zero or negative baseline points gracefully', () => {
      expect(calculateSprintVolatility(0, 10, 2)).toBe(0);
      expect(calculateSprintVolatility(-50, 10, 2)).toBe(0);
      expect(calculateSprintVolatility(NaN, 10, 2)).toBe(0);
    });
  });
});
