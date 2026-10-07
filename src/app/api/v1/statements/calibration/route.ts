import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { getEstimationCalibrationTelemetry } from '@/lib/services/estimationCalibrationService';

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

  const d = new Date(trimmed);
  return !isNaN(d.getTime());
}

/**
 * GET /api/v1/statements/calibration
 *
 * Telemetric calibration aggregation endpoint (TASK-TRK-ESTIMATION-CALIBRATION-SVC).
 * Compares planned story-point envelopes against actual cycle times and logged hours.
 * Accepts:
 * - `start_date` (ISO date or YYYY-MM-DD)
 * - `end_date` (ISO date or YYYY-MM-DD)
 * - `period` ('week' | 'month' | 'quarter' | 'year' | 'custom')
 * - `simulate_ratio` (number, e.g. 2.5)
 * - `tenant_slug` (or x-tenant-slug header)
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

    const startDateParam = searchParams.get('start_date');
    const endDateParam = searchParams.get('end_date');
    const simulateRatioParam = searchParams.get('simulate_ratio');

    // Strict ISO date format validation
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

    if (startDateParam && endDateParam) {
      const startMs = new Date(startDateParam).getTime();
      const endMs = new Date(endDateParam).getTime();
      if (endMs < startMs) {
        return NextResponse.json(
          { error: 'Invalid date range: end_date must be greater than or equal to start_date.' },
          { status: 400 }
        );
      }
    }

    let simulatedRatio: number | undefined;
    if (simulateRatioParam) {
      const parsed = parseFloat(simulateRatioParam);
      if (!isNaN(parsed) && parsed > 0) {
        simulatedRatio = parsed;
      }
    }

    const periodParam = searchParams.get('period');
    let periodLabel: string | undefined;
    if (periodParam === 'week' && startDateParam && endDateParam) {
      periodLabel = `Weekly Calibration (${startDateParam.slice(0, 10)} to ${endDateParam.slice(0, 10)})`;
    }

    let resolvedStartDate = startDateParam || undefined;
    if (resolvedStartDate && /^\d{4}-\d{2}-\d{2}$/.test(resolvedStartDate)) {
      resolvedStartDate = `${resolvedStartDate}T00:00:00.000Z`;
    }

    let resolvedEndDate = endDateParam || undefined;
    if (resolvedEndDate && /^\d{4}-\d{2}-\d{2}$/.test(resolvedEndDate)) {
      resolvedEndDate = `${resolvedEndDate}T23:59:59.999Z`;
    }

    const payload = await getEstimationCalibrationTelemetry(targetSlug, {
      startDate: resolvedStartDate,
      endDate: resolvedEndDate,
      periodLabel,
      simulatedRatio,
    });

    return NextResponse.json(payload, { status: 200 });
  } catch (err: any) {
    console.error('Error computing estimation calibration:', err);
    return NextResponse.json(
      { error: err.message || 'Internal server error computing calibration metrics' },
      { status: 500 }
    );
  }
}
