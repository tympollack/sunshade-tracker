'use server';

import { createServerClient } from '@/lib/supabase-server';
import { supabaseAdmin } from '@/lib/db';
import {
  SprintRelationalService,
  CreateSprintInput,
  UpdateSprintInput,
  RelationalSprintRecord,
} from '@/lib/services/sprintRelationalService';

async function resolveUserTenant(tenantSlug: string) {
  const supabase = await createServerClient();
  const {
    data: { user },
    error: userErr,
  } = await supabase.auth.getUser();

  if (userErr || !user) {
    return { user: null, tenantId: null, error: 'Unauthorized: Session required' };
  }

  // Find tenant by slug
  const { data: tenant } = await supabaseAdmin
    .from('tenants')
    .select('id, slug, owner_id')
    .eq('slug', tenantSlug)
    .is('deleted_at', null)
    .maybeSingle();

  if (!tenant) {
    return { user, tenantId: null, error: 'Tenant workspace not found' };
  }

  // Check membership or ownership
  if (tenant.owner_id === user.id) {
    return { user, tenantId: tenant.id, error: null };
  }

  const { data: member } = await supabaseAdmin
    .from('tenant_members')
    .select('role')
    .eq('tenant_id', tenant.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (!member) {
    return { user, tenantId: null, error: 'Forbidden: You do not have access to this workspace' };
  }

  return { user, tenantId: tenant.id, error: null };
}

export async function listSprintsAction(
  tenantSlug: string,
  options?: { projectId?: string; status?: string; isActive?: boolean }
): Promise<{ success: boolean; data?: RelationalSprintRecord[]; error?: string }> {
  try {
    const { tenantId, error: authErr } = await resolveUserTenant(tenantSlug);
    if (authErr || !tenantId) {
      return { success: false, error: authErr || 'Unauthorized' };
    }

    const { data, error } = await SprintRelationalService.listSprints(tenantId, options);
    if (error) {
      return { success: false, error };
    }

    return { success: true, data: data || [] };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to list sprints' };
  }
}

export async function createSprintAction(
  tenantSlug: string,
  input: CreateSprintInput
): Promise<{ success: boolean; data?: RelationalSprintRecord; error?: string }> {
  try {
    const { tenantId, error: authErr } = await resolveUserTenant(tenantSlug);
    if (authErr || !tenantId) {
      return { success: false, error: authErr || 'Unauthorized' };
    }

    const { data, error } = await SprintRelationalService.createSprint(tenantId, input);
    if (error) {
      return { success: false, error };
    }

    return { success: true, data: data || undefined };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to create sprint' };
  }
}

export async function updateSprintAction(
  tenantSlug: string,
  sprintId: string,
  updates: UpdateSprintInput
): Promise<{ success: boolean; data?: RelationalSprintRecord; error?: string }> {
  try {
    const { tenantId, error: authErr } = await resolveUserTenant(tenantSlug);
    if (authErr || !tenantId) {
      return { success: false, error: authErr || 'Unauthorized' };
    }

    const { data, error } = await SprintRelationalService.updateSprint(tenantId, sprintId, updates);
    if (error) {
      return { success: false, error };
    }

    return { success: true, data: data || undefined };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to update sprint' };
  }
}

export async function deleteSprintAction(
  tenantSlug: string,
  sprintId: string
): Promise<{ success: boolean; error?: string }> {
  try {
    const { tenantId, error: authErr } = await resolveUserTenant(tenantSlug);
    if (authErr || !tenantId) {
      return { success: false, error: authErr || 'Unauthorized' };
    }

    const { success, error } = await SprintRelationalService.deleteSprint(tenantId, sprintId);
    if (error || !success) {
      return { success: false, error: error || 'Failed to delete sprint' };
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message || 'Failed to delete sprint' };
  }
}
