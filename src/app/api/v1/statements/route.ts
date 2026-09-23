import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { getTenantEfficiencyMetrics } from '@/lib/services/valueLedgerServer';
import { formatEfficiencyStatementCSV } from '@/lib/services/valueLedgerService';

/**
 * Validates that a string is a well-formed ISO 8601 date string and corresponds to a real calendar date.
 * Rejects locale strings, non-ISO formats, and calendar overflows (e.g. 2026-02-31).
 */
function isValidIsoDate(str: string): boolean {
  if (typeof str !== 'string') return false;
  const trimmed = str.trim();
  const isoRegex =
    /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])(?:[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
  const match = trimmed.match(isoRegex);
  if (!match) return false;

  const parts = trimmed.split(/[T ]/);
  const datePart = parts[0];
  const [yearStr, monthStr, dayStr] = datePart.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);
  const day = parseInt(dayStr, 10);

  const isLeapYear = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  const daysInMonth = [
    31,
    isLeapYear ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];

  if (day < 1 || day > daysInMonth[month - 1]) {
    return false;
  }

  if (match[3] !== undefined && match[4] !== undefined) {
    const hour = parseInt(match[3], 10);
    const minute = parseInt(match[4], 10);
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      return false;
    }
    if (match[5] !== undefined) {
      const second = parseInt(match[5], 10);
      if (second < 0 || second > 59) {
        return false;
      }
    }
  }

  const d = new Date(trimmed);
  return !isNaN(d.getTime());
}

/**
 * GET /api/v1/statements
 *
 * Dynamic Statement and Value Realization aggregation endpoint (FEAT-TRK-DYNAMIC-STATEMENT-REPORTS).
 * Accepts dynamic date ranges:
 * - `start_date` (ISO date string or YYYY-MM-DD)
 * - `end_date` (ISO date string or YYYY-MM-DD)
 * - `period` ('month' | 'quarter' | 'year' | 'custom' | 'all-time')
 * - `format` ('json' | 'csv')
 * - `tenant_slug` (or header `x-tenant-slug`)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (auth.errorResponse) return auth.errorResponse;

    const { tenant } = auth.context;
    const { searchParams } = new URL(req.url);
    const tenantSlugParam = searchParams.get('tenant_slug') || req.headers.get('x-tenant-slug');

    const targetSlug = tenantSlugParam || tenant.slug;

    if (targetSlug !== tenant.slug) {
      return NextResponse.json(
        { error: `Unauthorized: You do not have permission to access workspace '${targetSlug}'.` },
        { status: 403 }
      );
    }

    const periodParam = (searchParams.get('period') || 'month').toLowerCase();
    const startDateParam = searchParams.get('start_date');
    const endDateParam = searchParams.get('end_date');

    // Strict ISO date format and calendar validity checks (BUG-TRK-DATE-VALIDATION)
    if (startDateParam && !isValidIsoDate(startDateParam)) {
      return NextResponse.json(
        { error: 'Invalid date: start_date must be a valid ISO date.' },
        { status: 400 }
      );
    }
    if (endDateParam && !isValidIsoDate(endDateParam)) {
      return NextResponse.json(
        { error: 'Invalid date: end_date must be a valid ISO date.' },
        { status: 400 }
      );
    }

    let startDate = startDateParam || undefined;
    let endDate = endDateParam || undefined;

    const now = new Date();

    // Derive date range if period preset is provided and explicit dates are missing
    if (!startDate || !endDate) {
      if (periodParam === 'year') {
        startDate = new Date(now.getFullYear(), 0, 1).toISOString();
        endDate = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999).toISOString();
      } else if (periodParam === 'quarter') {
        const currentQuarter = Math.floor(now.getMonth() / 3);
        startDate = new Date(now.getFullYear(), currentQuarter * 3, 1).toISOString();
        endDate = new Date(now.getFullYear(), currentQuarter * 3 + 3, 0, 23, 59, 59, 999).toISOString();
      } else if (periodParam === 'month') {
        startDate = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).toISOString();
      }
    }

    // Date range validation: end_date >= start_date (BUG-TRK-DATE-VALIDATION)
    if (startDate && endDate) {
      const startMs = new Date(startDate).getTime();
      const endMs = new Date(endDate).getTime();
      if (endMs < startMs) {
        return NextResponse.json(
          { error: 'Invalid date range: end_date must be greater than or equal to start_date.' },
          { status: 400 }
        );
      }
    }

    const period =
      periodParam === 'all-time'
        ? 'all-time'
        : periodParam === 'year'
        ? 'year'
        : periodParam === 'quarter'
        ? 'quarter'
        : periodParam === 'month'
        ? 'monthly'
        : 'custom';

    const payload = await getTenantEfficiencyMetrics(targetSlug, {
      startDate,
      endDate,
      period,
      periodMultiplier:
        periodParam === 'year' ? 12 : periodParam === 'quarter' ? 3 : periodParam === 'month' ? 1 : undefined,
    });

    // Custom period label decoration
    if (periodParam === 'quarter') {
      const dStart = new Date(startDate!);
      const q = Math.floor(dStart.getMonth() / 3) + 1;
      payload.dateRange.periodLabel = `Q${q} ${dStart.getFullYear()} Statement`;
    } else if (periodParam === 'year') {
      const dStart = new Date(startDate!);
      payload.dateRange.periodLabel = `${dStart.getFullYear()} Annual Statement`;
    } else if (periodParam === 'custom' && startDate && endDate) {
      payload.dateRange.periodLabel = `Custom Statement (${startDate.slice(0, 10)} to ${endDate.slice(0, 10)})`;
    }

    const format = searchParams.get('format');
    if (format === 'csv') {
      const csv = formatEfficiencyStatementCSV(payload);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="statement-${targetSlug}-${periodParam}.csv"`,
        },
      });
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (err: any) {
    console.error('Error generating statement:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error generating statement' },
      { status: 500 }
    );
  }
}
