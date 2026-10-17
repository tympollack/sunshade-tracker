import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { SprintDiffService } from '@/lib/services/sprintDiffService';

interface RouteParams {
  params: Promise<{ sprintId: string }>;
}

/**
 * GET /api/v1/sprints/[sprintId]/diff
 *
 * Query parameters:
 * - base: Base snapshot ID or 'baseline' (defaults to commitment baseline)
 * - target: Target snapshot ID or 'live' (defaults to current live board state)
 * - project_id: Optional project scope filter
 */
export async function GET(req: NextRequest, props: RouteParams) {
  try {
    const auth = await authenticate(req);
    if (auth.errorResponse) return auth.errorResponse;

    const { tenant } = auth.context;
    const { sprintId } = await props.params;
    const { searchParams } = new URL(req.url);

    // Multi-tenant isolation verification
    const tenantSlugParam = searchParams.get('tenant_slug') || req.headers.get('x-tenant-slug');
    if (tenantSlugParam && tenantSlugParam !== tenant.slug) {
      return NextResponse.json(
        { error: `Unauthorized: You do not have permission to access workspace '${tenantSlugParam}'.` },
        { status: 403 }
      );
    }

    const baseSnapshotId = searchParams.get('base') || searchParams.get('baseSnapshotId') || undefined;
    const targetSnapshotId = searchParams.get('target') || searchParams.get('targetSnapshotId') || undefined;
    const projectId = searchParams.get('project_id') || searchParams.get('project') || undefined;

    const { data, error } = await SprintDiffService.getSprintSnapshotDiff(tenant.id, sprintId, {
      baseSnapshotId,
      targetSnapshotId,
      projectId,
    });

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ diff: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
