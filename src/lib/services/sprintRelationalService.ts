import { supabaseAdmin } from '@/lib/db';
import { SprintDefinition } from '@/types/tracker';

export interface CreateSprintInput {
  name: string;
  project_id?: string | null;
  goal?: string | null;
  status?: 'planned' | 'active' | 'completed' | 'unplanned';
  is_active?: boolean;
  started_at?: string | null;
  ends_at?: string | null;
  committed_points?: number;
  metadata?: Record<string, any>;
}

export interface UpdateSprintInput {
  name?: string;
  project_id?: string | null;
  goal?: string | null;
  status?: 'planned' | 'active' | 'completed' | 'unplanned';
  is_active?: boolean;
  started_at?: string | null;
  ends_at?: string | null;
  committed_points?: number;
  metadata?: Record<string, any>;
}

export interface RelationalSprintRecord {
  id: string;
  tenant_id: string;
  project_id: string | null;
  name: string;
  goal: string | null;
  status: 'planned' | 'active' | 'completed' | 'unplanned';
  is_active: boolean;
  started_at: string | null;
  ends_at: string | null;
  committed_points: number;
  metadata: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export class SprintRelationalService {
  /**
   * List sprints for a given tenant, with optional project and status filters.
   */
  static async listSprints(
    tenantId: string,
    options?: { projectId?: string; status?: string; isActive?: boolean }
  ): Promise<{ data: RelationalSprintRecord[] | null; error: string | null }> {
    try {
      let query = supabaseAdmin
        .from('sprints')
        .select('*')
        .eq('tenant_id', tenantId);

      if (options?.projectId) {
        query = query.eq('project_id', options.projectId);
      }
      if (options?.status) {
        query = query.eq('status', options.status);
      }
      if (options?.isActive !== undefined) {
        query = query.eq('is_active', options.isActive);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;
      if (error) {
        return { data: null, error: error.message };
      }

      return { data: (data as RelationalSprintRecord[]) || [], error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Failed to list sprints' };
    }
  }

  /**
   * Get single sprint by ID for a tenant.
   */
  static async getSprintById(
    tenantId: string,
    sprintId: string
  ): Promise<{ data: RelationalSprintRecord | null; error: string | null }> {
    try {
      const { data, error } = await supabaseAdmin
        .from('sprints')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('id', sprintId)
        .maybeSingle();

      if (error) {
        return { data: null, error: error.message };
      }
      if (!data) {
        return { data: null, error: 'Sprint not found' };
      }

      return { data: data as RelationalSprintRecord, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Failed to get sprint' };
    }
  }

  /**
   * Create a new sprint in tracker.sprints, synchronizing committed points with work items.
   */
  static async createSprint(
    tenantId: string,
    input: CreateSprintInput
  ): Promise<{ data: RelationalSprintRecord | null; error: string | null }> {
    try {
      if (!input.name || !input.name.trim()) {
        return { data: null, error: 'Sprint name is required' };
      }

      const trimmedName = input.name.trim();

      // If active, deactivate other sprints for the project/tenant if desired
      const isActive = input.is_active ?? (input.status === 'active');
      const status = input.status ?? (isActive ? 'active' : 'planned');
      const startedAt = input.started_at ?? (isActive ? new Date().toISOString() : null);

      let committedPoints = input.committed_points ?? 0;
      if (committedPoints === 0) {
        // Compute current committed points from work items assigned to this sprint name
        const { data: items } = await supabaseAdmin
          .from('work_items')
          .select('metadata')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null);

        if (items) {
          committedPoints = items
            .filter((i: any) => i.metadata?.sprint === trimmedName)
            .reduce((sum: number, i: any) => {
              const pts = Number(i.metadata?.story_points ?? i.metadata?.points ?? 0) || 0;
              return sum + pts;
            }, 0);
        }
      }

      const payload = {
        tenant_id: tenantId,
        project_id: input.project_id || null,
        name: trimmedName,
        goal: input.goal || null,
        status,
        is_active: isActive,
        started_at: startedAt,
        ends_at: input.ends_at || null,
        committed_points: committedPoints,
        metadata: input.metadata || {},
      };

      const { data, error } = await supabaseAdmin
        .from('sprints')
        .insert(payload)
        .select()
        .single();

      if (error) {
        return { data: null, error: error.message };
      }

      return { data: data as RelationalSprintRecord, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Failed to create sprint' };
    }
  }

  /**
   * Update an existing sprint, synchronizing renamed sprints with work item metadata.
   */
  static async updateSprint(
    tenantId: string,
    sprintId: string,
    updates: UpdateSprintInput
  ): Promise<{ data: RelationalSprintRecord | null; error: string | null }> {
    try {
      // 1. Fetch current sprint
      const { data: currentSprint, error: fetchErr } = await this.getSprintById(tenantId, sprintId);
      if (fetchErr || !currentSprint) {
        return { data: null, error: fetchErr || 'Sprint not found' };
      }

      const updatePayload: Record<string, any> = {};

      if (updates.name !== undefined) {
        const trimmed = updates.name.trim();
        if (!trimmed) {
          return { data: null, error: 'Sprint name cannot be empty' };
        }
        updatePayload.name = trimmed;
      }

      if (updates.goal !== undefined) updatePayload.goal = updates.goal;
      if (updates.project_id !== undefined) updatePayload.project_id = updates.project_id;
      if (updates.started_at !== undefined) updatePayload.started_at = updates.started_at;
      if (updates.ends_at !== undefined) updatePayload.ends_at = updates.ends_at;
      if (updates.committed_points !== undefined) updatePayload.committed_points = updates.committed_points;
      if (updates.metadata !== undefined) updatePayload.metadata = updates.metadata;

      if (updates.status !== undefined) {
        updatePayload.status = updates.status;
        if (updates.status === 'active') {
          updatePayload.is_active = true;
          if (!currentSprint.started_at && !updates.started_at) {
            updatePayload.started_at = new Date().toISOString();
          }
        } else if (updates.status === 'completed') {
          updatePayload.is_active = false;
        }
      }

      if (updates.is_active !== undefined) {
        updatePayload.is_active = updates.is_active;
        if (updates.is_active && !updatePayload.status) {
          updatePayload.status = 'active';
        }
      }

      // 2. Perform sprint update
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('sprints')
        .update(updatePayload)
        .eq('tenant_id', tenantId)
        .eq('id', sprintId)
        .select()
        .single();

      if (updateErr) {
        return { data: null, error: updateErr.message };
      }

      // 3. Synchronization: If sprint name changed, update assigned work items metadata
      if (updatePayload.name && updatePayload.name !== currentSprint.name) {
        const oldName = currentSprint.name;
        const newName = updatePayload.name;

        const { data: itemsToSync } = await supabaseAdmin
          .from('work_items')
          .select('id, metadata')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null);

        if (itemsToSync && itemsToSync.length > 0) {
          const matching = itemsToSync.filter((i: any) => i.metadata?.sprint === oldName);
          for (const item of matching) {
            const nextMeta = { ...(item.metadata || {}), sprint: newName };
            await supabaseAdmin
              .from('work_items')
              .update({ metadata: nextMeta })
              .eq('id', item.id);
          }
        }
      }

      return { data: updated as RelationalSprintRecord, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Failed to update sprint' };
    }
  }

  /**
   * Delete a sprint entity and optionally disassociate work items.
   */
  static async deleteSprint(
    tenantId: string,
    sprintId: string
  ): Promise<{ success: boolean; error: string | null }> {
    try {
      const { data: currentSprint, error: fetchErr } = await this.getSprintById(tenantId, sprintId);
      if (fetchErr || !currentSprint) {
        return { success: false, error: fetchErr || 'Sprint not found' };
      }

      const { error: deleteErr } = await supabaseAdmin
        .from('sprints')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('id', sprintId);

      if (deleteErr) {
        return { success: false, error: deleteErr.message };
      }

      // Disassociate items that were in this sprint
      const sprintName = currentSprint.name;
      const { data: items } = await supabaseAdmin
        .from('work_items')
        .select('id, metadata')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);

      if (items && items.length > 0) {
        const matching = items.filter((i: any) => i.metadata?.sprint === sprintName);
        for (const item of matching) {
          const nextMeta = { ...(item.metadata || {}) };
          delete nextMeta.sprint;
          await supabaseAdmin
            .from('work_items')
            .update({ metadata: nextMeta })
            .eq('id', item.id);
        }
      }

      return { success: true, error: null };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete sprint' };
    }
  }
}
