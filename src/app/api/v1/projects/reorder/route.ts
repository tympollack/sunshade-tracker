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

    const updates: Array<{ project_id: string; order_index: number }> = [];

    for (const item of rawItems) {
      const projectId = item.project_id || item.id;
      const orderIndex = Number(item.order_index);

      if (!projectId || isNaN(orderIndex)) continue;

      // Verify and fetch project settings
      const { data: currentProj, error: fetchErr } = await supabaseAdmin
        .from('projects')
        .select('id, settings')
        .eq('id', projectId)
        .eq('tenant_id', authCtx.tenant.id)
        .single();

      if (fetchErr || !currentProj) continue;

      const newSettings = {
        ...(currentProj.settings || {}),
        order_index: orderIndex,
      };

      // Update order_index column and settings JSON
      const { error: updateErr } = await supabaseAdmin
        .from('projects')
        .update({
          order_index: orderIndex,
          settings: newSettings,
          updated_at: new Date().toISOString(),
        })
        .eq('id', projectId)
        .eq('tenant_id', authCtx.tenant.id);

      if (updateErr) {
        // Fallback if order_index column does not exist on schema
        await supabaseAdmin
          .from('projects')
          .update({
            settings: newSettings,
            updated_at: new Date().toISOString(),
          })
          .eq('id', projectId)
          .eq('tenant_id', authCtx.tenant.id);
      }

      updates.push({ project_id: projectId, order_index: orderIndex });
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
