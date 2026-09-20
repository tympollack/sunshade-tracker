import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { getTenantEfficiencyMetrics } from '@/lib/services/valueLedgerServer';
import { formatEfficiencyStatementCSV } from '@/lib/services/valueLedgerService';

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
    let startDate = searchParams.get('start_date') || undefined;
    let endDate = searchParams.get('end_date') || undefined;

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

    // Date range validation: end_date >= start_date
    if (startDate && endDate) {
      const startMs = new Date(startDate).getTime();
      const endMs = new Date(endDate).getTime();
      if (!isNaN(startMs) && !isNaN(endMs) && endMs < startMs) {
        return NextResponse.json(
          { error: 'Invalid date range: end_date must be greater than or equal to start_date.' },
          { status: 400 }
        );
      }
    }

    const payload = await getTenantEfficiencyMetrics(targetSlug, {
      startDate,
      endDate,
      period: periodParam === 'all-time' ? 'all-time' : 'monthly',
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
