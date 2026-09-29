import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { getSprintHealthReport } from '@/lib/services/sprintAnalyticsServer';

/**
 * GET /api/v1/sprints/analytics?sprint_id=...
 *
 * Query rolling 3-sprint velocity, scope churn factor, commitment predictability,
 * and cycle lead times for an enterprise sprint.
 *
 * Supports:
 * - Query param `?sprint_id=...` or `?sprint_name=...`
 * - Dual authentication (Supabase session token or Bearer API key)
 * - Strict multi-tenant isolation
 */
export async function GET(req: NextRequest) {
  try {
    // 1. Dual authentication (session cookies or Bearer API key)
    const auth = await authenticate(req);
    if (auth.errorResponse) return auth.errorResponse;

    const { tenant } = auth.context;
    const { searchParams } = new URL(req.url);

    // Multi-tenant check
    const tenantSlugParam = searchParams.get('tenant_slug') || req.headers.get('x-tenant-slug');
    const targetSlug = tenantSlugParam || tenant.slug;

    if (targetSlug !== tenant.slug) {
      return NextResponse.json(
        { error: `Unauthorized: You do not have permission to access workspace '${targetSlug}'.` },
        { status: 403 }
      );
    }

    const sprintId =
      searchParams.get('sprint_id') ||
      searchParams.get('sprint_name') ||
      searchParams.get('sprint');

    if (!sprintId) {
      return NextResponse.json(
        { error: 'sprint_id query parameter is required (e.g. ?sprint_id=sprint-2026-q4)' },
        { status: 400 }
      );
    }

    const report = await getSprintHealthReport(targetSlug, sprintId);

    return NextResponse.json(report, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to retrieve sprint analytics telemetry' },
      { status: 500 }
    );
  }
}
