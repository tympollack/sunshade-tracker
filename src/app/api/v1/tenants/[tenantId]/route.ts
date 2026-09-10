import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase-server';

/**
 * PATCH /api/v1/tenants/[tenantId]
 *
 * Allows workspace owner or admin to update workspace settings (e.g. is_public toggle, name).
 */
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ tenantId: string }> }
) {
  try {
    const { tenantId } = await params;

    const supabase = await createServerClient();
    const { data: { user }, error: userErr } = await supabase.auth.getUser();

    if (userErr || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const service = createServiceClient();

    // Verify current user is an owner or admin of this tenant
    const { data: membership } = await service
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .maybeSingle();

    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return NextResponse.json(
        { error: 'Forbidden: only workspace owners and admins can modify workspace settings' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { is_public, name } = body;

    // Fetch current tenant
    const { data: currentTenant, error: fetchErr } = await service
      .from('tenants')
      .select('*')
      .eq('id', tenantId)
      .is('deleted_at', null)
      .single();

    if (fetchErr || !currentTenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 });
    }

    const now = new Date().toISOString();
    const updates: Record<string, any> = { updated_at: now };

    if (name && typeof name === 'string') {
      updates.name = name.trim();
    }

    if (typeof is_public === 'boolean') {
      updates.metadata = {
        ...(currentTenant.metadata || {}),
        is_public,
      };
    }

    const { data: updatedTenant, error: updateErr } = await service
      .from('tenants')
      .update(updates)
      .eq('id', tenantId)
      .select('id, slug, name, tier, owner_id, metadata, updated_at')
      .single();

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      tenant: updatedTenant,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
