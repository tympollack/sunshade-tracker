import { WorkItem } from '@/types/tracker';
import { reassignWorkItemProject } from '@/app/actions/trackerActions';
import { broadcastItemMutation } from '@/lib/sync-channel';

export interface ProjectSummary {
  id: string;
  slug: string;
  name: string;
}

export interface SaveModalItemParams {
  itemId: string;
  updates: Partial<WorkItem>;
  items: WorkItem[];
  editingItem: WorkItem | null;
  allProjects: ProjectSummary[];
  projectSlug: string;
  tenantSlug: string;
  currentProjectId?: string;
  setItems: React.Dispatch<React.SetStateAction<WorkItem[]>>;
  setEditingItem: React.Dispatch<React.SetStateAction<WorkItem | null>>;
  setBulkToast: (msg: string | null) => void;
  fetchData: () => Promise<void> | void;
  apiFetch?: (path: string, options?: RequestInit) => Promise<Response>;
  reassignProjectFn?: typeof reassignWorkItemProject;
  broadcastMutationFn?: typeof broadcastItemMutation;
}

export async function saveModalItem({
  itemId,
  updates,
  items,
  editingItem,
  allProjects,
  projectSlug,
  tenantSlug,
  currentProjectId,
  setItems,
  setEditingItem,
  setBulkToast,
  fetchData,
  apiFetch = (path, options) =>
    fetch(path, {
      ...options,
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        'x-tenant-slug': tenantSlug,
        ...(options?.headers || {}),
      },
    }),
  reassignProjectFn = reassignWorkItemProject,
  broadcastMutationFn = broadcastItemMutation,
}: SaveModalItemParams): Promise<void> {
  const existingItem = items.find((it) => it.id === itemId) || editingItem;
  const currentProj = allProjects.find((p) => p.slug === projectSlug);
  const isMovingProject = Boolean(
    updates.project_id &&
    (existingItem
      ? existingItem.project_id !== updates.project_id
      : currentProj && updates.project_id !== currentProj.id)
  );

  if (isMovingProject && updates.project_id) {
    const moveResult = await reassignProjectFn(itemId, updates.project_id, tenantSlug, {
      status: updates.status,
      item_type: updates.item_type,
    });
    if (!moveResult.success) {
      throw new Error(moveResult.error || 'Failed to reassign work item project');
    }

    const otherUpdates = { ...updates };
    delete otherUpdates.project_id;
    if (otherUpdates.status === updates.status) delete otherUpdates.status;
    if (otherUpdates.item_type === updates.item_type) delete otherUpdates.item_type;
    if (Object.keys(otherUpdates).length > 0) {
      const res = await apiFetch('/api/v1/items', {
        method: 'PATCH',
        body: JSON.stringify({ id: itemId, ...otherUpdates }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Failed to save changes (${res.status})`);
      }
    }

    const destProject = allProjects.find((p) => p.id === updates.project_id);
    const childCount = Math.max(0, (moveResult.updatedCount ?? 1) - 1);
    setBulkToast(`Moved item and ${childCount} child task${childCount !== 1 ? 's' : ''} to ${destProject?.name || 'new project'}`);
    setTimeout(() => setBulkToast(null), 4000);
    fetchData();
    broadcastMutationFn({
      type: 'ITEMS_REFRESH',
      tenantSlug,
      projectId: updates.project_id,
      sourceProjectId: existingItem?.project_id,
    });
    return;
  }

  const res = await apiFetch('/api/v1/items', {
    method: 'PATCH',
    body: JSON.stringify({ id: itemId, ...updates }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `Failed to save changes (${res.status})`);
  }

  const data = await res.json().catch(() => ({}));
  const itemUpdates = { ...updates, ...(data?.item || {}) };

  // Normal save (within same project)
  setItems((prev) =>
    prev
      .map((it) => (it.id === itemId ? { ...it, ...itemUpdates } : it))
      .sort((a, b) => a.order_index - b.order_index)
  );
  if (editingItem && editingItem.id === itemId) {
    setEditingItem((prev) => (prev ? { ...prev, ...itemUpdates } : null));
  }
  broadcastMutationFn({
    type: 'ITEM_UPDATED',
    itemId,
    updates: itemUpdates,
    tenantSlug,
    projectId: currentProjectId || updates.project_id || existingItem?.project_id || currentProj?.id,
  });

  if (updates.project_id || (updates.metadata && 'sprint' in updates.metadata)) {
    fetchData();
  }
}
