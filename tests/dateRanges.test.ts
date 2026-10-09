import { describe, it, expect } from 'vitest';
import {
  getWeekRange,
  getMonthRange,
  getQuarterRange,
  getYearRange,
  stepDateRange,
  isNextPeriodInFuture,
  parseISODate,
  formatISODate,
  getISOWeekNumber,
} from '@/lib/utils/dateRanges';

describe('dateRanges utility suite', () => {
  it('parses and formats ISO dates consistently', () => {
    const d = parseISODate('2026-10-04');
    expect(formatISODate(d)).toBe('2026-10-04');
  });

  it('calculates ISO week boundaries (Monday to Sunday)', () => {
    // 2026-10-04 is a Sunday
    const week = getWeekRange('2026-10-04');
    expect(week.startDate).toBe('2026-09-28'); // Monday
    expect(week.endDate).toBe('2026-10-04');   // Sunday
    expect(week.label).toContain('Sep 28');
    expect(week.label).toContain('Oct 04, 2026');

    // 2026-10-05 is the next Monday
    const nextWeek = getWeekRange('2026-10-05');
    expect(nextWeek.startDate).toBe('2026-10-05');
    expect(nextWeek.endDate).toBe('2026-10-11');
  });

  it('steps week forward and backward by exactly 7 days', () => {
    const current = getWeekRange('2026-10-04');
    const prev = stepDateRange('week', current.startDate, 'prev');
    expect(prev.startDate).toBe('2026-09-21');
    expect(prev.endDate).toBe('2026-09-27');

    const next = stepDateRange('week', current.startDate, 'next');
    expect(next.startDate).toBe('2026-10-05');
    expect(next.endDate).toBe('2026-10-11');
  });

  it('steps month, quarter, and year correctly', () => {
    const month = stepDateRange('month', '2026-10-01', 'prev');
    expect(month.startDate).toBe('2026-09-01');
    expect(month.endDate).toBe('2026-09-30');
    expect(month.label).toBe('Sep 2026');

    const quarter = stepDateRange('quarter', '2026-07-01', 'prev');
    expect(quarter.startDate).toBe('2026-04-01');
    expect(quarter.endDate).toBe('2026-06-30');
    expect(quarter.label).toBe('Q2 2026');

    const year = stepDateRange('year', '2026-01-01', 'prev');
    expect(year.startDate).toBe('2025-01-01');
    expect(year.endDate).toBe('2025-12-31');
    expect(year.label).toBe('2025 Annual');
  });

  it('detects when next period is strictly in future', () => {
    const today = '2026-10-04'; // Sunday of Week 40
    // Current week: Sept 28 – Oct 04. Next week: Oct 05 – Oct 11.
    // Oct 05 is strictly in future relative to Oct 04!
    expect(isNextPeriodInFuture('week', '2026-09-28', today)).toBe(true);

    // Last week: Sept 21 – Sept 27. Next week starts Sept 28 <= Oct 04.
    // Not strictly in future!
    expect(isNextPeriodInFuture('week', '2026-09-21', today)).toBe(false);

    // Current month Oct 2026: next month is Nov 01 > Oct 04 -> true
    expect(isNextPeriodInFuture('month', '2026-10-01', today)).toBe(true);
    // Last month Sep 2026: next month is Oct 01 <= Oct 04 -> false
    expect(isNextPeriodInFuture('month', '2026-09-01', today)).toBe(false);
  });
});
