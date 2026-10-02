import { NextRequest, NextResponse } from 'next/server';
import { authenticate } from '@/lib/auth-guard';
import { SprintRelationalService, CreateSprintInput } from '@/lib/services/sprintRelationalService';

/**
 * GET /api/v1/sprints
 * List all configured relational sprints for the caller's workspace.
 */
export async function GET(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (auth.errorResponse) return auth.errorResponse;

    const { tenant } = auth.context;
    const { searchParams } = new URL(req.url);

    const projectId = searchParams.get('project_id') || undefined;
    const status = searchParams.get('status') || undefined;
    const isActiveParam = searchParams.get('is_active');
    const isActive = isActiveParam !== null ? isActiveParam === 'true' : undefined;

    const { data, error } = await SprintRelationalService.listSprints(tenant.id, {
      projectId,
      status,
      isActive,
    });

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ sprints: data });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * POST /api/v1/sprints
 * Create a new sprint in tracker.sprints.
 */
export async function POST(req: NextRequest) {
  try {
    const auth = await authenticate(req);
    if (auth.errorResponse) return auth.errorResponse;

    const { tenant } = auth.context;
    const body: CreateSprintInput = await req.json();

    if (!body.name || !body.name.trim()) {
      return NextResponse.json(
        { error: 'Field "name" is required for sprint creation' },
        { status: 400 }
      );
    }

    const { data, error } = await SprintRelationalService.createSprint(tenant.id, body);

    if (error) {
      return NextResponse.json({ error }, { status: 400 });
    }

    return NextResponse.json({ sprint: data }, { status: 201 });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
