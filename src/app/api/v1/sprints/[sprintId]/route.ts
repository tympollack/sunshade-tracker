import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { SprintRelationalService, UpdateSprintInput } from '@/lib/services/sprintRelationalService';

interface RouteParams {
  params: Promise<{ sprintId: string }>;
}

/**
 * GET /api/v1/sprints/[sprintId]
 * Get sprint details by UUID.
 */
export async function GET(req: NextRequest, props: RouteParams) {
  try {
    const auth = await authenticate(req);
    if (auth.errorResponse) return auth.errorResponse;

    const { tenant } = auth.context;
    const { sprintId } = await props.params;

    const { data, error } = await SprintRelationalService.getSprintById(tenant.id, sprintId);
    if (error) {
      const status = error === 'Sprint not found' ? 404 : 400;
      return NextResponse.json({ error }, { status });
    }

    return NextResponse.json({ sprint: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * PATCH /api/v1/sprints/[sprintId]
 * Update sprint fields and synchronize associated work items.
 */
export async function PATCH(req: NextRequest, props: RouteParams) {
  try {
    const auth = await authenticate(req);
    if (auth.errorResponse) return auth.errorResponse;

    if (auth.context.role === 'viewer') {
      return NextResponse.json(
        { error: 'Forbidden: Viewer role cannot modify sprints' },
        { status: 403 }
      );
    }

    const { tenant } = auth.context;
    const { sprintId } = await props.params;
    const updates: UpdateSprintInput = await req.json();

    const { data, error } = await SprintRelationalService.updateSprint(tenant.id, sprintId, updates);
    if (error) {
      const status = error === 'Sprint not found' ? 404 : 400;
      return NextResponse.json({ error }, { status });
    }

    return NextResponse.json({ sprint: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/v1/sprints/[sprintId]
 * Delete sprint and disassociate work items.
 */
export async function DELETE(req: NextRequest, props: RouteParams) {
  try {
    const auth = await authenticate(req);
    if (auth.errorResponse) return auth.errorResponse;

    if (auth.context.role === 'viewer') {
      return NextResponse.json(
        { error: 'Forbidden: Viewer role cannot modify sprints' },
        { status: 403 }
      );
    }

    const { tenant } = auth.context;
    const { sprintId } = await props.params;

    const { success, error } = await SprintRelationalService.deleteSprint(tenant.id, sprintId);
    if (error || !success) {
      const status = error === 'Sprint not found' ? 404 : 400;
      return NextResponse.json({ error: error || 'Failed to delete sprint' }, { status });
    }

    return NextResponse.json({ success: true, message: 'Sprint deleted successfully' });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
