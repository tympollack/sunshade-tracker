/**
 * Date range utilities for Statement temporal stepping and week/month/quarter presets.
 * Follows ISO-8601 calendar conventions (Monday 00:00:00 to Sunday 23:59:59).
 */

export const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

export const MONTH_FULL_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

export type SupportedTimeframe = 'week' | 'month' | 'quarter' | 'year' | 'custom';

export interface DateRangeResult {
  startDate: string; // YYYY-MM-DD
  endDate: string;   // YYYY-MM-DD
  label: string;
}

/**
 * Normalizes any Date or string input to a calendar YYYY-MM-DD string.
 */
export function normalizeDateString(dateInput: Date | string = new Date()): string {
  if (typeof dateInput === 'string') {
    const trimmed = dateInput.trim();
    if (trimmed.includes('T')) return trimmed.split('T')[0];
    const parts = trimmed.split('-');
    if (parts.length === 3 && !isNaN(Number(parts[0])) && !isNaN(Number(parts[1])) && !isNaN(Number(parts[2]))) {
      return `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
    }
  }
  const d = dateInput instanceof Date && !isNaN(dateInput.getTime()) ? dateInput : new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Safely parses a Date or YYYY-MM-DD string into a normalized UTC date at midnight.
 * Avoids browser timezone drift across day boundaries.
 */
export function parseISODate(dateInput: Date | string = new Date()): Date {
  const dateStr = normalizeDateString(dateInput);
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

/**
 * Formats a Date object to YYYY-MM-DD string using UTC values.
 */
export function formatISODate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * Computes standard ISO-8601 week number (1-53).
 */
export function getISOWeekNumber(d: Date): number {
  const target = new Date(d.getTime());
  const dayNr = (target.getUTCDay() + 6) % 7; // Monday = 0, Sunday = 6
  target.setUTCDate(target.getUTCDate() - dayNr + 3); // Thursday of week
  const firstThursday = target.getTime();
  target.setUTCMonth(0, 1);
  if (target.getUTCDay() !== 4) {
    target.setUTCMonth(0, 1 + ((4 - target.getUTCDay()) + 7) % 7);
  }
  return 1 + Math.ceil((firstThursday - target.getTime()) / (7 * 24 * 3600 * 1000));
}

/**
 * Generates ISO Monday–Sunday date range for a week with an optional week offset.
 * Format: Week WW: MMM DD – MMM DD, YYYY
 */
export function getWeekRange(refDate: Date | string = new Date(), offset: number = 0): DateRangeResult {
  const base = parseISODate(refDate);
  const day = base.getUTCDay(); // 0 is Sun, 1 is Mon, ..., 6 is Sat
  const diffToMonday = day === 0 ? -6 : 1 - day;

  const monday = new Date(base);
  monday.setUTCDate(base.getUTCDate() + diffToMonday + offset * 7);

  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);

  const weekNum = String(getISOWeekNumber(monday)).padStart(2, '0');
  const startMonth = MONTH_NAMES[monday.getUTCMonth()];
  const startDay = String(monday.getUTCDate()).padStart(2, '0');
  const endMonth = MONTH_NAMES[sunday.getUTCMonth()];
  const endDay = String(sunday.getUTCDate()).padStart(2, '0');
  const endYear = sunday.getUTCFullYear();

  const label = `Week ${weekNum}: ${startMonth} ${startDay} \u2013 ${endMonth} ${endDay}, ${endYear}`;

  return {
    startDate: formatISODate(monday),
    endDate: formatISODate(sunday),
    label,
  };
}

/**
 * Computes standard month date range (1st to last day of month).
 */
export function getMonthRange(refDate: Date | string = new Date(), offset: number = 0): DateRangeResult {
  const base = parseISODate(refDate);
  const targetMonth = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1));
  const lastDay = new Date(Date.UTC(targetMonth.getUTCFullYear(), targetMonth.getUTCMonth() + 1, 0));

  const label = `${MONTH_NAMES[targetMonth.getUTCMonth()]} ${targetMonth.getUTCFullYear()}`;

  return {
    startDate: formatISODate(targetMonth),
    endDate: formatISODate(lastDay),
    label,
  };
}

/**
 * Computes standard quarter date range (Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec).
 */
export function getQuarterRange(refDate: Date | string = new Date(), offset: number = 0): DateRangeResult {
  const base = parseISODate(refDate);
  const currentQuarter = Math.floor(base.getUTCMonth() / 3);
  const targetQuarter = currentQuarter + offset;

  const startD = new Date(Date.UTC(base.getUTCFullYear(), targetQuarter * 3, 1));
  const endD = new Date(Date.UTC(startD.getUTCFullYear(), startD.getUTCMonth() + 3, 0));

  const qNum = Math.floor(startD.getUTCMonth() / 3) + 1;
  const label = `Q${qNum} ${startD.getUTCFullYear()}`;

  return {
    startDate: formatISODate(startD),
    endDate: formatISODate(endD),
    label,
  };
}

/**
 * Computes standard year date range (Jan 1 to Dec 31).
 */
export function getYearRange(refDate: Date | string = new Date(), offset: number = 0): DateRangeResult {
  const base = parseISODate(refDate);
  const targetYear = base.getUTCFullYear() + offset;

  const startD = new Date(Date.UTC(targetYear, 0, 1));
  const endD = new Date(Date.UTC(targetYear, 11, 31));

  const label = `${targetYear} Annual`;

  return {
    startDate: formatISODate(startD),
    endDate: formatISODate(endD),
    label,
  };
}

/**
 * Resolves standard date range for any timeframe preset.
 */
export function getPeriodRange(
  timeframe: SupportedTimeframe,
  refDate: Date | string = new Date()
): DateRangeResult {
  switch (timeframe) {
    case 'week':
      return getWeekRange(refDate, 0);
    case 'month':
      return getMonthRange(refDate, 0);
    case 'quarter':
      return getQuarterRange(refDate, 0);
    case 'year':
      return getYearRange(refDate, 0);
    case 'custom':
    default: {
      const iso = normalizeDateString(refDate);
      return { startDate: iso, endDate: iso, label: 'Custom Range' };
    }
  }
}

/**
 * Steps a date range forward or backward by exactly 1 period unit.
 *
 * @param timeframe 'week' | 'month' | 'quarter' | 'year' | 'custom'
 * @param currentStartDate Current period start date (YYYY-MM-DD)
 * @param direction 1 | -1 | 'next' | 'prev'
 */
export function stepDateRange(
  timeframe: SupportedTimeframe | string,
  currentStartDate: string,
  direction: 1 | -1 | 'next' | 'prev'
): DateRangeResult {
  const dir = direction === 'next' || direction === 1 ? 1 : -1;
  const current = parseISODate(currentStartDate);

  switch (timeframe) {
    case 'week': {
      const nextDate = new Date(current);
      nextDate.setUTCDate(current.getUTCDate() + dir * 7);
      return getWeekRange(formatISODate(nextDate), 0);
    }
    case 'month': {
      return getMonthRange(formatISODate(current), dir);
    }
    case 'quarter': {
      return getQuarterRange(formatISODate(current), dir);
    }
    case 'year': {
      return getYearRange(formatISODate(current), dir);
    }
    default: {
      return {
        startDate: currentStartDate,
        endDate: currentStartDate,
        label: 'Custom',
      };
    }
  }
}

/**
 * Determines if the next interval in the timeline is strictly in the future relative to the reference date.
 * Used to disable the `Next ›` button so users cannot step into non-existent future periods.
 */
export function isNextPeriodInFuture(
  timeframe: SupportedTimeframe | string,
  currentStartDate: string,
  refDate: Date | string = new Date()
): boolean {
  if (timeframe === 'custom') return false;
  const nextRange = stepDateRange(timeframe, currentStartDate, 1);
  const todayDate = parseISODate(refDate);
  const nextStart = parseISODate(nextRange.startDate);
  return nextStart.getTime() > todayDate.getTime();
}
