import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/db';
import { authenticate } from '@/lib/auth-guard';

/**
 * POST /api/v1/projects/reorder
 *
 * Persists updated project ordering indices (FEAT-TRK-PROJECT-MODAL-REORDER).
 * Accepts array of { project_id, order_index } or { items: [...] }.
 */
export async function POST(req: NextRequest) {
  const auth = await authenticate(req);
  if (auth.errorResponse) return auth.errorResponse;
  const authCtx = auth.context;

  if (authCtx.role !== 'owner' && authCtx.role !== 'admin') {
    return NextResponse.json(
      { error: 'Only workspace owners and admins can reorder projects' },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const rawItems: any = Array.isArray(body)
      ? body
      : body.items || body.projects || [];

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      return NextResponse.json(
        { error: 'Payload must contain a non-empty array of items with project_id and order_index' },
        { status: 400 }
      );
    }

    const validItems = rawItems
      .map((item: any) => ({
        projectId: item.project_id || item.id,
        orderIndex: Number(item.order_index),
      }))
      .filter((i: any) => i.projectId && !isNaN(i.orderIndex));

    if (validItems.length === 0) {
      return NextResponse.json(
        { error: 'Payload must contain a non-empty array of items with project_id and order_index' },
        { status: 400 }
      );
    }

    const projectIds = validItems.map((i) => i.projectId);

    // Batch query all target projects in a single query (FEAT-TRK-BATCH-REORDER)
    const { data: currentProjects, error: fetchErr } = await supabaseAdmin
      .from('projects')
      .select('id, settings')
      .in('id', projectIds)
      .eq('tenant_id', authCtx.tenant.id);

    if (fetchErr) {
      return NextResponse.json(
        { error: `Failed to load projects: ${fetchErr.message}` },
        { status: 500 }
      );
    }

    const projectMap = new Map((currentProjects || []).map((p: any) => [p.id, p]));

    // Parallelize updates with Promise.all
    const now = new Date().toISOString();
    const updateResults = await Promise.all(
      validItems.map(async ({ projectId, orderIndex }) => {
        const currentProj = projectMap.get(projectId);
        if (!currentProj) return null;

        const newSettings = {
          ...(currentProj.settings || {}),
          order_index: orderIndex,
        };

        let success = false;

        // Try updating order_index column and settings JSON
        const { error: updateErr } = await supabaseAdmin
          .from('projects')
          .update({
            order_index: orderIndex,
            settings: newSettings,
            updated_at: now,
          })
          .eq('id', projectId)
          .eq('tenant_id', authCtx.tenant.id);

        if (!updateErr) {
          success = true;
        } else {
          // Fallback if order_index column does not exist on schema
          const { error: fallbackErr } = await supabaseAdmin
            .from('projects')
            .update({
              settings: newSettings,
              updated_at: now,
            })
            .eq('id', projectId)
            .eq('tenant_id', authCtx.tenant.id);

          if (!fallbackErr) {
            success = true;
          }
        }

        if (success) {
          return { project_id: projectId, order_index: orderIndex };
        }
        return null;
      })
    );

    const updates = updateResults.filter(Boolean) as Array<{ project_id: string; order_index: number }>;

    if (updates.length < validItems.length) {
      return NextResponse.json(
        {
          error: `Failed to persist complete project order: ${updates.length} of ${validItems.length} projects updated successfully`,
          updated_count: updates.length,
          items: updates,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      updated_count: updates.length,
      items: updates,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Failed to reorder projects' },
      { status: 500 }
    );
  }
}

export const PATCH = POST;
export const PUT = POST;
