import { NextRequest, NextResponse } from 'next/server';
import { createServerClient, createServiceClient } from '@/lib/supabase-server';
import { z } from 'zod';

const TransferSchema = z.object({
  /** The new owner's Hub user ID (from supabase auth.users.id) */
  new_owner_id: z.string().uuid('new_owner_id must be a valid UUID'),
});

/**
 * POST /api/v1/tenants/[tenantId]/transfer
 *
 * Transfers ownership of a tenant workspace to a different Hub user.
 * Only current 'owner'-role members can initiate a transfer.
 *
 * Multi-workspace: the new owner does NOT need to be workspace-free —
 * they can already belong to other workspaces.
 *
 * After transfer:
 * - tenants.owner_id updated (audit reference)
 * - old owner's tenant_members role downgraded to 'admin'
 * - new owner added to tenant_members as 'owner' (or their role upgraded if already a member)
 */
export async function POST(
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

    const body = await req.json();
    const parsed = TransferSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const { new_owner_id } = parsed.data;

    if (new_owner_id === user.id) {
      return NextResponse.json(
        { error: 'Cannot transfer ownership to yourself' },
        { status: 400 }
      );
    }

    const service = createServiceClient();

    // Verify current user is an 'owner'-role member of this tenant
    const { data: myMembership } = await service
      .from('tenant_members')
      .select('role')
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id)
      .eq('role', 'owner')
      .maybeSingle();

    if (!myMembership) {
      return NextResponse.json(
        { error: 'Tenant not found or you are not an owner of this workspace' },
        { status: 404 }
      );
    }

    // Fetch the tenant for the response payload
    const { data: tenant } = await service
      .from('tenants')
      .select('id, slug, name')
      .eq('id', tenantId)
      .is('deleted_at', null)
      .single();

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found or has been deleted' }, { status: 404 });
    }

    // Verify new owner is a real Hub user
    const { data: newOwnerData, error: newOwnerErr } = await service.auth.admin.getUserById(new_owner_id);
    if (newOwnerErr || !newOwnerData?.user) {
      return NextResponse.json(
        { error: 'New owner Hub account not found. They must sign up for SunShade Hub first.' },
        { status: 404 }
      );
    }

    const now = new Date().toISOString();

    // Update tenants.owner_id (audit reference)
    const { error: tenantUpdateErr } = await service
      .from('tenants')
      .update({
        owner_id: new_owner_id,
        metadata: {
          transferred_from: user.id,
          transferred_at: now,
        },
        updated_at: now,
      })
      .eq('id', tenantId);

    if (tenantUpdateErr) {
      return NextResponse.json(
        { error: `Failed to update tenant record: ${tenantUpdateErr.message}` },
        { status: 500 }
      );
    }

    // Downgrade previous owner from 'owner' → 'admin' in tenant_members
    const { error: downgradeErr } = await service
      .from('tenant_members')
      .update({ role: 'admin' })
      .eq('tenant_id', tenantId)
      .eq('user_id', user.id);

    if (downgradeErr) {
      return NextResponse.json(
        { error: `Failed to downgrade previous owner role: ${downgradeErr.message}` },
        { status: 500 }
      );
    }

    // Upsert new owner into tenant_members as 'owner'
    // If they're already a member, upgrade their role; otherwise insert them.
    const { error: upsertErr } = await service
      .from('tenant_members')
      .upsert(
        { tenant_id: tenantId, user_id: new_owner_id, role: 'owner' },
        { onConflict: 'tenant_id, user_id' }
      );

    if (upsertErr) {
      return NextResponse.json(
        { error: `Failed to set new owner membership: ${upsertErr.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Workspace "${tenant.name}" ownership transferred to user ${new_owner_id}.`,
      tenant: {
        id: tenant.id,
        slug: tenant.slug,
        name: tenant.name,
        new_owner_id,
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 });
  }
}
