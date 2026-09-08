import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { getTenantEfficiencyMetrics } from '@/lib/services/valueLedgerServer';
import { formatEfficiencyStatementCSV } from '@/lib/services/valueLedgerService';

/**
 * GET /api/v1/tenants/efficiency
 *
 * Query real-time operational drag rollups and efficiency metrics for the workspace.
 * Supports:
 * - Query param `?format=csv` for raw CSV export
 * - Query param `?period=monthly` (default) or `?period=all-time`
 * - Query param `?tenant_slug=...` or header `x-tenant-slug` for tenant context
 * - Dual authentication (session cookies or Bearer API keys)
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (auth.errorResponse) return auth.errorResponse;

    const { tenant } = auth.context;
    const { searchParams } = new URL(req.url);
    const tenantSlugParam = searchParams.get('tenant_slug') || req.headers.get('x-tenant-slug');

    // Default to the authenticated tenant slug
    const targetSlug = tenantSlugParam || tenant.slug;

    // Strict multi-tenant isolation: caller may ONLY access the workspace they authenticated against
    if (targetSlug !== tenant.slug) {
      return NextResponse.json(
        { error: `Unauthorized: You do not have permission to access workspace '${targetSlug}'.` },
        { status: 403 }
      );
    }

    const periodParam = searchParams.get('period');
    const period = periodParam === 'all-time' ? 'all-time' : 'monthly';
    const startDate = searchParams.get('start_date') || undefined;
    const endDate = searchParams.get('end_date') || undefined;

    const payload = await getTenantEfficiencyMetrics(targetSlug, {
      period,
      startDate,
      endDate,
    });

    const format = searchParams.get('format');
    if (format === 'csv') {
      const csv = formatEfficiencyStatementCSV(payload);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="efficiency-statement-${targetSlug}.csv"`,
        },
      });
    }

    return NextResponse.json(payload, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to generate efficiency statement' },
      { status: 500 }
    );
  }
}
