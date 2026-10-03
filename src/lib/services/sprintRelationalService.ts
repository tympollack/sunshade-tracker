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

export const ALLOWED_SPRINT_STATUSES = new Set(['planned', 'active', 'completed', 'unplanned']);

export function validateSprintInput(
  input: CreateSprintInput | UpdateSprintInput,
  isPatch = false
): string | null {
  if (!isPatch || input.name !== undefined) {
    if (typeof input.name !== 'string' || !input.name.trim()) {
      return 'Field "name" must be a non-empty string';
    }
  }

  if (input.status !== undefined && input.status !== null) {
    if (!ALLOWED_SPRINT_STATUSES.has(input.status)) {
      return `Invalid status "${input.status}": must be one of planned, active, completed, unplanned`;
    }
  }

  if (input.committed_points !== undefined && input.committed_points !== null) {
    if (
      typeof input.committed_points !== 'number' ||
      isNaN(input.committed_points) ||
      input.committed_points < 0
    ) {
      return 'Field "committed_points" must be a non-negative number';
    }
  }

  if (input.is_active !== undefined && input.is_active !== null) {
    if (typeof input.is_active !== 'boolean') {
      return 'Field "is_active" must be a boolean';
    }
  }

  if (input.started_at !== undefined && input.started_at !== null) {
    if (typeof input.started_at !== 'string' || isNaN(Date.parse(input.started_at))) {
      return 'Field "started_at" must be a valid ISO date string';
    }
  }

  if (input.ends_at !== undefined && input.ends_at !== null) {
    if (typeof input.ends_at !== 'string' || isNaN(Date.parse(input.ends_at))) {
      return 'Field "ends_at" must be a valid ISO date string';
    }
  }

  if (input.project_id !== undefined && input.project_id !== null) {
    if (typeof input.project_id !== 'string') {
      return 'Field "project_id" must be a string or null';
    }
  }

  return null;
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
      const validationError = validateSprintInput(input, false);
      if (validationError) {
        return { data: null, error: validationError };
      }

      if (!input.name || !input.name.trim()) {
        return { data: null, error: 'Sprint name is required' };
      }

      if (input.project_id) {
        const { data: proj, error: projErr } = await supabaseAdmin
          .from('projects')
          .select('id')
          .eq('id', input.project_id)
          .eq('tenant_id', tenantId)
          .maybeSingle();

        if (projErr || !proj) {
          return { data: null, error: 'Project does not exist or does not belong to this tenant' };
        }
      }

      const trimmedName = input.name.trim();

      // If active, deactivate other sprints for the project/tenant if desired
      const isActive = input.is_active ?? (input.status === 'active');
      const status = input.status ?? (isActive ? 'active' : 'planned');
      const startedAt = input.started_at ?? (isActive ? new Date().toISOString() : null);

      let committedPoints = input.committed_points ?? 0;
      if (committedPoints === 0) {
        // Compute current committed points from work items assigned to this sprint name
        let itemsQuery = supabaseAdmin
          .from('work_items')
          .select('metadata, project_id')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null);

        if (input.project_id) {
          itemsQuery = itemsQuery.eq('project_id', input.project_id);
        }

        const { data: items } = await itemsQuery;

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
      const validationError = validateSprintInput(updates, true);
      if (validationError) {
        return { data: null, error: validationError };
      }

      // 1. Fetch current sprint
      const { data: currentSprint, error: fetchErr } = await this.getSprintById(tenantId, sprintId);
      if (fetchErr || !currentSprint) {
        return { data: null, error: fetchErr || 'Sprint not found' };
      }

      // SEC: Protect completed sprint items - completed sprints cannot be renamed
      if (
        currentSprint.status === 'completed' &&
        updates.name !== undefined &&
        updates.name.trim() !== currentSprint.name
      ) {
        return {
          data: null,
          error: 'Cannot rename a completed sprint: items in completed sprints are locked and immutable',
        };
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
      if (updates.project_id !== undefined) {
        if (updates.project_id !== null) {
          const { data: proj, error: projErr } = await supabaseAdmin
            .from('projects')
            .select('id')
            .eq('id', updates.project_id)
            .eq('tenant_id', tenantId)
            .maybeSingle();

          if (projErr || !proj) {
            return { data: null, error: 'Project does not exist or does not belong to this tenant' };
          }
        }
        updatePayload.project_id = updates.project_id;
      }
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
        } else if (updates.status === 'completed' || updates.status === 'planned' || updates.status === 'unplanned') {
          if (updates.is_active === undefined) {
            updatePayload.is_active = false;
          }
        }
      }

      if (updates.is_active !== undefined) {
        updatePayload.is_active = updates.is_active;
        if (updates.is_active && !updatePayload.status) {
          updatePayload.status = 'active';
        } else if (!updates.is_active && updatePayload.status === 'active') {
          updatePayload.status = 'planned';
        }
      }

      // 2. Synchronization: If sprint name changed OR project moved, update assigned work items
      const isRenaming = Boolean(updatePayload.name && updatePayload.name !== currentSprint.name);
      const isMovingProject = Boolean(
        updatePayload.project_id !== undefined &&
        updatePayload.project_id !== currentSprint.project_id
      );

      const rolledBackItems: Array<{ id: string; origPayload: Record<string, any> }> = [];

      if (isRenaming || isMovingProject) {
        const oldName = currentSprint.name;
        const newName = isRenaming ? (updatePayload.name as string) : currentSprint.name;

        // Query work items belonging to the source project where items currently live
        let itemsQuery = supabaseAdmin
          .from('work_items')
          .select('id, metadata, project_id')
          .eq('tenant_id', tenantId)
          .is('deleted_at', null);

        const sourceProjectId = currentSprint.project_id;
        if (sourceProjectId) {
          itemsQuery = itemsQuery.eq('project_id', sourceProjectId);
        }

        const { data: itemsToSync, error: itemsFetchErr } = await itemsQuery;
        if (itemsFetchErr) {
          console.error('Failed to fetch items for sprint sync:', itemsFetchErr);
          return { data: null, error: `Failed to fetch work items for sprint synchronization: ${itemsFetchErr.message}` };
        } else if (itemsToSync && itemsToSync.length > 0) {
          const matching = itemsToSync.filter(
            (i: any) =>
              i.metadata?.sprint === oldName ||
              (isRenaming && i.metadata?.sprint === newName)
          );

          for (const item of matching) {
            const origPayload: Record<string, any> = {
              metadata: item.metadata,
              project_id: item.project_id,
            };

            const itemUpdatePayload: Record<string, any> = {};
            if (isRenaming) {
              itemUpdatePayload.metadata = { ...(item.metadata || {}), sprint: newName };
            }
            if (isMovingProject) {
              itemUpdatePayload.project_id = updatePayload.project_id;
            }

            const { error: syncErr } = await supabaseAdmin
              .from('work_items')
              .update(itemUpdatePayload)
              .eq('id', item.id);

            if (syncErr) {
              console.error(`Failed to update item ${item.id} for sprint sync:`, syncErr);
              // Rollback previously updated items
              for (const rolled of rolledBackItems) {
                await supabaseAdmin
                  .from('work_items')
                  .update(rolled.origPayload)
                  .eq('id', rolled.id);
              }
              return { data: null, error: `Failed to update work item ${item.id} for sprint synchronization: ${syncErr.message}` };
            }

            rolledBackItems.push({ id: item.id, origPayload });
          }
        }
      }

      // 3. Perform sprint entity update
      const { data: updated, error: updateErr } = await supabaseAdmin
        .from('sprints')
        .update(updatePayload)
        .eq('tenant_id', tenantId)
        .eq('id', sprintId)
        .select()
        .single();

      if (updateErr) {
        // Rollback any items updated during sync
        for (const rolled of rolledBackItems) {
          await supabaseAdmin
            .from('work_items')
            .update(rolled.origPayload)
            .eq('id', rolled.id);
        }
        return { data: null, error: updateErr.message };
      }

      return { data: updated as RelationalSprintRecord, error: null };
    } catch (err: any) {
      return { data: null, error: err.message || 'Failed to update sprint' };
    }
  }

  /**
   * Delete a sprint entity and disassociate work items.
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

      // SEC: Protect completed sprint items - completed sprints cannot be deleted
      if (currentSprint.status === 'completed') {
        return {
          success: false,
          error: 'Cannot delete a completed sprint: items in completed sprints are locked and immutable',
        };
      }

      // 1. Disassociate items that were in this sprint BEFORE deleting the sprint
      const sprintName = currentSprint.name;
      let itemsQuery = supabaseAdmin
        .from('work_items')
        .select('id, metadata, project_id')
        .eq('tenant_id', tenantId)
        .is('deleted_at', null);

      if (currentSprint.project_id) {
        itemsQuery = itemsQuery.eq('project_id', currentSprint.project_id);
      }

      const { data: items, error: itemsFetchErr } = await itemsQuery;
      if (itemsFetchErr) {
        console.error('Failed to fetch items for sprint deletion sync:', itemsFetchErr);
        return { success: false, error: `Failed to fetch work items for sprint deletion: ${itemsFetchErr.message}` };
      }

      const matching = items ? items.filter((i: any) => i.metadata?.sprint === sprintName) : [];
      const rolledBackItems: Array<{ id: string; origMetadata: Record<string, any> }> = [];

      for (const item of matching) {
        const nextMeta = { ...(item.metadata || {}) };
        delete nextMeta.sprint;
        delete nextMeta.sprint_id;
        const { error: syncErr } = await supabaseAdmin
          .from('work_items')
          .update({ metadata: nextMeta })
          .eq('id', item.id);

        if (syncErr) {
          console.error(`Failed to disassociate sprint from item ${item.id}:`, syncErr);
          // Rollback any items that were detached before this failure
          for (const rolled of rolledBackItems) {
            await supabaseAdmin
              .from('work_items')
              .update({ metadata: rolled.origMetadata })
              .eq('id', rolled.id);
          }
          return { success: false, error: `Failed to disassociate sprint from item ${item.id}: ${syncErr.message}` };
        }

        rolledBackItems.push({ id: item.id, origMetadata: item.metadata });
      }

      // 2. Delete the sprint row from database
      const { error: deleteErr } = await supabaseAdmin
        .from('sprints')
        .delete()
        .eq('tenant_id', tenantId)
        .eq('id', sprintId);

      if (deleteErr) {
        // Rollback all detached items if sprint deletion fails
        for (const rolled of rolledBackItems) {
          await supabaseAdmin
            .from('work_items')
            .update({ metadata: rolled.origMetadata })
            .eq('id', rolled.id);
        }
        return { success: false, error: deleteErr.message };
      }

      return { success: true, error: null };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to delete sprint' };
    }
  }
}
