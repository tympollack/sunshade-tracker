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

    // Default to the authenticated tenant slug if none or if matches
    const targetSlug = tenantSlugParam || tenant.slug;

    // Safety: ensure user cannot query another tenant's metrics unless they are authorized for it
    if (targetSlug !== tenant.slug && auth.context.role !== 'owner') {
      return NextResponse.json(
        { error: `Unauthorized to access metrics for workspace '${targetSlug}'` },
        { status: 403 }
      );
    }

    const payload = await getTenantEfficiencyMetrics(targetSlug);

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
